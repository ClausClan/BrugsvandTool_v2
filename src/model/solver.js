import { ST, ID, RH, VALVE_TYPES } from "../config/constants.js";
import { state } from "../data/state.js";
import { getWaterDensity, getWaterViscosity, getWaterSpecificHeat, getHeatCapacityFactor } from "../physics/properties.js";
import { getDP } from "../physics/calculations.js";
import { calculateMeterPressureDrop, getInsulationClassUl, findNextStandardThickness, getDisplayName } from "./components.js";
import { buildModel, analyzeSystemTopology, getPathToNode, updateCriticalPaths } from "./network.js";

// =============================================================================
// == ISOLERINGS BEREGNING (DS 452)
// =============================================================================
export function calculateInsulation(model, config) {
    const lambda = config.lambda; 
    
    model.nodes.forEach(n => {
        if ((n.type !== 'ror_vv' && n.type !== 'cirkulation_vv' && n.type !== 'ror_kv') || !n.nom_dim) return;

        // 1. Bestem Automatisk Isoleringsklasse
        let autoKlasse = 4; 
        
        // KOLDT VAND
        if (n.type === 'ror_kv') {
            if (n.location === 'heated') autoKlasse = 2; // Kondensisolering (DS 452)
            else autoKlasse = 6; // Frostsikring
        } 
        // VARMT VAND (VV + Cirkulation)
        else {
            if (n.location === 'outside' || n.location === 'unheated') {
                autoKlasse = 6; // Maksimal isolering ude
            } else {
                autoKlasse = 4;
            }
        }

        // 2. Respekter Manuelt Valg
        let endeligKlasse = autoKlasse;
        if (n.insulationClassSelection && n.insulationClassSelection !== 'Auto') {
            endeligKlasse = parseInt(n.insulationClassSelection.replace('Kl. ', ''), 10) || 0;
        }
        n.insulationClass = endeligKlasse;
        
        // 3. Beregn Tykkelse & U-værdi
        const Ul_constants = getInsulationClassUl(endeligKlasse);
        
        if (!Ul_constants) {
            n.insulationThickness = 0; 
            // U-værdi for uisoleret rør (Approksimation: alpha_ydre * Omkreds)
            const d_outer_m = n.nom_dim / 1000;
            const alpha = 10; // W/m2K (typisk indendørs)
            n.u_value_per_meter = alpha * Math.PI * d_outer_m; 
            return; 
        }

        const Dep_m = n.nom_dim / 1000;
        const Ul_krav = (Ul_constants.A * Dep_m) + Ul_constants.B;
        const exp_val = Math.exp((2 * Math.PI * lambda) / Ul_krav);
        const tykkelse_m = (Dep_m * (exp_val - 1)) / 2;
        const tykkelse_mm = tykkelse_m * 1000;
        
        n.insulationThickness = findNextStandardThickness(tykkelse_mm);

        const Di_isol_m = Dep_m;
        const Dy_isol_m = Dep_m + 2 * (n.insulationThickness / 1000);
        const R_insulation = Math.log(Dy_isol_m / Di_isol_m) / (2 * Math.PI * lambda);
        const R_se = 0.1; // Standard overgangsmodstand
        
        n.u_value_per_meter = 1 / (R_insulation + R_se);
    });
    
    return model;
}

export function validateCirculationLoops(model, advarslerDiv) {
    let isValid = true;
    model.loops.forEach(loop => {
        const valvesInLoop = loop.path.filter(id => model.nodes.get(id)?.type === 'valve');
        if (valvesInLoop.length === 0) {
            advarslerDiv.innerHTML += `<p class="alert alert-warning">Advarsel: Cirkulationsstreng "${getDisplayName(loop.id)}" mangler en cirkulationsventil.</p>`;
        }
        if (valvesInLoop.length > 1) {
            advarslerDiv.innerHTML += `<p class="alert alert-danger">Fejl: Cirkulationsstreng "${getDisplayName(loop.id)}" har mere end én ventil. Der må kun være én.</p>`;
            isValid = false;
        }
    });
    return isValid;
}

export function beregnStandard(config) {
    const advarslerDiv = document.getElementById('advarsler');
    const model = buildModel(config);
    if (!model) return null;
    
    // TRIN A: Beregn FLOW i begge systemer (VV først!)
    // ------------------------------------------------
    // 1. Beregn summerne i VV-nettet (Beholderen får sum_qf_random osv.)
    calculateQd_VV(model);
    
    // 2. Beregn KV-nettet (Henter summerne fra Beholderen hvis linket)
    if (model.nodes.has('Vandstik')) {
        calculateQd_KV(model);
        
        // Nu kender vi flowet i KV, så vi can dimensionere det
        if (config.isAuto) dimensionSupply_KV(model, config);
        
        // Beregn tryktab i KV (Fysik)
        calculatePressureDrop_KV(model.nodes.get('Vandstik'), config);
    }

    // TRIN B: Beregn Starttryk til VV (Hydraulisk Link)
    // ------------------------------------------------
    model.vv_start_pressure = config.pln; 
    model.kv_pressure_loss_to_beholder = 0;

    if (state.beholderConnectionId) {
        const dpToConnection = getPathPressureDrop(model, state.beholderConnectionId);
        model.kv_pressure_loss_to_beholder = dpToConnection;
        model.vv_start_pressure = config.pln - dpToConnection;
        
        if (model.vv_start_pressure < 0) {
            advarslerDiv.innerHTML += `<p class="alert alert-danger">KRITISK: Undertryk ved beholder! KV-rørene er for små til den samlede mængde.</p>`;
        }
    }

    // TRIN C: Beregn Resten af VV (Med det rigtige starttryk)
    // ------------------------------------------------
    // Opdater topologi (nødvendig for dimensionering)
    model.loops.forEach(l => l.path = getPath(model, l.startNodeId, l.endNodeId));
    analyzeSystemTopology(model); 

    if (config.isAuto) dimensionSupply_VV(model, config);
    
    // Beregn tryktab i VV (Fysik)
    calculatePressureDrop_VV(model.tree, 'dp_tap', 'qd', config); 
    
    // Finder kritisk vej for både KV og VV baseret på absolutte tryk
    updateCriticalPaths(model, config);
    
    // Cirkulation
    calculateInsulation(model, config);
    calculateCirculationFlows_VV(model, config);
    
    if (config.isAuto) {
        calculateInsulation(model, config);
        calculateHeatLoss_VV(model, config);
    }

    if (!validateCirculationLoops(model, advarslerDiv)) return null;
    calculateCirculationDP_VV(model, config);
    calculateBeholder(model);
    
    // Beregn og gem temperaturudvikling i netværket
    calculateTemperatures_VV(model, config);
    calculateTemperatures_KV(model, config);
    
    return model;
}

// 1. Beregn Spidslast (VV)
export function calculateQd_VV(model) {
    function traverse(node) {
        let downstream_qf_random = 0, downstream_qf_syst = 0;
        
        if (node.type === 'tapsted') {
            // HENT KUN VARMT FLOW
            let val = 0;
            if (ST[node.tapType]) {
                val = (typeof ST[node.tapType] === 'object') ? ST[node.tapType].qf_hot : ST[node.tapType];
            } else if (state.customTapsteder[node.tapType]) {
                val = state.customTapsteder[node.tapType].qf_hot || node.qf;
            } else {
                val = node.qf; 
            }

            if (node.isSyst) downstream_qf_syst = val; 
            else downstream_qf_random = val;
        } else {
            // Traverser børn
            node.children.forEach(child => {
                const flows = traverse(child);
                downstream_qf_random += flows.random; 
                downstream_qf_syst += flows.syst;
            });
        }

        // Tilføjet 'water_meter'
        if(['ror_vv', 'beholder', 'booster', 'reducer', 'water_meter'].includes(node.type)) { 
            node.sum_qf_random = downstream_qf_random; 
            node.sum_qf_syst = downstream_qf_syst;
            const qd_random = downstream_qf_random <= 0.15 ? downstream_qf_random : 0.15 + 0.011*(downstream_qf_random-0.15) + 0.089*Math.sqrt(downstream_qf_random-0.15);
            node.qd = qd_random + downstream_qf_syst;
        }
        return { random: downstream_qf_random, syst: downstream_qf_syst };
    }
    traverse(model.tree);
    return model;
}

// 2. Dimensioner Fremløb (VV)
export function dimensionSupply_VV(model, config) {
    const temp = config.T_v || 55; // Varmt vand

    model.nodes.forEach(n => {
        if (n.type !== 'ror_vv' || !n.qd) return;

        const mat = n.material;
        if (!ID[mat]) return;

        const sortedDims = Object.keys(ID[mat]).map(Number).sort((a, b) => a - b);
        let bestDim = sortedDims[sortedDims.length - 1]; 

        for (const dim of sortedDims) {
            const d_i = ID[mat][dim] / 1000;
            const area = Math.PI * Math.pow(d_i / 2, 2);
            const v = (n.qd / 1000) / area;
            
            const dp_m = getDP(n.qd, d_i, RH[mat] / 1000, 1, 0, 0, temp);
            
            let criteriaMet = false;
            switch (config.dimPrinciple) {
                case 'pressure_drop': if (dp_m < config.max_dp_m) criteriaMet = true; break;
                case 'velocity': if (v < config.max_v_f) criteriaMet = true; break;
                case 'combined': default: if (v < config.max_v_f && dp_m < config.max_dp_m) criteriaMet = true; break;
            }
            
            if (criteriaMet) { 
                bestDim = dim; 
                break; 
            }
        }
        n.nom_dim = bestDim;
    });
    return model;
}

// 1. Beregn Flow (KV Spidslast)
export function calculateQd_KV(model) {
    const beholderNode = model.nodes.get('Beholder');
    const linkId = state.beholderConnectionId;

    function traverse(node) {
        let downstream_qf_random = 0, downstream_qf_syst = 0;
        
        if (node.type === 'tapsted') {
            // HENT KUN KOLDT FLOW
            let val = 0;
            if (ST[node.tapType]) {
                if (typeof ST[node.tapType] === 'object') {
                    val = ST[node.tapType].qf_cold;
                } else {
                    if (node.tapType.includes('WC') || node.tapType.includes('Toilet')) val = 0.13;
                    else val = ST[node.tapType]; 
                }
            } else if (state.customTapsteder[node.tapType]) {
                val = state.customTapsteder[node.tapType].qf_cold || 0;
            }
            if (node.isSyst) downstream_qf_syst = val; 
            else downstream_qf_random = val;
        } 
        
        if (node.children) {
            node.children.forEach(child => {
                const flows = traverse(child);
                downstream_qf_random += flows.random; 
                downstream_qf_syst += flows.syst;
            });
        }
        
        // HYDRAULISK LINK (Inkluderer total VV-forbrug i koldt vand beregning)
        if (node.id === linkId && beholderNode) {
            if (beholderNode.sum_qf_random) downstream_qf_random += beholderNode.sum_qf_random;
            if (beholderNode.sum_qf_syst) downstream_qf_syst += beholderNode.sum_qf_syst;
        }
        
        // Tilføjet 'water_meter' til listen af komponenter der bærer flow
        if(['ror_kv', 'vandstik', 'booster', 'reducer', 'water_meter'].includes(node.type)) { 
            node.sum_qf_random = downstream_qf_random; 
            node.sum_qf_syst = downstream_qf_syst;
            const qd_random = downstream_qf_random <= 0.15 ? downstream_qf_random : 0.15 + 0.011*(downstream_qf_random-0.15) + 0.089*Math.sqrt(downstream_qf_random-0.15);
            node.qd = qd_random + downstream_qf_syst;
        }
        return { random: downstream_qf_random, syst: downstream_qf_syst };
    }
    
    if (model.nodes.has('Vandstik')) {
        traverse(model.nodes.get('Vandstik'));
    }
    return model;
}

export function calculatePressureDrop_VV(startNode, dp_prop, flow_prop, config) {
    // 1. Rør (VV + Cirkulation)
    if ((startNode.type === 'ror_vv' || startNode.type === 'cirkulation_vv') && startNode.nom_dim) {
        const d_i = ID[startNode.material][startNode.nom_dim]/1000;
        const pct = config.fittings_pct || 0;
        const temp = (startNode.type === 'ror_vv') ? config.T_v : (config.T_v - config.dT/2);
        startNode[dp_prop] = getDP(startNode[flow_prop], d_i, RH[startNode.material]/1000, startNode.L, startNode.zeta_sum, pct, temp);
    }
    
    // 2. Komponenter: Booster / Reducer
    else if (startNode.type === 'booster' || startNode.type === 'reducer') {
        const pChange = (startNode.pressure_change || 0) * 1000; 
        startNode[dp_prop] = -1 * pChange;
    }

    // 3. Vandmåler
    else if (startNode.type === 'water_meter') {
        if (flow_prop !== 'qd') {
             startNode[dp_prop] = 0; 
        } else {
             startNode[dp_prop] = calculateMeterPressureDrop(startNode);
        }
    }
    
    // Rekursion
    if (startNode.children) {
        startNode.children.forEach(c => calculatePressureDrop_VV(c, dp_prop, flow_prop, config));
    }
    return startNode;
}

export function calculatePressureDrop_KV(startNode, config) {
    // 1. Rør (Standard)
    if (startNode.type === 'ror_kv' && startNode.nom_dim) {
        const d_i = ID[startNode.material][startNode.nom_dim]/1000;
        const pct = config.fittings_pct || 0;
        const temp = 10;
        startNode.dp_tap = getDP(startNode.qd, d_i, RH[startNode.material]/1000, startNode.L, startNode.zeta_sum, pct, temp);
    }
    
    // 2. Komponenter: Booster / Reducer
    else if (startNode.type === 'booster' || startNode.type === 'reducer') {
        const pChange = (startNode.pressure_change || 0) * 1000; 
        startNode.dp_tap = -1 * pChange;
    } 
    
    // 3. Vandmåler
    else if (startNode.type === 'water_meter') {
        startNode.dp_tap = calculateMeterPressureDrop(startNode);
    }
    
    // Rekursion
    if (startNode.children) {
        startNode.children.forEach(c => calculatePressureDrop_KV(c, config));
    }
    return startNode;
}

export function dimensionSupply_KV(model, config) {
    const temp = 10; // Koldt vand = 10 grader

    model.nodes.forEach(n => {
        if (n.type !== 'ror_kv' || !n.qd) return;

        const mat = n.material;
        if (!ID[mat]) return;

        const sortedDims = Object.keys(ID[mat]).map(Number).sort((a, b) => a - b);
        let bestDim = sortedDims[sortedDims.length - 1]; 

        for (const dim of sortedDims) {
            const d_i = ID[mat][dim] / 1000;
            const area = Math.PI * Math.pow(d_i / 2, 2);
            const v = (n.qd / 1000) / area;
            
            const dp_m = getDP(n.qd, d_i, RH[mat] / 1000, 1, 0, 0, temp);
            
            let criteriaMet = false;
            switch (config.dimPrinciple) {
                case 'pressure_drop': if (dp_m < config.max_dp_m) criteriaMet = true; break;
                case 'velocity': if (v < config.max_v_f) criteriaMet = true; break;
                case 'combined': default: if (v < config.max_v_f && dp_m < config.max_dp_m) criteriaMet = true; break;
            }
            
            if (criteriaMet) { 
                bestDim = dim; 
                break; 
            }
        }
        n.nom_dim = bestDim;
    });
    return model;
}

export function calculateHeatLoss_VV(model, config) {
    const allowance_factor = 1 + ((config.heat_loss_pct || 0) / 100);
    model.nodes.forEach(n => {
        if ((n.type === 'ror_vv' || n.type === 'cirkulation_vv') && n.nom_dim) {
            let T_ambient = (n.location === 'outside') ? config.T_omg_ude : config.T_omg_inde;
            const u_value = (typeof n.u_value_per_meter === 'number' && isFinite(n.u_value_per_meter)) ? n.u_value_per_meter : 0;
            const base_heat_loss = u_value * n.L * (config.T_v - T_ambient);
            n.q_tab = base_heat_loss * allowance_factor;
        }
    });
    return model;
}

export function dimensionReturn_VV(model, config) {
    const meanTemp = config.T_v - (config.dT / 2);

    model.nodes.forEach(n => {
        if (n.type !== 'cirkulation_vv') return; 
        
        const flow = model.circFlows.get(n.id) || 0;
        n.circ_flow = flow;
        const mat = n.material;
        const sortedDims = Object.keys(ID[mat]).map(Number).sort((a, b) => a - b);
        let bestDim = sortedDims[sortedDims.length - 1];

        for (const dim of sortedDims) {
            const d_i = ID[mat][dim] / 1000;
            const area = Math.PI * Math.pow(d_i / 2, 2);
            const v = (flow / 1000) / area;
            
            const dp_m_pure = getDP(flow, d_i, RH[mat] / 1000, 1, 0, 0, meanTemp); 
            
            if (v <= config.max_v_c && dp_m_pure <= config.max_dp_m) {
                bestDim = dim;
                break;
            }
        }
        n.nom_dim = bestDim;
    });
    return model;
}

export function calculateCirculationFlows_VV(model, config) {
    if (config.dT <= 0) return model;

    const meanTemp = config.T_v - (config.dT / 2);
    const HEAT_CAPACITY_FACTOR = getHeatCapacityFactor(meanTemp) / 1000; 

    const MIN_FLOW = 0.005; 
    const targetDrop = config.dT; 
    const maxIterations = 100; 
    
    // Brug min_v_c som minimumshastighed for cirkulationen
    const min_v_c_val = (config && config.min_v_c !== undefined) ? config.min_v_c : 1.0;

    console.group("🚀 DEBUG: Cirkulation Konvergens (VV) - Hydraulisk Optimering");
    console.log(`Minimum cirkulationshastighed (min_v_c): ${min_v_c_val} m/s`);

    // Kortlæg hvilke loops der passerer gennem hver node
    const nodeLoops = new Map();
    model.loops.forEach(l => {
        l.path = getPath(model, l.startNodeId, l.endNodeId);
        l.path.forEach(nodeId => {
            if (!nodeLoops.has(nodeId)) {
                nodeLoops.set(nodeId, new Set());
            }
            nodeLoops.get(nodeId).add(l);
        });
    });

    // ==========================================
    // FASE 1: DEN GAMLE TERMISKE OPTIMERING
    // ==========================================
    calculateHeatLoss_VV(model, config);
    model.loops.forEach(l => {
        const totalQ = l.path.reduce((sum, id) => sum + (model.nodes.get(id)?.q_tab || 0), 0);
        l.circ_flow = Math.max(MIN_FLOW, totalQ / (HEAT_CAPACITY_FACTOR * targetDrop));
    });

    let iteration = 0;
    let converged = false;

    while (!converged && iteration < maxIterations) {
        iteration++;
        let changesMade = false;
        let maxTempDeviation = 0;
        let dimsChanged = false;

        calculateCirculationFlowsAggregation_VV(model);

        if (config.isAuto) {
            model.nodes.forEach(n => {
                if (n.type !== 'cirkulation_vv') return;
                const flow = model.circFlows.get(n.id) || 0;
                const mat = n.material;
                const currentDim = n.nom_dim;
                const sortedDims = Object.keys(ID[mat]).map(Number).sort((a, b) => a - b);
                let bestDim = null;
                
                for (const dim of sortedDims) {
                    const d_i = ID[mat][dim] / 1000;
                    const area = Math.PI * Math.pow(d_i / 2, 2);
                    const v = (flow / 1000) / area;
                    const dp_m = getDP(flow, d_i, RH[mat] / 1000, 1, 0, config.fittings_pct, meanTemp);
                    
                    if (v <= config.max_v_c && dp_m <= config.max_dp_m) {
                        bestDim = dim;
                        break; 
                    }
                }
                if (bestDim === null) bestDim = sortedDims[sortedDims.length - 1];

                if (bestDim !== currentDim) {
                    n.nom_dim = bestDim;
                    dimsChanged = true;
                    changesMade = true;
                }
            });

            if (dimsChanged) {
                calculateInsulation(model, config);
                calculateHeatLoss_VV(model, config);
            }
        }

        model.loops.forEach(l => {
            let actualPathDrop = 0;
            l.path.forEach(nodeId => {
                const node = model.nodes.get(nodeId);
                if (node && (node.type === 'ror_vv' || node.type === 'cirkulation_vv')) {
                    const totalFlow = model.circFlows.get(nodeId);
                    if (totalFlow > 0.000001) {
                        const segmentDrop = node.q_tab / (totalFlow * HEAT_CAPACITY_FACTOR);
                        actualPathDrop += segmentDrop;
                    }
                }
            });
            l._debugDrop = actualPathDrop;

            const diff = actualPathDrop - targetDrop;
            if (Math.abs(diff) > maxTempDeviation) maxTempDeviation = Math.abs(diff);

            if (Math.abs(diff) > 0.05) {
                let correction = actualPathDrop / targetDrop;
                if (correction > 1.5) correction = 1.5;
                if (correction < 0.8) correction = 0.8;

                const newFlow = l.circ_flow * correction;
                l.circ_flow = (l.circ_flow * 0.7) + (newFlow * 0.3);
                if (l.circ_flow < MIN_FLOW) l.circ_flow = MIN_FLOW;
                
                changesMade = true;
            }
        });

        if (!changesMade && maxTempDeviation < 0.05) {
            converged = true;
        }
    }
    console.log(`Fase 1 (Termisk optimering) færdig efter ${iteration} iterationer.`);

    // ==========================================
    // FASE 2: INDIVIDUELT FLOW-BOOST
    // Sikrer at alle loops uafhængigt kan dække min_v_c i deres yderste rør
    // ==========================================
    model.loops.forEach(l => {
        let maxRequiredFlow = l.circ_flow; 
        l.path.forEach(nodeId => {
            const node = model.nodes.get(nodeId);
            const sharingLoops = nodeLoops.get(nodeId);
            // Kigger kun på udelte rør (hvor kun dette loop passerer)
            if (sharingLoops && sharingLoops.size === 1 && node && (node.type === 'ror_vv' || node.type === 'cirkulation_vv') && node.nom_dim) {
                const mat = node.material;
                const dim = node.nom_dim;
                if (mat && dim && ID[mat] && ID[mat][dim]) {
                    const d_i = ID[mat][dim] / 1000;
                    const area = Math.PI * Math.pow(d_i / 2, 2);
                    const q_min_node = min_v_c_val * area * 1000; // l/s krav
                    if (q_min_node > maxRequiredFlow) {
                        maxRequiredFlow = q_min_node;
                    }
                }
            }
        });
        l.circ_flow = maxRequiredFlow; 
    });
    console.log(`Fase 2 (Flow-Boost for udelte rør) færdig.`);

    // ==========================================
    // FASE 3: OPSKALERING AF FÆLLESRØR
    // ==========================================
    calculateCirculationFlowsAggregation_VV(model);
    let dimsChangedPhase3 = false;

    if (config.isAuto) {
        model.nodes.forEach(node => {
            if (node.type === 'cirkulation_vv' && node.nom_dim) {
                const sharingLoops = nodeLoops.get(node.id);
                // Vi optimerer primært rør med meget flow (især fællesrør)
                if (sharingLoops) { // Tillader også optimering af andre hvis nødvendigt
                    const totalFlow = model.circFlows.get(node.id) || 0;
                    if (totalFlow > 0.000001) {
                        const mat = node.material;
                        const sortedDims = Object.keys(ID[mat]).map(Number).sort((a, b) => a - b);
                        const currentDimIdx = sortedDims.indexOf(node.nom_dim);
                        
                        if (currentDimIdx !== -1) {
                            let bestDim = node.nom_dim;
                            // Prøv successivt større rørdimensioner
                            for (let i = currentDimIdx + 1; i < sortedDims.length; i++) {
                                const testDim = sortedDims[i];
                                const test_d_i = ID[mat][testDim] / 1000;
                                const test_area = Math.PI * Math.pow(test_d_i / 2, 2);
                                const test_v = (totalFlow / 1000) / test_area;
                                
                                // Hvis den nye større dimension stadig holder hastigheden oppe, opgraderer vi!
                                if (test_v >= min_v_c_val) {
                                    bestDim = testDim;
                                } else {
                                    break; // Hastigheden falder for meget, stop.
                                }
                            }
                            
                            if (bestDim !== node.nom_dim) {
                                node.nom_dim = bestDim;
                                dimsChangedPhase3 = true;
                            }
                        }
                    }
                }
            }
        });

        if (dimsChangedPhase3) {
            calculateInsulation(model, config);
            calculateHeatLoss_VV(model, config);
            console.log(`Fase 3 (Fællesrør dimensionering): Rørdimensioner blev opgraderet for at spare tryktab.`);
        } else {
            console.log(`Fase 3 (Fællesrør dimensionering): Ingen fællesrør kunne opgraderes.`);
        }
    } else {
        console.log(`Fase 3 (Fællesrør dimensionering) sprunget over, da Auto-Dim er slået fra.`);
    }

    // ==========================================
    // FASE 4: SIKKERHEDS-LOOP (Deficit Sharing for låste/overdimensionerede rør)
    // ==========================================
    let extraLoopIteration = 0;
    let velocityRequirementsMet = false;
    const maxExtraIterations = 10; 

    while (!velocityRequirementsMet && extraLoopIteration < maxExtraIterations) {
        extraLoopIteration++;
        let deficitFound = false;
        
        calculateCirculationFlowsAggregation_VV(model);

        const loopAdditions = new Map();
        model.loops.forEach(l => loopAdditions.set(l.id, 0));

        model.nodes.forEach(node => {
            if ((node.type === 'ror_vv' || node.type === 'cirkulation_vv') && node.nom_dim) {
                const mat = node.material;
                const dim = node.nom_dim;
                if (mat && dim && ID[mat] && ID[mat][dim]) {
                    const d_i = ID[mat][dim] / 1000;
                    const area = Math.PI * Math.pow(d_i / 2, 2);
                    const q_min_node = min_v_c_val * area * 1000; 
                    const totalFlow = model.circFlows.get(node.id) || 0;

                    if (totalFlow > 0.000001 && totalFlow < q_min_node) {
                        const deficit = q_min_node - totalFlow;
                        const sharingLoops = nodeLoops.get(node.id) || new Set();
                        const numLoops = sharingLoops.size;

                        if (numLoops > 0) {
                            deficitFound = true;
                            const share = deficit / numLoops;
                            sharingLoops.forEach(l => {
                                const currentMax = loopAdditions.get(l.id) || 0;
                                if (share > currentMax) {
                                    loopAdditions.set(l.id, share);
                                }
                            });
                        }
                    }
                }
            }
        });

        if (deficitFound) {
            model.loops.forEach(l => {
                const addition = loopAdditions.get(l.id) || 0;
                if (addition > 0) {
                    l.circ_flow += addition;
                }
            });
        } else {
            velocityRequirementsMet = true;
        }
    }

    calculateCirculationFlowsAggregation_VV(model);
    console.log(`Fase 4 (Sikkerheds-flowdeling) færdig efter ${extraLoopIteration} gennemløb.`);
    console.groupEnd();
    return model;
}

export function calculateCirculationFlowsAggregation_VV(model) {
    model.circFlows = new Map();
    model.loops.forEach(l => {
        let current = l.startNodeId;
        while (current && current !== 'Beholder') {
            model.circFlows.set(current, (model.circFlows.get(current) || 0) + l.circ_flow);
            current = model.nodes.get(current).parentId;
        }
        current = l.endNodeId;
        while (current && current !== 'Beholder') {
            model.circFlows.set(current, (model.circFlows.get(current) || 0) + l.circ_flow);
            current = model.nodes.get(current).parentId;
        }
    });
    return model;
}

export function calculateCirculationDP_VV(model, config) {
    model.max_dp_circ = 0;
    const meanTemp = config.T_v - (config.dT / 2);

    // Nulstil
    model.nodes.forEach(n => { if (['cirkulation_vv', 'ror_vv', 'valve', 'booster', 'reducer'].includes(n.type)) n.dp_circ = 0; });

    // TRIN 1: Beregn fysisk tryktab for ALLE noder i retursystemet (ÉN GANG)
    model.nodes.forEach(n => {
        const flow = model.circFlows.get(n.id);
        
        if (flow > 0) {
            if ((n.type === 'ror_vv' || n.type === 'cirkulation_vv') && n.nom_dim) {
                const d_i = ID[n.material][n.nom_dim] / 1000;
                n.dp_circ = getDP(flow, d_i, RH[n.material] / 1000, n.L, n.zeta_sum, config.fittings_pct, meanTemp);
            }
            else if (n.type === 'booster' || n.type === 'reducer') {
                const pChange = (n.pressure_change || 0) * 1000;
                n.dp_circ = -1 * pChange; 
            }
            else if (n.type === 'valve') {
                 n.dp_circ = 0; 
            }
        }
    });

    // TRIN 2: Summer tryktab for hvert loop (Pumpedimensionering)
    model.loops.forEach(l => {
        l.dp_circ_total = 0;
        l.q_tab_tot = 0;
        l.selectedValve = null;

        l.path.forEach(id => {
            const n = model.nodes.get(id);
            if (n && n.dp_circ !== undefined) {
                l.dp_circ_total += n.dp_circ;
            }
            if (n && n.q_tab !== undefined) {
                l.q_tab_tot += n.q_tab;
            }
        });

        // Ventil Beregning
        const valveNode = l.path.map(id => model.nodes.get(id)).find(n => n?.type === 'valve');
        let valveRequiredDp = 0; 
        
        if (valveNode && valveNode.valveType && VALVE_TYPES[valveNode.valveType]) {
            const typeDef = VALVE_TYPES[valveNode.valveType];
            const flowLH = (l.circ_flow || 0) * 3600; 
            const flowLS = l.circ_flow || 0;          
            
            if (typeDef.type === 'dynamic') { 
                const valveData = typeDef.data;
                const selectedValveData = valveData.find(v => v.maxFlowLH >= flowLH);
                if (selectedValveData) { l.selectedValve = selectedValveData; valveRequiredDp = selectedValveData.minDp || selectedValveData.deltaP_Pa; }
            } else if (typeDef.type === 'static') {
                const valveData = typeDef.data; 
                let bestValve = null;
                for (const valve of valveData) {
                    const kv = valve.kv_2_5;
                    if (kv <= 0) continue;
                    const dp_kPa = Math.pow((36 * flowLS) / kv, 2);
                    if (dp_kPa < 25) { 
                        const dp_Pa = dp_kPa * 1000;
                        bestValve = { valveName: `DN ${valve.dn} (STAD)`, vvsNr: valve.vvs, kvs: valve.kvs, kv_setting: kv, minDp: dp_Pa, isStatic: true }; break; 
                    }
                }
                if (!bestValve && valveData.length > 0) {
                    const largest = valveData[valveData.length - 1];
                    const dp_Pa = Math.pow((36 * flowLS) / largest.kv_2_5, 2) * 1000;
                    bestValve = { valveName: `DN ${largest.dn} (STAD)`, vvsNr: largest.vvs, kvs: largest.kvs, kv_setting: largest.kv_2_5, minDp: dp_Pa, isStatic: true };
                }
                if (bestValve) { l.selectedValve = bestValve; valveRequiredDp = bestValve.minDp; }
            }
        } else {
             valveRequiredDp = getDP(l.circ_flow, 0.015, 0, 0, l.zeta, 0, meanTemp);
        }

        if (valveNode) valveNode.dp_circ = valveRequiredDp;
        
        l.dp_circ_total += valveRequiredDp;
        if (l.dp_circ_total < 0) l.dp_circ_total = 0;

        if (l.dp_circ_total > model.max_dp_circ) model.max_dp_circ = l.dp_circ_total;
    });
    
    return model;
}

export function getPath(model, startId, endId) {
    const path = new Set();
    let current = model.nodes.get(startId);
    while(current && current.id !== 'Beholder') { path.add(current.id); current = model.nodes.get(current.parentId); }
    current = model.nodes.get(endId);
    while(current && current.id !== 'Beholder') { path.add(current.id); current = model.nodes.get(current.parentId); }
    return Array.from(path);
}

export function calculateBeholder(model) {
    const apartmentCount = Array.from(model.nodes.values()).filter(n => n.isApartment).length;
    model.N = apartmentCount;
    if (model.N > 0) {
        model.Pmax_veksler = 1.19 * model.N + 18.8 * Math.sqrt(model.N) + 17.6;
        model.pv_kurver = { 2: {20: 3.8, 30: 2.8, 40: 2.2, 50: 1.8}, 4: {20: 3.2, 40: 2.1, 60: 1.6}, 8: {20: 2.5, 40: 1.6, 60: 1.2, 80: 0.9}, 16: {20: 2.0, 40: 1.2, 60: 0.9, 80: 0.7}, 32: {20: 1.5, 40: 0.9, 60: 0.7, 80: 0.5}, 64: {20: 1.2, 40: 0.7, 60: 0.5, 80: 0.4}, 128: {20: 0.9, 40: 0.5, 60: 0.4, 80: 0.3} };
    }
    return model;
}

export function calculateTemperatures_VV(model, config) {
    const meanTemp = config.T_v - (config.dT / 2);
    const HEAT_CAPACITY_FACTOR = getHeatCapacityFactor(meanTemp) / 1000;
    
    model.nodeTemps = new Map();
    
    function traverseSupply(nodeId, currentTemp) {
        model.nodeTemps.set(nodeId, currentTemp);
        const node = model.nodes.get(nodeId);
        if (!node || !node.children) return;

        node.children.forEach(child => {
            if (child.type === 'ror_vv') {
                const flow = model.circFlows.get(child.id) || 0;
                let nextTemp = currentTemp;
                if (flow > 0.00001) {
                    const q_tab = child.q_tab || 0; 
                    const dt = q_tab / (flow * HEAT_CAPACITY_FACTOR);
                    nextTemp = currentTemp - dt;
                    if(nextTemp < config.T_omg_inde) nextTemp = config.T_omg_inde;
                } else {
                    nextTemp = currentTemp - 0.5;
                }
                traverseSupply(child.id, nextTemp);
            } else {
                traverseSupply(child.id, currentTemp);
            }
        });
    }
    traverseSupply('Beholder', config.T_v);

    model.loops.forEach(loop => {
        let t = model.nodeTemps.get(loop.startNodeId); 
        const returnNodes = loop.path.filter(id => {
            const n = model.nodes.get(id);
            return n && (n.type === 'cirkulation_vv' || n.type === 'valve');
        });
        returnNodes.forEach(nodeId => {
            const n = model.nodes.get(nodeId);
            const flow = model.circFlows.get(nodeId) || 0;
            if (!model.nodeTemps.has(nodeId) || t < model.nodeTemps.get(nodeId)) {
                model.nodeTemps.set(nodeId, t);
            }
            if (flow > 0.00001 && n.q_tab) {
                const dt = n.q_tab / (flow * HEAT_CAPACITY_FACTOR);
                t -= dt;
            }
        });
    });
}

export function calculateTemperatures_KV(model, config) {
    const T_start = config.T_k; 
    
    if (!model.nodeTemps) model.nodeTemps = new Map();
    
    function traverse(nodeId, currentTemp) {
        model.nodeTemps.set(nodeId, currentTemp);
        const node = model.nodes.get(nodeId);
        if (!node || !node.children) return;

        node.children.forEach(child => {
            if (child.type === 'ror_kv') {
                let T_env = config.T_omg_inde;
                if (child.location === 'outside') T_env = config.T_omg_ude;
                else if (child.location === 'unheated') T_env = config.T_omg_inde; 

                const flow_ls = child.qd || 0.005; 
                const flow_kg_s = (flow_ls / 1000) * getWaterDensity(currentTemp);
                
                const cp = getWaterSpecificHeat(currentTemp); 
                const U_val = child.u_value_per_meter || 100; 
                const L = child.L || 0;

                const mc = flow_kg_s * cp; 
                let nextTemp = currentTemp;

                if (mc > 0) {
                    const exponent = - (U_val * L) / mc;
                    nextTemp = T_env - (T_env - currentTemp) * Math.exp(exponent);
                } else {
                    nextTemp = T_env; 
                }
                
                traverse(child.id, nextTemp);
            } else {
                traverse(child.id, currentTemp);
            }
        });
    }
    
    if (model.nodes.has('Vandstik')) {
        traverse('Vandstik', T_start);
    }
}

export function interpolate(x, x_pts, y_pts) {
    if (x <= x_pts[0]) return y_pts[0];
    if (x >= x_pts[x_pts.length-1]) return y_pts[y_pts.length-1];
    let i = 1;
    while (x > x_pts[i]) i++;
    return y_pts[i-1] + (y_pts[i] - y_pts[i-1]) * (x - x_pts[i-1]) / (x_pts[i] - x_pts[i-1]);
}

export function calculateAbsolutePressures(model, config) {
    const g = 9.82;
    const supplyKote = config.forsyningens_kote || 0;
    
    model.nodes.forEach(n => {
        n.P_absolute = undefined;
        n.P_absolute_KV = undefined; 
        n.P_absolute_VV = undefined; 
    });

    function traverse(nodeId, parentPressure, parentKote, context) {
        const node = model.nodes.get(nodeId);
        if (!node) return;

        const temp = (context === 'KV') ? 10 : config.T_v;
        const rho = getWaterDensity(temp);

        let currentKote = parentKote;
        if (node.type === 'tapsted') {
            currentKote = node.kote; 
        }

        const componentLoss = node.dp_tap || 0;

        const h_diff = currentKote - parentKote;
        const geoLoss = rho * g * h_diff;

        let currentPressure = parentPressure - componentLoss - geoLoss;
        
        node.P_absolute = currentPressure; 
        
        if (context === 'KV') {
            node.P_absolute_KV = currentPressure;
            if (state.beholderConnectionId === nodeId) {
                model.calculated_beholder_feed_pressure = currentPressure;
            }
        } else {
            node.P_absolute_VV = currentPressure;
        }

        if (node.children) {
            node.children.forEach(child => traverse(child.id, currentPressure, currentKote, context));
        }
    }

    const startPressure = config.pln; 
    const vandstikNode = model.nodes.get('Vandstik');
    if (vandstikNode) {
        vandstikNode.P_absolute = startPressure;
        vandstikNode.P_absolute_KV = startPressure;
        if (vandstikNode.children) {
            vandstikNode.children.forEach(c => traverse(c.id, startPressure, supplyKote, 'KV'));
        }
    }

    let vvStartP = model.calculated_beholder_feed_pressure || (config.pln - (model.kv_pressure_loss_to_beholder || 0));
    
    const beholderNode = model.nodes.get('Beholder');
    if (beholderNode) {
        beholderNode.P_absolute = vvStartP;
        beholderNode.P_absolute_VV = vvStartP;
        if (beholderNode.children) {
            beholderNode.children.forEach(c => traverse(c.id, vvStartP, supplyKote, 'VV'));
        }
    }
}

// Hjælpefunktion til at hente tryktab på stien til en node (for hydraulisk link)
export function getPathPressureDrop(model, nodeId) {
    let dp = 0;
    let curr = model.nodes.get(nodeId);
    while (curr) {
        dp += curr.dp_tap || 0;
        if (!curr.parentId) break;
        curr = model.nodes.get(curr.parentId);
    }
    return dp;
}
