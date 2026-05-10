const d3 = window.d3;
import { state, gridSize, setProjektErÆndret } from "../data/state.js";
import { ID, RH, ST, TAP_ABBREVIATIONS, VALVE_TYPES, METER_TYPES } from "../config/constants.js";
import { getDP } from "../physics/calculations.js";
import { getDisplayName } from "../model/components.js";
import { buildModel, syncModelToState } from "../model/network.js";
import { getGlobalConfig } from "../main.js";

// Event handlers will be imported from events.js to avoid circular dependencies where possible,
// or we can dynamically load them or assign them on state/window.
// Let's import them cleanly.
import { handleNodeClick, handleNodeRightClick, showEditModal } from "./events.js";
import { updateAllSelects } from "./dom.js";

/**
 * Opdaterer det visuelle udseende af noder baseret på den aktuelle markering.
 */
export function updateSelectionVisuals() {
    d3.selectAll('.node').each(function(d) {
        d3.select(this).classed('selected', state.selectedNodes.has(d.id));
    });
}

export function initDiagram() {
    // Fjern eventuelle eksisterende SVG-elementer for at undgå dubletter (f.eks. ved gen-initiering eller HMR)
    d3.select("#diagram").selectAll("svg").remove();

    const svg = d3.select("#diagram").append("svg");
    const width = svg.node().getBoundingClientRect().width;
    const height = svg.node().getBoundingClientRect().height;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    
    // Opret zoom-containeren én gang for alle her
    const container = svg.append("g").attr("class", "zoom-container");

    // Definer zoom-adfærd
    const zoom = d3.zoom().on("zoom", (event) => {
        container.attr('transform', event.transform);
    });
    
    // Gem zoom-adfærd og svg i state, så vi kan bruge dem i zoomToFit
    state.zoomBehavior = zoom;
    state.svgElement = svg;
    state.zoomContainer = container;

    svg.call(zoom);
    
    state.sim = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(60).strength(0.1))
        .force("charge", d3.forceManyBody().strength(-20))
        .force("collide", d3.forceCollide(20));
    
    state.nodes[0].fx = width / 2;
    state.nodes[0].fy = height / 2;

    updateDiagram();
}

/**
 * Tegner diagrammet (SVG).
 * OPDATERET: Nye symboler for Beholder (Cylinder) og Vandstik (Boks).
 */
export function updateDiagram(model) {
    if (model) {
        syncModelToState(model);
    }
    const svg = d3.select("#diagram svg");
    if (svg.empty()) return; // Sikkerhedsforanstaltning hvis ikke initialiseret endnu
    
    let container = svg.select(".zoom-container");
    if (container.empty()) container = svg.append("g").attr("class", "zoom-container");
    container.html(""); // Tøm for at gentegne

    // 1. TEGN LINKS
    const link = container.append("g").selectAll("line")
        .data(state.links).join("line")
        .attr("class", d => {
            if (d.type === 'kv_feed') return 'link-kv_feed';
            return `link-${d.type}`;
        });

    // 2. TEGN TEKST PÅ LINKS
    const linkText = container.append("g").selectAll("text")
        .data(state.links).join("text")
        .attr("class", "link-text")
        .attr("dy", -2);

    // 3. TEGN NODER
    const node = container.append("g").selectAll("g")
        .data(state.nodes, d => d.id).join("g")
        .attr("class", "node")
        .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended))
        .on('click', handleNodeClick)
        .on('contextmenu', function(event, d) {
            if (event.shiftKey) {
                event.preventDefault();
                showEditModal(d);
            } else {
                handleNodeRightClick(event, d);
            }
        });

    node.each(function(d) {
        const group = d3.select(this);
        
        if (d.type === 'valve') {
            // Ventil: Rombe (Lilla)
            group.append('rect')
                .attr('width', 14).attr('height', 14)
                .attr('x', -7).attr('y', -7)
                .attr('transform', 'rotate(45)')
                .style('fill', '#6f42c1').style('stroke', '#333');
                
        } else if (d.type === 'booster') {
            // Booster: Pumpe symbol (Cirkel med trekant)
            group.append("circle").attr("r", 8).attr("fill", "#fff").attr("stroke", "#000").attr("stroke-width", 1.5);
            group.append("path").attr("d", "M -4,3 L 4,3 L 0,-5 Z").attr("fill", "#000"); 
            
        } else if (d.type === 'reducer') {
            // Reducer: Trekant ned (Tragt)
            group.append("path").attr("d", "M -7,-5 L 7,-5 L 0,7 Z")
                .attr("fill", "#ffcccc").attr("stroke", "#000").attr("stroke-width", 1);
                
        } else if (d.type === 'beholder') {
            // NYT SYMBOL: Beholder (Cylinder)
            // Selve tanken
            group.append("rect")
                .attr("x", -14).attr("y", -20)
                .attr("width", 28).attr("height", 40)
                .attr("rx", 5) // Rundede hjørner
                .attr("fill", "#f8f9fa")
                .attr("stroke", "#343a40").attr("stroke-width", 2);
            
            // Dekorative linjer (Top/Bund)
            group.append("line").attr("x1", -14).attr("y1", -10).attr("x2", 14).attr("y2", -10).attr("stroke", "#343a40").attr("stroke-width", 1);
            group.append("line").attr("x1", -14).attr("y1", 10).attr("x2", 14).attr("y2", 10).attr("stroke", "#343a40").attr("stroke-width", 1);
            
            // Tekst "VV"
            group.append("text").text("VV")
                .attr("dy", 4)
                .attr("text-anchor", "middle")
                .attr("font-size", "10px")
                .attr("font-weight", "bold")
                .attr("fill", "#343a40");
            
        } else if (d.type === 'vandstik') {
            // NYT SYMBOL: Vandstik (Blå boks)
            group.append("rect")
                .attr("x", -12).attr("y", -12)
                .attr("width", 24).attr("height", 24)
                .attr("rx", 3)
                .attr("fill", "#0d6efd")
                .attr("stroke", "#000").attr("stroke-width", 2);
                
            // Tekst "KV"
            group.append("text").text("KV")
                .attr("dy", 5)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", "white");

        } else if (d.type === 'water_meter') {
            // Vandmåler: Firkant med 'm3'
            group.append("rect")
                .attr("x", -10).attr("y", -10)
                .attr("width", 20).attr("height", 20)
                .attr("fill", "#fff")
                .attr("stroke", "#000").attr("stroke-width", 1.5);
            
            group.append("text").text("m³")
                .attr("dy", 4)
                .attr("text-anchor", "middle")
                .attr("font-size", "10px")
                .attr("font-weight", "bold");
            
        } else if (d.type === 'tapsted') {
            // Tapsted: Grøn
            group.append("circle").attr("r", 5).attr("fill", "#198754").attr("stroke", "#333");
            
        } else if (d.type === 'cirkulation_vv') {
            // Retur: Mørkerød
            group.append("circle").attr("r", 4).attr("fill", "#a71d2a").attr("stroke", "#333");
            
        } else if (d.type === 'ror_kv') {
            // Koldt rør: Blå
            group.append("circle").attr("r", 4).attr("fill", "#0d6efd").attr("stroke", "#333");
            
        } else {
            // Standard ror_vv: Rødlig
            group.append("circle").attr("r", 4).attr("fill", "#dc3545").attr("stroke", "#333");
        }
    });
    
    // 4. LABELS
    node.append("text")
        .text(d => {
            let label = getDisplayName(d.id);
            if (d.type === 'tapsted') {
                let typeName = d.tapType; 
                if (!typeName) {
                    const row = document.querySelector(`tr[data-id="${d.id}"]`);
                    if (row) {
                        const sel = row.querySelector('.tapType');
                        if (sel && sel.selectedIndex >= 0) typeName = sel.options[sel.selectedIndex].text;
                    }
                }
                if (typeName && TAP_ABBREVIATIONS[typeName]) label += ` (${TAP_ABBREVIATIONS[typeName]})`;
            }
            return label;
        })
        .attr("dy", d => {
            // Juster label placering for de nye store symboler
            if (d.type === 'beholder') return "-2.2em";
            if (d.type === 'vandstik') return "-1.6em";
            if (d.type === 'booster' || d.type === 'reducer') return "-1.2em";
            return "-0.8em";
        })
        .attr("font-size", "8px")
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .style("text-shadow", "0px 0px 3px white");

    // 5. SIMULATION
    state.sim.nodes(state.nodes).on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);

        linkText
            .attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);
    });

    state.sim.force("link").links(state.links);
    state.sim.alpha(0.3).restart();

    updateSelectionVisuals();
    if (state.lastModel) updateDiagramStyles();
}

/**
 * NY FUNKTION: Zoomer og panorerer så hele netværket er synligt.
 * Rettet til at bruge viewBox-koordinater for korrekt centrering.
 */
export function zoomToFit() {
    if (!state.nodes || state.nodes.length === 0) {
        console.warn('zoomToFit: state.nodes er tom eller mangler', state.nodes);
        return;
    }
    if (!state.svgElement || !state.zoomBehavior) {
        console.warn('zoomToFit: svgElement eller zoomBehavior mangler', {svg: state.svgElement, zoom: state.zoomBehavior});
        return;
    }

    // Tjek om noder har koordinater endnu (simulationen kan være i gang)
    const hasCoords = state.nodes.some(d => d.x !== undefined && d.y !== undefined);
    if (!hasCoords) {
        console.warn('zoomToFit: noder mangler x/y koordinater, prøver igen om 200ms');
        // Prøv igen om lidt når simulationen har kørt
        setTimeout(zoomToFit, 200);
        return;
    }

    // 1. Find grænserne (bounding box) for alle noder
    const xExtent = d3.extent(state.nodes.filter(d => d.x !== undefined), d => d.x);
    const yExtent = d3.extent(state.nodes.filter(d => d.y !== undefined), d => d.y);
    
    if (xExtent[0] === undefined) return;

    // RETTELSE: Vi bruger viewBox dimensioner i stedet for clientWidth/Height.
    // Dette sikrer, at vi regner i det samme koordinatsystem som d3.zoom arbejder i.
    let width, height;
    const viewBoxAttr = state.svgElement.attr("viewBox");
    
    if (viewBoxAttr) {
        const vb = viewBoxAttr.split(" ").map(parseFloat);
        width = vb[2]; // viewBox width
        height = vb[3]; // viewBox height
    } else {
        // Fallback (bør ikke ske med vores initDiagram)
        width = state.svgElement.node().clientWidth;
        height = state.svgElement.node().clientHeight;
    }

    const padding = 50; // Lidt ekstra luft rundt om

    // Beregn bredde og højde af selve netværket
    const dx = xExtent[1] - xExtent[0] + (padding * 2);
    const dy = yExtent[1] - yExtent[0] + (padding * 2);
    
    // Find midtpunktet af netværket (i graf-koordinater)
    const cx = (xExtent[0] + xExtent[1]) / 2;
    const cy = (yExtent[0] + yExtent[1]) / 2;

    // Beregn skala (hvor meget skal vi zoome ind/ud for at det passer i boksen)
    // Vi dividerer ViewBox-størrelse med Netværks-størrelse
    const scale = Math.min(width / dx, height / dy);
    
    // Begræns zoom (ikke for tæt på, ikke for langt væk)
    const limitedScale = Math.min(2, Math.max(0.1, scale));

    // Beregn translationen for at centrere midtpunktet
    // Formel: (Halv skærmbredde) - (Halv netværksbredde * skala)
    // Eller mere præcist: Vi flytter grafens centrum (cx) til 0, scaler, og flytter derefter til midten af skærmen.
    const tx = (width / 2) - (cx * limitedScale);
    const ty = (height / 2) - (cy * limitedScale);



    // Udfør zoom med en glidende overgang
    const transform = d3.zoomIdentity.translate(tx, ty).scale(limitedScale);
    state.svgElement.transition().duration(750).call(state.zoomBehavior.transform, transform);
}

// --- DRAG & DROP FUNKTIONER ---

export function dragstarted(e, d) {
    if (!e.active) state.sim.alphaTarget(0.1).restart();
    // Shift-klik starter "reparenting" (flyt forældre)
    if (e.sourceEvent.shiftKey) { 
        state.reparentingNode = d; 
        d3.select(this).classed('reparenting', true); 
    }
}

export function dragged(e, d) {
    // Flyt noden (låst til grid)
    d.fx = Math.round(e.x / gridSize) * gridSize;
    d.fy = Math.round(e.y / gridSize) * gridSize;
}

export function dragended(e, d) {
    if (!e.active) state.sim.alphaTarget(0);
    
    // Håndter "reparenting" (hvis man slipper en node oven på en anden med Shift nede)
    if (state.reparentingNode) {
        d3.select(this).classed('reparenting', false);
        
        const svgNode = state.svgElement.node();
        const transform = d3.zoomTransform(svgNode);
        
        const [px, py] = d3.pointer(e.sourceEvent, svgNode);
        const x = transform.invertX(px);
        const y = transform.invertY(py);
        
        const targetNode = state.sim.find(x, y, 30);
        
        if (targetNode && targetNode.id !== state.reparentingNode.id) {
            // Find rækken i tabellen for den node, vi flyttede
            const el = document.querySelector(`tr[data-id="${state.reparentingNode.id}"]`);
            if (el) {
                const pSel = el.querySelector('.parent');
                if (pSel) {
                    // Tjek om det er en gyldig forælder (simpel validering)
                    // Vi lader updateAllSelects håndtere den endelige logik, men vi sætter værdien her
                    pSel.value = targetNode.id; 
                    updateAllSelects(); 
                }
            }
        }
        state.reparentingNode = null;
    }
    
    // VIGTIGT for Auto-gem: Fortæl systemet, at noget er ændret (positionen)
    if (typeof setProjektErÆndret === 'function') {
        setProjektErÆndret();
    }
}

// =================================================================================
// == FUNKTIONER TIL DIAGRAM-VISUALISERING                                        ==
// =================================================================================
export function updateDiagramStyles() {
    if (!state.lastModel) return;
    const model = state.lastModel;

    // 1. SELEKTER ALLE RØRTYPER (Inkl. KV)
    const links = d3.selectAll("#diagram svg .link-fremløb, #diagram svg .link-cirkulation_vv, #diagram svg .link-ror_kv");
    
    // 2. TYKKELSE (Baseret på dimension)
    const pipeNodes = Array.from(model.nodes.values()).filter(n => 
        (n.type === 'ror_vv' || n.type === 'cirkulation_vv' || n.type === 'ror_kv') && n.nom_dim
    );
    
    if (pipeNodes.length > 0) {
        const dimDomain = d3.extent(pipeNodes, n => n.nom_dim);
        if (dimDomain[0] === dimDomain[1]) dimDomain[0] -= 1;
        const thicknessScale = d3.scaleLinear().domain(dimDomain).range([1.5, 8]);
        
        links.style('stroke-width', d => {
            const node = model.nodes.get(d.target.id);
            return (node && node.nom_dim) ? `${thicknessScale(node.nom_dim)}px` : '1.5px';
        });
    }

    const visModeInput = document.querySelector('input[name="visMode"]:checked');
    const visMode = visModeInput ? visModeInput.value : 'none';
    const visKritiskInput = document.getElementById('visKritisk');
    const showCritical = visKritiskInput ? visKritiskInput.checked : false;
    
    // Nulstil styles
    links.style('stroke', null).style('opacity', null).style('stroke-dasharray', null);

    if (showCritical) {
        highlightCriticalPath();
    } else if (visMode !== 'none') {
        applyColorGradient(visMode);
    } else {
        // 3. STANDARD FARVER (KATEGORIER)
        links.style('stroke', d => {
            const n = model.nodes.get(d.target.id);
            if (!n || !n.category) return '#ccc';

            switch (n.category) {
                // VARMT
                case 'main': return '#8b0000';          
                case 'distribution': return '#dc3545';  
                case 'connection': return '#f08080';    
                case 'main_return': return '#8b0000';   
                case 'return': return '#dc3545';        
                
                // KOLDT (NYT)
                case 'cold_main': return '#00008b';       // Mørkeblå
                case 'cold_distribution': return '#0d6efd'; // Standard Blå
                case 'cold_connection': return '#89cff0';   // Lyseblå
                
                default: return '#ccc';
            }
        })
        .style('stroke-dasharray', d => {
            const n = model.nodes.get(d.target.id);
            if (!n) return null;
            if (['main_return', 'return'].includes(n.category)) return '6, 4'; // Varm retur
            return null; 
        });
    }
    
    updateLegend();
    updateLabels(model); // (Separeret for overskuelighed, se nedenfor)
}

// Hjælper til labels
export function updateLabels(model) {
    const visDimInput = document.getElementById('visDim');
    const showDim = visDimInput ? visDimInput.checked : false;
    const visTryktabLabelInput = document.getElementById('visTryktabLabel');
    const showDpM = visTryktabLabelInput ? visTryktabLabelInput.checked : false;
    const visHastighedLabelInput = document.getElementById('visHastighedLabel');
    const showVel = visHastighedLabelInput ? visHastighedLabelInput.checked : false;
    const visLaengdeInput = document.getElementById('visLaengde');
    const showLen = visLaengdeInput ? visLaengdeInput.checked : false;
    const visFlowInput = document.getElementById('visFlow');
    const showFlow = visFlowInput ? visFlowInput.checked : false;
    
    const config = state.lastConfig || {};
    
    // Hent visningstilstand
    const visModeInput = document.querySelector('input[name="visMode"]:checked');
    const visMode = visModeInput ? visModeInput.value : 'none';

    d3.select("#diagram svg").selectAll(".link-text").text(d => {
        const n = model.nodes.get(d.target.id);
        if (!n) return "";

        // --- RETTELSE: Vis specifikt tryk afhængigt af rør-typen ---
        if (visMode === 'absolute_pressure') {
             let valToShow = undefined;

             // 1. Er det et koldtvandsrør? (Hent KV tryk)
             if (d.type === 'ror_kv' || d.type === 'kv_feed' || d.type === 'vandstik') {
                 valToShow = n.P_absolute_KV;
             }
             // 2. Er det et varmtvandsrør? (Hent VV tryk)
             else if (d.type === 'ror_vv' || d.type === 'fremløb' || d.type === 'cirkulation_vv') {
                 valToShow = n.P_absolute_VV;
             }
             
             // 3. Fallback: Hvis rørtypen er ukendt, eller vi er et sted uden opdeling (brug default)
             if (valToShow === undefined) {
                 valToShow = n.P_absolute;
             }

             if (valToShow !== undefined) {
                 return `${(valToShow / 1000).toFixed(0)} kPa`;
             }
             return "";
        }

        // Håndtering af ventiler (uændret)
        if (n.type === 'valve') {
             if (showDpM) return `${(n.dp_circ||0).toFixed(0)} Pa (V)`;
             return "";
        }

        // Håndtering af rør data (Dim, Flow, etc. - uændret)
        if (n.type === 'ror_vv' || n.type === 'cirkulation_vv' || n.type === 'ror_kv') {
            const parts = [];
            const flow_ls = (n.type === 'cirkulation_vv') ? (model.circFlows?.get(n.id) || 0) : (n.qd || 0);

            if (showDim && n.nom_dim) parts.push(`${n.nom_dim}mm`);
            if (showLen && n.L !== undefined) parts.push(`${n.L}m`);
            if (showFlow) parts.push(`${flow_ls.toFixed(3)} l/s`);
            
            if (n.nom_dim && ID[n.material] && ID[n.material][n.nom_dim]) {
                const d_i = ID[n.material][n.nom_dim] / 1000;
                const temp = (n.type === 'ror_kv') ? 10 : (n.type === 'ror_vv' ? config.T_v : (config.T_v - config.dT/2));
                
                if (showVel) {
                     const area = Math.PI * (d_i / 2) ** 2;
                     const v = (flow_ls / 1000) / area;
                     parts.push(`${v.toFixed(2)} m/s`);
                }
                if (showDpM) {
                     const dp = getDP(flow_ls, d_i, RH[n.material]/1000, 1, 0, config.fittings_pct, temp);
                     parts.push(`${dp.toFixed(0)} Pa/m`);
                }
            }
            return parts.join(' | ');
        }
        return "";
    });
}

/**
 * Farvelægger diagrammet baseret på resultater (Hastighed, Tryk, Temp).
 * Beregner W/m og Pa/m korrekt (ekskluderer komponenter fra skalaen).
 * Splitter Temperatur i to skalaer (KV og VV).
 * OPDATERET: Bruger faktiske beregnede yderpunkter (Min/Max).
 * Farver: KV (Lys Blå -> Mørk Grøn), VV (Lys Grøn -> Mørkerød).
 * OPDATERET: Strammere filtrering. Kun 'rør'-typer tæller med i skalaen for Pa/m og W/m.
 * Dette forhindrer Boostere/Ventiler i at ødelægge legenden.
 * OPDATERET: Forbedret KV-detektering via 'category' og fixet Pa/m visning for komponenter.
 */
export function applyColorGradient(mode) {
    if (!state.lastModel) return;
    const model = state.lastModel;
    
    let valuesPipes = [];
    let valuesTempKV = [];
    let valuesTempVV = [];
    const pipeTypes = ['ror_vv', 'ror_kv', 'cirkulation_vv'];

    model.nodes.forEach(n => {
        n._visValue = undefined; 
        
        // Hent flow til beregning (uændret)
        const flow = (n.type === 'cirkulation_vv' || n.type === 'valve' || n.category?.includes('return')) 
                     ? (model.circFlows?.get(n.id) || 0) : (n.qd || 0);

        let val = undefined;

        if (mode === 'velocity') {
             if (pipeTypes.includes(n.type) && n.nom_dim && ID[n.material]) {
                const d_i = ID[n.material][n.nom_dim] / 1000;
                val = (flow / 1000) / (Math.PI * Math.pow(d_i / 2, 2));
                if (isFinite(val)) valuesPipes.push(val);
            }
        } 
        else if (mode === 'pressure_drop') {
             const dp = (n.type === 'cirkulation_vv' || n.type === 'valve' || n.category?.includes('return')) ? (n.dp_circ || 0) : (n.dp_tap || 0);
             if (pipeTypes.includes(n.type) && n.nom_dim && n.L > 0) {
                val = dp / n.L;
                if (isFinite(val)) valuesPipes.push(val);
             } else { val = dp; }
        }
        else if (mode === 'absolute_pressure') {
            // --- RETTELSE: Saml ALLE tryk til skalaen ---
            if (n.P_absolute_KV !== undefined) valuesPipes.push(n.P_absolute_KV);
            if (n.P_absolute_VV !== undefined) valuesPipes.push(n.P_absolute_VV);
            
            // Fallback for noder der kun har generelt tryk (rør)
            if (n.P_absolute !== undefined && n.P_absolute_KV === undefined && n.P_absolute_VV === undefined) {
                valuesPipes.push(n.P_absolute);
            }
        }
        else if (mode === 'heat_loss') {
             if (pipeTypes.includes(n.type) && n.nom_dim && n.L > 0) {
                val = (n.q_tab || 0) / n.L;
                if (isFinite(val)) valuesPipes.push(val);
            }
        }
        else if (mode === 'temp') {
            val = model.nodeTemps ? (model.nodeTemps.get(n.id)) : undefined;
        }

        // Gem en "default" visValue (mest relevant for ikke-tapsteder)
        if (mode === 'absolute_pressure') {
            n._visValue = n.P_absolute; // Default
        } else if (val !== undefined) {
            n._visValue = val;
        }

        // Temperatur Logik (Uændret)
        let isKV = (n.category && n.category.startsWith('cold_')) || 
                   n.type === 'ror_kv' || n.type === 'vandstik' || 
                   (n.type === 'tapsted' && n.tapType && ST[n.tapType] && ST[n.tapType].mode === 'cold_only');
        if (mode === 'temp' && val !== undefined && val < 28) isKV = true;
        n._visType = isKV ? 'KV' : 'VV';

        if (mode === 'temp' && val !== undefined) {
            if (n._visType === 'KV') valuesTempKV.push(val);
            else valuesTempVV.push(val);
        }
    });

    // Skalaer
    let scaleMain, scaleKV, scaleVV;
    if (mode === 'temp') {
        const minKV = d3.min(valuesTempKV) || 10; const maxKV = d3.max(valuesTempKV) || 20;
        state.tempDomains = { kv: [minKV, maxKV] };
        scaleKV = d3.scaleLinear().domain([minKV, maxKV]).range(["#87CEFA", "#006400"]);
        const minVV = d3.min(valuesTempVV) || 50; const maxVV = d3.max(valuesTempVV) || 55;
        if(state.tempDomains) state.tempDomains.vv = [minVV, maxVV];
        scaleVV = d3.scaleLinear().domain([minVV, maxVV]).range(["#98FB98", "#8B0000"]);
    } else if (mode === 'absolute_pressure') {
        let minP = d3.min(valuesPipes); let maxP = d3.max(valuesPipes);
        if (minP === undefined) minP = 0; if (maxP === undefined) maxP = 400000;
        if (minP === maxP) { minP -= 1000; maxP += 1000; }
        state.visDomain = [minP, maxP];
        scaleMain = d3.scaleSequential(d3.interpolateTurbo).domain([minP, maxP]); 
    } else {
        let domain = d3.extent(valuesPipes);
        if (!domain[0] && domain[0] !== 0) domain = [0, 1];
        if (domain[0] === domain[1]) { domain[0] -= 0.1; domain[1] += 0.1; }
        scaleMain = d3.scaleSequential(d3.interpolateTurbo).domain(domain);
        state.visDomain = domain;
    }
    
    // --- STYLING AF LINKS (Farvelægning) ---
    d3.selectAll("#diagram svg line[class^='link-']")
      .style('stroke', function(d) {
          if (!d || !d.target) return null;
          if (d.type === 'kv_feed' && mode !== 'temp') return null; 

          const n = model.nodes.get(d.target.id);
          if (!n) return '#ccc';

          // HENT DEN RIGTIGE VÆRDI BASERET PÅ LINK TYPE
          let valueToColor = n._visValue;

          if (mode === 'absolute_pressure') {
              if (d.type === 'ror_kv' && n.P_absolute_KV !== undefined) {
                  valueToColor = n.P_absolute_KV;
              } 
              else if (d.type === 'fremløb' && n.P_absolute_VV !== undefined) {
                  valueToColor = n.P_absolute_VV;
              }
          }

          if (valueToColor === undefined) return '#ccc';

          if ((mode === 'pressure_drop' || mode === 'heat_loss') && !pipeTypes.includes(n.type)) {
              if (mode === 'pressure_drop' && valueToColor < 0) return '#28a745';
              if (mode === 'pressure_drop' && valueToColor > 0) return '#dc3545';
              return '#999'; 
          }

          if (mode === 'temp') {
              return (n._visType === 'KV') ? scaleKV(valueToColor) : scaleVV(valueToColor);
          } else {
              return scaleMain(valueToColor);
          }
      })
      .style('opacity', 1);
}

export function highlightCriticalPath() {
    if (!state.lastModel) return;
    const model = state.lastModel;

    // 1. Hent de kritiske stier
    const critPathVV = model.criticalPath;
    const critPathKV = model.criticalPathKV;

    // 2. Vælg ALLE rør-typer i diagrammet
    d3.selectAll("#diagram svg .link-fremløb, #diagram svg .link-cirkulation_vv, #diagram svg .link-ror_kv")
        .each(function(d) {
            const link = d3.select(this);
            if (!d.source || !d.target) return;

            const src = d.source.id;
            const tgt = d.target.id;

            const isCritVV = critPathVV && critPathVV.has(src) && critPathVV.has(tgt);
            const isCritKV = critPathKV && critPathKV.has(src) && critPathKV.has(tgt);

            if (isCritVV) {
                link.style('stroke', '#FF4500') 
                    .style('stroke-width', '4px')
                    .style('opacity', 1.0);
            } 
            else if (isCritKV) {
                link.style('stroke', '#00BFFF') 
                    .style('stroke-width', '4px')
                    .style('opacity', 1.0);
            } 
            else {
                link.style('opacity', 0.1);
            }
        });
}

/**
 * legenden i bunden af diagrammet.
 */
export function updateLegend() {
    const legendDiv = document.getElementById('diagram-legend');
    if (!legendDiv) return;
    
    const visLegendChk = document.getElementById('visLegend');
    
    // Tjek om legend skal vises
    if (!visLegendChk || !visLegendChk.checked || !state.lastModel) {
        legendDiv.style.display = 'none';
        return;
    }

    legendDiv.style.display = 'block';
    
    legendDiv.style.position = 'absolute';
    legendDiv.style.bottom = '10px';
    legendDiv.style.left = '10px';
    legendDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    legendDiv.style.padding = '8px';
    legendDiv.style.border = '1px solid #ccc';
    legendDiv.style.borderRadius = '4px';
    legendDiv.style.fontSize = '12px';
    legendDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    legendDiv.style.zIndex = '1000';

    const visModeInput = document.querySelector('input[name="visMode"]:checked');
    const visMode = visModeInput ? visModeInput.value : 'none';
    const visKritiskInput = document.getElementById('visKritisk');
    const showCritical = visKritiskInput ? visKritiskInput.checked : false;

    let html = '';

    // 1. Visning: Kritisk Streng
    if (showCritical) {
        html = `<div><span style="background-color:#FF4500; display:inline-block; width:15px; height:8px; margin-right:5px;"></span> Kritisk VV</div>
                <div><span style="background-color:#00BFFF; display:inline-block; width:15px; height:8px; margin-right:5px;"></span> Kritisk KV</div>`;
    } 
    // 2. Visning: Temperatur
    else if (visMode === 'temp' && state.tempDomains) {
        const dKV = state.tempDomains.kv || [10, 10];
        const dVV = state.tempDomains.vv || [55, 55];
        
        html += `<div class="mb-1"><strong>Koldt Vand (°C)</strong></div>`;
        html += `<div style="display:flex; align-items:center; margin-bottom:8px;">
                    <span style="margin-right:5px">${dKV[0].toFixed(1)}</span>
                    <div style="flex-grow:1; height:8px; width:100px; background: linear-gradient(to right, #87CEFA, #006400);"></div>
                    <span style="margin-left:5px">${dKV[1].toFixed(1)}</span>
                 </div>`;
        html += `<div class="mb-1"><strong>Varmt Vand (°C)</strong></div>`;
        html += `<div style="display:flex; align-items:center;">
                    <span style="margin-right:5px">${dVV[0].toFixed(1)}</span>
                    <div style="flex-grow:1; height:8px; width:100px; background: linear-gradient(to right, #98FB98, #8B0000);"></div>
                    <span style="margin-left:5px">${dVV[1].toFixed(1)}</span>
                 </div>`;
    } 
    // 3. Visning: Absolut Tryk
    else if (visMode === 'absolute_pressure' && state.visDomain) {
        const minKPa = state.visDomain[0] / 1000;
        const maxKPa = state.visDomain[1] / 1000;
        
        html = `<div><strong>kPa</strong></div>
                <div style="display:flex; align-items:center; margin-top:2px;">
                    <span style="margin-right:5px">${minKPa.toFixed(0)}</span>
                    <div style="height:10px; width:120px; background: linear-gradient(to right, ${d3.interpolateTurbo(0)}, ${d3.interpolateTurbo(0.5)}, ${d3.interpolateTurbo(1)}); border-radius: 2px;"></div>
                    <span style="margin-left:5px">${maxKPa.toFixed(0)}</span>
                </div>
                <div style="margin-top:2px; color:#666; font-size:10px;">Lavt Tryk ↔️ Højt Tryk</div>`;
    }
    // 4. Øvrige visninger (Hastighed, Tryktab pr m, Varmetab)
    else if (visMode !== 'none' && state.visDomain) {
        const minVal = state.visDomain[0];
        const maxVal = state.visDomain[1];
        
        const units = { 
            velocity: 'Hastighed (m/s)', 
            pressure_drop: 'Tryktab (Pa/m)', 
            heat_loss: 'Varmetab (W/m)'
        };
        const title = units[visMode] || visMode;

        html = `<div><strong>${title}</strong></div>
                <div style="display:flex; align-items:center; margin-top:2px;">
                    <span style="margin-right:5px">${minVal.toFixed(2)}</span>
                    <div style="height:8px; width:120px; background: linear-gradient(to right, ${d3.interpolateTurbo(0)}, ${d3.interpolateTurbo(0.5)}, ${d3.interpolateTurbo(1)}); border-radius: 2px;"></div>
                    <span style="margin-left:5px">${maxVal.toFixed(2)}</span>
                </div>`;
    }
    else {
        legendDiv.style.display = 'none';
    }
    
    legendDiv.innerHTML = html;
}

/**
 * Genopbygger netværksmodellen baseret på DOM'en og opdaterer D3-diagrammet.
 */
export function buildNetworkAndRender() {
    const config = getGlobalConfig();
    const model = buildModel(config);
    if (model) {
        syncModelToState(model);
        updateDiagram();
    }
}
