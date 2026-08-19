# CLAUDE.md

Working agreement for Claude Code in this repository. Read this before touching anything.

---

## What this project is

A 3D browser drone simulator that showcases three drone classes sold by **Nick's Hunter Drones**. The player is the prospective customer. Full design intent lives in `docs/GAME_DESIGN.md`.

---

## Hard rules

1. **`src/sim/` is pure.** No React, no Three.js, no DOM, no `window`, no `performance.now()`, no `Math.random()`. Randomness comes from an injected seeded PRNG. Time comes in as a `dt` argument.
2. **No `any` in `src/sim/`.** Anywhere else, `any` needs a `// eslint-disable-next-line` with a one line reason.
3. **Rendering never mutates simulation state.** `src/render/` reads. If a render module needs to change the world, it dispatches an intent through the input queue.
4. **All external JSON is parsed through Zod at load.** Never `JSON.parse(...) as PartDef`. Use `PartDef.parse(...)`. See `docs/CONTENT_SCHEMA.md`.
5. **Fixed timestep.** The sim steps at a fixed 120 Hz. Render frames interpolate between the last two sim states. Never step the sim from `useFrame` with a variable `delta`.
6. **Tuning numbers live in content JSON, not in code.** If you are typing a magic number into a `.ts` file in `src/sim/`, it probably belongs in a part definition or a tuning profile.
7. **Leva is dev only.** Import it behind `import.meta.env.DEV`. It must not appear in a production bundle.
8. **Do not add a dependency without saying why in the PR description.** The stack listed in `README.md` is deliberate.

---

## Commands

```bash
npm run dev
npm run test            # vitest run
npm run test:watch
npm run typecheck       # tsc --noEmit
npm run lint
npm run build
```

Before you claim a task is finished, `npm run typecheck && npm run test && npm run lint` must all pass. Do not report success on a partial implementation.

---

## Conventions

* **Units are SI everywhere in the sim.** Metres, kilograms, seconds, newtons, radians. Convert only at the UI edge. Any variable holding a non SI value carries the unit in its name, for example `speedKmh`.
* **Axes:** Three.js convention. `+Y` is up, `-Z` is the drone's forward at zero yaw, `+X` is right.
* **Naming:** `PascalCase` for types and React components, `camelCase` for functions and variables, `SCREAMING_SNAKE` for module level constants, `kebab-case` for file names in `content/` and `public/`.
* **Files:** one exported concept per file in `src/sim/`. If a file passes roughly 250 lines, split it.
* **Comments:** explain the physics or the design intent, not the syntax. A comment citing the equation being implemented is worth ten comments restating the code.
* **Commit style:** `area: short imperative summary`, for example `sim: add rotor drag torque to the mixer`.

---

## Where things go

| You are writing | It goes in |
|---|---|
| Flight dynamics, mixers, controllers | `src/sim/flight/` |
| Wind, gusts, weather effects | `src/sim/weather/` |
| Mission state machines, objectives, scoring | `src/sim/mission/` |
| Checkpoint and race logic | `src/sim/race/` |
| Enemy or contact drone behaviour | `src/sim/contacts/` |
| Rapier world setup and stepping | `src/sim/physics/` |
| Meshes, materials, particles, cameras | `src/render/` |
| Hangar, HUD, menus, spec sheets | `src/ui/` |
| Part, course, mission, weather JSON and their schemas | `src/content/` |
| Zustand stores and the loop bridge | `src/app/` |

---

## Testing expectations

Every module in `src/sim/` ships with tests. Details in `docs/TESTING.md`. In short:

* pure maths gets unit tests with hand worked expected values
* the flight model gets behavioural tests, for example "hover throttle holds altitude within 0.1 m over 10 simulated seconds"
* determinism gets a golden trace test: same seed plus same input tape gives a byte identical state hash
* every Zod schema gets a valid fixture and at least one invalid fixture

---

## Performance budget

Target 60 fps on integrated graphics, since this will run on a trade show laptop.

* under 150 draw calls per frame
* under 250k triangles visible
* no allocation inside the fixed step loop. Reuse vectors and quaternions, use object pools for particles and projectiles
* textures 2048 px maximum, KTX2 compressed where practical
* keep the sim step under 2 ms

---

## Things that are out of scope

No multiplayer. No account system. No real telemetry from real hardware. No monetisation. Any spec number in this repo is illustrative product marketing, not a certified performance guarantee, and `docs/DRONE_SPECS.md` says so in writing.

---

## When you are unsure

Ask before inventing a new subsystem. Prefer extending an existing module. If a doc in `docs/` contradicts the code, the doc wins and the code is a bug, unless the commit that introduced the difference explains otherwise.
