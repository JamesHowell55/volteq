// MIL-DTL-38999 Series III connector data for the Harness Designer.
//
// Sourced from a real, current MIL-DTL-38999 Series III cross-reference
// catalog (Milnec TX/DS series — "guaranteed fully compatible and
// interchangeable with all existing MIL-DTL-38999 Series III commercial,
// military, NASA, ESA derivatives"), specifically:
//  - Shell size -> maximum contacts for a single-contact-size insert
//    arrangement: the real per-shell-size "all one contact size" rows
//    from the full insert-arrangement table (e.g. 9-35, 11-35, 13-35 ...
//    for #22D; 9-98, 11-98 ... for #20; etc). Mixed-size arrangements exist
//    in the real spec too, but a single dominant contact size per connector
//    is this tool's scope (matches "based on number of pins required - wire
//    gauge" from the request) — disclosed in the UI.
//  - Contact size wire range, current rating, and max contact resistance:
//    Glenair "MIL-DTL-38999 Contact Performance Specifications" + the TX/DS
//    series wire & crimp contact dimension tables.
//  - Shell finish / salt-spray hours: TX series material characteristics
//    (W/N,G/K finishes) plus the industry-standard Z/ZNU black zinc-nickel
//    finish (RoHS-compliant, qualified to the same 500 h as W/cadmium).
//  - Connector types: standard MIL-DTL-38999 mounting styles.

export type ContactSize = '22D' | '20' | '16' | '12';

export interface ContactSizeSpec {
  size: ContactSize;
  awgRange: number[];
  currentRatingA: number;
  contactResistanceMOhmMax: number;
}

export const CONTACT_SIZE_SPECS: Record<ContactSize, ContactSizeSpec> = {
  '22D': { size: '22D', awgRange: [22, 24, 26, 28], currentRatingA: 5, contactResistanceMOhmMax: 14.6 },
  '20': { size: '20', awgRange: [20, 22, 24], currentRatingA: 7.5, contactResistanceMOhmMax: 7.3 },
  '16': { size: '16', awgRange: [16, 18, 20], currentRatingA: 13, contactResistanceMOhmMax: 3.8 },
  '12': { size: '12', awgRange: [12, 14], currentRatingA: 23, contactResistanceMOhmMax: 1.7 },
};

export interface ShellSizeSpec {
  shellSize: number;
  militaryLetter: string;
  maxContacts: Partial<Record<ContactSize, number>>;
}

/** Real maximum-contacts-of-a-single-size insert arrangement per shell size
 *  (MIL-DTL-38999 Series III, sourced from the full insert arrangement table
 *  — see file header). E.g. shell 25's "25-35" arrangement holds 128x #22D. */
export const D38999_SHELL_SIZES: ShellSizeSpec[] = [
  { shellSize: 9, militaryLetter: 'A', maxContacts: { '22D': 6, '20': 3 } },
  { shellSize: 11, militaryLetter: 'B', maxContacts: { '22D': 13, '20': 6, '16': 2 } },
  { shellSize: 13, militaryLetter: 'C', maxContacts: { '22D': 22, '20': 10, '16': 4 } },
  { shellSize: 15, militaryLetter: 'D', maxContacts: { '22D': 37, '20': 19, '16': 5 } },
  { shellSize: 17, militaryLetter: 'E', maxContacts: { '22D': 55, '20': 26, '16': 8, '12': 6 } },
  { shellSize: 19, militaryLetter: 'F', maxContacts: { '22D': 66, '20': 32, '16': 11 } },
  { shellSize: 21, militaryLetter: 'G', maxContacts: { '22D': 79, '20': 41, '16': 16, '12': 11 } },
  { shellSize: 23, militaryLetter: 'H', maxContacts: { '22D': 100, '20': 55, '16': 21, '12': 14 } },
  { shellSize: 25, militaryLetter: 'J', maxContacts: { '22D': 128, '20': 61, '16': 29, '12': 19 } },
];

export function getShellSize(shellSize: number): ShellSizeSpec {
  return D38999_SHELL_SIZES.find((s) => s.shellSize === shellSize) ?? D38999_SHELL_SIZES[0];
}

export function maxContactsFor(shellSize: number, contactSize: ContactSize): number {
  return getShellSize(shellSize).maxContacts[contactSize] ?? 0;
}

/** Contact sizes actually available (nonzero) for a given shell size. */
export function availableContactSizes(shellSize: number): ContactSize[] {
  const spec = getShellSize(shellSize);
  return (Object.keys(spec.maxContacts) as ContactSize[]).filter((c) => (spec.maxContacts[c] ?? 0) > 0);
}

export interface ConnectorTypeOption {
  id: string;
  label: string;
  description: string;
}
export const CONNECTOR_TYPES: ConnectorTypeOption[] = [
  { id: 'jamNut', label: 'Jam nut receptacle', description: 'Single-hole panel mount with an integral O-ring seal; rear accessory threads accept a protective backshell. The most common bulkhead-mount style.' },
  { id: 'flangeMount', label: 'Flange / box mount receptacle', description: 'Four-hole flange for mounting to the front of an enclosure or box wall.' },
  { id: 'wallMount', label: 'Wall mount receptacle', description: 'Four-hole flange for mounting to a panel, with rear accessory threads for a backshell — similar to flange mount but typically used on thinner panels.' },
  { id: 'freePlug', label: 'Free / flying-lead plug', description: 'Cable-mounted plug with no panel mounting — terminates a harness run and mates with any of the receptacle styles above.' },
];
export function getConnectorType(id: string): ConnectorTypeOption {
  return CONNECTOR_TYPES.find((t) => t.id === id) ?? CONNECTOR_TYPES[0];
}

export interface FinishOption {
  id: string;
  label: string;
  saltSprayHours: number;
  notes: string;
}
export const FINISH_OPTIONS: FinishOption[] = [
  { id: 'W', label: 'Cadmium / olive drab (Class W)', saltSprayHours: 500, notes: 'Electrically conductive cadmium plate with an olive-drab chromate after-treat.' },
  { id: 'Z', label: 'Black zinc-nickel, RoHS (Class Z / ZNU)', saltSprayHours: 500, notes: 'RoHS-compliant alternative to cadmium — meets or exceeds the same 500 h salt-spray qualification.' },
  { id: 'N', label: 'Electroless nickel (Class N / G)', saltSprayHours: 48, notes: 'Lower corrosion resistance than W/Z; typically chosen where conductivity/RFI shielding matters more than salt-spray life.' },
  { id: 'K', label: 'Passivated stainless (Class K)', saltSprayHours: 1000, notes: 'Highest sourced salt-spray rating; requires a stainless-steel shell.' },
];
export function getFinish(id: string): FinishOption {
  return FINISH_OPTIONS.find((f) => f.id === id) ?? FINISH_OPTIONS[0];
}
