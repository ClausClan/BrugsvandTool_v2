// --- KONSTANTER OG DATA ---

// Standard Tapsteder (ST) med normvandstrøm (qf) i l/s jf. DS 439:2024
// Struktur: { qf_hot: Varmt, qf_cold: Koldt, mode: 'both'|'cold_only'|'hot_only' }
export const ST = { 
    "Lejlighed (standard)": { qf_hot: 0.8, qf_cold: 0.8, mode: 'both' },
    "Håndvask":             { qf_hot: 0.1, qf_cold: 0.1, mode: 'both' },
    "Brusebad":             { qf_hot: 0.15, qf_cold: 0.15, mode: 'both' },
    "Køkkenvask":           { qf_hot: 0.2, qf_cold: 0.2, mode: 'both' },
    "Vaskemaskine":         { qf_hot: 0.0, qf_cold: 0.2, mode: 'cold_only' }, // Koldt som standard i DK
    "Opvaskemaskine":       { qf_hot: 0.2, qf_cold: 0.2, mode: 'both' },      // Kan ofte tilsluttes varmt
    "Badekar":              { qf_hot: 0.3, qf_cold: 0.3, mode: 'both' },
    "Slangevinde":          { qf_hot: 0.0, qf_cold: 0.33, mode: 'cold_only' },
    "Rengøringsvask":       { qf_hot: 0.2, qf_cold: 0.2, mode: 'both' },
    "Udslagsvask":          { qf_hot: 0.2, qf_cold: 0.2, mode: 'both' },
    "Spulehane":            { qf_hot: 0.2, qf_cold: 0.2, mode: 'both' },
    
    // KUN KOLDT VAND
    "WC":                   { qf_hot: 0.0, qf_cold: 0.1, mode: 'cold_only' },
    "Urinal":               { qf_hot: 0.0, qf_cold: 0.4, mode: 'cold_only' },
    "Udvendig Hane":        { qf_hot: 0.0, qf_cold: 0.2, mode: 'cold_only' }
};

// Forkortelser til diagrammet (Branchestandard)
export const TAP_ABBREVIATIONS = {
    "Lejlighed (standard)": "LEJL", "Håndvask": "HV", "Brusebad": "BRUS", "Køkkenvask": "KV", 
    "Vaskemaskine": "VM", "Opvaskemaskine": "OM", "Badekar": "KAR", "Slangevinde": "SV", 
    "Rengøringsvask": "RV", "Udslagsvask": "UV", "Spulehane": "SH", "WC": "WC", 
    "Urinal": "UR", "Udvendig Hane": "UH" 
};

// =================================================================================
// == RØR-SERIER: DEFINITION AF RUHED (RH) i mm                                 ==
// Værdier er baseret på DS 439:2024 (6.3.5.4) og brugerdata.
// Metaller regnes med afsætning (0.15 mm), plast regnes uden (0.007-0.01 mm).
// =================================================================================
export const RH = {
    "Kobber": 0.15,
    "Rustfri Press 316L": 0.15,
    "Rustfri Svejse 316L": 0.15,
    "Pex": 0.01,
    "Alupex": 0.007,
    "PE100": 0.01,
    "Geberit Mepla": 0.007
};

// =================================================================================
// == RØR-SERIER: DEFINITION AF INDVENDIGE DIAMETRE (ID) i mm                     ==
// Format: "Materialenavn": { Nominel_Ydre_Diameter: Indre_Diameter, ... }
// Data er fra brugerinput.
// =================================================================================
export const ID = {
    "Kobber": { 6: 4.4, 8: 6.4, 10: 8.4, 12: 10.0, 15: 13.0, 18: 16.0, 22: 20.0, 28: 25.6, 35: 32.0, 42: 39.0, 54: 51.0 },
    "Rustfri Press 316L": { 12: 10.0, 15: 13.0, 18: 16.0, 22: 19.6, 28: 25.6, 35: 32.0, 42: 39.0, 54: 51.0, 76.1: 72.1, 88.9: 84.9, 108: 104.0 },
    "Rustfri Svejse 316L": { 6: 4.0, 8: 6.0, 10: 8.0, 12: 10.0, 13.5: 8.9, 14: 12.0, 15: 13.0, 16: 14.0, 17.2: 14.0, 18: 16.0, 20: 18.0, 21.3: 17.3, 22: 20.0, 25: 22.0, 26.9: 22.9, 28: 25.0, 30: 27.0, 33.7: 29.7, 35: 31.0, 38: 35.0, 40: 36.0, 42.4: 38.4, 43: 40.0, 44.5: 40.5, 48.3: 44.3, 51: 47.0, 53: 50.0, 54: 50.0, 60.3: 56.3, 76.1: 68.9, 88.9: 80.9 },
    "Pex": { 10: 6.4, 12: 8.0, 15: 10.0, 18: 13.0, 22: 16.0, 28: 20.0, 32: 23.2, 40: 29.0, 50: 36.2, 63: 45.6, 75: 54.4, 90: 65.4, 110: 79.8 },
    "Alupex": { 16: 12.0, 20: 15.5, 25: 20.0, 32: 26.0, 40: 32.0, 50: 41.0, 63: 51.0 },
    "PE100": { 63: 55.4, 75: 66.0, 90: 79.2, 110: 96.8, 125: 110.2, 160: 141.0, 200: 176.2, 225: 198.2, 250: 220.4, 315: 277.6, 400: 352.6 },
    "Geberit Mepla": { 16: 11.5, 20: 15.0, 26: 20.0, 32: 26.0, 40: 33.0, 50: 42.0, 63: 54.0, 75: 65.8 }
};

// =================================================================================
// == VENTILTYPER                                                                 ==
// Her kan du tilføje nye ventiltyper. Hver type skal have et unikt navn, ventil type (‘dynamic’ eller 'static')
// en 'data'-tabel, der følger samme format som Frese-ventilen.
// =================================================================================

// Data fra IMI STAD-D Datablad
export const STATIC_VALVE_DATA = {
    "IMI STAD-D": [
        { dn: 10, kvs: 1.36, kv_2_5: 0.461, vvs: '406961-103' },
        { dn: 15, kvs: 2.56, kv_2_5: 0.931, vvs: '406961-104' },
        { dn: 20, kvs: 5.39, kv_2_5: 2.71,  vvs: '406961-106' },
        { dn: 25, kvs: 8.59, kv_2_5: 5.26,  vvs: '406961-108' },
        { dn: 32, kvs: 14.2, kv_2_5: 7.77,  vvs: '406961-110' },
        { dn: 40, kvs: 19.3, kv_2_5: 9.16,  vvs: '406961-111' },
        { dn: 50, kvs: 32.3, kv_2_5: 15.8,  vvs: '406961-112' }
    ]
};

export const VALVE_TYPES = {
    // Data fra Frese Alpha sanitary Datablad
    "Frese ALPHA Sanitary": {
        type: 'dynamic',
        data: [
            // minDp = DeltaDP (Minimums differenstryk for at ventilen virker)
            { valveName: '47-20120', vvsNr: '406782.020', maxFlowLH: 20, minDp: 9000 },
            { valveName: '47-20170', vvsNr: '406782.040', maxFlowLH: 40, minDp: 9000 },
            { valveName: '47-20200', vvsNr: '406782.060', maxFlowLH: 60, minDp: 12000 },
            { valveName: '47-20230', vvsNr: '406782.080', maxFlowLH: 80, minDp: 13000 },
            { valveName: '47-20260', vvsNr: '406782.105', maxFlowLH: 105, minDp: 14000 },
            { valveName: '47-20300', vvsNr: '406782.135', maxFlowLH: 135, minDp: 14000 },
            { valveName: '47-20350', vvsNr: '406782.180', maxFlowLH: 180, minDp: 14000 },
            { valveName: '47-20400', vvsNr: '406782.240', maxFlowLH: 240, minDp: 14000 },
            { valveName: '47-20460', vvsNr: '406782.310', maxFlowLH: 310, minDp: 14000 },
            { valveName: '47-20510', vvsNr: '406782.410', maxFlowLH: 410, minDp: 15000 },
            { valveName: '47-20530', vvsNr: '406782.450', maxFlowLH: 450, minDp: 16000 },
            { valveName: '47-20570', vvsNr: '406782.500', maxFlowLH: 500, minDp: 17000 },
            { valveName: '47-20590', vvsNr: '406782.550', maxFlowLH: 550, minDp: 18000 },
            { valveName: '47-20620', vvsNr: '406782.600', maxFlowLH: 600, minDp: 19000 },
            { valveName: '47-20680', vvsNr: '406782.700', maxFlowLH: 700, minDp: 20000 },
            { valveName: '47-20740', vvsNr: '406782.800', maxFlowLH: 800, minDp: 20000 }
        ]
    },
    "IMI STAD-D": {
        type: 'static',
        data: STATIC_VALVE_DATA["IMI STAD-D"]
    }
};

/* --- KONSTANTER: VANDMÅLERE (MID STANDARD) --- */
export const METER_TYPES = {
    "Auto": { q3: null, kv: null, label: "Automatisk Dimensionering" },
    "Q3=1.6 (Dn15)": { q3: 1.6, kv: 2.5, dn: 15, label: "Q3=1.6 (Dn15)" },
    "Q3=2.5 (Dn20)": { q3: 2.5, kv: 4.0, dn: 20, label: "Q3=2.5 (Dn20)" },
    "Q3=4.0 (Dn20/25)": { q3: 4.0, kv: 6.3, dn: 25, label: "Q3=4.0 (Dn25)" },
    "Q3=6.3 (Dn25)": { q3: 6.3, kv: 10.0, dn: 25, label: "Q3=6.3 (Dn25)" },
    "Q3=10 (Dn40)": { q3: 10.0, kv: 16.0, dn: 40, label: "Q3=10 (Dn40)" },
    "Q3=16 (Dn50)": { q3: 16.0, kv: 25.0, dn: 50, label: "Q3=16 (Dn50)" }
};

// Data fra DS 452: Nødvendig tykkelse [mm] for Klasse 6 ved λ=0.037 W/mK
export const DS452_THICKNESS = { 15: 40, 18: 40, 22: 50, 28: 50, 35: 50, 42: 50, 54: 60, 76: 60 };
// NY KONSTANT: Standard handelstykkelser for isolering (i mm)
export const STANDARD_INSULATION_THICKNESS = [10, 20, 30, 40, 50, 60, 70, 80, 100];
// Justeringsfaktorer baseret på placering. Værdier er vejledende.
export const DS452_ADJUSTMENT = { "heated": 1.0, "unheated": 1.2, "outside": 1.2 };

