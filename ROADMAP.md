# Roadmap

Ten phases. Each has an exit criterion that is a demonstrable behaviour, not a percentage. Do not start a phase until the previous one passes its exit criterion.

The guiding principle: **get one drone hovering in a browser on day one**. Everything else is decoration on top of a flight model that either feels good or does not.

---

## Phase 0 · Skeleton
Vite plus React plus TypeScript strict. Path aliases. ESLint with the sim boundary rule. Vitest wired up. A single R3F canvas showing a lit box on a ground plane. CI running typecheck, lint and test.

**Exit:** `npm run dev` shows a spinning box, `npm run typecheck && npm run test && npm run lint` all pass in CI.

---

## Phase 1 · Deterministic loop
`src/sim/core`: fixed step scheduler, seeded PRNG, state hashing, snapshot and interpolation. `src/app/loop.ts`. A dev overlay showing tick count, sim ms and interpolation alpha.

**Exit:** a golden trace test proves 1,000 steps from a fixed seed produce an identical state hash across two runs.

---

## Phase 2 · Physics and one hovering drone
Rapier world under manual stepping. One rigid body, four rotor force points, gravity, drag. The rotor model and the motor mix. No controller yet, just raw throttle.

**Exit:** holding `Space` lifts a cube off the ground, releasing it drops it, and the sim step stays under 2 ms.

---

## Phase 3 · Flight model and feel
Attitude and rate PIDs, altitude hold, assisted / sport / precision modes, input shaping. Leva panel bound to the tuning block. Chase camera.

**Exit:** a person who has never seen the project can take off, fly a lap of the ground plane and land, using only the keys in `docs/GAME_DESIGN.md`, without being told anything else. This is the make or break phase. Budget more time than feels reasonable.

---

## Phase 4 · Content pipeline
Zod schemas, part JSON for all three airframes, the loader and the content graph validator. Airframes are now swappable at runtime from data.

**Exit:** pressing a key in the dev overlay switches between Kestrel, Clydesdale and Peregrine and all three feel unmistakably different in the first three seconds. Invalid JSON fails a test with a readable message.

---

## Phase 5 · Weather
Wind field, gusts, altitude shear, air density, ground effect. Weather presets from JSON. The HUD wind rose.

**Exit:** the Clydesdale holds station in the gusty southerly preset while the Kestrel visibly struggles, and both behave identically given the same seed.

---

## Phase 6 · Racing
Gates, plane crossing detection, lap timing, penalties, medals, ghosts from input tapes. One course in one environment, three weather variants.

**Exit:** a complete race from start to results screen, with a working ghost replay that reproduces exactly.

---

## Phase 7 · Missions
Objective state machines, the mission runner, scoring, contacts with the patrol and evader archetypes. Abilities for all three classes: sensor sweep, winch, net launcher. One mission per family.

**Exit:** three missions, one per class, each playable start to finish, each ending in a capability report.

---

## Phase 8 · Shell and the sales layer
Main menu, hangar with model viewer and spec cards, compare bench, contract board, briefing screen, capability report, settings with rebinding, save data.

**Exit:** the loop closes. Launch the game, pick a contract, fly it, get paid, unlock the next drone, all without touching a dev tool.

---

## Phase 9 · Content build out
Remaining fourteen missions, remaining courses, second and third environments, audio, the optional modules, flight school.

**Exit:** the full content set in `docs/GAME_DESIGN.md` is playable.

---

## Phase 10 · Polish and the booth build
Performance passes, LODs, quality presets, GPU probe, attract mode that plays a ghost replay when idle for 60 seconds, a reset to demo state button, PDF spec sheet export, analytics on which drone gets flown most.

**Exit:** 60 fps on the trade show laptop, a cold start under 8 seconds and a two hour unattended booth run with no crash and no memory growth.

---

## Suggested sequencing if time is short

For a first showable demo, phases 0 to 3 plus a stripped phase 6 gives you a flyable drone racing through gates, which already demonstrates most of the value. Add phase 4 next so all three airframes are in, because the product differentiation is the entire point of the exercise.

---

## Risks

| Risk | Mitigation |
|---|---|
| The flight model does not feel good and phase 3 drags | Timebox tuning sessions, get three different people to fly it, keep every tuning value in Leva so iteration is seconds not minutes |
| `@react-three/rapier` manual stepping API differs from expectation | Spike it in phase 2 before building anything on top, pin the version, write a smoke test |
| Determinism breaks silently | The golden trace test runs in CI on every commit from phase 1 onward |
| Scope creep on environments | One environment until phase 9. Newcastle Harbour only |
| Trade show laptop is weaker than expected | Test on integrated graphics from phase 3, not phase 10 |
