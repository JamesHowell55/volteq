// Unit conversion data. Every unit exposes toBase/fromBase functions (not a bare
// factor) so that Temperature — the one non-linear (affine) category — fits the
// same interface as every purely-multiplicative category.

export interface Unit {
  id: string;
  label: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

export interface ConversionCategory {
  id: string;
  label: string;
  units: Unit[];
}

function linearUnit(id: string, label: string, factor: number): Unit {
  return { id, label, toBase: (v) => v * factor, fromBase: (v) => v / factor };
}

export const CONVERSION_CATEGORIES: ConversionCategory[] = [
  {
    id: 'distance',
    label: 'Distance',
    units: [
      linearUnit('mm', 'Millimetre (mm)', 0.001),
      linearUnit('cm', 'Centimetre (cm)', 0.01),
      linearUnit('m', 'Metre (m)', 1),
      linearUnit('km', 'Kilometre (km)', 1000),
      linearUnit('in', 'Inch (in)', 0.0254),
      linearUnit('ft', 'Foot (ft)', 0.3048),
      linearUnit('yd', 'Yard (yd)', 0.9144),
      linearUnit('mile', 'Mile (mi)', 1609.344),
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    units: [
      linearUnit('mg', 'Milligram (mg)', 1e-6),
      linearUnit('g', 'Gram (g)', 0.001),
      linearUnit('kg', 'Kilogram (kg)', 1),
      linearUnit('tonne', 'Tonne (t)', 1000),
      linearUnit('oz', 'Ounce (oz)', 0.028349523125),
      linearUnit('lb', 'Pound (lb)', 0.45359237),
    ],
  },
  {
    id: 'acceleration',
    label: 'Acceleration',
    units: [
      linearUnit('mps2', 'Metre/second² (m/s²)', 1),
      linearUnit('fps2', 'Foot/second² (ft/s²)', 0.3048),
      linearUnit('g0', 'Standard gravity (g)', 9.80665),
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    units: [
      linearUnit('pa', 'Pascal (Pa)', 1),
      linearUnit('kpa', 'Kilopascal (kPa)', 1000),
      linearUnit('mpa', 'Megapascal (MPa)', 1e6),
      linearUnit('bar', 'Bar', 100000),
      linearUnit('psi', 'psi', 6894.757293168),
      linearUnit('atm', 'Atmosphere (atm)', 101325),
      linearUnit('mmhg', 'mmHg (torr)', 133.322387415),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    units: [
      { id: 'c', label: 'Celsius (°C)', toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
      { id: 'f', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9 + 273.15, fromBase: (v) => ((v - 273.15) * 9) / 5 + 32 },
      { id: 'k', label: 'Kelvin (K)', toBase: (v) => v, fromBase: (v) => v },
    ],
  },
  {
    id: 'force',
    label: 'Force',
    units: [
      linearUnit('n', 'Newton (N)', 1),
      linearUnit('kn', 'Kilonewton (kN)', 1000),
      linearUnit('lbf', 'Pound-force (lbf)', 4.4482216152605),
      linearUnit('kgf', 'Kilogram-force (kgf)', 9.80665),
    ],
  },
  {
    id: 'torque',
    label: 'Torque',
    units: [
      linearUnit('nm', 'Newton-metre (N·m)', 1),
      linearUnit('lbf_ft', 'Pound-foot (lbf·ft)', 1.3558179483),
      linearUnit('lbf_in', 'Pound-inch (lbf·in)', 0.1129848290276167),
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    units: [
      linearUnit('j', 'Joule (J)', 1),
      linearUnit('kj', 'Kilojoule (kJ)', 1000),
      linearUnit('cal', 'Calorie (cal)', 4.184),
      linearUnit('kwh', 'Kilowatt-hour (kWh)', 3600000),
      linearUnit('btu', 'BTU', 1055.05585262),
    ],
  },
  {
    id: 'power',
    label: 'Power',
    units: [
      linearUnit('w', 'Watt (W)', 1),
      linearUnit('kw', 'Kilowatt (kW)', 1000),
      linearUnit('hp', 'Horsepower (hp)', 745.6998715822702),
      linearUnit('btu_h', 'BTU/hour', 0.29307107),
    ],
  },
  {
    id: 'area',
    label: 'Area',
    units: [
      linearUnit('mm2', 'Square millimetre (mm²)', 1e-6),
      linearUnit('cm2', 'Square centimetre (cm²)', 1e-4),
      linearUnit('m2', 'Square metre (m²)', 1),
      linearUnit('in2', 'Square inch (in²)', 0.00064516),
      linearUnit('ft2', 'Square foot (ft²)', 0.09290304),
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    units: [
      linearUnit('mm3', 'Cubic millimetre (mm³)', 1e-9),
      linearUnit('cm3', 'Cubic centimetre (cm³/mL)', 1e-6),
      linearUnit('l', 'Litre (L)', 0.001),
      linearUnit('m3', 'Cubic metre (m³)', 1),
      linearUnit('in3', 'Cubic inch (in³)', 0.000016387064),
      linearUnit('ft3', 'Cubic foot (ft³)', 0.028316846592),
      linearUnit('usgal', 'US gallon (gal)', 0.003785411784),
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    units: [
      linearUnit('mps', 'Metre/second (m/s)', 1),
      linearUnit('kph', 'Kilometre/hour (km/h)', 0.2777777777777778),
      linearUnit('mph', 'Miles/hour (mph)', 0.44704),
      linearUnit('fps', 'Foot/second (ft/s)', 0.3048),
      linearUnit('knot', 'Knot', 0.5144444444444445),
    ],
  },
  {
    id: 'density',
    label: 'Density',
    units: [
      linearUnit('kgm3', 'Kilogram/m³ (kg/m³)', 1),
      linearUnit('gcm3', 'Gram/cm³ (g/cm³)', 1000),
      linearUnit('lbft3', 'Pound/ft³ (lb/ft³)', 16.01846337396),
      linearUnit('lbin3', 'Pound/in³ (lb/in³)', 27679.90470923),
    ],
  },
];

export function getCategory(categoryId: string): ConversionCategory | undefined {
  return CONVERSION_CATEGORIES.find((c) => c.id === categoryId);
}

export function getUnit(categoryId: string, unitId: string): Unit | undefined {
  return getCategory(categoryId)?.units.find((u) => u.id === unitId);
}

export function convert(categoryId: string, fromUnitId: string, toUnitId: string, value: number): number {
  const category = getCategory(categoryId);
  if (!category) return NaN;
  const from = category.units.find((u) => u.id === fromUnitId);
  const to = category.units.find((u) => u.id === toUnitId);
  if (!from || !to) return NaN;
  return to.fromBase(from.toBase(value));
}
