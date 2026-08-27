// One Sim per flight. Owns the drone state, mode logic, abilities, crash and
// respawn, battery, and produces the capability report. Stepped at a fixed
// 120 Hz by the render loop; render interpolates between prev and curr.
import { DRONES, type DroneDef, type DroneId } from './drones.ts'
import {
  PHYS_DT, buildMixer, spawnState, stepDrone, batterySecondsLeft, shapeAxis, v3,
  type DroneInput, type DroneState, type FlightEnv, type Mixer, type Q4, type V3,
} from './physics.ts'
import { WEATHERS, windAt, type WeatherId, type WeatherDef } from './weather.ts'
import { FENCE_RADIUS, SPAWN, SPAWN_YAW, STATIC_TAGGABLES, WHARF_DECK, collide, fenceExcess, groundAt } from './world.ts'
import { COURSES, DEFAULT_COURSE, GATE_RADIUS, MISSED_GATE_PENALTY, medalFor, medalsFor, type CourseDef, type Gate } from './course.ts'
import { spawnEnemies, stepEnemy, type Enemy, type EnemySet } from './enemies.ts'

export type Mode = 'free' | 'race' | 'intercept'

export interface SimConfig {
  drone: DroneId
  mode: Mode
  weather: WeatherId
  /** scenario within the mode; defaults to the first for that mode */
  scenario?: string
}

/** the selectable scenarios per mode, first is the default */
export const SCENARIOS: Record<Mode, Array<{ id: string; label: string; blurb: string }>> = {
  free: [
    { id: 'demo', label: 'Demo Card', blurb: 'Open harbour — a five-check demo card puts the airframe through its paces.' },
    { id: 'field', label: 'Field Tasks', blurb: 'Four sites across the harbour. Survey each one the way this airframe works: sweep it, drop to it, or beat the clock to it.' },
    { id: 'swarmdemo', label: 'Swarm Demo', blurb: 'Hands off — the flight system flies your aircraft as swarm lead with eight wingmates: formation, search, perimeter and recovery.' },
  ],
  race: [
    { id: 'circuit', label: 'Port Circuit', blurb: '3 laps · 8 rings around the working port. Beat the par times for a medal.' },
    { id: 'sprint', label: 'Channel Sprint', blurb: '2 laps out the channel and back — long straights, two hard U-turns at the mouth and the basin.' },
  ],
  intercept: [
    { id: 'patrol', label: 'Harbour Patrol', blurb: 'Two hostile drones over the basin. Net them, paint them, or shadow them — each airframe has its own play.' },
  ],
}

// field-task survey sites, spread across the flyable harbour
export const FIELD_SITES: Array<{ id: string; label: string; pos: V3 }> = [
  { id: 'f1', label: 'COAL TERMINAL', pos: { x: -150, y: 26, z: -170 } },
  { id: 'f2', label: 'CARRIER DECK', pos: { x: -45, y: 18, z: -116 } },
  { id: 'f3', label: 'MARINA ROW', pos: { x: -100, y: 15, z: 123 } },
  { id: 'f4', label: 'MID-CHANNEL MARK', pos: { x: 400, y: 24, z: 20 } },
]

// the swarm demo's scripted programme, in order
export const SWARM_PHASES = [
  { id: 'form', label: 'LAUNCH & FORM UP', until: 24 },
  { id: 'wedge', label: 'WEDGE TRANSIT', until: 56 },
  { id: 'search', label: 'LINE-ABREAST SEARCH', until: 96 },
  { id: 'orbit', label: 'PERIMETER ORBIT', until: 132 },
  { id: 'rtb', label: 'RETURN & RECOVER', until: 999 },
]

export interface SwarmMate {
  pos: V3
  vel: V3
  yaw: number
  grounded: boolean
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
  /** released low: lowered gently on the winch line */
  winched: boolean
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

  // free-flight demo card progress
  freeDone = { takeoff: false, alt40: false, boost: false, ability: false, land: false }
  private freeComplete = false
  netsFired = 0
  bestSweepTags = 0
  // intercept objectives for the non-net airframes
  identified = new Set<string>() // kestrel: contacts painted by the sweep
  shadowed = new Set<string>() // clydesdale: contacts closed to visual range
  // scenario state
  scenarioId: string
  course: CourseDef
  siteDone = new Set<string>() // field tasks
  fieldStartAt = -1 // peregrine's clock starts at the first site
  private fieldComplete = false
  // swarm demo: eight kinematic wingmates + the scripted leader autopilot
  swarm: SwarmMate[] = []
  swarmPhase = 0
  private swarmWp = 0
  private swarmLanding = false
  private demoDone = false

  crashUntil = -99
  crashFlashUntil = -99
  crashes = 0

  message = ''
  messageUntil = -99
  wrongWayUntil = -99

  distance = 0
  boostTime = 0
  boosting = false
  // virtual stick: keyboard gives step inputs, so ease them in like real
  // stick travel (quick to release, gentle to full deflection). The headless
  // autopilots switch this off — they modulate keys at 120 Hz like an analog
  // stick, which the easing would smear.
  inputSmoothing = true
  private stick = { x: 0, z: 0, yaw: 0 }
  result: Report | null = null
  private endAt = -1
  private endReason = ''

  constructor(cfg: SimConfig) {
    this.cfg = cfg
    this.scenarioId = cfg.scenario ?? SCENARIOS[cfg.mode][0].id
    this.course = COURSES[this.scenarioId] ?? COURSES[DEFAULT_COURSE]
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
      // airframe's battery — see raceDrain in drones.ts. Intercept gets the
      // same treatment: the compressed batteries cannot cover a four-contact
      // swarm at combat throttle, so mission drain is scaled to fit.
      drainScale:
        cfg.mode === 'race' ? this.def.raceDrain
        : cfg.mode === 'intercept' ? 0.65
        : (cfg.scenario ?? '') === 'swarmdemo' ? DRONES[cfg.drone].raceDrain * 0.8 // demo power profile: the programme fits every airframe
        : 1,
    }
    this.prev = { pos: { ...SPAWN }, quat: { ...this.state.quat } }
    this.curr = { pos: { ...SPAWN }, quat: { ...this.state.quat } }
    if (cfg.mode === 'race') {
      this.race = {
        started: false, time: 0, nextGate: 0, lap: 0, lapTimes: [],
        lapStart: 0, penalty: 0, finished: false,
        prevSide: this.course.gates.map((g) => this.gateSide(g, SPAWN)),
      }
    }
    if (cfg.mode === 'intercept') this.enemies = spawnEnemies(this.scenarioId as EnemySet)
    if (cfg.mode === 'free' && this.scenarioId === 'swarmdemo') {
      for (let i = 0; i < 8; i++) {
        this.swarm.push({
          pos: { x: -132 + (i % 4) * 9, y: WHARF_DECK + 0.3, z: -160 - Math.floor(i / 4) * 8 },
          vel: v3(),
          yaw: SPAWN_YAW,
          grounded: true,
        })
      }
    }
  }

  get gates(): Gate[] {
    return this.course.gates
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

    // in the swarm demo the flight system has command — player keys are ignored
    if (this.cfg.mode === 'free' && this.scenarioId === 'swarmdemo') keys = this.swarmLeaderKeys()

    const tumbling = s.tumbling
    const rawX = tumbling ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)
    const rawZ = tumbling ? 0 : (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0)
    const rawYaw = tumbling ? 0 : (keys.KeyQ || keys.ArrowLeft ? 1 : 0) - (keys.KeyE || keys.ArrowRight ? 1 : 0)
    const slew = (cur: number, want: number, attack: number, release: number): number => {
      const rate = Math.abs(want) > Math.abs(cur) ? dt / attack : dt / release
      const d2 = want - cur
      return Math.abs(d2) <= rate ? want : cur + Math.sign(d2) * rate
    }
    if (this.inputSmoothing && this.scenarioId !== 'swarmdemo') {
      this.stick.x = slew(this.stick.x, rawX, 0.28, 0.1)
      this.stick.z = slew(this.stick.z, rawZ, 0.28, 0.1)
      this.stick.yaw = slew(this.stick.yaw, rawYaw, 0.2, 0.09)
    } else {
      this.stick.x = rawX
      this.stick.z = rawZ
      this.stick.yaw = rawYaw
    }
    const input: DroneInput = tumbling
      ? { x: 0, z: 0, climb: 0, yaw: 0, boost: false }
      : {
          x: this.stick.x,
          z: this.stick.z,
          // C (or X) descends; Ctrl still works but is never advertised —
          // Ctrl+W closes the browser tab and no preventDefault can stop it
          climb: (keys.Space ? 1 : 0) - (keys.KeyC || keys.KeyX || keys.ControlLeft || keys.ControlRight ? 1 : 0),
          yaw: this.stick.yaw,
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
      if (this.race && !this.race.finished) this.race.prevSide = this.gates.map((g) => this.gateSide(g, s.pos))
    }

    // abilities
    if (this.abilityRequest && !tumbling && this.result === null) this.fireAbility()
    this.abilityRequest = false
    this.stepAbilities(dt)

    // modes
    if (this.race) this.stepRace(dt)
    if (this.cfg.mode === 'intercept') this.stepIntercept(dt)
    if (this.cfg.mode === 'free') {
      if (this.scenarioId === 'field') this.stepFieldTasks()
      else if (this.scenarioId === 'swarmdemo') this.stepSwarm(dt)
      else this.stepFreeTasks()
    }

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
      this.bestSweepTags = Math.max(this.bestSweepTags, n)
      this.say(n > 0 ? `SENSOR SWEEP — ${n} CONTACT${n === 1 ? '' : 'S'} TAGGED` : 'SENSOR SWEEP — NO CONTACTS')
    } else if (this.def.id === 'clydesdale') {
      if (!s.hasPayload) { this.say('PAYLOAD ALREADY RELEASED'); return }
      s.hasPayload = false
      this.crateReleased = true
      const agl = s.pos.y - this.env.groundAt(s.pos.x, s.pos.z)
      const winched = agl < 22
      this.crate = { pos: { x: s.pos.x, y: s.pos.y - 0.9, z: s.pos.z }, vel: { ...s.vel }, landed: false, winched }
      this.say(winched ? 'WINCHING CARGO DOWN — HOLD POSITION' : 'CARGO RELEASED — ENDURANCE EXTENDED')
      this.cooldownUntil = this.t + 1
    } else {
      // net launcher
      if (this.netAmmo <= 0) { this.say('NETS RELOADING'); return }
      this.netAmmo--
      this.netsFired++
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
    // crate falls, lands, stays; a winched crate descends on the cable
    const c = this.crate
    if (c && !c.landed) {
      if (c.winched) {
        // gentle 3 m/s lower, drifting with the aircraft above
        const s2 = this.state
        c.vel.y = Math.max(c.vel.y - 9.81 * dt * 0.5, -3)
        c.vel.x += (s2.vel.x - c.vel.x) * 2.5 * dt
        c.vel.z += (s2.vel.z - c.vel.z) * 2.5 * dt
      } else {
        c.vel.y -= 9.81 * dt
      }
      c.vel.x *= 1 - 0.2 * dt
      c.vel.z *= 1 - 0.2 * dt
      c.pos.x += c.vel.x * dt
      c.pos.y += c.vel.y * dt
      c.pos.z += c.vel.z * dt
      const g = groundAt(c.pos.x, c.pos.z, c.pos.y + 1)
      if (c.pos.y <= g + 0.45) {
        c.pos.y = g + 0.45
        c.landed = true
        if (c.winched) this.say('CARGO DOWN — LOAD CELL CONFIRMS DELIVERY', 2.5)
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
    const sides = this.gates.map((g) => this.gateSide(g, p))
    const wasSides = r.prevSide
    r.prevSide = sides
    for (const look of [0, 1]) {
      const gi = (r.nextGate + look) % this.gates.length
      const g = this.gates[gi]
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
        this.say(`RACE STARTED — LAP 1 OF ${this.course.laps}`, 2)
      } else {
        const lapTime = r.time - r.lapStart
        r.lapTimes.push(lapTime)
        r.lapStart = r.time
        r.lap++
        if (r.lap >= this.course.laps) {
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
    r.nextGate = (gi + 1) % this.gates.length
  }

  private stepIntercept(dt: number) {
    const wind = this.env.windAt(this.state.pos, this.t)
    for (const e of this.enemies) stepEnemy(e, this.state.pos, wind, this.t, dt)
    // each airframe has its own way to win the intercept: the Peregrine nets,
    // the Kestrel identifies with the sweep, the Clydesdale shadows in close
    if (this.def.id === 'kestrel') {
      for (const e of this.enemies) {
        // a distant paint isn't an identification — hold the tag inside 180 m
        const d = Math.hypot(e.pos.x - this.state.pos.x, e.pos.y - this.state.pos.y, e.pos.z - this.state.pos.z)
        if (!this.identified.has(e.id) && d < 180 && (this.tagged.get(e.id) ?? -1) >= this.t) {
          this.identified.add(e.id)
          this.say(`${e.label.split(' ·')[0]} IDENTIFIED — DATA LINKED`, 2.5)
        }
      }
      if (this.identified.size >= this.enemies.length && this.endAt < 0 && this.result === null) {
        this.endReason = 'ALL CONTACTS IDENTIFIED'
        this.endAt = this.t + 3
      }
    }
    if (this.def.id === 'clydesdale') {
      for (const e of this.enemies) {
        // 90 m: close enough for visual, just outside the erratic one's 80 m
        // evade trigger — flying calmly matters, it cannot be outrun
        const d = Math.hypot(e.pos.x - this.state.pos.x, e.pos.y - this.state.pos.y, e.pos.z - this.state.pos.z)
        if (!this.shadowed.has(e.id) && d < 90) {
          this.shadowed.add(e.id)
          this.say(`${e.label.split(' ·')[0]} SHADOWED — VISUAL CONFIRMED`, 2.5)
        }
      }
      if (this.shadowed.size >= this.enemies.length && this.endAt < 0 && this.result === null) {
        this.endReason = 'ALL CONTACTS SHADOWED'
        this.endAt = this.t + 3
      }
    }
    if (this.enemies.every((e) => e.captured) && this.endAt < 0 && this.result === null) {
      this.endReason = 'ALL CONTACTS CAPTURED'
      this.endAt = this.t + 3
    }
  }

  /** free flight is a guided demo card: five checks that show the airframe off */
  private stepFreeTasks() {
    const s = this.state
    const f = this.freeDone
    const agl = s.pos.y - this.env.groundAt(s.pos.x, s.pos.z)
    if (!f.takeoff && !s.landed && agl > 2) {
      f.takeoff = true
      this.say('CHECK — AIRBORNE', 1.8)
    }
    if (f.takeoff && !f.alt40 && agl >= 40) {
      f.alt40 = true
      this.say('CHECK — 40 M REACHED', 1.8)
    }
    if (!f.boost && this.boostTime >= 3) {
      f.boost = true
      this.say('CHECK — BOOST RUN COMPLETE', 1.8)
    }
    if (!f.ability) {
      if (this.def.id === 'kestrel' && this.bestSweepTags >= 3) f.ability = true
      if (this.def.id === 'clydesdale' && this.crateReleased) f.ability = true
      if (this.def.id === 'peregrine' && this.netsFired >= 1) f.ability = true
      if (f.ability) this.say('CHECK — ABILITY DEMONSTRATED', 1.8)
    }
    if (f.takeoff && !f.land && s.landed && Math.hypot(s.pos.x - SPAWN.x, s.pos.z - SPAWN.z) < 14) {
      f.land = true
      this.say('CHECK — RECOVERED ON THE PAD', 2)
    }
    if (!this.freeComplete && f.takeoff && f.alt40 && f.boost && f.ability && f.land) {
      this.freeComplete = true
      this.say('DEMO CARD COMPLETE — ESC FOR THE CAPABILITY REPORT', 5)
    }
  }

  /** the demo leader's flight plan: per-phase waypoints over open water */
  private static SWARM_ROUTE: Record<string, V3[]> = {
    form: [{ x: -70, y: 30, z: -70 }],
    wedge: [{ x: 20, y: 32, z: -50 }, { x: 110, y: 34, z: 0 }],
    search: [{ x: 40, y: 30, z: 30 }, { x: -80, y: 28, z: 16 }, { x: -200, y: 28, z: 0 }],
    orbit: [{ x: -90, y: 32, z: -40 }],
    rtb: [{ x: -110, y: 22, z: -120 }, { x: SPAWN.x, y: 14, z: SPAWN.z }],
  }

  /** scripted autopilot: flies the player's aircraft through the programme */
  private swarmLeaderKeys(): Record<string, boolean> {
    const s = this.state
    const keys: Record<string, boolean> = {}
    const phase = SWARM_PHASES[this.swarmPhase]
    // vertical takeoff before the programme starts moving — the loaded
    // clydesdale needs the full climb, it sinks under forward command
    if (this.swarmPhase === 0 && s.pos.y < 24) {
      keys.Space = s.targetAlt < 28
      return keys
    }
    const route = Sim.SWARM_ROUTE[phase.id]
    const wp = route[Math.min(this.swarmWp, route.length - 1)]
    const dx = wp.x - s.pos.x
    const dz = wp.z - s.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 12 && this.swarmWp < route.length - 1) this.swarmWp++
    // final leg of RTB: hold over the pad and put it down (latched — the
    // heavier airframes drift a little while descending)
    if (phase.id === 'rtb' && this.swarmWp >= route.length - 1 && d < 10) this.swarmLanding = true
    if (this.swarmLanding) {
      // feather the descent: heavy airframes build a sink rate that would
      // flag a crash on touchdown if the descend key were simply held
      keys.ControlLeft = s.vel.y > -2.2
      return keys
    }
    const want = Math.atan2(-dx, -dz)
    const f = this.forward()
    let err = want - Math.atan2(-f.x, -f.z)
    while (err > Math.PI) err -= 2 * Math.PI
    while (err < -Math.PI) err += 2 * Math.PI
    keys.KeyQ = err > 0.06
    keys.KeyE = err < -0.06
    // orbit phase: the leader holds station at the ring centre
    keys.KeyW = Math.abs(err) < 1.0 && (phase.id !== 'orbit' || d > 10)
    keys.Space = s.targetAlt < wp.y - 0.5
    keys.ControlLeft = s.targetAlt > wp.y + 0.5
    // sinking well below the plan under full stick: ease off and recover
    if (s.pos.y < wp.y - 5 && s.vel.y < 0) keys.KeyW = false
    return keys
  }

  /** mates seek their formation slots; phases advance on the clock */
  private stepSwarm(dt: number) {
    const s = this.state
    const phase = SWARM_PHASES[this.swarmPhase]
    // phase clock
    if (this.t >= phase.until && this.swarmPhase < SWARM_PHASES.length - 1) {
      this.swarmPhase++
      this.swarmWp = 0
      this.say(`SWARM — ${SWARM_PHASES[this.swarmPhase].label}`, 3)
      // the recon lead sweeps as the search line forms
      if (SWARM_PHASES[this.swarmPhase].id === 'search' && this.def.id === 'kestrel') this.requestAbility()
    }
    if (this.t < 0.1) this.say('SWARM DEMONSTRATION — FLIGHT SYSTEM HAS COMMAND', 4)
    // the clydesdale flies the programme clean: set the payload down first
    if (this.def.id === 'clydesdale' && this.state.hasPayload && this.t > 1 && this.t < 1.2) this.requestAbility()

    // leader frame
    const f = this.forward()
    const yaw = Math.atan2(-f.x, -f.z)
    const rX = Math.cos(yaw)
    const rZ = -Math.sin(yaw)
    const bX = Math.sin(yaw)
    const bZ = Math.cos(yaw)

    this.swarm.forEach((m, i) => {
      // slot for this mate in the current phase
      let tx: number
      let ty: number
      let tz: number
      const row = Math.floor(i / 2) + 1
      const side = i % 2 === 0 ? 1 : -1
      if (phase.id === 'form' || phase.id === 'wedge') {
        tx = s.pos.x + (rX * side * 7 + bX) * row * 1.0 + bX * row * 8
        tz = s.pos.z + (rZ * side * 7 + bZ) * row * 1.0 + bZ * row * 8
        ty = s.pos.y + (i % 2 ? 1.5 : -1.5)
      } else if (phase.id === 'search') {
        const k = i < 4 ? i + 1 : -(i - 3) // 4 either side of the lead
        tx = s.pos.x + rX * k * 13
        tz = s.pos.z + rZ * k * 13
        ty = s.pos.y + (i % 2 ? 2 : 0)
      } else if (phase.id === 'orbit') {
        const a = this.t * 0.45 + (i * Math.PI) / 4
        tx = -90 + Math.cos(a) * 26
        tz = -40 + Math.sin(a) * 26
        ty = 32 + (i % 2) * 5
      } else {
        // rtb: trail column home, then ground on the apron grid
        if (s.landed || this.demoDone) {
          tx = -132 + (i % 4) * 9
          tz = -160 - Math.floor(i / 4) * 8
          ty = WHARF_DECK + 0.3
        } else {
          tx = s.pos.x + bX * (i + 1) * 9
          tz = s.pos.z + bZ * (i + 1) * 9
          ty = s.pos.y + 2
        }
      }
      // seek the slot, kinematically
      const dx = tx - m.pos.x
      const dy = ty - m.pos.y
      const dz = tz - m.pos.z
      const dist = Math.hypot(dx, dy, dz)
      if (m.grounded && phase.id !== 'form' && this.swarmPhase === 0) return
      m.grounded = dist < 1.2 && ty <= WHARF_DECK + 0.5
      const speed = Math.min(26, 2 + dist * 1.4)
      const k2 = 2.6 * dt
      m.vel.x += ((dx / (dist || 1)) * speed - m.vel.x) * k2
      m.vel.y += ((dy / (dist || 1)) * speed * 0.8 - m.vel.y) * k2
      m.vel.z += ((dz / (dist || 1)) * speed - m.vel.z) * k2
      m.pos.x += m.vel.x * dt
      m.pos.y = Math.max(WHARF_DECK + 0.3, m.pos.y + m.vel.y * dt)
      m.pos.z += m.vel.z * dt
      const moving = Math.hypot(m.vel.x, m.vel.z) > 2
      m.yaw = phase.id === 'orbit' || !moving ? m.yaw : Math.atan2(-m.vel.x, -m.vel.z)
      if (phase.id === 'orbit') m.yaw = Math.atan2(-m.vel.x, -m.vel.z)
    })

    // the programme ends once the lead is down and the mates have settled
    if (phase.id === 'rtb' && s.landed && !this.demoDone) {
      const settled = this.swarm.every((m) => m.pos.y < WHARF_DECK + 1.4)
      if (settled && this.endAt < 0 && this.result === null) {
        this.demoDone = true
        this.endReason = 'SWARM DEMONSTRATION COMPLETE'
        this.endAt = this.t + 3
        this.say('SWARM RECOVERED — DEMONSTRATION COMPLETE', 3)
      }
    }
  }

  /** field tasks: four sites, surveyed the way each airframe works */
  private stepFieldTasks() {
    const s = this.state
    for (const site of FIELD_SITES) {
      if (this.siteDone.has(site.id)) continue
      const d = Math.hypot(site.pos.x - s.pos.x, site.pos.y - s.pos.y, site.pos.z - s.pos.z)
      let done = false
      if (this.def.id === 'kestrel') {
        // stand-off survey: a sweep fired with the site inside 150 m marks it
        if (this.sweepConeUntil > this.t - 0.05 && d < 150) done = true
      } else if (this.def.id === 'clydesdale') {
        // close inspection: put the airframe right on the site
        const agl = s.pos.y - this.env.groundAt(s.pos.x, s.pos.z)
        if (d < 30 && agl < 14) done = true
      } else {
        // peregrine: plain visit, but the clock is the test
        if (d < 28) done = true
      }
      if (done) {
        this.siteDone.add(site.id)
        if (this.fieldStartAt < 0) this.fieldStartAt = this.t
        this.say(`SITE SURVEYED — ${site.label} (${this.siteDone.size}/${FIELD_SITES.length})`, 2.2)
      }
    }
    if (!this.fieldComplete && this.siteDone.size === FIELD_SITES.length) {
      this.fieldComplete = true
      const elapsed = this.t - Math.max(0, this.fieldStartAt)
      const beatClock = this.def.id !== 'peregrine' || elapsed <= 150
      this.say(
        beatClock
          ? 'ALL SITES SURVEYED — ESC FOR THE CAPABILITY REPORT'
          : 'ALL SITES SURVEYED — OVER THE 2:30 TARGET',
        5,
      )
    }
  }

  private coachClimbed = false
  private coachMoved = false

  /** the one thing a brand-new player should do right now; '' when flying */
  coachHint(): string {
    const s = this.state
    if (this.scenarioId === 'swarmdemo') return ''
    if (this.t > 150 || this.result) return ''
    if (!this.coachClimbed) {
      if (!s.landed && s.pos.y - this.env.groundAt(s.pos.x, s.pos.z) > 3) this.coachClimbed = true
      else return 'HOLD  SPACE  TO TAKE OFF'
    }
    if (!this.coachMoved) {
      if (Math.hypot(s.vel.x, s.vel.z) > 7) this.coachMoved = true
      else return 'HOLD  W / ↑  TO FLY FORWARD  ·  Q E / ← →  TO TURN'
    }
    if (this.cfg.mode === 'race' && this.race && !this.race.started) {
      return 'FLY THROUGH THE GLOWING RING TO START — FOLLOW THE ORANGE ARROW'
    }
    if (this.cfg.mode === 'intercept' && this.identified.size + this.shadowed.size === 0 && this.enemies.every((e) => !e.captured)) {
      const near = this.enemies.some((e) => Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) < 150)
      if (!near) return 'THE RADAR (BOTTOM RIGHT) POINTS TO THE CONTACTS — FLY AT A DOT'
    }
    return ''
  }

  /** the HUD's live objective checklist, one entry per step of the mode */
  objectiveSteps(): Array<{ label: string; state: 'done' | 'now' | 'todo' }> {
    if (this.cfg.mode === 'free' && this.scenarioId === 'swarmdemo') {
      return SWARM_PHASES.map((ph, i) => ({
        label: ph.label,
        state: i < this.swarmPhase || this.demoDone ? 'done' : i === this.swarmPhase ? 'now' : 'todo',
      }))
    }
    if (this.cfg.mode === 'free' && this.scenarioId === 'field') {
      const how =
        this.def.id === 'kestrel' ? 'SWEEP (F) INSIDE 150 M'
        : this.def.id === 'clydesdale' ? 'CLOSE TO 30 M, UNDER 14 M AGL'
        : 'FLY THROUGH THE MARKER'
      let nowSeen = false
      const steps = FIELD_SITES.map((site) => {
        const done = this.siteDone.has(site.id)
        const state: 'done' | 'now' | 'todo' = done ? 'done' : nowSeen ? 'todo' : 'now'
        if (!done) nowSeen = true
        return { label: `${site.label} — ${how}`, state }
      })
      if (this.def.id === 'peregrine') {
        const elapsed = this.fieldStartAt < 0 ? 0 : this.t - this.fieldStartAt
        const allDone = this.siteDone.size === FIELD_SITES.length
        steps.push({
          label: `ALL FOUR INSIDE 2:30 (${fmtTime(Math.min(elapsed, 999))})`,
          state: allDone ? (this.t - this.fieldStartAt <= 150 ? 'done' : 'todo') : elapsed > 150 ? 'todo' : 'now',
        })
      }
      return steps
    }
    if (this.cfg.mode === 'free') {
      const f = this.freeDone
      const ability =
        this.def.id === 'kestrel' ? 'TAG 3+ CONTACTS (F)'
        : this.def.id === 'clydesdale' ? 'RELEASE THE CARGO (F)'
        : 'FIRE A NET (F)'
      const list: Array<[string, boolean]> = [
        ['TAKE OFF', f.takeoff],
        ['CLIMB TO 40 M', f.alt40],
        ['BOOST FOR 3 S (SHIFT)', f.boost],
        [ability, f.ability],
        ['LAND BACK ON THE PAD', f.land],
      ]
      let nowSeen = false
      return list.map(([label, done]) => {
        const state = done ? 'done' : nowSeen ? 'todo' : 'now'
        if (!done) nowSeen = true
        return { label, state }
      })
    }
    if (this.cfg.mode === 'race' && this.race) {
      const r = this.race
      const steps: Array<{ label: string; state: 'done' | 'now' | 'todo' }> = [
        { label: 'CROSS THE START RING', state: r.started ? 'done' : 'now' },
      ]
      for (let i = 0; i < this.course.laps; i++) {
        const done = r.lapTimes.length > i
        steps.push({
          label: done ? `LAP ${i + 1} — ${fmtTime(r.lapTimes[i])}` : `LAP ${i + 1} OF ${this.course.laps}`,
          state: done ? 'done' : r.started && r.lap === i ? 'now' : 'todo',
        })
      }
      return steps
    }
    if (this.cfg.mode === 'intercept') {
      const verb = this.def.id === 'kestrel' ? 'IDENTIFY' : this.def.id === 'clydesdale' ? 'SHADOW' : 'CAPTURE'
      const doneSet = this.def.id === 'kestrel' ? this.identified : this.def.id === 'clydesdale' ? this.shadowed : null
      let nowSeen = false
      return this.enemies.map((e) => {
        const done = doneSet ? doneSet.has(e.id) : e.captured
        const state = done ? 'done' : nowSeen ? 'todo' : 'now'
        if (!done) nowSeen = true
        return { label: `${verb} ${e.label.split(' ·')[0]}`, state: state as 'done' | 'now' | 'todo' }
      })
    }
    return []
  }

  /** the peregrine's firing solution: nearest live contact in the launch cone */
  lockOn(): Enemy | null {
    if (this.def.id !== 'peregrine' || this.enemies.length === 0) return null
    const s = this.state
    const f = this.forward()
    let best: Enemy | null = null
    let bestD = 48
    for (const e of this.enemies) {
      if (e.captured) continue
      const dx = e.pos.x - s.pos.x
      const dy = e.pos.y - s.pos.y
      const dz = e.pos.z - s.pos.z
      const d = Math.hypot(dx, dy, dz)
      if (d > bestD) continue
      if ((f.x * dx + f.y * dy + f.z * dz) / d < 0.86) continue
      best = e
      bestD = d
    }
    return best
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
      const L = this.course.laps
      objectives.push(
        r.finished
          ? `${this.course.label}: ${L} laps completed${r.penalty ? ` (+${r.penalty}s in penalties)` : ''}`
          : `${this.course.label}: ${r.lap} of ${L} laps completed`,
      )
    }
    if (this.cfg.mode === 'intercept') {
      const N = this.enemies.length
      if (this.def.id === 'kestrel') objectives.push(`${this.identified.size} of ${N} contacts identified by sensor sweep`)
      else if (this.def.id === 'clydesdale') objectives.push(`${this.shadowed.size} of ${N} contacts shadowed at visual range`)
      else objectives.push(`${captures} of ${N} hostile contacts captured`)
    }
    if (this.cfg.mode === 'free' && this.scenarioId === 'swarmdemo') {
      objectives.push('nine-airframe coordinated demonstration flown by the flight system')
      objectives.push('formation, transit, area search, perimeter orbit and recovery shown')
      objectives.push(`${(this.distance / 1000).toFixed(1)} km flown by the lead aircraft`)
    } else if (this.cfg.mode === 'free' && this.scenarioId === 'field') {
      objectives.push(`field tasks: ${this.siteDone.size} of ${FIELD_SITES.length} sites surveyed`)
      if (this.def.id === 'peregrine' && this.fieldStartAt >= 0 && this.siteDone.size === FIELD_SITES.length) {
        objectives.push(`all sites in ${fmtTime(this.t - this.fieldStartAt)}${this.t - this.fieldStartAt <= 150 ? ' — inside the 2:30 target' : ''}`)
      }
      objectives.push(`${(this.distance / 1000).toFixed(1)} km flown across the harbour`)
    } else if (this.cfg.mode === 'free') {
      const f = this.freeDone
      const done = [f.takeoff, f.alt40, f.boost, f.ability, f.land].filter(Boolean).length
      objectives.push(`demo card: ${done} of 5 checks completed`)
      objectives.push(`${(this.distance / 1000).toFixed(1)} km flown across the harbour`)
      if (this.tagged.size > 0) objectives.push(`${this.tagged.size} contacts tagged by sensor sweep`)
      if (this.crateReleased) objectives.push('cargo delivered')
    }
    if (this.crashes > 0) objectives.push(`${this.crashes} airframe limit event${this.crashes === 1 ? '' : 's'}`)

    const medal = r?.finished ? medalFor(r.time, medalsFor(this.cfg.drone, this.cfg.weather, this.scenarioId)) : undefined
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
    if (this.scenarioId === 'swarmdemo')
      return 'One operator, nine airframes — formation, search and perimeter security flown entirely by the flight system. Swarm coordination is a software feature, not a head-count.'
    switch (this.cfg.drone) {
      case 'kestrel':
        if (this.identified.size >= 2)
          return `Both contacts painted and catalogued in ${fmtTime(this.t)} without closing inside 80 m — that is what an ISR airframe is for.`
        return gusty
          ? `The Kestrel stayed on task ${fmtTime(this.t)} in an 11 m/s southerly — light airframes pay for wind, and it still out-lasts the fleet.`
          : `${fmtTime(this.t)} on task for ${used}% battery — at this burn rate the Kestrel holds station longer than anything else in the fleet.`
      case 'clydesdale':
        if (this.shadowed.size >= 2)
          return `Both contacts shadowed to visual range and it never once got pushed off line — presence is its own deterrent.`
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
