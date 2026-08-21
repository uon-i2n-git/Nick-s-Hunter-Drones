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
export const MISSED_GATE_PENALTY = 3

const n = (x: number, z: number): V3 => {
  const m = Math.hypot(x, z)
  return { x: x / m, y: 0, z: z / m }
}

export interface Medals { gold: number; silver: number; bronze: number }
export interface CourseDef {
  id: string
  label: string
  gates: Gate[]
  laps: number
  pars: Record<DroneId, Medals>
}

// Course 1: the port circuit — the original 8 rings around the working basin.
const CIRCUIT_GATES: Gate[] = [
  { pos: { x: -45, y: 9, z: -92 }, normal: n(1, 0) }, // start/finish, along the berthed carriers
  { pos: { x: 42, y: 8, z: -82 }, normal: n(0.99, 0.12) }, // out of the carrier run
  { pos: { x: 0, y: 12, z: 20 }, normal: n(-0.75, 0.66) }, // swinging out over the basin
  { pos: { x: -95, y: 30, z: 52 }, normal: n(-0.95, 0.3) }, // climbing west
  { pos: { x: -192, y: 56, z: 62 }, normal: n(-0.6, -0.8) }, // ~60 m, high over the west basin
  { pos: { x: -212, y: 12, z: -3 }, normal: n(0, -1) }, // dive back down over open water
  { pos: { x: -212, y: 10, z: -84 }, normal: n(0.5, -0.87) }, // far end, tight turn after
  { pos: { x: -128, y: 8, z: -92 }, normal: n(1, 0) }, // back along the carriers to the line
]

// Course 2: the channel sprint — out the gorge on the north lane, turn at the
// harbour mouth, home on the south lane. Long straights, two hard U-turns.
const SPRINT_GATES: Gate[] = [
  { pos: { x: 150, y: 10, z: -8 }, normal: n(1, 0) }, // start/finish at the gorge entry
  { pos: { x: 300, y: 10, z: -10 }, normal: n(1, 0) }, // flat out down the north lane
  { pos: { x: 460, y: 12, z: -8 }, normal: n(1, 0) },
  { pos: { x: 600, y: 14, z: 2 }, normal: n(0.87, 0.5) }, // drifting toward the mouth
  { pos: { x: 622, y: 16, z: 44 }, normal: n(-0.71, 0.71) }, // U-turn under Nobbys
  { pos: { x: 460, y: 13, z: 48 }, normal: n(-1, 0) }, // home lane, south side
  { pos: { x: 300, y: 11, z: 50 }, normal: n(-1, 0) },
  { pos: { x: 172, y: 10, z: 36 }, normal: n(-0.87, -0.5) }, // swing into the basin for the turn
]

// Per-airframe pars so no single drone wins everywhere: the Peregrine on
// outright pace, the Kestrel per battery spent, the Clydesdale in wind.
const GUSTY_FACTOR: Record<DroneId, number> = {
  kestrel: 1.25, // suffers most in wind
  clydesdale: 1.05, // barely notices
  peregrine: 1.12,
}

export const COURSES: Record<string, CourseDef> = {
  circuit: {
    id: 'circuit',
    label: 'Port Circuit',
    gates: CIRCUIT_GATES,
    laps: 3,
    pars: {
      kestrel: { gold: 170, silver: 200, bronze: 245 },
      clydesdale: { gold: 190, silver: 215, bronze: 250 },
      peregrine: { gold: 110, silver: 135, bronze: 175 },
    },
  },
  sprint: {
    id: 'sprint',
    label: 'Channel Sprint',
    gates: SPRINT_GATES,
    laps: 2,
    pars: {
      kestrel: { gold: 150, silver: 180, bronze: 220 },
      clydesdale: { gold: 165, silver: 195, bronze: 235 },
      peregrine: { gold: 95, silver: 120, bronze: 155 },
    },
  },
}
export const DEFAULT_COURSE = 'circuit'

// kept for tooling that flies the default circuit
export const GATES = CIRCUIT_GATES
export const LAPS = COURSES.circuit.laps

export function medalsFor(drone: DroneId, weather: WeatherId, courseId: string = DEFAULT_COURSE): Medals {
  const p = (COURSES[courseId] ?? COURSES[DEFAULT_COURSE]).pars[drone]
  const f = weather === 'gusty' ? GUSTY_FACTOR[drone] : 1
  return { gold: p.gold * f, silver: p.silver * f, bronze: p.bronze * f }
}

export function medalFor(time: number, m: Medals): 'gold' | 'silver' | 'bronze' | null {
  if (time <= m.gold) return 'gold'
  if (time <= m.silver) return 'silver'
  if (time <= m.bronze) return 'bronze'
  return null
}
