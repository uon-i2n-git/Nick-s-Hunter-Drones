// Intercept mode: enemy drones on looping patrols between 40 and 80 m.
// Kinematic movers, not full physics — they only need to be believable prey.
// Two scenario sets: the two-ship harbour patrol, and a four-ship swarm.
import { v3, type V3 } from './physics.ts'

export interface Enemy {
  id: string
  label: string
  kind: 'orbit' | 'erratic'
  pos: V3
  vel: V3
  yaw: number
  captured: boolean
  /** parachute descent after capture */
  splashed: boolean
  evading: boolean
  wpIndex: number
  // orbit params
  center: { x: number; z: number }
  radius: number
  speed: number
  alt: number
  // erratic params
  wps: V3[]
}

const PATROL_WPS: V3[] = [
  { x: 135, y: 48, z: -112 },
  { x: -60, y: 70, z: -172 },
  { x: -170, y: 55, z: -60 },
  { x: -40, y: 66, z: 20 },
  { x: 120, y: 78, z: 60 },
]

function orbiter(id: string, label: string, cx: number, cz: number, r: number, speed: number, alt: number, a0 = 0): Enemy {
  return {
    id, label, kind: 'orbit',
    pos: v3(cx + Math.cos(a0) * r, alt, cz + Math.sin(a0) * r), vel: v3(),
    yaw: 0, captured: false, splashed: false, evading: false, wpIndex: 0,
    center: { x: cx, z: cz }, radius: r, speed, alt, wps: [],
  }
}
function erratic(id: string, label: string, wps: V3[], startWp = 0): Enemy {
  return {
    id, label, kind: 'erratic',
    pos: { ...wps[startWp] }, vel: v3(),
    yaw: 0, captured: false, splashed: false, evading: false, wpIndex: (startWp + 1) % wps.length,
    center: { x: 0, z: 0 }, radius: 0, speed: 0, alt: 0, wps,
  }
}

export type EnemySet = 'patrol'

export function spawnEnemies(_set: EnemySet = 'patrol'): Enemy[] {
  return [
    orbiter('e1', 'CONTACT 01 · SLOW ORBIT', 40, -30, 100, 8, 55),
    erratic('e2', 'CONTACT 02 · ERRATIC', PATROL_WPS),
  ]
}

const E_SPEED = 14
const E_FLEE_SPEED = 19
const CHUTE_SINK = 2.2

export function stepEnemy(e: Enemy, player: V3, wind: V3, t: number, dt: number): void {
  if (e.captured) {
    // parachute: sink gently, drift with the wind
    if (!e.splashed) {
      e.vel.x += (wind.x * 0.7 - e.vel.x) * dt
      e.vel.z += (wind.z * 0.7 - e.vel.z) * dt
      e.vel.y = -CHUTE_SINK
      e.pos.x += e.vel.x * dt
      e.pos.y += e.vel.y * dt
      e.pos.z += e.vel.z * dt
      if (e.pos.y <= 0.4) {
        e.pos.y = 0.4
        e.splashed = true
        e.vel = v3()
      }
    } else {
      e.pos.y = 0.4 + Math.sin(t * 1.3) * 0.15 // bob on the water
    }
    return
  }

  let target: V3
  let speed: number
  if (e.kind === 'orbit') {
    // slow, predictable circle
    const a = Math.atan2(e.pos.z - e.center.z, e.pos.x - e.center.x) + 0.12
    target = { x: e.center.x + Math.cos(a) * e.radius, y: e.alt, z: e.center.z + Math.sin(a) * e.radius }
    speed = e.speed
  } else {
    const dp = Math.hypot(player.x - e.pos.x, player.y - e.pos.y, player.z - e.pos.z)
    if (dp < 80) e.evading = true
    else if (dp > 130) e.evading = false
    if (e.evading) {
      // turn away from the player and climb, staying over the dock basin
      const ax = e.pos.x - player.x
      const az = e.pos.z - player.z
      const m = Math.hypot(ax, az) || 1
      target = {
        x: Math.max(-290, Math.min(135, e.pos.x + (ax / m) * 120)),
        y: Math.min(85, e.pos.y + 25),
        z: Math.max(-175, Math.min(120, e.pos.z + (az / m) * 120)),
      }
      speed = E_FLEE_SPEED
    } else {
      target = e.wps[e.wpIndex]
      speed = E_SPEED
      if (Math.hypot(target.x - e.pos.x, target.z - e.pos.z) < 25) e.wpIndex = (e.wpIndex + 1) % e.wps.length
    }
  }

  const dx = target.x - e.pos.x
  const dy = target.y - e.pos.y
  const dz = target.z - e.pos.z
  const m = Math.hypot(dx, dy, dz) || 1
  // smooth velocity toward target, soft geofence back to the harbour
  const k = 1.6 * dt
  e.vel.x += ((dx / m) * speed - e.vel.x) * k
  e.vel.y += ((dy / m) * speed * 0.6 - e.vel.y) * k
  e.vel.z += ((dz / m) * speed - e.vel.z) * k
  // soft box keeping patrols over the basin
  if (e.pos.x > 135) e.vel.x -= 30 * dt
  if (e.pos.x < -290) e.vel.x += 30 * dt
  if (e.pos.z > 120) e.vel.z -= 30 * dt
  if (e.pos.z < -175) e.vel.z += 30 * dt
  e.pos.x += e.vel.x * dt
  e.pos.y = Math.max(25, e.pos.y + e.vel.y * dt)
  e.pos.z += e.vel.z * dt
  e.yaw = Math.atan2(-e.vel.x, -e.vel.z)
}
