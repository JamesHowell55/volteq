// Cold plate designer — the hydraulic (pressure drop) and thermal (heat-transfer
// coefficient, thermal resistance, base temperature) performance of a liquid cold
// plate whose coolant channel is built up from straight sections (each with its
// own width/height/length) joined by 45°/90°/180° bends. Completes this project's
// liquid-cooling vertical alongside the Heatsink, Heat Exchanger and Flow-in-Pipes
// calculators.
//
// Method — rectangular-channel internal flow:
//  • Hydraulic diameter of a w×h rectangular channel: Dh = 2·w·h/(w+h).
//  • Reynolds number Re = v·Dh/ν per section (v = per-channel flow / area).
//  • Darcy friction factor:
//      - laminar (Re < 2300): f = (f·Re)/Re with the rectangular-duct Poiseuille
//        number f·Re = 96·(1 − 1.3553α + 1.9467α² − 1.7012α³ + 0.9564α⁴ − 0.2537α⁵)
//        (Shah & London, α = short/long side; → 56.92 at a square, 96 at parallel
//        plates), so a rectangular channel is NOT the 64/Re of a round pipe;
//      - turbulent (Re ≥ 4000): Swamee-Jain for a smooth channel;
//      - transitional (2300–4000): interpolated (real transitional flow isn't
//        predictable) — same convention as the Flow-in-Pipes calculator.
//  • Nusselt number (heat-transfer coefficient h = Nu·k/Dh):
//      - laminar: fully-developed constant-heat-flux (H1) rectangular-duct value
//        Nu = 8.235·(1 − 2.0421α + 3.0853α² − 2.4765α³ + 1.0578α⁴ − 0.1861α⁵)
//        (Shah & London; → 3.61 at a square, 8.235 at parallel plates);
//      - turbulent: Dittus-Boelter Nu = 0.023·Re^0.8·Pr^0.4 (heating);
//      - transitional: interpolated.
//  • Pressure drop: Darcy-Weisbach per straight section, ΔP = f·(L/Dh)·(ρ·v²/2),
//    plus bend minor losses ΣK·(ρ·v²/2) using representative sharp-milled-bend K
//    (45°≈0.3, 90°≈1.1, 180°≈2.0 — these vary with bend radius; radiused/vaned
//    bends are lower).
//  • Thermal resistance (base surface → inlet fluid):
//      R_conv = 1/UA, UA = Σ (h·wetted-area) over every section and channel;
//      R_caloric = 1/(2·ṁ·cp) (mean fluid sits halfway between inlet and outlet);
//      R_fluid = R_conv + R_caloric. Optional 1-D base conduction R_base =
//      t/(k_base·A_footprint) adds the module-to-channel path (no spreading model).
//  Disclosed simplifications: the channel side/top walls are treated as fully
//  effective heat-transfer area (no fin-efficiency derating — a first-order
//  over-estimate of UA), fully-developed flow, and a single-phase Newtonian fluid.

import { coolantTransportProperties } from './heatExchangerPhysics';
import { COOLANT_PRESETS } from './materials';

export interface ColdPlateFluid {
  rho: number; // kg/m³
  nu: number;  // m²/s
  k: number;   // W/(m·K)
  pr: number;  // Prandtl
  cp: number;  // J/(kg·K)
}

/** Fluid properties, reusing the app's coolant data (density & cp from
 *  COOLANT_PRESETS, ν/k/Pr from the Heat Exchanger transport table). */
export function coldPlateFluid(coolantId: string, tempC: number): ColdPlateFluid {
  const preset = COOLANT_PRESETS.find((p) => p.id === coolantId) ?? COOLANT_PRESETS[0];
  const tr = coolantTransportProperties(coolantId, tempC);
  return { rho: preset.densityKgPerM3, cp: preset.specificHeatJPerKgK, nu: tr.nu, k: tr.k, pr: tr.pr };
}

export type BendAngle = 45 | 90 | 180;
export const BEND_K: Record<BendAngle, number> = { 45: 0.3, 90: 1.1, 180: 2.0 };

/** Offset (staggered) pin-fin field applied to a section — as used by direct-cooled
 *  power-module baseplates (Infineon HybridPACK, Danfoss ShowerPower, etc.). */
export interface PinFinConfig {
  diaMm: number;               // pin diameter D
  pitchTransverseMm: number;   // S_T, spacing across the flow
  pitchLongitudinalMm: number; // S_L, spacing along the flow (row-to-row)
  finConductivityWmK: number;  // pin material conductivity (Cu ≈ 385, Al ≈ 167)
  // Pin-tip boundary: 'convecting' = tip wetted in an open coolant cavity (corrected
  // length); 'adiabatic' = tip bottomed against the sealed housing floor (no tip loss).
  tipBoundary?: 'adiabatic' | 'convecting';
}

export type Segment =
  | { type: 'straight'; lengthMm: number; widthMm: number; heightMm: number; pins?: PinFinConfig }
  | { type: 'bend'; angleDeg: BendAngle };

/** Rectangular-duct laminar Poiseuille number f·Re (Darcy), Shah & London. */
export function laminarFReProduct(alpha: number): number {
  const a = Math.min(Math.max(alpha, 0), 1);
  return 96 * (1 - 1.3553 * a + 1.9467 * a ** 2 - 1.7012 * a ** 3 + 0.9564 * a ** 4 - 0.2537 * a ** 5);
}

/** Rectangular-duct laminar Nusselt (H1, constant heat flux), Shah & London. */
export function laminarNusseltH1(alpha: number): number {
  const a = Math.min(Math.max(alpha, 0), 1);
  return 8.235 * (1 - 2.0421 * a + 3.0853 * a ** 2 - 2.4765 * a ** 3 + 1.0578 * a ** 4 - 0.1861 * a ** 5);
}

/** Swamee-Jain smooth-channel Darcy friction factor (ε ≈ 0). */
function swameeJainSmooth(re: number): number {
  return 0.25 / Math.pow(Math.log10(5.74 / Math.pow(re, 0.9)), 2);
}

/** Darcy friction factor for a rectangular channel of aspect ratio α. */
export function rectFrictionFactor(re: number, alpha: number): number {
  if (re <= 0) return 0;
  if (re < 2300) return laminarFReProduct(alpha) / re;
  if (re >= 4000) return swameeJainSmooth(re);
  const fLam = laminarFReProduct(alpha) / 2300;
  const fTurb = swameeJainSmooth(4000);
  return fLam + ((re - 2300) / 1700) * (fTurb - fLam);
}

/** Nusselt number for a rectangular channel: laminar H1 → transitional → Dittus-Boelter. */
export function rectNusselt(re: number, pr: number, alpha: number): number {
  if (re <= 0) return laminarNusseltH1(alpha);
  const nuLam = laminarNusseltH1(alpha);
  if (re < 2300) return nuLam;
  const dittusBoelter = (r: number) => 0.023 * Math.pow(r, 0.8) * Math.pow(pr, 0.4);
  if (re >= 4000) return dittusBoelter(re);
  const nuTurb = dittusBoelter(4000);
  return nuLam + ((re - 2300) / 1700) * (nuTurb - nuLam);
}

// ── Staggered pin-fin array (offset pin field) ──
// Heat transfer: Zukauskas staggered tube-bank Nusselt, length scale = pin diameter,
//   velocity = maximum velocity through the narrowest gap. Nu = C·Cn·Re^m·Pr^0.36·(ST/SL)^0.2.
// Pressure drop: Gaddis-Gnielinski (VDI Heat Atlas) staggered drag coefficient per row,
//   ΔP = ½·ζ·N_rows·ρ·u_max². Both verified against an independent hand calculation.

/** Zukauskas tube-row correction Cn for a staggered bank (digitized, → 1.0 for ≥16 rows). */
export function zukauskasRowFactor(rows: number): number {
  const R = [1, 2, 3, 4, 6, 7, 10, 16];
  const F = [0.70, 0.80, 0.86, 0.8942, 0.92, 0.93, 0.96, 1.0];
  if (rows <= R[0]) return F[0];
  if (rows >= 16) return 1.0;
  for (let i = 1; i < R.length; i++) {
    if (rows <= R[i]) {
      const t = (rows - R[i - 1]) / (R[i] - R[i - 1]);
      return F[i - 1] + t * (F[i] - F[i - 1]);
    }
  }
  return 1.0;
}

/** Zukauskas staggered-bank average Nusselt number (Re on max velocity + pin diameter). */
export function staggeredPinNusselt(re: number, pr: number, a: number, b: number, rows: number): number {
  const cn = zukauskasRowFactor(rows);
  const geo = Math.pow(a / b, 0.2);
  const prTerm = Math.pow(pr, 0.36);
  if (re < 500) return 1.04 * cn * Math.pow(re, 0.4) * prTerm;
  if (re < 1000) return 0.71 * cn * Math.pow(re, 0.5) * prTerm;
  if (re < 20000) return 0.35 * cn * Math.pow(re, 0.6) * prTerm * geo;
  return 0.031 * cn * Math.pow(re, 0.8) * prTerm * geo;
}

export interface PinDragResult {
  dragCoeff: number;    // ζ per row (Gaddis-Gnielinski)
  maxVelRatio: number;  // u_max / u_approach
  diagonalGoverns: boolean;
}

/** Gaddis-Gnielinski staggered drag coefficient ζ (per row) and the max-velocity ratio. */
export function staggeredPinDrag(re: number, a: number, b: number): PinDragResult {
  const c = Math.sqrt((a / 2) ** 2 + b ** 2);
  const diagonalGoverns = b < 0.5 * Math.sqrt(2 * a + 1);
  const maxVelRatio = diagonalGoverns ? a / (2 * (c - 1)) : a / (a - 1);
  const dLam = (280 * Math.PI * ((Math.sqrt(b) - 0.6) ** 2 + 0.75)) / (Math.pow(c, 1.6) * (4 * a * b - Math.PI) * re);
  const fTs = 2.5 + 1.2 / Math.pow(a - 0.85, 1.08) + 0.4 * (b / a - 1) ** 3 - 0.01 * (a / b - 1) ** 3;
  const dTurb = fTs / Math.pow(re, 0.25);
  // f_nt (few-row inlet/outlet correction) → 0 for ≥10 rows, neglected here (disclosed).
  const dragCoeff = dLam + dTurb * (1 - Math.exp(-(re + 200) / 1000));
  return { dragCoeff, maxVelRatio, diagonalGoverns };
}

export interface ColdPlateInput {
  fluid: ColdPlateFluid;
  segments: Segment[];
  channels: number;        // N parallel channels sharing the flow
  totalFlowLpm: number;
  heatLoadW: number;
  inletTempC: number;
  // Optional 1-D base conduction (module footprint → channel):
  baseConduction: boolean;
  baseThicknessMm: number;
  baseConductivityWmK: number;
  footprintAreaCm2: number;
}

export interface SectionDetail {
  index: number;
  kind: 'channel' | 'pinfin';
  widthMm: number;
  heightMm: number;
  lengthMm: number;
  dhMm: number;            // hydraulic diameter (channel) or pin diameter (pin-fin)
  velocityMPerS: number;   // bulk velocity (channel) or max gap velocity (pin-fin)
  reynolds: number;
  regime: 'laminar' | 'transitional' | 'turbulent';
  frictionFactor: number;  // Darcy f (channel) or Gaddis-Gnielinski ζ per row (pin-fin)
  nusselt: number;
  htc: number;             // W/(m²·K)
  wettedAreaCm2: number;   // effective heat-transfer area, per channel
  majorDropPa: number;     // per channel
  pinCount?: number;       // pins in this section (per channel)
  finEfficiency?: number;  // pin fin efficiency
  note?: string;
}

export interface ColdPlateResult {
  sections: SectionDetail[];
  perChannelFlowLpm: number;
  minVelocity: number;
  maxVelocity: number;
  minReynolds: number;
  maxReynolds: number;
  majorDropPa: number;     // per channel (= parallel channels)
  bendDropPa: number;
  totalDropPa: number;
  totalWettedAreaCm2: number; // all channels
  uaWPerK: number;         // convective conductance, all channels
  avgHtc: number;          // area-weighted average HTC
  rConvKPerW: number;
  rCaloricKPerW: number;
  rBaseKPerW: number;
  rTotalKPerW: number;     // module → inlet fluid (base cond + fluid side)
  fluidDeltaTC: number;
  outletTempC: number;
  baseTempC: number;       // channel-wall surface temperature
  moduleTempC: number;     // module base (adds base conduction) — equals baseTempC if no base conduction
}

export function solveColdPlate(inp: ColdPlateInput): ColdPlateResult {
  const { fluid } = inp;
  const nChan = Math.max(1, Math.round(inp.channels));
  const totalQ = inp.totalFlowLpm / 1000 / 60;   // m³/s
  const chanQ = totalQ / nChan;                  // per-channel flow

  const sections: SectionDetail[] = [];
  let majorDrop = 0;
  let bendDrop = 0;
  let ua = 0;
  let totalWetted = 0; // per channel, m²
  let lastDynamicPressure = 0; // ρ·v²/2 of the most recent straight section, for bends
  let minV = Infinity, maxV = 0, minRe = Infinity, maxRe = 0;
  let idx = 0;

  for (const seg of inp.segments) {
    if (seg.type === 'bend') {
      bendDrop += (BEND_K[seg.angleDeg] ?? 0) * lastDynamicPressure;
      continue;
    }
    const wM = seg.widthMm / 1000;
    const hM = seg.heightMm / 1000;
    const areaM2 = wM * hM;
    if (areaM2 <= 0) { idx++; continue; }
    const lenM = seg.lengthMm / 1000;
    const uApproach = chanQ / areaM2;            // bulk velocity through the section frontal area

    if (seg.pins) {
      // ── Staggered pin-fin section (Zukauskas HT + Gaddis-Gnielinski ΔP) ──
      const dM = seg.pins.diaMm / 1000;
      const stM = seg.pins.pitchTransverseMm / 1000;
      const slM = seg.pins.pitchLongitudinalMm / 1000;
      let a = stM / dM;                          // transverse pitch ratio
      let b = slM / dM;                          // longitudinal pitch ratio
      let note: string | undefined;
      if (a <= 1.05 || b <= 1.05) {
        note = 'pitch ≤ pin diameter — clamped; choose spacing > diameter';
        a = Math.max(a, 1.05); b = Math.max(b, 1.05);
      }
      const nRows = Math.max(1, Math.round(lenM / slM));
      const drag = staggeredPinDrag(1, a, b); // maxVelRatio is Re-independent
      const uMax = uApproach * drag.maxVelRatio;
      const re = fluid.nu > 0 ? (uMax * dM) / fluid.nu : 0;
      const { dragCoeff } = staggeredPinDrag(Math.max(re, 1), a, b);
      const regime: SectionDetail['regime'] = re < 300 ? 'laminar' : re < 1000 ? 'transitional' : 'turbulent';
      const nu = staggeredPinNusselt(Math.max(re, 1), fluid.pr, a, b, nRows);
      const htc = dM > 0 ? (nu * fluid.k) / dM : 0;
      const majorSeg = 0.5 * dragCoeff * nRows * fluid.rho * uMax * uMax;

      // Effective heat-transfer area: bare base between pins + pin lateral area × fin efficiency.
      // The pinned baseplate is the sealing surface, so only the base side is heated; the tip
      // boundary depends on whether the pin sits in an open cavity (convecting) or bottoms out
      // against the sealed housing (adiabatic). effLen carries the tip condition into both the
      // fin efficiency and the lateral area so the two stay consistent.
      const nPins = (wM * lenM) / (stM * slM);
      const pinFootprint = nPins * Math.PI * dM * dM / 4;
      const baseArea = Math.max(0, wM * lenM - pinFootprint);
      const kFin = Math.max(1, seg.pins.finConductivityWmK);
      const m = Math.sqrt((4 * htc) / (kFin * dM));       // fin parameter, circular pin
      const convectingTip = (seg.pins.tipBoundary ?? 'convecting') === 'convecting';
      const effLen = convectingTip ? hM + dM / 4 : hM;    // corrected length (tip loss) vs adiabatic tip
      const finEff = m * effLen > 0 ? Math.tanh(m * effLen) / (m * effLen) : 1;
      const pinLateral = nPins * Math.PI * dM * effLen;    // per channel, matches tip condition
      const effAreaM2 = baseArea + finEff * pinLateral;    // per channel

      majorDrop += majorSeg;
      ua += htc * effAreaM2 * nChan;
      totalWetted += effAreaM2;
      lastDynamicPressure = 0.5 * fluid.rho * uApproach * uApproach; // bulk velocity for a following bend
      minV = Math.min(minV, uMax); maxV = Math.max(maxV, uMax);
      minRe = Math.min(minRe, re); maxRe = Math.max(maxRe, re);

      sections.push({
        index: idx, kind: 'pinfin', widthMm: seg.widthMm, heightMm: seg.heightMm, lengthMm: seg.lengthMm,
        dhMm: seg.pins.diaMm, velocityMPerS: uMax, reynolds: re, regime, frictionFactor: dragCoeff,
        nusselt: nu, htc, wettedAreaCm2: effAreaM2 * 1e4, majorDropPa: majorSeg,
        pinCount: nPins, finEfficiency: finEff, note,
      });
      idx++;
      continue;
    }

    const dhM = (2 * wM * hM) / (wM + hM);
    const alpha = Math.min(wM, hM) / Math.max(wM, hM);
    const v = uApproach;
    const re = fluid.nu > 0 ? (v * dhM) / fluid.nu : 0;
    const regime: SectionDetail['regime'] = re < 2300 ? 'laminar' : re < 4000 ? 'transitional' : 'turbulent';
    const f = rectFrictionFactor(re, alpha);
    const nu = rectNusselt(re, fluid.pr, alpha);
    const htc = dhM > 0 ? (nu * fluid.k) / dhM : 0;
    const dynamicPressure = 0.5 * fluid.rho * v * v;
    const majorSeg = dhM > 0 ? f * (lenM / dhM) * dynamicPressure : 0;
    const perimeterM = 2 * (wM + hM);
    const wettedM2 = perimeterM * lenM; // per channel

    majorDrop += majorSeg;
    ua += htc * wettedM2 * nChan;
    totalWetted += wettedM2;
    lastDynamicPressure = dynamicPressure;
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    minRe = Math.min(minRe, re); maxRe = Math.max(maxRe, re);

    sections.push({
      index: idx, kind: 'channel', widthMm: seg.widthMm, heightMm: seg.heightMm, lengthMm: seg.lengthMm,
      dhMm: dhM * 1000, velocityMPerS: v, reynolds: re, regime, frictionFactor: f,
      nusselt: nu, htc, wettedAreaCm2: wettedM2 * 1e4, majorDropPa: majorSeg,
    });
    idx++;
  }

  const totalDrop = majorDrop + bendDrop;
  const mdot = fluid.rho * totalQ;
  const rConv = ua > 0 ? 1 / ua : Infinity;
  const rCaloric = mdot > 0 && fluid.cp > 0 ? 1 / (2 * mdot * fluid.cp) : Infinity;
  const rFluid = rConv + rCaloric;
  const rBase = inp.baseConduction && inp.baseConductivityWmK > 0 && inp.footprintAreaCm2 > 0
    ? (inp.baseThicknessMm / 1000) / (inp.baseConductivityWmK * (inp.footprintAreaCm2 * 1e-4))
    : 0;
  const rTotal = rFluid + rBase;

  const fluidDeltaT = mdot > 0 && fluid.cp > 0 ? inp.heatLoadW / (mdot * fluid.cp) : 0;
  const avgHtc = totalWetted > 0 ? ua / (totalWetted * nChan) : 0;

  return {
    sections,
    perChannelFlowLpm: inp.totalFlowLpm / nChan,
    minVelocity: isFinite(minV) ? minV : 0,
    maxVelocity: maxV,
    minReynolds: isFinite(minRe) ? minRe : 0,
    maxReynolds: maxRe,
    majorDropPa: majorDrop,
    bendDropPa: bendDrop,
    totalDropPa: totalDrop,
    totalWettedAreaCm2: totalWetted * nChan * 1e4,
    uaWPerK: ua,
    avgHtc,
    rConvKPerW: rConv,
    rCaloricKPerW: rCaloric,
    rBaseKPerW: rBase,
    rTotalKPerW: rTotal,
    fluidDeltaTC: fluidDeltaT,
    outletTempC: inp.inletTempC + fluidDeltaT,
    baseTempC: inp.inletTempC + inp.heatLoadW * rFluid,
    moduleTempC: inp.inletTempC + inp.heatLoadW * rTotal,
  };
}
