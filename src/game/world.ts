// Newcastle-flavoured working dockyard: the Hunter basin coal port wrapped
// by the city, with the channel out past Nobbys to the sea. Shared by
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
  if (Math.hypot(x, z) > 900) return true // far surround
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
  const portFlat = z <= -130 && z >= -300 && x >= -320 && x <= 150 // north port flats
  if (portFlat) return 3
  // everywhere else rises away from the water — the city amphitheatre
  return 3.5 + Math.min(15, waterDist(x, z) * 0.07)
}

// ---- port wharves (playable, unchanged race geometry) ----------------------
export const WHARVES: Box[] = [
  { x: 0, y: WHARF_DECK / 2, z: 135, w: 300, h: WHARF_DECK, d: 18 }, // Honeysuckle boardwalk on the south shore
  { x: -45, y: WHARF_DECK / 2, z: -155, w: 390, h: WHARF_DECK, d: 54 }, // north coal apron, x -240..150, z -128..-182
]
export const NORTH_APRON = WHARVES[1]

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
  // the full container terminal on the north port flats
  stack(60, -164, 2, 2, 3),
  stack(120, -166, 2, 2, 4),
  stack(-30, -208, 2, 3, 3),
  stack(-150, -212, 2, 3, 4),
  stack(90, -212, 2, 2, 3),
  stack(-230, -208, 2, 2, 3),
  stack(30, -240, 2, 2, 2),
  stack(-80, -268, 2, 3, 3),
  stack(60, -272, 2, 2, 3),
]

// ---- harbour cranes + coal loaders --------------------------------------------
export interface CraneDef { x: number; z: number; rot: number }
export const CRANES: CraneDef[] = [
  // the working front: portal cranes along the north apron
  { x: -150, z: -168, rot: Math.PI },
  { x: -30, z: -168, rot: Math.PI },
  { x: 100, z: -168, rot: Math.PI + 0.15 },
  // rail yard cranes over the back container rows
  { x: -90, z: -214, rot: Math.PI },
  { x: 40, z: -214, rot: Math.PI - 0.1 },
]

/** rail-mounted coal shiploaders along the north apron edge */
export interface LoaderDef { x: number; z: number }
export const LOADERS: LoaderDef[] = [
  { x: -220, z: -145 },
  { x: -130, z: -145 },
  { x: -40, z: -145 },
  { x: 50, z: -145 },
]

// a loaded coal train drawn up on the back flats, between the yard road rows
export const TRAIN = { z: -226, x0: -210, wagons: 14, wagonLen: 12, gap: 1.4, locoX: -14 }

export const COAL_PILES: Box[] = [
  { x: -190, y: 6 + WHARF_DECK, z: -168, w: 90, h: 12, d: 16 },
  { x: -170, y: 5 + WHARF_DECK, z: -212, w: 80, h: 10, d: 14 },
]


// ---- north-west beach (sandy shoreline with dunes) ---------------------------
export const NW_BEACH: Box = { x: -272, y: 0.5, z: -146, w: 72, h: 1, d: 40 }

// ---- Honeysuckle-style office precinct on the south wharf ---------------------
// the port moved across the water; these stand where the stacks were
export interface OfficeDef extends Box { glass: boolean }
function office(x: number, z: number, w: number, h: number, d: number, glass = false): OfficeDef {
  return { x, y: terrainHeight(x, z) + h / 2, z, w, h, d, glass }
}
export const OFFICES: OfficeDef[] = [
  // waterfront row along the wharf deck (race corridor stays clear, z < 148)
  office(-130, 166, 26, 16, 20, true),
  office(-95, 170, 24, 13, 22),
  office(-58, 165, 28, 20, 20, true),
  office(-18, 169, 26, 12, 22),
  office(22, 165, 28, 18, 20, true),
  office(62, 170, 24, 14, 22),
  office(102, 166, 28, 22, 20, true),
  office(136, 170, 20, 11, 18),
  // campus behind, with the towers that left the north-east corner
  office(-240, 235, 34, 18, 26),
  office(-185, 250, 30, 24, 24, true),
  office(-120, 235, 30, 15, 26),
  office(-60, 255, 30, 34, 24, true),
  office(-5, 235, 32, 26, 24),
  office(55, 258, 30, 48, 26, true),
  office(115, 240, 30, 40, 24, true),
  office(-150, 300, 34, 55, 28, true),
  office(-40, 305, 34, 62, 28, true),
  office(70, 305, 32, 45, 26),
  office(-250, 295, 30, 20, 24),
]

// ---- ships ---------------------------------------------------------------------
export interface ShipDef extends Box { rot: number; kind: 'bulk' | 'tug' }
export const SHIPS: ShipDef[] = [
  // three bulk carriers berthed along the north port front
  { x: -190, y: 3, z: -116, w: 120, h: 6, d: 18, rot: 0, kind: 'bulk' },
  { x: -45, y: 3, z: -116, w: 95, h: 6, d: 16, rot: 0, kind: 'bulk' },
  { x: 75, y: 3, z: -114, w: 105, h: 6, d: 17, rot: 0.04, kind: 'bulk' },
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

export const SPAWN: V3 = { x: -110, y: WHARF_DECK + 0.35, z: -135 } // on the coal apron, facing down the carrier run
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
  if (x < 140) return -305 // extended port flats behind the apron
  if (x < 165) return -305 + ((x - 140) / 25) * 267
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
  NW_BEACH,
  ...OFFICES,
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
  { x: -108, y: WHARF_DECK + 2.2, z: TRAIN.z, w: 208, h: 4.4, d: 3.6 }, // the coal train
  { x: -100, y: 1.1, z: 123, w: 88, h: 2.2, d: 12 }, // the Honeysuckle marina (boats + pontoons)
  ...wallSegments(BREAKWALL, 5),
  ...wallSegments(STOCKTON_BW, 5),
  // facade rows backing the fence lines so a hard lean bonks a wall
  { x: 350, y: 14, z: 92, w: 400, h: 24, d: 26 }, // gorge south frontages
  { x: 350, y: 14, z: -58, w: 400, h: 24, d: 26 }, // gorge north frontages
  { x: 163, y: 14, z: 110, w: 22, h: 24, d: 60 }, // basin east corner, south of channel
  { x: 163, y: 14, z: -85, w: 22, h: 24, d: 90 }, // basin east corner, north of channel
  { x: -60, y: 5, z: 345, w: 460, h: 8, d: 26 }, // back of the port flats
  { x: -80, y: 5, z: -314, w: 480, h: 8, d: 24 }, // back of the extended port flats
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
  { id: 'lighthouse', label: 'NOBBYS LIGHT · SIGNAL STN', pos: { x: LIGHTHOUSE.x, y: NOBBYS.height + 8, z: LIGHTHOUSE.z } },
  { id: 'fort', label: 'FORT SCRATCHLEY', pos: { x: 500, y: 22, z: 100 } },
  { id: 'qwt', label: 'QUEENS WHARF TOWER', pos: { x: 205, y: 24, z: 84 } },
  { id: 'cathedral', label: 'CHRIST CHURCH CATHEDRAL', pos: { x: 280, y: 70, z: 360 } },
  { id: 'ferry', label: 'STOCKTON FERRY', pos: { x: 90, y: 6, z: -120 } },
  { id: 'coal', label: 'COAL TERMINAL', pos: { x: -150, y: 18, z: -170 } },
  { id: 'offices', label: 'HARBOURSIDE OFFICES', pos: { x: -40, y: 40, z: 300 } },
]
