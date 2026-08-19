# Nick's Hunter Drones: Flight Ops

A browser based 3D drone simulator that doubles as a product showcase for **Nick's Hunter Drones**.

The player is not a pilot fantasy character. The player is **the customer**. They walk into a virtual hangar, get handed three very different aircraft and are given jobs that only one of them can do well. By the time they finish, they have discovered the product line by flying it.

Three classes, three jobs, one flight model:

| Class | Airframe | Sells on |
|---|---|---|
| Recon | **HD-1 Kestrel** | endurance, sensors, stealth |
| Payload | **HD-2 Clydesdale** | lift, winch precision, wind tolerance |
| Interceptor | **HD-3 Peregrine** | speed, agility, counter-UAS capability |

---

## Quick start

```bash
npm install
npm run dev        # Vite dev server, Leva tuning panel enabled
npm run test       # Vitest
npm run typecheck  # tsc --noEmit, strict
npm run build      # production bundle, Leva stripped
```

Requires Node 20 or newer.

---

## Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true`. No `any` anywhere in `src/sim/` |
| Bundler / dev server | Vite |
| Shell, menus, hangar UI | React 19 (required by `@react-three/fiber` v9) |
| 3D rendering | Three.js via React Three Fiber (`@react-three/fiber`) |
| Helpers | `@react-three/drei` |
| Physics | Rapier via `@react-three/rapier` |
| Live tuning | `leva`, dev builds only |
| State | `zustand` |
| Unit tests | Vitest |
| Content validation | Zod, every part and course JSON validated at load |

---

## Repo layout

```
/
  README.md                 you are here
  CLAUDE.md                 working agreement for Claude Code
  docs/
    GAME_DESIGN.md          modes, missions, controls, the sales loop
    ARCHITECTURE.md         module boundaries, fixed timestep, sim/render split
    DRONE_SPECS.md          the three classes, stat blocks, talking points
    CONTENT_SCHEMA.md       Zod schemas for parts, courses, missions, weather
    ROADMAP.md              phases with exit criteria
    TESTING.md              what gets tested and how
    PROMPTS.md              copy-paste Claude Code prompts, phase by phase
  src/
    sim/                    pure TS simulation. No React. No Three.js imports.
    render/                 R3F scene graph, reads sim state, never writes it
    ui/                     React shell, hangar, HUD, menus
    content/                JSON data plus Zod schemas
    app/                    store, loop bridge, save data
  public/
    models/  audio/  env/
  tests/
```

---

## The one rule that keeps this project sane

`src/sim/` never imports React, never imports Three.js and never touches the DOM. It is a pure function of `(state, inputs, dt)` to `state`. Everything visual reads from it.

That boundary is what makes the flight model testable, the replays deterministic and the Leva tuning panel actually useful. Break it and the project turns into spaghetti within a fortnight.

---

## Where to start reading

1. `docs/GAME_DESIGN.md` for what the game is
2. `docs/ARCHITECTURE.md` for how it is put together
3. `docs/PROMPTS.md` to start building with Claude Code

---

## Reference versions

Latest published versions at the time these docs were written (August 2026). Pin exact versions in `package.json` and re-check before relying on any API detail, especially Rapier's manual stepping and Zod's error formatting.

```
three 0.185.x          @react-three/fiber 9.7.x     @react-three/drei 10.7.x
@react-three/rapier 2.2.x   leva 0.10.x             zod 4.4.x
zustand 5.0.x          vitest 4.1.x                 vite 8.2.x
```

Two compatibility notes that will bite otherwise:

* `@react-three/fiber` v9 requires **React 19**, not 18.
* Zod 4 changed error formatting. Use `z.prettifyError(err)`, not `err.format()`.

---

## Status

Pre-alpha. See `docs/ROADMAP.md`.
