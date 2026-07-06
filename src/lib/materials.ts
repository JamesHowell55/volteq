export interface Material {
  id: 'copper' | 'aluminium';
  name: string;
  rho20: number;            // Ω·m, resistivity at 20°C
  alpha20: number;          // 1/°C, temp coefficient of resistance at 20°C
  beta: number;             // °C, IEC 60865 inferred absolute-zero-resistance offset
  density: number;          // kg/m³
  specificHeat: number;     // J/(kg·K)
  kAdiabatic: number;       // A·s^0.5/mm², IEC 60865-1 material constant
  thermalConductivity: number; // W/(m·K), for axial conduction between busbar sections
  defaultMaxContinuousTemp: number; // °C, IEC 61439-1 general bare-busbar limit (35°C amb + 70K)
  defaultMaxShortCircuitTemp: number; // °C, bare-conductor short-time limit
}

export const MATERIALS: Record<'copper' | 'aluminium', Material> = {
  copper: {
    id: 'copper',
    name: 'Copper',
    rho20: 1.72e-8,
    alpha20: 0.00393,
    beta: 234.5,
    density: 8960,
    specificHeat: 385,
    kAdiabatic: 226,
    thermalConductivity: 390,
    defaultMaxContinuousTemp: 105,
    defaultMaxShortCircuitTemp: 250,
  },
  aluminium: {
    id: 'aluminium',
    name: 'Aluminium',
    rho20: 2.82e-8,
    alpha20: 0.00403,
    beta: 228,
    density: 2700,
    specificHeat: 900,
    kAdiabatic: 148,
    thermalConductivity: 230,
    defaultMaxContinuousTemp: 105,
    defaultMaxShortCircuitTemp: 200,
  },
};

export interface EmissivityPreset {
  id: string;
  label: string;
  value: number;
}

export const EMISSIVITY_PRESETS: EmissivityPreset[] = [
  { id: 'bright', label: 'Bright / mill-finish metal', value: 0.1 },
  { id: 'weathered', label: 'Weathered / oxidised', value: 0.4 },
  { id: 'painted', label: 'Painted (matte, any dark colour)', value: 0.9 },
];

export interface CoatingPreset {
  id: string;
  label: string;
  thermalConductivity: number; // W/(m·K)
  thicknessMm: number;         // typical thickness, mm
}

export const COATING_PRESETS: CoatingPreset[] = [
  { id: 'none', label: 'None (bare metal)', thermalConductivity: 0.3, thicknessMm: 0 },
  { id: 'epoxy', label: 'Epoxy powder coat', thermalConductivity: 0.3, thicknessMm: 0.2 },
  { id: 'heatshrink', label: 'PVC / heat-shrink sleeve', thermalConductivity: 0.17, thicknessMm: 0.5 },
  { id: 'tin', label: 'Tin plating', thermalConductivity: 65, thicknessMm: 0.01 },
  { id: 'silver', label: 'Silver plating', thermalConductivity: 427, thicknessMm: 0.01 },
  { id: 'custom', label: 'Custom', thermalConductivity: 0.3, thicknessMm: 0.2 },
];

export interface TimPreset {
  id: string;
  label: string;
  thicknessMm: number;
  thermalConductivity: number; // W/(m·K)
}

// Thermal interface material between a coldplate-mounted section and the
// heat sink — same t/(k·A) conduction-resistance idiom as COATING_PRESETS.
export const TIM_PRESETS: TimPreset[] = [
  { id: 'pad', label: 'Silicone gap-pad (~3 W/m·K)', thicknessMm: 1.0, thermalConductivity: 3.0 },
  { id: 'grease', label: 'Thermal grease (~5 W/m·K)', thicknessMm: 0.1, thermalConductivity: 5.0 },
  { id: 'graphite', label: 'Graphite pad (~5 W/m·K through-plane)', thicknessMm: 0.25, thermalConductivity: 5.0 },
  { id: 'custom', label: 'Custom', thicknessMm: 0.5, thermalConductivity: 3.0 },
];

export interface CoolantPreset {
  id: string;
  label: string;
  densityKgPerM3: number;
  specificHeatJPerKgK: number;
}

export const COOLANT_PRESETS: CoolantPreset[] = [
  { id: 'water', label: 'Water', densityKgPerM3: 997, specificHeatJPerKgK: 4186 },
  { id: 'glycol50', label: '50/50 water-glycol', densityKgPerM3: 1050, specificHeatJPerKgK: 3300 },
  { id: 'oil', label: 'Dielectric oil', densityKgPerM3: 860, specificHeatJPerKgK: 1900 },
  { id: 'custom', label: 'Custom', densityKgPerM3: 1000, specificHeatJPerKgK: 4186 },
];
