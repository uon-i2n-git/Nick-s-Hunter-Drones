// Newcastle Harbour. Shared by rendering, collision, the fence and the race
// course. One unit = one metre. Axes: +Y up, north = -Z, east = +X.
//
// Water is a plane at y = 0. Everything else stands on terrain above it:
//  - harbour channel: water strip z -240..+140 running east-west
//  - south bank: land for z > +140, y 4 at the water's edge rising to 18 by
//    z 400 (the port sector west of x 150 stays flat behind its wharf)
//  - north bank: concrete port apron z -180..-240, Stockton land flat y 3
//    behind it (z < -240, x 140..430)
//  - the coast recedes south-east of x 430 into the entrance bay, where
//    Nobbys Head stands at (620, 200) with the breakwall out to it
//  - ocean beyond x ~ +700
import type { DroneState, V3 } from './physics.ts'

export const FENCE_RADIUS = 700
export const WHARF_DECK = 3

export interface Box {
  x: number; y: number; z: number // centre
  w: number; h: number; d: number // full extents
}

// ---- terrain ---------------------------------------------------------------
/** southern coastline: z of the land edge at a given x (recedes into the bay) */
export function coastZ(x: number): number {
  return x <= 430 ? 140 : 140 + (x - 430) * 0.9
}
/** ground height of the terrain at (x, z); 0 = water */
export function terrainHeight(x: number, z: number): number {
  if (z > 140) {
    // south bank
    if (z < coastZ(x)) return 0 // the entrance bay
    if (x < 150) {
      // port back-land: flat behind the wharf, rising far behind
      if (z <= 330) return 3
      return 3 + Math.min(1, (z - 330) / 120) * 12
    }
    // city sector: 4 at the sea wall to 18 by z 400
    return 4 + Math.min(1, Math.max(0, (z - 140) / 260)) * 14
  }
  if (z < -240 && x > -320 && x < 440) return 3 // Stockton + north back-land
  return 0
}

// ---- port wharves (playable, unchanged race geometry) ----------------------
export const WHARVES: Box[] = [
  { x: 0, y: WHARF_DECK / 2, z: 150, w: 300, h: WHARF_DECK, d: 80 }, // main, south bank
  { x: -215, y: WHARF_DECK / 2, z: 10, w: 100, h: WHARF_DECK, d: 110 }, // west basin arm
  { x: -35, y: WHARF_DECK / 2, z: -210, w: 570, h: WHARF_DECK, d: 60 }, // north coal apron, z -180..-240
]
export const NORTH_APRON = WHARVES[2]

export const BEACH: Box = { x: 452, y: 0.11, z: 168, w: 46, h: 0.22, d: 14 } // Horseshoe Beach, in the bay corner

// ---- Nobbys Head + lighthouse ----------------------------------------------
export const NOBBYS = { x: 620, z: 200, height: 28, baseR: 50, topR: 34 }
export const LIGHTHOUSE = { x: 620, y: NOBBYS.height, z: 190 } // squat white tower, light ~35 m ASL

// ---- breakwalls ---------------------------------------------------------------
// Macquarie Pier out to Nobbys (~230 m at map scale — the real 900 m compressed)
export const BREAKWALL = { x0: 362, z0: 150, x1: 578, z1: 192, w: 11, top: 4 }
// Stockton breakwater, mirroring it on the north side, beacon at the tip.
export const STOCKTON_BW = { x0: 440, z0: -238, x1: 560, z1: -140, w: 9, top: 3.5 }

function wallSegments(bw: { x0: number; z0: number; x1: number; z1: number; w: number; top: number }, n: number): Box[] {
  const out: Box[] = []
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
  // south hinterland container park (flat port back-land)
  stack(-60, 235, 2, 3, 3),
  stack(-180, 240, 2, 3, 3),
  stack(60, 240, 2, 2, 2),
  // north coal apron
  stack(-260, -222, 2, 3, 3),
  stack(-160, -226, 2, 3, 4),
  stack(-40, -222, 2, 3, 3),
  stack(70, -226, 2, 2, 4),
  stack(130, -220, 2, 2, 3),
]

// ---- harbour cranes + coal loaders --------------------------------------------
export interface CraneDef { x: number; z: number; rot: number }
export const CRANES: CraneDef[] = [
  // main wharf (unchanged positions — the race threads these)
  { x: -80, z: 122, rot: 0 },
  { x: 0, z: 122, rot: 0.3 },
  { x: 80, z: 122, rot: -0.2 },
  { x: -215, z: -36, rot: Math.PI / 2 }, // west basin, the 60 m race gate rounds it
  // north apron container end (face south over the water)
  { x: -50, z: -196, rot: Math.PI },
  { x: 85, z: -196, rot: Math.PI },
  // hinterland rail yard
  { x: -260, z: 230, rot: 0.15 },
]

/** rail-mounted coal shiploaders along the north apron edge */
export interface LoaderDef { x: number; z: number }
export const LOADERS: LoaderDef[] = [
  { x: -240, z: -192 },
  { x: -130, z: -192 },
  { x: -20, z: -192 },
  { x: 150, z: -192 },
]

export const COAL_PILES: Box[] = [
  { x: -160, y: 6 + WHARF_DECK, z: -222, w: 130, h: 12, d: 18 },
  { x: 15, y: 5 + WHARF_DECK, z: -220, w: 100, h: 10, d: 15 },
]

// ---- ships ---------------------------------------------------------------------
export interface ShipDef extends Box { rot: number; kind: 'bulk' | 'tug' }
export const SHIPS: ShipDef[] = [
  // moored along the main wharf; its gap with the wharf edge is the race corridor
  { x: -30, y: 3, z: 88, w: 110, h: 6, d: 18, rot: 0, kind: 'bulk' },
  // berthed against the north coal apron (afloat, alongside the dock)
  { x: -170, y: 3, z: -166, w: 120, h: 6, d: 18, rot: 0, kind: 'bulk' },
  { x: 35, y: 3, z: -166, w: 95, h: 6, d: 16, rot: 0, kind: 'bulk' },
  // riding at anchor mid-channel, waiting for a berth
  { x: 250, y: 3, z: -10, w: 105, h: 6, d: 17, rot: 0.35, kind: 'bulk' },
  { x: 140, y: 2, z: 70, w: 30, h: 4, d: 9, rot: 0.2, kind: 'tug' },
]

// channel markers: port (red) on the south side, starboard (green) north
export const BUOYS: Array<{ x: number; z: number; green: boolean }> = [
  { x: 120, z: 60, green: false }, { x: 120, z: -80, green: true },
  { x: 240, z: 70, green: false }, { x: 240, z: -90, green: true },
  { x: 380, z: 80, green: false }, { x: 380, z: -100, green: true },
  { x: 520, z: 110, green: false }, { x: 520, z: -110, green: true },
]

export const SPAWN: V3 = { x: -110, y: WHARF_DECK + 0.35, z: 114 }
export const SPAWN_YAW = -Math.PI / 2

// ---- geofence -------------------------------------------------------------------
// Soft boundary: a 700 m circle for the ocean east, bank lines along both
// shores, and a west line where the river scenery begins. The channel, the
// north apron, the port back-land, the breakwalls, the entrance and Nobbys
// are flyable; the city and Stockton's streets are not.
function southLimit(x: number): number {
  if (x < 60) return 330
  if (x < 150) return 330 - ((x - 60) / 90) * 180 // ramp 330 -> 150
  if (x <= 430) return 150
  return 150 + (x - 430) * 0.9 // follows the receding bay coast
}
function northLimit(x: number): number {
  if (x < 140) return -300
  return -245
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
  if (x < -470) {
    const e = (-470 - x) * (1 + (-470 - x) * 0.5)
    ox += e
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
  // port back-land (flat, reachable) + promenade edge strip (hoverable)
  { x: -85, y: 1.5, z: 235, w: 470, h: 3, d: 190 }, // x -320..150, z 140..330
  { x: 290, y: 2.1, z: 147, w: 280, h: 4.2, d: 18 }, // sea wall + promenade lip
  BEACH,
  ...STACKS,
  ...SHIPS.map((s) => ({ ...s })), // rotation ignored, close enough
  ...CRANES.flatMap((c) => [
    { x: c.x - 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
    { x: c.x + 9, y: 22.5, z: c.z, w: 3, h: 45, d: 3 },
  ]),
  ...LOADERS.flatMap((l) => [
    { x: l.x - 8, y: 14 + WHARF_DECK, z: l.z, w: 3, h: 28, d: 3 },
    { x: l.x + 8, y: 14 + WHARF_DECK, z: l.z, w: 3, h: 28, d: 3 },
  ]),
  ...COAL_PILES,
  ...wallSegments(BREAKWALL, 8),
  ...wallSegments(STOCKTON_BW, 5),
  // building rows backing the fence lines, so a hard lean bonks a wall
  // instead of ghosting through facades
  { x: 285, y: 14, z: 174, w: 270, h: 24, d: 34 }, // city foreshore row
  { x: 290, y: 5, z: -262, w: 260, h: 8, d: 40 }, // stockton first street
  // ocean baths rock shelf south of Nobbys (landable)
  { x: 655, y: 1, z: 264, w: 60, h: 2, d: 40 },
  // Nobbys Head + the buildings on top
  { x: NOBBYS.x, y: NOBBYS.height / 2, z: NOBBYS.z, w: 84, h: NOBBYS.height, d: 78 },
  { x: LIGHTHOUSE.x, y: NOBBYS.height + 5, z: LIGHTHOUSE.z, w: 5, h: 10, d: 5 },
  { x: 609, y: NOBBYS.height + 3, z: 206, w: 13, h: 6, d: 9 },
]

/** height of whatever is under (x, z) — used for AGL and top landings.
 *  Surfaces only count as ground when approached from near/above, so flying
 *  at a wall or hillside does not step the drone up. */
export function groundAt(x: number, z: number, y = 1e9): number {
  let g = 0 // water
  const t = terrainHeight(x, z)
  if (t > 0 && y > t - 1.2) g = t
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
  ...LOADERS.map((l, i) => ({ id: `loader${i}`, label: 'COAL SHIPLOADER', pos: { x: l.x, y: 25, z: l.z } })),
  ...SHIPS.map((s, i) => ({
    id: `ship${i}`,
    label: s.kind === 'bulk' ? 'BULK CARRIER' : 'HARBOUR TUG',
    pos: { x: s.x, y: s.y + s.h, z: s.z },
  })),
  { id: 'lighthouse', label: 'NOBBYS LIGHTHOUSE · SIGNAL STN', pos: { x: LIGHTHOUSE.x, y: NOBBYS.height + 8, z: LIGHTHOUSE.z } },
  { id: 'fort', label: 'FORT SCRATCHLEY', pos: { x: 400, y: 20, z: 190 } },
  { id: 'qwt', label: 'QUEENS WHARF TOWER', pos: { x: 230, y: 22, z: 150 } },
  { id: 'cathedral', label: 'CHRIST CHURCH CATHEDRAL', pos: { x: 280, y: 70, z: 360 } },
  { id: 'ferry', label: 'STOCKTON FERRY WHARF', pos: { x: 185, y: 6, z: -230 } },
  { id: 'coal', label: 'COAL TERMINAL', pos: { x: -100, y: 18, z: -215 } },
]
