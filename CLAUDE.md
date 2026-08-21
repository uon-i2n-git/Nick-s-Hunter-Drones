# CLAUDE.md

Standing instructions for Claude Code in this repository.

---

## What this is

A 3D browser drone game that showcases three drone classes sold by **Hunter Defence Drones**, a fictional company. The player is the prospective customer. It is a demo stand exhibit for the Hunter Defence Conference, one week out.

Design intent lives in `GAME_DESIGN.md`. All drone numbers live in `DRONE_SPECS.md`. Those two files are the source of truth for what the game is. Everything else is implementation.

---

## The deadline shapes every decision

We ship to a conference stand. That means:

* **If a feature is not visible in a 90 second booth session, do not build it.**
* Working and simple beats correct and elaborate. Every time.
* Never leave the repo in a state that cannot be demoed. The deployed build must always run.
* If something will take more than 20 minutes, build the simple version and say what you skipped.

---

## Stack

Vite, React, TypeScript, three.js, `@react-three/fiber`, `@react-three/drei`.

Physics is **hand written**. No physics engine. No Zod, no state library, no test framework, no lint config. Do not add a dependency without telling me first.

Note: `@react-three/fiber` v9 requires React 19, not 18.

---

## How to work

* Plan before implementing anything that touches more than one file. Show me the plan and wait.
* Do exactly the scope asked for. Do not build ahead. If you spot something worth doing that I did not ask for, list it at the end instead of doing it.
* Keep it readable. Do not build an abstraction for something done once.
* You cannot run the game or see the screen. For anything I cannot verify by reading code (feel, timing, physics), log measured numbers rather than telling me it works.
* End every non-trivial task with: what changed, what you are least happy with, and what is most likely to be broken.

---

## Conventions

* SI units throughout the simulation. Metres, kilograms, seconds, newtons, radians. Convert only at the UI edge.
* Three.js axes: `+Y` up, `-Z` forward at zero yaw, `+X` right.
* One unit is one metre. Keep world scale honest, a shipping container is 12 m long.
* Tuning values (masses, PID gains, tilt limits, drain rates) live in the drone definitions file, not scattered through the code.
* Commit style: `area: short imperative summary`.

---

## Deployment

The game deploys to GitHub Pages from `main` via GitHub Actions. Keep `base: './'` in the Vite config. There is also an offline single-file build for the conference laptop, because venue wifi fails.

Never merge something that breaks the deploy.

---

## Out of scope

Multiplayer. Accounts. Monetisation. Progression or unlocks, everything is available from the first click. Any depiction of harm to people. Real 3D model files, all meshes are built from primitives in code.

---

## Disclaimer that must stay in the game

Hunter Defence Drones is fictional and every specification is illustrative. This must remain visible on the drone selection screen.
