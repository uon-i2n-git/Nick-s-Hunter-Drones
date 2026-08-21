# Game Design: Hunter Defence Drones Flight Ops

**Scope: a stand exhibit for the Hunter Defence Conference.** This document describes exactly what gets built, and nothing beyond it. If something is not in here, it is not in the game.

---

## 1. The pitch

You are the customer. Hunter Defence Drones hands you three very different aircraft and a harbour to fly them in. Within a couple of minutes you have felt the trade-offs for yourself and you know which one you would buy.

---

## 2. Design pillars

1. **Every mechanic is a spec sheet in disguise.** Endurance is not a number on a card, it is a battery bar draining while you are still a long way from home.
2. **Space bar and go.** A visitor is flying within five seconds of sitting down, with no instruction.
3. **The differences must be felt, not read.** If a player cannot tell the Kestrel from the Clydesdale within three seconds, the flight model has failed.
4. **Ninety seconds to a moment.** A booth visitor should hit something memorable fast: a net capture, a clean gate run, a fight with the wind.
5. **Never lie about the product.** Every capability shown maps to a stated spec, and the specs are labelled as illustrative.

---

## 3. The loop

```
   HANGAR  ──►  FLY  ──►  CAPABILITY REPORT  ──►  HANGAR
```

No progression, no credits, no unlocks. Everything is available from the first click, because a visitor with ninety seconds must never be gated.

---

## 4. The three drones

Full numbers in `DRONE_SPECS.md`. In feel:

| | Character | Ability (F) |
|---|---|---|
| **HD-1 Kestrel** (Recon) | light, nimble, long battery, shoved around by wind | sensor sweep, a cone pulse that tags and outlines contacts |
| **HD-2 Clydesdale** (Payload) | heavy, slow to start and stop, unbothered by wind | release the cargo crate, which falls and lands |
| **HD-3 Peregrine** (Interceptor) | very fast, twitchy, short battery | net launcher, capture a target and it parachutes down |

**Battery is compressed roughly 10x** against the real spec figures, so endurance actually matters inside a short session. Kestrel about four minutes, Clydesdale two and a half, Peregrine ninety seconds and far less under boost. Drain scales with power draw.

---

## 5. Controls

| Input | Action |
|---|---|
| `Space` | Climb |
| `Ctrl` | Descend |
| `W` `A` `S` `D` | Translate |
| `Q` `E` | Yaw |
| `Shift` | Boost |
| `Tab` | Cycle camera |
| `F` | Drone ability |
| `R` | Restart |
| `H` | Show controls card |
| `Esc` | Menu |

Altitude hold is on by default so a first-timer cannot fall out of the sky. A controls card shows on entering flight and fades after six seconds.

---

## 6. Modes

### Free flight
No objectives, no timer, no failure. Any drone, either weather preset, the whole harbour to yourself. The `F` ability works.

This is the sales rep's mode. It is what you switch to when a buyer wants to see the Clydesdale hold station in the southerly, or watch the Peregrine's net launcher, without a mission getting in the way. It is also the softest landing for a nervous first-time player.

Battery still drains, and running flat returns to the hangar with a capability report, so even the sandbox makes the endurance point.

### Race
Eight glowing ring gates, radius 6 m, three laps. Direction checked, so passing through backwards does not count. Live timer, per-lap splits, next gate highlighted brightly and the one after dimly, a floating arrow when the next gate is off screen. Three second penalty for a missed gate. Bronze, silver and gold thresholds.

The course is not a flat oval: start on a wharf, out low over the water, climb to 60 m around a crane, descend between two container stacks, a tight 180 at the far end, back through the wharf gap to the finish. Gates 80 to 150 m apart, altitudes between 8 and 60 m.

Each drone has its own par time, and they should not all favour the same aircraft.

### Intercept
Two enemy drones on looping patrol paths between 40 and 80 m. One slow and predictable, one faster that turns away and climbs when you close within 80 m. Capture both with the Peregrine's net. Radar-style contact markers on the HUD with range and closing rate. On capture, a parachute deploys and the target descends to the water.

Ends when both are captured or the battery runs out.

---

## 7. Weather

Two presets, chosen in the menu.

| | Wind | Look |
|---|---|---|
| **Clear** | none | bright sun, 8 km visibility |
| **Gusty southerly** | 11 m/s from the south, plus gusts of ±6 m/s on a 3 to 7 second period | darker sky, heavier fog, whitecaps, drifting spray |

Wind feeds the drag calculation as relative airspeed. The handling difference must be immediately obvious, and the Clydesdale must visibly cope better than the Kestrel. This is the clearest demonstration of a real product difference in the whole game.

---

## 8. Environment

One low-poly working harbour, Newcastle in character. Water plane with gentle animated normals, three wharves, four cranes, roughly sixty instanced shipping containers in stacks, a few moored hulls, and a city skyline of instanced boxes about 900 m out. Playable area roughly 1200 x 1200 m with a soft geofence.

One unit is one metre and scale must be honest: a container is 12 m long, a crane 45 m tall, buildings 25 to 90 m.

---

## 9. Screens

### Hangar / selection
The most important screen in the game, because it is the sales pitch and the only place a visitor reads a price.

Selected drone rotating slowly in 3D on a dark studio backdrop with a soft ground reflection and a rim light. Three cards along the bottom, each showing class and model, tagline, AUD price prominently, top speed, endurance, payload, wind tolerance, six rating bars (speed, agility, endurance, lift, wind, stealth), the F ability and three short "sells on" bullets. Rating bars animate when switching drones so the trade-offs are visible at a glance.

Below that: mode select, weather select, START.

Footer, small: *Hunter Defence Drones is a fictional company. All specifications are illustrative.*

**Visual language:** dark, technical, defence-industry. Near-black background `#07090C`, panels `#10151B`, borders `#1E2731`, text `#C8D1DA`, muted `#6B7885`, accent `#FF7A1A`. Monospace for numbers and labels, clean sans for headings, uppercase wide-tracked labels, thin 1px borders. No rounded bubbles, no drop shadows, no gradients beyond a subtle vignette. It should read as a product configurator, not a video game menu.

### HUD
Altitude AGL, ground speed, battery percent with a time-to-home figure, wind arrow rose, objective text (two lines maximum), ability cooldown, and a warning when the descent rate is dangerous.

### Capability report
The results screen, framed as a customer-facing summary: drone flown, time on task, energy used, objectives completed, race time and medal where relevant, and one generated line on what that airframe did well. Buttons: Retry, Change Drone, Main Menu.

---

## 10. Failure

Crashing (ground contact above 6 m/s descent) flashes red, tumbles briefly and auto-respawns after 1.5 seconds. Battery exhaustion ends the run and shows the report. There is never a game-over screen and never a loading screen. `Esc` always reaches the menu, `R` always restarts.

---

## 11. Not in this build

Listed so nobody builds them by accident: missions beyond the two above, additional environments, additional weather presets, flight school, progression, credits, purchasable modules, the compare bench, audio design, key rebinding, gamepad support, multiplayer, ghost replays, external 3D model files.

An attract loop (idle camera tour after 60 seconds) is the one nice-to-have worth adding if there is time, because an empty stand showing a static menu is a stand nobody approaches.
