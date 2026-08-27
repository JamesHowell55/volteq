// Interference (press/shrink) fit physics for the Fits & Limits calculator.
// Thick-walled (Lamé) cylinder theory for a shaft (solid or hollow) pressed
// into a hub of finite outer diameter, following the standard treatment in
// Shigley's Mechanical Engineering Design ("Press and Shrink Fits"). All
// three principal formulas below were cross-checked against two independent
// published sources and, for the contact-pressure and stress equations,
// verified against the ANSI B4.2 / ISO 286 preferred-fit tables (see
// isoFits.ts) by reproducing a known H7/p6, H7/s6, H7/u6 example by hand.
//
// Contact pressure (diametral interference δ, interface diameter d, hub OD Do,
// shaft bore di [0 if solid]):
//   p = δ / { d/Eo·[(Do²+d²)/(Do²−d²) + νo] + d/Ei·[(d²+di²)/(d²−di²) − νi] }
//
// Stresses (tension-positive convention), from the general Lamé solution for
// a cylinder under internal-only or external-only pressure:
//   Hub:   σr(bore) = −p                σθ(bore) = +p(Do²+d²)/(Do²−d²)
//          σr(OD)   = 0                  σθ(OD)   = +2p·d²/(Do²−d²)
//   Shaft: σr(interface) = −p            σθ(interface) = −p(d²+di²)/(d²−di²)
//          σr(bore, hollow) = 0          σθ(bore, hollow) = −2p·d²/(d²−di²)
//          Solid shaft (di=0): σr = σθ = −p uniformly (hydrostatic compression).
//
// Axial press-in (insertion) force: F = π·f·p·d·L (f = friction coefficient,
// L = engagement length), evaluated at the assembly-temperature pressure.
//
// Thermal effect: ISO 286 tolerances are referenced at 20°C. At a given
// temperature T, a part's own diametral growth is δgrowth = α·d·(T − 20)
// (positive = expansion). The two parts can be AT DIFFERENT TEMPERATURES —
// the normal heat/shrink-fit assembly method, where the hub is heated (or the
// shaft chilled, e.g. in dry ice or liquid nitrogen) to open up a sliding
// clearance before the parts are dropped together with little or no force,
// then allowed to equalise back to the operational/storage temperature. The
// net shift in diametral interference is therefore
// δ_thermal = δgrowth,shaft − δgrowth,hub = d·[αshaft·(Tshaft−20) − αhub·(Thub−20)],
// added to the as-machined interference before solving for pressure/stress at
// that condition. The operational and storage points assume both parts have
// equalised to one shared ambient (Tshaft = Thub = T), which reduces this to
// the single-temperature form d·(αshaft−αhub)·(T−20).

import type { FitsMaterial } from './fitsMaterials';

export interface TriValue {
  nom: number;
  min: number;
  max: number;
}

export interface StressPoint {
  radialMPa: number;
  hoopMPa: number;
  vonMisesMPa: number;
  safetyFactor: number; // yield / von Mises; Infinity if von Mises is ~0
}

export interface TemperatureStressSet {
  radialMPa: TriValue;
  hoopMPa: TriValue;
  vonMisesMPa: TriValue;
  safetyFactor: TriValue;
}

export interface TemperaturePointResult {
  shaftTempC: number;
  hubTempC: number;
  shaftThermalGrowthMm: number; // shaft OD diametral change from the 20°C reference (+ = expansion, − = contraction)
  hubThermalGrowthMm: number; // hub bore diametral change from the 20°C reference (+ = expansion, − = contraction)
  interferenceMm: TriValue; // diametral, after thermal shift
  contactPressureMPa: TriValue;
  hubBore: TemperatureStressSet;
  hubOuterHoopMPa: TriValue; // hub OD: radial stress is always 0 (free surface)
  shaftInterface: TemperatureStressSet;
  shaftBore: TemperatureStressSet | null; // null for a solid shaft
  fitRetainedAtMin: boolean; // true if even the loosest tolerance/thermal case is still an interference (not a clearance)
}

export type CheckSeverity = 'pass' | 'warn' | 'fail';

export interface FitsCheck {
  id: string;
  label: string;
  severity: CheckSeverity;
  detail: string;
}

export interface FitsInput {
  interfaceDiameterMm: number; // d — nominal shaft OD = nominal hub bore
  shaftTolUpperMm: number;
  shaftTolLowerMm: number;
  hubTolUpperMm: number;
  hubTolLowerMm: number;
  shaftBoreMm: number; // 0 = solid shaft
  hubOuterDiameterMm: number;
  engagementLengthMm: number;
  frictionCoefficient: number;
  shaftMaterial: FitsMaterial;
  hubMaterial: FitsMaterial;
  shaftAssemblyTempC: number; // heat/shrink fits: the shaft and hub can be brought to assembly at different temperatures
  hubAssemblyTempC: number;
  operationalTempC: number; // both parts assumed equalised to a shared ambient at these two points
  storageTempC: number;
}

export interface FitsResult {
  interferenceAtRefTemp: TriValue; // as-machined, 20°C reference, before any thermal shift
  assembly: TemperaturePointResult;
  operational: TemperaturePointResult;
  storage: TemperaturePointResult;
  insertionForceN: TriValue;
  checks: FitsCheck[];
  overallPass: boolean;
}

function vonMisesPlaneStress(radialMPa: number, hoopMPa: number): number {
  return Math.sqrt(radialMPa * radialMPa - radialMPa * hoopMPa + hoopMPa * hoopMPa);
}

function safetyFactorFor(yieldMPa: number, vonMisesMPa: number): number {
  return vonMisesMPa > 1e-9 ? yieldMPa / vonMisesMPa : Infinity;
}

/** Contact pressure (MPa) from diametral interference (mm) and geometry/material. */
function contactPressureMPa(
  interferenceMm: number, dMm: number, diMm: number, doMm: number,
  shaft: FitsMaterial, hub: FitsMaterial,
): number {
  if (interferenceMm <= 0) return 0;
  const eiMPa = shaft.elasticModulusGPa * 1000;
  const eoMPa = hub.elasticModulusGPa * 1000;
  const d2 = dMm * dMm;
  const di2 = diMm * diMm;
  const do2 = doMm * doMm;
  const hubTerm = (dMm / eoMPa) * ((do2 + d2) / (do2 - d2) + hub.poissonsRatio);
  const shaftTerm = (dMm / eiMPa) * ((d2 + di2) / (d2 - di2) - shaft.poissonsRatio);
  return interferenceMm / (hubTerm + shaftTerm);
}

function stressSetFor(
  pMPa: number, dMm: number, diMm: number, doMm: number, yieldMPa: number, isHub: boolean,
): StressPoint {
  const d2 = dMm * dMm;
  const do2 = doMm * doMm;
  const di2 = diMm * diMm;
  let radialMPa: number;
  let hoopMPa: number;
  if (isHub) {
    radialMPa = -pMPa;
    hoopMPa = pMPa * (do2 + d2) / (do2 - d2);
  } else {
    radialMPa = -pMPa;
    hoopMPa = -pMPa * (d2 + di2) / (d2 - di2);
  }
  const vonMisesMPa = vonMisesPlaneStress(radialMPa, hoopMPa);
  return { radialMPa, hoopMPa, vonMisesMPa, safetyFactor: safetyFactorFor(yieldMPa, vonMisesMPa) };
}

function hubOuterHoopMPa(pMPa: number, dMm: number, doMm: number): number {
  const d2 = dMm * dMm;
  const do2 = doMm * doMm;
  return (2 * pMPa * d2) / (do2 - d2);
}

function shaftBoreStress(pMPa: number, dMm: number, diMm: number, yieldMPa: number): StressPoint {
  const d2 = dMm * dMm;
  const di2 = diMm * diMm;
  const radialMPa = 0;
  const hoopMPa = (-2 * pMPa * d2) / (d2 - di2);
  const vonMisesMPa = vonMisesPlaneStress(radialMPa, hoopMPa);
  return { radialMPa, hoopMPa, vonMisesMPa, safetyFactor: safetyFactorFor(yieldMPa, vonMisesMPa) };
}

function triValue(nom: number, min: number, max: number): TriValue {
  return { nom, min, max };
}

function solveAtTemperature(
  input: FitsInput, shaftTempC: number, hubTempC: number, interferenceBase: TriValue,
): TemperaturePointResult {
  const { interfaceDiameterMm: d, shaftBoreMm: di, hubOuterDiameterMm: doD, shaftMaterial, hubMaterial } = input;
  const shaftThermalGrowthMm = shaftMaterial.thermalExpansionPerC * d * (shaftTempC - 20);
  const hubThermalGrowthMm = hubMaterial.thermalExpansionPerC * d * (hubTempC - 20);
  const thermalShiftMm = shaftThermalGrowthMm - hubThermalGrowthMm;
  const interferenceMm = triValue(
    interferenceBase.nom + thermalShiftMm,
    interferenceBase.min + thermalShiftMm,
    interferenceBase.max + thermalShiftMm,
  );

  const pNom = contactPressureMPa(Math.max(interferenceMm.nom, 0), d, di, doD, shaftMaterial, hubMaterial);
  const pMin = contactPressureMPa(Math.max(interferenceMm.min, 0), d, di, doD, shaftMaterial, hubMaterial);
  const pMax = contactPressureMPa(Math.max(interferenceMm.max, 0), d, di, doD, shaftMaterial, hubMaterial);
  const contactPressureMPaTri = triValue(pNom, pMin, pMax);

  const hubBoreNom = stressSetFor(pNom, d, di, doD, hubMaterial.yieldStrengthMPa, true);
  const hubBoreMin = stressSetFor(pMin, d, di, doD, hubMaterial.yieldStrengthMPa, true);
  const hubBoreMax = stressSetFor(pMax, d, di, doD, hubMaterial.yieldStrengthMPa, true);
  const hubBore: TemperatureStressSet = {
    radialMPa: triValue(hubBoreNom.radialMPa, hubBoreMin.radialMPa, hubBoreMax.radialMPa),
    hoopMPa: triValue(hubBoreNom.hoopMPa, hubBoreMin.hoopMPa, hubBoreMax.hoopMPa),
    vonMisesMPa: triValue(hubBoreNom.vonMisesMPa, hubBoreMin.vonMisesMPa, hubBoreMax.vonMisesMPa),
    // Worst-case SF pairs with worst-case (max) stress, i.e. min of the three SFs.
    safetyFactor: triValue(hubBoreNom.safetyFactor, Math.min(hubBoreMin.safetyFactor, hubBoreMax.safetyFactor), Math.max(hubBoreMin.safetyFactor, hubBoreMax.safetyFactor)),
  };

  const shaftIfNom = stressSetFor(pNom, d, di, doD, shaftMaterial.yieldStrengthMPa, false);
  const shaftIfMin = stressSetFor(pMin, d, di, doD, shaftMaterial.yieldStrengthMPa, false);
  const shaftIfMax = stressSetFor(pMax, d, di, doD, shaftMaterial.yieldStrengthMPa, false);
  const shaftInterface: TemperatureStressSet = {
    radialMPa: triValue(shaftIfNom.radialMPa, shaftIfMin.radialMPa, shaftIfMax.radialMPa),
    hoopMPa: triValue(shaftIfNom.hoopMPa, shaftIfMin.hoopMPa, shaftIfMax.hoopMPa),
    vonMisesMPa: triValue(shaftIfNom.vonMisesMPa, shaftIfMin.vonMisesMPa, shaftIfMax.vonMisesMPa),
    safetyFactor: triValue(shaftIfNom.safetyFactor, Math.min(shaftIfMin.safetyFactor, shaftIfMax.safetyFactor), Math.max(shaftIfMin.safetyFactor, shaftIfMax.safetyFactor)),
  };

  const hubOuterHoopMPaTri = triValue(
    hubOuterHoopMPa(pNom, d, doD), hubOuterHoopMPa(pMin, d, doD), hubOuterHoopMPa(pMax, d, doD),
  );

  let shaftBore: TemperatureStressSet | null = null;
  if (di > 0) {
    const boreNom = shaftBoreStress(pNom, d, di, shaftMaterial.yieldStrengthMPa);
    const boreMin = shaftBoreStress(pMin, d, di, shaftMaterial.yieldStrengthMPa);
    const boreMax = shaftBoreStress(pMax, d, di, shaftMaterial.yieldStrengthMPa);
    shaftBore = {
      radialMPa: triValue(boreNom.radialMPa, boreMin.radialMPa, boreMax.radialMPa),
      hoopMPa: triValue(boreNom.hoopMPa, boreMin.hoopMPa, boreMax.hoopMPa),
      vonMisesMPa: triValue(boreNom.vonMisesMPa, boreMin.vonMisesMPa, boreMax.vonMisesMPa),
      safetyFactor: triValue(boreNom.safetyFactor, Math.min(boreMin.safetyFactor, boreMax.safetyFactor), Math.max(boreMin.safetyFactor, boreMax.safetyFactor)),
    };
  }

  return {
    shaftTempC,
    hubTempC,
    shaftThermalGrowthMm,
    hubThermalGrowthMm,
    interferenceMm,
    contactPressureMPa: contactPressureMPaTri,
    hubBore,
    hubOuterHoopMPa: hubOuterHoopMPaTri,
    shaftInterface,
    shaftBore,
    fitRetainedAtMin: interferenceMm.min > 0,
  };
}

export function solveFitsCalc(input: FitsInput): FitsResult {
  const { interfaceDiameterMm: d, shaftTolUpperMm, shaftTolLowerMm, hubTolUpperMm, hubTolLowerMm } = input;

  const interferenceAtRefTemp = triValue(
    (shaftTolUpperMm + shaftTolLowerMm) / 2 - (hubTolUpperMm + hubTolLowerMm) / 2,
    shaftTolLowerMm - hubTolUpperMm,
    shaftTolUpperMm - hubTolLowerMm,
  );

  const assembly = solveAtTemperature(input, input.shaftAssemblyTempC, input.hubAssemblyTempC, interferenceAtRefTemp);
  const operational = solveAtTemperature(input, input.operationalTempC, input.operationalTempC, interferenceAtRefTemp);
  const storage = solveAtTemperature(input, input.storageTempC, input.storageTempC, interferenceAtRefTemp);

  const fMin = Math.PI * input.frictionCoefficient * assembly.contactPressureMPa.min * d * input.engagementLengthMm;
  const fNom = Math.PI * input.frictionCoefficient * assembly.contactPressureMPa.nom * d * input.engagementLengthMm;
  const fMax = Math.PI * input.frictionCoefficient * assembly.contactPressureMPa.max * d * input.engagementLengthMm;
  const insertionForceN = triValue(fNom, fMin, fMax);

  const checks: FitsCheck[] = [];

  if (interferenceAtRefTemp.min <= 0) {
    checks.push({
      id: 'no-interference',
      label: 'As-machined interference',
      severity: 'fail',
      detail: `The loosest tolerance combination (shaft min, hub max) gives ${interferenceAtRefTemp.min <= 0 ? 'zero or negative' : 'positive'} interference at 20°C — this tolerance stack can produce a clearance fit, not a press fit. Tighten the shaft or hub tolerance.`,
    });
  }

  if (input.shaftAssemblyTempC !== input.hubAssemblyTempC) {
    if (assembly.interferenceMm.max <= 0) {
      checks.push({
        id: 'thermal-assembly-clearance',
        label: 'Heat/shrink assembly clearance',
        severity: 'pass',
        detail: `At shaft ${fmtT(input.shaftAssemblyTempC)} / hub ${fmtT(input.hubAssemblyTempC)}, the parts have a guaranteed diametral clearance of at least ${(-assembly.interferenceMm.max).toFixed(3)} mm across the full tolerance range — they should drop together with little or no force.`,
      });
    } else if (assembly.interferenceMm.min <= 0) {
      checks.push({
        id: 'thermal-assembly-clearance',
        label: 'Heat/shrink assembly clearance',
        severity: 'warn',
        detail: `At shaft ${fmtT(input.shaftAssemblyTempC)} / hub ${fmtT(input.hubAssemblyTempC)}, the nominal diametral clearance is ${(-assembly.interferenceMm.nom).toFixed(3)} mm, but the tightest tolerance combination still has ${assembly.interferenceMm.max.toFixed(3)} mm of interference (up to ${insertionForceN.max.toFixed(0)} N of press force at that extreme) — increase the temperature differential for a guaranteed force-free assembly.`,
      });
    } else {
      checks.push({
        id: 'thermal-assembly-clearance',
        label: 'Heat/shrink assembly clearance',
        severity: 'warn',
        detail: `At shaft ${fmtT(input.shaftAssemblyTempC)} / hub ${fmtT(input.hubAssemblyTempC)}, ${assembly.interferenceMm.nom.toFixed(3)} mm of interference remains (nominal) — this temperature differential alone is not enough for a force-free assembly (still ~${insertionForceN.nom.toFixed(0)} N nominal press force). Increase the differential, or plan for the insertion force shown below.`,
      });
    }
  }

  if (!operational.fitRetainedAtMin) {
    checks.push({
      id: 'fit-lost-operational',
      label: 'Interference retained at operating temperature',
      severity: 'fail',
      detail: `At ${fmtT(input.operationalTempC)} with the loosest tolerance stack, the diametral interference drops to ${operational.interferenceMm.min.toFixed(3)} mm — the fit is lost (clearance forms) and the parts may slip or the hub may loosen. Increase nominal interference or choose materials with closer CTE match.`,
    });
  } else if (operational.interferenceMm.min < 0.3 * Math.max(interferenceAtRefTemp.nom, 1e-6)) {
    checks.push({
      id: 'fit-margin-operational',
      label: 'Interference margin at operating temperature',
      severity: 'warn',
      detail: `At ${fmtT(input.operationalTempC)}, worst-case interference falls to ${operational.interferenceMm.min.toFixed(3)} mm — a large reduction from the as-machined value. Check this margin is acceptable for the application's holding-force requirement.`,
    });
  }

  if (!storage.fitRetainedAtMin) {
    checks.push({
      id: 'fit-lost-storage',
      label: 'Interference retained at storage temperature',
      severity: 'warn',
      detail: `At ${fmtT(input.storageTempC)} with the loosest tolerance stack, the diametral interference drops to ${storage.interferenceMm.min.toFixed(3)} mm — a clearance may form during storage/transport, though this is often less critical than an operational-temperature loss.`,
    });
  }

  const stressChecks: [string, TemperaturePointResult][] = [
    ['assembly', assembly], ['operational', operational], ['storage', storage],
  ];
  for (const [label, point] of stressChecks) {
    const hubSf = point.hubBore.safetyFactor.min;
    if (hubSf < 1) {
      checks.push({
        id: `hub-yield-${label}`,
        label: `Hub bore stress (${label})`,
        severity: 'fail',
        detail: `Von Mises stress at the hub bore exceeds ${input.hubMaterial.name}'s yield strength at ${label} temperature (SF = ${hubSf.toFixed(2)}) — the hub will yield. Increase hub OD, reduce interference, or use a stronger/thicker hub.`,
      });
    } else if (hubSf < 1.5) {
      checks.push({
        id: `hub-yield-margin-${label}`,
        label: `Hub bore stress margin (${label})`,
        severity: 'warn',
        detail: `Hub bore safety factor is ${hubSf.toFixed(2)} at ${label} temperature — low margin against yield.`,
      });
    }
    const shaftSf = (point.shaftBore ?? point.shaftInterface).safetyFactor.min;
    const shaftLocation = point.shaftBore ? 'bore' : 'interface (uniform compression)';
    if (shaftSf < 1) {
      checks.push({
        id: `shaft-yield-${label}`,
        label: `Shaft ${shaftLocation} stress (${label})`,
        severity: input.shaftMaterial.isBrittle ? 'warn' : 'fail',
        detail: `Von Mises stress at the shaft ${shaftLocation} exceeds ${input.shaftMaterial.name}'s yield strength at ${label} temperature (SF = ${shaftSf.toFixed(2)}).${input.shaftMaterial.isBrittle ? ' This material has no well-defined yield point in compression — check against its actual compressive strength rating.' : ' Reduce interference or use a stronger shaft material.'}`,
      });
    } else if (shaftSf < 1.5) {
      checks.push({
        id: `shaft-yield-margin-${label}`,
        label: `Shaft ${shaftLocation} stress margin (${label})`,
        severity: 'warn',
        detail: `Shaft safety factor is ${shaftSf.toFixed(2)} at ${label} temperature — low margin against yield.`,
      });
    }
  }

  if (input.hubOuterDiameterMm <= d) {
    checks.push({
      id: 'invalid-hub-od',
      label: 'Hub outer diameter',
      severity: 'fail',
      detail: 'Hub OD must be larger than the interface diameter.',
    });
  }

  const overallPass = checks.every((c) => c.severity !== 'fail');

  return { interferenceAtRefTemp, assembly, operational, storage, insertionForceN, checks, overallPass };
}

function fmtT(c: number): string {
  return `${c % 1 === 0 ? c : c.toFixed(1)}°C`;
}
