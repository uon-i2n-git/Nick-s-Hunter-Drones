// Hand-written flight model. One rigid body per drone, semi-implicit Euler
// at a fixed 120 Hz. No three.js imports so this also runs headless in Node
// for the measurement harness (tools/measure.ts).

import type { DroneDef } from './drones.ts'

export const PHYS_HZ = 120
export const PHYS_DT = 1 / PHYS_HZ
export const G = 9.81
export const CRASH_DESCENT = 6 // m/s vertical at contact = crash

const DEG = Math.PI / 180

// ---- minimal vector/quaternion helpers (plain objects, no classes) --------
export interface V3 { x: number; y: number; z: number }
export interface Q4 { x: number; y: number; z: number; w: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })

function rotate(q: Q4, v: V3): V3 {
  // v' = q v q*
  const { x, y, z, w } = q
  const ix = w * v.x + y * v.z - z * v.y
  const iy = w * v.y + z * v.x - x * v.z
  const iz = w * v.z + x * v.y - y * v.x
  const iw = -x * v.x - y * v.y - z * v.z
  return v3(
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  )
}
function rotateInv(q: Q4, v: V3): V3 {
  return rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v)
}

// ---- motor mixer -----------------------------------------------------------
// Solve per-rotor thrusts f for a desired [T, Mpitch, Myaw, Mroll] with the
// right pseudo-inverse of the 4xN allocation matrix. Precomputed per drone.
export type Mixer = number[][] // N x 4

export function buildMixer(def: DroneDef): Mixer {
  const n = def.rotors.length
  // rows: T = sum f ; Mx = sum -z f ; My = sum spin*yawArm f ; Mz = sum x f
  const M: number[][] = [
    def.rotors.map(() => 1),
    def.rotors.map((r) => -r.pos[2]),
    def.rotors.map((r) => r.spin * def.yawTorquePerThrust),
    def.rotors.map((r) => r.pos[0]),
  ]
  // A = M Mt (4x4), invert with Gauss-Jordan
  const A = Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => M[i].reduce((s, _, k) => s + M[i][k] * M[j][k], 0)),
  )
  const inv = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => (i === j ? 1 : 0)))
  for (let c = 0; c < 4; c++) {
    let p = c
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    ;[inv[c], inv[p]] = [inv[p], inv[c]]
    const d = A[c][c]
    for (let j = 0; j < 4; j++) { A[c][j] /= d; inv[c][j] /= d }
    for (let r = 0; r < 4; r++) {
      if (r === c) continue
      const f = A[r][c]
      for (let j = 0; j < 4; j++) { A[r][j] -= f * A[c][j]; inv[r][j] -= f * inv[c][j] }
    }
  }
  // pinv = Mt (M Mt)^-1, N x 4
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    out.push(Array.from({ length: 4 }, (_, j) => M.reduce((s, _, k) => s + M[k][i] * inv[k][j], 0)))
  }
  return out
}

// ---- state -----------------------------------------------------------------
export interface DroneState {
  pos: V3
  vel: V3
  quat: Q4
  angVel: V3 // body frame, rad/s
  rotorOmega: number[] // per-rotor, 0..1 of max
  targetAlt: number
  battery: number // 0..1
  hasPayload: boolean
  crashed: boolean // set for one step when a hard contact happens
  landed: boolean
  thrust: number // last total thrust, N (for battery + fx)
  tumbling: boolean // controller off, let it fall
}

export interface DroneInput {
  x: number // -1..1 right
  z: number // -1..1 forward
  climb: number // -1..1
  yaw: number // -1..1, positive = nose left
  boost: boolean
}

export interface FlightEnv {
  windAt: (pos: V3, t: number) => V3
  groundAt: (x: number, z: number) => number
  /** soft geofence: radius where pushback starts */
  fenceRadius: number
}

export function spawnState(def: DroneDef, pos: V3): DroneState {
  return {
    pos: { ...pos },
    vel: v3(),
    quat: { x: 0, y: 0, z: 0, w: 1 },
    angVel: v3(),
    rotorOmega: def.rotors.map(() => 0.4),
    targetAlt: pos.y,
    battery: 1,
    hasPayload: def.payloadMass > 0,
    crashed: false,
    landed: true,
    thrust: 0,
    tumbling: false,
  }
}

const DEADZONE = 0.06
const EXPO = 0.35
export function shapeAxis(v: number): number {
  const a = Math.abs(v) < DEADZONE ? 0 : (Math.abs(v) - DEADZONE) / (1 - DEADZONE)
  const e = (1 - EXPO) * a + EXPO * a * a * a
  return Math.sign(v) * Math.min(1, e)
}

// ---- one 120 Hz step -------------------------------------------------------
export function stepDrone(
  s: DroneState,
  def: DroneDef,
  mixer: Mixer,
  input: DroneInput,
  env: FlightEnv,
  t: number,
): void {
  const dt = PHYS_DT
  const mass = s.hasPayload ? def.mass + def.payloadMass : def.mass
  const wind = env.windAt(s.pos, t)
  s.crashed = false

  // --- control chain: input -> desired attitude -> attitude P -> rate P -> mix
  const ix = shapeAxis(input.x)
  const iz = shapeAxis(input.z)
  const hasStick = ix !== 0 || iz !== 0

  // heading
  const fwd = rotate(s.quat, v3(0, 0, -1))
  const yaw = Math.atan2(-fwd.x, -fwd.z)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)

  // desired horizontal velocity in the yaw frame, with drag feed-forward so
  // the wanted speed is the actual equilibrium (P-controller alone settles low)
  const speed = input.boost ? def.topSpeed : def.cruiseSpeed
  const stick = Math.min(1, Math.hypot(ix, iz))
  const vWant = stick * speed
  const spdCmd = vWant + (def.kDrag * vWant * vWant) / (mass * def.kVel)
  const inv = stick > 0 ? spdCmd / stick : 0
  const vdx = (ix * cy - iz * -sy) * inv
  const vdz = (ix * -sy + iz * -cy) * inv // forward is -Z

  const evx = vdx - s.vel.x
  const evz = vdz - s.vel.z
  const eMag = Math.hypot(evx, evz)

  // accel command, clamped by the active tilt limit. The punch limit holds
  // until 95% of the wanted speed so the build to cruise stays aggressive.
  const vh = Math.hypot(s.vel.x, s.vel.z)
  let tiltLim = def.maxTiltDeg
  if (!hasStick) tiltLim = def.brakeTiltDeg
  else if (input.boost) tiltLim = def.boostTiltDeg
  else if (vh < 0.95 * vWant || eMag > 8) tiltLim = def.punchTiltDeg
  const aMax = G * Math.tan(tiltLim * DEG)
  let ax = evx * def.kVel
  let az = evz * def.kVel
  const aMag = Math.hypot(ax, az)
  if (aMag > aMax) { ax *= aMax / aMag; az *= aMax / aMag }

  // altitude hold: Space/Ctrl slew the target altitude
  s.targetAlt += input.climb * def.climbRate * dt
  const ground = env.groundAt(s.pos.x, s.pos.z)
  s.targetAlt = Math.max(ground + 0.4, Math.min(180, s.targetAlt))
  let aUp = def.kAltP * (s.targetAlt - s.pos.y) + def.kAltD * -s.vel.y
  aUp = Math.max(-0.85 * G, Math.min(def.climbRate * 2.5, aUp))

  // desired thrust vector and attitude
  const tvx = ax
  const tvy = G + aUp
  const tvz = az
  const tMag = Math.hypot(tvx, tvy, tvz)
  let thrustCmd = mass * tMag
  const maxThrust = def.twr * def.mass * G
  thrustCmd = Math.max(0, Math.min(maxThrust, thrustCmd))

  // attitude error: rotate body up onto the desired thrust direction
  const up = rotate(s.quat, v3(0, 1, 0))
  const dx = tvx / tMag
  const dy = tvy / tMag
  const dz = tvz / tMag
  // axis = up x desired (world), then into body frame
  const exw = up.y * dz - up.z * dy
  const eyw = up.z * dx - up.x * dz
  const ezw = up.x * dy - up.y * dx
  const eb = rotateInv(s.quat, v3(exw, eyw, ezw))

  const maxRate = def.maxTiltRateDeg * DEG
  let rtx = def.kAttP * eb.x
  let rtz = def.kAttP * eb.z
  const rMag = Math.hypot(rtx, rtz)
  if (rMag > maxRate) { rtx *= maxRate / rMag; rtz *= maxRate / rMag }
  const rty = shapeAxis(input.yaw) * def.maxYawRateDeg * DEG

  const [Ix, Iy, Iz] = def.inertia
  let Mx = Ix * def.kRateP * (rtx - s.angVel.x)
  let My = Iy * def.kRateP * 0.7 * (rty - s.angVel.y)
  let Mz = Iz * def.kRateP * (rtz - s.angVel.z)

  if (s.tumbling) { thrustCmd = 0.15 * mass * G; Mx = My = Mz = 0 }

  // --- motor mix -> per-rotor thrust command -> first-order RPM lag ---------
  const n = def.rotors.length
  const fMax = maxThrust / n
  const k = dt / def.motorTau
  let thrust = 0
  const fActual: number[] = []
  for (let i = 0; i < n; i++) {
    const fCmd = Math.max(0, Math.min(fMax,
      mixer[i][0] * thrustCmd + mixer[i][1] * Mx + mixer[i][2] * My + mixer[i][3] * Mz))
    // omega ~ sqrt(f); lag the normalised rpm, thrust = kT * omega^2
    const omegaCmd = Math.sqrt(fCmd / fMax)
    s.rotorOmega[i] += (omegaCmd - s.rotorOmega[i]) * Math.min(1, k)
    const f = fMax * s.rotorOmega[i] * s.rotorOmega[i]
    fActual.push(f)
    thrust += f
  }
  s.thrust = thrust

  // --- rigid body ------------------------------------------------------------
  // torques from actual rotor thrusts
  let tqx = 0
  let tqy = 0
  let tqz = 0
  for (let i = 0; i < n; i++) {
    const r = def.rotors[i]
    tqx += -r.pos[2] * fActual[i]
    tqy += r.spin * def.yawTorquePerThrust * fActual[i]
    tqz += r.pos[0] * fActual[i]
  }
  // aero damping
  tqx -= Ix * 1.5 * s.angVel.x
  tqy -= Iy * 0.6 * s.angVel.y
  tqz -= Iz * 1.5 * s.angVel.z

  // angular velocity (body frame), gyroscopic term omitted (negligible here)
  s.angVel.x += (tqx / Ix) * dt
  s.angVel.y += (tqy / Iy) * dt
  s.angVel.z += (tqz / Iz) * dt

  // quaternion integration q' = q + 0.5 q*(w)dt
  const { x: qx, y: qy, z: qz, w: qw } = s.quat
  const wx = s.angVel.x
  const wy = s.angVel.y
  const wz = s.angVel.z
  s.quat.x += 0.5 * (qw * wx + qy * wz - qz * wy) * dt
  s.quat.y += 0.5 * (qw * wy + qz * wx - qx * wz) * dt
  s.quat.z += 0.5 * (qw * wz + qx * wy - qy * wx) * dt
  s.quat.w += 0.5 * (-qx * wx - qy * wy - qz * wz) * dt
  const qn = Math.hypot(s.quat.x, s.quat.y, s.quat.z, s.quat.w)
  s.quat.x /= qn; s.quat.y /= qn; s.quat.z /= qn; s.quat.w /= qn

  // forces: thrust along body up, gravity, quadratic drag vs wind, geofence
  const upNow = rotate(s.quat, v3(0, 1, 0))
  let Fx = upNow.x * thrust
  let Fy = upNow.y * thrust - mass * G
  let Fz = upNow.z * thrust

  const rvx = s.vel.x - wind.x * def.windSens
  const rvy = s.vel.y - wind.y * def.windSens
  const rvz = s.vel.z - wind.z * def.windSens
  const rv = Math.hypot(rvx, rvy, rvz)
  Fx -= def.kDrag * rv * rvx
  Fy -= def.kDrag * rv * rvy
  Fz -= def.kDrag * rv * rvz

  const rad = Math.hypot(s.pos.x, s.pos.z)
  if (rad > env.fenceRadius) {
    const push = (rad - env.fenceRadius) * 0.06 * mass
    Fx -= (s.pos.x / rad) * push
    Fz -= (s.pos.z / rad) * push
  }

  // semi-implicit Euler
  s.vel.x += (Fx / mass) * dt
  s.vel.y += (Fy / mass) * dt
  s.vel.z += (Fz / mass) * dt
  s.pos.x += s.vel.x * dt
  s.pos.y += s.vel.y * dt
  s.pos.z += s.vel.z * dt

  // ground / water contact
  const gh = env.groundAt(s.pos.x, s.pos.z)
  const clearance = 0.25
  if (s.pos.y < gh + clearance) {
    if (s.vel.y < -CRASH_DESCENT) s.crashed = true
    s.pos.y = gh + clearance
    if (s.vel.y < 0) s.vel.y = 0
    const fr = Math.exp(-6 * dt)
    s.vel.x *= fr
    s.vel.z *= fr
    s.landed = true
    if (s.targetAlt < gh + clearance) s.targetAlt = gh + clearance
  } else {
    s.landed = false
  }

  // battery: drain scales with power draw ~ (T / spawn weight)^1.5
  const xLoad = thrust / (def.mass * G)
  s.battery = Math.max(0, s.battery - (def.battery.idle + def.battery.load * Math.pow(xLoad, 1.5)) * dt)
}

/** estimated seconds of battery left at the current draw */
export function batterySecondsLeft(s: DroneState, def: DroneDef): number {
  const xLoad = s.thrust / (def.mass * G)
  const rate = def.battery.idle + def.battery.load * Math.pow(xLoad, 1.5)
  return s.battery / Math.max(rate, 1e-6)
}
