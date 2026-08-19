# Nick's Hunter Drones: Flight Ops

A 3D browser drone game that doubles as a product showcase for **Nick's Hunter Drones**, a fictional drone manufacturer. Built as a stand exhibit for the Hunter Defence Conference.

The player is not a pilot fantasy character. The player is **the customer**. Three aircraft, three very different jobs, and by the end they know which one they would buy.

| Class | Airframe | Sells on |
|---|---|---|
| Recon | **HD-1 Kestrel** | endurance, sensors, low noise |
| Payload | **HD-2 Clydesdale** | lift, winch precision, wind tolerance |
| Interceptor | **HD-3 Peregrine** | speed, agility, counter-UAS capability |

---

## Play it

**Live:** https://uon-i2n-git.github.io/Nick-s-Hunter-Drones/

Click once on the page to give it keyboard focus, then fly.

**Locally:**

```bash
npm install
npm run dev
```

**Offline build for the conference laptop:**

```bash
npm run build:offline
```

Produces a single self-contained `index.html` that runs by double-clicking, with no server and no internet.

---

## Controls

| Key | Action |
|---|---|
| `Space` | Climb |
| `Ctrl` | Descend |
| `W` `A` `S` `D` | Translate |
| `Q` `E` | Yaw |
| `Shift` | Boost |
| `Tab` | Cycle camera |
| `F` | Drone ability |
| `R` | Restart |
| `Esc` | Menu |

---

## Stack

Vite, React, TypeScript, three.js via React Three Fiber. Physics is hand written, no engine. Deployed to GitHub Pages via Actions.

---

## Docs

* `GAME_DESIGN.md` — what the game is: modes, missions, weather, the sales loop
* `DRONE_SPECS.md` — the three airframes, stat blocks and talking points. Source of truth for all in-game numbers
* `CLAUDE.md` — working instructions for Claude Code

---

## Disclaimer

Nick's Hunter Drones is a fictional company created for this demonstration. Every specification in this repository is illustrative and is not a performance guarantee.
