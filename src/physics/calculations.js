import { getWaterDensity, getWaterViscosity } from "./properties.js";

/* --- BEREGNING AF TRYKTAB (Scientific / Newton-Raphson) --- */
export function getDP(flow_ls, d_inner, roughness, L, zeta, fittings_pct = 0, temp = 55) {
    // 0. Sikkerhed: Intet flow = intet tryktab
    if(!flow_ls || flow_ls < 0.0001) return 0;

    // 1. Fysik: Hent væskeegenskaber dynamisk baseret på temperatur
    const rho = getWaterDensity(temp);     // Densitet [kg/m³]
    const mu = getWaterViscosity(temp);    // Dynamisk Viskositet [Pa·s]

    // 2. Geometri & Flow
    const area = Math.PI * Math.pow(d_inner / 2, 2); // [m²]
    const v = (flow_ls / 1000) / area;               // Hastighed [m/s]
    const Re = (rho * v * d_inner) / mu;             // Reynolds tal (Dimensionsløst)

    // 3. Friktionsfaktor (Lambda) - Colebrook-White via Newton-Raphson
    let lambda = 0.02; 

    if (Re < 2300) {
        // Laminar strømning (Re < 2300) -> Hagen-Poiseuille
        lambda = 64 / Re;
    } else {
        // Turbulent strømning -> Colebrook-White
        // A. Swamee-Jain start-gæt (Giver ekstrem præcision som startværdi)
        const k_d = roughness / d_inner;
        const start_guess = 0.25 / Math.pow(Math.log10((k_d / 3.71) + (5.74 / Math.pow(Re, 0.9))), 2);
        
        lambda = start_guess;

        // B. Newton-Raphson Iteration (Videnskabelig standard)
        // Vi kører 5 iterationer for at sikre konvergens på 6+ decimaler
        for(let i=0; i<5; i++) {
            const term1 = 2.51 / (Re * Math.sqrt(lambda));
            const term2 = k_d / 3.71; // Standard konstant 3.71 (DS 439 kompatibel)
            
            // Opdater lambda iterativt
            const rhs = -2 * Math.log10(term2 + term1);
            lambda = 1 / (rhs * rhs);
        }
    }

    // 4. Beregn Tryktab (Darcy-Weisbach)
    const dynamic_pressure = 0.5 * rho * Math.pow(v, 2); // [Pa]
    
    // Rent rørtab
    const pipe_loss_pa = lambda * (L / d_inner) * dynamic_pressure;
    
    // Tillæg (Fittings i % + Enkeltmodstande Zeta)
    const pipe_loss_w_allowance = pipe_loss_pa * (1 + fittings_pct/100);
    const fittings_loss_zeta = zeta * dynamic_pressure;
    
    const total_dp = pipe_loss_w_allowance + fittings_loss_zeta;

    /* --- KS DEBUG START (Fjern dette afsnit før endelig levering hvis ønsket) --- */
    // Logger kun meningsfulde rørstræk (L > 0.1m) for ikke at spamme
    if (L > 0.1 && flow_ls > 0.1) {
        const grad = pipe_loss_pa / L; // Gradient [Pa/m]
        console.groupCollapsed(`📝 KS-DATA: Rør Ø${(d_inner*1000).toFixed(1)}mm | Q=${flow_ls.toFixed(3)} l/s`);
        console.log(`Fysik (@${temp.toFixed(1)}°C): rho=${rho.toFixed(1)} kg/m³, mu=${mu.toExponential(4)} Pa·s`);
        console.log(`Flow: v=${v.toFixed(3)} m/s, Re=${Re.toFixed(0)}`);
        console.log(`Beregning: Ruhed=${(roughness*1000).toFixed(3)}mm, Lambda=${lambda.toFixed(4)}`);
        console.log(`Resultat: Gradient=${grad.toFixed(1)} Pa/m (Rent rør)`);
        console.log(`Total: ${pipe_loss_pa.toFixed(1)} Pa (Rør) + ${(total_dp - pipe_loss_pa).toFixed(1)} Pa (Tillæg) = ${total_dp.toFixed(1)} Pa`);
        console.groupEnd();
    }
    /* --- KS DEBUG SLUT --- */

    return total_dp;
}
