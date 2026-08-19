// Drone airframe meshes, adapted from the reference dronemeshes.js.
// Built from primitives only. Rotor discs are named 'rotor' so the renderer
// can spin them; the Clydesdale's slung crate is a group named 'cargo' so it
// can be hidden when the payload is released.
import * as THREE from 'three'
import type { DroneId } from '../game/drones.ts'

const BODY = () => new THREE.MeshStandardMaterial({ color: 0x3a444f, metalness: 0.5, roughness: 0.45 })
const DARK = () => new THREE.MeshStandardMaterial({ color: 0x222a33, metalness: 0.55, roughness: 0.4 })
const ARM = () => new THREE.MeshStandardMaterial({ color: 0x8b98a5, metalness: 0.7, roughness: 0.3 })
const ACCENT = () =>
  new THREE.MeshStandardMaterial({
    color: 0xff7a1a, metalness: 0.3, roughness: 0.45, emissive: 0xff7a1a, emissiveIntensity: 0.35,
  })
const GLASS = () => new THREE.MeshStandardMaterial({ color: 0x0b0f14, metalness: 0.9, roughness: 0.08 })

function disc(radius: number, colour = 0x9aa6b2, opacity = 0.22): THREE.Group {
  const g = new THREE.Group()
  g.name = 'rotor'
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  )
  blur.rotation.x = -Math.PI / 2
  g.add(blur)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.018, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x5c6773, metalness: 0.6, roughness: 0.4 }),
  )
  ring.rotation.x = -Math.PI / 2
  g.add(ring)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.09, radius * 0.11, radius * 0.13, 8), DARK())
  g.add(hub)
  // a visible blade so the spin reads
  const blade = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.9, radius * 0.02, radius * 0.12), DARK())
  blade.position.y = radius * 0.05
  g.add(blade)
  return g
}

function arm(from: THREE.Vector3, to: THREE.Vector3, thickness: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  const m = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, len, 8), material)
  m.position.copy(from).add(to).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return m
}

export function buildKestrel(): THREE.Group {
  const g = new THREE.Group()
  const R = 0.09
  const SPAN = 0.175

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.15), BODY())
  g.add(body)

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.06), GLASS())
  canopy.position.set(0, 0.026, -0.035)
  g.add(canopy)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.006, 0.02), ACCENT())
  stripe.position.set(0, 0.012, 0.045)
  g.add(stripe)

  const pts: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  for (const [sx, sz] of pts) {
    const end = new THREE.Vector3(sx * SPAN, 0.012, sz * SPAN)
    g.add(arm(new THREE.Vector3(sx * 0.035, 0, sz * 0.05), end, 0.008, ARM()))
    const d = disc(R)
    d.position.copy(end).setY(0.028)
    g.add(d)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.024, 8), DARK())
    post.position.copy(end).setY(0.018)
    g.add(post)
  }

  // gimbal sensor ball — the sweep cone anchors here
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), DARK())
  neck.position.set(0, -0.026, -0.04)
  g.add(neck)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), DARK())
  ball.name = 'gimbal'
  ball.position.set(0, -0.048, -0.042)
  g.add(ball)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 12), ACCENT())
  lens.rotation.x = Math.PI / 2
  lens.position.set(0, -0.05, -0.065)
  g.add(lens)

  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.1), ARM())
    skid.position.set(sx * 0.05, -0.035, 0.02)
    g.add(skid)
    g.add(arm(new THREE.Vector3(sx * 0.05, -0.016, -0.01), new THREE.Vector3(sx * 0.05, -0.035, 0.0), 0.005, ARM()))
    g.add(arm(new THREE.Vector3(sx * 0.05, -0.016, 0.05), new THREE.Vector3(sx * 0.05, -0.035, 0.05), 0.005, ARM()))
  }
  return g
}

export function buildClydesdale(): THREE.Group {
  const g = new THREE.Group()
  const R = 0.26

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.6), BODY())
  g.add(body)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.52), DARK())
  deck.position.y = 0.07
  g.add(deck)
  for (const sz of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.018, 0.05), ACCENT())
    stripe.position.set(0, 0.02, sz * 0.22)
    g.add(stripe)
  }

  const HEX_R = 0.62
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6
    const end = new THREE.Vector3(Math.sin(a) * HEX_R, 0.05, Math.cos(a) * HEX_R)
    const root = new THREE.Vector3(Math.sin(a) * 0.16, 0.02, Math.cos(a) * 0.16)
    g.add(arm(root, end, 0.024, ARM()))
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.075, 10), DARK())
    nacelle.position.copy(end).setY(0.072)
    g.add(nacelle)
    const d = disc(R, 0x9aa6b2, 0.16)
    d.position.copy(end).setY(0.112)
    g.add(d)
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top = new THREE.Vector3(sx * 0.17, -0.05, sz * 0.22)
      const foot = new THREE.Vector3(sx * 0.27, -0.42, sz * 0.24)
      g.add(arm(top, foot, 0.016, ARM()))
    }
  }
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.62), ARM())
    skid.position.set(sx * 0.27, -0.43, 0.01)
    g.add(skid)
  }

  // slung cargo crate on the hook — hidden when the payload is released
  const cargo = new THREE.Group()
  cargo.name = 'cargo'
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.34), DARK())
  crate.position.set(0, -0.27, 0.02)
  cargo.add(crate)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.35), ACCENT())
  band.position.set(0, -0.19, 0.02)
  cargo.add(band)
  for (const sx of [-1, 1]) {
    cargo.add(arm(new THREE.Vector3(sx * 0.1, -0.06, 0.02), new THREE.Vector3(sx * 0.13, -0.16, 0.02), 0.006, ARM()))
  }
  g.add(cargo)

  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), DARK())
  pod.position.set(0, -0.07, -0.26)
  g.add(pod)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12), ACCENT())
  lens.rotation.x = Math.PI / 2
  lens.position.set(0, -0.075, -0.31)
  g.add(lens)
  return g
}

export function buildPeregrine(): THREE.Group {
  const g = new THREE.Group()
  const R = 0.145

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 6), BODY())
  nose.rotation.x = -Math.PI / 2
  nose.position.set(0, 0, -0.1)
  g.add(nose)

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.2, 6), BODY())
  tail.rotation.x = Math.PI / 2
  tail.position.set(0, 0, 0.17)
  g.add(tail)

  const wing = new THREE.Shape()
  wing.moveTo(0, -0.14)
  wing.lineTo(0.3, 0.16)
  wing.lineTo(0.3, 0.21)
  wing.lineTo(0, 0.1)
  wing.closePath()
  for (const sx of [1, -1]) {
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.012, bevelEnabled: false }), BODY())
    w.rotation.x = Math.PI / 2
    w.scale.x = sx
    w.position.set(0, 0.006, 0)
    g.add(w)
  }

  for (const sx of [1, -1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.022), ACCENT())
    strake.position.set(sx * 0.145, 0.016, 0.005)
    strake.rotation.y = sx * -0.78
    g.add(strake)
  }

  // nose launcher — nets fire from here
  const launcher = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.09), DARK())
  launcher.name = 'launcher'
  launcher.position.set(0, -0.035, -0.2)
  g.add(launcher)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.035, 8), ACCENT())
      tube.rotation.x = Math.PI / 2
      tube.position.set(sx * 0.021, -0.035 + sy * 0.013, -0.25)
      g.add(tube)
    }
  }

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLASS())
  dome.position.set(0, -0.045, -0.04)
  dome.rotation.x = Math.PI
  g.add(dome)

  const booms: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  for (const [sx, sz] of booms) {
    const root = new THREE.Vector3(sx * 0.06, 0.01, sz * 0.05)
    const end = new THREE.Vector3(sx * 0.3, 0.05, sz * 0.24)
    g.add(arm(root, end, 0.013, ARM()))
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.035, 8), DARK())
    post.position.copy(end).setY(0.065)
    g.add(post)
    const d = disc(R, 0xb6c2cf, 0.2)
    d.position.copy(end).setY(0.085)
    g.add(d)
  }

  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.07, 0.085), BODY())
    fin.position.set(sx * 0.045, 0.055, 0.235)
    fin.rotation.z = sx * 0.32
    g.add(fin)
  }

  return g
}

export const BUILDERS: Record<DroneId, () => THREE.Group> = {
  kestrel: buildKestrel,
  clydesdale: buildClydesdale,
  peregrine: buildPeregrine,
}

// scale so the airframes span their honest real-world size across the discs:
// Kestrel 0.35 m, Clydesdale 1.4 m, Peregrine 0.6 m
export const MESH_SCALE: Record<DroneId, number> = {
  kestrel: 0.35 / 0.53,
  clydesdale: 1.4 / 1.76,
  peregrine: 0.6 / 0.89,
}

// simplified enemy quad: 6 meshes, cheap enough to fly two of
export function buildEnemy(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.1, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1c2126, metalness: 0.4, roughness: 0.6 }),
  )
  g.add(body)
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff3030, emissiveIntensity: 2 }),
  )
  beacon.name = 'beacon'
  beacon.position.y = 0.09
  g.add(beacon)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) {
    const d = disc(0.14, 0x777f88, 0.3)
    d.position.set(sx * 0.28, 0.04, sz * 0.28)
    g.add(d)
  }
  g.scale.setScalar(1.5)
  return g
}
