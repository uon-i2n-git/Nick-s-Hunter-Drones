// Harbour layout, shared by rendering, collision and the race course.
// One unit = one metre. Water is y = 0. Playable area ~1200 x 1200 m.
import type { DroneState, V3 } from './physics.ts'

export const FENCE_RADIUS = 580
export const WHARF_DECK = 3

export interface Box {
  x: number; y: number; z: number // centre
  w: number; h: number; d: number // full extents
}

// Wharves (decks 3 m above water)
export const WHARVES: Box[] = [
  { x: 0, y: WHARF_DECK / 2, z: 150, w: 300, h: WHARF_DECK, d: 80 }, // main, south side
  { x: -215, y: WHARF_DECK / 2, z: 10, w: 100, h: WHARF_DECK, d: 110 }, // west
  { x: 215, y: WHARF_DECK / 2, z: -10, w: 100, h: WHARF_DECK, d: 100 }, // east
]

// Container stacks: cluster boxes used for collision; individual containers
// are instanced inside these footprints by the renderer. 12 x 2.4 x 2.6 m.
export interface StackDef extends Box { rows: number; cols: number; layers: number }
function stack(x: number, z: number, rows: number, cols: number, layers: number, rotated = false): StackDef {
  const len = 12.2, wid = 2.6
  const w = rotated ? rows * wid : cols * len
  const d = rotated ? cols * len : rows * wid
  return { x, y: WHARF_DECK + (layers * 2.6) / 2, z, w, h: layers * 2.6, d, rows, cols, layers }
}
export const STACKS: StackDef[] = [
  // main wharf, behind the cranes (~64 containers total)
  stack(-95, 165, 2, 2, 3),
  stack(-55, 168, 2, 1, 2),
  stack(60, 165, 2, 2, 3),
  stack(100, 168, 2, 1, 2),
  // west wharf: two stacks with a flyable gap between (race descends through it)
  stack(-238, 20, 2, 2, 3, true),
  stack(-186, 20, 2, 2, 3, true),
  // east wharf
  stack(215, -25, 2, 2, 2),
]

// Cranes: 45 m tall portal cranes. Position + jib heading (rad).
export interface CraneDef { x: number; z: number; rot: number }
export const CRANES: CraneDef[] = [
  { x: -80, z: 122, rot: 0 },
  { x: 0, z: 122, rot: 0.3 },
  { x: 80, z: 122, rot: -0.2 },
  { x: -215, z: -36, rot: Math.PI / 2 },
]

// Moored ships: hull AABBs (deck height ~6 m above water)
export interface ShipDef extends Box { rot: number; kind: 'bulk' | 'tug' }
export const SHIPS: ShipDef[] = [
  // moored along the main wharf; the gap between its side and the wharf edge
  // (z 97..110) is the race's return corridor
  { x: -30, y: 3, z: 88, w: 110, h: 6, d: 18, rot: 0, kind: 'bulk' },
  { x: -160, y: 3, z: -120, w: 90, h: 6, d: 16, rot: 0.9, kind: 'bulk' },
  { x: 150, y: 2, z: 62, w: 30, h: 4, d: 9, rot: 0.2, kind: 'tug' },
]

// launch pad on the main wharf edge, nose pointing east down the start
// straight — Space then W flies a first-timer through the start gate
export const SPAWN: V3 = { x: -110, y: WHARF_DECK + 0.35, z: 114 }
export const SPAWN_YAW = -Math.PI / 2

// ---- collision -------------------------------------------------------------
const SOLIDS: Box[] = [
  ...WHARVES,
  ...STACKS,
  ...SHIPS.map((s) => ({ ...s })), // rotation ignored for collision, close enough
  ...CRANES.flatMap((c) => [
    { x: c.x - 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
    { x: c.x + 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
  ]),
]

/** height of whatever is under (x, z) — used for AGL and top landings.
 *  Boxes only count as ground when approached from near/above their top,
 *  so flying at a wall does not step the drone up. */
export function groundAt(x: number, z: number, y = 1e9): number {
  let g = 0 // water
  for (const b of SOLIDS) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) {
      const top = b.y + b.h / 2
      if (top > g && y > top - 1.2) g = top
    }
  }
  return g
}

/** push the drone out of box sides; returns true on a hard lateral hit */
export function collide(s: DroneState): boolean {
  let hard = false
  for (const b of SOLIDS) {
    const dx = s.pos.x - b.x
    const dz = s.pos.z - b.z
    const top = b.y + b.h / 2
    const rx = b.w / 2 + 0.4
    const rz = b.d / 2 + 0.4
    if (Math.abs(dx) < rx && Math.abs(dz) < rz && s.pos.y < top - 0.3) {
      const px = rx - Math.abs(dx)
      const pz = rz - Math.abs(dz)
      const speed = Math.hypot(s.vel.x, s.vel.z)
      if (px < pz) {
        s.pos.x = b.x + Math.sign(dx || 1) * rx
        s.vel.x = 0
      } else {
        s.pos.z = b.z + Math.sign(dz || 1) * rz
        s.vel.z = 0
      }
      if (speed > 8) hard = true
    }
  }
  return hard
}

// ---- taggables for the Kestrel's sensor sweep ------------------------------
export interface Taggable { id: string; label: string; pos: V3 }
export const STATIC_TAGGABLES: Taggable[] = [
  ...CRANES.map((c, i) => ({ id: `crane${i}`, label: 'PORTAL CRANE · 45 M', pos: { x: c.x, y: 30, z: c.z } })),
  ...SHIPS.map((s, i) => ({
    id: `ship${i}`,
    label: s.kind === 'bulk' ? 'BULK CARRIER · MOORED' : 'HARBOUR TUG',
    pos: { x: s.x, y: s.y + s.h, z: s.z },
  })),
]
