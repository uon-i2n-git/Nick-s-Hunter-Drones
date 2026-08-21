# Drone Specifications

> **Disclaimer.** Hunter Defence Drones is a fictional company created for this demonstration. Every figure below is an illustrative product specification for game balance and marketing demonstration purposes. Nothing here is a certified performance guarantee. This notice must remain visible in the in game hangar.

---

## The trade off triangle

```
                 SPEED / AGILITY
                    HD-3 Peregrine
                        ▲
                       ╱ ╲
                      ╱   ╲
                     ╱     ╲
                    ╱       ╲
   ENDURANCE ◄─────╱─────────╲─────► LIFT / STABILITY
   HD-1 Kestrel                      HD-2 Clydesdale
```

No airframe wins everywhere. That is the sales message and it is also the game balance.

---

## HD-1 Kestrel · Recon class

*"It is already halfway back before the others have finished climbing."*

| Specification | Value |
|---|---|
| Maximum take off mass | 1.9 kg |
| Dry mass | 1.4 kg |
| Payload capacity | 0.5 kg |
| Thrust to weight (empty) | 3.2 : 1 |
| Top speed (sport) | 24 m/s (86 km/h) |
| Cruise speed | 14 m/s |
| Endurance (nominal) | 42 min |
| Endurance (loaded, 8 m/s wind) | 29 min |
| Service ceiling | 4,000 m |
| Wind tolerance | 12 m/s sustained, 16 m/s gust |
| Rotor diameter | 0.18 m, quad |
| Acoustic signature at 50 m | 42 dB(A) |
| Sensors | 4K EO gimbal, 640 px thermal, laser rangefinder, RTK GNSS |
| Data link range | 12 km |
| Indicative price | AUD $18,400 |

**Flight character.** Light and immediate. Low rotational inertia, fast motor response, minimal overshoot. Feels like it is on rails until the wind picks up, at which point its low mass shows and it gets pushed around.

**In game abilities**

| Key | Ability | Effect |
|---|---|---|
| `F` | Sensor sweep | 60 degree cone, 400 m range, tags contacts and survey targets, 4 s cooldown |
| `G` | Mark and photograph | Captures the current target for the mission log, requires the target centred for 1.5 s |
| `V` | Loiter lock | Holds a fixed orbit around a marked point while the camera stays trained on it, frees the player to read the map |

**Sales talking points**

* Longest time on task in the fleet, by a wide margin
* Quietest airframe, suitable for wildlife survey, urban work and any job with a noise complaint attached
* One person, one backpack, no launch equipment
* Cheapest entry point into the fleet and the natural first purchase

**Weaknesses to make the player feel.** Half a kilo is not much. Any real payload job ends in a refusal. In an 11 m/s southerly the drift is constant and the endurance figure falls off a cliff.

---

## HD-2 Clydesdale · Payload class

*"It will not win a race. It will finish the job in weather that grounded everything else."*

| Specification | Value |
|---|---|
| Maximum take off mass | 24 kg |
| Dry mass | 14 kg |
| Payload capacity | 8 kg (winch rated to 6 kg) |
| Thrust to weight (empty) | 1.9 : 1 |
| Top speed (sport) | 16 m/s (58 km/h) |
| Cruise speed | 11 m/s |
| Endurance (unloaded) | 28 min |
| Endurance (8 kg payload) | 14 min |
| Service ceiling | 3,000 m |
| Wind tolerance | 18 m/s sustained, 24 m/s gust |
| Rotor diameter | 0.56 m, coaxial hex |
| Acoustic signature at 50 m | 68 dB(A) |
| Sensors | 4K EO gimbal, downward lidar, load cell, obstacle avoidance array |
| Payload systems | 15 m powered winch, quick release cargo hook, active swing damping |
| Data link range | 8 km |
| Indicative price | AUD $94,900 |

**Flight character.** Heavy, deliberate and utterly unbothered. High rotational inertia, slow motor response, long stopping distance. Plan your stops early. In return, a gust that flips a Kestrel barely registers.

**In game abilities**

| Key | Ability | Effect |
|---|---|---|
| `F` | Winch deploy / retract | Pays out cable, package swings with real pendulum physics, ground crew can unhook when it is within 1 m and under 0.5 m/s |
| `G` | Cargo hook release | Instant drop, accuracy scored against the target circle |
| `V` | Load balance assist | Active swing damping, costs battery, halves pendulum amplitude within 3 s |

**Sales talking points**

* Eight kilograms, fifteen kilometres, in weather that stops the competition
* Winch delivery means no landing site required, which is the whole argument for flood, marine and rooftop work
* Highest wind tolerance in the fleet
* Load cell telemetry gives a compliance record for every delivery

**Weaknesses to make the player feel.** The endurance halves under load and the player watches it happen on the HUD. It is slow. It is loud. It is expensive. In tight urban geometry its size becomes the enemy.

---

## HD-3 Peregrine · Interceptor class

*"From alert to intercept in under forty seconds."*

| Specification | Value |
|---|---|
| Maximum take off mass | 4.6 kg |
| Dry mass | 3.4 kg |
| Payload capacity | 1.2 kg (net launcher and reload) |
| Thrust to weight (empty) | 6.5 : 1 |
| Top speed (boost) | 48 m/s (173 km/h) |
| Cruise speed | 22 m/s |
| Endurance (patrol) | 18 min |
| Endurance (sustained boost) | 6 min |
| Service ceiling | 5,000 m |
| Wind tolerance | 22 m/s sustained, 28 m/s gust |
| Rotor diameter | 0.28 m, quad, high pitch |
| Acoustic signature at 50 m | 74 dB(A) under boost |
| Sensors | Ka band radar (2 km), RF direction finder, 4K EO, thermal |
| Effectors | Net launcher (3 shots), non lethal RF disruptor |
| Data link range | 15 km |
| Indicative price | AUD $138,000 |

**Flight character.** Violent. Enormous thrust to weight, aggressive rate limits, and it will bleed the battery in minutes if the player abuses the boost. Rewards planning an intercept rather than chasing.

**In game abilities**

| Key | Ability | Effect |
|---|---|---|
| `F` | Net launcher | Projectile with lead time, 40 m effective range, 3 shots, capture disables the contact and brings it down under a parachute |
| `G` | RF disruptor | 90 degree cone, 120 m, forces a contact into its return to home behaviour, 12 s cooldown, high energy cost |
| `V` | Pursuit lock | Camera and radar track the nearest contact, HUD shows an intercept solution and a closing rate |

**Sales talking points**

* Fastest response time in the fleet, measured from alert to capture
* Non lethal capture keeps the intruding aircraft intact as evidence
* Radar and RF direction finding work in fog, dust and darkness where cameras do not
* Layered response: disrupt first, capture only when necessary

**Weaknesses to make the player feel.** Eighteen minutes, and six if you fly it the way you want to. Three net shots. Expensive. Useless for survey work and useless for lifting anything.

---

## Optional modules (purchasable)

| Module | Fits | Effect | Price |
|---|---|---|---|
| Extended battery | Kestrel, Peregrine | +28 per cent endurance, +18 per cent mass | $2,200 |
| Thermal gimbal upgrade | all | Doubles thermal range and identification confidence | $6,800 |
| Quiet propellers | Kestrel | Minus 6 dB, minus 8 per cent top speed | $900 |
| Heavy winch | Clydesdale | 25 m cable, 8 kg rated, +1.1 kg mass | $7,400 |
| Radar pod | Kestrel | Adds 800 m radar, +0.4 kg, minus 15 per cent endurance | $11,500 |
| Net reload pack | Peregrine | +3 net shots, +0.5 kg | $3,100 |
| Weatherproofing kit | all | Rain mass accumulation halved, wind tolerance +2 m/s | $4,300 |

---

## Comparison table for the hangar UI

| | HD-1 Kestrel | HD-2 Clydesdale | HD-3 Peregrine |
|---|---|---|---|
| Speed | ●●●○○ | ●●○○○ | ●●●●● |
| Agility | ●●●●○ | ●○○○○ | ●●●●● |
| Endurance | ●●●●● | ●●○○○ | ●●○○○ |
| Lift | ●○○○○ | ●●●●● | ●●○○○ |
| Wind tolerance | ●●○○○ | ●●●●○ | ●●●●● |
| Stealth | ●●●●● | ●○○○○ | ●●○○○ |
| Sensors | ●●●●○ | ●●●○○ | ●●●●● |
| Value | ●●●●● | ●●●○○ | ●●○○○ |

These ratings must be derived from the part JSON at build time, not hand written into the UI, so the card can never drift away from the flight model.
