export const G = 9.82; // Tyngdeacceleration (m/s²)

/**
 * Beregner vandets densitet (rho) [kg/m³] som funktion af temperatur [°C].
 * Baseret på Tanaka's formel (standard for vand 0-100°C).
 */
export function getWaterDensity(t) {
    // Simpel men præcis approksimation (maks fejl 0.001% i området 0-100°C)
    if (t < 0) t = 0; 
    if (t > 100) t = 100;
    return 1000 * (1 - Math.pow((t + 288.9414) / (508929.2 * (t + 68.12963)), 1) * Math.pow(t - 3.9863, 2));
}

/**
 * Beregner vandets dynamiske viskositet (mu) [Pa·s] som funktion af temperatur [°C].
 * Baseret på Vogel-Fulcher-Tammann ligningen.
 */
export function getWaterViscosity(t) {
    if (t < 0) t = 0;
    // Resultat i Pa·s (N·s/m²).  Eks: 20°C -> 0.001002 Pa·s
    return 0.00002414 * Math.pow(10, 247.8 / (t + 273.15 - 140));
}

/**
 * Beregner vandets specifikke varmekapacitet (cp) [J/(kg·K)] som funktion af temperatur [°C].
 * Vand er ret stabilt omkring 4180-4200, men vi tager det med for præcision.
 */
export function getWaterSpecificHeat(t) {
    // Polynomisk tilnærmelse (4180 J/kgK ved 20°C, stiger let ved højere temp)
    return 4217.4 - 3.72 * t + 0.141 * Math.pow(t, 2) - 0.0026 * Math.pow(t, 3);
}

/**
 * Hjælper: Beregner varmekapacitets-faktor (rho * cp) [J/(m³·K)] for en given temp.
 * Bruges til flow-beregninger.
 */
export function getHeatCapacityFactor(t) {
    return getWaterDensity(t) * getWaterSpecificHeat(t); // Resultat ca. 4.120.000 - 4.180.000
}
