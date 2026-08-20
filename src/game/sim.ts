// One Sim per flight. Owns the drone state, mode logic, abilities, crash and
// respawn, battery, and produces the capability report. Stepped at a fixed
// 120 Hz by the render loop; render interpolates between prev and curr.
import { DRONES, type DroneDef, type DroneId } from './drones.ts'
import {
  PHYS_DT, buildMixer, spawnState, stepDrone, batterySecondsLeft, shapeAxis, v3,
  type DroneInput, type DroneState, type FlightEnv, type Mixer, type Q4, type V3,
} from './physics.ts'
import { WEATHERS, windAt, type WeatherId, type WeatherDef } from './weather.ts'
import { FENCE_RADIUS, SPAWN, SPAWN_YAW, STATIC_TAGGABLES, collide, fenceExcess, groundAt } from './world.ts'
import { GATES, GATE_RADIUS, LAPS, MISSED_GATE_PENALTY, medalFor, medalsFor } from './course.ts'
import { spawnEnemies, stepEnemy, type Enemy } from './enemies.ts'

export type Mode = 'free' | 'race' | 'intercept'

export interface SimConfig {
  drone: DroneId
  mode: Mode
  weather: WeatherId
}

export interface Net {
  pos: V3
  vel: V3
  born: number
  dead: boolean
}

export interface Crate {
  pos: V3
  vel: V3
  landed: boolean
}

export interface Report {
  drone: DroneId
  mode: Mode
  weather: WeatherId
  reason: string
  timeOnTask: number
  energyUsedPct: number
  distanceKm: number
  objectives: string[]
  raceTime?: number
  medal?: 'gold' | 'silver' | 'bronze' | null
  lapTimes?: number[]
  captures?: number
  line: string
}

interface Snapshot {
  pos: V3
  quat: Q4
}

export interface RaceState {
  started: boolean
  time: number
  nextGate: number // 0..7
  lap: number // 0-based
  lapTimes: number[]
  lapStart: number
  penalty: number
  finished: boolean
  prevSide: number[]
}

export class Sim {
  cfg: SimConfig
  def: DroneDef
  weather: WeatherDef
  mixer: Mixer
  state: DroneState
  env: FlightEnv
  t = 0
  prev: Snapshot
  curr: Snapshot

  // abilities
  abilityRequest = false
  cooldownUntil = 0
  sweepConeUntil = -99
  tagged = new Map<string, number>() // id -> tagged-until
  nets: Net[] = []
  netAmmo = 3
  netReloadAt = 0
  crate: Crate | null = null
  crateReleased = false

  race: RaceState | null = null
  enemies: Enemy[] = []

  crashUntil = -99
  crashFlashUntil = -99
  crashes = 0

  message = ''
  messageUntil = -99
  wrongWayUntil = -99

  distance = 0
  boostTime = 0
  boosting = false
  result: Report | null = null
  private endAt = -1
  private endReason = ''

  constructor(cfg: SimConfig) {
    this.cfg = cfg
    this.def = DRONES[cfg.drone]
    this.weather = WEATHERS[cfg.weather]
    this.mixer = buildMixer(this.def)
    this.state = spawnState(this.def, SPAWN, SPAWN_YAW)
    this.env = {
      windAt: (p, t) => windAt(this.weather, p, t),
      groundAt: (x, z) => groundAt(x, z, this.state.pos.y),
      fenceRadius: FENCE_RADIUS,
      fenceExcess,
      // race runs on reduced drain (per-drone) so a clean 3-lap run fits the
      // airframe's battery — see raceDrain in drones.ts
      drainScale: cfg.mode === 'race' ? this.def.raceDrain : 1,
    }
    this.prev = { pos: { ...SPAWN }, quat: { ...this.state.quat } }
    this.curr = { pos: { ...SPAWN }, quat: { ...this.state.quat } }
    if (cfg.mode === 'race') {
      this.race = {
        started: false, time: 0, nextGate: 0, lap: 0, lapTimes: [],
        lapStart: 0, penalty: 0, finished: false,
        prevSide: GATES.map((g) => this.gateSide(g, SPAWN)),
      }
    }
    if (cfg.mode === 'intercept') this.enemies = spawnEnemies()
  }

  say(text: string, seconds = 2.5) {
    this.message = text
    this.messageUntil = this.t + seconds
  }

  private gateSide(g: { pos: V3; normal: V3 }, p: V3): number {
    return Math.sign((p.x - g.pos.x) * g.normal.x + (p.z - g.pos.z) * g.normal.z) || -1
  }

  step(keys: Record<string, boolean>) {
    const s = this.state
    const dt = PHYS_DT
    this.t += dt

    const tumbling = s.tumbling
    const input: DroneInput = tumbling
      ? { x: 0, z: 0, climb: 0, yaw: 0, boost: false }
      : {
          x: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
          z: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
          climb: (keys.Space ? 1 : 0) - (keys.ControlLeft || keys.ControlRight || keys.KeyC ? 1 : 0),
          yaw: (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0),
          boost: !!keys.ShiftLeft || !!keys.ShiftRight,
        }

    this.boosting = input.boost && !s.landed
    if (this.boosting) this.boostTime += dt

    const before = { ...s.pos }
    stepDrone(s, this.def, this.mixer, input, this.env, this.t)
    const hardHit = collide(s)
    this.distance += Math.hypot(s.pos.x - before.x, s.pos.y - before.y, s.pos.z - before.z)

    // crash: hard vertical contact or a fast lateral hit
    if ((s.crashed || hardHit) && this.crashUntil < this.t && this.result === null && s.battery > 0) {
      this.crashes++
      s.tumbling = true
      s.angVel.x += (Math.sin(this.t * 37) - 0.5) * 6
      s.angVel.z += (Math.cos(this.t * 29) - 0.5) * 6
      this.crashUntil = this.t + 1.5
      this.crashFlashUntil = this.t + 0.6
    }
    if (s.tumbling && this.t >= this.crashUntil && s.battery > 0) {
      // respawn where the run started, battery kept — never a game over
      s.pos = { ...SPAWN }
      s.vel = v3()
      s.quat = { x: 0, y: Math.sin(SPAWN_YAW / 2), z: 0, w: Math.cos(SPAWN_YAW / 2) }
      s.angVel = v3()
      s.targetAlt = SPAWN.y
      s.tumbling = false
      s.rotorOmega = s.rotorOmega.map(() => 0.4)
      this.prev = { pos: { ...s.pos }, quat: { ...s.quat } }
      if (this.race && !this.race.finished) this.race.prevSide = GATES.map((g) => this.gateSide(g, s.pos))
    }

    // abilities
    if (this.abilityRequest && !tumbling && this.result === null) this.fireAbility()
    this.abilityRequest = false
    this.stepAbilities(dt)

    // modes
    if (this.race) this.stepRace(dt)
    if (this.cfg.mode === 'intercept') this.stepIntercept(dt)

    // battery flat ends the run with a report
    if (s.battery <= 0 && this.result === null && this.endAt < 0) {
      s.tumbling = true
      this.endReason = 'BATTERY DEPLETED'
      this.endAt = this.t + 1.4
      this.say('BATTERY DEPLETED', 3)
    }
    if (this.endAt > 0 && this.t >= this.endAt && this.result === null) {
      this.result = this.buildReport(this.endReason)
    }

    // snapshots for render interpolation
    this.prev = this.curr
    this.curr = { pos: { ...s.pos }, quat: { ...s.quat } }
  }

  private fireAbility() {
    const s = this.state
    if (this.t < this.cooldownUntil) return
    if (this.def.id === 'kestrel') {
      // sensor sweep: tag everything in a 60 deg cone, 400 m ahead, for 5 s
      this.cooldownUntil = this.t + 4
      this.sweepConeUntil = this.t + 0.7
      const fwd = this.forward()
      const targets = [
        ...STATIC_TAGGABLES,
        ...this.enemies.map((e) => ({ id: e.id, label: e.label, pos: e.pos })),
      ]
      let n = 0
      for (const tg of targets) {
        const dx = tg.pos.x - s.pos.x
        const dy = tg.pos.y - s.pos.y
        const dz = tg.pos.z - s.pos.z
        const d = Math.hypot(dx, dy, dz)
        if (d > 400 || d < 2) continue
        const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d
        if (dot > Math.cos((30 * Math.PI) / 180)) {
          this.tagged.set(tg.id, this.t + 5)
          n++
        }
      }
      this.say(n > 0 ? `SENSOR SWEEP — ${n} CONTACT${n === 1 ? '' : 'S'} TAGGED` : 'SENSOR SWEEP — NO CONTACTS')
    } else if (this.def.id === 'clydesdale') {
      if (!s.hasPayload) { this.say('PAYLOAD ALREADY RELEASED'); return }
      s.hasPayload = false
      this.crateReleased = true
      this.crate = { pos: { x: s.pos.x, y: s.pos.y - 0.9, z: s.pos.z }, vel: { ...s.vel }, landed: false }
      this.say('CARGO RELEASED — ENDURANCE EXTENDED')
      this.cooldownUntil = this.t + 1
    } else {
      // net launcher
      if (this.netAmmo <= 0) { this.say('NETS RELOADING'); return }
      this.netAmmo--
      if (this.netAmmo < 3 && this.netReloadAt < this.t) this.netReloadAt = this.t + 6
      this.cooldownUntil = this.t + 0.9
      const fwd = this.forward()
      this.nets.push({
        pos: { x: s.pos.x + fwd.x * 1.2, y: s.pos.y + fwd.y * 1.2 - 0.2, z: s.pos.z + fwd.z * 1.2 },
        vel: { x: s.vel.x + fwd.x * 42, y: s.vel.y + fwd.y * 42 + 2, z: s.vel.z + fwd.z * 42 },
        born: this.t,
        dead: false,
      })
    }
  }

  forward(): V3 {
    const q = this.state.quat
    return {
      x: -2 * (q.x * q.z + q.w * q.y) * 1 - 0, // rotate (0,0,-1)
      y: -2 * (q.y * q.z - q.w * q.x),
      z: -(1 - 2 * (q.x * q.x + q.y * q.y)),
    }
  }

  private stepAbilities(dt: number) {
    // net reload
    if (this.netAmmo < 3 && this.netReloadAt > 0 && this.t >= this.netReloadAt) {
      this.netAmmo++
      this.netReloadAt = this.netAmmo < 3 ? this.t + 8 : 0
    }
    // nets fly ballistically
    for (const net of this.nets) {
      if (net.dead) continue
      net.vel.y -= 5 * dt // light net, heavy drag: reduced effective gravity
      net.pos.x += net.vel.x * dt
      net.pos.y += net.vel.y * dt
      net.pos.z += net.vel.z * dt
      if (this.t - net.born > 2.0 || net.pos.y < 0) net.dead = true
      for (const e of this.enemies) {
        if (e.captured || net.dead) continue
        const d = Math.hypot(e.pos.x - net.pos.x, e.pos.y - net.pos.y, e.pos.z - net.pos.z)
        if (d < 5) {
          net.dead = true
          e.captured = true
          this.say(`${e.label.split(' ·')[0]} CAPTURED — PARACHUTE DEPLOYED`, 3)
        }
      }
    }
    if (this.nets.length > 8) this.nets = this.nets.filter((n) => !n.dead || this.t - n.born < 3)
    // crate falls, lands, stays
    const c = this.crate
    if (c && !c.landed) {
      c.vel.y -= 9.81 * dt
      c.vel.x *= 1 - 0.2 * dt
      c.vel.z *= 1 - 0.2 * dt
      c.pos.x += c.vel.x * dt
      c.pos.y += c.vel.y * dt
      c.pos.z += c.vel.z * dt
      const g = groundAt(c.pos.x, c.pos.z, c.pos.y + 1)
      if (c.pos.y <= g + 0.45) {
        c.pos.y = g + 0.45
        c.landed = true
      }
    }
  }

  private stepRace(dt: number) {
    const r = this.race!
    if (r.finished) return
    if (r.started) r.time += dt
    const p = this.state.pos
    // refresh every gate's plane side each step (stale sides deadlock passes),
    // then act on the expected gate and the one after it (missed-gate skip)
    const sides = GATES.map((g) => this.gateSide(g, p))
    const wasSides = r.prevSide
    r.prevSide = sides
    for (const look of [0, 1]) {
      const gi = (r.nextGate + look) % GATES.length
      const g = GATES[gi]
      const side = sides[gi]
      const was = wasSides[gi]
      const dx = p.x - g.pos.x
      const dy = p.y - g.pos.y
      const dz = p.z - g.pos.z
      // distance from gate centre in the gate plane
      const along = dx * g.normal.x + dz * g.normal.z
      const planar = Math.hypot(dx - along * g.normal.x, dy, dz - along * g.normal.z)
      if (was < 0 && side > 0 && Math.abs(along) < 8 && planar < GATE_RADIUS + 1) {
        if (look === 1) {
          r.penalty += MISSED_GATE_PENALTY
          this.say(`MISSED GATE ${r.nextGate + 1} — +${MISSED_GATE_PENALTY}s`, 2.5)
          r.nextGate = gi
        }
        this.passGate(gi)
        break
      }
      if (look === 0 && was > 0 && side < 0 && Math.abs(along) < 6 && planar < GATE_RADIUS + 2) {
        this.wrongWayUntil = this.t + 2
      }
    }
  }

  private passGate(gi: number) {
    const r = this.race!
    if (gi === 0) {
      if (!r.started) {
        r.started = true
        r.time = 0
        r.lapStart = 0
        this.say('RACE STARTED — LAP 1 OF 3', 2)
      } else {
        const lapTime = r.time - r.lapStart
        r.lapTimes.push(lapTime)
        r.lapStart = r.time
        r.lap++
        if (r.lap >= LAPS) {
          r.finished = true
          r.time += r.penalty
          this.endReason = 'RACE COMPLETE'
          this.endAt = this.t + 2.2
          this.say(`FINISH — ${fmtTime(r.time)}`, 3)
          return
        }
        this.say(`LAP ${r.lap} — ${fmtTime(lapTime)}`, 2.5)
      }
    }
    r.nextGate = (gi + 1) % GATES.length
  }

  private stepIntercept(dt: number) {
    const wind = this.env.windAt(this.state.pos, this.t)
    for (const e of this.enemies) stepEnemy(e, this.state.pos, wind, this.t, dt)
    if (this.enemies.every((e) => e.captured) && this.endAt < 0 && this.result === null) {
      this.endReason = 'ALL CONTACTS CAPTURED'
      this.endAt = this.t + 3
    }
  }

  requestAbility() {
    this.abilityRequest = true
  }

  finishNow(reason: string) {
    if (this.result === null) this.result = this.buildReport(reason)
  }

  private buildReport(reason: string): Report {
    const r = this.race
    const captures = this.enemies.filter((e) => e.captured).length
    const objectives: string[] = []
    if (this.cfg.mode === 'race' && r) {
      objectives.push(r.finished ? `3 laps completed${r.penalty ? ` (+${r.penalty}s in penalties)` : ''}` : `${r.lap} of 3 laps completed`)
    }
    if (this.cfg.mode === 'intercept') {
      objectives.push(`${captures} of 2 hostile contacts captured`)
    }
    if (this.cfg.mode === 'free') {
      objectives.push(`${(this.distance / 1000).toFixed(1)} km flown across the harbour`)
      if (this.tagged.size > 0) objectives.push(`${this.tagged.size} contacts tagged by sensor sweep`)
      if (this.crateReleased) objectives.push('cargo delivered')
    }
    if (this.crashes > 0) objectives.push(`${this.crashes} airframe limit event${this.crashes === 1 ? '' : 's'}`)

    const medal = r?.finished ? medalFor(r.time, medalsFor(this.cfg.drone, this.cfg.weather)) : undefined
    return {
      drone: this.cfg.drone,
      mode: this.cfg.mode,
      weather: this.cfg.weather,
      reason,
      timeOnTask: this.t,
      energyUsedPct: Math.round((1 - this.state.battery) * 100),
      distanceKm: this.distance / 1000,
      objectives,
      raceTime: r?.finished ? r.time : undefined,
      medal,
      lapTimes: r?.lapTimes,
      captures,
      line: this.generatedLine(captures),
    }
  }

  private generatedLine(captures: number): string {
    const mins = this.t / 60
    const used = Math.max(1, Math.round((1 - this.state.battery) * 100))
    const gusty = this.cfg.weather === 'gusty'
    switch (this.cfg.drone) {
      case 'kestrel':
        return gusty
          ? `The Kestrel stayed on task ${fmtTime(this.t)} in an 11 m/s southerly — light airframes pay for wind, and it still out-lasts the fleet.`
          : `${fmtTime(this.t)} on task for ${used}% battery — at this burn rate the Kestrel holds station longer than anything else in the fleet.`
      case 'clydesdale':
        return gusty
          ? `Rock steady in the gusts that shove the light airframes around — the Clydesdale flew ${this.distanceKm()} km like the wind wasn't there.`
          : this.crateReleased
            ? `Payload delivered and endurance recovered on release — exactly how an 8 kg lift profile should look.`
            : `Slow to start, slow to stop, impossible to upset — ${this.distanceKm()} km of deliberate, load-rated flying.`
      case 'peregrine':
        if (captures >= 2) return `Two contacts netted in ${fmtTime(this.t)} — alert to capture, non-lethal, evidence intact.`
        if (captures === 1) return `One contact down under parachute — the second is why the Peregrine carries three nets.`
        return mins > 0
          ? `${used}% battery in ${fmtTime(this.t)} — the Peregrine trades endurance for a closing speed nothing here can match.`
          : ''
    }
  }

  private distanceKm(): string {
    return (this.distance / 1000).toFixed(1)
  }

  batterySecondsLeft(): number {
    return batterySecondsLeft(this.state, this.def, this.env.drainScale ?? 1)
  }

  /** seconds to fly straight home at cruise speed */
  timeToHome(): number {
    const d = Math.hypot(this.state.pos.x - SPAWN.x, this.state.pos.z - SPAWN.z)
    return d / this.def.cruiseSpeed
  }
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export function fmtClock(t: number): string {
  const m = Math.floor(Math.max(0, t) / 60)
  const s = Math.floor(Math.max(0, t) - m * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export { shapeAxis }
