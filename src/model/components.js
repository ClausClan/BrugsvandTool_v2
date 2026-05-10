import { METER_TYPES, STANDARD_INSULATION_THICKNESS } from "../config/constants.js";
import { state } from "../data/state.js";

/**
 * Hjælper: Trækker data ud af en tabelrække baseret på typen.
 * Håndterer Rør, Tapsteder, Ventiler og nu også Boostere/Reducere.
 * OPDATERET: Forstår kontekst (KV vs VV) og gemmer parent korrekt som parent_kv eller parent_vv.
 * Håndtere 'water_meter' og gemme 'meterType'.
 */
export function extractComponentData(el) {
    const type = el.dataset.type;
    
    // Bestem kontekst
    const isKVContainer = el.closest('#strengeContainerKV') !== null;
    const isVVContainer = el.closest('#strengeContainerVV') !== null || el.closest('#strengeContainer') !== null;
    
    const base = {
        id: el.dataset.id,
        type: type,
    };
    
    const rawParent = el.querySelector('.parent')?.value || '';

    if (type === 'tapsted') {
        if (isKVContainer) base.parent_kv = rawParent;
        if (isVVContainer) base.parent_vv = rawParent;
        base.parent = rawParent;
    } else {
        base.parent = rawParent;
    }

    // RØR DATA
    if (type.includes('ror') || type === 'cirkulation_vv') {
        Object.assign(base, {
            material: el.querySelector('.material')?.value,
            location: el.querySelector('.location')?.value,
            insulationClassSelection: el.querySelector('.insulation-class')?.value || 'Auto',
            dim: el.querySelector('.dim')?.value,
            len: parseFloat(el.querySelector('.len')?.value) || 0,
            fittings: parseFloat(el.querySelector('.fittings')?.value) || 0
        });
    }
    
    // TAPSTED DATA
    if (type === 'tapsted') {
        const sel = el.querySelector('.tapType');
        Object.assign(base, {
            tapType: sel.options[sel.selectedIndex]?.text || '',
            qf: parseFloat(el.querySelector('.qf')?.value) || 0,
            kote: parseFloat(el.querySelector('.kote')?.value) || 0,
            syst: el.querySelector('.syst')?.checked || false,
            isApartment: el.dataset.isApartment === 'true'
        });
    }
    
    // VENTIL / BOOSTER / REDUCER
    if (type === 'valve') {
        Object.assign(base, { valveType: el.querySelector('.valve-type-select')?.value || el.dataset.valveType });
    }
    if (type === 'booster' || type === 'reducer') {
        Object.assign(base, { pressure_change: parseFloat(el.querySelector('.pressure-change')?.value) || 0 });
    }

    // NYT: VANDMÅLER DATA
    if (type === 'water_meter') {
        const sel = el.querySelector('.meter-type-select');
        Object.assign(base, { 
            // Hent værdien fra dropdownen, eller fallback to dataset
            meterType: sel ? sel.value : (el.dataset.meterType || 'Auto') 
        });
    }
    
    return base;
}

/**
 * Beregner tryktab over vandmåler baseret på flow (qd) og kv-værdi.
 * Håndterer automatisk dimensionering (Auto) hvis ingen specifik måler er valgt.
 */
export function calculateMeterPressureDrop(node) {
    // Sikkerhedsventil: Hvis intet flow, intet tryktab
    if (!node.qd || node.qd <= 0) return 0;

    // 1. Konverter flow fra l/s til m³/h (x 3.6)
    const flowM3h = node.qd * 3.6;
    
    let selectedMeter = null;

    // 2. Bestem målerstørrelse
    if (!node.meterType || node.meterType === 'Auto') {
        // AUTO: Find mindste måler hvor Q3 >= aktuelt flow
        // Vi filtrerer "Auto" fra og sorterer efter q3 størrelse
        const sortedMeters = Object.values(METER_TYPES)
            .filter(m => m.q3 > 0) 
            .sort((a, b) => a.q3 - b.q3);
            
        selectedMeter = sortedMeters.find(m => m.q3 >= flowM3h);

        // Fallback: Hvis flow er større end største måler, vælg den største (og log evt. advarsel i UI senere)
        if (!selectedMeter) selectedMeter = sortedMeters[sortedMeters.length - 1];
        
        // Gem den valgte auto-type på noden til visning i resultater
        // Vi finder nøglen (navnet) baseret på objektet for at kunne vise det i UI
        const meterName = Object.keys(METER_TYPES).find(key => METER_TYPES[key] === selectedMeter);
        node.autoMeterName = meterName; 

    } else {
        selectedMeter = METER_TYPES[node.meterType];
    }

    // 3. Beregn tryktab over måleren
    if (!selectedMeter) return 0;
    
    const kv = selectedMeter.kv;
    if (!kv || kv <= 0) return 0;

    // dp = (Q / kv)² * 100 kPa -> Pa: dp = (Q / kv)² * 100,000 Pa
    const dpPa = Math.pow(flowM3h / kv, 2) * 100000;
    
    return dpPa;
}

// NY HJÆLPEFUNKTION: Returnerer U-værdi formel-konstanter fra DS 452, Tabel 5.1
export function getInsulationClassUl(klasse) {
    // DS 452, Tabel 5.1: Ul = A * Dep + B
    switch (klasse) {
        case 1: return { A: 3.3, B: 0.22 };
        case 2: return { A: 2.6, B: 0.20 };
        case 3: return { A: 2.0, B: 0.18 };
        case 4: return { A: 1.5, B: 0.16 };
        case 5: return { A: 1.1, B: 0.14 };
        case 6: return { A: 0.8, B: 0.12 };
        default: return null; // Klasse 0 eller ugyldig
    }
}

// NY HJÆLPEFUNKTION: Finder den næste standard handelstykkelse
export function findNextStandardThickness(calculated_mm) {
    if (calculated_mm <= 0) return 0;
    
    for (const standardSize of STANDARD_INSULATION_THICKNESS) {
        if (standardSize >= calculated_mm) {
            return standardSize; // Returner den første standardstørrelse, der er >= den beregnede
        }
    }
    // Hvis den beregnede tykkelse er større end den største i listen (f.eks. 120mm)
    return STANDARD_INSULATION_THICKNESS[STANDARD_INSULATION_THICKNESS.length - 1]; // Returner max-tykkelsen (100)
}

export function getDisplayName(id) {
    if (state.useNames && state.names.has(id)) return state.names.get(id);
    return id;
}
