# Architecture

---

## 1. The core idea

The simulation is a pure, deterministic, fixed step state machine. React and Three.js are a viewer bolted onto the side of it.

```
        input devices                    content JSON
              │                                │
              ▼                                ▼
        ┌───────────┐                   ┌────────────┐
        │ InputTape │                   │ Zod parse  │
        └─────┬─────┘                   └──────┬─────┘
              │                                │
              ▼                                ▼
        ╔══════════════════════════════════════════════╗
        ║              src/sim  (pure TS)              ║
        ║   step(state, input, dt) -> state            ║
        ║   flight · weather · mission · race · rapier ║
        ╚════════════════════┬═════════════════════════╝
                             │  read only snapshots
              ┌──────────────┴───────────────┐
              ▼                              ▼
       src/render (R3F)                 src/ui (React)
       meshes, cameras, FX              hangar, HUD, menus
```

Data flows one way. Nothing downstream of the sim writes to it. The only way to affect the world is to push an intent into the input queue.

---

## 2. Directory contract

```
src/
  sim/
    core/          types, math, seeded PRNG, fixed step scheduler, state hashing
    physics/       Rapier world creation and manual stepping
    flight/        rotor model, mixer, attitude controller, flight modes
    weather/       wind field, gusts, air density, visibility
    mission/       objective machines, scoring, capability report data
    race/          gates, lap timing, penalties, ghosts
    contacts/      contact drone behaviours (patrol, evade, probe)
    index.ts       the only public entry point
  render/
    scene/         environment, lighting, sky, water
    drones/        airframe meshes, rotor animation, LOD
    fx/            particles, trails, rain, dust, net
    cameras/       chase, FPV, orbit, ground observer
    hooks/         useSimSnapshot, useInterpolatedTransform
  ui/
    hangar/        model viewer, spec cards, compare bench
    hud/           instruments, wind rose, objective tracker
    menus/         main menu, briefing, capability report, settings
    dev/           Leva panels, guarded by import.meta.env.DEV
  content/
    parts/         airframes, batteries, sensors, payload modules (JSON)
    courses/       race courses (JSON)
    missions/      contracts (JSON)
    weather/       presets (JSON)
    schema/        Zod schemas, one file per content type
    load.ts        validated loaders
  app/
    store.ts       zustand, UI state only
    loop.ts        the bridge: accumulator, sim stepping, snapshot publishing
    save.ts        localStorage persistence, versioned
```

`src/sim/index.ts` is the only import path the rest of the app may use. Deep imports into `src/sim/**` from outside the sim are a lint error.

---

## 3. The loop

The single most important piece of code in the project.

```ts
// src/app/loop.ts
const STEP_HZ = 120;
const FIXED_DT = 1 / STEP_HZ;
const MAX_STEPS_PER_FRAME = 5; // spiral of death guard

let accumulator = 0;
let previous = sim.snapshot();
let current = previous;

function onFrame(frameDelta: number) {
  accumulator += Math.min(frameDelta, 0.25);

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    previous = current;
    current = sim.step(current, inputTape.consume(FIXED_DT), FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }

  const alpha = accumulator / FIXED_DT;
  publishSnapshot(previous, current, alpha); // render interpolates
}
```

Rules:

* `useFrame` calls `onFrame`. It never calls `sim.step` directly.
* Render transforms are interpolated between `previous` and `current` using `alpha`. Positions lerp, rotations slerp. Without this the drone will judder at any frame rate that is not an exact multiple of 120.
* The accumulator is clamped so a tab regaining focus does not simulate four minutes in one frame.

---

## 4. Rapier integration

`@react-three/rapier` normally steps the physics world itself on its own schedule. That is incompatible with a deterministic fixed step sim, so we take over.

* Mount `<Physics paused>` so the library performs no automatic stepping.
* Obtain the world through `useRapier()` and hand it to the sim at start up.
* `src/sim/physics/world.ts` owns `world.timestep = FIXED_DT` and calls `world.step()` exactly once per fixed step, in a fixed order relative to the rest of the sim.
* Verify the pause and manual step API against the installed version of `@react-three/rapier` before building on it. The property names have changed between major versions, so pin the version in `package.json` and write a smoke test that asserts the world only advances when we ask it to.

Per fixed step ordering, which must never change because determinism depends on it:

1. Sample weather at each body position
2. Compute flight forces (rotor thrust, drag, wind, tether)
3. Apply forces and torques to Rapier bodies
4. `world.step()`
5. Read back transforms and velocities into sim state
6. Advance contact behaviours
7. Evaluate mission and race logic
8. Increment tick counter and update state hash

---

## 5. Flight model

Deliberately a simplified multirotor model. Realistic enough to feel like an aircraft, simple enough to tune in an afternoon with Leva.

**One rigid body per drone.** Rotors are force application points, not separate bodies.

Per rotor `i`:

```
thrust_i  = kT * rho_ratio * omega_i^2          (along the rotor's local up)
torque_i  = kQ * rho_ratio * omega_i^2 * spin_i (about the rotor axis, alternating spin)
```

Body level forces:

```
F_drag   = -0.5 * rho * Cd * A * |v_rel| * v_rel     where v_rel = v_body - v_wind
F_gravity = m * g
```

`m` is dry mass plus payload plus accumulated rain mass. `rho_ratio` comes from the weather system, so a hot day genuinely costs you lift.

**Motor dynamics.** Commanded RPM does not arrive instantly. A first order lag with a per class time constant is what makes the Clydesdale feel heavy and the Peregrine feel twitchy, and it is one of the cheapest sources of character in the whole model.

**Control chain.**

```
raw keys ──► input shaping (expo, deadzone, rate limits by flight mode)
         ──► desired attitude or desired velocity
         ──► attitude PID (angle loop) ──► rate PID (rate loop)
         ──► motor mix ──► per rotor RPM command ──► motor lag ──► thrust
```

Flight modes:

* **Assisted** (default): stick maps to desired velocity, altitude held automatically, tilt limited. Space bar and go.
* **Sport** (`Shift`): stick maps to desired attitude, higher tilt limit, altitude hold released.
* **Manual**: rate mode, no self levelling. Hidden behind a settings toggle for the enthusiast.
* **Precision** (`Alt`): assisted with halved rates and tighter limits, for winch work.

All PID gains, expo curves, tilt limits and lag constants live in the airframe's part JSON, exposed through Leva in dev.

---

## 6. Weather system

```ts
interface WindSample {
  velocity: Vec3;      // m/s, world space
  densityRatio: number; // relative to sea level standard
  visibility: number;   // metres
}
sampleWeather(position: Vec3, tSeconds: number, preset: WeatherPreset): WindSample
```

Composed of:

* base vector from the preset with a logarithmic altitude shear profile
* gust field from 4D simplex noise (x, y, z, time) scaled by the preset gust amplitude
* environment volumes: box or cylinder regions that add turbulence behind buildings, ridge lift on slopes and rotor wash near the ground
* ground effect, a thrust bonus below roughly one rotor diameter of altitude

Deterministic because the noise is seeded and time is the sim clock, never wall clock.

---

## 7. Mission and race logic

Objectives are small state machines with a common interface:

```ts
interface Objective {
  readonly id: string;
  update(ctx: MissionContext, dt: number): ObjectiveStatus; // pending | complete | failed
  progress(): number; // 0..1 for the HUD
}
```

A mission is an ordered or unordered set of objectives plus global failure conditions. New contracts are JSON, and only genuinely new verbs require new code.

Race gates are trigger volumes with a normal. Crossing is detected by a signed distance sign change between the previous and current tick position, tested against the gate plane, which is robust at high speed where a naive volume overlap test would tunnel straight through.

---

## 8. Rendering notes

* Instanced meshes for gates, trees, containers and any repeated prop
* Three LOD levels per airframe
* Cascaded shadow maps, one cascade at trade show quality settings
* Rotor blur is a texture swap above a threshold RPM, never real geometry
* Rain and dust are GPU particles bounded by a box that follows the camera
* A quality preset chosen at start up from a short GPU capability probe, plus a manual override in settings

---

## 9. State, saving and replays

* `zustand` holds UI state only. Simulation state never enters a React store, because a 120 Hz store update would destroy render performance.
* Render reads sim snapshots through a subscription with a `useSyncExternalStore` style hook, not through React state.
* Saves are versioned JSON in `localStorage`, migrated on load, validated with Zod.
* Replays are the seed plus the input tape. They are tiny and they reproduce exactly, which is also how the determinism test works.

---

## 10. Performance guards

* No allocation inside the fixed step. Pre allocate scratch vectors in module scope, use pools for particles and nets.
* The sim step budget is 2 ms. A dev overlay shows the rolling p95.
* Off screen contacts run their behaviour at 20 Hz rather than 120 Hz.
* Physics colliders are convex hulls and primitives. No trimesh colliders on anything that moves.

---

## 11. Build and tooling

* Vite with `@vitejs/plugin-react`
* Path alias `@sim`, `@render`, `@ui`, `@content`, `@app`
* ESLint with an `import/no-restricted-paths` rule enforcing the sim boundary
* Leva imported through a `src/ui/dev/tuning.ts` shim that exports no ops in production, so tree shaking removes it
* GLTF models with Draco compression, textures as KTX2
* Vitest with the node environment for sim tests and jsdom only where a UI test needs it
