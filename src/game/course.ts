// Race course: 8 gates, 3 laps. Start on the main wharf, out low over the
// water, climb to 60 m around the west crane, descend between the west
// container stacks, a tight turn at the far end, then back east through the
// gap between the moored ship and the wharf to the finish.
import type { V3 } from './physics.ts'
import type { DroneId } from './drones.ts'
import type { WeatherId } from './weather.ts'

export interface Gate {
  pos: V3
  /** direction of correct travel, unit, horizontal */
  normal: V3
}

export const GATE_RADIUS = 6
export const LAPS = 3
export const MISSED_GATE_PENALTY = 3

const n = (x: number, z: number): V3 => {
  const m = Math.hypot(x, z)
  return { x: x / m, y: 0, z: z / m }
}

export const GATES: Gate[] = [
  // the course lives on the north (port) side of the basin now — same legs,
  // mirrored across the water
  { pos: { x: -45, y: 9, z: -92 }, normal: n(1, 0) }, // start/finish, along the berthed carriers
  { pos: { x: 42, y: 8, z: -82 }, normal: n(0.99, 0.12) }, // out of the carrier run
  { pos: { x: 0, y: 12, z: 20 }, normal: n(-0.75, 0.66) }, // swinging out over the basin
  { pos: { x: -95, y: 30, z: 52 }, normal: n(-0.95, 0.3) }, // climbing west
  { pos: { x: -192, y: 56, z: 62 }, normal: n(-0.6, -0.8) }, // ~60 m, around the west-arm crane
  { pos: { x: -212, y: 12, z: -3 }, normal: n(0, -1) }, // descend between the container stacks
  { pos: { x: -212, y: 10, z: -84 }, normal: n(0.5, -0.87) }, // far end, tight turn after
  { pos: { x: -128, y: 8, z: -92 }, normal: n(1, 0) }, // back along the carriers to the line
]

// Par thresholds, seconds for 3 laps. Each airframe gets its own par so no
// single drone wins everywhere: the Peregrine on outright pace, the Kestrel
// per battery spent, the Clydesdale holds its par best in the gusty preset.
export interface Medals { gold: number; silver: number; bronze: number }
const PARS: Record<DroneId, Medals> = {
  kestrel: { gold: 170, silver: 200, bronze: 245 },
  clydesdale: { gold: 190, silver: 215, bronze: 250 },
  peregrine: { gold: 110, silver: 135, bronze: 175 },
}
const GUSTY_FACTOR: Record<DroneId, number> = {
  kestrel: 1.25, // suffers most in wind
  clydesdale: 1.05, // barely notices
  peregrine: 1.12,
}

export function medalsFor(drone: DroneId, weather: WeatherId): Medals {
  const p = PARS[drone]
  const f = weather === 'gusty' ? GUSTY_FACTOR[drone] : 1
  return { gold: p.gold * f, silver: p.silver * f, bronze: p.bronze * f }
}

export function medalFor(time: number, m: Medals): 'gold' | 'silver' | 'bronze' | null {
  if (time <= m.gold) return 'gold'
  if (time <= m.silver) return 'silver'
  if (time <= m.bronze) return 'bronze'
  return null
}
