// Single source of truth for site navigation: the NavBar dropdowns, the Home page
// tool grid, and App.tsx's placeholder route registration all read from this file,
// so a new calculator only needs to be added here once. `links` within each
// category are kept in alphabetical order by label.
//
// Categories below merge a colleague's suggested ~130-calculator library (grouped
// originally as Battery & Energy Storage / Inverters & Power Electronics / Electric
// Motors / Gearboxes & Mechanical / Electrical Design / Thermal / Physics & Motion /
// EV & Vehicle / Manufacturing / Cost & Project) into fewer top-level nav categories
// so the desktop nav stays usable — Battery+Power Electronics+Motors+Electrical
// Design collapse into Electrical/Power Electronics/Motors/Battery; Physics & Motion
// merges into EV & Vehicle as "Vehicle & Motion"; Gearboxes & Mechanical and
// Manufacturing merge into the existing Mechanical category alongside Bolted Joint.

export interface CalculatorLink {
  label: string;
  path: string;
  available: boolean;
  description: string;
}

export interface NavCategory {
  label: string;
  links: CalculatorLink[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: 'Electrical',
    links: [
      { label: 'Arc Flash Energy', path: '/arc-flash-energy', available: false, description: 'Simplified incident energy estimate for an arc flash event from fault current, voltage, and clearing time — a screening check, not a substitute for a full IEEE 1584 study.' },
      { label: 'Breaker Sizing', path: '/breaker-sizing', available: false, description: 'Select a circuit breaker trip rating and curve from load current, inrush, and downstream protection coordination requirements.' },
      { label: 'Busbar Calculation', path: '/busbar', available: true, description: 'Build a busbar cross-section from multiple bar sections, apply AC or DC current, duration, ambient temperature and material, and calculate steady-state or short-circuit conductor temperature.' },
      { label: 'Cable/Wire Sizing (EV Powertrain)', path: '/cable-sizing', available: true, description: 'Ampacity and voltage drop for EV powertrain cables (battery interconnects, battery-to-inverter, inverter-to-motor) from a first-principles steady-state heat balance, ISO 6722 insulation temperature classes, and bundling derating.' },
      { label: 'Cable Voltage Drop', path: '/cable-voltage-drop', available: false, description: 'Voltage drop along a cable run from conductor size, length, current, and power factor, checked against a target percentage.' },
      { label: 'Capacitor Sizing', path: '/capacitor-sizing', available: false, description: 'Size a capacitor for ripple current, bus support, or filtering duty from voltage, current, and frequency requirements.' },
      { label: 'Creepage and Clearance', path: '/creepage-clearance', available: true, description: 'Minimum creepage and clearance distances per IEC 60664-1 — pollution degree, material group (CTI), overvoltage category, and altitude correction from sea level up to 50,000 ft.' },
      { label: 'Earth Loop Impedance', path: '/earth-loop-impedance', available: false, description: 'Estimate the earth fault loop impedance for a circuit and check it against the protective device\'s disconnection-time requirement.' },
      { label: 'Earthing Conductor Sizing', path: '/earthing-conductor-sizing', available: false, description: 'Size a protective earth/ground conductor from prospective fault current and clearing time using the standard adiabatic method.' },
      { label: 'Fuse Sizing', path: '/fuse-sizing', available: false, description: 'Select a fuse rating and let-through characteristic from load current, inrush, and the protected conductor\'s withstand curve.' },
      { label: 'Harness Wire Bundle Diameter', path: '/harness-bundle-diameter', available: false, description: 'Estimate the overall diameter of a wire harness bundle from individual wire gauges, counts, and insulation build-up.' },
      { label: 'Short Circuit Withstand', path: '/short-circuit-withstand', available: false, description: 'Check a conductor or busbar\'s short-time withstand rating against a prospective fault current and clearing time.' },
      { label: 'Touch Voltage', path: '/touch-voltage', available: false, description: 'Estimate touch and step voltage around an earthing system during a fault, checked against permissible body-current limits.' },
      { label: 'Transformer Losses', path: '/transformer-losses', available: false, description: 'Estimate a transformer\'s no-load (core) and load (copper) losses and overall efficiency at a given loading.' },
      { label: 'Transformer Sizing', path: '/transformer-sizing', available: false, description: 'Size a transformer\'s kVA rating from load profile, inrush, and required voltage regulation.' },
    ],
  },
  {
    label: 'Power Electronics',
    links: [
      { label: 'Capacitor Ripple Current', path: '/capacitor-ripple-current', available: false, description: 'Estimate the RMS ripple current a DC-link or filter capacitor sees, checked against its rated ripple current for life/thermal limits.' },
      { label: 'DC Bus Capacitor Sizing', path: '/dc-bus-capacitor-sizing', available: false, description: 'Size DC-link capacitance for voltage ripple, hold-up time, and ripple-current requirements in an inverter or drive.' },
      { label: 'Efficiency Calculator', path: '/efficiency-calculator', available: false, description: 'Overall system efficiency from input and output power (or a chain of stage efficiencies multiplied together).' },
      { label: 'Gate Resistor Calculator', path: '/gate-resistor-calculator', available: false, description: 'Estimate gate resistor values for a target MOSFET/IGBT switching speed, balancing turn-on/turn-off loss against overshoot and EMI.' },
      { label: 'Harmonic Current Estimator', path: '/harmonic-current-estimator', available: false, description: 'Estimate harmonic current content from a rectifier or drive front-end and check against THD limits (e.g. IEEE 519).' },
      { label: 'IGBT Loss Calculator', path: '/igbt-loss-calculator', available: false, description: 'Conduction and switching loss estimate for an IGBT from datasheet Vce(sat)/Eon/Eoff curves, current, voltage, and switching frequency.' },
      { label: 'Inverter Sizing', path: '/inverter-sizing', available: false, description: 'Size an inverter\'s continuous and peak power/current rating from the motor or load\'s torque-speed and duty cycle requirements.' },
      { label: 'MOSFET Conduction Loss', path: '/mosfet-conduction-loss', available: false, description: 'I²R conduction loss in a MOSFET from RDS(on), RMS current, and temperature-coefficient derating.' },
      { label: 'Power Factor Correction', path: '/power-factor-correction', available: false, description: 'Size correction capacitance to raise a load\'s power factor to a target value from real and reactive power.' },
      { label: 'PWM Frequency Calculator', path: '/pwm-frequency-calculator', available: false, description: 'Trade off PWM switching frequency against switching loss, current ripple, and audible-noise/control-bandwidth requirements.' },
      { label: 'Rectifier Sizing', path: '/rectifier-sizing', available: false, description: 'Size a rectifier\'s diode/bridge current and voltage rating from AC input, DC load, and expected inrush.' },
      { label: 'Single-Phase Power Calculator', path: '/single-phase-power-calculator', available: false, description: 'Real, reactive, and apparent power for a single-phase circuit from voltage, current, and power factor.' },
      { label: 'Snubber Sizing', path: '/snubber-sizing', available: false, description: 'Size an RC or RCD snubber to limit voltage overshoot/ringing on a switching device from stray inductance and switched current.' },
      { label: 'Switching Loss Calculator', path: '/switching-loss-calculator', available: false, description: 'Turn-on/turn-off switching loss for a power device from datasheet energy curves, voltage, current, and switching frequency.' },
      { label: 'Three-Phase Power Calculator', path: '/three-phase-power-calculator', available: false, description: 'Real, reactive, and apparent power for a three-phase circuit from line voltage, current, and power factor, star or delta.' },
    ],
  },
  {
    label: 'Motors',
    links: [
      { label: 'Back EMF Calculator', path: '/back-emf-calculator', available: false, description: 'Estimate a motor\'s back-EMF voltage from speed and the motor\'s voltage constant (Ke/Kv).' },
      { label: 'Base Speed Calculator', path: '/base-speed-calculator', available: false, description: 'The speed at which a motor reaches rated voltage at rated flux, above which field weakening is needed for further speed increase.' },
      { label: 'Continuous Current', path: '/continuous-current', available: false, description: 'A motor\'s continuous (thermally-sustainable) current rating from its thermal time constant and cooling method.' },
      { label: 'Copper Losses', path: '/copper-losses', available: false, description: 'I²R resistive losses in motor windings from phase current and winding resistance (including temperature correction).' },
      { label: 'Duty Cycle Heating', path: '/motor-duty-cycle-heating', available: false, description: 'Equivalent thermal (RMS) current and temperature rise for a motor running a repeating load/duty cycle.' },
      { label: 'Field Weakening Calculator', path: '/field-weakening-calculator', available: false, description: 'Torque and power available above base speed when reducing flux (field weakening) to extend a motor\'s speed range.' },
      { label: 'Iron Losses', path: '/iron-losses', available: false, description: 'Hysteresis and eddy-current core losses in a motor\'s laminations, estimated from flux density, frequency, and material loss curves.' },
      { label: 'Kv ↔ Kt Converter', path: '/kv-kt-converter', available: false, description: 'Convert between a motor\'s speed constant (Kv, RPM/V) and torque constant (Kt, N·m/A) — in consistent SI units they are reciprocals.' },
      { label: 'Motor Acceleration Time', path: '/motor-acceleration-time', available: false, description: 'Time to accelerate a motor and its load to a target speed from available torque and total (motor + load) inertia.' },
      { label: 'Motor Efficiency', path: '/motor-efficiency', available: false, description: 'Motor efficiency from input electrical power and output mechanical power (or from a loss breakdown: copper, iron, friction, windage).' },
      { label: 'Motor Power', path: '/motor-power', available: false, description: 'Mechanical power from torque and speed (P = T·ω), or the electrical input power implied by an efficiency figure.' },
      { label: 'Motor Thermal Rise', path: '/motor-thermal-rise', available: false, description: 'Winding temperature rise above ambient from losses, thermal resistance, and cooling method, checked against insulation class limits.' },
      { label: 'Motor Torque', path: '/motor-torque', available: false, description: 'Torque from power and speed, or from current and the motor\'s torque constant (Kt) for a PM machine.' },
      { label: 'Pole Count Calculator', path: '/pole-count-calculator', available: false, description: 'Relationship between electrical frequency, synchronous speed, and pole count for an AC machine.' },
      { label: 'Rotor Inertia', path: '/rotor-inertia', available: false, description: 'Estimate a rotor\'s mass moment of inertia from its geometry and material density, for acceleration/dynamics calculations.' },
      { label: 'Slip Calculator', path: '/slip-calculator', available: false, description: 'Induction motor slip from synchronous speed and actual rotor speed, and the corresponding rotor-circuit frequency.' },
      { label: 'Speed ↔ Torque ↔ Power', path: '/speed-torque-power', available: false, description: 'Solve for any one of speed, torque, or power given the other two (P = T·ω), with common unit conversions built in.' },
      { label: 'Stall Current', path: '/stall-current', available: false, description: 'Current drawn by a motor at zero speed (locked rotor) from winding resistance and applied voltage — a key protection/sizing check.' },
      { label: 'Starting Current', path: '/starting-current', available: false, description: 'Inrush current during motor start-up (direct-on-line, soft-start, or VFD ramp) for protection and supply-sizing purposes.' },
      { label: 'Synchronous Speed', path: '/synchronous-speed', available: false, description: 'AC machine synchronous speed from supply frequency and pole count (Ns = 120·f/p).' },
    ],
  },
  {
    label: 'Battery',
    links: [
      { label: 'Battery C-Rate', path: '/battery-c-rate', available: false, description: 'Convert between charge/discharge current and C-rate for a given cell or pack capacity, and estimate the resulting time to charge/discharge.' },
      { label: 'Battery Cable Sizing', path: '/battery-cable-sizing', available: false, description: 'Size a battery interconnect or main cable from peak/continuous current, length, and allowable voltage drop at low system voltage.' },
      { label: 'Battery Capacity (Ah ↔ Wh ↔ kWh)', path: '/battery-capacity-converter', available: false, description: 'Convert battery capacity between amp-hours, watt-hours, and kilowatt-hours using the pack\'s nominal voltage.' },
      { label: 'Battery Energy Density', path: '/battery-energy-density', available: false, description: 'Gravimetric (Wh/kg) and volumetric (Wh/L) energy density of a cell or pack from its capacity, voltage, mass, and volume.' },
      { label: 'Battery Fuse Sizing', path: '/battery-fuse-sizing', available: false, description: 'Select a fuse rating for a battery pack or module from continuous/peak current and the cell\'s short-circuit withstand.' },
      { label: 'Battery Pack Series/Parallel Calculator', path: '/battery-pack-series-parallel', available: false, description: 'Resulting pack voltage, capacity, and internal resistance from a chosen series/parallel (SxP) cell arrangement.' },
      { label: 'Battery Runtime', path: '/battery-runtime', available: false, description: 'Estimated runtime of a battery under a given load from capacity, discharge efficiency, and depth-of-discharge limits.' },
      { label: 'Battery Thermal Rise', path: '/battery-thermal-rise', available: false, description: 'Cell/pack temperature rise from internal resistance losses (I²R) at a given current, thermal mass, and cooling.' },
      { label: 'Cell Balancing Calculator', path: '/cell-balancing-calculator', available: false, description: 'Estimate passive or active balancing time/current needed to equalize cell voltages across a pack given imbalance and balancing current.' },
      { label: 'Charge Time', path: '/charge-time', available: false, description: 'Time to charge a battery from a given charge current/profile and capacity, including a taper-charge correction.' },
      { label: 'Internal Resistance Calculator', path: '/internal-resistance-calculator', available: false, description: 'Estimate a cell or pack\'s internal resistance from a voltage-sag-under-load measurement (ΔV/ΔI).' },
      { label: 'Peak Current Calculator', path: '/peak-current-calculator', available: false, description: 'Maximum current a cell/pack can deliver for a short pulse before hitting a voltage or thermal limit.' },
      { label: 'Regenerative Braking Energy Recovery', path: '/regenerative-braking-energy-recovery', available: false, description: 'Estimate the energy recoverable back into the battery during braking from vehicle mass, speed change, and regen system efficiency.' },
      { label: 'State of Charge Estimator', path: '/state-of-charge-estimator', available: false, description: 'Estimate state of charge from open-circuit voltage (OCV-SOC curve) or from coulomb counting of charge/discharge current.' },
      { label: 'Voltage Sag Calculator', path: '/voltage-sag-calculator', available: false, description: 'Voltage drop under load from a cell/pack\'s internal resistance and the applied current (V_sag = I × R_internal).' },
    ],
  },
  {
    label: 'Mechanical',
    links: [
      { label: 'Ball Screw Sizing', path: '/ball-screw-sizing', available: false, description: 'Select a ball screw lead and diameter for a required thrust force, speed, and travel life (L10).' },
      { label: 'Beam Bending', path: '/beam-bending', available: false, description: 'Deflection and bending stress for a standard beam loading case (simply-supported, cantilever, etc.) from section properties and load.' },
      { label: 'Bearing Life (L10)', path: '/bearing-life-l10', available: false, description: 'Rated (L10) bearing life in revolutions or hours from dynamic load rating, equivalent load, and speed — per ISO 281.' },
      { label: 'Belt Drive Ratio', path: '/belt-drive-ratio', available: false, description: 'Speed and torque ratio for a belt-and-pulley drive from pulley diameters, plus belt length and wrap-angle checks.' },
      { label: 'Bolted Joint', path: '/bolted-joint', available: true, description: 'Metric and imperial fastener stack-ups, washers and locking nuts, tapped or threaded-insert engagement, VDI 2230 cone-of-compression stiffness, bidirectional preload/torque, and fastener/clamped-member yield checks.' },
      { label: 'Chain Drive Calculator', path: '/chain-drive-calculator', available: false, description: 'Roller chain and sprocket sizing from power, speed, and service factor per standard chain rating tables.' },
      { label: 'Coupling Selection', path: '/coupling-selection', available: false, description: 'Select a shaft coupling type and size from torque, speed, misalignment, and shock-load requirements.' },
      { label: 'Deflection', path: '/deflection', available: false, description: 'Elastic deflection of a loaded structural member from its stiffness (load, geometry, and modulus of elasticity).' },
      { label: 'Flywheel Inertia', path: '/flywheel-inertia', available: false, description: 'Required flywheel moment of inertia to smooth speed fluctuation to a target coefficient of speed variation.' },
      { label: 'GD&T Tolerance Stack-Up', path: '/gdt-tolerance-stack-up', available: false, description: 'Worst-case or statistical (RSS) tolerance stack-up across a chain of dimensioned features.' },
      { label: 'Gear Ratio', path: '/gear-ratio', available: false, description: 'Speed and torque ratio between two meshing gears from their tooth counts (or pitch diameters).' },
      { label: 'Gear Train Calculator', path: '/gear-train-calculator', available: false, description: 'Overall ratio and output speed/torque for a multi-stage gear train from each stage\'s individual ratio.' },
      { label: 'Keyway Stress', path: '/keyway-stress', available: false, description: 'Shear and bearing stress in a shaft keyway from transmitted torque, key dimensions, and shaft diameter.' },
      { label: 'Leadscrew Force', path: '/leadscrew-force', available: false, description: 'Axial force or drive torque for a leadscrew from lead angle, friction coefficient, and thread geometry.' },
      { label: 'Linear Actuator Sizing', path: '/linear-actuator-sizing', available: false, description: 'Select a linear actuator\'s force and speed rating from load, duty cycle, and required travel time.' },
      { label: 'Orings', path: '/orings', available: false, description: 'O-ring groove sizing, squeeze/stretch percentage, and compatibility checks for static and dynamic seal applications.' },
      { label: 'Output Speed', path: '/output-speed', available: false, description: 'Output shaft speed from input speed and an overall gear/belt/chain reduction ratio.' },
      { label: 'Output Torque', path: '/output-torque', available: false, description: 'Output shaft torque from input torque, reduction ratio, and drivetrain efficiency.' },
      { label: 'Planetary Gearbox Ratio', path: '/planetary-gearbox-ratio', available: false, description: 'Overall reduction ratio for a planetary (epicyclic) gear stage from sun/planet/ring tooth counts and which member is fixed.' },
      { label: 'Plate Deflection', path: '/plate-deflection', available: false, description: 'Deflection and stress for a flat plate under pressure or point load for standard support conditions (simply-supported, fixed edges).' },
      { label: 'Press Fit Calculator', path: '/press-fit-calculator', available: false, description: 'Interference-fit pressure, transmitted torque/axial force capacity, and assembly force for a shaft-hub press fit.' },
      { label: 'Pulley Sizing', path: '/pulley-sizing', available: false, description: 'Pulley diameter selection for a target belt speed and drive ratio, with belt-tension and wrap-angle checks.' },
      { label: 'Rack and Pinion Calculator', path: '/rack-and-pinion-calculator', available: false, description: 'Linear travel speed and drive force from pinion diameter, rotational speed, and applied torque.' },
      { label: 'Shaft Critical Speed', path: '/shaft-critical-speed', available: false, description: 'First critical (whirling) speed of a rotating shaft from its span, diameter, support conditions, and mass distribution.' },
      { label: 'Shaft Torsion', path: '/shaft-torsion', available: false, description: 'Shear stress and angular twist in a shaft under torque from shaft diameter, length, and shear modulus.' },
      { label: 'Spring Rate', path: '/spring-rate', available: false, description: 'Spring stiffness (rate) from wire diameter, coil diameter, number of active coils, and shear modulus for a helical compression/extension spring.' },
      { label: 'Weld Sizing', path: '/weld-sizing', available: false, description: 'Required fillet or groove weld size for a given load, joint type, and weld/base material allowable stress.' },
    ],
  },
  {
    label: 'Thermal',
    links: [
      { label: 'Air Temperature Rise', path: '/air-temperature-rise', available: false, description: 'Temperature rise of a cooling airstream from absorbed heat load, mass flow rate, and specific heat.' },
      { label: 'Conductive Heat Transfer', path: '/conductive-heat-transfer', available: false, description: 'Steady-state conductive heat flow through a layered material stack from thermal conductivity, thickness, and area.' },
      { label: 'Cooling Fan Airflow', path: '/cooling-fan-airflow', available: false, description: 'Required fan airflow (CFM/m³h) for a given heat load and allowable air temperature rise, with a static-pressure/system-curve check.' },
      { label: 'Enclosure Temperature Rise', path: '/enclosure-temperature-rise', available: false, description: 'Internal temperature rise of a sealed or vented enclosure from internal heat dissipation, surface area, and ambient conditions.' },
      { label: 'Heat Sink Sizing', path: '/heat-sink-sizing', available: false, description: 'Required heat sink thermal resistance for a target junction/case temperature from power dissipation and ambient temperature.' },
      { label: 'Junction Temperature', path: '/junction-temperature', available: false, description: 'Semiconductor junction temperature from power dissipation and the junction-to-ambient (or junction-to-case-to-sink-to-ambient) thermal resistance chain.' },
      { label: 'Liquid Cooling Flow Rate', path: '/liquid-cooling-flow-rate', available: false, description: 'Required coolant flow rate for a target temperature rise from heat load, coolant specific heat, and density.' },
      { label: 'Pressure Drop', path: '/pressure-drop', available: false, description: 'Fluid pressure drop through pipework or channels from flow rate, geometry, and fluid properties.' },
      { label: 'Radiator Sizing', path: '/radiator-sizing', available: false, description: 'Radiator surface area/core sizing for a target heat rejection from coolant flow, temperature difference, and airflow.' },
      { label: 'Thermal Resistance', path: '/thermal-resistance', available: false, description: 'Thermal resistance of a conduction path, convective surface, or combined stack, and the resulting temperature rise for a given power.' },
    ],
  },
  {
    label: 'Vehicle & Motion',
    links: [
      { label: 'Acceleration', path: '/acceleration', available: false, description: 'Basic kinematic acceleration from a change in velocity over time, or from net force and mass (a = F/m).' },
      { label: 'Aerodynamic Drag', path: '/aerodynamic-drag', available: false, description: 'Aerodynamic drag force and power from drag coefficient, frontal area, air density, and speed.' },
      { label: 'Angular Velocity', path: '/angular-velocity', available: false, description: 'Convert between angular velocity, rotational speed (RPM), and tangential velocity at a given radius.' },
      { label: 'Centrifugal Force', path: '/centrifugal-force', available: false, description: 'Centrifugal force on a rotating mass from its mass, radius, and angular velocity.' },
      { label: 'Deceleration Distance', path: '/deceleration-distance', available: false, description: 'Stopping distance from initial speed and a constant deceleration rate (or required deceleration for a target stopping distance).' },
      { label: 'Energy', path: '/energy', available: false, description: 'Work-energy relationships — force over distance, and conversions between energy units.' },
      { label: 'Force', path: '/force', available: false, description: 'Newton\'s second law: force from mass and acceleration, or the reverse.' },
      { label: 'Gear Ratio Optimiser', path: '/gear-ratio-optimiser', available: false, description: 'Suggest a gear ratio (or ratio range) that best matches a motor\'s torque-speed curve to a vehicle\'s performance targets.' },
      { label: 'Gradeability', path: '/gradeability', available: false, description: 'Maximum grade (slope) a vehicle can climb at a given speed from available wheel torque, mass, and rolling/aero resistance.' },
      { label: 'Kinetic Energy', path: '/kinetic-energy', available: false, description: 'Translational kinetic energy from mass and velocity (½mv²), or rotational kinetic energy from inertia and angular velocity.' },
      { label: 'Momentum', path: '/momentum', available: false, description: 'Linear momentum from mass and velocity, and impulse-momentum (force × time = Δmomentum) relationships.' },
      { label: 'Potential Energy', path: '/potential-energy', available: false, description: 'Gravitational potential energy from mass, height, and local gravitational acceleration.' },
      { label: 'Power Required at Speed', path: '/power-required-at-speed', available: false, description: 'Total propulsion power needed to sustain a vehicle at a given speed — sum of rolling resistance, aerodynamic drag, and grade power.' },
      { label: 'Range Estimator', path: '/range-estimator', available: false, description: 'Estimated vehicle range from usable battery energy and an average energy-consumption rate (or a speed-dependent consumption model).' },
      { label: 'Regenerative Braking', path: '/regenerative-braking', available: false, description: 'Braking force and deceleration achievable through regenerative braking alone, before friction brakes are needed.' },
      { label: 'Rolling Resistance', path: '/rolling-resistance', available: false, description: 'Rolling resistance force from vehicle weight and a tyre/surface rolling resistance coefficient.' },
      { label: 'Rotational Inertia', path: '/rotational-inertia', available: false, description: 'Mass moment of inertia for common shapes (disc, cylinder, ring, sphere) from mass and geometry.' },
      { label: 'Top Speed', path: '/top-speed', available: false, description: 'Maximum vehicle speed where available propulsion power equals the power demanded by rolling resistance and aerodynamic drag.' },
      { label: 'Vehicle Acceleration', path: '/vehicle-acceleration', available: false, description: '0-to-speed acceleration time and distance from available wheel force, vehicle mass, and resistance losses.' },
      { label: 'Wheel Torque', path: '/wheel-torque', available: false, description: 'Torque at the wheel from motor torque and the drivetrain (gearbox/final-drive) ratio and efficiency, or the reverse from a target tractive force.' },
    ],
  },
  {
    label: 'Material',
    links: [
      { label: 'Material Database', path: '/material-database', available: false, description: 'A filterable material property database — select a class (metallics, polymers, carbon, ceramics) and property ranges to find matching candidate materials.' },
    ],
  },
  {
    label: 'Cost & Project',
    links: [
      { label: 'Carbon Emissions Calculator', path: '/carbon-emissions-calculator', available: false, description: 'Estimate CO₂-equivalent emissions from energy consumption and a grid (or fuel) emissions factor.' },
      { label: 'Charging Cost', path: '/charging-cost', available: false, description: 'Cost to charge a battery from energy required, electricity tariff, and charger efficiency.' },
      { label: 'Efficiency Savings', path: '/efficiency-savings', available: false, description: 'Energy and cost saved by improving a system\'s efficiency from a baseline to a target value at a given duty/load profile.' },
      { label: 'Energy Cost Calculator', path: '/energy-cost-calculator', available: false, description: 'Running energy cost from power consumption, operating hours, and electricity tariff.' },
      { label: 'Lifetime Energy Consumption', path: '/lifetime-energy-consumption', available: false, description: 'Total energy consumed over a product\'s operating life from duty cycle, power draw, and expected service life.' },
      { label: 'Motor Cost Comparison', path: '/motor-cost-comparison', available: false, description: 'Compare total cost of ownership between motor/drive options from purchase price, efficiency, and lifetime energy cost.' },
      { label: 'ROI Calculator', path: '/roi-calculator', available: false, description: 'Payback period and return on investment from an upfront cost and a recurring saving (energy, maintenance, or otherwise).' },
    ],
  },
];

export const CONVERSIONS_LINK: CalculatorLink = {
  label: 'Conversions',
  path: '/conversions',
  available: true,
  description: 'Convert between units across distance, mass, force, torque, pressure, temperature, energy, power, area, volume, acceleration, speed, density, angular velocity, and wire gauge.',
};

export const ALL_CALCULATOR_LINKS: CalculatorLink[] = [...NAV_CATEGORIES.flatMap((c) => c.links), CONVERSIONS_LINK];

export function getCalculatorLinkByPath(path: string): CalculatorLink | undefined {
  return ALL_CALCULATOR_LINKS.find((l) => l.path === path);
}
