import { ST, ID, VALVE_TYPES, METER_TYPES } from "../config/constants.js";
import { state, setProjektErÆndret } from "../data/state.js";
import { updateDiagram, updateDiagramStyles } from "./diagram.js";
import {
    createRowHTML,
    addStreng_vv,
    addStreng_kv,
    addRorSektion,
    addTapsted,
    addValve,
    addComponent,
    removeElement,
    updateAllSelects,
    toggleBeholderMetode,
    updateDimOptions,
    handleMaterialChange
} from "./dom.js";

const d3 = window.d3;
const bootstrap = window.bootstrap;

export function handleInputChange(e) {
    // 1. Håndter Tapsted Type ændring (Differentieret Hot/Cold)
    if (e.target.classList.contains('tapType')) {
        const sourceTr = e.target.closest('tr');
        const id = sourceTr.dataset.id;
        
        // Hent den valgte type
        const selectedOption = e.target.options[e.target.selectedIndex];
        const typeName = selectedOption.text;
        const newVal = selectedOption.value; // Dette er qf_hot fra createRowHTML
        const isApt = selectedOption.dataset.isApartment === 'true';
        
        // Slå værdier op i ST (Standard Tapsteder)
        let flowHot = 0;
        let flowCold = 0;
        
        if (ST[typeName]) {
            if (typeof ST[typeName] === 'object') {
                flowHot = ST[typeName].qf_hot;
                flowCold = ST[typeName].qf_cold;
            } else {
                // Legacy format (kun tal)
                flowHot = ST[typeName];
                // Simpel logik for legacy cold
                if (typeName.includes('WC') || typeName.includes('Toilet')) flowCold = 0.13;
                else flowCold = flowHot; 
            }
        } else if (state.customTapsteder[typeName]) {
            flowHot = state.customTapsteder[typeName].qf_hot || 0;
            flowCold = state.customTapsteder[typeName].qf_cold || 0;
        } else {
            // Fallback hvis typen er ukendt, brug værdien fra optionen
            flowHot = parseFloat(newVal) || 0;
            flowCold = flowHot; 
        }

        // Opdater ALLE rækker med dette ID (Spejling)
        const allMirrors = document.querySelectorAll(`tr[data-id="${id}"]`);
        
        allMirrors.forEach(tr => {
            // Opdater Dropdown valg
            const sel = tr.querySelector('.tapType');
            let found = false;
            for(let i=0; i<sel.options.length; i++) {
                if(sel.options[i].text === typeName) {
                    sel.selectedIndex = i; found = true; break;
                }
            }
            if(!found) sel.value = newVal;

            // Opdater qf feltet baseret på KONTEKST (VV eller KV)
            const qfInput = tr.querySelector('.qf');
            if (qfInput) {
                // Er vi i KV containeren?
                if (tr.closest('#strengeContainerKV')) {
                    qfInput.value = flowCold;
                } else {
                    // Ellers antager vi VV
                    qfInput.value = flowHot;
                }
            }
            
            // Opdater dataset
            tr.dataset.isApartment = isApt;
        });

        // Opdater State
        const node = state.nodes.find(n => n.id === id);
        if (node) {
            node.tapType = typeName;
            // Vi opdaterer diagrammet for at vise evt. navneændring
            updateDiagram(); 
        }
        
        if (document.getElementById('metodeA') && document.getElementById('metodeA').checked) {
            toggleBeholderMetode(); 
        }
    }
    
    // 2. Håndter Navne ændring (Synkroniseret)
    if (e.target.classList.contains('name-text')) {
        const id = e.target.closest('[data-id]').dataset.id;
        const newName = e.target.value;
        state.names.set(id, newName);
        
        document.querySelectorAll(`[data-id="${id}"] .name-text`).forEach(inp => {
            if (inp !== e.target) inp.value = newName;
        });
        updateAllSelects(); 
    }
    
    // 3. Håndter Kote ændring (Synkroniseret)
    if (e.target.classList.contains('kote')) {
        const id = e.target.closest('[data-id]')?.dataset.id;
        if (id) {
            const newKote = e.target.value;
            document.querySelectorAll(`[data-id="${id}"] .kote`).forEach(inp => {
                if (inp !== e.target) inp.value = newKote;
            });
        }
    }

    // 4. Håndter Syst ændring (Synkroniseret)
    if (e.target.classList.contains('syst')) {
        const id = e.target.closest('[data-id]')?.dataset.id;
        if (id) {
            const isChecked = e.target.checked;
            document.querySelectorAll(`[data-id="${id}"] .syst`).forEach(inp => {
                if (inp !== e.target) inp.checked = isChecked;
            });
        }
    }
    
    if (typeof setProjektErÆndret === 'function') {
        setProjektErÆndret();
    }
}

export function highlightComponent(id) {
    const pipeSelector = "#diagram svg .link-fremløb, #diagram svg .link-cirkulation_vv, #diagram svg .link-ror_kv";

    d3.selectAll(pipeSelector)
        .style('opacity', 0.1);

    d3.selectAll(pipeSelector)
        .filter(d => d.target.id === id)
        .style('stroke', '#ff7f0e') 
        .style('stroke-width', '6px')
        .style('opacity', 1.0);
}

export function clearHighlight() {
    updateDiagramStyles(); 
}

export function highlightLoop(loopId) {
    if (!state.lastModel) return;
    const loop = state.lastModel.loops.find(l => l.id === loopId);
    if (!loop || !loop.path) return;

    const pathIds = new Set(loop.path);

    d3.selectAll("#diagram svg .link-fremløb, #diagram svg .link-cirkulation_vv")
        .each(function(d) {
            const link = d3.select(this);
            const isPartOfPath = pathIds.has(d.target.id);

            if (isPartOfPath) {
                link.style('stroke', '#ff7f0e').style('stroke-width', '4px').style('opacity', 1.0);
            } else {
                link.style('opacity', 0.1);
            }
        });
}

export function handleNodeClick(event, d) {
    if (state.connectingNodeInfo) {
        event.preventDefault();
        event.stopPropagation();

        const info = state.connectingNodeInfo;
        
        // --- MODE: SPEJL TAPSTED ---
        if (info.mode === 'connect_mirror_tap') {
            if (d.type !== 'tapsted') {
                alert("Du skal klikke på et Tapsted for at tilslutte det.");
                return;
            }

            const targetPipeId = info.parentId;
            const targetRow = document.querySelector(`tr[data-id="${targetPipeId}"]`);
            const targetCard = targetRow ? targetRow.closest('.streng-card') : null;

            if (targetCard) {
                const container = targetCard.querySelector('.tapsted-container');
                const existing = Array.from(container.querySelectorAll('tr')).find(tr => tr.dataset.id === d.id);
                
                if (existing) {
                    alert("Dette tapsted er allerede vist i denne streng.");
                    state.connectingNodeInfo = null;
                    document.body.style.cursor = 'default';
                    return;
                }

                // Opret Spejlet Række
                const tr = createRowHTML(d.id, 'tapsted');

                // Hent data fra kilden (DOM)
                const sourceRow = document.querySelector(`tr[data-id="${d.id}"]`);
                if (sourceRow) {
                    const srcSel = sourceRow.querySelector('.tapType');
                    const newSel = tr.querySelector('.tapType');
                    newSel.value = srcSel.value;
                    newSel.selectedIndex = srcSel.selectedIndex;
                    
                    tr.querySelector('.qf').value = sourceRow.querySelector('.qf').value;
                    tr.querySelector('.kote').value = sourceRow.querySelector('.kote').value;
                    tr.querySelector('.syst').checked = sourceRow.querySelector('.syst').checked;
                    tr.dataset.isApartment = sourceRow.dataset.isApartment;
                } else {
                    const nData = state.nodes.find(n => n.id === d.id);
                    if (nData) {
                         tr.querySelector('.qf').value = nData.qf;
                         tr.querySelector('.kote').value = nData.kote;
                    }
                }

                container.appendChild(tr);
                updateAllSelects(); 
                
                const pSel = tr.querySelector('.parent');
                if (pSel) pSel.value = targetPipeId;
                
                updateAllSelects(); 
                setProjektErÆndret();
                
                console.log(`Tapsted ${d.id} spejlet til rør ${targetPipeId}`);
            }
            
            state.connectingNodeInfo = null;
            document.body.style.cursor = 'default';
            return;
        }

        // --- MODE: STANDARD FORBINDELSER ---
        const sourceId = info.nodeData ? info.nodeData.id : null;
        const targetNodeData = d;
        
        if (info.type === 'parent') {
            const sourceElement = document.querySelector(`tr[data-id="${sourceId}"]`);
            if (sourceElement) {
                const isSourceReturn = ['cirkulation_vv', 'valve'].includes(info.nodeData.type);
                const isTargetReturn = ['cirkulation_vv', 'valve', 'beholder'].includes(targetNodeData.type);
                const isTargetSupply = ['ror_vv', 'ror_kv', 'beholder', 'vandstik', 'booster', 'reducer'].includes(targetNodeData.type);

                const isValidConnection = (isSourceReturn && isTargetReturn) || (!isSourceReturn && isTargetSupply);
                
                if (isValidConnection && sourceId !== targetNodeData.id && targetNodeData.type !== 'tapsted') {
                    sourceElement.querySelector('.parent').value = targetNodeData.id;
                    updateAllSelects(); 
                }
            }
        }
        
        if (info.mode === 'connect_return') {
             if (['cirkulation_vv', 'valve', 'beholder'].includes(targetNodeData.type)) {
                const row = document.querySelector(`tr[data-id="${sourceId}"]`);
                const card = row ? row.closest('.streng-card') : null;
                if (card) {
                    card.querySelector('.circ-start').value = sourceId;
                    card.querySelector('.circ-end').value = targetNodeData.id;
                    updateAllSelects();
                }
            }
        }

        if (info.mode === 'connect_cold_feed') {
            if (d.type !== 'ror_kv' && d.type !== 'vandstik') {
                alert('Beholderen skal tilsluttes et koldtvandsrør eller vandstikket.');
                return;
            }
            state.beholderConnectionId = d.id;
            updateDiagram();
            updateAllSelects();
        }
        
        state.connectingNodeInfo = null;
        document.body.style.cursor = 'default';
        return;
    }

    // --- NORMAL KLIK: HIGHLIGHT & SCROLL ---
    document.querySelectorAll('.highlighted-row').forEach(el => el.classList.remove('highlighted-row'));

    const rowVV = document.querySelector(`#strengeContainerVV tr[data-id="${d.id}"], #strengeContainer tr[data-id="${d.id}"]`);
    const rowKV = document.querySelector(`#strengeContainerKV tr[data-id="${d.id}"]`);
    const rowRetur = document.querySelector(`#returContainerBody tr[data-id="${d.id}"]`);

    let targetToScroll = null;
    let targetsToHighlight = [];

    const isVVVisible = rowVV && rowVV.offsetParent !== null;
    const isKVVisible = rowKV && rowKV.offsetParent !== null;
    
    if (isKVVisible) {
        targetsToHighlight.push(rowKV);
        targetToScroll = rowKV; 
    }
    
    if (isVVVisible) {
        targetsToHighlight.push(rowVV);
        if (!targetToScroll) targetToScroll = rowVV;
    }

    if (rowRetur) {
        targetsToHighlight.push(rowRetur);
        if (!targetToScroll) targetToScroll = rowRetur;
    }

    if (!targetToScroll) {
        if (rowVV) targetToScroll = rowVV;
        else if (rowKV) targetToScroll = rowKV;
    }

    targetsToHighlight.forEach(el => el.classList.add('highlighted-row'));

    if (targetToScroll) {
        targetToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
        targetsToHighlight.forEach(el => el.classList.remove('highlighted-row'));
    }, 2500);
}

export function handleNodeRightClick(event, d) {
    event.preventDefault();
    removeContextMenu();

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.cssText = `
        position: absolute; 
        left: ${event.pageX}px; 
        top: ${event.pageY}px; 
        background: white; 
        border: 1px solid #ccc; 
        border-radius: 5px; 
        box-shadow: 2px 2px 5px rgba(0,0,0,0.2); 
        padding: 5px 0; 
        z-index: 1000; 
        min-width: 240px;
        font-size: 14px;
        font-family: sans-serif;
    `;

    const createMenuItem = (text, onClick, hasSubmenu = false) => {
        const item = document.createElement('div');
        item.textContent = text;
        item.className = 'menu-item';
        item.style.padding = '8px 15px';
        item.style.cursor = 'pointer';
        item.style.position = 'relative';
        
        if (hasSubmenu) {
            item.classList.add('has-submenu');
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.innerHTML = `${text} <span>▶</span>`;
        }

        item.onmouseenter = (e) => {
            item.style.backgroundColor = '#f2f2f2';
            const sub = item.querySelector('.context-submenu');
            if (sub) sub.style.display = 'block';
        };
        item.onmouseleave = () => {
            item.style.backgroundColor = 'transparent';
            const sub = item.querySelector('.context-submenu');
            if (sub) sub.style.display = 'none';
        };
        
        if (onClick) {
            item.onclick = (e) => { 
                e.stopPropagation(); 
                onClick(); 
                removeContextMenu(); 
            };
        }
        return item;
    };

    const nodeType = d.type;
    const isPipe = ['ror_vv', 'ror_kv', 'cirkulation_vv'].includes(nodeType);
    
    const row = document.querySelector(`tr[data-id="${d.id}"]`);
    const isVVContext = row && (row.closest('#strengeContainerVV') || row.closest('#strengeContainer'));
    const isKVContext = row && row.closest('#strengeContainerKV');
    
    let showPasteVV = false, showPasteKV = false, showPasteRetur = false;
    if (state.clipboard) {
        const ct = state.clipboard.type;
        if (['ror_vv', 'tapsted'].includes(ct)) showPasteVV = true;
        if (['ror_kv', 'tapsted'].includes(ct)) showPasteKV = true;
        if (['cirkulation_vv', 'valve'].includes(ct)) showPasteRetur = true;
    }

    if (nodeType === 'ror_vv' || ((nodeType === 'water_meter' || nodeType === 'booster') && isVVContext)) {
        menu.appendChild(createMenuItem('➕ Tilføj VV-rør her (Forlæng)', () => {
            addRorSektion(null, 'ror_vv', d.id);
        }));
        
        menu.appendChild(createMenuItem('🚰 Tilføj Nyt Tapsted her', () => {
             const parentId = d.id;
             const row = document.querySelector(`tr[data-id="${parentId}"]`);
             const card = row ? row.closest('.streng-card') : null;
             if (card) {
                 addTapsted(card.querySelector('button[aria-label*="tapsted"]'));
                 const newTap = card.querySelector('.tapsted-container > tr:last-child');
                 if (newTap) { newTap.querySelector('.parent').value = parentId; updateAllSelects(); }
             }
        }));

        menu.appendChild(createMenuItem('🔗 Tilslut eksisterende Tapsted', () => {
             state.connectingNodeInfo = { 
                 mode: 'connect_mirror_tap', 
                 parentId: d.id 
              };
             document.body.style.cursor = 'copy'; 
             showConnectHint();
        }));
        
        if (showPasteVV) {
             menu.appendChild(createMenuItem('📋 Indsæt i denne streng', () => pasteBranch(d.id, 'current')));
        }
    }

    if (nodeType === 'ror_kv' || ((nodeType === 'water_meter' || nodeType === 'booster') && isKVContext)) {
        menu.appendChild(createMenuItem('➕ Tilføj KV-rør her (Forlæng)', () => {
            addRorSektion(null, 'ror_kv', d.id);
        }));
        
        menu.appendChild(createMenuItem('🚰 Tilføj Nyt Tapsted her', () => {
             const parentId = d.id;
             const row = document.querySelector(`tr[data-id="${parentId}"]`);
             const card = row ? row.closest('.streng-card') : null;
             if (card) {
                 addTapsted(card.querySelector('button[aria-label*="tapsted"]'));
                 const newTap = card.querySelector('.tapsted-container > tr:last-child');
                 if (newTap) { newTap.querySelector('.parent').value = parentId; updateAllSelects(); }
             }
        }));

        menu.appendChild(createMenuItem('🔗 Tilslut eksisterende Tapsted', () => {
             state.connectingNodeInfo = { 
                 mode: 'connect_mirror_tap', 
                 parentId: d.id 
             };
             document.body.style.cursor = 'copy';
             showConnectHint();
        }));
        
        if (showPasteKV) {
             menu.appendChild(createMenuItem('📋 Indsæt i denne streng', () => pasteBranch(d.id, 'current')));
        }
    }

    if (['cirkulation_vv', 'valve'].includes(nodeType)) {
        menu.appendChild(createMenuItem('➕ Tilføj Cirkulations-rør her', () => {
            addCirkulationRor();
            const newEl = document.querySelector('#returContainerBody > tr[data-type="cirkulation_vv"]:last-child');
            if (newEl) { newEl.querySelector('.parent').value = d.id; updateAllSelects(); }
        }));
        menu.appendChild(createMenuItem('🔧 Tilføj Ventil her', () => {
            if (typeof addValve === 'function') {
                addValve();
                const newEl = document.querySelector('#returContainerBody > tr[data-type="valve"]:last-child');
                if (newEl) { newEl.querySelector('.parent').value = d.id; updateAllSelects(); }
            }
        }));
    }

    if (nodeType === 'beholder') {
        menu.appendChild(createMenuItem('➡️ Tilslut Koldt Vand', () => {
            state.connectingNodeInfo = { mode: 'connect_cold_feed' };
            document.body.style.cursor = 'crosshair';
            alert("Klik nu på det Koldtvandsrør eller Vandstik, som beholderen skal forsynes fra.");
        }));
    }

    if (isPipe || ['beholder', 'vandstik', 'valve', 'water_meter', 'booster'].includes(nodeType)) {
        if (menu.hasChildNodes()) menu.appendChild(document.createElement('hr'));
        
        const compItem = createMenuItem('⚙️ Indsæt Komponent', null, true);
        
        const subMenu = document.createElement('div');
        subMenu.className = 'context-submenu';
        subMenu.style.cssText = `display: none; position: absolute; left: 100%; top: -5px; background: white; border: 1px solid #ccc; border-radius: 5px; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); min-width: 180px; padding: 5px 0;`;

        const mkSub = (txt, type) => {
            const el = document.createElement('div');
            el.className = 'menu-item'; el.textContent = txt; el.style.padding = '8px 15px';
            el.onclick = (e) => { e.stopPropagation(); addComponent(type, d.id); removeContextMenu(); };
            el.onmouseenter = () => el.style.backgroundColor = '#f2f2f2';
            el.onmouseleave = () => el.style.backgroundColor = 'transparent';
            return el;
        };
        
        subMenu.appendChild(mkSub('⚡ Trykforøger (Booster)', 'booster'));
        subMenu.appendChild(mkSub('↘️ Trykreduktionsventil', 'reducer'));
        subMenu.appendChild(mkSub('☐ Vandmåler', 'water_meter')); 
        
        if (nodeType === 'cirkulation_vv' || nodeType === 'beholder' || nodeType === 'valve') {
            const vSub = mkSub('🔷 Cirkulationsventil', 'valve');
            vSub.onclick = (e) => { e.stopPropagation(); addValve(); const el = document.querySelector('#returContainerBody > tr:last-child'); if(el){el.querySelector('.parent').value=d.id; updateAllSelects();} removeContextMenu(); };
            subMenu.appendChild(vSub);
        }
        compItem.appendChild(subMenu);
        menu.appendChild(compItem);
    }

    if (isPipe || nodeType === 'valve' || ['booster', 'reducer', 'water_meter'].includes(nodeType)) {
        if (menu.hasChildNodes()) menu.appendChild(document.createElement('hr'));
        
        menu.appendChild(createMenuItem('🔗 Forbind til...', () => {
            state.connectingNodeInfo = { nodeData: d, type: 'parent' };
            document.body.style.cursor = 'crosshair';
        }));
    }
    
    if (nodeType === 'ror_vv' || (isVVContext && ['water_meter', 'booster'].includes(nodeType))) {
        menu.appendChild(createMenuItem('➡️ Forbind til retur...', () => {
            state.connectingNodeInfo = { nodeData: d, mode: 'connect_return' };
            document.body.style.cursor = 'crosshair';
        }));
    }

    if (nodeType === 'beholder' || nodeType === 'ror_vv' || (isVVContext && ['water_meter', 'booster'].includes(nodeType))) {
        menu.appendChild(createMenuItem('🌱 Tilføj ny VV-streng herfra', () => { addStreng_vv(d.id); }));
        if (showPasteVV) menu.appendChild(createMenuItem('📋 Indsæt som Ny streng', () => pasteBranch(d.id, 'new')));
    }
    if (nodeType === 'vandstik' || nodeType === 'ror_kv' || (isKVContext && ['water_meter', 'booster'].includes(nodeType))) {
        menu.appendChild(createMenuItem('🌱 Tilføj ny KV-streng herfra', () => { addStreng_kv(d.id); }));
        if (showPasteKV) menu.appendChild(createMenuItem('📋 Indsæt som Ny streng', () => pasteBranch(d.id, 'new')));
    }

    menu.appendChild(document.createElement('hr'));

    if (isPipe) {
        menu.appendChild(createMenuItem('✂️ Opdel rør', () => {
            const segments = prompt("Hvor mange dele skal røret opdeles i?", "2");
            if (segments) {
                // Dynamically imported or resolved from globals/imports
                import("./dom.js").then(mod => {
                    mod.splitPipe(d.id, segments);
                });
            }
        }));
        menu.appendChild(createMenuItem('🖐️ Flyt gren', () => startMoveBranch(d.id)));
        menu.appendChild(createMenuItem('📋 Kopier gren', () => copyBranch(d.id)));
    }
    
    if (nodeType !== 'beholder' && nodeType !== 'vandstik') {
        if (!isPipe) menu.appendChild(document.createElement('hr'));
        menu.appendChild(createMenuItem('❌ Slet', () => {
             const el = document.querySelector(`tr[data-id="${d.id}"], div[data-id="${d.id}"]`);
             if (el) {
                 const btn = el.querySelector('button[aria-label*="Fjern"], button.btn-outline-danger');
                 if (btn) btn.click(); else { el.remove(); if(state.names.has(d.id)) state.names.delete(d.id); updateAllSelects(); }
                 if (state.beholderConnectionId === d.id) state.beholderConnectionId = null;
                 setProjektErÆndret();
             }
        }));
    }

    document.body.appendChild(menu);
    setTimeout(() => window.addEventListener('click', removeContextMenu, { once: true }), 0);
}

export function startMoveBranch(rootId) {
    const branchNodes = [];
    
    const collectNodes = (id) => {
        const node = state.nodes.find(n => n.id === id);
        if (node) branchNodes.push(node);
        
        document.querySelectorAll('.parent').forEach(select => {
            if (select.value === id) {
                const childId = select.closest('tr').dataset.id;
                collectNodes(childId);
            }
        });
    };
    
    collectNodes(rootId);
    if (branchNodes.length === 0) return;

    const rootNode = state.nodes.find(n => n.id === rootId);
    if (!rootNode) return;

    const startX = (rootNode.fx !== undefined && rootNode.fx !== null) ? rootNode.fx : rootNode.x;
    const startY = (rootNode.fy !== undefined && rootNode.fy !== null) ? rootNode.fy : rootNode.y;
    
    state.movingBranch = {
        nodes: branchNodes,
        startMouseX: startX,
        startMouseY: startY,
        initialPositions: branchNodes.map(n => ({
            id: n.id,
            fx: (n.fx !== undefined && n.fx !== null) ? n.fx : n.x,
            fy: (n.fy !== undefined && n.fy !== null) ? n.fy : n.y
        }))
    };

    d3.selectAll('.node').filter(d => branchNodes.some(bn => bn.id === d.id))
        .select('circle, rect')
        .style('stroke', '#ff0000')
        .style('stroke-width', '3px');

    const svg = d3.select('#diagram svg');
    
    svg.on('mousemove.branchMove', function(event) {
        const transform = d3.zoomTransform(this); 
        const [mx, my] = d3.pointer(event); 
        
        const currentX = transform.invertX(mx);
        const currentY = transform.invertY(my);
        
        const dx = currentX - state.movingBranch.startMouseX;
        const dy = currentY - state.movingBranch.startMouseY;

        const gridSize = 10;
        const snappedDx = Math.round(dx / gridSize) * gridSize;
        const snappedDy = Math.round(dy / gridSize) * gridSize;
        
        state.movingBranch.nodes.forEach((node, i) => {
            const initial = state.movingBranch.initialPositions[i];
            
            node.fx = initial.fx + snappedDx;
            node.fy = initial.fy + snappedDy;
            
            node.x = node.fx;
            node.y = node.fy;
        });
        
        state.sim.alpha(1).restart();
        state.sim.tick(); 
    });

    svg.on('click.branchMove', function() {
        stopMoveBranch();
    });
    
    svg.on('contextmenu.branchMove', function(event) {
        event.preventDefault();
        stopMoveBranch();
    });
    
    document.body.style.cursor = 'grabbing';
}

export function stopMoveBranch() {
    if (!state.movingBranch) return;
    
    const svg = d3.select('#diagram svg');
    svg.on('mousemove.branchMove', null);
    svg.on('click.branchMove', null);
    svg.on('contextmenu.branchMove', null);
    
    d3.selectAll('.node circle, .node rect')
        .style('stroke', null)
        .style('stroke-width', null);
        
    document.body.style.cursor = 'default';
    state.movingBranch = null;
    
    setProjektErÆndret();
    updateDiagramStyles();
}

export function removeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) {
        menu.remove();
    }
}

export function showConnectHint() {
    if (localStorage.getItem('varmtBrugsvand_suppressMirrorHint') === 'true') return;

    const oldModal = document.getElementById('connectHintModal');
    if (oldModal) oldModal.remove();

    const modalHtml = `
    <div class="modal fade" id="connectHintModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-light py-2">
                    <h6 class="modal-title">🔗 Tilslut Eksisterende Tapsted</h6>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-2">Klik nu på det <strong>Tapsted</strong> i diagrammet eller listen, som du vil forbinde to dette rør.</p>
                    <small class="text-muted">Dette vil oprette en "spejlet" forbindelse, så tapstedet forsynes fra både koldt og varmt vand.</small>
                    <div class="form-check mt-3">
                        <input class="form-check-input" type="checkbox" id="dontShowMirrorHintAgain">
                        <label class="form-check-label small text-secondary" for="dontShowMirrorHintAgain">
                            Vis ikke denne besked igen
                        </label>
                    </div>
                </div>
                <div class="modal-footer py-1">
                    <button type="button" class="btn btn-primary btn-sm" id="confirmMirrorHint">OK, jeg vælger nu</button>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('connectHintModal');
    const modal = new bootstrap.Modal(modalEl);
    
    const btn = document.getElementById('confirmMirrorHint');
    btn.onclick = () => {
        const chk = document.getElementById('dontShowMirrorHintAgain');
        if (chk && chk.checked) {
            localStorage.setItem('varmtBrugsvand_suppressMirrorHint', 'true');
        }
        modal.hide();
    };

    modal.show();
}

const fieldConfig = [
    { class: '.name-text',        label: 'Navn' },              
    { class: '.parent',           label: 'Forælder' },          
    { class: '.material',         label: 'Materiale' },         
    { class: '.location',         label: 'Placering' },         
    { class: '.insulation-class', label: 'Isolering' },         
    { class: '.dim',              label: 'Dimension (mm)' },    
    { class: '.len',              label: 'Længde (m)',          type: 'number', attr: 'min="0" step="0.1"' },
    { class: '.fittings',         label: 'Zeta (Modstand)',     type: 'number', attr: 'min="0" step="0.1"' },
    { class: '.pressure-change',  label: 'Trykændring (kPa)',   type: 'number', attr: 'step="1"' },
    { class: '.meter-type-select',label: 'Målerstørrelse' },    
    { class: '.valve-type-select',label: 'Ventiltype' },        
    { class: '.kv-value',         label: 'Kv Værdi',            type: 'number', attr: 'step="0.01"' }, 
    { class: '.tapType',          label: 'Type' },              
    { class: '.kote',             label: 'Kote (m)',            type: 'number', attr: 'step="0.1"' }
];

let currentNodeData = null;

export function showEditModal(d) {
    currentNodeData = d;
    const modalEl = document.getElementById('editNodeModal');
    const modal = new bootstrap.Modal(modalEl);
    
    document.getElementById('editNodeId').value = d.id;
    document.getElementById('editNodeType').value = d.type;

    const container = document.getElementById('editNodeDynamicContent');
    container.innerHTML = ''; 
    let html = '';
    let foundTypeValue = null;

    if (d.id === 'Vandstik') {
        const kote = document.getElementById('forsyningens_kote').value;
        const tryk = document.getElementById('pln').value; 
        const temp = document.getElementById('T_k').value;
        html += buildInputRow('Kote (m)', 'edit_global_kote', kote, 'number', 'step="0.1"');
        html += buildInputRow('Forsyningstryk (KPa)', 'edit_global_tryk', tryk, 'number', '');
        html += buildInputRow('KV Temperatur (°C)', 'edit_global_temp', temp, 'number', 'step="0.1"');
    }
    else if (d.id === 'Beholder') {
        const tempV = document.getElementById('T_v').value;
        const dT = document.getElementById('dT').value;
        const kote = d.kote || 0; 
        html += buildInputRow('VV Temperatur (°C)', 'edit_global_temp_v', tempV, 'number', 'step="0.1"');
        html += buildInputRow('Afkøling dT (°C)', 'edit_global_dt', dT, 'number', 'step="0.1"');
        html += buildInputRow('Kote (m)', 'edit_global_kote_beh', kote, 'number', 'step="0.1" readonly disabled'); 
    }
    else {
        const allRows = document.querySelectorAll(`tr[data-id="${d.id}"]`);
        const primaryRow = allRows[0]; 

        if (primaryRow) {
            const isTap = (d.type === 'tapsted') || (primaryRow.querySelector('.qf') !== null);

            fieldConfig.forEach(conf => {
                const isParentField = conf.label.toLowerCase().includes('forælder') || 
                                      conf.class.toLowerCase().includes('parent');
                
                if (isTap && isParentField) {
                    return; 
                }

                const inputEl = primaryRow.querySelector(conf.class);
                
                if (inputEl) {
                    const modalId = 'modal_field_' + conf.class.replace(/[\.,]/g, '').trim();
                    
                    if (inputEl.tagName === 'SELECT' && (conf.class.includes('tap') || conf.label === 'Type')) {
                        let currentText = "";
                        if (inputEl.selectedIndex >= 0) {
                            currentText = inputEl.options[inputEl.selectedIndex].text;
                        }
                        
                        foundTypeValue = currentText; 
                        
                        let optionsHtml = '';
                        if (typeof ST !== 'undefined') {
                            for (const key in ST) {
                                const isSelected = (key === currentText) ? 'selected' : '';
                                optionsHtml += `<option value="${key}" ${isSelected}>${key}</option>`;
                            }
                        } else {
                            optionsHtml = inputEl.innerHTML;
                        }

                        html += `<div class="mb-2 row">
                                    <label for="${modalId}" class="col-sm-4 col-form-label col-form-label-sm">${conf.label}</label>
                                    <div class="col-sm-8">
                                        <select id="${modalId}" class="form-select form-select-sm" data-target-class="${conf.class}">
                                            ${optionsHtml} 
                                        </select>
                                    </div>
                                 </div>`;
                    } 
                    else if (inputEl.tagName === 'SELECT') {
                         html += `<div class="mb-2 row">
                                    <label for="${modalId}" class="col-sm-4 col-form-label col-form-label-sm">${conf.label}</label>
                                    <div class="col-sm-8">
                                        <select id="${modalId}" class="form-select form-select-sm" data-target-class="${conf.class}">
                                            ${inputEl.innerHTML} 
                                        </select>
                                    </div>
                                 </div>`;
                    } 
                    else {
                        const type = conf.type || 'text';
                        let attr = conf.attr || '';
                        if (inputEl.hasAttribute('list')) attr += ` list="${inputEl.getAttribute('list')}"`; 
                        
                        html += `<div class="mb-2 row">
                                    <label for="${modalId}" class="col-sm-4 col-form-label col-form-label-sm">${conf.label}</label>
                                    <div class="col-sm-8">
                                        <input type="${type}" id="${modalId}" class="form-control form-control-sm" value="${inputEl.value}" ${attr} data-target-class="${conf.class}">
                                    </div>
                                 </div>`;
                    }
                }
            });

            if (isTap) { 
                let currentHot = 0, currentCold = 0;
                
                allRows.forEach(row => {
                    const qfVal = parseFloat(row.querySelector('.qf')?.value) || 0; 
                    if (row.closest('#strengeContainerKV') || row.closest('#koldtVandTable') || row.closest('.kv-table')) {
                        currentCold = qfVal;
                    } else {
                        currentHot = qfVal;
                    }
                });
                
                html += `<hr class="my-2 text-muted">`;
                html += buildInputRow('VV-Strøm', 'edit_qf_hot', currentHot, 'number', 'step="0.01"');
                html += buildInputRow('KV-Strøm', 'edit_qf_cold', currentCold, 'number', 'step="0.01"');
            }
        }
    }

    container.innerHTML = html;
    
    const typeSelect = container.querySelector('select[data-target-class*="tap"]'); 
    const inpHot = document.getElementById('edit_qf_hot');
    const inpCold = document.getElementById('edit_qf_cold');

    if (typeSelect) {
        if (foundTypeValue) {
            typeSelect.value = foundTypeValue;
        }

        const updateFlows = (isInit) => {
            const valgt = typeSelect.value;
            if (typeof ST === 'undefined') return;

            const data = ST[valgt];

            if (data && inpHot && inpCold) {
                if (data.mode === 'cold_only') {
                    inpHot.disabled = true;
                    inpHot.value = 0;
                    inpHot.style.backgroundColor = '#e9ecef';
                } else {
                    inpHot.disabled = false;
                    inpHot.style.backgroundColor = '';
                }

                if (!isInit) {
                    inpHot.value = data.qf_hot;
                    inpCold.value = data.qf_cold;
                }
            }
        };

        updateFlows(true);
        typeSelect.addEventListener('change', () => updateFlows(false));
    }

    modal.show();
}

export function saveEditModal() {
    if (!currentNodeData) return;
    
    const d = currentNodeData;

    if (d.id === 'Vandstik') {
        document.getElementById('forsyningens_kote').value = document.getElementById('edit_global_kote').value;
        document.getElementById('pln').value = document.getElementById('edit_global_tryk').value;
        document.getElementById('T_k').value = document.getElementById('edit_global_temp').value;
        updateDiagramStyles();
    } 
    else if (d.id === 'Beholder') {
        document.getElementById('T_v').value = document.getElementById('edit_global_temp_v').value;
        document.getElementById('dT').value = document.getElementById('edit_global_dt').value;
        updateDiagramStyles();
    }
    else {
        const rows = document.querySelectorAll(`tr[data-id="${d.id}"]`);
        const modalInputs = document.querySelectorAll('#editNodeDynamicContent [data-target-class]');
        
        const hotInput = document.getElementById('edit_qf_hot');
        const coldInput = document.getElementById('edit_qf_cold');
        
        const isTap = (d.type === 'tapsted') || (rows.length > 0 && rows[0].querySelector('.qf'));

        rows.forEach((tr) => {
            const tableId = tr.closest('table')?.id || '';
            
            modalInputs.forEach(mInp => {
                const targetClass = mInp.getAttribute('data-target-class');
                
                if (isTap && targetClass.toLowerCase().includes('parent')) {
                    return; 
                }

                const targetInp = tr.querySelector(targetClass);
                
                if (targetInp) {
                    if (targetInp.tagName === 'SELECT') {
                        const modalSelectedText = mInp.options[mInp.selectedIndex].text;
                        
                        let matchFound = false;
                        for (let i = 0; i < targetInp.options.length; i++) {
                            if (targetInp.options[i].text === modalSelectedText) {
                                targetInp.selectedIndex = i; 
                                matchFound = true;
                                break;
                            }
                        }
                        
                        if (!matchFound) {
                            targetInp.value = mInp.value;
                        }
                        
                        targetInp.dispatchEvent(new Event('change', { bubbles: true }));
                    } 
                    else {
                        if (targetInp.value !== mInp.value) {
                            targetInp.value = mInp.value;
                            targetInp.dispatchEvent(new Event('change', { bubbles: true }));
                            targetInp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }
            });

            if (isTap && hotInput && coldInput) {
                const qfField = tr.querySelector('.qf');
                if (qfField) {
                    const isColdNetwork = tr.closest('#strengeContainerKV') || 
                                          tr.closest('#koldtVandTable') || 
                                          tr.closest('.kv-table') ||
                                          tableId.includes('koldt');
                    
                    const valueToSave = isColdNetwork ? coldInput.value : hotInput.value;

                    if (qfField.value !== valueToSave) {
                        qfField.value = valueToSave;
                        qfField.dispatchEvent(new Event('change', { bubbles: true }));
                        qfField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });
    }

    const modalEl = document.getElementById('editNodeModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if(modal) modal.hide();

    setProjektErÆndret(); 
    updateDiagramStyles(); 
}

export function buildInputRow(label, id, value, type = 'text', attr = '') {
    const safeValue = (value !== undefined && value !== null) ? value : '';
    
    return `
    <div class="mb-2 row">
        <label for="${id}" class="col-sm-4 col-form-label col-form-label-sm">${label}</label>
        <div class="col-sm-8">
            <input type="${type}" 
                   class="form-control form-control-sm" 
                   id="${id}" 
                   value="${safeValue}" 
                   ${attr}>
        </div>
    </div>`;
}

export function toggleSidebar() {
    const left = document.getElementById('leftPanel');
    const right = document.getElementById('diagramContainer'); 
    const btn = document.getElementById('toggleSidebarBtn');

    if (!left || !right) return;

    const isClosed = left.classList.contains('sidebar-closed');

    if (isClosed) {
        left.classList.remove('sidebar-closed');
        right.className = 'col-lg-6 p-0 position-relative h-100 d-flex flex-column overflow-hidden';
        
        if(btn) {
            btn.innerHTML = '↔️ Udvid Diagram';
            btn.classList.remove('active');
        }
    } else {
        left.classList.add('sidebar-closed');
        right.className = 'col-12 p-0 position-relative h-100 d-flex flex-column overflow-hidden';
        
        if(btn) {
            btn.innerHTML = '⬅️ Vis Input';
            btn.classList.add('active');
        }
    }

    let steps = 0;
    const interval = setInterval(() => {
        window.dispatchEvent(new Event('resize'));
        steps++;
        if (steps > 25) clearInterval(interval); 
    }, 20);
    
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 550);
}

export function copyBranch(rootId) {
    const rootNode = state.nodes.find(n => n.id === rootId);
    if (!rootNode) return;

    const getPos = (id) => {
        const n = state.nodes.find(x => x.id === id);
        if (!n) return {x:0, y:0};
        return { x: (n.fx ?? n.x), y: (n.fy ?? n.y) };
    };
    
    const rootPos = getPos(rootId);
    
    const domRow = document.querySelector(`tr[data-id="${rootId}"]`);
    if (!domRow) return;

    const parentId = domRow.querySelector('.parent').value;
    let parentOffsetX = 60; 
    let parentOffsetY = 60;

    if (parentId && parentId !== "Ingen" && parentId !== "") {
        const parentPos = getPos(parentId);
        parentOffsetX = rootPos.x - parentPos.x;
        parentOffsetY = rootPos.y - parentPos.y;
    }

    const rootType = domRow.dataset.type;

    const scrapNode = (id) => {
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (!row) return null;
        
        const type = row.dataset.type;
        const pos = getPos(id);
        
        if (rootType.includes('ror_vv') && !['ror_vv', 'tapsted'].includes(type)) return null;
        if (rootType.includes('ror_kv') && !['ror_kv', 'tapsted'].includes(type)) return null;
        if (rootType.includes('cirkulation') && !['cirkulation_vv', 'valve'].includes(type)) return null;

        const data = { 
            type: type, 
            children: [],
            relX: pos.x - rootPos.x, 
            relY: pos.y - rootPos.y
        };
        
        if (type.includes('ror') || type === 'cirkulation_vv') {
            data.material = row.querySelector('.material').value;
            data.location = row.querySelector('.location').value;
            data.insulation = row.querySelector('.insulation-class').value;
            data.dim = row.querySelector('.dim').value;
            data.len = row.querySelector('.len').value;
            data.fittings = row.querySelector('.fittings').value;
        } 
        else if (type === 'tapsted') {
            const tapSelect = row.querySelector('.tapType');
            data.tapType = tapSelect.options[tapSelect.selectedIndex].text; 
            data.qf = row.querySelector('.qf').value;
            data.kote = row.querySelector('.kote').value;
            data.syst = row.querySelector('.syst').checked;
            data.isApartment = row.dataset.isApartment;
        }
        else if (type === 'valve') {
            data.valveType = row.querySelector('.valve-type-select').value;
        }

        const allRows = document.querySelectorAll(`tr[data-id]`); 
        allRows.forEach(childRow => {
            const pVal = childRow.querySelector('.parent')?.value;
            if (pVal === id) {
                const childData = scrapNode(childRow.dataset.id);
                if (childData) data.children.push(childData);
            }
        });

        return data;
    };

    const tree = scrapNode(rootId);
    
    if (tree) {
        tree.parentOffsetX = parentOffsetX;
        tree.parentOffsetY = parentOffsetY;
        
        state.clipboard = tree;
        
        const btn = document.createElement('div');
        btn.innerHTML = `<span style="margin-right:8px">📋</span> Gren kopieret`;
        btn.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#333; color:white; padding:10px 20px; border-radius:30px; z-index:9999; font-size:14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); animation: fadeOut 2s forwards; pointer-events: none;";
        
        if (!document.getElementById('toast-style')) {
            const style = document.createElement('style');
            style.id = 'toast-style';
            style.innerHTML = `@keyframes fadeOut { 0% {opacity:1;} 70% {opacity:1;} 100% {opacity:0; transform:translate(-50%, 20px);} }`;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(btn);
        setTimeout(() => btn.remove(), 2000);
    }
}

export function pasteBranch(targetParentId, mode = 'current') {
    if (!state.clipboard) { alert("Intet at indsætte."); return; }

    const targetNode = state.nodes.find(n => n.id === targetParentId);
    if (!targetNode) return;

    const clipType = state.clipboard.type;
    const isSupplyVV = ['ror_vv', 'tapsted'].includes(clipType);
    const isSupplyKV = ['ror_kv', 'tapsted'].includes(clipType); 
    const isReturn = ['cirkulation_vv', 'valve'].includes(clipType);
    
    const parentType = targetNode.type;
    let allowed = false;

    if (isSupplyVV && (parentType === 'ror_vv' || parentType === 'beholder')) allowed = true;
    if (isSupplyKV && (parentType === 'ror_kv' || parentType === 'vandstik')) allowed = true;
    if (isReturn && (parentType === 'cirkulation_vv' || parentType === 'valve' || parentType === 'beholder')) allowed = true;

    if (clipType === 'tapsted') {
        if (parentType.includes('_vv') || parentType === 'beholder') allowed = true;
        if (parentType.includes('_kv') || parentType === 'vandstik') allowed = true;
    }

    if (!allowed) {
        alert(`Kan ikke indsætte ${clipType} på ${parentType} (System-konflikt).`);
        return;
    }

    const getX = (n) => (n.fx !== undefined && n.fx !== null) ? n.fx : n.x;
    const getY = (n) => (n.fy !== undefined && n.fy !== null) ? n.fy : n.y;
    
    const baseX = getX(targetNode);
    const baseY = getY(targetNode);
    const vecX = (state.clipboard.parentOffsetX !== undefined) ? state.clipboard.parentOffsetX : 60;
    const vecY = (state.clipboard.parentOffsetY !== undefined) ? state.clipboard.parentOffsetY : 60;
    
    const newRootX = baseX + vecX;
    const newRootY = baseY + vecY;

    let targetCardId = "";
    let targetContainerRow, targetContainerTap;

    if (isReturn) {
        targetContainerRow = document.getElementById('returContainerBody');
    } else {
        let isKV = isSupplyKV;
        if (clipType === 'tapsted') isKV = (parentType === 'ror_kv' || parentType === 'vandstik');

        if (mode === 'new' || parentType === 'beholder' || parentType === 'vandstik') {
            if (isKV) {
                addStreng_kv(); 
                const newCard = document.querySelector('#strengeContainerKV .streng-card:last-child');
                targetCardId = newCard.dataset.id;
                newCard.querySelectorAll('.card-body button[aria-label*="Fjern element"]').forEach(b => b.click());
                
                targetContainerRow = newCard.querySelector('.ror-container');
                targetContainerTap = newCard.querySelector('.tapsted-container');
            } else {
                addStreng_vv(); 
                const newCard = document.querySelector('#strengeContainerVV .streng-card:last-child');
                targetCardId = newCard.dataset.id;
                newCard.querySelectorAll('.card-body button[aria-label*="Fjern element"]').forEach(b => b.click());
                
                targetContainerRow = newCard.querySelector('.ror-container');
                targetContainerTap = newCard.querySelector('.tapsted-container');
            }
        } else {
            const pRow = document.querySelector(`tr[data-id="${targetParentId}"]`);
            const card = pRow ? pRow.closest('.streng-card') : null;
            if (!card) return;
            targetCardId = card.dataset.id;
            targetContainerRow = card.querySelector('.ror-container');
            targetContainerTap = card.querySelector('.tapsted-container');
        }
    }

    const buildNode = (nodeData, pId) => {
        let newId;
        const type = nodeData.type;

        if (type === 'cirkulation_vv') {
            state.rC++; newId = `Cirk${state.rC}`;
        } else if (type === 'valve') {
            window.valveCounter = (window.valveCounter || 0) + 1; newId = `V${window.valveCounter}`;
        } else if (type === 'tapsted') {
            state.tC++; newId = `${targetCardId}-T${state.tC}`;
        } else {
            state.tC++; newId = `${targetCardId}-R${state.tC}`;
        }

        const datalistId = `list-${newId}`;
        
        const newFx = newRootX + (nodeData.relX || 0);
        const newFy = newRootY + (nodeData.relY || 0);
        state.nodes.push({ id: newId, type: type, fx: newFx, fy: newFy });

        const tr = document.createElement('tr');
        tr.dataset.id = newId;
        tr.dataset.type = type;
        if (nodeData.isApartment) tr.dataset.isApartment = nodeData.isApartment;

        if (type.includes('ror') || type === 'cirkulation_vv') {
            tr.innerHTML = `
                <td><span class="input-group input-group-sm"><span class="input-group-text id-text">${newId}</span><input type="text" name="${newId}-navn" class="form-control name-input d-none name-text" placeholder="Navn"></span></td>
                <td><select name="${newId}-parent" class="form-select form-select-sm parent"></select></td>
                <td><select name="${newId}-material" class="form-select form-select-sm material"><option value="Rustfri Press 316L">Rustfri Press 316L</option><option value="Kobber">Kobber</option><option value="Pex">Pex</option><option value="Alupex">Alupex</option><option value="PE100">PE100</option><option value="Geberit Mepla">Geberit Mepla</option></select></td>
                <td><select name="${newId}-location" class="form-select form-select-sm location"><option value="heated">Opvarmet</option><option value="unheated">Uopvarmet</option><option value="outside">Udendørs</option></select></td>
                <td><input type="text" name="${newId}-isolering" class="form-control form-control-sm insulation-class" list="insulationClassOptions"></td>
                <td><input type="text" name="${newId}-dim" class="form-control form-control-sm dim-input dim" list="${datalistId}"><datalist id="${datalistId}"></datalist></td>
                <td><input type="number" min="0" name="${newId}-laengde" class="form-control form-control-sm len"></td>
                <td><input type="number" min="0" name="${newId}-zeta" class="form-control form-control-sm fittings"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
            `;
            tr.querySelector('.material').value = nodeData.material;
            tr.querySelector('.location').value = nodeData.location;
            tr.querySelector('.insulation-class').value = nodeData.insulation;
            tr.querySelector('.dim').value = nodeData.dim;
            tr.querySelector('.len').value = nodeData.len;
            tr.querySelector('.fittings').value = nodeData.fittings;
            
            const matSelect = tr.querySelector('.material');
            matSelect.onchange = handleMaterialChange;
            updateDimOptions(matSelect);

            targetContainerRow.appendChild(tr);

        } else if (type === 'tapsted') {
            let opts = ''; 
            Object.keys(ST).forEach(k => {
                const isApt = k.includes('Lejlighed');
                opts += `<option value="${ST[k].qf_hot}" data-is-apartment="${isApt}">${k}</option>`;
            });
            Object.entries(state.customTapsteder).forEach(([k, v]) => {
                opts += `<option value="${v.qf_hot}" data-is-apartment="${v.isApartment}">${k}</option>`;
            });

            tr.innerHTML = `
                <td><span class="input-group input-group-sm"><span class="input-group-text id-text">${newId}</span><input type="text" name="${newId}-navn" class="form-control name-input d-none name-text" placeholder="Navn" onchange="handleInputChange(event)"></span></td>
                <td><select name="${newId}-parent" class="form-select form-select-sm parent"></select></td>
                <td><select name="${newId}-type" class="form-select form-select-sm tapType" onchange="handleInputChange(event)">${opts}</select></td>
                <td><input type="number" name="${newId}-qf" class="form-control form-control-sm qf" min="0" step="0.01" onchange="handleInputChange(event)"></td>
                <td><input type="number" name="${newId}-kote" class="form-control form-control-sm kote allow-negative" onchange="handleInputChange(event)"></td>
                <td class="text-center"><input type="checkbox" name="${newId}-syst" class="form-check-input syst" onchange="handleInputChange(event)"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
            `;
            
            const tapSelect = tr.querySelector('.tapType');
            let found = false;
            for(let i=0; i<tapSelect.options.length; i++) {
                if(tapSelect.options[i].text === nodeData.tapType) {
                    tapSelect.selectedIndex = i; found = true; break;
                }
            }
            if(!found) tapSelect.value = nodeData.qf;

            tr.querySelector('.qf').value = nodeData.qf;
            tr.querySelector('.kote').value = nodeData.kote;
            tr.querySelector('.syst').checked = nodeData.syst;
            
            targetContainerTap.appendChild(tr);

        } else if (type === 'valve') {
             tr.innerHTML = `
                <td><span class="input-group input-group-sm"><span class="input-group-text"><span class="id-text">${newId}</span></span><input type="text" name="${newId}-navn" class="form-control name-input d-none name-text" placeholder="Navn"></span></td>
                <td><select name="${newId}-parent" class="form-select form-select-sm parent"></select></td>
                <td><select name="${newId}-ventil-type" class="form-select form-select-sm valve-type-select"></select></td>
                <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
            `;
            const vSel = tr.querySelector('.valve-type-select');
            let vOpts = '<option value="" disabled>Vælg...</option>';
            for (const tName in VALVE_TYPES) vOpts += `<option value="${tName}">${tName}</option>`;
            vSel.innerHTML = vOpts;
            vSel.value = nodeData.valveType || "";
            vSel.onchange = (e) => tr.dataset.valveType = e.target.value;
            tr.dataset.valveType = nodeData.valveType;

            targetContainerRow.appendChild(tr);
        }

        if (nodeData.name) {
            state.names.set(newId, nodeData.name);
            const nInput = tr.querySelector('.name-text');
            if(nInput) nInput.value = nodeData.name;
        }
        const nameInp = tr.querySelector('.name-text');
        if(nameInp) nameInp.onchange = (e) => state.names.set(newId, e.target.value);

        const pSel = tr.querySelector('.parent');
        const tmpOpt = document.createElement('option');
        tmpOpt.value = pId; tmpOpt.text = pId; 
        pSel.add(tmpOpt); pSel.value = pId;

        if (nodeData.children) nodeData.children.forEach(child => buildNode(child, newId));
    };

    buildNode(state.clipboard, targetParentId);

    updateAllSelects();
    setProjektErÆndret();
}
