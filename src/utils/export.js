import { ST, ID, VALVE_TYPES, METER_TYPES } from "../config/constants.js";
import { state, setProjektErÆndret } from "../data/state.js";
import { extractComponentData } from "../model/components.js";
import {
    addStreng_vv,
    addStreng_kv,
    addRorSektion,
    addTapsted,
    addCirkulationRor,
    createRowHTML,
    updateDimOptions,
    updateAllSelects,
    toggleDisplayNames,
    toggleAutoDim,
    updateTapstedOptions
} from "../ui/dom.js";
import { zoomToFit, buildNetworkAndRender } from "../ui/diagram.js";

// Vi indlæser getGlobalConfig dynamisk for at undgå cirkulær afhængighed under startup,
// eller vi kan hente den fra window hvis den er tilgængelig der.
function getGlobalConfig() {
    if (window.getGlobalConfig) return window.getGlobalConfig();
    // Fallback hvis ikke klar endnu
    return {};
}

export function getDataForSave() {
    const data = {
        version: "2.0",
        config: getGlobalConfig(),
        names: Array.from(state.names.entries()),
        beholderConnectionId: state.beholderConnectionId,
        nodePositions: state.nodes.map(n => ({
            id: n.id,
            type: n.type,
            fx: n.fx !== undefined ? n.fx : n.x,
            fy: n.fy !== undefined ? n.fy : n.y
        })),
        customTapsteder: state.customTapsteder,
        strenge_vv: [],
        strenge_kv: [],
        retur_komponenter: []
    };

    // 1. Indsaml VV Strenge
    const vvContainer = document.getElementById('strengeContainerVV') || document.getElementById('strengeContainer');
    if (vvContainer) {
        vvContainer.querySelectorAll('.streng-card').forEach(card => {
            const strengData = {
                id: card.dataset.id,
                circ_start: card.querySelector('.circ-start')?.value || "",
                circ_end: card.querySelector('.circ-end')?.value || "",
                circ_zeta: parseFloat(card.querySelector('.circ-zeta')?.value) || 0,
                ror: [],
                tapsted: []
            };
            
            card.querySelectorAll('.ror-container > tr').forEach(el => {
                strengData.ror.push(extractComponentData(el));
            });
            
            card.querySelectorAll('.tapsted-container > tr').forEach(el => {
                strengData.tapsted.push(extractComponentData(el));
            });
            
            data.strenge_vv.push(strengData);
        });
    }

    // 2. Indsaml KV Strenge
    const kvContainer = document.getElementById('strengeContainerKV');
    if (kvContainer) {
        kvContainer.querySelectorAll('.streng-card').forEach(card => {
            const strengData = {
                id: card.dataset.id,
                ror: [],
                tapsted: []
            };
            
            card.querySelectorAll('.ror-container > tr').forEach(el => {
                strengData.ror.push(extractComponentData(el));
            });
            
            card.querySelectorAll('.tapsted-container > tr').forEach(el => {
                strengData.tapsted.push(extractComponentData(el));
            });
            
            data.strenge_kv.push(strengData);
        });
    }

    // 3. Indsaml Retur/Cirkulation (Alt i containeren: Rør, Ventiler, Komponenter)
    document.querySelectorAll('#returContainerBody > tr').forEach(el => {
        data.retur_komponenter.push(extractComponentData(el));
    });

    return data;
}

export function exportProject() {
    const data = getDataForSave();
    
    if (data.config) {
        const savedConfig = { ...data.config };
        
        if (savedConfig.pln) savedConfig.pln = savedConfig.pln / 1000;
        if (savedConfig.min_tap_tryk) savedConfig.min_tap_tryk = savedConfig.min_tap_tryk / 1000;
        
        data.config = savedConfig;
    }

    const projName = data.config.projectName ? data.config.projectName.replace(/[^a-z0-9æøå]/gi, '_') : 'Brugsvand_Projekt';
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const filename = `${projName}_${dateStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); 
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function autoSaveProject() {
    if (!state.isAutoSavingEnabled) return;

    const data = getDataForSave();

    if (data.config) {
        const savedConfig = { ...data.config };
        if (savedConfig.pln) savedConfig.pln = savedConfig.pln / 1000;
        if (savedConfig.min_tap_tryk) savedConfig.min_tap_tryk = savedConfig.min_tap_tryk / 1000;
        data.config = savedConfig;
    }

    try {
        localStorage.setItem('varmtBrugsvandAutoSave', JSON.stringify(data));
    } catch (e) {
        console.warn("Autosave fejlede (sandsynligvis lagerplads):", e);
    }
}

export function checkAndAutoSave() {
    if (window.projektErÆndret) {
        console.log("5-minutters interval: Gemmer ændringer...");
        autoSaveProject();
    }
}

export function importProject(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            loadProjectData(data);
        } catch (err) {
            alert("Fejl: Kunne ikke indlæse projektfilen. Er filen korrupt?\n\n" + err.message);
        }
    };
    reader.onerror = () => {
        alert("Fejl: Kunne ikke læse filen.");
    };
    reader.readAsText(file);
}

export function loadProjectData(data) {
    if (!data) return;
    console.log("Starter indlæsning af version:", data.version || "Ukendt");
    
    const vvCont = document.getElementById('strengeContainerVV') || document.getElementById('strengeContainer');
    if (vvCont) vvCont.innerHTML = '';
    
    const kvCont = document.getElementById('strengeContainerKV');
    if (kvCont) kvCont.innerHTML = '';
    
    const returCont = document.getElementById('returContainerBody');
    if (returCont) returCont.innerHTML = ''; 
    
    const customTap = document.getElementById('customTapsteder');
    if (customTap) customTap.innerHTML = '';
    
    state.sC = 0; state.sC_kv = 0; state.rC = 0; state.tC = 0; window.valveCounter = 0; window.compCounter = 0;
    
    if (data.config) {
        Object.entries(data.config).forEach(([k, v]) => {
            const el = document.getElementById(k);
            if (el) {
                if (el.type === 'checkbox') el.checked = v;
                else {
                    if ((k === 'pln' || k === 'min_tap_tryk') && typeof v === 'number' && v > 1000) {
                        el.value = v / 1000;
                    } else {
                        el.value = v;
                    }
                }
            }
        });
        state.lastConfig = getGlobalConfig();
        toggleAutoDim(data.config.isAuto);
    }
    
    state.names = new Map(data.names || []);
    state.beholderConnectionId = data.beholderConnectionId || null;
    state.nodes = data.nodePositions || [];
    state.customTapsteder = data.customTapsteder || {};
    state.lastModel = null;

    Object.keys(state.customTapsteder).forEach(k => {
        const clone = document.getElementById('customTapstedTemplate').content.cloneNode(true);
        clone.querySelector('.input-group-text').dataset.key = k;
        clone.querySelector('.input-group-text').textContent = k;
        const val = state.customTapsteder[k];
        clone.querySelector('.qf').value = val.qf_hot !== undefined ? val.qf_hot : val.qf;
        clone.querySelector('.is-apartment').checked = val.isApartment;
        if (customTap) customTap.appendChild(clone);
    });
    Object.assign(ST, data.customTapsteder ? Object.fromEntries(Object.entries(data.customTapsteder).map(([k, v]) => [k, v.qf_hot !== undefined ? v : {qf_hot: v.qf, isApartment: v.isApartment}])) : {});
    updateTapstedOptions();

    const scanList = (list, prefix) => {
        if (!list) return;
        list.forEach(item => {
            const idNum = parseInt(item.id.replace(/\D/g, '') || 0, 10);
            if (prefix && item.id.startsWith(prefix)) {
                if (prefix === 'S' && idNum > state.sC) state.sC = idNum;
                if (prefix === 'K' && idNum > state.sC_kv) state.sC_kv = idNum;
            } else if (item.type === 'valve') {
                if (idNum > window.valveCounter) window.valveCounter = idNum;
            } else if (item.type === 'booster' || item.type === 'reducer') {
                if (idNum > window.compCounter) window.compCounter = idNum;
            } else if (item.type && item.type.includes('cirkulation')) {
                if (idNum > state.rC) state.rC = idNum;
            }
            if (item.ror || item.tapsted) {
                [...(item.ror||[]), ...(item.tapsted||[])].forEach(c => {
                    const cNum = parseInt(c.id.match(/\d+$/)?.[0] || 0, 10);
                    if (cNum > state.tC) state.tC = cNum;
                    if (c.type === 'booster' || c.type === 'reducer') {
                        const compNum = parseInt(c.id.replace(/\D/g, '') || 0, 10);
                        if (compNum > window.compCounter) window.compCounter = compNum;
                    }
                });
            }
        });
    };
    scanList(data.strenge_vv, 'S');
    scanList(data.strenge_kv, 'K');
    scanList(data.retur_komponenter || data.cirkulation_vv || []);

    const applyData = (tr, item) => {
        tr.dataset.tempParent = item.parent;
        const setVal = (sel, val) => { if(tr.querySelector(sel)) tr.querySelector(sel).value = val; };
        setVal('.material', item.material);
        setVal('.location', item.location);
        setVal('.insulation-class', item.insulationClassSelection);
        setVal('.dim', item.dim);
        setVal('.len', item.len);
        setVal('.fittings', item.fittings);
        setVal('.pressure-change', item.pressure_change);
        setVal('.qf', item.qf);
        setVal('.kote', item.kote);
        if(tr.querySelector('.syst')) tr.querySelector('.syst').checked = item.syst;
        if(item.isApartment !== undefined) tr.dataset.isApartment = item.isApartment;
        
        if (item.type === 'valve') {
            const vSel = tr.querySelector('.valve-type-select');
            if (vSel) {
                vSel.value = item.valveType || "";
                tr.dataset.valveType = item.valveType;
                const idTxt = tr.querySelector('.id-text');
                if(idTxt) idTxt.textContent = `${item.id} (${(item.valveType||'').substring(0,8)}...)`;
            }
        }
        
        if (item.type === 'water_meter') {
            const mSel = tr.querySelector('.meter-type-select');
            if (mSel) {
                mSel.value = item.meterType || "Auto";
                tr.dataset.meterType = item.meterType || "Auto";
            }
        }

        const tapSel = tr.querySelector('.tapType');
        if(tapSel && item.tapType) {
            let found = false;
            for(let i=0; i<tapSel.options.length; i++) {
                if(tapSel.options[i].text === item.tapType) { tapSel.selectedIndex = i; found = true; break; }
            }
            if(!found) tapSel.value = item.qf;
        }
        const matSel = tr.querySelector('.material');
        if(matSel) { matSel.value = item.material; updateDimOptions(matSel); if(item.dim) tr.querySelector('.dim').value = item.dim; }
        const nameInp = tr.querySelector('.name-text');
        if(nameInp) {
            const savedName = state.names.get(item.id);
            if(savedName) nameInp.value = savedName;
            nameInp.onchange = (e) => state.names.set(item.id, e.target.value);
        }
    };

    (data.strenge_vv || data.strenge || []).forEach(s => {
        const clone = document.getElementById('vvStrengTemplate').content.cloneNode(true);
        const card = clone.querySelector('.card');
        card.dataset.id = s.id;
        card.querySelector('.id-text').textContent = `VV-Streng ${s.id}`;
        card.dataset.tempCircStart = s.circ_start;
        card.dataset.tempCircEnd = s.circ_end;
        if(s.circ_zeta) card.querySelector('.circ-zeta').value = s.circ_zeta;
        if (vvCont) vvCont.appendChild(clone);
        
        const rorCont = card.querySelector('.ror-container');
        const tapCont = card.querySelector('.tapsted-container');
        
        (s.ror || []).forEach(item => {
            let type = item.type;
            if (!type || type === 'ror') type = 'ror_vv'; 
            if (type === 'booster' || type === 'reducer') type = item.type;

            const tr = createRowHTML(item.id, type);
            applyData(tr, item);
            if (rorCont) rorCont.appendChild(tr);
        });
        
        (s.tapsted || []).forEach(item => {
            const tr = createRowHTML(item.id, 'tapsted');
            applyData(tr, item);
            if (tapCont) tapCont.appendChild(tr);
        });
    });

    (data.strenge_kv || []).forEach(s => {
        const clone = document.getElementById('kvStrengTemplate').content.cloneNode(true);
        const card = clone.querySelector('.card');
        card.dataset.id = s.id;
        card.querySelector('.id-text').textContent = `KV-Streng ${s.id}`;
        if (kvCont) kvCont.appendChild(clone);
        
        const rorCont = card.querySelector('.ror-container');
        const tapCont = card.querySelector('.tapsted-container');
        
        (s.ror || []).forEach(item => {
            let type = item.type;
            if (!type || type === 'ror') type = 'ror_kv';
            if (type === 'booster' || type === 'reducer') type = item.type;

            const tr = createRowHTML(item.id, type);
            applyData(tr, item);
            if (rorCont) rorCont.appendChild(tr);
        });
        (s.tapsted || []).forEach(item => {
            const tr = createRowHTML(item.id, 'tapsted');
            applyData(tr, item);
            if (tapCont) tapCont.appendChild(tr);
        });
    });

    const returItems = data.retur_komponenter || [...(data.cirkulation_vv||[]), ...(data.retur||[]), ...(data.valves||[])];
    returItems.forEach(item => {
        let type = item.type;
        if (!type) {
            if (item.valveType) type = 'valve';
            else type = 'cirkulation_vv';
        }
        if (type === 'retur') type = 'cirkulation_vv';
        
        const tr = createRowHTML(item.id, type);
        applyData(tr, item);
        if (returCont) returCont.appendChild(tr);
    });

    updateAllSelects();

    document.querySelectorAll('tr[data-temp-parent]').forEach(tr => {
        const pSel = tr.querySelector('.parent');
        const savedP = tr.dataset.tempParent;
        if(pSel && savedP) {
            pSel.value = savedP;
            if(pSel.value === "") {
                if(tr.dataset.type === 'ror_kv') pSel.value = "Vandstik";
                else pSel.value = "Beholder";
            }
        }
        delete tr.dataset.tempParent;
    });

    document.querySelectorAll('.streng-card').forEach(card => {
        const sSel = card.querySelector('.circ-start');
        const eSel = card.querySelector('.circ-end');
        if(sSel && card.dataset.tempCircStart) sSel.value = card.dataset.tempCircStart;
        if(eSel && card.dataset.tempCircEnd) eSel.value = card.dataset.tempCircEnd;
        delete card.dataset.tempCircStart; delete card.dataset.tempCircEnd;
    });

    updateAllSelects();
    toggleDisplayNames(state.useNames);
    
    if (!state.lastConfig) state.lastConfig = getGlobalConfig();
    
    setTimeout(zoomToFit, 100);
    
    console.log("Projekt indlæst komplet.");
}

export function exportDetailedResults() {
    if (!state.lastModel || !state.lastConfig) {
        alert('Du skal først køre en beregning for at kunne eksportere resultater.');
        return;
    }
    
    const data = generateDetailedResults(state.lastModel, state.lastConfig);
    
    const projName = state.lastConfig.projectName ? state.lastConfig.projectName.replace(/[^a-z0-9æøå]/gi, '_') : 'Brugsvand';
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}_${hour}-${minute}`;

    const filename = `${projName}_Detaljer_${dateStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function generateDetailedResults(model, config) {
    const translateCategory = (cat) => {
        const map = {
            'main': 'Hovedledning (Fremløb)',
            'distribution': 'Fordelingsledning (Fremløb)',
            'connection': 'Koblingsledning (Fremløb)',
            'main_return': 'Hovedledning (Retur)',
            'return': 'Returledning'
        };
        return map[cat] || 'Ukendt';
    };

    const nodesExport = Array.from(model.nodes.values()).map(n => {
        const nodeData = {
            ID: n.id,
            Navn: n.name || '',
            Type: n.type,
            Forælder: n.parentId || 'Ingen'
        };

        if (n.type === 'ror_vv' || n.type === 'cirkulation_vv') {
            Object.assign(nodeData, {
                Materiale: n.material,
                Dimension: n.nom_dim + ' mm',
                Længde: n.L + ' m',
                Placering: n.location === 'outside' ? 'Udendørs' : (n.location === 'unheated' ? 'Uopvarmet' : 'Opvarmet'),
                Kategori: translateCategory(n.category),
                Flow_ls: n.type === 'ror_vv' ? (n.qd || 0).toFixed(4) : (n.circ_flow || 0).toFixed(4),
                Hastighed_ms: calcVelocity(n, model).toFixed(2),
                Zeta_sum: n.zeta_sum,
                Tryktab_Total_Pa: (n.type === 'ror_vv' ? n.dp_tap : n.dp_circ || 0).toFixed(0),
                Tryktab_pr_m_Pa: ((n.type === 'ror_vv' ? n.dp_tap : n.dp_circ || 0) / (n.L || 1)).toFixed(1),
                Isolering_Klasse: n.insulationClass ? `Kl. ${n.insulationClass}` : 'Auto',
                Isolering_Tykkelse: (n.insulationThickness || 0) + ' mm',
                U_værdi_W_mK: (n.u_value_per_meter || 0).toFixed(3),
                Varmetab_W: (n.q_tab || 0).toFixed(1)
            });
        }

        if (n.type === 'tapsted') {
            Object.assign(nodeData, {
                Normflow_qf: n.qf,
                Systematisk: n.isSyst ? 'Ja' : 'Nej',
                Lejlighed: n.isApartment ? 'Ja' : 'Nej',
                Kote: n.kote
            });
        }
        
        if (n.type === 'valve') {
            Object.assign(nodeData, {
                Ventil_Type: n.valveType || 'Ukendt'
            });
        }

        return nodeData;
    });

    const loopsExport = model.loops.map(l => ({
        Streng_ID: l.id,
        Start_Node: l.startNodeId,
        Slut_Node: l.endNodeId,
        Ventil_Type: l.selectedValve ? (l.selectedValve.valveName || l.selectedValve.freseNr) : 'Ingen/Manuel',
        Total_Varmetab_W: (l.q_tab_tot || 0).toFixed(1),
        Cirkulationsflow_lh: ((l.circ_flow || 0) * 3600).toFixed(1),
        Tryktab_Streng_Total_Pa: (l.dp_circ_total || 0).toFixed(0),
        Ventil_Data: l.selectedValve ? {
            Type: l.selectedValve.isStatic ? 'Statisk' : 'Dynamisk',
            Min_DP_Pa: l.selectedValve.minDp || 0,
            VVS_Nr: l.selectedValve.vvsNr
        } : null
    }));

    return {
        Projekt_Info: {
            Dato: new Date().toLocaleString(),
            Konfiguration: config
        },
        Resultat_Sammendrag: {
            Max_Tryktab_Tapning_Pa: model.max_dp_tapning,
            Max_Tryktab_Cirkulation_Pa: model.max_dp_circ,
            Resttryk_Kritisk_Tapsted_Pa: config.pln - model.max_dp_tapning
        },
        Komponent_Liste: nodesExport,
        Cirkulations_Strenge: loopsExport
    };
}

export function calcVelocity(n, model) {
    if (!n.nom_dim) return 0;
    const flow_ls = n.type === 'ror_vv' ? (n.qd || 0) : (model.circFlows.get(n.id) || 0);
    const d_i = ID[n.material][n.nom_dim] / 1000;
    const area = Math.PI * (d_i / 2) ** 2;
    return n.L > 0 && area > 0 ? (flow_ls / 1000) / area : 0;
}

export function renumberAndSortProject() {
    if (!confirm("Vil du omdøbe og sortere hele projektet?\n\nDette vil:\n1. Give alle strenge og komponenter nye, logiske numre (S1, K1, B1...).\n2. Sortere tabellerne efter flow-retning.\n3. Bevare forbindelser for Unified Tapsteder.")) {
        return;
    }

    autoSaveProject(); 
    const rawData = localStorage.getItem('varmtBrugsvandAutoSave');
    if (!rawData) return;
    
    const data = JSON.parse(rawData);
    const idMap = new Map(); 
    
    idMap.set('Beholder', 'Beholder');
    idMap.set('Vandstik', 'Vandstik');

    let counts = {
        B: 0,   
        Red: 0, 
        V: 0,   
        Retur: 0 
    };

    const sortComponentsInString = (components) => {
        const adjacency = new Map();
        const nodesInString = new Set(components.map(c => c.id));
        
        components.forEach(c => {
            const p = c.parent;
            if (!adjacency.has(p)) adjacency.set(p, []);
            adjacency.get(p).push(c);
        });

        const sorted = [];
        const traverse = (parentId) => {
            const children = adjacency.get(parentId) || [];
            children.sort((a, b) => {
                const typeA = a.type.includes('ror') ? 0 : 1;
                const typeB = b.type.includes('ror') ? 0 : 1;
                return typeA - typeB;
            });
            
            children.forEach(child => {
                if (nodesInString.has(child.id)) {
                    sorted.push(child);
                    traverse(child.id);
                }
            });
        };
        
        const roots = components.filter(c => !nodesInString.has(c.parent));
        roots.forEach(root => {
            sorted.push(root);
            traverse(root.id);
        });
        
        components.forEach(c => {
            if (!sorted.includes(c)) sorted.push(c);
        });
        
        return sorted;
    };

    const renameComponents = (components, stringPrefix) => {
        let rCount = 0; 
        let tCount = 0; 
        
        components.forEach(c => {
            const oldId = c.id;
            
            if (idMap.has(oldId)) {
                c.id = idMap.get(oldId);
                return; 
            }

            let newId;

            if (c.type === 'booster') {
                counts.B++;
                newId = `B${counts.B}`;
            } else if (c.type === 'reducer') {
                counts.Red++;
                newId = `Red${counts.Red}`;
            } else if (c.type === 'tapsted') {
                tCount++;
                newId = `${stringPrefix}-T${tCount}`;
            } else {
                rCount++;
                newId = `${stringPrefix}-R${rCount}`;
            }
            
            idMap.set(oldId, newId);
            c.id = newId;
        });
    };

    if (data.strenge_vv) {
        data.strenge_vv.forEach((streng, index) => {
            const newStringId = `S${index + 1}`;
            idMap.set(streng.id, newStringId);
            streng.id = newStringId;

            let comps = [...(streng.ror || []), ...(streng.tapsted || [])];
            comps = sortComponentsInString(comps);
            renameComponents(comps, newStringId);

            streng.ror = comps.filter(c => c.type !== 'tapsted');
            streng.tapsted = comps.filter(c => c.type === 'tapsted');
        });
    }

    if (data.strenge_kv) {
        data.strenge_kv.forEach((streng, index) => {
            const newStringId = `K${index + 1}`;
            idMap.set(streng.id, newStringId);
            streng.id = newStringId;

            let comps = [...(streng.ror || []), ...(streng.tapsted || [])];
            comps = sortComponentsInString(comps);
            renameComponents(comps, newStringId);

            streng.ror = comps.filter(c => c.type !== 'tapsted');
            streng.tapsted = comps.filter(c => c.type === 'tapsted');
        });
    }

    let returComps = [
        ...(data.retur_komponenter || []), 
        ...(data.cirkulation_vv || []), 
        ...(data.valves || [])
    ];
    
    const uniqueRetur = [];
    const seenIds = new Set();
    returComps.forEach(c => {
        if(!seenIds.has(c.id)) { uniqueRetur.push(c); seenIds.add(c.id); }
    });

    if (uniqueRetur.length > 0) {
        const sortedRetur = sortComponentsInString(uniqueRetur);
        
        sortedRetur.forEach(c => {
            const oldId = c.id;
            
            if (idMap.has(oldId)) {
                 c.id = idMap.get(oldId);
                 return;
            }

            let newId;
            if (c.type === 'valve') {
                counts.V++;
                newId = `V${counts.V}`;
            } else if (c.type === 'booster') {
                counts.B++;
                newId = `B${counts.B}`;
            } else if (c.type === 'reducer') {
                counts.Red++;
                newId = `Red${counts.Red}`;
            } else {
                counts.Retur++;
                newId = `Retur${counts.Retur}`;
            }
            idMap.set(oldId, newId);
            c.id = newId;
        });

        data.retur_komponenter = sortedRetur;
        data.cirkulation_vv = [];
        data.valves = [];
    }

    const updateId = (id) => idMap.has(id) ? idMap.get(id) : id;
    
    const updateListParents = (list) => {
        if (!list) return;
        list.forEach(item => {
            item.parent = updateId(item.parent);
            if (item.parent_vv) item.parent_vv = updateId(item.parent_vv);
            if (item.parent_kv) item.parent_kv = updateId(item.parent_kv);
        });
    };

    if (data.strenge_vv) data.strenge_vv.forEach(s => {
        updateListParents(s.ror);
        updateListParents(s.tapsted);
        s.circ_start = updateId(s.circ_start);
        s.circ_end = updateId(s.circ_end);
    });

    if (data.strenge_kv) data.strenge_kv.forEach(s => {
        updateListParents(s.ror);
        updateListParents(s.tapsted);
    });

    updateListParents(data.retur_komponenter);

    const newNames = [];
    if (data.names) {
        data.names.forEach(([oldId, name]) => {
            if (idMap.has(oldId)) newNames.push([idMap.get(oldId), name]);
        });
    }
    data.names = newNames;

    if (data.nodePositions) {
        data.nodePositions.forEach(pos => {
            if (idMap.has(pos.id)) pos.id = idMap.get(pos.id);
        });
    }
    
    if (data.beholderConnectionId) {
        data.beholderConnectionId = updateId(data.beholderConnectionId);
    }

    console.log("Renumbering færdig (Unified Taps bevaret).", idMap);
    loadProjectData(data);
    autoSaveProject(); 
}
