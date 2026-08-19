// Headless verification harness. Run: npm run measure
// Measures the feel targets so tuning is done on numbers, not by eye.
import { DRONES, DRONE_ORDER, type DroneDef } from '../src/game/drones.ts'
import {
  PHYS_DT, buildMixer, spawnState, stepDrone, v3,
  type DroneInput, type FlightEnv, type DroneState,
} from '../src/game/physics.ts'
import { WEATHERS, windAt } from '../src/game/weather.ts'

const calm: FlightEnv = { windAt: () => v3(), groundAt: () => 0, fenceRadius: 1e9 }
const gustyEnv: FlightEnv = {
  windAt: (p, t) => windAt(WEATHERS.gusty, p, t),
  groundAt: () => 0,
  fenceRadius: 1e9,
}

const idle: DroneInput = { x: 0, z: 0, climb: 0, yaw: 0, boost: false }

function run(
  def: DroneDef,
  env: FlightEnv,
  seconds: number,
  input: (t: number, s: DroneState) => DroneInput,
  opts: { payload?: boolean; alt?: number } = {},
  onStep?: (t: number, s: DroneState) => void,
): DroneState {
  const mixer = buildMixer(def)
  const s = spawnState(def, v3(0, opts.alt ?? 30, 0))
  s.targetAlt = opts.alt ?? 30
  s.landed = false
  if (opts.payload === false) s.hasPayload = false
  const steps = Math.round(seconds / PHYS_DT)
  for (let i = 0; i < steps; i++) {
    const t = i * PHYS_DT
    stepDrone(s, def, mixer, input(t, s), env, t)
    onStep?.(t, s)
    if (s.battery <= 0) break
  }
  return s
}

const fwd: DroneInput = { ...idle, z: 1 }
const fwdBoost: DroneInput = { ...idle, z: 1, boost: true }

function fmt(n: number, d = 2) { return n.toFixed(d) }

console.log('=== FEEL TARGETS ===')
for (const id of DRONE_ORDER) {
  const def = DRONES[id]

  // 0 -> ~cruise time (95%, the approach is asymptotic), and top speed under boost
  const targetV = def.cruiseSpeed
  let tAccel = NaN
  let topSeen = 0
  run(def, calm, 20, () => fwd, {}, (t, s) => {
    const v = Math.hypot(s.vel.x, s.vel.z)
    if (Number.isNaN(tAccel) && v >= targetV * 0.95) tAccel = t
  })
  run(def, calm, 30, () => fwdBoost, {}, (_t, s) => {
    topSeen = Math.max(topSeen, Math.hypot(s.vel.x, s.vel.z))
  })

  // stop time from cruise: accelerate, then release and time to < 0.5 m/s
  let tRelease = NaN
  let tStop = NaN
  run(def, calm, 40, (t, s) => {
    const v = Math.hypot(s.vel.x, s.vel.z)
    if (Number.isNaN(tRelease)) {
      if (v >= targetV * 0.97 && t > 3) tRelease = t
      return fwd
    }
    return idle
  }, {}, (t, s) => {
    const v = Math.hypot(s.vel.x, s.vel.z)
    if (!Number.isNaN(tRelease) && Number.isNaN(tStop) && t > tRelease && v < 0.5) tStop = t - tRelease
  })

  // same acceleration run with boost held
  let tAccelBoost = NaN
  run(def, calm, 20, () => fwdBoost, {}, (t, s) => {
    const v = Math.hypot(s.vel.x, s.vel.z)
    if (Number.isNaN(tAccelBoost) && v >= def.cruiseSpeed * 0.95) tAccelBoost = t
  })

  // wind drift: hover hands-off in the gusty southerly for 10 s
  const sw = run(def, gustyEnv, 10, () => idle)
  const drift = Math.hypot(sw.pos.x, sw.pos.z)

  // max tilt observed at full stick
  let maxTilt = 0
  run(def, calm, 8, () => fwd, {}, (_t, s) => {
    const up = { x: 2 * (s.quat.x * s.quat.y - s.quat.w * s.quat.z), y: 1 - 2 * (s.quat.x * s.quat.x + s.quat.z * s.quat.z), z: 2 * (s.quat.y * s.quat.z + s.quat.w * s.quat.x) }
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI
    maxTilt = Math.max(maxTilt, tilt)
  })

  // yaw rate at full pedal
  let yawRate = 0
  run(def, calm, 5, () => ({ ...idle, yaw: 1 }), {}, (_t, s) => {
    yawRate = Math.max(yawRate, Math.abs(s.angVel.y) * 180 / Math.PI)
  })

  console.log(`\n${def.model}`)
  console.log(`  0->${targetV} m/s: ${fmt(tAccel)} s   (boost held: ${fmt(tAccelBoost)} s)`)
  console.log(`  stop from ${targetV}: ${fmt(tStop)} s`)
  console.log(`  top speed (boost): ${fmt(topSeen, 1)} m/s`)
  console.log(`  max tilt seen: ${fmt(maxTilt, 1)} deg  | max yaw rate: ${fmt(yawRate, 0)} deg/s`)
  console.log(`  10 s hands-off drift in gusty southerly: ${fmt(drift, 1)} m`)
}

console.log('\n=== BATTERY (minutes:seconds to flat) ===')
function endurance(def: DroneDef, input: DroneInput, payload: boolean): string {
  let t = 0
  run(def, calm, 400, () => input, { payload }, (tt, s) => { if (s.battery > 0) t = tt })
  const m = Math.floor(t / 60)
  const sec = Math.round(t % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const K = DRONES.kestrel, C = DRONES.clydesdale, P = DRONES.peregrine
console.log(`  Kestrel cruise: ${endurance(K, fwd, false)}   (target 4:00)`)
console.log(`  Clydesdale cruise unloaded: ${endurance(C, fwd, false)}   (target 2:30)`)
console.log(`  Clydesdale cruise loaded: ${endurance(C, fwd, true)}   (target 1:30)`)
console.log(`  Peregrine cruise: ${endurance(P, fwd, false)}   (target 1:30)`)
console.log(`  Peregrine continuous boost: ${endurance(P, fwdBoost, false)}   (target 0:35)`)
