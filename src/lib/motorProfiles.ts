// Motor component-profile schema: the reusable, named "one motor, many
// calculators" data bag. Fields mirror what a motor datasheet actually states
// (rather than deriving one from another): torque constant Kt, back-EMF
// constant Ke, and flux linkage are three DIFFERENT ways of describing a PMSM
// that don't reliably round-trip through each other without a stated
// convention (peak vs RMS, line-line vs phase, mechanical vs electrical) — so
// a profile stores whichever ones the user has, and a consuming calculator
// only pulls a field it can use directly. No silent cross-derivation.
//
// motorType/polePairs/fluxLinkageWb/ldMh/lqMh intentionally match the field
// names+units DqCurrentCalculator's own MOTOR_PRESETS already use, so linking
// a profile there is a direct field copy, not a conversion.

export type MotorType = 'spm' | 'ipm' | 'induction' | 'wound-field' | 'switched-reluctance' | 'other';

export const MOTOR_TYPE_LABELS: Record<MotorType, string> = {
  spm: 'Surface PM (SPM)',
  ipm: 'Interior PM (IPM)',
  induction: 'Induction (AC)',
  'wound-field': 'Wound-field synchronous',
  'switched-reluctance': 'Switched reluctance',
  other: 'Other',
};

export interface MotorProfileParams {
  motorType: MotorType;
  ratedPowerKw: number;
  peakTorqueNm: number;
  continuousTorqueNm: number | null;
  ktNmPerA: number | null;         // torque constant, Nm/A
  keVPerKrpm: number | null;       // back-EMF constant, V/krpm (as printed on the datasheet — convention not assumed)
  polePairs: number | null;
  ldMh: number | null;             // d-axis inductance, mH
  lqMh: number | null;             // q-axis inductance, mH
  fluxLinkageWb: number | null;    // PM flux linkage, Wb (peak, per phase) — direct entry only
  continuousCurrentARms: number | null;
  peakCurrentARms: number | null;
  ratedSpeedRpm: number | null;
  maxSpeedRpm: number | null;
  notes: string;
}

export const BLANK_MOTOR_PROFILE: MotorProfileParams = {
  motorType: 'ipm',
  ratedPowerKw: 250,
  peakTorqueNm: 420,
  continuousTorqueNm: null,
  ktNmPerA: 0.62,
  keVPerKrpm: 68,
  polePairs: 4,
  ldMh: 0.42,
  lqMh: 0.68,
  fluxLinkageWb: null,
  continuousCurrentARms: null,
  peakCurrentARms: null,
  ratedSpeedRpm: null,
  maxSpeedRpm: null,
  notes: '',
};

export function hasFocParams(p: MotorProfileParams): boolean {
  return p.polePairs != null && p.fluxLinkageWb != null && p.ldMh != null && p.lqMh != null;
}
export function hasCurrentParams(p: MotorProfileParams): boolean {
  return p.continuousCurrentARms != null || p.peakCurrentARms != null;
}
export function hasTorqueSpeedParams(p: MotorProfileParams): boolean {
  return p.ktNmPerA != null || p.ratedPowerKw != null;
}

export function motorProfileSummary(p: MotorProfileParams): string {
  const bits = [MOTOR_TYPE_LABELS[p.motorType], `${p.ratedPowerKw} kW`, `${p.peakTorqueNm} N·m peak`];
  if (p.polePairs != null) bits.push(`${p.polePairs}pp`);
  return bits.join(' · ');
}
