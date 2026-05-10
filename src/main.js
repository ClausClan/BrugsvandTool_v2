import { ST, ID, VALVE_TYPES, METER_TYPES } from "./config/constants.js";
import { state, projektErÆndret, setProjektErÆndret } from "./data/state.js";
import { extractComponentData, getDisplayName } from "./model/components.js";
import { beregnStandard } from "./model/solver.js";
import {
    initDiagram,
    updateDiagram,
    updateDiagramStyles,
    updateLegend,
    zoomToFit,
    buildNetworkAndRender,
    applyColorGradient
} from "./ui/diagram.js";
import {
    addStreng_vv,
    addStreng_kv,
    addRorSektion,
    addTapsted,
    addCirkulationRor,
    addValve,
    addComponent,
    removeElement,
    updateAllSelects,
    toggleAutoDim,
    toggleBeholderMetode,
    displayResults,
    toggleDisplayNames,
    addCustomTapsted,
    removeCustomTapsted,
    handleMaterialChange,
    updateDimOptions,
    toggleGlobalOptimizationInputs
} from "./ui/dom.js";
import {
    handleInputChange,
    handleNodeClick,
    handleNodeRightClick,
    showEditModal,
    saveEditModal,
    toggleSidebar,
    highlightComponent,
    clearHighlight,
    highlightLoop
} from "./ui/events.js";
import {
    getDataForSave,
    exportProject,
    autoSaveProject,
    importProject,
    loadProjectData,
    exportDetailedResults,
    renumberAndSortProject,
    checkAndAutoSave
} from "./utils/export.js";

// Vigtig fysisk konstant til varmekapacitet i beholderberegninger
const C = 4.186; // kJ/(kg*K) eller W*s/(g*K)

document.addEventListener('DOMContentLoaded', () => {
    // 1. INITIALISER DIAGRAMMET FØRST (Så det er klar til data)
    initDiagram();

    // 2. Initialiser Popovers
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl, {
        trigger: 'hover focus'
    }));

    // 3. TJEK FOR AUTO-GEM
    let autoSaveData = null;
    try {
        autoSaveData = localStorage.getItem('varmtBrugsvandAutoSave');
    } catch (err) {
        console.error("Kunne ikke læse fra localStorage:", err);
    }

    let projectLoaded = false;

    if (autoSaveData) {
        if (confirm("Vi fandt et auto-gemt projekt. Vil du gendanne det?\n\n[OK] = Gendan\n[Annuller] = Start et nyt projekt (sletter auto-gem)")) {
            try {
                const data = JSON.parse(autoSaveData);
                loadProjectData(data); // Genskaber alt tilstand og DOM
                projectLoaded = true;
                console.log("Auto-gemt projekt er gendannet.");
            } catch (err) {
                alert("Fejl: Kunne ikke gendanne auto-gemt projekt. Starter et nyt projekt.");
                localStorage.removeItem('varmtBrugsvandAutoSave');
            }
        } else {
            localStorage.removeItem('varmtBrugsvandAutoSave');
            console.log("Auto-gem er slettet af brugeren.");
        }
    }

    // 4. HVIS INTET PROJEKT BLEV INDLÆST -> OPRET STANDARD PROJEKT
    if (!projectLoaded) {
        addStreng_vv();
        const btnRor = document.querySelector('.streng-card .btn-outline-secondary:last-of-type');
        addRorSektion(btnRor, 'ror_vv');
        addTapsted(btnRor);
        addCirkulationRor();

        // Sæt standard-forbindelser
        updateAllSelects(); // Opdater lister først

        const startSelect = document.querySelector('.circ-start');
        const endSelect = document.querySelector('.circ-end');
        if (startSelect && startSelect.options.length > 0) startSelect.value = startSelect.options[0].value;
        if (endSelect && endSelect.options.length > 0) endSelect.value = endSelect.options[0].value;

        // Opdater igen for at gemme forbindelserne
        updateAllSelects();
    }

    toggleAutoDim(document.getElementById('autoDimToggle')?.checked || false);

    // === TRIN 3: OPSÆTNING OF AUTO-GEM TRIGGERS ===

    // 1. Generelle lyttere (Event Delegation)
    const accordion = document.getElementById('inputAccordion');
    if (accordion) {
        accordion.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') setProjektErÆndret();
        });
        accordion.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') setProjektErÆndret();
        });
        accordion.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && (e.target.textContent.includes('+') || e.target.textContent.includes('×'))) {
                setProjektErÆndret();
            }
        });
    }

    // 2. Interval-Gem (5 minutter)
    setInterval(checkAndAutoSave, 300000);

    // 3. Panik-Gem (ved luk/reload)
    window.addEventListener('beforeunload', (event) => {
        if (window.projektErÆndret) {
            console.log("Gemmer ulagrede ændringer før siden lukkes...");
            autoSaveProject();
            event.preventDefault();
            event.returnValue = "Du har ulagrede ændringer. Er du sikker på, at du vil forlade siden?";
            return event.returnValue;
        }
    });
});

// Orchestration & Calculation Config Getter
export function getGlobalConfig() {
    const getVal = (id, def) => {
        const el = document.getElementById(id);
        const val = parseFloat(el ? el.value : def);
        return isNaN(val) ? def : val;
    };

    return {
        projectName: document.getElementById('projectName')?.value || '',
        pln: getVal('pln', 400) * 1000,
        min_tap_tryk: getVal('min_tap_tryk', 150) * 1000,
        T_k: getVal('T_k', 10),
        T_v: getVal('T_v', 55),
        T_omg_inde: getVal('T_omg', 20),
        T_omg_ude: getVal('T_omg_ude', 5),
        dT: getVal('dT', 5),
        lambda: getVal('lambda', 0.037),

        fittings_pct: getVal('fittings_pct', 25),
        heat_loss_pct: getVal('heat_loss_pct', 20),
        isAuto: document.getElementById('autoDimToggle')?.checked || false,
        dimPrinciple: document.getElementById('dimPrinciple')?.value || 'combined',
        max_dp_m: getVal('max_dp_m', 150),
        max_v_f: getVal('max_v_f', 1.5),
        min_v_f: getVal('min_v_f', 0.5),
        max_v_c: getVal('max_v_c', 1.5),
        min_v_c: getVal('min_v_c', 0.2),
        forsyningens_kote: getVal('forsyningens_kote', 0)
    };
}

// Input valideringsfunktion
function validateInputs(config) {
    let valid = true;
    const advarslerDiv = document.getElementById('advarsler');
    advarslerDiv.innerHTML = ''; // Nulstil advarsler

    // Tjek grundlæggende systemopsætning
    if (config.pln < config.min_tap_tryk) {
        advarslerDiv.innerHTML += `<p class="alert alert-danger">Fejl: Forsyningstryk (${config.pln / 1000} kPa) skal være større end det mindste tilladte tapstryk (${config.min_tap_tryk / 1000} kPa).</p>`;
        valid = false;
    }
    if (config.T_v <= config.T_k) {
        advarslerDiv.innerHTML += `<p class="alert alert-danger">Fejl: Varmtvandstemperatur (${config.T_v}°C) skal være større end koldtvandstemperatur (${config.T_k}°C).</p>`;
        valid = false;
    }

    // Valider tabelværdier
    document.querySelectorAll('.len-input').forEach(inp => {
        if (!inp.disabled) {
            const val = parseFloat(inp.value);
            if (isNaN(val) || val < 0) {
                const rowId = inp.closest('[data-id]').dataset.id;
                advarslerDiv.innerHTML += `<p class="alert alert-danger">Fejl: Længde for ${rowId} skal være et positivt tal.</p>`;
                valid = false;
            }
        }
    });
    document.querySelectorAll('.dim-input').forEach(inp => {
        if (!inp.disabled) {
            const material = inp.closest('[data-id]').querySelector('.material').value;
            const dim = parseFloat(inp.value);
            if (!ID[material][dim]) {
                const rowId = inp.closest('[data-id]').dataset.id;
                advarslerDiv.innerHTML += `<p class="alert alert-danger">Fejl: Dimension ${dim} mm er ugyldig for ${material}.</p>`;
                valid = false;
            }
        }
    });
    return valid;
}

// HOVEDBEREGNING PROCESS
export function beregn() {
    const config = getGlobalConfig();

    if (!validateInputs(config)) return;

    const model = beregnStandard(config);

    if (model) {
        finishCalculation(model, config);
    }
}

function finishCalculation(model, config) {
    if (!model) {
        document.getElementById('advarsler').innerHTML = `<p class="alert alert-danger">Beregningen fejlede.</p>`;
        return;
    }

    // 1. Gem den senest beregnede model i state
    state.lastModel = model;
    state.lastConfig = config;

    // 2. Tegn diagrammet opdateret med de nye resultater
    updateDiagram(model);
    updateDiagramStyles();

    // 3. Opdater resultatskemaer og tabeller i UI
    displayResults(model, config);

    // 4. Lav en automatisk backup af tilstanden efter succesfuld beregning
    autoSaveProject();
}

export function resetProject() {
    if (!confirm("Er du sikker? Alle usgemte data går tabt.")) return;

    const vvCont = document.getElementById('strengeContainerVV') || document.getElementById('strengeContainer');
    if (vvCont) vvCont.innerHTML = '';

    const kvCont = document.getElementById('strengeContainerKV');
    if (kvCont) kvCont.innerHTML = '';

    document.getElementById('returContainerBody').innerHTML = '';
    document.getElementById('customTapsteder').innerHTML = '';
    document.getElementById('advarsler').innerHTML = '';
    document.getElementById('summaryTableBody').innerHTML = '';
    document.querySelector('#rørResultTable tbody').innerHTML = '';
    document.querySelector('#cirkResultTable tbody').innerHTML = '';
    const compRes = document.getElementById('componentResults');
    if (compRes) compRes.innerHTML = '';

    state.nodes = [];
    state.links = [];
    state.names.clear();
    state.customTapsteder = {};
    state.beholderConnectionId = null;
    state.lastModel = null;

    state.sC = 0;
    state.sC_kv = 0;
    state.tC = 0;
    state.rC = 0;
    window.valveCounter = 0;
    window.compCounter = 0;

    buildNetworkAndRender();

    document.getElementById('projectName').value = '';
    console.log("Projekt nulstillet.");
}

export function showCalculationReport() {
    if (!state.lastModel || !state.lastConfig) {
        alert('Du skal først køre en beregning for at kunne generere en rapport.');
        return;
    }
    generateReportHTML();
}

export async function generateReportHTML() {
    if (!state.lastModel) { alert("Kør en beregning først."); return; }

    const btn = document.querySelector('button[onclick="showCalculationReport()"]');
    const orgText = btn ? btn.innerText : "";
    if (btn) btn.innerText = "Genererer rapport...";

    await new Promise(r => setTimeout(r, 50));

    const model = state.lastModel;
    const config = getGlobalConfig();
    const now = new Date().toLocaleString();
    const projName = document.getElementById('projectName').value || "Uden Navn";

    const currentVisMode = document.querySelector('input[name="visMode"]:checked')?.value || "none";
    const currentCrit = document.getElementById('visKritisk')?.checked || false;
    const currentLegend = document.getElementById('visLegend')?.checked || false;

    const getSnapshot = () => {
        const svgEl = document.querySelector("#diagram svg");
        if (!svgEl) return "";
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svgEl);
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
    };

    document.getElementById('visLegend').checked = true;
    document.getElementById('visKritisk').checked = false;
    applyColorGradient('none');
    updateLegend();
    updateDiagramStyles();
    const imgTopo = getSnapshot();

    applyColorGradient('temp');
    updateLegend();
    const imgTemp = getSnapshot();

    applyColorGradient('none');
    document.getElementById('visKritisk').checked = true;
    updateDiagramStyles();
    updateLegend();
    const imgCrit = getSnapshot();

    document.getElementById('visKritisk').checked = currentCrit;
    document.getElementById('visLegend').checked = currentLegend;
    applyColorGradient(currentVisMode);
    updateLegend();
    updateDiagramStyles();
    if (btn) btn.innerText = orgText;

    const generatePathTable = (pathSet) => {
        if (!pathSet || pathSet.size === 0) return '<p><i>Ingen kritisk vej beregnet.</i></p>';

        let rows = '';
        let accDp = 0;

        pathSet.forEach(id => {
            const n = model.nodes.get(id);
            if (!n || (!n.type.includes('ror') && !['booster', 'reducer', 'vandstik', 'water_meter'].includes(n.type))) return;

            const flow = n.qd || 0;
            let dp = n.dp_tap || 0;

            accDp += dp;

            let vel = 0;
            let pa_pr_m = 0;
            let dimStr = '-';
            let matStr = n.material || n.type;

            if (n.nom_dim) {
                dimStr = `${n.nom_dim} mm`;
                if (ID[n.material] && ID[n.material][n.nom_dim]) {
                    const d_i = ID[n.material][n.nom_dim] / 1000;
                    vel = n.L > 0 ? (flow / 1000) / (Math.PI * Math.pow(d_i / 2, 2)) : 0;
                }
                if (n.L > 0) {
                    pa_pr_m = dp / n.L;
                }
            } else {
                if (n.type === 'booster') matStr = 'Trykforøger';
                else if (n.type === 'reducer') matStr = 'Reduktion';
                else if (n.type === 'water_meter') matStr = 'Vandmåler';
            }

            rows += `<tr>
                <td>${getDisplayName(n.id)}</td>
                <td>${matStr}</td>
                <td>${dimStr}</td>
                <td>${(n.L || 0).toFixed(1)} m</td>
                <td>${flow.toFixed(3)}</td>
                <td>${vel.toFixed(2)}</td>
                <td>${pa_pr_m.toFixed(0)}</td>
                <td>${dp.toFixed(0)}</td>
                <td><strong>${accDp.toFixed(0)}</strong></td>
            </tr>`;
        });

        return `<table class="data critical-path-table">
            <thead>
                <tr>
                    <th>ID</th><th>Materiale</th><th>Dim</th><th>Længde</th>
                    <th>Flow [l/s]</th><th>v [m/s]</th><th>Pa/m</th><th>Δp [Pa]</th><th>Σ Δp [Pa]</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
    };

    const generateRow = (n) => {
        if (!n.nom_dim) return '';
        const isCirc = n.type.includes('cirk') || n.type === 'valve' || n.category?.includes('return');
        const flow = isCirc ? (model.circFlows.get(n.id) || 0) : (n.qd || 0);
        const dp = isCirc ? (n.dp_circ || 0) : (n.dp_tap || 0);

        let vel = 0;
        if (ID[n.material] && ID[n.material][n.nom_dim]) {
            const d_i = ID[n.material][n.nom_dim] / 1000;
            vel = n.L > 0 ? (flow / 1000) / (Math.PI * Math.pow(d_i / 2, 2)) : 0;
        }

        return `<tr>
            <td>${getDisplayName(n.id)}</td>
            <td>${n.material}</td>
            <td>${n.nom_dim} mm</td>
            <td>${(n.L || 0).toFixed(2)} m</td>
            <td>${flow.toFixed(3)}</td>
            <td>${vel.toFixed(2)}</td>
            <td>${dp.toFixed(0)}</td>
            <td>${n.insulationThickness || 0}</td>
            <td>${((n.q_tab || 0) / (n.L || 1)).toFixed(1)}</td>
        </tr>`;
    };

    const nodes = Array.from(model.nodes.values()).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    let htmlVV = '', htmlKV = '', htmlCirc = '', htmlComp = '', htmlMeters = '';

    nodes.forEach(n => {
        if (n.type === 'ror_vv') htmlVV += generateRow(n);
        else if (n.type === 'ror_kv') htmlKV += generateRow(n);
        else if (n.type === 'cirkulation_vv') htmlCirc += generateRow(n);
        else if (n.type === 'booster' || n.type === 'reducer') {
            htmlComp += `<tr>
                <td>${getDisplayName(n.id)}</td>
                <td>${n.type === 'booster' ? 'Trykforøger' : 'Reduktion'}</td>
                <td>${(n.pressure_change || 0)} kPa</td>
                <td>${(model.circFlows?.get(n.id) || n.qd || 0).toFixed(3)} l/s</td>
            </tr>`;
        }
        else if (n.type === 'water_meter') {
            const dimStr = n.nom_dim ? `${n.nom_dim} mm` : '-';
            const kvStr = n.meterKv ? n.meterKv.toFixed(1) : (n.kv_value ? n.kv_value.toFixed(1) : '-');
            const typeStr = n.meterType || (n.autoMeterName ? `Auto: ${n.autoMeterName}` : 'Standard');
            const flowVal = (model.circFlows?.get(n.id) || n.qd || 0);
            const dpVal = (n.dp_tap || 0) + (n.dp_circ || 0);

            htmlMeters += `<tr>
                <td>${getDisplayName(n.id)}</td>
                <td>${typeStr}</td>
                <td>${dimStr}</td>
                <td>${kvStr}</td>
                <td>${flowVal.toFixed(3)} l/s</td>
                <td>${dpVal.toFixed(0)} Pa</td>
            </tr>`;
        }
    });

    let rowsBalance = '';
    model.loops.forEach(l => {
        const loopHeatLoss = l.path.reduce((sum, id) => {
            const node = model.nodes.get(id);
            return sum + (node ? (node.q_tab || 0) : 0);
        }, 0);

        let valveInfo = 'Ingen ventil';
        let setting = '-';
        if (l.selectedValve) {
            valveInfo = `${l.selectedValve.valveName || ''} (VVS: ${l.selectedValve.vvsNr || '-'})`;
            if (l.selectedValve.isStatic) {
                const flowLS = l.circ_flow || 0;
                const reqDp = Math.max(0, model.max_dp_circ - (l.dp_circ_total - l.selectedValve.minDp));
                if (reqDp > 0) {
                    const kv = 36 * flowLS / Math.sqrt(reqDp / 1000);
                    setting = `Kv = ${kv.toFixed(2)}`;
                } else { setting = "Fuldt åben"; }
            } else { setting = "Auto"; }
        }
        rowsBalance += `<tr><td>${getDisplayName(l.id)}</td><td>${loopHeatLoss.toFixed(0)} W</td><td>${((l.circ_flow || 0) * 3600).toFixed(1)} l/h</td><td>${(l.dp_circ_total || 0).toFixed(0)} Pa</td><td>${valveInfo}</td><td><strong>${setting}</strong></td></tr>`;
    });

    const kvLoss = model.kv_pressure_loss_to_beholder || 0;
    const vvStart = model.vv_start_pressure || config.pln;
    const totalCircFlow = model.loops.reduce((s, l) => s + (l.circ_flow || 0), 0) * 3600;

    const html = `
    <!DOCTYPE html>
    <html lang="da">
    <head>
        <meta charset="UTF-8">
        <title>KS Rapport: ${projName}</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.4; padding: 20px; max-width: 1200px; margin: 0 auto; }
            h1 { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 5px; }
            h2 { margin-top: 30px; background: #f8f9fa; padding: 8px; border-left: 6px solid #555; break-after: avoid; }
            h2.kv { border-color: #0d6efd; }
            h2.vv { border-color: #dc3545; }
            h2.cirk { border-color: #a71d2a; }
            
            table.data { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; page-break-inside: auto; }
            table.data th, table.data td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            table.data th { background-color: #e9ecef; font-weight: 600; }
            table.data tr:nth-child(even) { background-color: #f8f9fa; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .status-row { display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 3px 0; }
            .ok { color: green; font-weight: bold; }
            .danger { color: red; font-weight: bold; }
            
            .diagram-page { 
                page-break-before: always; 
                position: relative;
                width: 100%;
                height: 100vh;
                overflow: hidden;
                border: none;
                margin: 0; padding: 0;
            }
            .diagram-page .caption { 
                position: absolute;
                top: 20px;
                left: 20px;
                font-weight: bold; 
                font-size: 18px; 
                background: rgba(255,255,255,0.9);
                padding: 10px 15px;
                border: 1px solid #ccc;
                border-radius: 4px;
                z-index: 100;
                box-shadow: 2px 2px 5px rgba(0,0,0,0.1);
            }
            .landscape-img { 
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(90deg);
                width: 90vh; 
                height: auto;
                max-height: 95vw; 
                border: 1px solid #eee;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            @media print { 
                .no-print { display: none; } 
                .page-break { page-break-before: always; } 
                .diagram-page { height: 100vh; }
                @page { margin: 0; }
                body { padding: 1cm; }
                .diagram-page { padding: 0; }
            }
        </style>
    </head>
    <body>
        <div class="no-print" style="position:fixed; top:10px; right:10px; background:white; padding:10px; border:1px solid #ccc; z-index:1000;">
            <button onclick="window.print()" style="font-size:14px; padding:5px 15px; cursor:pointer;">🖨️ Udskriv Rapport</button>
        </div>

        <h1>${projName}</h1>
        <p>Genereret: ${now} | NIRAS Brugsvandsberegner v0.34 BETA</p>

        <div class="info-grid">
            <div class="card">
                <h3>💧 Koldt Vand (KV)</h3>
                <div class="status-row"><span>Forsyningstryk:</span> <strong>${config.pln} Pa</strong></div>
                <div class="status-row"><span>Maks tryktab:</span> <strong>${(model.max_dp_kv || 0).toFixed(0)} Pa</strong></div>
                <div class="status-row"><span>Resttryk v/ Værste Tapsted:</span> <strong>${(config.pln - (model.max_dp_kv || 0)).toFixed(0)} Pa</strong></div>
            </div>
            <div class="card">
                <h3>🔥 Varmt Vand (VV)</h3>
                <div class="status-row"><span>Starttryk (fra KV):</span> <strong>${vvStart.toFixed(0)} Pa</strong></div>
                <div class="status-row"><span>Maks tryktab:</span> <strong>${(model.max_dp_tapning || 0).toFixed(0)} Pa</strong></div>
                <div class="status-row"><span>Resttryk v/ Værste Tapsted:</span> <strong class="${(vvStart - model.max_dp_tapning) < config.min_tap_tryk ? 'danger' : 'ok'}">${(vvStart - model.max_dp_tapning).toFixed(0)} Pa</strong></div>
            </div>
        </div>

        <h2 class="kv">2. Koldt Vand: Hydraulisk Analyse</h2>
        <p><strong>Detaljeret beregning af den kritiske vej (største tryktab):</strong></p>
        ${generatePathTable(model.criticalPathKV)}
        <h3>Rørjournal - Koldt Vand</h3>
        <table class="data"><thead><tr><th>ID</th><th>Materiale</th><th>Dim</th><th>Længde</th><th>Flow [l/s]</th><th>v [m/s]</th><th>Δp [Pa]</th><th>Isolering</th><th>W/m</th></tr></thead><tbody>${htmlKV || '<tr><td colspan="9">Ingen data</td></tr>'}</tbody></table>

        <div class="page-break"></div>

        <h2 class="vv">3. Varmt Vand: Hydraulisk Analyse</h2>
        <div class="status-box" style="background-color:#fff3cd; border:1px solid #ffeeba; padding:10px;"><strong>Hydraulisk Link:</strong> Tryktab i KV-forsyning frem til beholder (${kvLoss.toFixed(0)} Pa) er trukket fra forsyningstrykket (${config.pln} Pa).</div>
        <p><strong>Detaljeret beregning af den kritiske vej:</strong></p>
        ${generatePathTable(model.criticalPath)}
        <h3>Rørjournal - Varmt Vand</h3>
        <table class="data"><thead><tr><th>ID</th><th>Materiale</th><th>Dim</th><th>Længde</th><th>Flow [l/s]</th><th>v [m/s]</th><th>Δp [Pa]</th><th>Isolering</th><th>W/m</th></tr></thead><tbody>${htmlVV || '<tr><td colspan="9">Ingen data</td></tr>'}</tbody></table>

        <h2 class="cirk">4. Cirkulation & Indregulering</h2>
        <div class="status-row"><span>Total Flow:</span> <strong>${totalCircFlow.toFixed(1)} l/h</strong></div>
        <div class="status-row"><span>Pumpe Løftehøjde:</span> <strong>${(model.max_dp_circ || 0).toFixed(0)} Pa</strong></div>
        <h3>Indreguleringsskema</h3>
        <table class="data"><thead><tr><th>Streng</th><th>Total Varmetab</th><th>Flow</th><th>Tryktab i streng</th><th>Ventil</th><th>Indstilling</th></tr></thead><tbody>${rowsBalance || '<tr><td colspan="6">Ingen cirkulation</td></tr>'}</tbody></table>
        <h3>Cirkulationsledninger (Journal)</h3>
        <table class="data"><thead><tr><th>ID</th><th>Materiale</th><th>Dim</th><th>Længde</th><th>Flow [l/s]</th><th>v [m/s]</th><th>Δp [Pa]</th><th>Isolering</th><th>W/m</th></tr></thead><tbody>${htmlCirc || '<tr><td colspan="9">Ingen data</td></tr>'}</tbody></table>

        ${htmlComp ? `<h2>5. Aktive Komponenter</h2><table class="data"><thead><tr><th>ID</th><th>Type</th><th>Indstilling</th><th>Aktuelt Flow</th></tr></thead><tbody>${htmlComp}</tbody></table>` : ''}

        ${htmlMeters ? `<h2>6. Vandmålere</h2><table class="data"><thead><tr><th>ID</th><th>Type</th><th>Dim.</th><th>Kv-værdi</th><th>Flow</th><th>Tryktab</th></tr></thead><tbody>${htmlMeters}</tbody></table>` : ''}

        <div class="page-break"></div>
        
        <div class="diagram-page"><div class="caption">Bilag A: Systemoversigt (Topologi)</div><img src="${imgTopo}" class="landscape-img"></div>
        <div class="diagram-page"><div class="caption">Bilag B: Temperaturfordeling (Koldt/Varmt)</div><img src="${imgTemp}" class="landscape-img"></div>
        <div class="diagram-page"><div class="caption">Bilag C: Kritisk Vej (Markeret med Blåt)</div><img src="${imgCrit}" class="landscape-img"></div>
    </body>
    </html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
    } else {
        alert("Kunne ikke åbne rapportvinduet. Tjek din popup-blokker.");
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

export function beregnBeholder() {
    const valgElement = document.querySelector('input[name="beholderMetode"]:checked');
    if (!valgElement) return;
    const valg = valgElement.value;
    let resultat = { volumen: 0, beskrivelse: '' };
    const config = getGlobalConfig();

    try {
        if (valg === 'A') {
            resultat = beregnBeholderMetodeA();
        } else if (valg === 'B') {
            resultat = beregnBeholderMetodeB(config.T_v);
        } else if (valg === 'C') {
            resultat = beregnBeholderMetodeC(config.T_v);
        }
    } catch (e) {
        alert(`Der opstod en fejl under beregningen: ${e.message}`);
        return;
    }

    if (state.lastModel && state.lastModel.loops) {
        const totalCircFlowLH = state.lastModel.loops.reduce((sum, l) => sum + (l.circ_flow || 0), 0) * 3600;

        if (totalCircFlowLH > resultat.volumen && resultat.volumen > 0) {
            resultat.beskrivelse += `
                <div class="alert alert-warning mt-3">
                    <h6>⚠️ Advarsel: Beholder muligvis for lille til cirkulationen</h6>
                    <p class="mb-1">Det beregnede cirkulationsflow er <b>${totalCircFlowLH.toFixed(0)} l/h</b>, hvilket er større end beholdervolumenet på <b>${resultat.volumen.toFixed(0)} L</b>.</p>
                    <p class="mb-1">Dette medfører risiko for at ødelægge temperaturlagdelingen i beholderen og dermed problemer med at opretholde temperaturen.</p>
                    <hr>
                    <strong>Anbefalede tiltag:</strong>
                    <ul class="mb-0 ps-3">
                        <li>Overvej en <b>supplerende cirkulationsveksler</b>.</li>
                        <li>Forsøg at <b>reducere den cirkulerede vandmængde</b> (bedre isolering, mindre rør).</li>
                        <li>Tjek om der er tapsteder langt væk fra hovedsystemet, som med fordel kunne forsynes med <b>decentral varmtvandsopvarmning</b>.</li>
                        <li>Tjek brugsvandssystemet med fordel kan deles op i <b>mindre enheder</b></li>
                    </ul>
                </div>
            `;
        }
    }

    document.getElementById('beholderResultatVolumen').textContent = `${resultat.volumen.toFixed(0)} L`;
    document.getElementById('beholderResultatBeskrivelse').innerHTML = resultat.beskrivelse;
}

export function beregnBeholderMetodeA() {
    const model = state.lastModel;

    if (!model || !model.N || model.N <= 0) {
        throw new Error('Metode A kræver, at der først køres en fuld systemberegning med tapsteder af typen "Lejlighed".');
    }

    const userEffekt = parseFloat(document.querySelector('[name="userEffekt"]')?.value);
    const userVolumen = parseFloat(document.querySelector('[name="userVolumen"]')?.value);
    const N = model.N;
    const n_keys = Object.keys(model.pv_kurver).map(Number);
    const closest_n = n_keys.reduce((p, c) => (Math.abs(c - N) < Math.abs(p - N) ? c : p));
    const kurve = model.pv_kurver[closest_n];
    const kurveVol = Object.keys(kurve).map(Number);
    const kurveEff = Object.values(kurve);

    let beregnetVolumen = 0;
    let beskrivelse = 'Indtast enten tilgængelig effekt eller ønsket volumen i felterne ovenfor for at beregne den anden værdi.';

    const interpolate = (x, xArr, yArr) => {
        if (x <= xArr[0]) return yArr[0];
        if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
        for (let i = 0; i < xArr.length - 1; i++) {
            if (x >= xArr[i] && x <= xArr[i + 1]) {
                const t = (x - xArr[i]) / (xArr[i + 1] - xArr[i]);
                return yArr[i] + t * (yArr[i + 1] - yArr[i]);
            }
        }
        return yArr[0];
    };

    if (!isNaN(userEffekt) && userEffekt > 0) {
        const effektPrLejl = userEffekt / N;
        const volPrLejl = interpolate(effektPrLejl, [...kurveEff].reverse(), [...kurveVol].reverse());
        beregnetVolumen = volPrLejl * N;
        beskrivelse = `For en tilgængelig effekt på <b>${userEffekt} kW</b>, kræves et beholdervolumen på ca. <b>${beregnetVolumen.toFixed(0)} L</b>.`;
        document.querySelector('[name="userVolumen"]').value = '';
    } else if (!isNaN(userVolumen) && userVolumen > 0) {
        const volPrLejl = userVolumen / N;
        const effektPrLejl = interpolate(volPrLejl, kurveVol, kurveEff);
        const beregnetEffekt = effektPrLejl * N;
        beregnetVolumen = userVolumen;
        beskrivelse = `For et ønsket volumen på <b>${userVolumen} L</b>, er det nødvendige effektbehov ca. <b>${beregnetEffekt.toFixed(1)} kW</b>.`;
        document.querySelector('[name="userEffekt"]').value = '';
    } else {
        throw new Error("Indtast venligst enten en gyldig effekt eller et volumen for Metode A.");
    }

    return {
        volumen: beregnetVolumen,
        beskrivelse: beskrivelse
    };
}

export function beregnBeholderMetodeB(T_v) {
    const flow_ls = parseFloat(document.getElementById('metodeB_flow').value);
    const varighed_min = parseFloat(document.getElementById('metodeB_varighed').value);
    const effekt_kW = parseFloat(document.getElementById('metodeB_effekt').value);

    if (isNaN(flow_ls) || isNaN(varighed_min) || isNaN(effekt_kW)) throw new Error("Ugyldige inputværdier.");

    const T_kold = 10;
    const delta_T = T_v - T_kold;
    const varighed_s = varighed_min * 60;

    const total_vand_L = flow_ls * varighed_s;
    const energi_krævet_J = total_vand_L * C * delta_T;

    const effekt_W = effekt_kW * 1000;
    const energi_leveret_J = effekt_W * varighed_s;

    const energi_underskud_J = Math.max(0, energi_krævet_J - energi_leveret_J);

    const volumen_L = energi_underskud_J / (C * delta_T);

    return {
        volumen: volumen_L,
        beskrivelse: `Beregnet ud fra et spidsforbrug på ${total_vand_L.toFixed(0)} L over ${varighed_min} minutter med en varmekilde på ${effekt_kW} kW.`
    };
}

export function beregnBeholderMetodeC(T_v) {
    const effekt_kW = parseFloat(document.getElementById('metodeC_effekt').value);
    if (isNaN(effekt_kW)) throw new Error("Ugyldig effektværdi.");

    const rækker = document.querySelectorAll('#metodeC_tablebody tr');
    let tappemønster = [];
    let max_tid_s = 0;

    rækker.forEach(r => {
        const inputs = r.querySelectorAll('input');
        if (inputs.length >= 3) {
            const flow_ls = parseFloat(inputs[0].value);
            const start_min = parseFloat(inputs[1].value);
            const varighed_min = parseFloat(inputs[2].value);
            if (![flow_ls, start_min, varighed_min].some(isNaN)) {
                const start_s = start_min * 60;
                const slut_s = start_s + (varighed_min * 60);
                tappemønster.push({ flow_ls, start_s, slut_s });
                if (slut_s > max_tid_s) max_tid_s = slut_s;
            }
        }
    });

    if (tappemønster.length === 0) return { volumen: 0, beskrivelse: "Intet tappemønster defineret." };

    const T_kold = 10;
    const delta_T = T_v - T_kold;
    const effekt_W = effekt_kW * 1000;

    let maks_energi_underskud_J = 0;
    let nuværende_energi_underskud_J = 0;

    for (let t = 0; t <= max_tid_s; t++) {
        let nuværende_flow_ls = 0;
        tappemønster.forEach(tap => {
            if (t >= tap.start_s && t < tap.slut_s) {
                nuværende_flow_ls += tap.flow_ls;
            }
        });

        const energi_forbrugt_J_pr_s = nuværende_flow_ls * C * delta_T;
        const energi_leveret_J_pr_s = effekt_W;

        nuværende_energi_underskud_J += (energi_forbrugt_J_pr_s - energi_leveret_J_pr_s);

        if (nuværende_energi_underskud_J < 0) {
            nuværende_energi_underskud_J = 0;
        }

        if (nuværende_energi_underskud_J > maks_energi_underskud_J) {
            maks_energi_underskud_J = nuværende_energi_underskud_J;
        }
    }

    const volumen_L = maks_energi_underskud_J / (C * delta_T);

    return {
        volumen: volumen_L,
        beskrivelse: `Beregnet ud fra et detaljeret tappemønster over ${Math.ceil(max_tid_s / 60)} minutter. Det maksimale energiunderskud kræver et lagervolumen på ${volumen_L.toFixed(0)} L.`
    };
}

// BIND TIL WINDOW FOR INLINE HTML COMPATIBILITY (ONCLICK O.L.)
window.getGlobalConfig = getGlobalConfig;
window.beregn = beregn;
window.resetProject = resetProject;
window.showCalculationReport = showCalculationReport;
window.generateReportHTML = generateReportHTML;
window.addTappemonsterRow = addTappemonsterRow;
window.beregnBeholder = beregnBeholder;

// DOM Generators & Helpers
window.addStreng_vv = addStreng_vv;
window.addStreng_kv = addStreng_kv;
window.addRorSektion = addRorSektion;
window.addTapsted = addTapsted;
window.addCirkulationRor = addCirkulationRor;
window.addValve = addValve;
window.addComponent = addComponent;
window.removeElement = removeElement;
window.toggleAutoDim = toggleAutoDim;
window.toggleBeholderMetode = toggleBeholderMetode;
window.addCustomTapsted = addCustomTapsted;
window.removeCustomTapsted = removeCustomTapsted;

// Event Interactors
window.handleInputChange = handleInputChange;
window.handleMaterialChange = handleMaterialChange;
window.updateDimOptions = updateDimOptions;
window.toggleGlobalOptimizationInputs = toggleGlobalOptimizationInputs;
window.saveEditModal = saveEditModal;
window.toggleSidebar = toggleSidebar;
window.highlightLoop = highlightLoop;
window.highlightComponent = highlightComponent;
window.clearHighlight = clearHighlight;

// Diagram Actions
window.zoomToFit = zoomToFit;
window.buildNetworkAndRender = buildNetworkAndRender;
window.updateDiagramStyles = updateDiagramStyles;
window.updateLegend = updateLegend;

// Import / Export
window.exportProject = exportProject;
window.importProject = importProject;
window.exportDetailedResults = exportDetailedResults;
window.renumberAndSortProject = renumberAndSortProject;
