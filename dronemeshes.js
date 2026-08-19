import * as THREE from 'three';

// ── shared materials ────────────────────────────────────────────────
const BODY   = () => new THREE.MeshStandardMaterial({ color: 0x3a444f, metalness: 0.5, roughness: 0.45 });
const DARK   = () => new THREE.MeshStandardMaterial({ color: 0x222a33, metalness: 0.55, roughness: 0.4 });
const ARM    = () => new THREE.MeshStandardMaterial({ color: 0x8b98a5, metalness: 0.7,  roughness: 0.3  });
const ACCENT = () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, metalness: 0.3,  roughness: 0.45,
                                                      emissive: 0xff7a1a, emissiveIntensity: 0.35 });
const GLASS  = () => new THREE.MeshStandardMaterial({ color: 0x0b0f14, metalness: 0.9, roughness: 0.08 });

function disc(radius, colour = 0x9aa6b2, opacity = 0.22) {
  const g = new THREE.Group();
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide,
                                  depthWrite: false })
  );
  blur.rotation.x = -Math.PI / 2;
  g.add(blur);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.018, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x5c6773, metalness: 0.6, roughness: 0.4 })
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.09, radius * 0.11, radius * 0.13, 12), DARK());
  g.add(hub);
  return g;
}

function arm(from, to, thickness, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, len, 10), material);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

// ── HD-1 KESTREL · recon ────────────────────────────────────────────
// thin X frame, four small props, slim sensor ball underneath. ~0.35 m
export function buildKestrel() {
  const g = new THREE.Group();
  const R = 0.09, SPAN = 0.175;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.035, 0.15), BODY());
  body.geometry.translate(0, 0, 0);
  g.add(body);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.06), GLASS());
  canopy.position.set(0, 0.026, -0.035);
  g.add(canopy);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.006, 0.02), ACCENT());
  stripe.position.set(0, 0.012, 0.045);
  g.add(stripe);

  const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of pts) {
    const end = new THREE.Vector3(sx * SPAN, 0.012, sz * SPAN);
    g.add(arm(new THREE.Vector3(sx * 0.035, 0, sz * 0.05), end, 0.008, ARM()));
    const d = disc(R);
    d.position.copy(end).setY(0.028);
    g.add(d);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.024, 10), DARK());
    post.position.copy(end).setY(0.018);
    g.add(post);
  }

  // gimbal sensor ball
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), DARK());
  neck.position.set(0, -0.026, -0.04);
  g.add(neck);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 18), DARK());
  ball.position.set(0, -0.048, -0.042);
  g.add(ball);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 20), ACCENT());
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.05, -0.065);
  g.add(lens);

  // skids
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.10), ARM());
    skid.position.set(sx * 0.05, -0.035, 0.02);
    g.add(skid);
    g.add(arm(new THREE.Vector3(sx * 0.05, -0.016, -0.01), new THREE.Vector3(sx * 0.05, -0.035, 0.0), 0.005, ARM()));
    g.add(arm(new THREE.Vector3(sx * 0.05, -0.016, 0.05), new THREE.Vector3(sx * 0.05, -0.035, 0.05), 0.005, ARM()));
  }
  return g;
}

// ── HD-2 CLYDESDALE · payload ───────────────────────────────────────
// broad flat body, six big slow props, tall legs, cargo box slung below. ~1.4 m
export function buildClydesdale() {
  const g = new THREE.Group();
  const R = 0.26;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.60), BODY());
  g.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 0.52), DARK());
  deck.position.y = 0.07;
  g.add(deck);
  for (const sz of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.018, 0.05), ACCENT());
    stripe.position.set(0, 0.02, sz * 0.22);
    g.add(stripe);
  }

  // six rotor positions, proper hexagon so the discs never overlap
  const HEX_R = 0.62;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const end = new THREE.Vector3(Math.sin(a) * HEX_R, 0.05, Math.cos(a) * HEX_R);
    const root = new THREE.Vector3(Math.sin(a) * 0.16, 0.02, Math.cos(a) * 0.16);
    g.add(arm(root, end, 0.024, ARM()));
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.075, 12), DARK());
    nacelle.position.copy(end).setY(0.072);
    g.add(nacelle);
    const d = disc(R, 0x9aa6b2, 0.16);
    d.position.copy(end).setY(0.112);
    g.add(d);
  }

  // tall legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = new THREE.Vector3(sx * 0.17, -0.05, sz * 0.22);
    const foot = new THREE.Vector3(sx * 0.27, -0.42, sz * 0.24);
    g.add(arm(top, foot, 0.016, ARM()));
  }
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.62), ARM());
    skid.position.set(sx * 0.27, -0.43, 0.01);
    g.add(skid);
  }

  // slung cargo box
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.34), DARK());
  crate.position.set(0, -0.27, 0.02);
  g.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.35), ACCENT());
  band.position.set(0, -0.19, 0.02);
  g.add(band);
  for (const sx of [-1, 1]) {
    g.add(arm(new THREE.Vector3(sx * 0.10, -0.06, 0.02), new THREE.Vector3(sx * 0.13, -0.16, 0.02), 0.006, ARM()));
  }

  // sensor pod
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), DARK());
  pod.position.set(0, -0.07, -0.26);
  g.add(pod);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 18), ACCENT());
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.075, -0.31);
  g.add(lens);
  return g;
}

// ── HD-3 PEREGRINE · interceptor ────────────────────────────────────
// swept arrow body, four small fast props, nose launcher. ~0.6 m
export function buildPeregrine() {
  const g = new THREE.Group();
  const R = 0.145;

  // dart fuselage: hexagonal cone forward + short tail section
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 6), BODY());
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -0.10);
  g.add(nose);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.20, 6), BODY());
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, 0.17);
  g.add(tail);

  // swept delta wings
  const wing = new THREE.Shape();
  wing.moveTo(0, -0.14);
  wing.lineTo(0.30, 0.16);
  wing.lineTo(0.30, 0.21);
  wing.lineTo(0, 0.10);
  wing.closePath();
  for (const sx of [1, -1]) {
    const w = new THREE.Mesh(
      new THREE.ExtrudeGeometry(wing, { depth: 0.012, bevelEnabled: false }),
      BODY()
    );
    w.rotation.x = Math.PI / 2;
    w.scale.x = sx;
    w.position.set(0, 0.006, 0);
    g.add(w);
  }

  // accent strakes laid flat on the wing leading edges
  for (const sx of [1, -1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.008, 0.022), ACCENT());
    strake.position.set(sx * 0.145, 0.016, 0.005);
    strake.rotation.y = sx * -0.78;
    g.add(strake);
  }

  // nose launcher
  const launcher = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.09), DARK());
  launcher.position.set(0, -0.035, -0.20);
  g.add(launcher);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.035, 12), ACCENT());
    tube.rotation.x = Math.PI / 2;
    tube.position.set(sx * 0.021, -0.035 + sy * 0.013, -0.25);
    g.add(tube);
  }

  // radar dome underneath
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), GLASS());
  dome.position.set(0, -0.045, -0.04);
  dome.rotation.x = Math.PI;
  g.add(dome);

  // four swept booms, wide stance
  const booms = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of booms) {
    const root = new THREE.Vector3(sx * 0.06, 0.01, sz * 0.05);
    const end  = new THREE.Vector3(sx * 0.30, 0.05, sz * 0.24);
    g.add(arm(root, end, 0.013, ARM()));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.035, 10), DARK());
    post.position.copy(end).setY(0.065);
    g.add(post);
    const d = disc(R, 0xb6c2cf, 0.20);
    d.position.copy(end).setY(0.085);
    g.add(d);
  }

  // twin tail fins
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.07, 0.085), BODY());
    fin.position.set(sx * 0.045, 0.055, 0.235);
    fin.rotation.z = sx * 0.32;
    g.add(fin);
  }

  return g;
}

export const BUILDERS = { kestrel: buildKestrel, clydesdale: buildClydesdale, peregrine: buildPeregrine };
