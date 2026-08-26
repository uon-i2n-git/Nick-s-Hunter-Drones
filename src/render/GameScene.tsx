// Inside the Canvas: fixed 120 Hz stepping with render interpolation, the
// chase camera, the drone, gates, enemies, projectiles and ability effects.
import { useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PHYS_DT } from '../game/physics.ts'
import { FIELD_SITES, type Sim } from '../game/sim.ts'
import { GATE_RADIUS, medalsFor } from '../game/course.ts'
import { FENCE_RADIUS, SPAWN, STATIC_TAGGABLES } from '../game/world.ts'
import { BUILDERS, MESH_SCALE, buildEnemy } from './meshes.ts'
import { Harbour } from './Harbour.tsx'
import type { HudData, ContactInfo } from '../ui/Hud.tsx'

const CAM_LABELS = ['CHASE CAM', 'ONBOARD CAM', 'TRIPOD CAM']
const CHASE_BASE: Record<string, number> = { kestrel: 5.5, clydesdale: 10, peregrine: 7 }

// Unity-style critically damped smoothing
class Damp3 {
  cur = new THREE.Vector3()
  vel = new THREE.Vector3()
  constructor(readonly smoothTime: number) {}
  update(target: THREE.Vector3, dt: number) {
    const omega = 2 / this.smoothTime
    const x = omega * dt
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    for (const k of ['x', 'y', 'z'] as const) {
      const change = this.cur[k] - target[k]
      const temp = (this.vel[k] + omega * change) * dt
      this.vel[k] = (this.vel[k] - omega * temp) * exp
      this.cur[k] = target[k] + (change + temp) * exp
    }
    return this.cur
  }
}

interface Props {
  sim: Sim
  keysRef: RefObject<Record<string, boolean>>
  camModeRef: RefObject<number>
  onHud: (h: HudData) => void
}

export function GameScene({ sim, keysRef, camModeRef, onHud }: Props) {
  const { camera, gl } = useThree()
  const perf = useRef({ frames: 0, t0: 0 })
  const droneRef = useRef<THREE.Group>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const coneRef = useRef<THREE.Mesh>(null)
  const arrowRef = useRef<THREE.Mesh>(null)
  const crateRef = useRef<THREE.Mesh>(null)
  const lockRef = useRef<THREE.Mesh>(null)
  const cableRef = useRef<THREE.Line>(null)
  const trailRef = useRef<THREE.Line>(null)
  const dustRef = useRef<THREE.Mesh>(null)
  const siteRefs = useRef<Array<THREE.Group | null>>([])
  const trailPts = useRef<Float32Array | null>(null)
  const trailFade = useRef(0)
  const acc = useRef(0)
  const hudAt = useRef(0)
  const lastRanges = useRef(new Map<string, { r: number; t: number }>())
  const camDamp = useMemo(() => {
    const d = new Damp3(0.15)
    d.cur.set(SPAWN.x, SPAWN.y + 4, SPAWN.z + 14)
    return d
  }, [])
  const prevMode = useRef(0)
  const tripodPos = useRef(new THREE.Vector3(SPAWN.x + 18, 10, SPAWN.z + 16))
  // the chase cam follows smoothed YAW only — deriving it from the tilted
  // forward vector made hard manoeuvres whip the whole frame around
  const camYaw = useRef(0)
  const tmpE = useMemo(() => new THREE.Euler(), [])

  // player drone mesh
  const droneObj = useMemo(() => {
    const g = BUILDERS[sim.def.id]()
    g.scale.setScalar(MESH_SCALE[sim.def.id])
    const rotors: THREE.Object3D[] = []
    let cargo: THREE.Object3D | null = null
    g.traverse((o) => {
      if (o.name === 'rotor') rotors.push(o)
      if (o.name === 'cargo') cargo = o
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    // translucent rotor discs sell the spinning blades at speed
    const discMat = new THREE.MeshBasicMaterial({ color: '#20262c', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    for (const r of rotors) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), discMat)
      disc.rotation.x = -Math.PI / 2
      disc.name = 'rotordisc'
      r.add(disc)
    }
    g.userData = { rotors, cargo }
    return g
  }, [sim.def.id])

  // enemies
  const enemyObjs = useMemo(
    () =>
      sim.enemies.map(() => {
        const g = buildEnemy()
        const chute = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: '#ff7a1a', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
        )
        chute.position.y = 2.4
        chute.name = 'chute'
        chute.visible = false
        g.add(chute)
        const rotors: THREE.Object3D[] = []
        g.traverse((o) => o.name === 'rotor' && rotors.push(o))
        g.userData = { rotors }
        return g
      }),
    [sim],
  )

  // net projectile pool
  const netPool = useMemo(
    () =>
      Array.from({ length: 8 }, () => {
        const m = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.35),
          new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 1.2 }),
        )
        m.visible = false
        return m
      }),
    [],
  )

  // tag marker pool (sensor sweep)
  const tagPool = useMemo(
    () =>
      Array.from({ length: 10 }, () => {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(3.4, 4, 4),
          new THREE.MeshBasicMaterial({ color: '#3FD68C', side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }),
        )
        m.visible = false
        m.renderOrder = 90
        return m
      }),
    [],
  )

  // race gate materials for status colours
  const gateMats = useMemo(
    () =>
      sim.gates.map(
        () =>
          new THREE.MeshStandardMaterial({ color: '#5c6773', emissive: '#FF7A1A', emissiveIntensity: 0.05, roughness: 0.5 }),
      ),
    [sim],
  )
  const gateGeo = useMemo(() => new THREE.TorusGeometry(GATE_RADIUS, 0.35, 8, 36), [])
  // sweep cone: apex at origin, opening along -Z (drone forward)
  const coneGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(231, 400, 24, 1, true)
    g.translate(0, -200, 0)
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  const TRAIL_N = 40
  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array(TRAIL_N * 3)
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    trailPts.current = arr
    return g
  }, [])
  const TRAIL_COLOR: Record<string, string> = { kestrel: '#3FD68C', clydesdale: '#d8a020', peregrine: '#FF7A1A' }
  const trailLine = useMemo(
    () =>
      new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({ color: TRAIL_COLOR[sim.def.id], transparent: true, opacity: 0.7, depthWrite: false }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trailGeo, sim.def.id],
  )
  const cableLine = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#20262c' }))
    l.visible = false
    l.frustumCulled = false
    return l
  }, [])

  const tmpV = useMemo(() => new THREE.Vector3(), [])
  const tmpV2 = useMemo(() => new THREE.Vector3(), [])
  const tmpQ = useMemo(() => new THREE.Quaternion(), [])
  const tmpQ2 = useMemo(() => new THREE.Quaternion(), [])

  useFrame((_st, delta) => {
    // ---- fixed-step simulation with accumulator ----
    acc.current += Math.min(delta, 0.25)
    const keys = keysRef.current ?? {}
    let steps = 0
    while (acc.current >= PHYS_DT && steps < 40) {
      sim.step(keys)
      acc.current -= PHYS_DT
      steps++
    }
    const alpha = acc.current / PHYS_DT

    // ---- interpolate drone transform ----
    const drone = droneRef.current
    if (drone) {
      tmpV.set(sim.prev.pos.x, sim.prev.pos.y, sim.prev.pos.z)
      tmpV2.set(sim.curr.pos.x, sim.curr.pos.y, sim.curr.pos.z)
      drone.position.lerpVectors(tmpV, tmpV2, alpha)
      tmpQ.set(sim.prev.quat.x, sim.prev.quat.y, sim.prev.quat.z, sim.prev.quat.w)
      tmpQ2.set(sim.curr.quat.x, sim.curr.quat.y, sim.curr.quat.z, sim.curr.quat.w)
      drone.quaternion.slerpQuaternions(tmpQ, tmpQ2, alpha)

      // rotor spin, faster under boost / high command
      const rotors = droneObj.userData.rotors as THREE.Object3D[]
      const omega = sim.state.rotorOmega
      rotors.forEach((r, i) => {
        r.rotation.y += (12 + 70 * (omega[i % omega.length] ?? 0.4)) * delta * (i % 2 === 0 ? 1 : -1)
      })
      const cargo = droneObj.userData.cargo as THREE.Object3D | null
      if (cargo) cargo.visible = sim.state.hasPayload
    }

    // ---- camera ----
    const mode = (camModeRef.current ?? 0) % 3
    const dronePos = drone ? drone.position : tmpV2
    // smoothed heading: pure yaw from the quaternion, low-passed, so pitch
    // and roll (punch tilt, braking) never swing the camera
    if (drone) {
      const targetYaw = tmpE.setFromQuaternion(drone.quaternion, 'YXZ').y
      let dYaw = targetYaw - camYaw.current
      while (dYaw > Math.PI) dYaw -= Math.PI * 2
      while (dYaw < -Math.PI) dYaw += Math.PI * 2
      camYaw.current += dYaw * Math.min(1, delta * 8)
    }
    const cfx = -Math.sin(camYaw.current)
    const cfz = -Math.cos(camYaw.current)
    // the tripod sets up near wherever the drone is when you switch to it,
    // and repositions if the drone flies out of a sensible viewing range
    if (mode === 2 && drone && (prevMode.current !== 2 || tripodPos.current.distanceTo(dronePos) > 240)) {
      tripodPos.current
        .copy(dronePos)
        .addScaledVector(tmpV.set(cfx, 0, cfz), -20)
        .add(tmpV2.set(-cfz, 0, cfx).multiplyScalar(9))
      tripodPos.current.y = Math.max(dronePos.y + 6, sim.env.groundAt(tripodPos.current.x, tripodPos.current.z) + 3)
    }
    prevMode.current = mode
    if (mode === 0 && drone) {
      const speed = Math.hypot(sim.state.vel.x, sim.state.vel.z)
      const dist = Math.min(12, CHASE_BASE[sim.def.id] + (speed / sim.def.topSpeed) * 4)
      const target = tmpV2.set(dronePos.x - cfx * dist, dronePos.y + 1.9, dronePos.z - cfz * dist)
      camera.position.copy(camDamp.update(target, delta))
      // never let the chase cam sink into a deck or hillside
      const floor = sim.env.groundAt(camera.position.x, camera.position.z) + 1.1
      if (camera.position.y < floor) {
        camera.position.y = floor
        camDamp.cur.y = floor
      }
      camera.lookAt(dronePos.x + cfx * 2, dronePos.y + 0.5, dronePos.z + cfz * 2)
    } else if (mode === 1 && drone) {
      const fwd = tmpV.set(0, 0, -1).applyQuaternion(drone.quaternion)
      camera.position.copy(dronePos).addScaledVector(fwd, 0.4)
      camera.position.y += 0.1
      camera.quaternion.copy(drone.quaternion)
      camDamp.cur.copy(camera.position)
      camDamp.vel.set(0, 0, 0)
    } else {
      camera.position.copy(tripodPos.current)
      camera.lookAt(dronePos)
      camDamp.cur.copy(camera.position)
      camDamp.vel.set(0, 0, 0)
    }

    // ---- sun follows the drone (stable shadows) ----
    const sun = sunRef.current
    if (sun) {
      const qx = Math.round(dronePos.x / 20) * 20
      const qz = Math.round(dronePos.z / 20) * 20
      sun.position.set(qx + 140, 220, qz + 100)
      sun.target.position.set(qx, 0, qz)
      sun.target.updateMatrixWorld()
    }

    // ---- gates ----
    if (sim.race) {
      const next = sim.race.nextGate
      const after = (next + 1) % sim.gates.length
      gateMats.forEach((m, i) => {
        if (sim.race!.finished) m.emissiveIntensity = 0.1
        else if (i === next) m.emissiveIntensity = 1.6
        else if (i === after) m.emissiveIntensity = 0.45
        else m.emissiveIntensity = 0.06
      })
      // floating arrow to the next gate when it is off screen
      const arrow = arrowRef.current
      if (arrow && drone) {
        const g = sim.gates[next]
        tmpV.set(g.pos.x, g.pos.y, g.pos.z)
        const ndc = tmpV2.copy(tmpV).project(camera)
        const off = ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05
        arrow.visible = off && !sim.race.finished
        if (off) {
          arrow.position.copy(dronePos)
          arrow.position.y += 3.2
          arrow.lookAt(tmpV)
          arrow.rotateX(Math.PI / 2) // cone points +Y by default
        }
      }
    }

    // ---- enemies ----
    sim.enemies.forEach((e, i) => {
      const g = enemyObjs[i]
      g.position.set(e.pos.x, e.pos.y, e.pos.z)
      g.rotation.y = e.yaw
      const chute = g.getObjectByName('chute')
      if (chute) chute.visible = e.captured && !e.splashed
      const beacon = g.getObjectByName('beacon') as THREE.Mesh | undefined
      if (beacon) (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = e.captured ? 0.2 : 1.5 + Math.sin(sim.t * 6) * 1.2
      const rotors = g.userData.rotors as THREE.Object3D[]
      if (!e.captured) rotors.forEach((r, j) => (r.rotation.y += 40 * delta * (j % 2 ? -1 : 1)))
    })

    // ---- nets ----
    const liveNets = sim.nets.filter((n) => !n.dead)
    netPool.forEach((m, i) => {
      const n = liveNets[i]
      m.visible = !!n
      if (n) {
        m.position.set(n.pos.x, n.pos.y, n.pos.z)
        m.rotation.y += 8 * delta
      }
    })

    // ---- sweep cone ----
    const cone = coneRef.current
    if (cone && drone) {
      const p = (sim.sweepConeUntil - sim.t) / 0.7
      cone.visible = p > 0 && p <= 1
      if (cone.visible) {
        cone.position.copy(dronePos)
        cone.quaternion.copy(drone.quaternion)
        const s = 1 - p // grow outward
        cone.scale.set(s, s, s)
        ;(cone.material as THREE.MeshBasicMaterial).opacity = 0.22 * p
      }
    }

    // ---- tag markers ----
    const taggedIds: Array<{ x: number; y: number; z: number }> = []
    for (const [id, until] of sim.tagged) {
      if (until < sim.t) continue
      const st = STATIC_TAGGABLES.find((s) => s.id === id)
      if (st) taggedIds.push(st.pos)
      const en = sim.enemies.find((e) => e.id === id)
      if (en) taggedIds.push(en.pos)
    }
    tagPool.forEach((m, i) => {
      const p = taggedIds[i]
      m.visible = !!p
      if (p) {
        m.position.set(p.x, p.y, p.z)
        m.quaternion.copy(camera.quaternion)
        m.rotation.z = Math.PI / 4 + sim.t * 0.8
      }
    })

    // ---- crate + winch cable ----
    const crate = crateRef.current
    if (crate) {
      crate.visible = !!sim.crate
      if (sim.crate) crate.position.set(sim.crate.pos.x, sim.crate.pos.y, sim.crate.pos.z)
    }
    const cable = cableRef.current
    if (cable) {
      const c = sim.crate
      const show = !!c && c.winched && !c.landed
      cable.visible = show
      if (show && c && drone) {
        const pos = cable.geometry.getAttribute('position') as THREE.BufferAttribute
        pos.setXYZ(0, dronePos.x, dronePos.y - 0.3, dronePos.z)
        pos.setXYZ(1, c.pos.x, c.pos.y + 0.35, c.pos.z)
        pos.needsUpdate = true
      }
    }

    // ---- peregrine lock ring ----
    const lock = lockRef.current
    if (lock) {
      const tgt = sim.lockOn()
      lock.visible = !!tgt
      if (tgt) {
        lock.position.set(tgt.pos.x, tgt.pos.y, tgt.pos.z)
        lock.quaternion.copy(camera.quaternion)
        lock.rotation.z = sim.t * 2.2
        const pulse = 1 + Math.sin(sim.t * 10) * 0.08
        lock.scale.set(pulse, pulse, pulse)
      }
    }

    // ---- boost trail: 40-point ribbon behind the drone ----
    const trail = trailRef.current
    const pts = trailPts.current
    if (trail && pts && drone) {
      trailFade.current = sim.boosting ? 1 : Math.max(0, trailFade.current - delta * 1.6)
      // shift history back, write the head
      for (let i = TRAIL_N - 1; i > 0; i--) {
        pts[i * 3] = pts[(i - 1) * 3]
        pts[i * 3 + 1] = pts[(i - 1) * 3 + 1]
        pts[i * 3 + 2] = pts[(i - 1) * 3 + 2]
      }
      pts[0] = dronePos.x
      pts[1] = dronePos.y - 0.15
      pts[2] = dronePos.z
      if (trailFade.current <= 0.01) {
        for (let i = 1; i < TRAIL_N; i++) {
          pts[i * 3] = pts[0]
          pts[i * 3 + 1] = pts[1]
          pts[i * 3 + 2] = pts[2]
        }
      }
      ;(trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      trail.visible = trailFade.current > 0.02
      ;(trail.material as THREE.LineBasicMaterial).opacity = 0.75 * trailFade.current
    }

    // ---- ground-effect ring under a low, working rotor ----
    const dust = dustRef.current
    if (dust && drone) {
      const gnd = sim.env.groundAt(dronePos.x, dronePos.z)
      const agl2 = dronePos.y - gnd
      const working = !sim.state.landed && agl2 < 5 && agl2 > 0.2
      dust.visible = working
      if (working) {
        const cyc = (sim.t * 1.6) % 1
        dust.position.set(dronePos.x, gnd + 0.15, dronePos.z)
        const r = (0.8 + cyc * 2.4) * (sim.def.id === 'clydesdale' ? 1.6 : 1)
        dust.scale.set(r, r, 1)
        ;(dust.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - cyc) * (1 - agl2 / 5)
      }
    }

    // ---- field-task site markers ----
    if (sim.cfg.mode === 'free' && sim.scenarioId === 'field') {
      FIELD_SITES.forEach((site, i) => {
        const gg = siteRefs.current[i]
        if (!gg) return
        const done = sim.siteDone.has(site.id)
        gg.rotation.y = sim.t * (done ? 0.3 : 1.2)
        gg.position.y = site.pos.y + Math.sin(sim.t * 1.8 + i) * 0.6
        gg.children.forEach((ch) => {
          const mm = (ch as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (mm && 'emissiveIntensity' in mm) mm.emissiveIntensity = done ? 0.25 : 1.4
          if (mm && 'color' in mm) mm.color.set(done ? '#3FD68C' : '#FF7A1A')
        })
      })
    }

    // ---- HUD feed at ~10 Hz ----
    if (sim.t - hudAt.current >= 0.1) {
      hudAt.current = sim.t
      onHud(buildHud(sim, mode, lastRanges.current))
    }

    // ---- perf probe (read by tooling via window.__NHD_PERF) ----
    const p = perf.current
    p.frames++
    const now = performance.now()
    if (p.t0 === 0) p.t0 = now
    if (now - p.t0 >= 1000) {
      ;(window as unknown as Record<string, unknown>).__NHD_PERF = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        frameMs: (now - p.t0) / p.frames,
      }
      p.frames = 0
      p.t0 = now
    }
  })

  return (
    <group>
      <Harbour weather={sim.weather} />
      <directionalLight
        ref={sunRef}
        position={[140, 220, 100]}
        intensity={sim.weather.sunIntensity}
        color={sim.weather.id === 'clear' ? '#fff2dd' : '#c7ccd4'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={50}
        shadow-camera-far={600}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-bias={-0.0005}
      />

      <primitive object={droneObj} ref={droneRef} position={[SPAWN.x, SPAWN.y, SPAWN.z]} />

      {sim.race &&
        sim.gates.map((g, i) => (
          <group key={i} position={[g.pos.x, g.pos.y, g.pos.z]} rotation-y={Math.atan2(g.normal.x, g.normal.z)}>
            <mesh geometry={gateGeo} material={gateMats[i]} />
            <mesh position={[0, -(GATE_RADIUS + Math.max(1, g.pos.y - GATE_RADIUS) / 2), 0]}>
              <boxGeometry args={[0.6, Math.max(1, g.pos.y - GATE_RADIUS), 0.6]} />
              <meshStandardMaterial color="#242c34" roughness={0.9} />
            </mesh>
          </group>
        ))}

      {enemyObjs.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
      {netPool.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {tagPool.map((m, i) => (
        <primitive key={i} object={m} />
      ))}

      {/* sensor sweep cone: apex at the drone, 60 deg, 400 m */}
      <mesh ref={coneRef} geometry={coneGeo} visible={false}>
        <meshBasicMaterial color="#3FD68C" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* released cargo crate */}
      <mesh ref={crateRef} visible={false} castShadow>
        <boxGeometry args={[0.9, 0.65, 0.9]} />
        <meshStandardMaterial color="#5d4a1f" roughness={0.9} />
      </mesh>

      {/* off-screen gate arrow */}
      <mesh ref={arrowRef} visible={false}>
        <coneGeometry args={[0.4, 1.6, 5]} />
        <meshBasicMaterial color="#FF7A1A" transparent opacity={0.8} />
      </mesh>

      {/* peregrine firing-solution ring */}
      <mesh ref={lockRef} visible={false} renderOrder={95}>
        <ringGeometry args={[2.6, 3.1, 4]} />
        <meshBasicMaterial color="#FF7A1A" side={THREE.DoubleSide} transparent opacity={0.9} depthTest={false} />
      </mesh>

      {/* winch cable + boost trail */}
      <primitive object={cableLine} ref={cableRef} />
      <primitive object={trailLine} ref={trailRef} />

      {/* rotor-wash ring near the ground */}
      <mesh ref={dustRef} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1, 1.35, 18]} />
        <meshBasicMaterial color="#cfd6da" transparent opacity={0.25} depthWrite={false} />
      </mesh>

      {/* field-task site markers */}
      {sim.cfg.mode === 'free' &&
        sim.scenarioId === 'field' &&
        FIELD_SITES.map((site, i) => (
          <group
            key={site.id}
            position={[site.pos.x, site.pos.y, site.pos.z]}
            ref={(el) => {
              siteRefs.current[i] = el
            }}
          >
            <mesh>
              <octahedronGeometry args={[2.2]} />
              <meshStandardMaterial color="#FF7A1A" emissive="#FF7A1A" emissiveIntensity={1.4} transparent opacity={0.92} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, -0.4, 0]}>
              <torusGeometry args={[4.4, 0.16, 6, 24]} />
              <meshStandardMaterial color="#FF7A1A" emissive="#FF7A1A" emissiveIntensity={1} />
            </mesh>
          </group>
        ))}
    </group>
  )
}

// cone geometry opens along -Y after rotateX(PI/2) fix; orient apex forward:
// handled by lookAt + rotateX in the frame loop. The cone's apex must sit at
// the drone, so translate the geometry down half its height once:
// (done via a wrapper in the geometry args is not possible inline; the visual
// offset is small enough at 400 m that the pulse reads correctly)

function buildHud(sim: Sim, camMode: number, lastRanges: Map<string, { r: number; t: number }>): HudData {
  const s = sim.state
  const speed = Math.hypot(s.vel.x, s.vel.z)
  const fwd = sim.forward()
  const heading = Math.atan2(-fwd.x, -fwd.z)
  const wind = sim.env.windAt(s.pos, sim.t)
  const windSpeed = Math.hypot(wind.x, wind.z)
  // direction the wind is blowing towards, relative to the nose
  const windDir = Math.atan2(-wind.x, -wind.z)
  const agl = s.pos.y - sim.env.groundAt(s.pos.x, s.pos.z)
  const battLeft = sim.batterySecondsLeft()
  const tHome = sim.timeToHome()
  const rad = Math.hypot(s.pos.x, s.pos.z)

  let objective: string
  const nContacts = sim.enemies.length
  const contactLine = `${nContacts === 4 ? 'FOUR' : 'TWO'} HOSTILE DRONES ON PATROL — SEE RADAR.`
  if (sim.cfg.mode === 'free') {
    objective =
      sim.scenarioId === 'field'
        ? 'FIELD TASKS — SURVEY THE FOUR MARKED SITES.'
        : 'DEMO FLIGHT — WORK THROUGH THE CARD BELOW.'
  } else if (sim.cfg.mode === 'race') {
    objective = sim.race!.started
      ? 'FLY THROUGH THE GLOWING ORANGE RING.'
      : `${sim.course.label.toUpperCase()} — ${sim.course.laps} LAPS OF ${sim.gates.length} RINGS.\nTHEY LIGHT UP IN ORDER · MISSING ONE COSTS +3 S.`
  } else if (sim.def.id === 'peregrine') {
    objective = `${contactLine}\nCLOSE IN AND CAPTURE WITH THE NET (F).`
  } else if (sim.def.id === 'kestrel') {
    objective = `${contactLine}\nSWEEP (F) EACH ONE FROM INSIDE 180 M.`
  } else {
    objective = `${contactLine}\nSHADOW EACH ONE — CLOSE WITHIN 90 M.`
  }

  let ability: HudData['ability']
  const cdFrac = Math.max(0, Math.min(1, (sim.cooldownUntil - sim.t) / 4))
  if (sim.def.id === 'kestrel') {
    ability = { label: 'SENSOR SWEEP', ready: sim.t >= sim.cooldownUntil, frac: cdFrac, detail: sim.t >= sim.cooldownUntil ? 'READY' : 'CYCLING' }
  } else if (sim.def.id === 'clydesdale') {
    ability = s.hasPayload
      ? { label: 'CARGO RELEASE', ready: true, frac: 0, detail: 'PAYLOAD 8.0 KG' }
      : { label: 'CARGO RELEASE', ready: false, frac: 0, detail: 'PAYLOAD AWAY' }
  } else {
    const locked = sim.lockOn() !== null
    ability = {
      label: 'NET LAUNCHER',
      ready: sim.netAmmo > 0 && sim.t >= sim.cooldownUntil,
      frac: cdFrac,
      detail: sim.netAmmo > 0 ? (locked ? `LOCKED — FIRE (${sim.netAmmo}/3)` : `${sim.netAmmo}/3 NETS`) : 'RELOADING',
    }
  }

  let race: HudData['race'] = null
  if (sim.race) {
    const g = sim.gates[sim.race.nextGate]
    race = {
      started: sim.race.started,
      finished: sim.race.finished,
      time: sim.race.time,
      lap: sim.race.lap,
      laps: sim.course.laps,
      nextGate: sim.race.nextGate,
      gates: sim.gates.length,
      lastLap: sim.race.lapTimes.length ? sim.race.lapTimes[sim.race.lapTimes.length - 1] : null,
      goldTime: medalsFor(sim.cfg.drone, sim.cfg.weather, sim.scenarioId).gold,
      gateDist: Math.hypot(g.pos.x - s.pos.x, g.pos.y - s.pos.y, g.pos.z - s.pos.z),
    }
  }

  let contacts: ContactInfo[] | null = null
  if (sim.cfg.mode === 'intercept') {
    contacts = sim.enemies.map((e) => {
      const dx = e.pos.x - s.pos.x
      const dz = e.pos.z - s.pos.z
      const range = Math.hypot(dx, e.pos.y - s.pos.y, dz)
      const prev = lastRanges.get(e.id)
      const closing = prev && sim.t > prev.t ? (prev.r - range) / (sim.t - prev.t) : 0
      lastRanges.set(e.id, { r: range, t: sim.t })
      const bearingAbs = Math.atan2(dx, -dz) // 0 = north(-z)... relative below
      const rel = normAngle(bearingAbs - heading)
      return { id: e.id, label: e.label, bearing: rel, range, closing, captured: e.captured }
    })
  }

  let intel: string[] | null = null
  if (sim.def.id === 'kestrel') {
    const rows: Array<{ d: number; label: string }> = []
    for (const [id, until] of sim.tagged) {
      if (until < sim.t) continue
      const st = STATIC_TAGGABLES.find((tg) => tg.id === id)
      const en = sim.enemies.find((e) => e.id === id)
      const pos = st?.pos ?? en?.pos
      const label = st?.label ?? en?.label
      if (!pos || !label) continue
      rows.push({ d: Math.hypot(pos.x - s.pos.x, pos.y - s.pos.y, pos.z - s.pos.z), label: label.split(' ·')[0] })
    }
    rows.sort((a, b) => a.d - b.d)
    intel = rows.slice(0, 4).map((r) => `${r.label} · ${r.d.toFixed(0)} M`)
    if (intel.length === 0) intel = null
  }

  return {
    agl,
    speed,
    vspeed: s.vel.y,
    heading,
    batteryPct: s.battery * 100,
    timeLeftS: battLeft,
    timeToHomeS: tHome,
    lowBatt: battLeft < tHome * 1.3 + 15,
    windSpeed,
    windRel: normAngle(windDir - heading),
    objective,
    message: sim.t < sim.messageUntil ? sim.message : '',
    wrongWay: sim.t < sim.wrongWayUntil,
    tumbling: s.tumbling,
    descentWarn: s.vel.y < -5.2 && agl < 35 && !s.landed,
    fenceWarn: rad > FENCE_RADIUS - 30,
    boost: sim.boosting,
    landed: s.landed,
    flash: sim.t < sim.crashFlashUntil,
    droneModel: sim.def.model.toUpperCase(),
    ability,
    race,
    contacts,
    camLabel: CAM_LABELS[camMode % 3],
    steps: sim.objectiveSteps(),
    intel,
    altAsl: s.pos.y,
    flightTime: sim.t,
    distKm: sim.distance / 1000,
    homeDist: Math.hypot(s.pos.x - SPAWN.x, s.pos.z - SPAWN.z),
    coach: sim.coachHint(),
  }
}

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
