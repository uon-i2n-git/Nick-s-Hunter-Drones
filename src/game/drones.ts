// All drone numbers live here. Source figures: DRONE_SPECS.md.
// Tuning values (masses, gains, tilt limits, drain rates) are deliberately
// in this one file so the flight model and the hangar card cannot drift apart.

export type DroneId = 'kestrel' | 'clydesdale' | 'peregrine'

export interface RotorDef {
  /** position in the body frame, metres */
  pos: [number, number, number]
  /** spin direction for reaction torque, +1 or -1 */
  spin: 1 | -1
}

export interface DroneDef {
  id: DroneId
  model: string
  cls: string
  tagline: string
  priceAUD: number
  // hangar card stats (display strings straight from the spec sheet)
  card: {
    takeoffKg: string
    flightMin: string
    topSpeed: string
    payloadKg: string
    windTol: string
    ability: string
    sells: [string, string, string]
  }
  /** 0..5 dot ratings from the DRONE_SPECS comparison table */
  ratings: { speed: number; agility: number; endurance: number; lift: number; wind: number; stealth: number }

  // ---- flight model ----
  mass: number // kg, as spawned (Clydesdale includes battery, excludes crate)
  payloadMass: number // kg attached at spawn (crate); 0 for others
  rotors: RotorDef[]
  /** total max thrust / weight at spawn mass (empty of payload) */
  twr: number
  /** first-order motor RPM lag time constant, seconds. Most of the character. */
  motorTau: number
  /** quadratic drag coefficient, N per (m/s)^2, sized so max tilt equilibrium = top speed */
  kDrag: number
  /** how strongly this airframe feels the wind (exposed area vs disc loading, exaggerated for feel) */
  windSens: number
  inertia: [number, number, number] // Ixx, Iyy, Izz  (pitch, yaw, roll axes)
  /** reaction torque per unit thrust, metres — exaggerated so yaw feels responsive */
  yawTorquePerThrust: number

  maxTiltDeg: number // sustained command limit
  punchTiltDeg: number // transient limit while velocity error is large
  boostTiltDeg: number // limit under boost
  brakeTiltDeg: number // limit while braking to a stop
  cruiseSpeed: number // m/s, unboosted command ceiling
  topSpeed: number // m/s, boosted
  maxYawRateDeg: number // deg/s
  maxTiltRateDeg: number // deg/s, attitude loop rate clamp
  climbRate: number // m/s target-altitude slew

  kVel: number // velocity error -> accel command, 1/s
  kAttP: number // attitude error -> body rate target, 1/s
  kRateP: number // rate error -> angular accel, 1/s
  kAltP: number // altitude hold
  kAltD: number

  battery: {
    /** drain per second = idle + load * (thrust / spawn-weight)^1.5, battery is 0..1 */
    idle: number
    load: number
    label: string // endurance line for the report
  }
}

const KESTREL: DroneDef = {
  id: 'kestrel',
  model: 'HD-1 Kestrel',
  cls: 'Recon',
  tagline: '"It is already halfway back before the others have finished climbing."',
  priceAUD: 18400,
  card: {
    takeoffKg: '1.9',
    flightMin: '42',
    topSpeed: '24',
    payloadKg: '0.5',
    windTol: '12',
    ability: 'Sensor Sweep',
    sells: [
      'Longest time on task in the fleet, by a wide margin',
      'Quietest airframe at 42 dB(A), suits urban and wildlife work',
      'One person, one backpack, no launch equipment',
    ],
  },
  ratings: { speed: 3, agility: 4, endurance: 5, lift: 1, wind: 2, stealth: 5 },

  mass: 1.9,
  payloadMass: 0,
  rotors: [
    { pos: [-0.13, 0, -0.13], spin: 1 },
    { pos: [0.13, 0, -0.13], spin: -1 },
    { pos: [0.13, 0, 0.13], spin: 1 },
    { pos: [-0.13, 0, 0.13], spin: -1 },
  ],
  twr: 3.2,
  motorTau: 0.06,
  // m*g*tan(35deg) / 24^2
  kDrag: 0.0227,
  windSens: 2.2,
  inertia: [0.021, 0.034, 0.021],
  yawTorquePerThrust: 0.15,

  maxTiltDeg: 35,
  punchTiltDeg: 35,
  boostTiltDeg: 35,
  brakeTiltDeg: 35,
  cruiseSpeed: 14,
  topSpeed: 24,
  maxYawRateDeg: 180,
  maxTiltRateDeg: 240,
  climbRate: 6,

  kVel: 2.6,
  kAttP: 10,
  kRateP: 22,
  kAltP: 4,
  kAltD: 3,

  // full battery ~4:00 in normal flying (compressed ~10x against the 42 min spec)
  battery: { idle: 0.00167, load: 0.0025, label: '4:00 nominal' },
}

const CLYDESDALE: DroneDef = {
  id: 'clydesdale',
  model: 'HD-2 Clydesdale',
  cls: 'Payload',
  tagline: '"It will not win a race. It will finish the job in weather that grounded everything else."',
  priceAUD: 94900,
  card: {
    takeoffKg: '24',
    flightMin: '28',
    topSpeed: '16',
    payloadKg: '8.0',
    windTol: '18',
    ability: 'Cargo Release',
    sells: [
      'Eight kilograms, fifteen kilometres, in weather that stops the rest',
      'Winch delivery means no landing site is required',
      'Load cell telemetry gives a record for every delivery',
    ],
  },
  ratings: { speed: 2, agility: 1, endurance: 2, lift: 5, wind: 4, stealth: 1 },

  mass: 16,
  payloadMass: 8,
  rotors: [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i * Math.PI) / 3 + Math.PI / 6
    return { pos: [Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62], spin: i % 2 === 0 ? 1 : -1 } as RotorDef
  }),
  twr: 1.9,
  motorTau: 0.22,
  // m_loaded*g*tan(20deg) / 16^2
  kDrag: 0.335,
  windSens: 0.15,
  inertia: [4.6, 7.4, 4.6],
  yawTorquePerThrust: 0.2,

  maxTiltDeg: 20,
  punchTiltDeg: 20,
  boostTiltDeg: 20,
  brakeTiltDeg: 13,
  cruiseSpeed: 11,
  topSpeed: 16,
  maxYawRateDeg: 90,
  maxTiltRateDeg: 55,
  climbRate: 3.5,

  kVel: 0.9,
  kAttP: 3.6,
  kRateP: 7,
  kAltP: 2.2,
  kAltD: 2.4,

  // ~2:30 unloaded, ~1:30 with the 8 kg crate on the hook
  battery: { idle: 0.00136, load: 0.00531, label: '2:30 · 1:30 loaded' },
}

const PEREGRINE: DroneDef = {
  id: 'peregrine',
  model: 'HD-3 Peregrine',
  cls: 'Interceptor',
  tagline: '"From alert to intercept in under forty seconds."',
  priceAUD: 138000,
  card: {
    takeoffKg: '4.6',
    flightMin: '18',
    topSpeed: '48',
    payloadKg: '1.2',
    windTol: '22',
    ability: 'Net Launcher',
    sells: [
      'Fastest response in the fleet, alert to capture',
      'Non lethal capture keeps the intruder intact as evidence',
      'Radar and RF work in fog, dust and darkness',
    ],
  },
  ratings: { speed: 5, agility: 5, endurance: 2, lift: 2, wind: 5, stealth: 2 },

  mass: 4.6,
  payloadMass: 0,
  rotors: [
    { pos: [-0.3, 0, -0.24], spin: 1 },
    { pos: [0.3, 0, -0.24], spin: -1 },
    { pos: [0.3, 0, 0.24], spin: 1 },
    { pos: [-0.3, 0, 0.24], spin: -1 },
  ],
  twr: 6.5,
  motorTau: 0.03,
  // m*g*tan(78deg) / 48^2 — boost tops out at 48
  kDrag: 0.0921,
  windSens: 0.5,
  inertia: [0.2, 0.36, 0.2],
  yawTorquePerThrust: 0.18,

  maxTiltDeg: 45,
  punchTiltDeg: 66,
  boostTiltDeg: 78,
  brakeTiltDeg: 46,
  cruiseSpeed: 22,
  topSpeed: 48,
  maxYawRateDeg: 240,
  maxTiltRateDeg: 480,
  climbRate: 10,

  kVel: 3.2,
  kAttP: 13,
  kRateP: 30,
  kAltP: 6,
  kAltD: 4,

  // ~1:30 patrol, ~0:35 under continuous boost
  battery: { idle: 0.00778, load: 0.00198, label: '1:30 · 0:35 boost' },
}

export const DRONES: Record<DroneId, DroneDef> = {
  kestrel: KESTREL,
  clydesdale: CLYDESDALE,
  peregrine: PEREGRINE,
}

export const DRONE_ORDER: DroneId[] = ['kestrel', 'clydesdale', 'peregrine']
