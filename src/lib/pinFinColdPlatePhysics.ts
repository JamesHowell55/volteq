// Pin-fin cold plate — pressure drop and thermal performance of a direct-cooled
// cold plate whose flow passage is a single offset (staggered) circular pin-fin
// array, for a choice of coolants: water / ethylene-glycol mixtures of any ratio,
// dielectric fluids (3M Novec 7200 / 7100) and Castrol Brayco Micronic 889.
//
// Array model — identical correlations to the pin-fin sections of the Cold Plate
// Designer (single source of truth, imported from coldPlatePhysics.ts):
//  • Geometry: pins of diameter D and height H on a staggered grid with transverse
//    pitch S_T and longitudinal (row-to-row) pitch S_L. N_rows rows along the flow
//    and N_across pins per row; alternate rows are shifted by S_T/2 (the "offset"),
//    so the passage is W = (N_across + ½)·S_T wide and L = N_rows·S_L long.
//  • Approach velocity u = Q/(W·H); the maximum gap velocity is u·(max-velocity
//    ratio) where the ratio is the transverse gap a/(a−1) or, for tight
//    longitudinal pitch, the diagonal gap a/(2(c−1)) (a = S_T/D, b = S_L/D).
//  • Pressure drop: Gaddis-Gnielinski (VDI Heat Atlas) staggered drag coefficient
//    per row, ΔP_array = ½·ζ·N_rows·ρ·u_max² (× an optional calibration factor).
//  • Heat transfer: Zukauskas staggered tube-bank Nusselt on u_max and D, each pin
//    derated by circular-fin efficiency tanh(mL)/mL, plus the bare base between pins.
//  • Inlet/outlet ports: optional sudden-contraction (K=0.5) and expansion (K=1.0)
//    losses on the port velocity.
//
// Fluids — see FLUID NOTES below for the provenance of every property.

import { staggeredPinDrag, staggeredPinNusselt } from './coldPlatePhysics';

// ─────────────────────────── Fluid property library ───────────────────────────

export interface FluidProps {
  rho: number; // kg/m³
  mu: number;  // Pa·s (dynamic)
  nu: number;  // m²/s (kinematic)
  k: number;   // W/(m·K)
  cp: number;  // J/(kg·K)
  pr: number;
}

export type FluidKind = 'water-glycol' | 'novec7200' | 'novec7100' | 'brayco889' | 'custom';

export interface FluidChoice {
  kind: FluidKind;
  glycolMassPct: number; // ethylene glycol by mass, water-glycol only (0–60)
  custom?: { rho: number; nuCst: number; k: number; cp: number };
}

export const FLUID_KIND_LABELS: Record<FluidKind, string> = {
  'water-glycol': 'Water / ethylene glycol',
  novec7200: 'Dielectric — 3M Novec 7200 (HFE-7200)',
  novec7100: 'Dielectric — 3M Novec 7100 (HFE-7100)',
  brayco889: 'Castrol Brayco Micronic 889 (PAO)',
  custom: 'Custom fluid',
};

/** Least-squares polynomial fit y = Σ c_i x^i (small, well-conditioned problems). */
function polyfit(xs: number[], ys: number[], deg: number): number[] {
  const n = deg + 1;
  const A: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) A[r][c] = xs.reduce((s, x) => s + Math.pow(x, r + c), 0);
    A[r][n] = xs.reduce((s, x, i) => s + ys[i] * Math.pow(x, r), 0);
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}
const polyval = (c: number[], x: number) => c.reduce((s, ci, i) => s + ci * Math.pow(x, i), 0);

function interp1(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  }
  return ys[ys.length - 1];
}

// ── FLUID NOTES ──
// Water / ethylene glycol (mass fraction w, 0–60 %):
//  • Density ρ(w,T) and specific heat cp(w,T): Engineering ToolBox ethylene-glycol
//    tables (ASHRAE-derived, mass-fraction basis, −50…100 °C). A quadratic in T is
//    fitted per concentration column and the coefficients are interpolated in w.
//  • Dynamic viscosity μ(w,T): Engineering ToolBox glycol viscosity table (given by
//    volume %, converted to mass %). An Andrade fit ln μ = A + B/T is made per
//    concentration column and ln μ is interpolated linearly in w; the w=0 column is
//    the Vogel water correlation μ = 2.414e-5·10^(247.8/(T−140)) (T in K).
//  • Thermal conductivity k(w,T): Filippov mixing rule on pure-water k(T) and pure
//    ethylene-glycol k(T) (≈0.258 W/m·K at 20 °C) — a first-order estimate, ±5 %.
const EG_W_DENSITY = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
const EG_T_DENSITY = [-48, -35, -25, -14, -8, -4, 0, 20, 40, 60, 80, 100];
// rows = mass fraction, null = not tabulated (below freezing)
const EG_DENSITY: (number | null)[][] = [
  [null, null, null, null, null, null, 1000, 998, 992, 983, 972, 958],
  [null, null, null, null, null, 1019, 1018, 1014, 1008, 1000, 992, 984],
  [null, null, null, null, 1038, 1037, 1036, 1030, 1022, 1014, 1005, 995],
  [null, null, null, 1058, 1056, 1055, 1054, 1046, 1037, 1027, 1017, 1007],
  [null, null, 1080, 1077, 1075, 1073, 1072, 1063, 1052, 1041, 1030, 1018],
  [null, 1103, 1100, 1096, 1093, 1092, 1090, 1079, 1067, 1055, 1042, 1030],
  [1127, 1124, 1120, 1115, 1112, 1110, 1107, 1095, 1082, 1068, 1055, 1042],
];
const EG_T_CP = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const BTU_LB_F = 4186.8; // J/(kg·K) per Btu/(lb·°F)
const EG_CP: (number | null)[][] = [
  [null, null, null, null, null, 1.0038, 1.0018, 1.0004, 0.99943, 0.99902, 0.99913, 0.99978, 1.0009, 1.0026, 1.0049, 1.0076],
  [null, null, null, null, null, 0.97236, 0.97422, 0.97619, 0.97827, 0.98047, 0.98279, 0.98521, 0.98776, 0.99041, 0.99318, 0.99607],
  [null, null, null, null, null, 0.93576, 0.93976, 0.94375, 0.94775, 0.95175, 0.95574, 0.95974, 0.96373, 0.96773, 0.97173, 0.97572],
  [null, null, null, null, 0.89373, 0.89889, 0.90405, 0.9092, 0.91436, 0.91951, 0.92467, 0.92982, 0.93498, 0.94013, 0.94529, 0.95044],
  [null, null, null, 0.84605, 0.85232, 0.85858, 0.86484, 0.87111, 0.87737, 0.88364, 0.8899, 0.89616, 0.90243, 0.90869, 0.91496, 0.92122],
  [null, null, 0.79288, 0.80021, 0.80753, 0.81485, 0.82217, 0.82949, 0.83682, 0.84414, 0.85146, 0.85878, 0.8661, 0.87343, 0.88075, 0.88807],
  [0.72603, 0.73436, 0.74269, 0.75102, 0.75935, 0.76768, 0.77601, 0.78434, 0.79267, 0.801, 0.80933, 0.81766, 0.82599, 0.83431, 0.84264, 0.85097],
];
// Viscosity (cP) from the ToolBox table by VOLUME %, columns 25/30/40/50/60 vol %, at °C.
const EG_VISC_T = [-17.8, 4.4, 26.7, 48.9, 71.1, 93.3];
const EG_VISC_VOL = [25, 30, 40, 50, 60];
const EG_VISC_CP: (number | null)[][] = [ // [T][vol%]
  [null, null, 15, 22, 35],
  [3, 3.5, 4.8, 6.5, 9],
  [1.5, 1.7, 2.2, 2.8, 3.8],
  [0.9, 1, 1.3, 1.5, 2],
  [0.65, 0.7, 0.8, 0.95, 1.3],
  [0.48, 0.5, 0.6, 0.7, 0.88],
];
const RHO_EG20 = 1113, RHO_W20 = 998;
const volToMass = (vol: number) => {
  const v = vol / 100;
  return (v * RHO_EG20) / (v * RHO_EG20 + (1 - v) * RHO_W20);
};

function fitColumns(ws: number[], ts: number[], table: (number | null)[][], scale: number, deg: number): number[][] {
  return ws.map((_, i) => {
    const px: number[] = [], py: number[] = [];
    table[i].forEach((v, j) => { if (v !== null) { px.push(ts[j]); py.push(v * scale); } });
    return polyfit(px, py, deg);
  });
}
const EG_DENSITY_COEF = fitColumns(EG_W_DENSITY, EG_T_DENSITY, EG_DENSITY, 1, 2);
const EG_CP_COEF = fitColumns(EG_W_DENSITY, EG_T_CP, EG_CP, BTU_LB_F, 2);

const EG_VISC_W = EG_VISC_VOL.map(volToMass);
const EG_VISC_COEF: number[][] = EG_VISC_VOL.map((_, ci) => {
  const px: number[] = [], py: number[] = [];
  EG_VISC_T.forEach((t, ti) => {
    const v = EG_VISC_CP[ti][ci];
    if (v !== null) { px.push(1 / (t + 273.15)); py.push(Math.log(v / 1000)); }
  });
  return polyfit(px, py, 1);
});

function coefInterp(ws: number[], coefs: number[][], w: number): number[] {
  const wc = Math.min(Math.max(w, ws[0]), ws[ws.length - 1]);
  for (let i = 1; i < ws.length; i++) {
    if (wc <= ws[i]) {
      const t = (wc - ws[i - 1]) / (ws[i] - ws[i - 1]);
      return coefs[i].map((c, k) => coefs[i - 1][k] + t * (c - coefs[i - 1][k]));
    }
  }
  return coefs[coefs.length - 1];
}

function waterViscosityPas(tC: number): number {
  return 2.414e-5 * Math.pow(10, 247.8 / (tC + 273.15 - 140));
}
function waterK(tC: number): number {
  return 0.5636 + 0.001946 * tC - 8.2e-6 * tC * tC;
}
function egK(tC: number): number {
  return 0.258 + 0.0001 * (tC - 20);
}

/** Valid temperature window (°C) for the water/glycol correlations at a mass %. */
export function glycolFreezePointC(massPct: number): number {
  // ToolBox freezing points by vol % → mass %.
  const volPts = [0, 10, 20, 30, 40, 50, 60];
  const fpC = [0, -3.4, -7.9, -13.7, -23.5, -36.8, -52.8];
  return interp1(volPts.map(volToMass).map((w) => w * 100), fpC, massPct);
}

function waterGlycolProps(massPct: number, tC: number): FluidProps {
  const w = Math.min(Math.max(massPct, 0), 60) / 100;
  const t = Math.min(Math.max(tC, -40), 100);
  const rho = polyval(coefInterp(EG_W_DENSITY, EG_DENSITY_COEF, w), t);
  const cp = polyval(coefInterp(EG_W_DENSITY, EG_CP_COEF, w), t);
  const lnMuWater = Math.log(waterViscosityPas(t));
  let lnMu: number;
  const invT = 1 / (t + 273.15);
  const lnCols = EG_VISC_COEF.map((c) => c[0] + c[1] * invT);
  if (w <= EG_VISC_W[0]) lnMu = lnMuWater + (w / EG_VISC_W[0]) * (lnCols[0] - lnMuWater);
  else lnMu = interp1(EG_VISC_W, lnCols, w);
  const mu = Math.exp(lnMu);
  const kw = waterK(t), kg = egK(t);
  const k = (1 - w) * kw + w * kg - 0.72 * (kw - kg) * w * (1 - w); // Filippov
  const pr = (cp * mu) / k;
  return { rho, mu, nu: mu / rho, k, cp, pr };
}

// Castrol Brayco Micronic 889 — Castrol product data sheet (PDS 14D1B7).
//  SG 0.85 @16 °C (ASTM D287) → ρ16 = 849 kg/m³; cubic expansion 0.00075 /K is a
//  typical PAO value (NOT on the data sheet). Kinematic viscosity: 1.7 (100 °C),
//  5.1 (40 °C), 250 (−40 °C), 800 (−54 °C) mm²/s → ASTM D341 Walther interpolation.
//  cp: 0.49/0.52/0.54/0.58 cal/g·K at −18/10/38/93 °C (ASTM D2766).
//  k: 0.085/0.083/0.082/0.082 BTU/hr·ft·°F at 0/10/24/38 °C (ASTM D3114).
// Walther (ASTM D341) coordinates: Z = log10(log10(ν+0.7)) vs log10(T[K]) is linear for a
// fluid, so interpolate piecewise-linearly through the four data-sheet points (exact at
// each) and extrapolate with the end-segment slope.
const BRAYCO_NU_T = [-54, -40, 40, 100];
const BRAYCO_NU = [800, 250, 5.1, 1.7];
const BRAYCO_X = BRAYCO_NU_T.map((t) => Math.log10(t + 273.15));
const BRAYCO_Z = BRAYCO_NU.map((n) => Math.log10(Math.log10(n + 0.7)));
export function braycoKinematicCst(tC: number): number {
  const x = Math.log10(tC + 273.15);
  let i = 1;
  while (i < BRAYCO_X.length - 1 && x > BRAYCO_X[i]) i++;
  const z = BRAYCO_Z[i - 1] + ((x - BRAYCO_X[i - 1]) / (BRAYCO_X[i] - BRAYCO_X[i - 1])) * (BRAYCO_Z[i] - BRAYCO_Z[i - 1]);
  return Math.pow(10, Math.pow(10, z)) - 0.7;
}
const CAL_G_K = 4184;
function braycoProps(tC: number): FluidProps {
  const rho = 849 * (1 - 0.00075 * (tC - 16));
  const cp = interp1([-18, 10, 38, 93], [0.49, 0.52, 0.54, 0.58].map((c) => c * CAL_G_K), tC);
  const k = interp1([0, 10, 24, 38], [0.085, 0.083, 0.082, 0.082].map((v) => v * 1.7307), tC);
  const nu = braycoKinematicCst(tC) * 1e-6;
  const mu = nu * rho;
  return { rho, mu, nu, k, cp, pr: (cp * mu) / k };
}

// 3M Novec 7200 — ρ(T) from the 3M data-sheet correlation (1.4811 − 0.0023026·t g/mL);
// cp 1220 J/kg·K @25 °C (3M); k 0.075 W/m·K @25 °C (measured, ASTM D2717 — 3M quotes
// ≈0.069); ν: 0.81/0.63/0.47 cSt at −20/0/25 °C and dynamic 0.561/0.338 cP at 40/100 °C
// (ASTM D445/D7042 on a 7200-equivalent HFE) → monotone interpolation in ln ν vs T.
// cp and k temperature slopes (+3.08 J/kg·K², −0.000196 W/m·K²) are borrowed from the 3M
// Novec 7000 correlations (7200-specific slopes not found) — second-order.
const N7200_NU_T = [-20, 0, 25, 40, 100];
const N7200_NU_CST = [0.81, 0.63, 0.47, 0.561 / (1.4811 - 0.0023026 * 40), 0.338 / (1.4811 - 0.0023026 * 100)];
// (the last two entries convert the dynamic viscosity in cP to cSt: μ[cP]/ρ[g/mL])
function novec7200Props(tC: number): FluidProps {
  const rho = (1.4811 - 0.0023026 * tC) * 1000;
  const nu = Math.exp(interp1(N7200_NU_T, N7200_NU_CST.map(Math.log), tC)) * 1e-6;
  const cp = 1220 + 3.08 * (tC - 25);
  const k = 0.075 - 0.000196 * (tC - 25);
  const mu = nu * rho;
  return { rho, mu, nu, k, cp, pr: (cp * mu) / k };
}
// 3M Novec 7100 — ρ 1510 kg/m³ @25 °C with 0.0018 /K expansion; cp 1183 J/kg·K; k 0.069 W/m·K;
// ν 0.38 cSt @25 °C. Temperature dependence of ν is NOT tabulated in the sources found, so
// it follows the Novec 7200 curve scaled to 0.38 cSt at 25 °C (approximate, flagged in UI).
function novec7100Props(tC: number): FluidProps {
  const rho = 1510 * (1 - 0.0018 * (tC - 25));
  const shape = Math.exp(interp1(N7200_NU_T, N7200_NU_CST.map(Math.log), tC)) / 0.47;
  const nu = 0.38 * shape * 1e-6;
  const cp = 1183 + 3.08 * (tC - 25);
  const k = 0.069 - 0.000196 * (tC - 25);
  const mu = nu * rho;
  return { rho, mu, nu, k, cp, pr: (cp * mu) / k };
}

export function fluidProps(choice: FluidChoice, tC: number): FluidProps {
  switch (choice.kind) {
    case 'water-glycol': return waterGlycolProps(choice.glycolMassPct, tC);
    case 'brayco889': return braycoProps(tC);
    case 'novec7200': return novec7200Props(tC);
    case 'novec7100': return novec7100Props(tC);
    case 'custom': {
      const c = choice.custom ?? { rho: 1000, nuCst: 1, k: 0.6, cp: 4186 };
      const nu = c.nuCst * 1e-6;
      const mu = nu * c.rho;
      return { rho: c.rho, mu, nu, k: c.k, cp: c.cp, pr: (c.cp * mu) / c.k };
    }
  }
}

/** Recommended operating window (°C) for the fluid's data — outside it values extrapolate. */
export function fluidTempWindowC(choice: FluidChoice): [number, number] {
  switch (choice.kind) {
    case 'water-glycol': return [Math.max(-40, Math.ceil(glycolFreezePointC(choice.glycolMassPct) + 3)), 100];
    case 'brayco889': return [-54, 135];
    case 'novec7200': return [-20, 70];
    case 'novec7100': return [-20, 55];
    default: return [-50, 200];
  }
}

// ─────────────────────────────── Pin-fin solver ───────────────────────────────

export interface PinArrayGeometry {
  diaMm: number;
  heightMm: number;
  pitchTransverseMm: number;
  pitchLongitudinalMm: number;
  rowsAlongFlow: number; // N_rows
  pinsAcross: number;    // pins per row
  pinConductivityWmK: number;
  tipBoundary: 'convecting' | 'adiabatic';
}

export interface PinColdPlateInput {
  fluid: FluidChoice;
  geometry: PinArrayGeometry;
  flowLpm: number;
  heatLoadW: number;
  inletTempC: number;
  portDiameterMm: number; // 0 = ignore port losses
  dpCalibration: number;  // multiplier on the array ΔP (1 = pure correlation)
  baseThicknessMm: number;
  baseConductivityWmK: number; // 0 = skip base conduction
}

export interface PinColdPlateResult {
  fluid: FluidProps;
  meanFluidTempC: number;
  widthMm: number;
  lengthMm: number;
  pinCount: number;
  pitchRatioA: number;
  pitchRatioB: number;
  approachVelocity: number;
  maxVelocity: number;
  maxVelRatio: number;
  diagonalGoverns: boolean;
  reynolds: number;          // on pin diameter & max velocity
  dragCoeff: number;         // ζ per row
  arrayDropPa: number;
  portDropPa: number;
  totalDropPa: number;
  hydraulicPowerW: number;
  nusselt: number;
  htc: number;
  finEfficiency: number;
  wettedAreaCm2: number;
  uaWPerK: number;
  rConvKPerW: number;
  rCaloricKPerW: number;
  rBaseKPerW: number;
  rTotalKPerW: number;
  fluidDeltaTC: number;
  outletTempC: number;
  baseTempC: number;         // pin base (wetted wall)
  moduleTempC: number;       // incl. base conduction
  warnings: string[];
}

export function solvePinColdPlate(inp: PinColdPlateInput): PinColdPlateResult {
  const g = inp.geometry;
  const dM = Math.max(g.diaMm, 1e-6) / 1000;
  const hM = Math.max(g.heightMm, 1e-6) / 1000;
  const stM = g.pitchTransverseMm / 1000;
  const slM = g.pitchLongitudinalMm / 1000;
  const nRows = Math.max(1, Math.round(g.rowsAlongFlow));
  const nAcross = Math.max(1, Math.round(g.pinsAcross));
  const warnings: string[] = [];

  let a = stM / dM, b = slM / dM;
  if (a <= 1.05 || b <= 1.05) {
    warnings.push('Pitch ≤ pin diameter — clamped to 1.05·D; choose spacing larger than the pin diameter.');
    a = Math.max(a, 1.05); b = Math.max(b, 1.05);
  }
  const wM = (nAcross + 0.5) * stM;
  const lM = nRows * slM;
  const q = Math.max(inp.flowLpm, 0) / 1000 / 60;
  const uApproach = wM * hM > 0 ? q / (wM * hM) : 0;
  const drag1 = staggeredPinDrag(1, a, b);
  const uMax = uApproach * drag1.maxVelRatio;

  // Fluid properties at the bulk mean temperature (inlet + ΔT/2) — iterate to converge.
  let tMean = inp.inletTempC;
  let fp = fluidProps(inp.fluid, tMean);
  for (let i = 0; i < 4; i++) {
    const dT = q * fp.rho * fp.cp > 0 ? inp.heatLoadW / (q * fp.rho * fp.cp) : 0;
    tMean = inp.inletTempC + dT / 2;
    fp = fluidProps(inp.fluid, tMean);
  }

  const re = fp.nu > 0 ? (uMax * dM) / fp.nu : 0;
  const { dragCoeff } = staggeredPinDrag(Math.max(re, 1), a, b);
  const arrayDrop = 0.5 * dragCoeff * nRows * fp.rho * uMax * uMax * Math.max(inp.dpCalibration, 0);

  const portDM = inp.portDiameterMm / 1000;
  let portDrop = 0;
  if (portDM > 0) {
    const vPort = q / (Math.PI * portDM * portDM / 4);
    portDrop = (0.5 + 1.0) * 0.5 * fp.rho * vPort * vPort;
  }
  const totalDrop = arrayDrop + portDrop;

  const nu = staggeredPinNusselt(Math.max(re, 1), fp.pr, a, b, nRows);
  const htc = (nu * fp.k) / dM;
  const nPins = nRows * nAcross;
  const pinFoot = nPins * Math.PI * dM * dM / 4;
  const baseArea = Math.max(0, wM * lM - pinFoot);
  const m = Math.sqrt((4 * htc) / (Math.max(1, g.pinConductivityWmK) * dM));
  const effLen = g.tipBoundary === 'convecting' ? hM + dM / 4 : hM;
  const finEff = m * effLen > 0 ? Math.tanh(m * effLen) / (m * effLen) : 1;
  const effArea = baseArea + finEff * nPins * Math.PI * dM * effLen;
  const ua = htc * effArea;
  const mdot = fp.rho * q;
  const rConv = ua > 0 ? 1 / ua : Infinity;
  const rCal = mdot * fp.cp > 0 ? 1 / (2 * mdot * fp.cp) : Infinity;
  const rBase = inp.baseConductivityWmK > 0 && wM * lM > 0
    ? (inp.baseThicknessMm / 1000) / (inp.baseConductivityWmK * wM * lM) : 0;
  const rFluid = rConv + rCal;
  const dTfluid = mdot * fp.cp > 0 ? inp.heatLoadW / (mdot * fp.cp) : 0;

  if (b > 3 || a > 3 || a < 1.25 || b < 1.25) {
    warnings.push(`Pitch ratios S_T/D = ${a.toFixed(2)}, S_L/D = ${b.toFixed(2)} — Zukauskas/Gaddis-Gnielinski are best validated for roughly 1.25–3; treat results as extrapolated.`);
  }
  if (hM / dM < 1) warnings.push('Pin height < diameter: end-wall effects dominate — array correlations (derived for tall tubes) are less reliable; consider a ΔP calibration factor from test.');
  if (nRows < 5) warnings.push(`Only ${nRows} row${nRows === 1 ? '' : 's'} along the flow — the few-row inlet/outlet correction is neglected, so ΔP is approximate (best for ≳10 rows).`);
  if (re > 0 && re < 10) warnings.push('Max-gap Reynolds < 10 — outside the Zukauskas range; heat transfer is an extrapolation.');
  const [tLo, tHi] = fluidTempWindowC(inp.fluid);
  if (tMean < tLo || tMean > tHi) warnings.push(`Mean fluid temperature ${tMean.toFixed(0)} °C is outside the fluid's data range (${tLo}–${tHi} °C); properties are extrapolated or near freezing.`);
  if (inp.fluid.kind === 'novec7100') warnings.push('Novec 7100: ν(T) shape is borrowed from Novec 7200 (only the 25 °C value is documented) — approximate away from 25 °C.');
  const tLocalMax = inp.inletTempC + dTfluid + inp.heatLoadW * rConv;
  if (inp.fluid.kind === 'novec7200' && tLocalMax > 76) warnings.push('Wall/outlet temperature exceeds the Novec 7200 boiling point (76 °C) — single-phase assumption invalid.');
  if (inp.fluid.kind === 'novec7100' && tLocalMax > 61) warnings.push('Wall/outlet temperature exceeds the Novec 7100 boiling point (61 °C) — single-phase assumption invalid.');

  return {
    fluid: fp, meanFluidTempC: tMean,
    widthMm: wM * 1000, lengthMm: lM * 1000, pinCount: nPins,
    pitchRatioA: a, pitchRatioB: b,
    approachVelocity: uApproach, maxVelocity: uMax, maxVelRatio: drag1.maxVelRatio, diagonalGoverns: drag1.diagonalGoverns,
    reynolds: re, dragCoeff,
    arrayDropPa: arrayDrop, portDropPa: portDrop, totalDropPa: totalDrop, hydraulicPowerW: q * totalDrop,
    nusselt: nu, htc, finEfficiency: finEff, wettedAreaCm2: effArea * 1e4, uaWPerK: ua,
    rConvKPerW: rConv, rCaloricKPerW: rCal, rBaseKPerW: rBase, rTotalKPerW: rFluid + rBase,
    fluidDeltaTC: dTfluid, outletTempC: inp.inletTempC + dTfluid,
    baseTempC: inp.inletTempC + inp.heatLoadW * rFluid,
    moduleTempC: inp.inletTempC + inp.heatLoadW * (rFluid + rBase),
    warnings,
  };
}

export interface SweepPoint { flowLpm: number; dropKPa: number; rKPerW: number; reynolds: number }

/** Flow rates for a sweep: the design flow ± spanLpm in stepLpm increments (positive flows only). */
export function sweepFlowRates(centreLpm: number, spanLpm = 5, stepLpm = 1): number[] {
  const n = Math.round(spanLpm / stepLpm);
  const flows: number[] = [];
  for (let i = -n; i <= n; i++) {
    const f = Math.round((centreLpm + i * stepLpm) * 1000) / 1000;
    if (f > 0) flows.push(f);
  }
  return flows;
}

/** ΔP and thermal resistance at each flow rate for the same geometry/fluid. */
export function sweepFlow(inp: PinColdPlateInput, flowsLpm: number[]): SweepPoint[] {
  return flowsLpm.map((f) => {
    const r = solvePinColdPlate({ ...inp, flowLpm: f });
    return { flowLpm: f, dropKPa: r.totalDropPa / 1000, rKPerW: r.rTotalKPerW, reynolds: r.reynolds };
  });
}
