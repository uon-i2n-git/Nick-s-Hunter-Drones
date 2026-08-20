// End-to-end headless verification: an autopilot flies the real Sim through
// a full race (gates, direction, laps, splits, penalties, medal) and an
// intercept (net capture of both enemies, parachute splashdown).
// Run: node --experimental-strip-types tools/verify.ts
import { Sim, fmtTime } from '../src/game/sim.ts'
import { GATES } from '../src/game/course.ts'
import { SPAWN } from '../src/game/world.ts'
import type { DroneId } from '../src/game/drones.ts'
import type { WeatherId } from '../src/game/weather.ts'

type Keys = Record<string, boolean>

function headingOf(sim: Sim): number {
  const f = sim.forward()
  return Math.atan2(-f.x, -f.z)
}

function steerTo(sim: Sim, tx: number, ty: number, tz: number, keys: Keys, boost = false) {
  const s = sim.state
  const dx = tx - s.pos.x
  const dz = tz - s.pos.z
  const want = Math.atan2(-dx, -dz)
  let err = want - headingOf(sim)
  while (err > Math.PI) err -= 2 * Math.PI
  while (err < -Math.PI) err += 2 * Math.PI
  keys.KeyQ = err > 0.06
  keys.KeyE = err < -0.06
  keys.KeyW = Math.abs(err) < 1.0
  // drive the altitude-hold setpoint like a human watching the HUD,
  // and let the drone's own controller do the tracking
  keys.Space = s.targetAlt < ty - 0.5
  keys.ControlLeft = s.targetAlt > ty + 0.5
  keys.ShiftLeft = boost && Math.abs(err) < 0.25
}

function freshKeys(): Keys {
  return {}
}

// ---------- RACE ----------
// two-phase gate approach: line up 25 m before the gate plane, then punch
// through to 12 m past it. boost on when roughly aligned and far enough out.
function runRace(drone: DroneId, weather: WeatherId, skipGate: number | null = null, testBackwards = false) {
  const sim = new Sim({ drone, mode: 'race', weather })
  const keys = freshKeys()
  let steps = 0
  const maxSteps = 600 * 120
  let phaseGate = -1
  let staged = false
  let backwardsDone = false
  let falseCount = false
  let airborne = false
  let lastCrashes = 0
  while (!sim.result && steps < maxSteps) {
    if (sim.crashes !== lastCrashes) {
      lastCrashes = sim.crashes
      airborne = false // respawned on the pad — take off again
    }
    // vertical takeoff first: the pad sits behind the berthed carriers, so
    // climb above their hulls before setting off (a human does this too)
    if (!airborne) {
      if (sim.state.pos.y >= 12) airborne = true
      else {
        sim.step({ Space: sim.state.targetAlt < 13 })
        steps++
        continue
      }
    }
    const r = sim.race!
    let gi = r.nextGate
    if (skipGate !== null && gi === skipGate) gi = (gi + 1) % GATES.length // deliberately miss one
    const g = GATES[gi]
    if (gi !== phaseGate) {
      phaseGate = gi
      staged = false
    }
    const s = sim.state
    const along = (s.pos.x - g.pos.x) * g.normal.x + (s.pos.z - g.pos.z) * g.normal.z

    // a racing clydesdale drops its crate first — that is the intended play
    if (sim.def.id === 'clydesdale' && s.hasPayload && sim.t > 1.5) sim.requestAbility()

    // once, on lap 1, cross gate 2's plane backwards to prove it doesn't count
    if (testBackwards && !backwardsDone && r.started && r.lap === 0 && r.nextGate === 2 && staged) {
      const back = { x: g.pos.x - g.normal.x * 30, y: g.pos.y, z: g.pos.z - g.normal.z * 30 }
      const beforeGate = r.nextGate
      // overfly the gate centre from the front side to behind
      steerTo(sim, back.x, back.y, back.z, keys)
      sim.step(keys)
      if (sim.race!.nextGate !== beforeGate) falseCount = true
      if (along < -22) {
        backwardsDone = true
        staged = false
      }
      steps++
      continue
    }

    const speed = Math.hypot(s.vel.x, s.vel.z)
    const racingLine = drone === 'clydesdale' || (drone === 'kestrel' && weather === 'gusty')
    if (racingLine) {
      // continuous racing line: aim the gate centre in wide arcs, never stop —
      // stage-and-charge stops cost more battery than these runs can afford.
      // if it slides past the plane and misses, aim the next gate and take +3s.
      const aimGi = along > 8 ? (gi + 1) % GATES.length : gi
      const ag = GATES[aimGi]
      const lead = 6
      // stay above hull height while far out, drop to ring height on approach
      const dAim = Math.hypot(ag.pos.x - s.pos.x, ag.pos.z - s.pos.z)
      const aimY = dAim > 60 ? Math.max(ag.pos.y + 0.5, 12) : ag.pos.y + 0.5
      // boost overshoots the clydesdale's 34 m turn radius into scenery
      steerTo(sim, ag.pos.x + ag.normal.x * lead, aimY, ag.pos.z + ag.normal.z * lead, keys, drone !== 'clydesdale')
      // a loaded clydesdale sinks under full forward command — ease off and
      // recover height instead of mushing into a ship hull, like a human would
      if (s.pos.y < aimY - 3 && s.vel.y < 0) keys.KeyW = false
    } else {
      // stage before the gate, bleed speed, then a straight slow run through
      const stageDist = 38
      const speedGate = weather === 'gusty' ? 11 : 9
      const stagePt = { x: g.pos.x - g.normal.x * stageDist, y: g.pos.y + 1, z: g.pos.z - g.normal.z * stageDist }
      const throughPt = { x: g.pos.x + g.normal.x * 15, y: g.pos.y + 0.5, z: g.pos.z + g.normal.z * 15 }
      if (!staged) {
        const d = Math.hypot(stagePt.x - s.pos.x, stagePt.z - s.pos.z)
        // stay high en route, drop to gate height only near the staging box
        const yEnroute = d > 45 ? Math.max(stagePt.y, 14) : stagePt.y
        steerTo(sim, stagePt.x, yEnroute, stagePt.z, keys, d > 80)
        if (d < 25) keys.KeyW = keys.KeyW && speed < speedGate // bleed speed near the box
        if (d < (weather === 'gusty' ? 16 : 12) && Math.abs(stagePt.y - s.pos.y) < 4 && speed < speedGate) staged = true
      } else {
        steerTo(sim, throughPt.x, throughPt.y, throughPt.z, keys)
        keys.ShiftLeft = false
        const dThrough = Math.hypot(throughPt.x - s.pos.x, throughPt.z - s.pos.z)
        if (dThrough < 8 || along > 16) staged = false // missed the ring, go around
      }
    }
    sim.step(keys)
    steps++
  }
  const rep = sim.result
  console.log(`\nRACE ${drone} / ${weather}${skipGate !== null ? ` (skipping gate ${skipGate + 1})` : ''}${testBackwards ? ' (with backwards attempt)' : ''}`)
  if (!rep) {
    console.log(`  DID NOT FINISH in 600 s — nextGate ${sim.race!.nextGate}, lap ${sim.race!.lap}, battery ${(sim.state.battery * 100).toFixed(0)}%`)
    return
  }
  console.log(`  finished: ${rep.reason} | time ${rep.raceTime !== undefined ? fmtTime(rep.raceTime) : 'n/a'} | medal ${rep.medal ?? 'none'} | crashes ${sim.crashes}`)
  console.log(`  laps: ${rep.lapTimes?.map((t) => fmtTime(t)).join(', ')} | penalties ${sim.race!.penalty}s | battery left ${(sim.state.battery * 100).toFixed(0)}%`)
  if (testBackwards) console.log(`  backwards crossing counted: ${falseCount ? 'BUG — IT COUNTED' : 'no (correct)'}`)
}

// ---------- INTERCEPT ----------
function runIntercept() {
  const sim = new Sim({ drone: 'peregrine', mode: 'intercept', weather: 'clear' })
  const keys = freshKeys()
  let steps = 0
  let shots = 0
  const maxSteps = 200 * 120
  while (!sim.result && steps < maxSteps) {
    const target = sim.enemies.find((e) => !e.captured)
    if (target) {
      const s = sim.state
      const d = Math.hypot(target.pos.x - s.pos.x, target.pos.y - s.pos.y, target.pos.z - s.pos.z)
      // lead the target slightly
      const lead = Math.min(1.2, d / 38)
      steerTo(
        sim,
        target.pos.x + target.vel.x * lead,
        target.pos.y + target.vel.y * lead + 1,
        target.pos.z + target.vel.z * lead,
        keys,
        d > 42,
      )
      const f = sim.forward()
      const dot = (f.x * (target.pos.x - s.pos.x) + f.y * (target.pos.y - s.pos.y) + f.z * (target.pos.z - s.pos.z)) / d
      if (d < 38 && dot > 0.88 && sim.netAmmo > 0 && sim.t >= sim.cooldownUntil) {
        sim.requestAbility()
        shots++
      }
    }
    sim.step(keys)
    steps++
  }
  const caps = sim.enemies.filter((e) => e.captured).length
  const splashed = sim.enemies.filter((e) => e.splashed).length
  console.log(`\nINTERCEPT peregrine / clear`)
  console.log(`  result: ${sim.result ? sim.result.reason : 'TIMED OUT'} at t=${fmtTime(sim.t)} | captures ${caps}/2 | splashed down ${splashed} | net shots ${shots}`)
  console.log(`  battery left ${(sim.state.battery * 100).toFixed(0)}%`)
}

// ---------- CRASH / RESPAWN ----------
function runCrash() {
  // fly the peregrine at full speed into a container stack side
  const sim = new Sim({ drone: 'peregrine', mode: 'free', weather: 'clear' })
  const keys = freshKeys()
  let crashedAt = -1
  for (let i = 0; i < 30 * 120 && crashedAt < 0; i++) {
    steerTo(sim, 60, 8, 165, keys, true) // main-wharf stack, below its top
    sim.step(keys)
    if (sim.state.tumbling) crashedAt = sim.t
  }
  let respawned = false
  for (let i = 0; i < 4 * 120 && !respawned; i++) {
    sim.step({})
    if (!sim.state.tumbling && sim.crashes > 0 && Math.abs(sim.state.pos.z - SPAWN.z) < 2) respawned = true
  }
  console.log(`\nCRASH peregrine into stack wall: tumble at ${crashedAt > 0 ? crashedAt.toFixed(1) + ' s' : 'NEVER'}, auto-respawned at pad: ${respawned}`)
}

runRace('peregrine', 'clear')
runRace('kestrel', 'clear')
runRace('clydesdale', 'clear')
runRace('clydesdale', 'gusty')
runRace('kestrel', 'gusty')
runRace('peregrine', 'gusty')
runRace('kestrel', 'clear', 3) // miss gate 4 → +3 s penalty path
runRace('peregrine', 'clear', null, true) // backwards-crossing rejection
runIntercept()
runCrash()
