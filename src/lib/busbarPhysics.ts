import type { Material, CoolantPreset } from './materials';

export interface BarSection {
  id: string;
  width: number;    // mm — vertical (convection height) dimension when edge-mounted
  thickness: number; // mm — dimension along the paralleling/stacking direction
  gapAfter: number;  // mm — air gap to the next bar (ignored for the last bar)
}

export type Orientation = 'vertical' | 'horizontal';
export type CurrentType = 'ac' | 'dc';
export type DurationMode = 'continuous' | 'fault' | 'profile';
export type BusbarType = 'single' | 'multiple';

export const STEFAN_BOLTZMANN = 5.67e-8; // W/(m²K⁴)
export const DEFAULT_NATURAL_CONVECTION_H = 5; // W/(m²K), typical still-air value for busbars

/** Fundamental electrical frequency produced by a motor drive: f = n·p / 60 */
export function motorElectricalFrequency(speedRpm: number, polePairs: number): number {
  return (speedRpm * polePairs) / 60;
}

/** IEC 60865-1 style resistivity referenced through β so ρ(θ)=ρ20·(β+θ)/(β+20) */
export function resistivityAt(material: Material, tempC: number): number {
  return material.rho20 * (material.beta + tempC) / (material.beta + 20);
}

export function totalCrossSectionArea(bars: BarSection[]): number {
  return bars.reduce((sum, b) => sum + b.width * b.thickness, 0); // mm²
}

/** Exposed convective/radiative perimeter per metre of run length, in m²/m.
 *  Faces bounding a gap narrower than the bar thickness are treated as
 *  progressively "choked" (no free air circulation) — a simplified,
 *  clearly-approximate stand-in for real proximity/enclosure effects. */
export function exposedSurfaceAreaPerMetre(bars: BarSection[]): number {
  if (bars.length === 0) return 0;
  let perimeterMm = 0;
  bars.forEach((bar, i) => {
    const leftGap = i === 0 ? Infinity : bars[i - 1].gapAfter;
    const rightGap = i === bars.length - 1 ? Infinity : bar.gapAfter;
    const leftRef = i === 0 ? bar.thickness : Math.min(bars[i - 1].thickness, bar.thickness);
    const rightRef = i === bars.length - 1 ? bar.thickness : Math.min(bar.thickness, bars[i + 1].thickness);
    const leftExposure = i === 0 ? 1 : clamp01(leftGap / leftRef);
    const rightExposure = i === bars.length - 1 ? 1 : clamp01(rightGap / rightRef);
    perimeterMm += bar.width * (leftExposure + rightExposure); // two large faces
    perimeterMm += 2 * bar.thickness; // top + bottom edges, always open
  });
  return perimeterMm / 1000; // mm -> m, gives m²/m directly (perimeter[m] x 1m length)
}

function clamp01(x: number): number {
  if (!isFinite(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

/** DC resistance per metre at a given conductor temperature, Ω/m */
export function dcResistancePerMetre(material: Material, tempC: number, totalAreaMm2: number): number {
  const rho = resistivityAt(material, tempC); // Ω·m
  const areaM2 = totalAreaMm2 * 1e-6;
  return rho / areaM2;
}

/** IEC 60287-1-1 skin-effect factor, adapted for a solid busbar bundle (shape factor ks'=1). */
export function skinEffectFactor(rdcPerM: number, frequencyHz: number): { xs2: number; ys: number; ks: number } {
  if (frequencyHz <= 0 || rdcPerM <= 0) return { xs2: 0, ys: 0, ks: 1 };
  const xs2 = ((8 * Math.PI * frequencyHz) / rdcPerM) * 1e-7;
  const ys = (xs2 * xs2) / (192 + 0.8 * xs2 * xs2);
  return { xs2, ys, ks: 1 + ys };
}

export interface ConvectionResult {
  h: number;      // W/(m²K)
  charLength: number; // m
  constant: number;
}

/** Simplified McAdams-style natural-convection coefficient for a vertical or
 *  flat-mounted plate in still air: h = C·(ΔT / L)^0.25 */
export function convectionCoefficient(deltaT: number, charLengthM: number, orientation: Orientation): ConvectionResult {
  const constant = orientation === 'vertical' ? 1.42 : 1.0;
  const dt = Math.max(deltaT, 0.01);
  const h = constant * Math.pow(dt / Math.max(charLengthM, 0.001), 0.25);
  return { h, charLength: charLengthM, constant };
}

function effectiveConvection(deltaT: number, charLengthM: number, orientation: Orientation, manualH: number | null): number {
  return manualH ?? convectionCoefficient(deltaT, charLengthM, orientation).h;
}

/** Combines the coating's conduction resistance in series with the
 *  convection+radiation film resistance, giving an effective ambient
 *  conductance (W/K) referenced to the conductor temperature. A coating
 *  traps heat (raises conductor temp for the same current) even though it
 *  may also raise emissivity — both effects are modelled independently. */
function effectiveAmbientConductance(hEff: number, surfaceAreaM2: number, coatingThicknessMm: number, coatingConductivity: number): number {
  const filmR = 1 / (hEff * surfaceAreaM2);
  const coatR = coatingThicknessMm > 0 ? (coatingThicknessMm / 1000) / (coatingConductivity * surfaceAreaM2) : 0;
  return 1 / (filmR + coatR);
}

/** Combined conductance (W/K) of a coldplate-mounted section's heat path:
 *  TIM + heat-sink material + coolant-side film, all in series, same
 *  thickness/(k·A) idiom as effectiveAmbientConductance's coating term.
 *  Returns 0 if the section has no contact area (not conductively cooled). */
export function coldplateConductanceWPerK(
  contactAreaM2: number,
  timThicknessMm: number,
  timConductivity: number,
  heatSinkThicknessMm: number,
  heatSinkConductivity: number,
  coolantFilmH: number
): number {
  if (contactAreaM2 <= 0) return 0;
  const rTim = (timThicknessMm / 1000) / (timConductivity * contactAreaM2);
  const rPlate = (heatSinkThicknessMm / 1000) / (heatSinkConductivity * contactAreaM2);
  const rFilm = 1 / (coolantFilmH * contactAreaM2);
  return 1 / (rTim + rPlate + rFilm);
}

/** Coolant temperature rise across the loop from an energy balance,
 *  ΔT = Q/(ṁ·cp) — informational only (see BusbarCalculator.tsx): not fed
 *  back into the node solve, which uses the specified inlet temperature as a
 *  fixed reservoir, exactly like ambient air. */
export function coolantTemperatureRiseK(totalHeatW: number, flowRateLPerMin: number, coolant: CoolantPreset): number {
  if (flowRateLPerMin <= 0) return 0;
  const massFlowKgPerS = (flowRateLPerMin / 60000) * coolant.densityKgPerM3; // L/min -> m³/s -> kg/s
  if (massFlowKgPerS <= 0) return 0;
  return totalHeatW / (massFlowKgPerS * coolant.specificHeatJPerKgK);
}

export interface AdiabaticInputs {
  material: Material;
  totalAreaMm2: number;
  current: number;
  durationS: number;
  initialTempC: number;
}

export interface AdiabaticResult {
  currentDensity: number; // A/mm²
  finalTempC: number;
  tempRiseK: number;
  exponent: number;
}

/** IEC 60865-1 adiabatic short-time heating: θf = (θi+β)·exp[(J/K)²·t] − β */
export function solveAdiabatic(inp: AdiabaticInputs): AdiabaticResult {
  const J = inp.current / inp.totalAreaMm2;
  const beta = inp.material.beta;
  const K = inp.material.kAdiabatic;
  const exponent = ((J * J) / (K * K)) * inp.durationS;
  const finalTempC = (inp.initialTempC + beta) * Math.exp(exponent) - beta;
  return {
    currentDensity: J,
    finalTempC,
    tempRiseK: finalTempC - inp.initialTempC,
    exponent,
  };
}

/** Minimum cross-section (mm²) to keep a fault within maxTempC for durationS. */
export function solveMinAreaForFault(material: Material, current: number, durationS: number, initialTempC: number, maxTempC: number): number {
  const beta = material.beta;
  const K = material.kAdiabatic;
  const lnTerm = Math.log((maxTempC + beta) / (initialTempC + beta));
  if (lnTerm <= 0) return Infinity;
  return (current * Math.sqrt(durationS)) / (K * Math.sqrt(lnTerm));
}

// ─────────────────────────────────────────────────────────────────
// Generic nodal thermal network
//
// A busbar (single, variable cross-section, or a stacked bundle
// simplified to one lumped node) is represented as a chain of thermal
// nodes. Adjacent nodes exchange heat by axial conduction through the
// solid metal; every node also exchanges heat with ambient air by
// convection + radiation, and generates I²R heat internally. This is
// the standard "extended surface with internal heat generation"
// (generalised fin) formulation, discretised into a tridiagonal
// system and solved with the Thomas algorithm.
// ─────────────────────────────────────────────────────────────────

export interface ThermalNode {
  id: string;
  label: string;
  areaMm2: number;       // cross-sectional area, mm²
  lengthM: number;       // physical length of this node, m
  surfaceAreaM2: number; // total exposed convective/radiative area, m² (not per metre)
  charLengthM: number;   // characteristic length for the convection correlation, m
  contactAreaM2: number; // coldplate contact face area, m² (0 if not conductively cooled)
}

export interface SingleSectionInput {
  id: string;
  width: number;  // mm
  length: number; // mm
  coolingEnabled?: boolean; // mounted to a coldplate via a TIM
}

export function buildSingleBusbarNodes(sections: SingleSectionInput[], thicknessMm: number): ThermalNode[] {
  return sections.map((s, i) => {
    const areaMm2 = s.width * thicknessMm;
    const lengthM = s.length / 1000;
    // A coldplate-mounted section is assumed bonded via one full width×length
    // face — that face is removed from the air-exposed perimeter (previously
    // both large faces + 2 edges; a cooled section keeps one large face + 2
    // edges), not just given an additional parallel path on top of full air
    // exposure, since that face physically isn't touching open air anymore.
    const perimeterM = s.coolingEnabled
      ? (s.width + 2 * thicknessMm) / 1000
      : (2 * s.width + 2 * thicknessMm) / 1000;
    const contactAreaM2 = s.coolingEnabled ? (s.width / 1000) * lengthM : 0;
    return {
      id: s.id,
      label: `Section ${i + 1}`,
      areaMm2,
      lengthM,
      surfaceAreaM2: perimeterM * lengthM,
      charLengthM: s.width / 1000,
      contactAreaM2,
    };
  });
}

export function buildMultipleBarNodes(profileWidthMm: number, profileThicknessMm: number, nBars: number, gapMm: number, circuitLengthM: number): ThermalNode[] {
  const bars: BarSection[] = Array.from({ length: nBars }, (_, i) => ({
    id: `bar-${i}`,
    width: profileWidthMm,
    thickness: profileThicknessMm,
    gapAfter: gapMm,
  }));
  const totalAreaMm2 = totalCrossSectionArea(bars);
  const surfacePerM = exposedSurfaceAreaPerMetre(bars);
  return [{
    id: 'bundle',
    label: `${nBars}-bar bundle`,
    areaMm2: totalAreaMm2,
    lengthM: circuitLengthM,
    surfaceAreaM2: surfacePerM * circuitLengthM,
    charLengthM: profileWidthMm / 1000,
    contactAreaM2: 0, // conductive cooling only applies in single-section mode
  }];
}

function conductionConductances(nodes: ThermalNode[], thermalConductivity: number): number[] {
  const g: number[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const r = (a.lengthM / 2) / (thermalConductivity * (a.areaMm2 * 1e-6)) + (b.lengthM / 2) / (thermalConductivity * (b.areaMm2 * 1e-6));
    g.push(1 / r);
  }
  return g;
}

/** Thomas algorithm for a tridiagonal system. lower[0] and upper[n-1] are unused. */
function solveTridiagonal(lower: number[], diag: number[], upper: number[], rhs: number[]): number[] {
  const n = diag.length;
  const cPrime = new Array(n).fill(0);
  const dPrime = new Array(n).fill(0);
  cPrime[0] = upper[0] / diag[0];
  dPrime[0] = rhs[0] / diag[0];
  for (let i = 1; i < n; i++) {
    const m = diag[i] - lower[i] * cPrime[i - 1];
    cPrime[i] = i < n - 1 ? upper[i] / m : 0;
    dPrime[i] = (rhs[i] - lower[i] * dPrime[i - 1]) / m;
  }
  const x = new Array(n).fill(0);
  x[n - 1] = dPrime[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    x[i] = dPrime[i] - cPrime[i] * x[i + 1];
  }
  return x;
}

export interface NodalSteadyStateResult {
  tempsC: number[];
  currentDensities: number[];
  racTotalPerNode: number[]; // Ω, actual (not per-metre)
  ksPerNode: number[];
  powerLossPerNodeW: number[];
  convLossPerNodeW: number[];
  radLossPerNodeW: number[];
  coolantLossPerNodeW: number[]; // heat leaving via the coldplate path, per node
  conductionFlowsW: number[]; // between node i,i+1 — positive = flowing i -> i+1
  hEffPerNode: number[];
  iterations: number;
}

export function solveNodalSteadyState(
  nodes: ThermalNode[],
  material: Material,
  current: number,
  currentType: CurrentType,
  frequencyHz: number,
  ambientC: number,
  emissivity: number,
  orientation: Orientation,
  manualH: number | null,
  coatingThicknessMm = 0,
  coatingConductivity = 0.3,
  coolantConductancePerNode: number[] = [],
  coolantTempC = 0
): NodalSteadyStateResult {
  const n = nodes.length;
  const condG = conductionConductances(nodes, material.thermalConductivity);
  const gCoolant = (i: number) => coolantConductancePerNode[i] ?? 0;
  let temps = new Array(n).fill(ambientC + 20);
  let iterations = 0;
  const relax = 0.5; // damping factor — the radiation term is nonlinear enough that a direct fixed-point update can oscillate/diverge at high power densities

  for (let iter = 0; iter < 200; iter++) {
    iterations++;
    const lower = new Array(n).fill(0);
    const diag = new Array(n).fill(0);
    const upper = new Array(n).fill(0);
    const rhs = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const rdcPerM = dcResistancePerMetre(material, temps[i], node.areaMm2);
      const ks = currentType === 'ac' ? skinEffectFactor(rdcPerM, frequencyHz).ks : 1;
      const racTotal = rdcPerM * ks * node.lengthM;
      const pGen = current * current * racTotal;

      const deltaT = temps[i] - ambientC;
      const hConv = effectiveConvection(deltaT, node.charLengthM, orientation, manualH);
      const hRadLin = emissivity * STEFAN_BOLTZMANN * 4 * Math.pow(Math.max(temps[i] + 273.15, 1), 3);
      const hEff = hConv + hRadLin;
      const gAmb = effectiveAmbientConductance(hEff, node.surfaceAreaM2, coatingThicknessMm, coatingConductivity);

      // Two parallel sink paths to two different reservoirs (air, coolant) —
      // each contributes its own conductance to the diagonal and its own
      // reservoir·conductance term to the RHS, an exact linear extension.
      let diagVal = gAmb + gCoolant(i);
      const rhsVal = pGen + gAmb * ambientC + gCoolant(i) * coolantTempC;
      if (i > 0) { diagVal += condG[i - 1]; lower[i] = -condG[i - 1]; }
      if (i < n - 1) { diagVal += condG[i]; upper[i] = -condG[i]; }
      diag[i] = diagVal;
      rhs[i] = rhsVal;
    }

    const newTemps = solveTridiagonal(lower, diag, upper, rhs);
    const relaxedTemps = temps.map((t, i) => t + relax * (newTemps[i] - t));
    const maxDelta = Math.max(...relaxedTemps.map((t, i) => Math.abs(t - temps[i])));
    temps = relaxedTemps;
    if (maxDelta < 1e-4) break;
  }

  const currentDensities = new Array(n).fill(0);
  const racTotalPerNode = new Array(n).fill(0);
  const ksPerNode = new Array(n).fill(1);
  const powerLossPerNodeW = new Array(n).fill(0);
  const convLossPerNodeW = new Array(n).fill(0);
  const radLossPerNodeW = new Array(n).fill(0);
  const coolantLossPerNodeW = new Array(n).fill(0);
  const hEffPerNode = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const rdcPerM = dcResistancePerMetre(material, temps[i], node.areaMm2);
    const ks = currentType === 'ac' ? skinEffectFactor(rdcPerM, frequencyHz).ks : 1;
    const racTotal = rdcPerM * ks * node.lengthM;
    racTotalPerNode[i] = racTotal;
    ksPerNode[i] = ks;
    powerLossPerNodeW[i] = current * current * racTotal;
    currentDensities[i] = current / node.areaMm2;

    const deltaT = temps[i] - ambientC;
    const hConv = effectiveConvection(deltaT, node.charLengthM, orientation, manualH);
    hEffPerNode[i] = hConv + emissivity * STEFAN_BOLTZMANN * 4 * Math.pow(temps[i] + 273.15, 3);
    // Total heat leaving the node (conductor -> ambient) accounts for the coating's series
    // resistance; conv/rad split is then apportioned by their film conductances at the
    // (coating-limited) outer-surface temperature, consistent with how gAmb was assembled.
    const gAmbFinal = effectiveAmbientConductance(hEffPerNode[i], node.surfaceAreaM2, coatingThicknessMm, coatingConductivity);
    const totalLossFinal = gAmbFinal * deltaT;
    const hRadLin = emissivity * STEFAN_BOLTZMANN * 4 * Math.pow(temps[i] + 273.15, 3);
    convLossPerNodeW[i] = totalLossFinal * (hConv / hEffPerNode[i]);
    radLossPerNodeW[i] = totalLossFinal * (hRadLin / hEffPerNode[i]);
    coolantLossPerNodeW[i] = gCoolant(i) * (temps[i] - coolantTempC);
  }

  const conductionFlowsW: number[] = [];
  for (let i = 0; i < n - 1; i++) conductionFlowsW.push((temps[i] - temps[i + 1]) * condG[i]);

  return {
    tempsC: temps, currentDensities, racTotalPerNode, ksPerNode, powerLossPerNodeW,
    convLossPerNodeW, radLossPerNodeW, coolantLossPerNodeW, conductionFlowsW, hEffPerNode, iterations,
  };
}

export function solveMaxContinuousCurrentNodal(
  nodes: ThermalNode[], material: Material, currentType: CurrentType, frequencyHz: number,
  ambientC: number, emissivity: number, orientation: Orientation, manualH: number | null, maxTempC: number,
  coatingThicknessMm = 0, coatingConductivity = 0.3,
  coolantConductancePerNode: number[] = [], coolantTempC = 0
): number {
  let lo = 0;
  let hi = 500000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const result = solveNodalSteadyState(nodes, material, mid, currentType, frequencyHz, ambientC, emissivity, orientation, manualH, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantTempC);
    const worst = Math.max(...result.tempsC);
    if (worst <= maxTempC) lo = mid; else hi = mid; // NaN/Infinity (solver failed to converge) falls through to "exceeds limit"
  }
  return lo;
}

export interface NodalAdiabaticResult {
  currentDensities: number[];
  finalTempsC: number[];
  tempRisesK: number[];
  energyJPerNode: number[]; // energy dissipated = energy absorbed, since the fault is adiabatic
  worstNodeIndex: number;
}

export function solveNodalAdiabatic(nodes: ThermalNode[], material: Material, current: number, durationS: number, initialTempC: number): NodalAdiabaticResult {
  const perNode = nodes.map(node => solveAdiabatic({ material, totalAreaMm2: node.areaMm2, current, durationS, initialTempC }));
  const finalTempsC = perNode.map(r => r.finalTempC);
  const energyJPerNode = nodes.map((node, i) => material.density * (node.areaMm2 * 1e-6 * node.lengthM) * material.specificHeat * perNode[i].tempRiseK);
  let worstNodeIndex = 0;
  finalTempsC.forEach((t, i) => { if (t > finalTempsC[worstNodeIndex]) worstNodeIndex = i; });
  return {
    currentDensities: perNode.map(r => r.currentDensity),
    finalTempsC,
    tempRisesK: perNode.map(r => r.tempRiseK),
    energyJPerNode,
    worstNodeIndex,
  };
}

export interface LoadStep {
  current: number;
  durationS: number;
}

export interface TransientResult {
  timeS: number[];
  currentA: number[];
  nodeTempsC: number[][]; // [nodeIndex][timeIndex]
  peakTempsC: number[];
  finalTempsC: number[];
  energyJPerNode: number[]; // integral of I²Rac dt, per node, over the whole profile
}

/** Backward-Euler time march of the nodal thermal network through a
 *  sequence of constant-current steps (a "load profile" / drive cycle),
 *  subdividing each step for a smooth, numerically stable curve. */
export function solveNodalTransient(
  nodes: ThermalNode[], material: Material, currentType: CurrentType, frequencyHz: number,
  ambientC: number, emissivity: number, orientation: Orientation, manualH: number | null,
  steps: LoadStep[], coatingThicknessMm = 0, coatingConductivity = 0.3,
  coolantConductancePerNode: number[] = [], coolantTempC = 0, substepsPerStep = 25
): TransientResult {
  const n = nodes.length;
  const condG = conductionConductances(nodes, material.thermalConductivity);
  const capacitance = nodes.map(node => material.density * (node.areaMm2 * 1e-6 * node.lengthM) * material.specificHeat);
  const gCoolant = (i: number) => coolantConductancePerNode[i] ?? 0;

  let temps = new Array(n).fill(ambientC);
  const timeS: number[] = [0];
  const currentA: number[] = [steps[0]?.current ?? 0];
  const nodeTempsC: number[][] = nodes.map((_, i) => [temps[i]]);
  const energyJPerNode = new Array(n).fill(0);

  let tCursor = 0;
  for (const step of steps) {
    if (step.durationS <= 0) continue;
    const dtSub = step.durationS / substepsPerStep;
    for (let s = 0; s < substepsPerStep; s++) {
      let guess = [...temps];
      for (let inner = 0; inner < 4; inner++) {
        const lower = new Array(n).fill(0);
        const diag = new Array(n).fill(0);
        const upper = new Array(n).fill(0);
        const rhs = new Array(n).fill(0);

        for (let i = 0; i < n; i++) {
          const node = nodes[i];
          const rdcPerM = dcResistancePerMetre(material, guess[i], node.areaMm2);
          const ks = currentType === 'ac' ? skinEffectFactor(rdcPerM, frequencyHz).ks : 1;
          const racTotal = rdcPerM * ks * node.lengthM;
          const pGen = step.current * step.current * racTotal;

          const deltaT = guess[i] - ambientC;
          const hConv = effectiveConvection(deltaT, node.charLengthM, orientation, manualH);
          const hRadLin = emissivity * STEFAN_BOLTZMANN * 4 * Math.pow(Math.max(guess[i] + 273.15, 1), 3);
          const gAmb = effectiveAmbientConductance(hConv + hRadLin, node.surfaceAreaM2, coatingThicknessMm, coatingConductivity);
          const cDt = capacitance[i] / dtSub;

          let diagVal = gAmb + gCoolant(i) + cDt;
          const rhsVal = pGen + gAmb * ambientC + gCoolant(i) * coolantTempC + cDt * temps[i];
          if (i > 0) { diagVal += condG[i - 1]; lower[i] = -condG[i - 1]; }
          if (i < n - 1) { diagVal += condG[i]; upper[i] = -condG[i]; }
          diag[i] = diagVal;
          rhs[i] = rhsVal;
        }
        guess = solveTridiagonal(lower, diag, upper, rhs);
      }
      for (let i = 0; i < n; i++) {
        const node = nodes[i];
        const rdcPerM = dcResistancePerMetre(material, guess[i], node.areaMm2);
        const ks = currentType === 'ac' ? skinEffectFactor(rdcPerM, frequencyHz).ks : 1;
        energyJPerNode[i] += step.current * step.current * rdcPerM * ks * node.lengthM * dtSub;
      }
      temps = guess;
      tCursor += dtSub;
      timeS.push(tCursor);
      currentA.push(step.current);
      for (let i = 0; i < n; i++) nodeTempsC[i].push(temps[i]);
    }
  }

  return {
    timeS,
    currentA,
    nodeTempsC,
    peakTempsC: nodeTempsC.map(arr => Math.max(...arr)),
    finalTempsC: temps,
    energyJPerNode,
  };
}
