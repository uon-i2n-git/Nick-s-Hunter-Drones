// A working city dockyard (Newcastle in character, not in survey). Shared by
// rendering, collision, the fence and the race course. One unit = one metre.
// Axes: +Y up, north = -Z, east = +X.
//
// Land-first geography: the world is land everywhere except
//  - the DOCK BASIN the player flies (x -310..150, z -130..142)
//  - a CHANNEL gorge east through the city (x 150..640, z -28..66)
//  - the OCEAN beyond the harbour mouth (x > 640)
// so every building stands on terrain that rises away from the water, and the
// city wraps the dockyard on three sides.
import type { DroneState, V3 } from './physics.ts'

export const FENCE_RADIUS = 720
export const WHARF_DECK = 3

export interface Box {
  x: number; y: number; z: number // centre
  w: number; h: number; d: number // full extents
}

// ---- water bodies -----------------------------------------------------------
export const BASIN = { x0: -310, x1: 150, z0: -130, z1: 142 }
export const CHANNEL = { x0: 150, x1: 640, z0: -28, z1: 66 }
export const OCEAN_X = 640

function inWater(x: number, z: number): boolean {
  if (x > OCEAN_X) return true
  if (x > BASIN.x0 && x < BASIN.x1 && z > BASIN.z0 && z < BASIN.z1) return true
  if (x >= CHANNEL.x0 && x <= OCEAN_X && z > CHANNEL.z0 && z < CHANNEL.z1) return true
  if (Math.hypot(x, z) > 760) return true // far surround
  return false
}

/** distance from (x,z) to the nearest water edge, approximate */
function waterDist(x: number, z: number): number {
  const rd = (r: { x0: number; x1: number; z0: number; z1: number }) => {
    const dx = Math.max(r.x0 - x, 0, x - r.x1)
    const dz = Math.max(r.z0 - z, 0, z - r.z1)
    return Math.hypot(dx, dz)
  }
  return Math.min(rd(BASIN), rd(CHANNEL), Math.max(OCEAN_X - x, 0))
}

/** ground height of the terrain at (x, z); 0 = water */
export function terrainHeight(x: number, z: number): number {
  if (inWater(x, z)) return 0
  // the port flats: back-land behind the wharves stays workably flat
  const portFlat =
    (z >= 142 && z <= 330 && x >= -320 && x <= 150) || // south hinterland
    (z <= -130 && z >= -185 && x >= -320 && x <= 150) // north apron strip
  if (portFlat) return 3
  // everywhere else rises away from the water — the city amphitheatre
  return 3.5 + Math.min(15, waterDist(x, z) * 0.07)
}

// ---- port wharves (playable, unchanged race geometry) ----------------------
export const WHARVES: Box[] = [
  { x: 0, y: WHARF_DECK / 2, z: 150, w: 300, h: WHARF_DECK, d: 80 }, // main, south side of the basin
  { x: -215, y: WHARF_DECK / 2, z: 10, w: 100, h: WHARF_DECK, d: 110 }, // west basin arm
  { x: -80, y: WHARF_DECK / 2, z: -155, w: 460, h: WHARF_DECK, d: 54 }, // north coal apron, z -128..-182
]
export const NORTH_APRON = WHARVES[2]

// ---- harbour mouth: headland + squat lighthouse, moles either side -----------
export const NOBBYS = { x: 585, z: 108, height: 26, baseR: 44, topR: 30 }
export const LIGHTHOUSE = { x: 585, y: NOBBYS.height, z: 98 }
// south + north moles extending the channel into the sea
export const BREAKWALL = { x0: 560, z0: 84, x1: 668, z1: 52, w: 11, top: 4 }
export const STOCKTON_BW = { x0: 560, z0: -46, x1: 668, z1: -14, w: 9, top: 3.5 }

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
  // south hinterland container park
  stack(-60, 235, 2, 3, 3),
  stack(-180, 240, 2, 3, 3),
  stack(60, 240, 2, 2, 2),
  // north coal apron
  stack(60, -164, 2, 2, 3),
  stack(120, -166, 2, 2, 4),
  stack(-300, -166, 2, 1, 3),
]

// ---- harbour cranes + coal loaders --------------------------------------------
export interface CraneDef { x: number; z: number; rot: number }
export const CRANES: CraneDef[] = [
  // main wharf (unchanged positions — the race threads these)
  { x: -80, z: 122, rot: 0 },
  { x: 0, z: 122, rot: 0.3 },
  { x: 80, z: 122, rot: -0.2 },
  { x: -215, z: -36, rot: Math.PI / 2 }, // west basin arm, the 60 m race gate rounds it
  // north apron container end (face south over the basin)
  { x: -150, z: -168, rot: Math.PI },
  { x: 0, z: -168, rot: Math.PI },
  // hinterland rail yard
  { x: -260, z: 230, rot: 0.15 },
]

/** rail-mounted coal shiploaders along the north apron edge */
export interface LoaderDef { x: number; z: number }
export const LOADERS: LoaderDef[] = [
  { x: -270, z: -145 },
  { x: -180, z: -145 },
  { x: -90, z: -145 },
  { x: 25, z: -145 },
]

export const COAL_PILES: Box[] = [
  { x: -240, y: 6 + WHARF_DECK, z: -168, w: 110, h: 12, d: 16 },
  { x: -60, y: 5 + WHARF_DECK, z: -168, w: 90, h: 10, d: 14 },
]

// ---- ships ---------------------------------------------------------------------
export interface ShipDef extends Box { rot: number; kind: 'bulk' | 'tug' }
export const SHIPS: ShipDef[] = [
  // moored along the main wharf; its gap with the wharf edge is the race corridor
  { x: -30, y: 3, z: 88, w: 110, h: 6, d: 18, rot: 0, kind: 'bulk' },
  // berthed against the north coal apron
  { x: -200, y: 3, z: -116, w: 120, h: 6, d: 18, rot: 0, kind: 'bulk' },
  { x: -40, y: 3, z: -116, w: 95, h: 6, d: 16, rot: 0, kind: 'bulk' },
  // inbound up the channel
  { x: 330, y: 3, z: 20, w: 100, h: 6, d: 17, rot: 0.06, kind: 'bulk' },
  { x: 110, y: 2, z: 60, w: 30, h: 4, d: 9, rot: 0.2, kind: 'tug' },
]

// channel markers: red to port, green to starboard heading in
export const BUOYS: Array<{ x: number; z: number; green: boolean }> = [
  { x: 120, z: 52, green: false }, { x: 120, z: -70, green: true },
  { x: 210, z: 48, green: false }, { x: 210, z: -12, green: true },
  { x: 340, z: 50, green: false }, { x: 340, z: -14, green: true },
  { x: 470, z: 52, green: false }, { x: 470, z: -16, green: true },
]

export const SPAWN: V3 = { x: -110, y: WHARF_DECK + 0.35, z: 114 }
export const SPAWN_YAW = -Math.PI / 2

// ---- geofence -------------------------------------------------------------------
// The flyable world is the basin, the north apron, the port back-land, the
// channel gorge, the mouth and a bite of ocean. City streets are not.
function southLimit(x: number): number {
  if (x < 140) return 330 // port back-land
  if (x < 165) return 330 - ((x - 140) / 25) * 258 // ramp down to the gorge
  return 72 // channel south bank
}
function northLimit(x: number): number {
  if (x < 140) return -185 // north apron
  if (x < 165) return -185 + ((x - 140) / 25) * 147
  return -38 // channel north bank
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
  if (x < -330) {
    const e = (-330 - x) * (1 + (-330 - x) * 0.5)
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
  // port back-land (flat, reachable)
  { x: -85, y: 1.5, z: 235, w: 470, h: 3, d: 190 },
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
  ...wallSegments(BREAKWALL, 5),
  ...wallSegments(STOCKTON_BW, 5),
  // facade rows backing the fence lines so a hard lean bonks a wall
  { x: 350, y: 14, z: 92, w: 400, h: 24, d: 26 }, // gorge south frontages
  { x: 350, y: 14, z: -58, w: 400, h: 24, d: 26 }, // gorge north frontages
  { x: 163, y: 14, z: 110, w: 22, h: 24, d: 60 }, // basin east corner, south of channel
  { x: 163, y: 14, z: -85, w: 22, h: 24, d: 90 }, // basin east corner, north of channel
  { x: -60, y: 5, z: 345, w: 460, h: 8, d: 26 }, // back of the port flats
  { x: -80, y: 5, z: -198, w: 420, h: 8, d: 24 }, // behind the north apron
  // Nobbys-style headland + the buildings on top
  { x: NOBBYS.x, y: NOBBYS.height / 2, z: NOBBYS.z, w: 80, h: NOBBYS.height, d: 74 },
  { x: LIGHTHOUSE.x, y: NOBBYS.height + 5, z: LIGHTHOUSE.z, w: 5, h: 10, d: 5 },
  { x: 574, y: NOBBYS.height + 3, z: 114, w: 13, h: 6, d: 9 },
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
  { id: 'lighthouse', label: 'HARBOUR LIGHT · SIGNAL STN', pos: { x: LIGHTHOUSE.x, y: NOBBYS.height + 8, z: LIGHTHOUSE.z } },
  { id: 'fort', label: 'OLD BATTERY', pos: { x: 500, y: 22, z: 100 } },
  { id: 'qwt', label: 'HARBOURSIDE TOWER', pos: { x: 205, y: 24, z: 84 } },
  { id: 'cathedral', label: 'CATHEDRAL', pos: { x: 280, y: 70, z: 360 } },
  { id: 'ferry', label: 'CROSS-DOCK FERRY', pos: { x: 90, y: 6, z: -120 } },
  { id: 'coal', label: 'COAL TERMINAL', pos: { x: -150, y: 18, z: -160 } },
]
