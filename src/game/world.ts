// Newcastle Harbour, compressed to fit the playable area. Shared by
// rendering, collision, the fence and the race course. One unit = one metre.
// Axes: +Y up, north = -Z, east = +X. The Pacific is EAST, the channel runs
// inland WEST. Water is y = 0.
//
// The playable area is the cargo harbour and its water. Nobbys Head, the
// breakwalls and the harbour entrance are reachable; the city foreshore and
// Stockton's streets are near-distance scenery behind a soft fence line.
import type { DroneState, V3 } from './physics.ts'

export const FENCE_RADIUS = 460
export const WHARF_DECK = 3

export interface Box {
  x: number; y: number; z: number // centre
  w: number; h: number; d: number // full extents
}

// ---- port wharves (playable, unchanged race geometry) ----------------------
export const WHARVES: Box[] = [
  { x: 0, y: WHARF_DECK / 2, z: 150, w: 300, h: WHARF_DECK, d: 80 }, // main, south bank
  { x: -215, y: WHARF_DECK / 2, z: 10, w: 100, h: WHARF_DECK, d: 110 }, // west basin arm
]

// ---- land plates ------------------------------------------------------------
export const NORTH_BANK: Box = { x: -85, y: 1.25, z: -164, w: 470, h: 2.5, d: 192 } // z -260..-68, x -320..150
export const SOUTH_HINTERLAND: Box = { x: -90, y: 1.25, z: 260, w: 460, h: 2.5, d: 140 } // behind main wharf
export const CITY_LAND: Box = { x: 265, y: 1.25, z: 284, w: 270, h: 2.5, d: 232 } // x 130..400, z 168..400 — abuts the wharf's east corner
export const STOCKTON_LAND: Box = { x: 275, y: 1, z: -217, w: 250, h: 2, d: 165 } // x 150..400, z -135..-300, right across the channel
export const BEACH: Box = { x: 308, y: 0.11, z: 163, w: 44, h: 0.22, d: 12 } // Horseshoe Beach, low sand spit against the shore

// ---- Nobbys Head + lighthouse ----------------------------------------------
export const NOBBYS = { x: 390, z: 65, height: 27, baseR: 46, topR: 32 }
export const LIGHTHOUSE = { x: 390, y: NOBBYS.height, z: 56 } // squat 9 m tower on top

// ---- breakwalls ---------------------------------------------------------------
// Macquarie Pier: mainland (Fort Scratchley side) out to Nobbys. Flyable.
export const BREAKWALL = { x0: 330, z0: 170, x1: 366, z1: 86, w: 11, top: 4 }
// Stockton breakwater, mirroring it on the north side, beacon at the tip.
export const STOCKTON_BW = { x0: 260, z0: -100, x1: 310, z1: -18, w: 9, top: 3.5 }

function wallSegments(bw: { x0: number; z0: number; x1: number; z1: number; w: number; top: number }, n: number): Box[] {
  const out: Box[] = []
  const len = Math.hypot(bw.x1 - bw.x0, bw.z1 - bw.z0)
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    const xa = bw.x0 + (bw.x1 - bw.x0) * t0
    const xb = bw.x0 + (bw.x1 - bw.x0) * t1
    const za = bw.z0 + (bw.z1 - bw.z0) * t0
    const zb = bw.z0 + (bw.z1 - bw.z0) * t1
    out.push({
      x: (xa + xb) / 2, y: bw.top / 2, z: (za + zb) / 2,
      w: Math.abs(xb - xa) + bw.w * 0.8, h: bw.top, d: Math.abs(zb - za) + bw.w * 0.8,
    })
  }
  void len
  return out
}

// ---- container stacks --------------------------------------------------------
export interface StackDef extends Box { rows: number; cols: number; layers: number }
function stack(x: number, z: number, rows: number, cols: number, layers: number, rotated = false): StackDef {
  const len = 12.2, wid = 2.6
  const w = rotated ? rows * wid : cols * len
  const d = rotated ? cols * len : rows * wid
  return { x, y: WHARF_DECK + (layers * 2.6) / 2, z, w, h: layers * 2.6, d, rows, cols, layers }
}
export const STACKS: StackDef[] = [
  // main wharf (race geometry — unchanged)
  stack(-95, 165, 2, 2, 3),
  stack(-55, 168, 2, 1, 2),
  stack(60, 165, 2, 2, 3),
  stack(100, 168, 2, 1, 2),
  // west basin arm: the race's stack-gap pair (unchanged)
  stack(-238, 20, 2, 2, 3, true),
  stack(-186, 20, 2, 2, 3, true),
  // south hinterland container park
  stack(-60, 235, 2, 3, 3),
  stack(-180, 240, 2, 3, 3),
  stack(60, 240, 2, 2, 2),
  // north bank terminal
  stack(-260, -200, 2, 3, 3),
  stack(-160, -206, 2, 3, 4),
  stack(-40, -200, 2, 3, 3),
  stack(70, -206, 2, 2, 4),
  stack(125, -198, 2, 2, 3),
]

// ---- harbour cranes + coal loaders --------------------------------------------
export interface CraneDef { x: number; z: number; rot: number }
export const CRANES: CraneDef[] = [
  // main wharf (unchanged positions — the race threads these)
  { x: -80, z: 122, rot: 0 },
  { x: 0, z: 122, rot: 0.3 },
  { x: 80, z: 122, rot: -0.2 },
  { x: -215, z: -36, rot: Math.PI / 2 }, // west basin, the 60 m race gate rounds it
  // north bank container terminal (face south over the water)
  { x: -50, z: -150, rot: Math.PI },
  { x: 85, z: -150, rot: Math.PI },
  // hinterland rail yard
  { x: -260, z: 230, rot: 0.15 },
]

/** rail-mounted coal shiploaders along the north bank berths */
export interface LoaderDef { x: number; z: number }
export const LOADERS: LoaderDef[] = [
  { x: -240, z: -96 },
  { x: -130, z: -96 },
  { x: -20, z: -96 },
  { x: 95, z: -96 },
]

export const COAL_PILES: Box[] = [
  { x: -160, y: 6, z: -142, w: 130, h: 12, d: 20 },
  { x: 15, y: 5, z: -138, w: 100, h: 10, d: 17 },
]

// ---- ships ---------------------------------------------------------------------
export interface ShipDef extends Box { rot: number; kind: 'bulk' | 'tug' }
export const SHIPS: ShipDef[] = [
  // moored along the main wharf; its gap with the wharf edge is the race corridor
  { x: -30, y: 3, z: 88, w: 110, h: 6, d: 18, rot: 0, kind: 'bulk' },
  // berthed under the north-bank coal loaders
  { x: -170, y: 3, z: -56, w: 120, h: 6, d: 18, rot: 0, kind: 'bulk' },
  { x: 35, y: 3, z: -56, w: 95, h: 6, d: 16, rot: 0, kind: 'bulk' },
  // riding at anchor in the channel, waiting for a berth
  { x: 240, y: 3, z: 18, w: 105, h: 6, d: 17, rot: 0.35, kind: 'bulk' },
  { x: 140, y: 2, z: 58, w: 30, h: 4, d: 9, rot: 0.2, kind: 'tug' },
]

// channel markers: port (red) on the south side, starboard (green) north
export const BUOYS: Array<{ x: number; z: number; green: boolean }> = [
  { x: 110, z: 42, green: false }, { x: 110, z: -24, green: true },
  { x: 170, z: 46, green: false }, { x: 170, z: -27, green: true },
  { x: 230, z: 50, green: false }, { x: 230, z: -30, green: true },
  { x: 288, z: 54, green: false }, { x: 288, z: -26, green: true },
]

export const SPAWN: V3 = { x: -110, y: WHARF_DECK + 0.35, z: 114 }
export const SPAWN_YAW = -Math.PI / 2

// ---- geofence -------------------------------------------------------------------
// Soft boundary: the 460 m circle, plus two bank lines so the player can fly
// the harbour water and the entrance but never over the city foreshore or
// Stockton's streets. Returns inward unit direction + metres of violation.
function southLimit(x: number): number {
  if (x < 60) return 330
  if (x < 140) return 330 - ((x - 60) / 80) * 162 // ramp 330 -> 168
  return 168
}
function northLimit(x: number): number {
  if (x < 100) return -260
  if (x < 150) return -260 + ((x - 100) / 50) * 130 // ramp -260 -> -130
  return -130
}
export function fenceExcess(x: number, z: number): { ox: number; oz: number; m: number } | null {
  let ox = 0
  let oz = 0
  let m = 0
  const r = Math.hypot(x, z)
  if (r > FENCE_RADIUS) {
    const e = r - FENCE_RADIUS
    ox -= (x / r) * e
    oz -= (z / r) * e
    m += e
  }
  // bank lines stiffen with depth so they hold against a boosting drone
  const sl = southLimit(x)
  if (z > sl) {
    const e = (z - sl) * (1 + (z - sl) * 0.5)
    oz -= e
    m += e
  }
  const nl = northLimit(x)
  if (z < nl) {
    const e = (nl - z) * (1 + (nl - z) * 0.5)
    oz += e
    m += e
  }
  if (m === 0) return null
  const n = Math.hypot(ox, oz) || 1
  return { ox: ox / n, oz: oz / n, m }
}

// ---- collision --------------------------------------------------------------------
const SOLIDS: Box[] = [
  ...WHARVES,
  NORTH_BANK,
  SOUTH_HINTERLAND,
  CITY_LAND,
  STOCKTON_LAND,
  BEACH,
  ...STACKS,
  ...SHIPS.map((s) => ({ ...s })), // rotation ignored, close enough
  ...CRANES.flatMap((c) => [
    { x: c.x - 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
    { x: c.x + 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
  ]),
  ...LOADERS.flatMap((l) => [
    { x: l.x - 8, y: 14, z: l.z, w: 3, h: 28, d: 3 },
    { x: l.x + 8, y: 14, z: l.z, w: 3, h: 28, d: 3 },
  ]),
  ...COAL_PILES,
  ...wallSegments(BREAKWALL, 7),
  ...wallSegments(STOCKTON_BW, 4),
  // building rows backing the fence lines, so a hard lean bonks a wall
  // instead of ghosting through facades (fort gap x 288..378 left open)
  { x: 230, y: 14, z: 204, w: 200, h: 24, d: 30 },
  { x: 380, y: 14, z: 208, w: 40, h: 24, d: 30 },
  { x: 275, y: 4, z: -166, w: 220, h: 8, d: 32 },
  // ocean baths rock shelf (scenery, but landable if reached)
  { x: 420, y: 1, z: 170, w: 60, h: 2, d: 38 },
  // Nobbys Head + the buildings on top
  { x: NOBBYS.x, y: NOBBYS.height / 2, z: NOBBYS.z, w: 78, h: NOBBYS.height, d: 72 },
  { x: LIGHTHOUSE.x, y: NOBBYS.height + 5, z: LIGHTHOUSE.z, w: 5, h: 10, d: 5 },
  { x: 379, y: NOBBYS.height + 3, z: 71, w: 13, h: 6, d: 9 },
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

// ---- taggables for the Kestrel's sensor sweep -----------------------------------
export interface Taggable { id: string; label: string; pos: V3 }
export const STATIC_TAGGABLES: Taggable[] = [
  ...CRANES.map((c, i) => ({ id: `crane${i}`, label: 'PORTAL CRANE · 45 M', pos: { x: c.x, y: 30, z: c.z } })),
  ...LOADERS.map((l, i) => ({ id: `loader${i}`, label: 'COAL SHIPLOADER', pos: { x: l.x, y: 22, z: l.z } })),
  ...SHIPS.map((s, i) => ({
    id: `ship${i}`,
    label: s.kind === 'bulk' ? 'BULK CARRIER' : 'HARBOUR TUG',
    pos: { x: s.x, y: s.y + s.h, z: s.z },
  })),
  { id: 'lighthouse', label: 'NOBBYS LIGHTHOUSE · SIGNAL STN', pos: { x: LIGHTHOUSE.x, y: NOBBYS.height + 8, z: LIGHTHOUSE.z } },
  { id: 'fort', label: 'FORT SCRATCHLEY', pos: { x: 322, y: 18, z: 200 } },
  { id: 'qwt', label: 'QUEENS WHARF TOWER', pos: { x: 235, y: 20, z: 178 } },
  { id: 'cathedral', label: 'CHRIST CHURCH CATHEDRAL', pos: { x: 250, y: 85, z: 342 } },
  { id: 'ferry', label: 'STOCKTON FERRY WHARF', pos: { x: 185, y: 6, z: -128 } },
  { id: 'coal', label: 'COAL TERMINAL', pos: { x: -100, y: 15, z: -140 } },
]
