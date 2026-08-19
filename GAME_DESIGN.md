# Game Design: Nick's Hunter Drones Flight Ops

---

## 1. The pitch in one paragraph

You are a newly appointed operations lead for a Hunter region client. Nick's Hunter Drones has loaned you a demonstration fleet for a fortnight. Three aircraft, three very different personalities, one increasingly demanding job board. Fly the work, discover which airframe suits which problem and walk away knowing exactly what you would buy.

---

## 2. Design pillars

1. **Every mechanic is a spec sheet in disguise.** Endurance is not a number on a card, it is a battery bar draining while you are still 800 m from the survey grid.
2. **Simple to start, layered to master.** Space to lift off and you are flying inside five seconds. Sport mode, manual attitude and wind cheating are all there for the person who wants them.
3. **The differences must be felt, not read.** If a player cannot tell the Kestrel from the Clydesdale blindfolded in the first three seconds of flight, the flight model has failed.
4. **Three minutes to a moment.** A booth visitor should hit something memorable inside three minutes: a net capture, a winch drop through a gale, a checkpoint run in fog.
5. **Never lie about the product.** Every capability shown maps to a stated spec. Numbers are marketing illustrations and are labelled as such.

---

## 3. The customer loop

```
   HANGAR  ──►  CONTRACT BOARD  ──►  BRIEFING  ──►  FLY  ──►  CAPABILITY REPORT
      ▲                                                              │
      └──────────────  credits, unlocks, upgrades  ◄─────────────────┘
```

* **Hangar.** Rotate the airframe, read the spec card, compare any two drones side by side, fit optional modules, change the paint.
* **Contract board.** Jobs from Hunter region operators. Each job lists a recommended class. You may attempt any job in any airframe and the game will let you fail in an instructive way.
* **Briefing.** Objectives, weather forecast, wind rose, recommended loadout, a single "Why this drone" line.
* **Fly.** The actual mission.
* **Capability report.** Post mission screen framed as a customer facing summary: time on task, energy used, payload delivered, contacts identified, an efficiency grade, and the one line "the HD-2 Clydesdale did this because…". A soft call to action sits at the bottom (request a quote, book a demo, download the spec sheet as PDF).

---

## 4. Modes

### 4.1 Flight School (tutorial, roughly 4 minutes)
Five short stages on the apron at the Newcastle depot: lift and hold, translate and stop, yaw around a mast, altitude hold in a breeze, land on the pad. Teaches every key it needs and nothing more. Skippable, replayable from the hangar.

### 4.2 Mission mode (the spine)
Three mission families, one per class, escalating in difficulty. See section 6.

### 4.3 Race mode: The Hunter Circuit
Checkpoint racing through gates. Three courses per environment, each with a class recommendation. Weather is a first class modifier and each course has a Clear, Adverse and Extreme variant. Ghost replay of your best run. A leaderboard local to the machine, which is exactly what a trade show booth wants.

### 4.4 Free flight
Sandbox in any environment with a weather slider, no objectives. Useful for sales staff demonstrating live.

### 4.5 Compare bench
Two drones, one test rig, identical inputs. Side by side split screen showing acceleration runs, hover endurance, wind rejection and payload lift. This is the "show me the difference" button for a sceptical buyer.

---

## 5. Controls

Design intent: **space bar plus a handful of keys**. Everything essential is reachable without moving your left hand.

### Core flight (all classes)

| Input | Action |
|---|---|
| `Space` hold | Throttle up / climb |
| `Left Ctrl` or `C` | Descend |
| `W` / `S` | Pitch forward / back (translate) |
| `A` / `D` | Roll left / right (translate) |
| `Q` / `E` | Yaw left / right |
| `Left Shift` hold | Sport mode, higher tilt limit and full power |
| `Alt` hold | Precision mode, halved rates for delicate work |
| `H` | Toggle altitude hold |
| `R` | Return to home, hold 1 s to confirm |
| `Tab` | Cycle camera: chase, FPV, orbit, ground observer |
| `M` | Mission and map overlay |
| `Esc` | Pause |

Mouse look is available in orbit and FPV cameras. Gamepad is supported with the same verb set on the standard twin stick mapping.

### Class abilities

| Key | HD-1 Kestrel | HD-2 Clydesdale | HD-3 Peregrine |
|---|---|---|---|
| `F` primary | Sensor sweep, tags contacts in the cone | Winch deploy / retract | Net launcher |
| `G` secondary | Mark and photograph target | Cargo hook release | RF disruptor pulse |
| `V` tertiary | Loiter lock on marked point | Load balance assist | Pursuit lock on nearest contact |

Every ability has a cooldown and an energy cost, both read from the part definitions, both shown on the HUD.

### Accessibility
Full key rebinding, hold to toggle conversion for every hold action, colour blind safe HUD palette, a "stabilised" assist level that removes attitude management entirely, subtitles for all radio chatter and no requirement for precise timing under 300 ms.

---

## 6. Missions

Each family has five contracts. Objectives are composable so new contracts are data, not code.

### 6.1 Recon family (HD-1 Kestrel)
1. **Powerline sweep, Maitland.** Fly a corridor, photograph six insulators, return with over 30 per cent battery.
2. **Vineyard health survey, Pokolbin.** Cover a survey grid at fixed altitude. Coverage percentage scored, morning fog rolls in on a timer.
3. **Surf rescue spot, Merewether.** Locate a swimmer in swell, hold a loiter lock and relay position to the lifeguard. Wind gusts from the south.
4. **Harbour night watch, Newcastle.** Identify and classify six vessel contacts in darkness on thermal. Do not be detected by the two patrol contacts.
5. **Bushfire ridge recon.** Thermal turbulence, reduced visibility, hot air degrades lift. Map a fire edge and get out before endurance runs down.

### 6.2 Payload family (HD-2 Clydesdale)
1. **Depot to substation.** Deliver a 4 kg part to a marked pad. Land within the 3 m circle.
2. **Winch drop, Stockton Beach.** Hover at 20 m over dunes in crosswind, winch a package to a ground crew without swinging it into a vehicle.
3. **Roof survey resupply, Newcastle CBD.** Urban canyon with gusty channelled wind and a tight approach between buildings.
4. **Flood resupply, Hunter River.** Rain, reduced visibility, three drop points, one battery. Route planning matters.
5. **Heavy lift, coal terminal.** 8 kg at the mass limit. Every input is sluggish. Teaches respect for the payload curve.

### 6.3 Interceptor family (HD-3 Peregrine)
1. **Perimeter alert.** A single slow contact crosses the fence line. Identify, close, capture with the net.
2. **Two contacts, one net.** Prioritise. The second must be driven off with the RF disruptor.
3. **Evasive contact.** The target actively evades using a simple pursuit avoidance behaviour. Speed alone will not do it.
4. **Swarm probe.** Four contacts, staggered arrival, a protected asset behind you. Scored on asset integrity, not kills.
5. **Night intercept in a southerly.** Everything at once. This is the showpiece for the booth screen.

### 6.4 Objective types (data driven)
`reach_waypoint`, `photograph_target`, `cover_area`, `hold_loiter`, `deliver_payload`, `winch_deliver`, `identify_contact`, `capture_contact`, `deny_contact`, `survive_duration`, `return_home`, `avoid_detection`, `stay_under_altitude`, `stay_within_geofence`.

Each contract is a JSON file listing objectives with success and failure conditions. See `docs/CONTENT_SCHEMA.md`.

---

## 7. Racing

* **Gates** are toruses with a directional normal. Passing through in the wrong direction does not count and the HUD says so.
* **Course types:** sprint (point to point), circuit (three laps), slalom (tight gates, low speed, precision), endurance (long, battery managed).
* **Scoring:** total time, plus penalties for missed gates, minus a bonus for clean lines. Medals at bronze, silver and gold thresholds stored per course per weather variant.
* **Class balance:** each course publishes a par time for each class. The Peregrine wins sprints. The Kestrel wins endurance courses because it is still flying when the others are on the deck. The Clydesdale wins slalom in high wind because it barely notices the gusts. This is the whole point of racing being in the game.
* **Ghosts** are recorded input tapes replayed through the deterministic sim, which is cheap to store and exact.

---

## 8. Weather

Weather is a first class system with real effects on the flight model, not a fog shader.

| Preset | Wind mean | Gust | Visibility | Notes |
|---|---|---|---|---|
| Clear | 0 to 2 m/s | none | 8 km | Baseline |
| Coastal breeze | 6 m/s NE | light | 8 km | Steady lateral drift, teaches crabbing |
| Gusty southerly | 11 m/s S | strong, 3 to 7 s period | 5 km | Sudden attitude upsets |
| Rain | 8 m/s | moderate | 1.5 km | Added mass, sensor range down 40 per cent, camera droplets |
| Valley fog | 2 m/s | none | 150 m | Instrument flying, altitude hold becomes essential |
| Night | varies | varies | limited | Thermal and low light sensors matter |
| Thermal turbulence | 4 m/s | chaotic vertical | 6 km | Hot air, reduced lift, updraughts and downdraughts |
| Dust and smoke | 9 m/s | moderate | 600 m | Optical sensors degrade, radar does not |

Model:
* a base wind vector with altitude shear (stronger higher up)
* Perlin driven gust field sampled at the drone position
* local modifiers baked into environments: rotor turbulence behind buildings, ridge lift on the escarpment, sea breeze convergence at the coast
* air density from temperature and altitude, which scales rotor thrust
* precipitation adds mass and drag and degrades the optical sensor range

Every weather effect surfaces on the HUD wind rose so the player learns to read it.

---

## 9. Environments

| Environment | Used by |
|---|---|
| Newcastle Harbour and the working port | recon night watch, urban racing |
| Hunter River flats and Maitland | powerline sweep, flood resupply |
| Stockton Beach dunes | winch work, open racing |
| Pokolbin vineyards | survey grids, fog |
| Coal terminal and industrial yard | heavy lift, slalom racing |
| Escarpment and bushfire ridge | thermal turbulence, endurance racing |

Build one environment properly for the vertical slice (Newcastle Harbour) and reuse it across all three mission families before making a second.

---

## 10. Progression and the sales layer

* **Credits** earned per contract. Spend on unlocking the next airframe and on optional modules (extended battery, thermal gimbal, heavy winch, radar pod, quiet propellers).
* **Unlock order:** Kestrel free, Clydesdale after three recon contracts, Peregrine after three payload contracts. A "Demo all three now" button in the hangar bypasses this for booth use, because a visitor with 90 seconds must not be gated.
* **Spec sheet unlocks.** Every contract you complete fills in another row of that drone's spec card, so the card is a record of what you personally proved it could do.
* **Capability report export.** A shareable summary card at the end of a session, showing the missions flown and the aircraft used. This is the artefact a sales rep emails the next morning.

---

## 11. HUD

Minimal by default, expandable with `M`.

* Attitude indicator and heading strip
* Altitude AGL, vertical speed, ground speed
* Battery percentage with a **time to return home** figure, which is the single most persuasive number in the game
* Wind rose showing direction and current gust strength
* Payload or ability status for the current class
* Objective tracker, three lines maximum
* Signal strength and distance to home

---

## 12. Audio

Rotor pitch driven by RPM per class, and the three classes must sound distinct: the Kestrel a light insect whine, the Clydesdale a low chest thumping beat, the Peregrine an aggressive rising snarl under boost. Wind noise scales with airspeed. Radio chatter with an Australian voice for the briefings. A quiet propellers module audibly reduces the signature, which is a feature you can sell with a slider.

---

## 13. Failure states

Battery exhausted, ground impact above the survivable descent rate, geofence breach, payload lost, mission timer expired, aircraft lost beyond signal range. Every failure gives a one line diagnosis and an instant retry. Never punish a booth visitor with a loading screen.

---

## 14. Out of scope

Weapons beyond the non lethal net and RF disruptor. Any depiction of harm to people. Multiplayer. Real world airspace regulation simulation, though the geofence mechanic nods at it. Monetisation.
