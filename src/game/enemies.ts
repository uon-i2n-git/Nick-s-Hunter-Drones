// Intercept mode: two enemy drones on looping patrols between 40 and 80 m.
// Kinematic movers, not full physics — they only need to be believable prey.
import { v3, type V3 } from './physics.ts'

export interface Enemy {
  id: string
  label: string
  pos: V3
  vel: V3
  yaw: number
  captured: boolean
  /** parachute descent after capture */
  splashed: boolean
  evading: boolean
  wpIndex: number
}

const E2_WAYPOINTS: V3[] = [
  { x: 135, y: 48, z: -112 },
  { x: -60, y: 72, z: -190 },
  { x: -170, y: 55, z: -60 },
  { x: -40, y: 66, z: 20 },
  { x: 120, y: 78, z: 60 },
]

export function spawnEnemies(): Enemy[] {
  return [
    {
      id: 'e1', label: 'CONTACT 01 · SLOW ORBIT', pos: v3(190, 55, -40), vel: v3(),
      yaw: 0, captured: false, splashed: false, evading: false, wpIndex: 0,
    },
    {
      id: 'e2', label: 'CONTACT 02 · ERRATIC', pos: { ...E2_WAYPOINTS[0] }, vel: v3(),
      yaw: 0, captured: false, splashed: false, evading: false, wpIndex: 1,
    },
  ]
}

const E1_CENTER = { x: 60, z: -40 }
const E1_RADIUS = 130
const E1_SPEED = 8
const E2_SPEED = 14
const E2_FLEE_SPEED = 19
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
  if (e.id === 'e1') {
    // slow, predictable circle
    const a = Math.atan2(e.pos.z - E1_CENTER.z, e.pos.x - E1_CENTER.x) + ((E1_SPEED / E1_RADIUS) * dt * 40) / 40 + 0.12
    target = { x: E1_CENTER.x + Math.cos(a) * E1_RADIUS, y: 55, z: E1_CENTER.z + Math.sin(a) * E1_RADIUS }
    speed = E1_SPEED
  } else {
    const dp = Math.hypot(player.x - e.pos.x, player.y - e.pos.y, player.z - e.pos.z)
    if (dp < 80) e.evading = true
    else if (dp > 130) e.evading = false
    if (e.evading) {
      // turn away from the player and climb
      const ax = e.pos.x - player.x
      const az = e.pos.z - player.z
      const m = Math.hypot(ax, az) || 1
      target = { x: e.pos.x + (ax / m) * 120, y: Math.min(85, e.pos.y + 25), z: e.pos.z + (az / m) * 120 }
      speed = E2_FLEE_SPEED
    } else {
      target = E2_WAYPOINTS[e.wpIndex]
      speed = E2_SPEED
      if (Math.hypot(target.x - e.pos.x, target.z - e.pos.z) < 25) e.wpIndex = (e.wpIndex + 1) % E2_WAYPOINTS.length
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
  const r = Math.hypot(e.pos.x, e.pos.z)
  if (r > 480) {
    e.vel.x -= (e.pos.x / r) * 30 * dt
    e.vel.z -= (e.pos.z / r) * 30 * dt
  }
  e.pos.x += e.vel.x * dt
  e.pos.y = Math.max(25, e.pos.y + e.vel.y * dt)
  e.pos.z += e.vel.z * dt
  e.yaw = Math.atan2(-e.vel.x, -e.vel.z)
}
