import { ST, ID, RH, VALVE_TYPES, METER_TYPES } from "../config/constants.js";
import { state, setProjektErÆndret } from "../data/state.js";
import { G, getWaterDensity } from "../physics/properties.js";
import { getDP } from "../physics/calculations.js";
import { buildNetworkAndRender, updateDiagram } from "./diagram.js";
import { getDisplayName } from "../model/components.js";

// NY HJÆLPEFUNKTION til at opdatere datalist for dimensioner
export function updateDimOptions(materialSelectElement) {
    const tr = materialSelectElement.closest('tr');
    if (!tr) return;
    
    const datalist = tr.querySelector('datalist');
    const dimInput = tr.querySelector('.dim-input');
    if (!datalist || !dimInput) return;

    const material = materialSelectElement.value;
    const availableDims = Object.keys(ID[material] || {});
    
    // Opdater datalist-optionerne
    datalist.innerHTML = availableDims.map(d => `<option value="${d}"></option>`).join('');
    
    // Tjek om den nuværende dimension er gyldig
    const currentDim = dimInput.value;
    if (!availableDims.includes(currentDim)) {
        // Hvis ikke, vælg den første tilgængelige
        dimInput.value = availableDims[0] || '';
    }
}

// Opdater `handleMaterialChange` til at bruge den nye hjælpefunktion
export function handleMaterialChange(e) {
    updateDimOptions(e.target);
}

export function toggleGlobalOptimizationInputs() {
    const principle = document.getElementById('dimPrinciple').value;
    const globalInputs = document.getElementById('globalInputs');
    if (globalInputs) {
        if (principle === 'global_pressure') {
            globalInputs.style.display = 'block';
        } else {
            globalInputs.style.display = 'none';
        }
    }
}

export function addStreng_vv(startParentId = null) {
    if (typeof state !== 'undefined' && state.sC !== undefined) {
        state.sC++;
    } else {
        if (!window.strengCounter) window.strengCounter = 0;
        window.strengCounter++;
    }
    const counterVal = (typeof state !== 'undefined') ? state.sC : window.strengCounter;
    
    const id = `S${counterVal}`;

    // Hent template
    const template = document.getElementById('vvStrengTemplate');
    if (!template) {
        console.error("KRITISK FEJL: Kunne ikke finde <template id='vvStrengTemplate'>.");
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.card');
    
    // Sæt ID og data
    card.dataset.id = id;
    const idText = card.querySelector('.id-text');
    if (idText) idText.textContent = `VV-Streng ${id}`;
    
    const nameInput = card.querySelector('.name-text');
    if (nameInput && typeof state !== 'undefined') {
        nameInput.onchange = (e) => state.names.set(id, e.target.value);
    }

    // Indsæt i container
    const container = document.getElementById('strengeContainer') || document.getElementById('strengeContainerVV');
    if (!container) return;
    container.appendChild(clone);

    // Find det nye kort og tilføj det første rør
    const newCard = container.querySelector(`[data-id="${id}"]`);
    if (newCard) {
        const btnRor = newCard.querySelector('button[onclick*="addRorSektion"]') || 
                       newCard.querySelector('.btn-outline-secondary');
        
        if (btnRor) {
            // Slet evt. placeholder indhold
            const rorBody = newCard.querySelector('.ror-container');
            if (rorBody) rorBody.innerHTML = '';
            
            // Tilføj KUN rør (Tapsted-linjen er slettet herfra)
            addRorSektion(btnRor, 'ror_vv', startParentId || 'Beholder');
        }
    }
}

export function addStreng_kv(startParentId = null) {
    if (typeof state !== 'undefined' && state.sC !== undefined) {
        state.sC++;
    } else {
        if (!window.strengCounter) window.strengCounter = 0;
        window.strengCounter++;
    }
    const counterVal = (typeof state !== 'undefined') ? state.sC : window.strengCounter;
    
    const id = `S${counterVal}`;

    const template = document.getElementById('kvStrengTemplate');
    if (!template) {
        console.error("KRITISK FEJL: Kunne ikke finde <template id='kvStrengTemplate'>.");
        return;
    }

    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.card');
    
    card.dataset.id = id;
    
    const idText = card.querySelector('.id-text');
    if (idText) idText.textContent = `KV-Streng ${id}`;

    const container = document.getElementById('strengeContainerKV') || document.getElementById('strengeContainer');
    if (!container) return;
    container.appendChild(clone);

    const newCard = container.querySelector(`[data-id="${id}"]`);
    if (newCard) {
        const rorBody = newCard.querySelector('.ror-container-kv') || newCard.querySelector('.ror-container');
        if (rorBody) rorBody.innerHTML = '';

        const btnRor = newCard.querySelector('button[onclick*="addRorSektion"]') || 
                       newCard.querySelector('.btn-outline-secondary');
        
        if (btnRor) {
            // Tilføj KUN rør (Tapsted-linjen er slettet herfra)
            addRorSektion(btnRor, 'ror_kv', startParentId || 'Stikledning');
        }
    }
}

export function addCirkulationRor() {
    // Tæl op på retur-tælleren
    if (typeof state !== 'undefined' && state.rC !== undefined) {
        state.rC++;
    } else {
        if (!window.returCounter) window.returCounter = 0;
        window.returCounter++;
    }
    const counterVal = (typeof state !== 'undefined') ? state.rC : window.returCounter;
    
    const id = `Retur${counterVal}`;
    
    // NYT: Unikt ID til datalisten (Vigtigt for at dropdown virker)
    const datalistId = `list-${id}`;
    
    // 1. Find og klon templaten (vvcirkulationTRTemplate)
    const template = document.getElementById('vvcirkulationTRTemplate');
    if (!template) {
        console.error("Fejl: Kunne ikke finde <template id='vvcirkulationTRTemplate'>.");
        return;
    }
    
    const clone = template.content.cloneNode(true); 
    const tr = clone.querySelector('tr'); 
    
    // 2. Sæt metadata
    tr.dataset.id = id;
    tr.dataset.type = 'cirkulation_vv';
    
    // 3. Forbind Input og Datalist med det unikke ID
    const dimInput = tr.querySelector('.dim-input');
    const datalist = tr.querySelector('datalist');
    
    if (dimInput && datalist) {
        dimInput.setAttribute('list', datalistId);
        datalist.id = datalistId;
    } else {
        console.warn("Advarsel: Mangler .dim-input eller datalist i vvcirkulationTRTemplate");
    }

    // 4. Opdater visuelle tekster
    const idText = tr.querySelector('.id-text');
    if (idText) idText.textContent = id;
    
    const nameInput = tr.querySelector('.name-text');
    if (nameInput) {
        nameInput.onchange = (e) => state.names.set(id, e.target.value);
    }
    
    // 5. Aktiver Materiale-vælger og Datalist
    const materialSelect = tr.querySelector('.material');
    if (materialSelect) {
        materialSelect.onchange = handleMaterialChange;
        // Fyld listen med det samme
        setTimeout(() => updateDimOptions(materialSelect), 0);
    }
    
    // 6. Indsæt i tabellen
    document.getElementById('returContainerBody').appendChild(clone); 
    
    updateAllSelects();
}

/**
 * Opdeler et eksisterende rør i flere segmenter.
 */
export function splitPipe(targetId, segments) {
    const targetRow = document.querySelector(`tr[data-id="${targetId}"]`);
    if (!targetRow) return;
    
    segments = parseInt(segments);
    if (!segments || segments < 2) return;

    // --- TRIN A: GEM GEOMETRI FØR VI ÆNDRER NOGET ---
    const targetNode = state.nodes.find(n => n.id === targetId);
    
    const currentParentIdInput = targetRow.querySelector('.parent');
    const currentParentId = currentParentIdInput.value;
    const parentNode = state.nodes.find(n => n.id === currentParentId);

    let startPos = { x: 0, y: 0 };
    let endPos = { x: 100, y: 100 }; // Fallback
    let canInterpolate = false;

    if (targetNode && parentNode) {
        startPos = { 
            x: (parentNode.fx !== undefined && parentNode.fx !== null) ? parentNode.fx : parentNode.x, 
            y: (parentNode.fy !== undefined && parentNode.fy !== null) ? parentNode.fy : parentNode.y 
        };
        endPos = { 
            x: (targetNode.fx !== undefined && targetNode.fx !== null) ? targetNode.fx : targetNode.x, 
            y: (targetNode.fy !== undefined && targetNode.fy !== null) ? targetNode.fy : targetNode.y 
        };
        canInterpolate = true;
    }

    // --- TRIN B: OPRET OG INDSÆT NYE RØR ---
    const type = targetRow.dataset.type; // 'ror_vv' eller 'ror_kv'
    const totalLength = parseFloat(targetRow.querySelector('.len').value) || 0;
    const totalFittings = parseFloat(targetRow.querySelector('.fittings').value) || 0;
    const material = targetRow.querySelector('.material').value;
    const location = targetRow.querySelector('.location').value;
    const insClass = targetRow.querySelector('.insulation-class').value;
    const dim = targetRow.querySelector('.dim-input').value;

    const segmentLength = totalLength / segments;
    const segmentFittings = totalFittings / segments;

    let previousId = currentParentId;
    const newPipeIds = [];

    for (let i = 0; i < segments - 1; i++) {
        addRorSektion(null, type, previousId);
        
        // Find den senest oprettede række i den rigtige container
        const container = targetRow.closest('tbody');
        const rows = container.querySelectorAll(`tr[data-type="${type}"]`);
        const newRow = rows[rows.length - 1];
        const newId = newRow.dataset.id;
        newPipeIds.push(newId);

        // Kopier værdier
        newRow.querySelector('.len').value = segmentLength.toFixed(2);
        newRow.querySelector('.fittings').value = segmentFittings.toFixed(2);
        newRow.querySelector('.material').value = material;
        newRow.querySelector('.location').value = location;
        newRow.querySelector('.insulation-class').value = insClass;
        newRow.querySelector('.dim-input').value = dim;

        // Trigger opdatering af datalist
        updateDimOptions(newRow.querySelector('.material'));

        previousId = newId;
    }

    // Opdater den oprindelige (sidste) sektion
    targetRow.querySelector('.len').value = segmentLength.toFixed(2);
    targetRow.querySelector('.fittings').value = segmentFittings.toFixed(2);
    currentParentIdInput.value = previousId;

    // --- TRIN C: PLACER NYE NODER LINEÆRT ---
    if (canInterpolate && typeof window.d3 !== 'undefined') {
        const d3 = window.d3;
        const allSegments = segments; // Total antal stykker
        
        newPipeIds.forEach((id, idx) => {
            const fraction = (idx + 1) / allSegments;
            const xVal = startPos.x + (endPos.x - startPos.x) * fraction;
            const yVal = startPos.y + (endPos.y - startPos.y) * fraction;

            // Opret/opdater node med faste koordinater med det samme i state
            const existingNodeIdx = state.nodes.findIndex(n => n.id === id);
            if (existingNodeIdx !== -1) {
                state.nodes[existingNodeIdx].fx = xVal;
                state.nodes[existingNodeIdx].fy = yVal;
            } else {
                state.nodes.push({
                    id: id,
                    type: type,
                    fx: xVal,
                    fy: yVal,
                    displayName: getDisplayName(id)
                });
            }
        });
    }

    updateAllSelects();
    setProjektErÆndret();
}

/**
 * Tilføjer en ny rør-sektion (række) til en given streng.
 */
export function addRorSektion(btn, type, parentId = null) {
    if (typeof state !== 'undefined' && state.tC !== undefined) {
        state.tC++;
    } else {
        if (!window.rorCounter) window.rorCounter = 0;
        window.rorCounter++;
    }
    const counterVal = (typeof state !== 'undefined') ? state.tC : window.rorCounter;

    // 1. FIND CONTAINER
    let container = null;
    let stringPrefix = '';

    if (parentId) {
        const contextRow = document.querySelector(`tr[data-id="${parentId}"]`);
        if (contextRow) {
            container = contextRow.closest('tbody');
            if (parentId.includes('-')) stringPrefix = parentId.split('-')[0];
        }
    }

    if (!container && btn) {
        const card = btn.closest('.card') || btn.closest('.streng-card');
        if (card) {
            const selector = (type === 'ror_kv') ? '.ror-container-kv' : '.ror-container';
            container = card.querySelector(selector) || card.querySelector('.ror-container');
            if (card.dataset.id) stringPrefix = card.dataset.id;
        }
    }

    if (!container) {
        const cards = document.querySelectorAll('.card, .streng-card');
        if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            const selector = (type === 'ror_kv') ? '.ror-container-kv' : '.ror-container';
            container = lastCard.querySelector(selector) || lastCard.querySelector('.ror-container');
            if (lastCard.dataset.id) stringPrefix = lastCard.dataset.id;
        }
    }

    if (!container) {
        console.error("Kunne ikke finde container til nyt rør", {btn, type, parentId});
        return;
    }

    // 2. GENERER ID
    const prefix = (type === 'ror_kv') ? 'K' : 'R';
    const id = stringPrefix ? `${stringPrefix}-${prefix}${counterVal}` : `${prefix}${counterVal}`;
    
    // 3. GENERER UNIK DATALIST ID
    const datalistId = `list-${id}`;

    // 4. OPRET HTML
    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.dataset.type = type;

    tr.innerHTML = `
        <td>
            <span class="input-group input-group-sm">
                <span class="input-group-text id-text">${id}</span>
                <input type="text" name="${id}-navn" class="form-control name-input d-none name-text" placeholder="Navn">
            </span>
        </td>
        <td><select name="${id}-parent" class="form-select form-select-sm parent" title="Forælder"></select></td>
        <td><select name="${id}-material" class="form-select form-select-sm material" title="Materiale">
            <option value="Pex">Pex</option>
            <option value="Alupex">Alupex</option>
            <option value="Kobber">Kobber</option>
            <option value="Rustfri Press 316L">Rustfri Press 316L</option>
            <option value="Rustfri Svejse 316L">Rustfri Svejse 316L</option>
            <option value="PE100">PE100</option>
            <option value="Geberit Mepla">Geberit Mepla</option>
        </select></td>
        <td>
            <select name="${id}-location" class="form-select form-select-sm location" title="Placering">
                <option value="heated" selected>Opvarmet rum</option>
                <option value="unheated">Uopvarmet rum</option>
                <option value="outside">Udendørs</option>
            </select>
        </td>
        <td><input type="text" name="${id}-isolering" class="form-control form-control-sm insulation-class" value="Auto" list="insulationClassOptions"></td>
        <td>
            <input type="text" name="${id}-dim" class="form-control form-control-sm dim-input dim" value="20" list="${datalistId}">
            <datalist id="${datalistId}"></datalist>
        </td>
        <td><input type="number" min="0" name="${id}-laengde" class="form-control form-control-sm len" value="10"></td>
        <td><input type="number" min="0" name="${id}-zeta" class="form-control form-control-sm fittings" value="0"></td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
    `;

    // 5. TILFØJ LOGIK OG INDSÆT
    if (typeof state !== 'undefined') {
        tr.querySelector('.name-text').onchange = (e) => state.names.set(id, e.target.value);
    }
    
    const materialSelect = tr.querySelector('.material');
    materialSelect.onchange = handleMaterialChange;
    
    container.appendChild(tr);

    // 6. SÆT FORÆLDER
    const pSel = tr.querySelector('.parent');
    if (parentId) {
        const opt = document.createElement('option');
        opt.value = parentId;
        opt.text = parentId;
        pSel.add(opt);
        pSel.value = parentId;
    } else {
        const siblings = container.querySelectorAll(`[data-type="${type}"]`);
        if (siblings.length > 1) {
            pSel.value = siblings[siblings.length - 2].dataset.id;
        } else {
            pSel.value = (type === 'ror_kv') ? 'Stikledning' : 'Beholder';
        }
    }

    // 7. AKTIVER DATALISTEN
    updateDimOptions(materialSelect);
    updateAllSelects();
}

export function addTapsted(btn) {
    if (typeof state !== 'undefined' && state.tC !== undefined) {
        state.tC++;
    } else {
        if (!window.rorCounter) window.rorCounter = 0;
        window.rorCounter++;
    }
    const card = btn.closest('.card');
    const sId = card.dataset.id;
    const counterVal = (typeof state !== 'undefined') ? state.tC : window.rorCounter;
    const id = `${sId}-T${counterVal}`;
    const container = card.querySelector('.tapsted-container');
    
    // Opret rækken
    const tr = createRowHTML(id, 'tapsted');
    
    // Sæt standardværdier
    const defaultType = "Lejlighed (standard)";
    
    // Find Hot/Cold værdier for standardtypen
    let defHot = 0, defCold = 0;
    if (ST[defaultType]) {
        defHot = ST[defaultType].qf_hot;
        defCold = ST[defaultType].qf_cold;
    }

    const typeSelect = tr.querySelector('.tapType');
    let foundIdx = Array.from(typeSelect.options).findIndex(opt => opt.text === defaultType);
    if (foundIdx !== -1) typeSelect.selectedIndex = foundIdx;
    
    // Bestem hvilken værdi der skal i feltet baseret på kontekst
    const isKV = card.closest('#strengeContainerKV') !== null;
    tr.querySelector('.qf').value = isKV ? defCold : defHot;
    
    tr.dataset.isApartment = defaultType.includes('Lejlighed') ? 'true' : 'false'; 
    // Navneændringer håndteres nu via onchange="handleInputChange(event)" på selve elementet
    
    container.appendChild(tr);
    
    // Smart Parent
    const rorInStreng = card.querySelectorAll('.ror-container > tr[data-id]');
    const lastRorId = rorInStreng.length > 0 ? rorInStreng[rorInStreng.length-1].dataset.id : '';
    if (lastRorId) {
        tr.dataset.defaultParent = lastRorId;
        tr.querySelector('.parent').value = lastRorId;
    } else {
        // Hvis der ikke er rør i strengen endnu, forbindes der direkte til roden (Beholder eller Vandstik)
        const isKV = card.closest('#strengeContainerKV') !== null;
        tr.querySelector('.parent').value = isKV ? "Vandstik" : "Beholder";
    }

    const newNode = state.nodes.find(n => n.id === id);
    if (newNode) newNode.tapType = defaultType;

    updateAllSelects();
}

export function addValve() {
    if (!window.valveCounter) window.valveCounter = 0;
    window.valveCounter++;
    const id = `V${window.valveCounter}`;
    const clone = document.getElementById('valveTRTemplate').content.cloneNode(true); 
    const tr = clone.querySelector('tr'); 
    tr.dataset.id = id;
    
    const idText = tr.querySelector('.id-text');
    idText.textContent = id;
    
    const valveSelect = tr.querySelector('.valve-type-select');
    let opts = '<option value="" selected disabled>Vælg type...</option>';
    for (const typeName in VALVE_TYPES) {
        opts += `<option value="${typeName}">${typeName}</option>`;
    }
    valveSelect.innerHTML = opts;

    valveSelect.onchange = (e) => {
        const newType = e.target.value;
        tr.dataset.valveType = newType;
        idText.textContent = `${id} (${newType.substring(0, 10)}...)`;
    };

    tr.querySelector('.name-text').onchange = (e) => state.names.set(id, e.target.value);
    document.getElementById('returContainerBody').appendChild(clone); 
    updateAllSelects();
}

export function addComponent(type, parentId = null) {
    if (!window.compCounter) window.compCounter = 0;
    window.compCounter++;

    let idPrefix = 'X';
    if (type === 'booster') idPrefix = 'B';
    else if (type === 'reducer') idPrefix = 'Red';
    else if (type === 'water_meter') idPrefix = 'M';

    const id = `${idPrefix}${window.compCounter}`;
    const tr = createRowHTML(id, type);

    let container;
    
    if (parentId) {
        const pRow = document.querySelector(`tr[data-id="${parentId}"]`);
        if (pRow) {
            container = pRow.closest('tbody');
        }
    }
    
    if (!container) {
        const activeVV = document.querySelector('#strengeContainerVV .streng-card .ror-container');
        if (activeVV) container = activeVV;
        else {
             const activeKV = document.querySelector('#strengeContainerKV .streng-card .ror-container');
             container = activeKV || document.getElementById('returContainerBody');
        }
    }

    if (container) {
        container.appendChild(tr);
    } else {
        console.error("Kunne ikke finde en container til komponenten. Opret venligst en streng først.");
        return;
    }

    updateAllSelects(); 

    if (parentId) {
        const pSel = tr.querySelector('.parent');
        if (pSel) pSel.value = parentId;
    }
    
    setProjektErÆndret();
    
    setTimeout(() => {
         updateAllSelects(); 
    }, 10);
}

export function removeElement(btn) { 
    const elementToRemove = btn.closest('tr[data-id], div[data-id], .streng-card');
    if (!elementToRemove) return;
    
    const id = elementToRemove.dataset.id;
    if (id) {
        state.names.delete(id);
        // Slet ALLE instanser med dette ID (hvis det f.eks. er et spejlet tapsted)
        document.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
            el.remove();
        });
    } else {
        elementToRemove.remove(); 
    }
    
    updateAllSelects(); 
}

export function toggleAutoDim(isAuto) {
    const autoDimInputs = document.getElementById('autoDimInputs');
    if (autoDimInputs) {
        autoDimInputs.style.display = isAuto ? 'flex' : 'none';
    }
    document.querySelectorAll('.dim-input').forEach(i => i.disabled = isAuto);
}

export function updateAllSelects() {
    const vvContainer = document.getElementById('strengeContainerVV') || document.getElementById('strengeContainer');
    const kvContainer = document.getElementById('strengeContainerKV');
    const returParentsList = Array.from(document.querySelectorAll('#returContainerBody > tr[data-id]')); 

    const buildOpts = (container, rootName) => {
        const list = Array.from(container ? container.querySelectorAll('.ror-container > tr[data-id]') : []);
        return `<option value="${rootName}">${rootName}</option>` + 
               list.map(el => {
                   const id = el.dataset.id;
                   const name = state.names.get(id) || id;
                   const suffix = (el.dataset.type === 'booster') ? ' (Booster)' : (el.dataset.type === 'reducer' ? ' (Reduktion)' : '');
                   return `<option value="${id}">${name}${suffix}</option>`;
               }).join('');
    };

    const optionsVV = buildOpts(vvContainer, "Beholder");
    const optionsKV = buildOpts(kvContainer, "Vandstik");
    const optionsReturParent = `<option value="Beholder">Beholder</option>` + returParentsList.map(el => `<option value="${el.dataset.id}">${state.names.get(el.dataset.id)||el.dataset.id}</option>`).join('');

    document.querySelectorAll('.parent').forEach(s => {
        if (s.tagName !== 'SELECT') return; 

        const row = s.closest('tr');
        if (!row) return; 
        
        const myId = row.dataset.id;
        const currentVal = s.value; 
        
        const isKV = row.closest('#strengeContainerKV') || row.closest('.kv-card');
        const isRetur = row.closest('#returContainerBody');
        
        if (isRetur) {
            s.innerHTML = optionsReturParent;
        } else if (isKV) {
            s.innerHTML = optionsKV;
        } else {
            s.innerHTML = optionsVV; 
        }
        
        const selfOpt = s.querySelector(`option[value="${myId}"]`);
        if(selfOpt) selfOpt.remove();
        
        s.value = currentVal;
        
        if (s.value === "") {
            if (isKV) s.value = "Vandstik";
            else s.value = "Beholder";
        }
    });

    document.querySelectorAll('.streng-card').forEach(card => {
        if (card.closest('#strengeContainerKV') || card.classList.contains('kv-card')) return;

        const startSel = card.querySelector('.circ-start');
        const endSel = card.querySelector('.circ-end');
        
        if (startSel && endSel) {
            const savedStart = startSel.value;
            const savedEnd = endSel.value;
            
            const localComps = Array.from(card.querySelectorAll('.ror-container > tr[data-id]'));
            startSel.innerHTML = localComps.map(el => {
                const name = state.names.get(el.dataset.id) || el.dataset.id;
                return `<option value="${el.dataset.id}">${name}</option>`;
            }).join('');
            
            const optionsCircEnd = `<option value="">Ingen</option>` + optionsReturParent.replace('Beholder', 'Beholder (Retur)');
            endSel.innerHTML = optionsCircEnd;
            
            if (savedStart) startSel.value = savedStart;
            if (!startSel.value && localComps.length > 0) startSel.value = localComps[localComps.length - 1].dataset.id;
            endSel.value = savedEnd;
        }
    });

    // 6. Opdater skjulte forældre for tapsteder, så de altid peger på det seneste rør i deres respektive streng
    document.querySelectorAll('.streng-card').forEach(card => {
        const rorInStreng = Array.from(card.querySelectorAll('.ror-container > tr[data-id]'));
        const lastRorId = rorInStreng.length > 0 ? rorInStreng[rorInStreng.length - 1].dataset.id : '';
        const isKV = card.closest('#strengeContainerKV') !== null || card.classList.contains('kv-card');
        const fallbackParent = isKV ? "Vandstik" : "Beholder";
        const defaultParentId = lastRorId || fallbackParent;
        
        card.querySelectorAll('.tapsted-container > tr[data-id]').forEach(tr => {
            const pInput = tr.querySelector('.parent');
            if (pInput) {
                const currentVal = pInput.value;
                const parentRow = currentVal ? document.querySelector(`tr[data-id="${currentVal}"]`) : null;
                const isParentInSameCard = parentRow && parentRow.closest('.card') === card;
                
                // Hvis den nuværende forælder er tom, eller ikke længere findes i denne streng,
                // så opdaterer vi den til det seneste rør i strengen (eller roden)
                if (!currentVal || currentVal === "Beholder" || currentVal === "Vandstik" || !isParentInSameCard) {
                    pInput.value = defaultParentId;
                }
            }
        });
    });

    buildNetworkAndRender();
    updateDiagram();
}

export function toggleDisplayNames(useNames) {
    state.useNames = useNames;
    document.querySelectorAll('.id-text').forEach(el => el.classList.toggle('d-none', useNames));
    document.querySelectorAll('.name-text').forEach(el => el.classList.toggle('d-none', !useNames));
    updateAllSelects();
}

export function addCustomTapsted() {
    const name = document.getElementById('newTapName').value.trim();
    const qf = parseFloat(document.getElementById('newTapQf').value);
    const isApartment = document.getElementById('newTapApartment').checked;
    
    if (!name || isNaN(qf) || qf <= 0) return alert('Ugyldigt navn eller qf.');
    
    state.customTapsteder[name] = { 
        qf_hot: qf, 
        qf_cold: 0, 
        mode: 'hot_only', 
        isApartment: isApartment 
    };
    
    const clone = document.getElementById('customTapstedTemplate').content.cloneNode(true);
    clone.querySelector('.input-group-text').dataset.key = name;
    clone.querySelector('.input-group-text').textContent = name;
    clone.querySelector('.qf').value = qf;
    clone.querySelector('.is-apartment').checked = isApartment;
    
    document.getElementById('customTapsteder').appendChild(clone);
    
    document.getElementById('newTapName').value = '';
    document.getElementById('newTapQf').value = '';
    document.getElementById('newTapApartment').checked = false;
    
    updateTapstedOptions();
    setProjektErÆndret();
}

export function removeCustomTapsted(btn) {
    const key = btn.closest('.input-group').querySelector('.input-group-text').dataset.key;
    delete state.customTapsteder[key];
    btn.closest('.input-group').remove();
    updateTapstedOptions();
    setProjektErÆndret();
}

export function updateTapstedOptions() {
    document.querySelectorAll('.tapType').forEach(select => {
        const currentVal = select.value; 
        const currentText = select.options[select.selectedIndex]?.text; 

        let opts = '';
        
        Object.keys(ST).forEach(k => {
            const isApt = k.includes('Lejlighed');
            opts += `<option value="${ST[k].qf_hot}" data-is-apartment="${isApt}">${k}</option>`;
        });
        
        Object.entries(state.customTapsteder).forEach(([k, v]) => {
            opts += `<option value="${v.qf_hot}" data-is-apartment="${v.isApartment}">${k}</option>`;
        });
        
        select.innerHTML = opts;
        
        let foundIdx = -1;
        for(let i=0; i<select.options.length; i++) {
            if (select.options[i].text === currentText) {
                foundIdx = i;
                break;
            }
        }
        
        if (foundIdx !== -1) {
            select.selectedIndex = foundIdx;
        } else {
            select.value = currentVal;
        }
    });
}

export function createRowHTML(id, type) {
    if (type === 'booster' || type === 'reducer') {
        const clone = document.getElementById('componentTRTemplate').content.cloneNode(true);
        const tr = clone.querySelector('tr');
        tr.dataset.id = id;
        tr.dataset.type = type;
        
        tr.querySelector('.id-text').textContent = id;
        const label = tr.querySelector('.component-label');
        const icon = tr.querySelector('.icon-placeholder');
        const pInput = tr.querySelector('.pressure-change');

        if (type === 'booster') {
            label.value = "Trykforøger (Pumpe)";
            icon.innerHTML = "⚡";
            pInput.style.color = "green";
            tr.style.backgroundColor = "#f0fff4";
        } else {
            label.value = "Trykreduktionsventil";
            icon.innerHTML = "↘️";
            pInput.style.color = "red";
            tr.style.backgroundColor = "#fff5f5";
        }
        
        const nameInp = tr.querySelector('.name-text');
        if (nameInp) nameInp.onchange = (e) => {
            state.names.set(id, e.target.value);
            setProjektErÆndret();
        };
        
        return tr;
    }

    if (type === 'water_meter') {
        const clone = document.getElementById('meterTRTemplate').content.cloneNode(true);
        const tr = clone.querySelector('tr');
        tr.dataset.id = id;
        tr.dataset.type = type;

        tr.querySelector('.id-text').textContent = id;
        
        const typeSel = tr.querySelector('.meter-type-select');
        let opts = '';
        for (const key in METER_TYPES) {
            opts += `<option value="${key}">${key}</option>`;
        }
        typeSel.innerHTML = opts;
        
        typeSel.onchange = (e) => {
            tr.dataset.meterType = e.target.value;
            setProjektErÆndret();
        };

        const nameInp = tr.querySelector('.name-text');
        if (nameInp) nameInp.onchange = (e) => {
            state.names.set(id, e.target.value);
            setProjektErÆndret();
        };

        return tr;
    }

    if (type === 'tapsted') {
        const tr = document.createElement('tr');
        tr.dataset.id = id;
        tr.dataset.type = type;
        
        let tapOpts = ''; 
        Object.keys(ST).forEach(k => {
            const isApt = k.includes('Lejlighed');
            tapOpts += `<option value="${ST[k].qf_hot}" data-is-apartment="${isApt}">${k}</option>`;
        });
        Object.entries(state.customTapsteder).forEach(([k, v]) => {
            tapOpts += `<option value="${v.qf_hot}" data-is-apartment="${v.isApartment}">${k}</option>`;
        });

        tr.innerHTML = `
            <td>
                <span class="input-group input-group-sm">
                    <span class="input-group-text id-text">${id}</span>
                    <input type="text" name="${id}-navn" class="form-control name-input d-none name-text" placeholder="Navn" onchange="handleInputChange(event)">
                </span>
            </td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <select name="${id}-parent-vv" class="form-select form-select-sm parent-vv" title="Tilslutning Varmt Vand" style="border-left: 3px solid #dc3545; display:none;"></select>
                    <select name="${id}-parent-kv" class="form-select form-select-sm parent-kv" title="Tilslutning Koldt Vand" style="border-left: 3px solid #0d6efd; display:none;"></select>
                    <input type="hidden" name="${id}-parent" class="parent"> 
                </div>
            </td>
            <td><select name="${id}-type" class="form-select form-select-sm tapType" onchange="handleInputChange(event)">${tapOpts}</select></td>
            <td><input type="number" name="${id}-qf" class="form-control form-control-sm qf" step="0.01" onchange="handleInputChange(event)"></td>
            <td><input type="number" name="${id}-kote" class="form-control form-control-sm kote allow-negative" onchange="handleInputChange(event)"></td>
            <td class="text-center"><input type="checkbox" name="${id}-syst" class="form-check-input syst" onchange="handleInputChange(event)"></td>
            <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
        `;
        
        // Navneændringer håndteres nu via onchange="handleInputChange(event)" på selve elementet

        return tr;
    } 
    
    if (type === 'valve') {
        const clone = document.getElementById('valveTRTemplate').content.cloneNode(true);
        const tr = clone.querySelector('tr');
        tr.dataset.id = id;
        tr.dataset.type = type;
        
        const vSel = tr.querySelector('.valve-type-select');
        let vOpts = '<option value="" disabled>Vælg...</option>';
        for (const tName in VALVE_TYPES) vOpts += `<option value="${tName}">${tName}</option>`;
        vSel.innerHTML = vOpts;
        vSel.onchange = (e) => {
            tr.dataset.valveType = e.target.value;
            setProjektErÆndret();
        };

        const nameInp = tr.querySelector('.name-text');
        if (nameInp) nameInp.onchange = (e) => {
            state.names.set(id, e.target.value);
            setProjektErÆndret();
        };
        
        return tr;
    }

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.dataset.type = type;
    const listId = `list-${id}`;
    
    let matOpts = '<option value="Kobber">Kobber</option><option value="Rustfri Press 316L">Rustfri Press 316L</option><option value="Pex">Pex</option><option value="Alupex">Alupex</option><option value="PE100">PE100</option><option value="Geberit Mepla">Geberit Mepla</option>';
    if(type !== 'cirkulation_vv') matOpts += '<option value="Rustfri Svejse 316L">Rustfri Svejse 316L</option>';

    tr.innerHTML = `
        <td><span class="input-group input-group-sm"><span class="input-group-text id-text">${id}</span><input type="text" name="${id}-navn" class="form-control name-input d-none name-text" placeholder="Navn"></span></td>
        <td><select name="${id}-parent" class="form-select form-select-sm parent"></select></td>
        <td><select name="${id}-material" class="form-select form-select-sm material">${matOpts}</select></td>
        <td><select name="${id}-location" class="form-select form-select-sm location"><option value="heated">Opvarmet</option><option value="unheated">Uopvarmet</option><option value="outside">Udendørs</option></select></td>
        <td><input type="text" name="${id}-isolering" class="form-control form-control-sm insulation-class" list="insulationClassOptions"></td>
        <td><input type="text" name="${id}-dim" class="form-control form-control-sm dim-input dim" list="${listId}"><datalist id="${listId}"></datalist></td>
        <td><input type="number" min="0" name="${id}-laengde" class="form-control form-control-sm len"></td>
        <td><input type="number" min="0" name="${id}-zeta" class="form-control form-control-sm fittings"></td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="removeElement(this)">&times;</button></td>
    `;
    
    const nameInp = tr.querySelector('.name-text');
    if (nameInp) nameInp.onchange = (e) => {
        state.names.set(id, e.target.value);
        setProjektErÆndret();
    };

    return tr;
}

export function displayResults(model, config) {
    const advarslerDiv = document.getElementById('advarsler');
    if (advarslerDiv && !advarslerDiv.querySelector('.alert-danger')) advarslerDiv.innerHTML = '';
    
    const startTryk = model.vv_start_pressure; 
    const resttryk = startTryk - model.max_dp_tapning;
    
    if (advarslerDiv) {
        if (resttryk < config.min_tap_tryk) {
            advarslerDiv.innerHTML += `<p class="alert alert-danger">ADVARSEL: Tryk ved fjerneste VV-tapsted (${(resttryk / 1000).toFixed(0)} kPa) is for lavt (Krav: ${(config.min_tap_tryk/1000).toFixed(0)} kPa).</p>`;
        } else {
            advarslerDiv.innerHTML += `<p class="alert alert-success">OK: Tryk ved fjerneste VV-tapsted er tilstrækkeligt (${(resttryk / 1000).toFixed(0)} kPa).</p>`;
        }
    }

    if (config.isAuto) {
        model.nodes.forEach(n => {
            if ((n.type.includes('ror') || n.type === 'cirkulation_vv') && n.nom_dim) {
                const el = document.querySelector(`tr[data-id="${n.id}"]`);
                if (el) {
                    const dimInput = el.querySelector('.dim');
                    if (dimInput) dimInput.value = n.nom_dim;
                }
            }
        });
    }

    const toKPa = (val) => (val / 1000).toFixed(2);
	
    const booster = Array.from(model.nodes.values()).find(n => n.type === 'booster');
    let boosterHtml = '';
    let boosterPressurePa = 0;
    
    if (booster) {
        const bFlow = booster.qd || 0; 
        const bPressKPa = booster.pressure_change || 0; 
        boosterPressurePa = bPressKPa * 1000;
        
        boosterHtml = `
            <tr class="table-success"><td colspan="2"><strong>Trykforøger (Booster)</strong></td></tr>
            <tr><td>Dim. Flow</td><td>${bFlow.toFixed(3)} l/s</td></tr>
            <tr><td>Løftehøjde</td><td>+${bPressKPa.toFixed(2)} kPa</td></tr>
        `;
    }

    let kvHtml = '';
    let critKV = null;
    let minPKV = Infinity;
    
    model.nodes.forEach(n => {
        if(n.type === 'tapsted' && n.P_absolute_KV !== undefined && n.P_absolute_KV < minPKV) {
            minPKV = n.P_absolute_KV;
            critKV = n;
        }
    });

    if (critKV) {
        const rhoKV = 999.7; 
        const hKV = (critKV.kote || 0) - (config.forsyningens_kote || 0);
        const dp_geo_kv = rhoKV * G * hKV;
        
        const totalStartPressure = config.pln + boosterPressurePa;
        const dp_friction_kv = totalStartPressure - minPKV - dp_geo_kv;

        kvHtml = `
            <tr class="table-info"><td colspan="2"><strong>Koldt Vand (Kritisk Streng)</strong></td></tr>
            <tr><td>Tab (Friktion & Fittings)</td><td>-${toKPa(dp_friction_kv)} kPa</td></tr>
            <tr><td>Tab (Løftehøjde)</td><td>-${toKPa(dp_geo_kv)} kPa</td></tr>
            <tr><td><strong>Resttryk v/ Tapsted</strong></td><td><strong>${toKPa(minPKV)} kPa</strong></td></tr>
        `;
    }

    let dp_friction_vv = model.max_dp_tapning;
    let dp_geo_vv = 0;
    const rho_supply = getWaterDensity(config.T_v);
    
    if (model.criticalPath && model.criticalPath.size > 0) {
        const criticalPathArray = Array.from(model.criticalPath);
        const endTapstedId = criticalPathArray[criticalPathArray.length - 1];
        const endTapstedNode = model.nodes.get(endTapstedId);

        if (endTapstedNode && endTapstedNode.type === 'tapsted') {
            const h = (endTapstedNode.kote || 0) - (config.forsyningens_kote || 0);
            dp_geo_vv = rho_supply * G * h;
            dp_friction_vv = model.max_dp_tapning - dp_geo_vv;
        }
    }
    
    let vvStartHtml = '';
    if (state.beholderConnectionId) {
        vvStartHtml = `<tr><td class="ps-3 text-muted"><small>Tab i KV frem til Beholder</small></td><td class="text-muted"><small>-${toKPa(model.kv_pressure_loss_to_beholder || 0)} kPa</small></td></tr>`;
    }

    const total_circ_flow_lh = model.loops.reduce((s, l) => s + (l.circ_flow || 0), 0) * 3600;
    const meanTemp = config.T_v - (config.dT / 2);
    const rho_circ = getWaterDensity(meanTemp);

    const summaryTableBody = document.getElementById('summaryTableBody');
    if (summaryTableBody) {
        summaryTableBody.innerHTML = `
            <tr class="table-light"><td colspan="2"><strong>Forsyning</strong></td></tr>
            <tr><td>Forsyningstryk (P0)</td><td>${toKPa(config.pln)} kPa</td></tr>
            ${boosterHtml}

            ${kvHtml}

            <tr class="table-danger"><td colspan="2"><strong>Varmt Vand (Kritisk Streng)</strong></td></tr>
            ${vvStartHtml}
            <tr><td>Tab (Friktion & Fittings)</td><td>-${toKPa(dp_friction_vv)} kPa</td></tr>
            <tr><td>Tab (Løftehøjde)</td><td>-${toKPa(dp_geo_vv)} kPa</td></tr>
            
            <tr class="table-primary">
                <td><strong>Resttryk v/ Tapsted</strong></td>
                <td><strong>${toKPa(resttryk)} kPa</strong></td>
            </tr>
            
            <tr class="table-warning"><td colspan="2"><strong>Cirkulationspumpe</strong></td></tr>
            <tr><td>Pumpeflow (Total)</td><td><b>${total_circ_flow_lh.toFixed(1)} l/h</b></td></tr>
            <tr><td>Pumpetryk (Løftehøjde)</td><td><b>${toKPa(model.max_dp_circ)} kPa</b> (${(model.max_dp_circ / (rho_circ * G)).toFixed(2)} mVs)</td></tr>
        `;
    }

    const metodeA_div = document.getElementById('metodeA_content');
    if (metodeA_div) {
        if (model.N > 0) {
            metodeA_div.innerHTML = `
                <p>Systemet indeholder <b>${model.N}</b> lejligheder. For et system uden beholder er det beregnede spidslastbehov til veksleren <b>${model.Pmax_veksler.toFixed(1)} kW</b>.</p>
                <p>Brug P-V kurven nedenfor til interaktivt at finde en passende kombination af effekt og volumen.</p>
                <div class="row g-3">
                    <div class="col-md-6"><label class="form-label">Indtast tilgængelig effekt<div class="input-group"><input name="userEffekt" type="number" step="0.1" class="form-control" placeholder="f.eks. 35"><span class="input-group-text">kW</span></div></label></div>
                    <div class="col-md-6"><label class="form-label">Indtast ønsket volumen<div class="input-group"><input name="userVolumen" type="number" class="form-control" placeholder="f.eks. 200"><span class="input-group-text">L</span></div></label></div>
                </div>`;
        } else {
            metodeA_div.innerHTML = `<p class="text-muted">Metode A kræver, at du tilføjer tapsteder af typen "Lejlighed".</p>`;
        }
    }

    updateRorTable(model, config); 
    updateCircTable(model); 
    updateComponentTable(model); 

    model.nodes.forEach(n => {
        if (n.type === 'water_meter') {
            const el = document.querySelector(`tr[data-id="${n.id}"]`);
            if (el) {
                const dpInput = el.querySelector('.meter-dp-display');
                const infoSpan = el.querySelector('.meter-info-display');
                if (dpInput) dpInput.value = (n.dp_tap || 0).toFixed(0);
                if (infoSpan) {
                    if (n.autoMeterName) infoSpan.textContent = `Auto-valgt: ${n.autoMeterName}`;
                    else infoSpan.textContent = `Kv: ${n.meterKv || '-'}`;
                }
            }
        }
    });
}

export function updateRorTable(model, config) {
    const rørTable = document.getElementById('rørResultTable');
    if (!rørTable) return;

    const thead = rørTable.querySelector('thead');
    if (thead) {
        thead.innerHTML = `<tr>
            <th style="width: 20%">ID/Navn</th>
            <th style="width: 10%">Type</th>
            <th style="width: 10%">Dim.</th>
            <th style="width: 10%">Flow [l/s]</th>
            <th style="width: 10%">Hast. [m/s]</th>
            <th style="width: 10%">Rørfrik. [Pa/m]</th>
            <th style="width: 10%">Total [Pa]</th>
            <th style="width: 10%">Isol. [mm]</th>
            <th style="width: 10%">Varmetab [W/m]</th>
        </tr>`;
    }

    let htmlVV = '';
    let htmlKV = '';
    const meanTemp = config.T_v - (config.dT / 2);

    const createRow = (n) => {
        const flow_ls = n.type.includes('ror') ? (n.qd || 0) : (model.circFlows.get(n.id) || 0);
        
        if (!ID[n.material] || !ID[n.material][n.nom_dim]) return '';

        const d_i = ID[n.material][n.nom_dim] / 1000;
        const area = Math.PI * (d_i / 2) ** 2;
        const velocity = n.L > 0 && area > 0 ? (flow_ls / 1000) / area : 0;
        
        let temp = config.T_v; 
        if (n.type === 'ror_kv') temp = 10; 
        else if (n.type === 'cirkulation_vv') temp = meanTemp;

        const dp_pure = getDP(flow_ls, d_i, RH[n.material]/1000, n.L, 0, 0, temp);
        const dp_pr_meter = (n.L > 0) ? dp_pure / n.L : 0;
        const dp_total_calc = getDP(flow_ls, d_i, RH[n.material]/1000, n.L, n.zeta_sum, config.fittings_pct, temp);
        
        const heatLossPerMeter = (n.L > 0) ? (n.q_tab || 0) / n.L : 0;

        let warning = '';
        const maxV = n.type.includes('cirkulation') ? config.max_v_c : config.max_v_f;
        if (velocity > maxV) warning = ' ⚠️';
        if (dp_pr_meter > config.max_dp_m) warning += ' ⚠️';

        return `<tr onmouseenter="highlightComponent('${n.id}')" onmouseleave="clearHighlight()">
            <td><b>${getDisplayName(n.id)}</b></td>
            <td>${n.type}</td>
            <td>${n.nom_dim} mm</td>
            <td>${flow_ls.toFixed(3)}</td>
            <td>${velocity.toFixed(2)}${warning}</td>
            <td>${dp_pr_meter.toFixed(0)}</td>
            <td>${dp_total_calc.toFixed(0)}</td>
            <td>${n.insulationThickness || 0}</td>
            <td>${heatLossPerMeter.toFixed(1)}</td>
        </tr>`;
    };

    const nodes = Array.from(model.nodes.values());
    nodes.sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true, sensitivity: 'base'}));

    nodes.forEach(n => {
        if (n.type === 'ror_vv' || n.type === 'cirkulation_vv') {
            if (n.nom_dim) htmlVV += createRow(n);
        } else if (n.type === 'ror_kv') {
            if (n.nom_dim) htmlKV += createRow(n);
        }
    });

    let finalHtml = '';
    
    if (htmlVV) {
        finalHtml += `<tr class="table-light"><td colspan="9"><strong>Varmt Vand & Cirkulation</strong></td></tr>${htmlVV}`;
    }
    
    if (htmlKV) {
        finalHtml += `<tr class="table-light"><td colspan="9"><strong>Koldt Vand</strong></td></tr>${htmlKV}`;
    }

    const tbody = rørTable.querySelector('tbody');
    if (tbody) tbody.innerHTML = finalHtml || '<tr><td colspan="9" class="text-center">Ingen rør beregnet endnu</td></tr>';
}

export function updateCircTable(model) {
    const cirkTable = document.getElementById('cirkResultTable');
    if (!cirkTable) return;

    cirkTable.querySelector('thead').innerHTML = `
        <tr>
            <th>Streng</th>
            <th>Valgt Ventil</th>
            <th>VVS Nr.</th>
            <th>Varmetab [W]</th>
            <th>Flow [l/h]</th>
            <th>Tryktab Total [Pa]</th>
            <th>Ventil Δp [Pa]</th>
            <th>Indstilling</th>
        </tr>`;
    
    let cirkTbody = '';
    let grandTotalFlowLH = 0;

    model.loops.forEach(l => {
        const flowLH = (l.circ_flow || 0) * 3600;
        grandTotalFlowLH += flowLH; 
        
        let valveText = '-';
        let vvsNr = '-';
        let setting = '-';
        let valveDpDisplay = 0;
        let dpLabel = "";
        
        if (l.selectedValve) {
            valveText = l.selectedValve.valveName || l.selectedValve.freseNr || '-'; 
            vvsNr = l.selectedValve.vvsNr || '-';

            if (l.selectedValve.isStatic) {
                const requiredValveDrop = Math.max(0, model.max_dp_circ - (l.dp_circ_total - l.selectedValve.minDp));
                valveDpDisplay = requiredValveDrop;
                
                const dp_kPa = requiredValveDrop / 1000;
                if (dp_kPa > 0) {
                    const kv_req = 36 * l.circ_flow / Math.sqrt(dp_kPa);
                    setting = `Kv: ${kv_req.toFixed(2)}`;
                } else {
                    setting = "Åben";
                }
                dpLabel = "(Indreg.)";
            } else {
                valveDpDisplay = l.selectedValve.minDp || 0;
                setting = "Auto";
                dpLabel = "(Min.)";
            }
        } else {
              valveDpDisplay = Math.max(0, model.max_dp_circ - l.dp_circ_total);
              if (valveDpDisplay > 0) dpLabel = "(Mangler)";
        }

        cirkTbody += `<tr data-loop-id="${l.id}" onmouseenter="highlightLoop('${l.id}')" onmouseleave="clearHighlight()">
                      <td><b>${getDisplayName(l.id)}</b></td>
                      <td>${valveText}</td>
                      <td><small class="text-muted">${vvsNr}</small></td>
                      <td>${(l.q_tab_tot || 0).toFixed(1)}</td>
                      <td>${flowLH.toFixed(1)}</td>
                      <td>${(l.dp_circ_total || 0).toFixed(0)}</td>
                      <td>
                        <b>${valveDpDisplay.toFixed(0)}</b> <small class="text-muted">${dpLabel}</small>
                      </td>
                      <td>${setting}</td>
                    </tr>`;
    });

    const totalCircFlowM3H = grandTotalFlowLH / 1000;
    cirkTbody += `
        <tr class="table-secondary" style="border-top: 2px solid #dee2e6;">
            <td colspan="4" class="text-end"><b>Samlet Cirkulation:</b></td>
            <td colspan="4"><b>${grandTotalFlowLH.toFixed(1)} l/h</b> <small class="text-muted">(${totalCircFlowM3H.toFixed(3)} m³/h)</small></td>
        </tr>`;

    cirkTable.querySelector('tbody').innerHTML = cirkTbody;
}

export function updateComponentTable(model) {
    let container = document.getElementById('componentResults');
    if (!container) {
        const parent = document.getElementById('cirkulation'); 
        if (!parent) return; 
        container = document.createElement('div');
        container.id = 'componentResults';
        container.className = 'mt-4';
        parent.appendChild(container);
    }

    const activeComponents = [];
    const meters = [];

    model.nodes.forEach(n => {
        if (n.type === 'booster' || n.type === 'reducer') {
            activeComponents.push(n);
        }
        if (n.type === 'water_meter') {
            meters.push(n);
        }
    });

    if (activeComponents.length === 0 && meters.length === 0) {
        container.innerHTML = '<p class="text-muted fst-italic mt-3">Ingen aktive komponenter eller målere fundet.</p>';
        return;
    }

    let html = '';

    if (activeComponents.length > 0) {
        html += `<h5>Aktive Komponenter</h5>
        <table class="table table-sm table-bordered table-hover mb-4">
            <thead class="table-light">
                <tr>
                    <th>ID/Navn</th>
                    <th>Type</th>
                    <th>Indstillet ΔP [kPa]</th>
                    <th>Effektiv ΔP [Pa]</th>
                    <th>Flow [l/s]</th>
                </tr>
            </thead>
            <tbody>`;

        activeComponents.forEach(n => {
            const pChangeKPa = n.pressure_change || 0;
            const pChangePa = pChangeKPa * 1000;
            const effect = (n.type === 'booster') ? `+${pChangePa.toFixed(0)}` : `${pChangePa.toFixed(0)}`; 
            const flow = (model.circFlows && model.circFlows.get(n.id)) || n.qd || 0;
            
            html += `<tr>
                <td>${getDisplayName(n.id)}</td>
                <td>${n.type === 'booster' ? 'Trykforøger' : 'Reduktionsventil'}</td>
                <td>${pChangeKPa}</td>
                <td><strong>${effect}</strong></td>
                <td>${flow.toFixed(3)}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    if (meters.length > 0) {
        html += `<h5>Målere</h5>
        <table class="table table-sm table-bordered table-hover">
            <thead class="table-light">
                <tr>
                    <th>ID / Placering</th>
                    <th>Type / Model</th>
                    <th>Dim.</th>
                    <th>Kv-værdi</th>
                    <th>Flow [l/s]</th>
                    <th>Tab [kPa]</th>
                </tr>
            </thead>
            <tbody>`;

        meters.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

        meters.forEach((m) => {
            let displayName = getDisplayName(m.id);
            
            const typeDesc = m.meterType || (m.autoMeterName ? `Auto: ${m.autoMeterName}` : 'Ukendt Måler');
            const dim = m.nom_dim ? `${m.nom_dim} mm` : '-';
            const kv = m.meterKv ? m.meterKv.toFixed(1) : (m.kv_value ? m.kv_value.toFixed(1) : '-');
            
            let flow = m.qd || 0;
            if (model.circFlows && model.circFlows.has(m.id)) {
                flow = model.circFlows.get(m.id);
            }

            const dpPa = (m.dp_tap || 0) + (m.dp_circ || 0);
            const dpKPa = dpPa / 1000;

            html += `<tr>
                <td><strong>${displayName}</strong></td>
                <td>${typeDesc}</td>
                <td>${dim}</td>
                <td>${kv}</td>
                <td>${flow.toFixed(3)}</td>
                <td><strong>${dpKPa.toFixed(2)}</strong></td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    container.innerHTML = html;
}

export function toggleBeholderMetode() {
    document.querySelectorAll('.beholder-metode').forEach(div => div.style.display = 'none');
    
    const valgElement = document.querySelector('input[name="beholderMetode"]:checked');
    if (!valgElement) return;
    const valg = valgElement.value;
    
    const inputDiv = document.getElementById(`metode${valg}_inputs`);
    if (inputDiv) inputDiv.style.display = 'block';

    const warningDiv = document.getElementById('metodeA_warning');
    if (valg === 'A' && warningDiv) {
        const apartmentCount = document.querySelectorAll('.tapsted-container > tr[data-is-apartment="true"]').length;
        if (apartmentCount === 0) {
            warningDiv.classList.remove('d-none'); 
        } else {
            warningDiv.classList.add('d-none'); 
        }
    } else if (warningDiv) {
        warningDiv.classList.add('d-none'); 
    }
}

export function addTappemonsterRow() {
    const tbody = document.getElementById('metodeC_tablebody');
    if (tbody) {
        const rowIdx = tbody.children.length + 1;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><input type="number" step="0.01" name="tap-flow-${rowIdx}" class="form-control form-control-sm" value="0.15"></td>
                <td><input type="number" name="tap-varighed-${rowIdx}" class="form-control form-control-sm" value="5"></td>
                <td><input type="number" name="tap-interval-${rowIdx}" class="form-control form-control-sm" value="5"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove()">&times;</button></td>
            </tr>
        `);
    }
}
