import { state } from "../data/state.js";
import { calculateAbsolutePressures } from "./solver.js";

/**
 * Bygger beregningsmodellen fra DOM'en.
 * Håndterer 'Unified Taps' ved at linke tapsteder til både VV og KV forældre.
 * MERGE-LOGIK: Læser både VV- og KV-listerne og samler tapsteder med samme ID til én node.
 */
export function buildModel(config) {
    const model = { 
        tree: {id:'Beholder', type: 'beholder', children:[]}, 
        kvTree: {id:'Vandstik', type: 'vandstik', children:[]}, 
        nodes: new Map(), 
        loops: [], 
        isAuto: config.isAuto 
    };
    
    model.nodes.set('Beholder', model.tree);
    model.nodes.set('Vandstik', model.kvTree);

    // Vi scanner alle rækker i hele systemet
    const selector = '.ror-container > tr[data-id], .tapsted-container > tr[data-id], #returContainerBody > tr[data-id]';
    
    document.querySelectorAll(selector).forEach(el => {
        const id = el.dataset.id;
        const type = el.dataset.type;
        
        // 1. Tjek om noden allerede findes (fra den modsatte liste)
        let data = model.nodes.get(id);
        
        if (!data) {
            // Opret ny hvis den ikke findes
            data = { 
                id: id, 
                type: type, 
                children: [], 
                name: state.names.get(id) || '' 
            };
            model.nodes.set(id, data);
        }

        // 2. Bestem Kontekst (Hvilken liste er vi i?)
        const isVVContext = el.closest('#strengeContainerVV') !== null || el.closest('#strengeContainer') !== null;
        const isKVContext = el.closest('#strengeContainerKV') !== null;
        const isReturContext = el.closest('#returContainerBody') !== null;

        // 3. Gem Forælder-info baseret på kontekst
        const rawParent = el.querySelector('.parent')?.value;

        if (type === 'tapsted') {
            // Hvis vi er i VV-listen, så er dropdown-værdien vores VARME forælder
            if (isVVContext && rawParent) {
                data.parentVV = rawParent;
            }
            // Hvis vi er i KV-listen, så er dropdown-værdien vores KOLDE forælder
            if (isKVContext && rawParent) {
                data.parentKV = rawParent;
            }
        } else {
            // Rør og andre komponenter har kun én forælder
            if (rawParent) data.parentId = rawParent;
        }
        
        // 4. Opdater Data (Overskrivning er OK, da data er ens i spejlene)
        if (type.includes('ror') || type === 'cirkulation_vv') {
            Object.assign(data, { 
                L: parseFloat(el.querySelector('.len')?.value) || 0, 
                zeta_sum: parseFloat(el.querySelector('.fittings')?.value) || 0, 
                material: el.querySelector('.material')?.value,
                location: el.querySelector('.location')?.value || 'heated',
                insulationClassSelection: el.querySelector('.insulation-class')?.value || 'Auto'
            });
            if (!config.isAuto) data.nom_dim = parseFloat(el.querySelector('.dim')?.value) || 0;
        }
        
        if (type === 'tapsted') {
            data.qf = parseFloat(el.querySelector('.qf')?.value) || 0;
            data.isSyst = el.querySelector('.syst')?.checked || false;
            data.isApartment = el.dataset.isApartment === 'true';
            data.kote = parseFloat(el.querySelector('.kote')?.value) || 0;
            const tapSelect = el.querySelector('.tapType');
            if (tapSelect && tapSelect.selectedIndex >= 0) {
                data.tapType = tapSelect.options[tapSelect.selectedIndex].text;
            }
        }
        
        if (type === 'valve') data.valveType = el.querySelector('.valve-type-select')?.value || el.dataset.valveType;
        if (type === 'booster' || type === 'reducer') data.pressure_change = parseFloat(el.querySelector('.pressure-change')?.value) || 0;
    });

    // 5. Byg Træstrukturen (Linking)
    model.nodes.forEach(n => { 
        if (n.type === 'tapsted') {
            // Link til VV-træet hvis parentVV findes
            if (n.parentVV && model.nodes.has(n.parentVV)) {
                model.nodes.get(n.parentVV).children.push(n);
            }
            // Link til KV-træet hvis parentKV findes
            if (n.parentKV && model.nodes.has(n.parentKV)) {
                model.nodes.get(n.parentKV).children.push(n);
            }
        } else {
            // Standard linking
            if (n.parentId && model.nodes.has(n.parentId)) {
                model.nodes.get(n.parentId).children.push(n); 
            }
        }
    });
    
    // 6. Cirkulation loops
    document.querySelectorAll('.streng-card').forEach(c => {
        if (!c.classList.contains('kv-card')) {
            const start = c.querySelector('.circ-start')?.value;
            const end = c.querySelector('.circ-end')?.value;
            const zeta = parseFloat(c.querySelector('.circ-zeta')?.value) || 0;
            if(start && end) model.loops.push({ id: c.dataset.id, name: state.names.get(c.dataset.id)||'', startNodeId: start, endNodeId: end, zeta });
        }
    });
    
    return model;
}

/**
 * Synkroniserer data fra den færdige beregningsmodel over til
 * det 'state'-objekt, som D3-diagrammet bruger til at tegne.
 * Dette sikrer, at tegnedata altid er opdateret med de seneste resultater.
 */
export function syncModelToState(model) {
    // 1. Find SVG-størrelse hvis muligt for intelligent placering af rødder
    let width = 600;
    let height = 400;
    if (state.svgElement && typeof state.svgElement.empty === 'function' && !state.svgElement.empty()) {
        const rect = state.svgElement.node().getBoundingClientRect();
        if (rect.width && rect.height) {
            width = rect.width;
            height = rect.height;
        }
    }

    // 2. Map eksisterende noder efter id for at bevare koordinater, hastigheder og fiksering
    const oldNodeMap = new Map(state.nodes.map(n => [n.id, n]));
    
    // 3. Opbyg den nye liste over state-noder ud fra beregningsmodellen
    const newNodes = [];
    model.nodes.forEach((calculatedNode, id) => {
        let stateNode = oldNodeMap.get(id);
        
        if (stateNode) {
            // Kopier alle beregnede egenskaber til den eksisterende node
            Object.assign(stateNode, calculatedNode);
        } else {
            // Opret ny node hvis den ikke findes
            stateNode = { ...calculatedNode };
            
            // Placer den intelligent i nærheden af sin forælder for at undgå vilde spring
            const parentId = calculatedNode.parentId || calculatedNode.parentVV || calculatedNode.parentKV;
            if (parentId && oldNodeMap.has(parentId)) {
                const parent = oldNodeMap.get(parentId);
                stateNode.x = parent.x + (Math.random() - 0.5) * 40;
                stateNode.y = parent.y + (Math.random() - 0.5) * 40;
            } else {
                // Generisk standardplacering
                stateNode.x = width / 2 + (Math.random() - 0.5) * 100;
                stateNode.y = height / 2 + (Math.random() - 0.5) * 100;
            }
        }
        
        // Fikser positionen for de to systemrødder (Beholder og Vandstik)
        if (id === 'Beholder') {
            if (stateNode.fx === undefined || stateNode.fx === null) {
                stateNode.fx = width / 3;
                stateNode.fy = height / 2 - 50;
            }
        } else if (id === 'Vandstik') {
            if (stateNode.fx === undefined || stateNode.fx === null) {
                stateNode.fx = width / 3;
                stateNode.fy = height / 2 + 100;
            }
        }
        
        newNodes.push(stateNode);
    });
    
    state.nodes = newNodes;
    
    // 4. Trace-funktion til at bestemme linktype baseret på stiens oprindelse (KV, VV eller Retur)
    function traceLinkType(nodeId) {
        let currId = nodeId;
        const visited = new Set();
        while (currId && !visited.has(currId)) {
            visited.add(currId);
            if (currId === 'Vandstik') return 'ror_kv';
            if (currId === 'Beholder') return 'fremløb';
            const curr = model.nodes.get(currId);
            if (!curr) break;
            if (curr.type === 'ror_kv') return 'ror_kv';
            if (curr.type === 'cirkulation_vv') return 'cirkulation_vv';
            if (curr.type === 'ror_vv') return 'fremløb';
            currId = curr.parentId;
        }
        return 'fremløb'; // Standard fallback
    }

    // 5. Opbyg links (forbindelser)
    const newLinks = [];
    
    // Forbind Beholder til koldtvandsforsyningen (enten det brugerdefinerede stik eller direkte til Vandstik)
    const coldSourceId = state.beholderConnectionId || 'Vandstik';
    if (model.nodes.has(coldSourceId) && model.nodes.has('Beholder')) {
        newLinks.push({
            id: `${coldSourceId}-Beholder`,
            source: coldSourceId,
            target: 'Beholder',
            type: 'kv_feed'
        });
    }

    state.nodes.forEach(node => {
        if (node.type === 'tapsted') {
            // Tapsteder can have both VV and KV connections (Unified Taps)
            if (node.parentVV && model.nodes.has(node.parentVV)) {
                newLinks.push({
                    id: `${node.parentVV}-${node.id}`,
                    source: node.parentVV,
                    target: node.id,
                    type: 'fremløb'
                });
            }
            if (node.parentKV && model.nodes.has(node.parentKV)) {
                newLinks.push({
                    id: `${node.parentKV}-${node.id}`,
                    source: node.parentKV,
                    target: node.id,
                    type: 'kv_feed'
                });
            }
        } else {
            // Standard rør/komponenter har én forælder (parentId)
            if (node.parentId && model.nodes.has(node.parentId)) {
                const linkType = traceLinkType(node.id);
                newLinks.push({
                    id: `${node.parentId}-${node.id}`,
                    source: node.parentId,
                    target: node.id,
                    type: linkType
                });
            }
        }
    });

    // Forbind cirkulationssløjfer (loops) fra fremløb til returrør
    model.loops.forEach(loop => {
        if (loop.startNodeId && loop.endNodeId && model.nodes.has(loop.startNodeId) && model.nodes.has(loop.endNodeId)) {
            newLinks.push({
                id: `${loop.startNodeId}-${loop.endNodeId}`,
                source: loop.startNodeId,
                target: loop.endNodeId,
                type: 'cirkulation_vv'
            });
        }
    });
    
    state.links = newLinks;
    state.lastModel = model;
}

/**
 * Analyserer systemets topologi og tildeler kategorier:
 * - Koblingsledning (Tilslutning): Forsyner kun 1 tapsted.
 * - Fordelingsledning (Fremløb): Forsyner >1 tapsted i samme streng.
 * - Hovedledning (Retur): Bærer flow fra flere strenge.
 * - Håndterer nu "gennemgangskomponenter" (Booster/Reducer/Ventil) korrekt.
 * - inkludere 'water_meter' som en pass-through type.
 */
export function analyzeSystemTopology(model) {
    const getStringId = (nodeId) => {
        if (!nodeId || nodeId === 'Beholder' || nodeId === 'Vandstik') return nodeId;
        return nodeId.split('-')[0]; 
    };

    // RETTELSE HER: Tilføjet 'water_meter' til listen over gennemgangstyper
    const passThroughTypes = ['ror_vv', 'ror_kv', 'booster', 'reducer', 'valve', 'cirkulation_vv', 'water_meter'];

    const analyzeNode = (nodeId, systemType) => {
        const node = model.nodes.get(nodeId);
        if (!node) return { tapCount: 0, feedsOtherString: false };

        if (node.type === 'tapsted') {
            return { tapCount: 1, feedsOtherString: false };
        }

        let totalTaps = 0;
        let feedsOther = false;
        const myString = getStringId(node.id);

        if (node.children) {
            node.children.forEach(child => {
                const childResult = analyzeNode(child.id, systemType);
                totalTaps += childResult.tapCount;
                
                const childString = getStringId(child.id);
                
                if (childString !== myString && child.type !== 'tapsted') {
                    feedsOther = true;
                }
                if (systemType === 'KV' && child.id === 'Beholder') {
                    feedsOther = true;
                }
                
                if (childResult.feedsOtherString) feedsOther = true;
            });
        }

        // Tildel Kategori
        if (passThroughTypes.includes(node.type)) {
            let prefix = '';
            if (node.type === 'ror_kv' || systemType === 'KV') prefix = 'cold_';
            
            if (node.type === 'cirkulation_vv' || node.type === 'valve' || (node.type === 'booster' && systemType === 'RETUR')) {
                 node.category = 'return';
            } 
            else {
                if (feedsOther) {
                    node.category = prefix + 'main';
                } else if (totalTaps === 1) {
                    node.category = prefix + 'connection';
                } else {
                    node.category = prefix + 'distribution';
                }
            }
        }
        
        return { tapCount: totalTaps, feedsOtherString: feedsOther };
    };

    // 1. Analyser Fremløb
    if (model.nodes.has('Beholder')) model.nodes.get('Beholder').children.forEach(c => analyzeNode(c.id, 'VV'));
    if (model.nodes.has('Vandstik')) model.nodes.get('Vandstik').children.forEach(c => analyzeNode(c.id, 'KV'));

    // 2. Analyser Retur
    const returnPipeLoops = new Map();
    model.loops.forEach(loop => {
        if (!loop.path) return;
        loop.path.forEach(nodeId => {
            const node = model.nodes.get(nodeId);
            if (node && ['cirkulation_vv', 'valve', 'booster', 'reducer'].includes(node.type)) {
                if (!returnPipeLoops.has(nodeId)) returnPipeLoops.set(nodeId, new Set());
                returnPipeLoops.get(nodeId).add(loop.id);
            }
        });
    });

    model.nodes.forEach(n => {
        if (returnPipeLoops.has(n.id)) {
            const loops = returnPipeLoops.get(n.id);
            n.category = (loops.size > 1) ? 'main_return' : 'return';
        }
    });
}

// Hjælpefunktion til at finde stien baglæns (til farvning i diagram)
export function getPathToNode(model, nodeId, context) {
    const path = [];
    let curr = model.nodes.get(nodeId);
    while (curr) {
        path.push(curr.id);
        
        let pId = curr.parentId;
        if (curr.type === 'tapsted') {
            if (context === 'KV') pId = curr.parentKV;
            else if (context === 'VV') pId = curr.parentVV;
        }
        
        // Stop hvis vi rammer en rod
        if (!pId) break; 
        curr = model.nodes.get(pId);
    }
    return path;
}

export function updateCriticalPaths(model, config) {
    // 1. Kør din eksisterende trykberegning først
    // Denne funktion findes allerede i din kode og udfylder P_absolute_VV/_KV på alle noder
    calculateAbsolutePressures(model, config);

    // 2. Find Kritisk KV (Laveste P_absolute_KV)
    let minP_KV = Infinity;
    let critNodeKV = null;

    model.nodes.forEach(node => {
        // Vi leder efter tapsteder, der har en KV-trykværdi
        if (node.type === 'tapsted' && node.P_absolute_KV !== undefined) {
            if (node.P_absolute_KV < minP_KV) {
                minP_KV = node.P_absolute_KV;
                critNodeKV = node;
            }
        }
    });

    if (critNodeKV) {
        model.criticalNodeKV = critNodeKV;
        // Total tryktab = Forsyningstryk - Resttryk
        model.max_dp_kv = config.pln - minP_KV; 
        model.criticalPathKV = new Set(getPathToNode(model, critNodeKV.id, 'KV'));
    }

    // 3. Find Kritisk VV (Laveste P_absolute_VV)
    let minP_VV = Infinity;
    let critNodeVV = null;

    model.nodes.forEach(node => {
        // Vi leder efter tapsteder, der har en VV-trykværdi
        if (node.type === 'tapsted' && node.P_absolute_VV !== undefined) {
            if (node.P_absolute_VV < minP_VV) {
                minP_VV = node.P_absolute_VV;
                critNodeVV = node;
            }
        }
    });

    if (critNodeVV) {
        model.criticalNodeVV = critNodeVV;
        // OBS: Resttrykket er det, vi stoler på.
        // max_dp_tapning bruges til tabellen. Vi bagregner det:
        // Max_dp = (Forsyning + evt. Booster) - Resttryk.
        // Men for at gøre det simpelt i tabellen:
        // Vi lader max_dp være forskellen mellem starttrykket ved beholderen og sluttrykket.
        
        // Find starttrykket ved beholderen (gemt af din calculateAbsolutePressures)
        const startP = model.vv_start_pressure || config.pln;
        model.max_dp_tapning = startP - minP_VV; 
        
        model.criticalPath = new Set(getPathToNode(model, critNodeVV.id, 'VV'));
    }
}
