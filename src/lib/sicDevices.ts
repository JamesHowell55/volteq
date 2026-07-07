// 1200 V SiC MOSFET device database for the MOSFET Loss Calculator.
//
// ADDING A NEW DEVICE FROM A DATASHEET (5-minute job — every field maps to a
// standard datasheet table):
//   - currentRatingA .......... "Maximum ratings" table: DC continuous drain current ID
//                               (per switch position for modules), at the coldest stated case temp.
//   - rdsOn25mOhm ............. "Static characteristics": RDS(on) typ at Tvj=25°C, at the
//                               recommended VGS(on) below.
//   - rdsOnHotmOhm / rdsOnHotTempC ... same table's hot-temperature row (150 or 175°C typ value).
//   - vgsOnV / vgsOffV ........ recommended/operational gate drive voltages (e.g. +15/−4 V
//                               Wolfspeed, +18/0 V Infineon G2).
//   - eOnMj / eOffMj .......... "Switching characteristics" (inductive load): Eon and Eoff typ
//                               in mJ, and the STATED TEST CONDITIONS:
//   - eTestVdcV / eTestCurrentA ... the VDD and ID those energies were measured at. The engine
//                               scales linearly in current and by (Vdc/Vtest)^kv in voltage.
//   - eRrMj ................... body-diode "Reverse recovery energy" Err typ (mJ) at the same
//                               class of conditions; set 0 if the datasheet only gives Qrr —
//                               the engine then falls back to Err ≈ Qrr·Vdc/4.
//   - qrrUc ................... body-diode reverse recovery charge Qrr typ (µC). Infineon G2
//                               datasheets call this "MOSFET forward recovery charge Qfr".
//   - vsdV .................... body-diode forward voltage VSD typ at rated current with the
//                               channel off (VGS = vgsOffV).
//   - rthJcKPerW .............. "Thermal characteristics": RthJC typ per switch position
//                               (junction-to-heatsink RthJHS for baseplate-less modules — noted).
//   - tvjMaxC ................. operational virtual junction temperature max.
//   - qgNc .................... total gate charge QG typ (nC) at the stated VGS swing.
//   - sourced ................. true = all figures above transcribed from the real datasheet;
//                               false = headline figures (part number, package, Rdson, rating)
//                               verified from the manufacturer's page but the loss parameters are
//                               representative technology-class estimates — edit against the real
//                               datasheet before trusting absolute numbers.
//
// "Lowest RDS(on)" flagship of each family/package was chosen per the user's request.
// Infineon's Q-DPAK G2 top-side-cooled single-switch part numbers could not be verified from
// open sources at build time (2026-07) — add via this interface when a datasheet is to hand.
// Hitachi Energy RoadPak datasheets are registration-gated; that entry is headline-verified only.

export type InverterTopology = 'discrete' | 'halfBridge' | 'sixPack';

export interface SicDevicePreset {
  id: string;
  manufacturer: string;
  partNumber: string;
  packageLabel: string;
  topology: InverterTopology;
  topsideCooled?: boolean;
  currentRatingA: number;
  rdsOn25mOhm: number;
  rdsOnHotmOhm: number;
  rdsOnHotTempC: number;
  vgsOnV: number;
  vgsOffV: number;
  eOnMj: number;
  eOffMj: number;
  eTestVdcV: number;
  eTestCurrentA: number;
  eRrMj: number; // 0 -> engine uses qrrUc fallback
  qrrUc: number;
  vsdV: number;
  rthJcKPerW: number;
  tvjMaxC: number;
  qgNc: number;
  sourced: boolean;
  notes: string;
}

export const SIC_DEVICE_PRESETS: SicDevicePreset[] = [
  // ---------------- Wolfspeed ----------------
  {
    id: 'c4ms025120k', manufacturer: 'Wolfspeed', partNumber: 'C4MS025120K', packageLabel: 'TO-247-4 (Gen 4)',
    topology: 'discrete', currentRatingA: 86, rdsOn25mOhm: 25, rdsOnHotmOhm: 43, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 0.55, eOffMj: 0.25, eTestVdcV: 800, eTestCurrentA: 50,
    eRrMj: 0.05, qrrUc: 0.5, vsdV: 4.3, rthJcKPerW: 0.35, tvjMaxC: 175, qgNc: 165,
    sourced: false,
    notes: 'Gen 4 discrete flagship, 25 mΩ/86 A headline verified from Wolfspeed product page. Switching/diode/thermal figures are representative Gen-4-class estimates — replace from the C4MS025120K datasheet tables before trusting absolute numbers.',
  },
  {
    id: 'c3m0016120k', manufacturer: 'Wolfspeed', partNumber: 'C3M0016120K', packageLabel: 'TO-247-4 (Gen 3)',
    topology: 'discrete', currentRatingA: 115, rdsOn25mOhm: 16, rdsOnHotmOhm: 27, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 0.7, eOffMj: 0.32, eTestVdcV: 800, eTestCurrentA: 63,
    eRrMj: 0.07, qrrUc: 0.8, vsdV: 4.4, rthJcKPerW: 0.27, tvjMaxC: 175, qgNc: 211,
    sourced: false,
    notes: 'Gen 3 lowest-Rdson TO-247-4 discrete (16 mΩ). Headline verified; loss parameters representative — refine from the C3M0016120K datasheet.',
  },
  {
    id: 'c3m0021120j2', manufacturer: 'Wolfspeed', partNumber: 'C3M0021120J2', packageLabel: 'TO-263-7 XL (D2PAK-7 style)',
    topology: 'discrete', currentRatingA: 100, rdsOn25mOhm: 21, rdsOnHotmOhm: 36, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 0.6, eOffMj: 0.28, eTestVdcV: 800, eTestCurrentA: 55,
    eRrMj: 0.06, qrrUc: 0.7, vsdV: 4.4, rthJcKPerW: 0.30, tvjMaxC: 175, qgNc: 185,
    sourced: false,
    notes: 'Lowest-Rdson Wolfspeed surface-mount D2PAK-style part (TO-263-7 XL, 21 mΩ; automotive twin E3M0021120J2). Headline verified; loss parameters representative.',
  },
  {
    id: 'e4ms025120u2', manufacturer: 'Wolfspeed', partNumber: 'E4MS025120U2', packageLabel: 'TSC top-side-cooled (Gen 4)',
    topology: 'discrete', topsideCooled: true, currentRatingA: 86, rdsOn25mOhm: 25, rdsOnHotmOhm: 43, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 0.55, eOffMj: 0.25, eTestVdcV: 800, eTestCurrentA: 50,
    eRrMj: 0.05, qrrUc: 0.5, vsdV: 4.3, rthJcKPerW: 0.35, tvjMaxC: 175, qgNc: 165,
    sourced: false,
    notes: 'Gen 4 automotive top-side-cooled SMD ("TM Pak"-class package). Headline verified; loss parameters representative (same die class as C4MS025120K).',
  },
  {
    id: 'cab450m12xm3', manufacturer: 'Wolfspeed', partNumber: 'CAB450M12XM3', packageLabel: 'XM3 half-bridge module',
    topology: 'halfBridge', currentRatingA: 450, rdsOn25mOhm: 2.6, rdsOnHotmOhm: 4.7, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 25.4, eOffMj: 7.51, eTestVdcV: 600, eTestCurrentA: 450,
    eRrMj: 1.1, qrrUc: 7.2, vsdV: 4.7, rthJcKPerW: 0.094, tvjMaxC: 175, qgNc: 1300,
    sourced: true,
    notes: 'All figures transcribed from the CAB450M12XM3 datasheet (Rev. Jan 2024): Eon/Eoff/Err at VDD=600 V, ID=450 A, VGS=−4/+15 V, RG(on)=4 Ω; Err/Qrr at 175 °C; RthJC per position.',
  },
  {
    id: 'ccb021m12fm3', manufacturer: 'Wolfspeed', partNumber: 'CCB021M12FM3', packageLabel: 'WolfPACK six-pack module',
    topology: 'sixPack', currentRatingA: 30, rdsOn25mOhm: 21, rdsOnHotmOhm: 38, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 0.5, eOffMj: 0.02, eTestVdcV: 600, eTestCurrentA: 30,
    eRrMj: 0.25, qrrUc: 1.3, vsdV: 5.3, rthJcKPerW: 1.032, tvjMaxC: 175, qgNc: 162,
    sourced: true,
    notes: 'All figures transcribed from the CCB021M12FM3 datasheet (Rev. 5, Jun 2026): Eon/Eoff/Err at VDD=600 V, ID=30 A, VGS=−4/+15 V; thermal figure is RthJHS (junction-to-heatsink with pre-applied TIM — baseplate-less module).',
  },

  // ---------------- Infineon ----------------
  {
    id: 'imza120r007m1h', manufacturer: 'Infineon', partNumber: 'IMZA120R007M1H', packageLabel: 'TO-247-4 (CoolSiC M1H)',
    topology: 'discrete', currentRatingA: 131, rdsOn25mOhm: 7, rdsOnHotmOhm: 14.7, rdsOnHotTempC: 175,
    vgsOnV: 18, vgsOffV: 0, eOnMj: 1.2, eOffMj: 0.75, eTestVdcV: 800, eTestCurrentA: 80,
    eRrMj: 0.1, qrrUc: 1.1, vsdV: 4.3, rthJcKPerW: 0.22, tvjMaxC: 175, qgNc: 190,
    sourced: false,
    notes: 'Lowest-Rdson CoolSiC TO-247-4 (7 mΩ M1H). Headline verified; loss parameters representative M1H/M2H-class estimates — refine from the IMZA120R007M1H datasheet.',
  },
  {
    id: 'imbg120r008m2h', manufacturer: 'Infineon', partNumber: 'IMBG120R008M2H', packageLabel: 'D2PAK-7L / TO-263-7 (CoolSiC G2)',
    topology: 'discrete', currentRatingA: 116, rdsOn25mOhm: 7.7, rdsOnHotmOhm: 18.3, rdsOnHotTempC: 175,
    vgsOnV: 18, vgsOffV: 0, eOnMj: 1.28, eOffMj: 0.81, eTestVdcV: 800, eTestCurrentA: 89.9,
    eRrMj: 0.28, qrrUc: 2.1, vsdV: 4.2, rthJcKPerW: 0.18, tvjMaxC: 175, qgNc: 195,
    sourced: true,
    notes: 'Transcribed from the IMBG120R008M2H datasheet (v1.10): Eon 1.28 mJ/Eoff 0.81 mJ at VDD=800 V, ID=89.9 A, VGS=0/+18 V, RG,ext=2.3 Ω; Qfr 2.1 µC and Efr 0.28 mJ at 175 °C used as Qrr/Err; 200 °C cumulative-overload capability. RthJC estimated from package class (datasheet grep returned Rth(j-a) only) — verify.',
  },
  {
    id: 'ff2mr12km1h', manufacturer: 'Infineon', partNumber: 'FF2MR12KM1H', packageLabel: '62 mm half-bridge module (CoolSiC M1H)',
    topology: 'halfBridge', currentRatingA: 500, rdsOn25mOhm: 1.6, rdsOnHotmOhm: 3.0, rdsOnHotTempC: 150,
    vgsOnV: 15, vgsOffV: -5, eOnMj: 28, eOffMj: 15, eTestVdcV: 600, eTestCurrentA: 500,
    eRrMj: 2.0, qrrUc: 10, vsdV: 4.3, rthJcKPerW: 0.05, tvjMaxC: 150, qgNc: 1340,
    sourced: false,
    notes: 'Lowest-Rdson CoolSiC 62 mm half-bridge (1.6 mΩ; QG 1340 nC verified). Other loss parameters representative module-class estimates — refine from the FF2MR12KM1H datasheet.',
  },
  {
    id: 'fs03mr12a6ma1b', manufacturer: 'Infineon', partNumber: 'FS03MR12A6MA1B', packageLabel: 'HybridPACK Drive six-pack (CoolSiC)',
    topology: 'sixPack', currentRatingA: 400, rdsOn25mOhm: 2.75, rdsOnHotmOhm: 5.2, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -5, eOnMj: 18, eOffMj: 9, eTestVdcV: 600, eTestCurrentA: 400,
    eRrMj: 1.5, qrrUc: 8, vsdV: 4.3, rthJcKPerW: 0.10, tvjMaxC: 175, qgNc: 1100,
    sourced: false,
    notes: 'Automotive traction six-pack (2.75 mΩ/400 A headline verified; PinFin baseplate; G2 successor FS02MR12A8MA2B 1200 V/390 A also exists). Loss parameters representative — refine from the FS03MR12A6MA1B datasheet.',
  },

  // ---------------- STMicroelectronics ----------------
  {
    id: 'sct040hu120g3ag', manufacturer: 'ST', partNumber: 'SCT040HU120G3AG', packageLabel: 'HU3PAK top-side-cooled (Gen 3)',
    topology: 'discrete', topsideCooled: true, currentRatingA: 40, rdsOn25mOhm: 40, rdsOnHotmOhm: 68, rdsOnHotTempC: 175,
    vgsOnV: 18, vgsOffV: -3, eOnMj: 0.4, eOffMj: 0.2, eTestVdcV: 800, eTestCurrentA: 40,
    eRrMj: 0.04, qrrUc: 0.4, vsdV: 3.7, rthJcKPerW: 0.5, tvjMaxC: 175, qgNc: 120,
    sourced: false,
    notes: 'Automotive Gen 3 top-side-cooled SMD ("TM Pak"-class package), 40 mΩ/40 A headline verified. Loss parameters representative — refine from the SCT040HU120G3AG datasheet. ST Gen 4 1200 V discretes were still ramping at build time.',
  },
  {
    id: 'adp480120w3l', manufacturer: 'ST', partNumber: 'ADP480120W3-L', packageLabel: 'ACEPACK DRIVE six-pack (Gen 3)',
    topology: 'sixPack', currentRatingA: 480, rdsOn25mOhm: 1.9, rdsOnHotmOhm: 3.6, rdsOnHotTempC: 175,
    vgsOnV: 18, vgsOffV: -3, eOnMj: 20, eOffMj: 10, eTestVdcV: 600, eTestCurrentA: 480,
    eRrMj: 1.8, qrrUc: 9, vsdV: 3.7, rthJcKPerW: 0.09, tvjMaxC: 175, qgNc: 1200,
    sourced: false,
    notes: 'Automotive ACEPACK DRIVE traction six-pack, 1.9 mΩ typ Gen 3 headline verified. Loss parameters representative — refine from the ADP480120W3-L datasheet.',
  },

  // ---------------- Hitachi Energy ----------------
  {
    id: 'roadpak780', manufacturer: 'Hitachi Energy', partNumber: 'RoadPak 1200 V / 780 A class', packageLabel: 'RoadPak half-bridge module',
    topology: 'halfBridge', currentRatingA: 780, rdsOn25mOhm: 1.5, rdsOnHotmOhm: 2.9, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -5, eOnMj: 35, eOffMj: 18, eTestVdcV: 600, eTestCurrentA: 780,
    eRrMj: 3.0, qrrUc: 15, vsdV: 4.3, rthJcKPerW: 0.045, tvjMaxC: 175, qgNc: 2000,
    sourced: false,
    notes: 'EV half-bridge with integrated pin-fin cooling; 1200 V family verified in 580/780/980 A classes. Full datasheets are registration-gated, so ALL electrical figures here are representative estimates — obtain the RoadPak datasheet and edit before trusting absolute numbers.',
  },

  // ---------------- Custom ----------------
  {
    id: 'custom', manufacturer: 'Custom', partNumber: 'Custom device', packageLabel: 'User-defined',
    topology: 'discrete', currentRatingA: 100, rdsOn25mOhm: 10, rdsOnHotmOhm: 18, rdsOnHotTempC: 175,
    vgsOnV: 15, vgsOffV: -4, eOnMj: 1.0, eOffMj: 0.5, eTestVdcV: 800, eTestCurrentA: 100,
    eRrMj: 0, qrrUc: 1.0, vsdV: 4.3, rthJcKPerW: 0.25, tvjMaxC: 175, qgNc: 200,
    sourced: false,
    notes: 'Blank slate — enter values from your device’s datasheet (see the field-mapping guide in sicDevices.ts).',
  },
];

export function getSicDevice(id: string): SicDevicePreset {
  return SIC_DEVICE_PRESETS.find((d) => d.id === id) ?? SIC_DEVICE_PRESETS[SIC_DEVICE_PRESETS.length - 1];
}

/** Human description of the inverter structure for a topology + parallel count. */
export function inverterStructureLabel(topology: InverterTopology, parallelCount: number): string {
  switch (topology) {
    case 'discrete':
      return `${6 * parallelCount} discrete devices (6 positions × ${parallelCount} in parallel)`;
    case 'halfBridge':
      return `${3 * parallelCount} half-bridge modules (3 legs × ${parallelCount} in parallel)`;
    case 'sixPack':
      return parallelCount === 1 ? '1 six-pack module (complete inverter)' : `${parallelCount} six-pack modules in parallel`;
  }
}
