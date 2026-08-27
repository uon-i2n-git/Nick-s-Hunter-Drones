// The hangar / fleet selection screen. Layout, type scale, spacing and
// colours follow hangar-mockup.html, with live rotating 3D models in the
// hero slots. Ratings and stats are read from the drone definitions.
import { useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { DRONES, DRONE_ORDER, type DroneDef, type DroneId } from '../game/drones.ts'
import { SCENARIOS, type Mode, type SimConfig } from '../game/sim.ts'
import type { WeatherId } from '../game/weather.ts'
import { BUILDERS } from '../render/meshes.ts'

// unscaled mesh spans across the rotor discs — used to normalise hero size
const NATIVE_SPAN: Record<DroneId, number> = { kestrel: 0.53, clydesdale: 1.76, peregrine: 0.89 }

function Spinner({ id }: { id: DroneId }) {
  const obj = useMemo(() => {
    const g = BUILDERS[id]()
    g.scale.setScalar(0.55 / NATIVE_SPAN[id])
    return g
  }, [id])
  useFrame((_, dt) => {
    obj.rotation.y += 0.45 * dt
  })
  return <primitive object={obj} position={[0, -0.02, 0]} rotation={[0.12, 0, 0]} />
}

function Hero({ id }: { id: DroneId }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 30, position: [0.5, 0.3, 0.85], near: 0.01, far: 10 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 2]} intensity={3.4} color="#fff2dd" />
      <directionalLight position={[-3, 1.5, -3]} intensity={2.6} color="#7fa8dd" />
      <directionalLight position={[0, -2, 1]} intensity={0.7} color="#ff7a1a" />
      <Spinner id={id} />
    </Canvas>
  )
}

const ICONS: Record<string, string[]> = {
  weight: ['M3 17h18M6 17V9l6-5 6 5v8'],
  speed: [], // circle handled separately
  payload: ['M4 8h16l-2 12H6z', 'M9 8V5h6v3'],
  wind: ['M3 9h12a3 3 0 100-6', 'M3 15h15a3 3 0 110 6'],
}

function Icon({ kind, bars }: { kind: string; bars?: number }) {
  if (kind === 'battery') {
    const marks = ['M5 11v3', 'M9 11v3', 'M13 11v3'].slice(0, bars ?? 3)
    return (
      <svg className="ico" viewBox="0 0 24 24">
        <rect x="2" y="8" width="17" height="9" rx="2" />
        <path d="M21 11v3" />
        {marks.map((m) => (
          <path key={m} d={m} />
        ))}
      </svg>
    )
  }
  if (kind === 'speed') {
    return (
      <svg className="ico" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12l4-3" />
      </svg>
    )
  }
  if (kind === 'ability') {
    return (
      <svg className="ico" viewBox="0 0 24 24">
        <path d="M12 3l9 5-9 5-9-5z" />
        <path d="M3 13l9 5 9-5" />
      </svg>
    )
  }
  return (
    <svg className="ico" viewBox="0 0 24 24">
      {(ICONS[kind] ?? []).map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  )
}

function Column({ def, selected, onSelect }: { def: DroneDef; selected: boolean; onSelect: () => void }) {
  const batteryBars = def.id === 'kestrel' ? 3 : def.id === 'clydesdale' ? 2 : 1
  const stats: Array<{ kind: string; bars?: number; v: string; u: string; l: string }> = [
    { kind: 'weight', v: def.card.takeoffKg, u: 'kg', l: 'Takeoff Weight' },
    { kind: 'battery', bars: batteryBars, v: def.card.flightMin, u: 'min', l: 'Max Flight Time' },
    { kind: 'speed', v: def.card.topSpeed, u: 'm/s', l: 'Top Speed' },
    { kind: 'payload', v: def.card.payloadKg, u: 'kg', l: 'Payload' },
    { kind: 'wind', v: def.card.windTol, u: 'm/s', l: 'Wind Tolerance' },
    { kind: 'ability', v: def.card.ability, u: '', l: 'F · Ability' },
  ]
  const meters: Array<[string, number]> = [
    ['Speed', def.ratings.speed],
    ['Agility', def.ratings.agility],
    ['Endurance', def.ratings.endurance],
    ['Lift', def.ratings.lift],
    ['Wind', def.ratings.wind],
    ['Stealth', def.ratings.stealth],
  ]
  return (
    <section className={`col ${selected ? 'sel' : ''}`} onClick={onSelect}>
      <div className="hero">
        <div className="reflect" />
        <Hero id={def.id} />
      </div>
      <div className="tag">{def.cls}</div>
      <h2>{def.model}</h2>
      <p className="tagline">{def.tagline}</p>
      <div className="price">
        ${def.priceAUD.toLocaleString('en-AU')}
        <small>AUD</small>
      </div>
      <hr />
      <div className="stats">
        {stats.map((s) => (
          <div key={s.l} className="stat">
            <Icon kind={s.kind} bars={s.bars} />
            <div>
              <div className="v">
                {s.v}
                {s.u && <u>{s.u}</u>}
              </div>
              <div className="l">{s.l}</div>
            </div>
          </div>
        ))}
      </div>
      <hr />
      <ul className="sells">
        {def.card.sells.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <hr />
      <div className="meters">
        {meters.map(([label, v]) => (
          <div key={label} className="meter">
            <span>{label}</span>
            <div className="track">
              <div className="fill" style={{ width: `${v * 20}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button className="select">{selected ? 'Selected' : 'Select'}</button>
    </section>
  )
}

interface Props {
  cfg: SimConfig
  setCfg: (c: SimConfig) => void
  onLaunch: () => void
}

export function Hangar({ cfg, setCfg, onLaunch }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = DRONE_ORDER.indexOf(cfg.drone)
      if (e.key === 'ArrowRight') setCfg({ ...cfg, drone: DRONE_ORDER[(i + 1) % 3] })
      if (e.key === 'ArrowLeft') setCfg({ ...cfg, drone: DRONE_ORDER[(i + 2) % 3] })
      if (e.key === 'Enter') onLaunch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cfg, setCfg, onLaunch])

  const modes: Array<[Mode, string]> = [
    ['free', 'Demo'],
    ['race', 'Race'],
    ['intercept', 'Intercept'],
  ]
  const scenarios = SCENARIOS[cfg.mode]
  const activeScenario = scenarios.find((sc) => sc.id === cfg.scenario) ?? scenarios[0]
  const weathers: Array<[WeatherId, string]> = [
    ['clear', 'Clear'],
    ['gusty', 'Gusty Southerly'],
  ]

  return (
    <div className="hangar">
      <header>
        <div className="brand">
          <span className="brandmark" />
          <b>Hunter Defence Drones</b>
          <span>Flight Ops · Fleet Selection</span>
        </div>
        <div className="sysline">
          <span className="livechip"><i className="livedot" />Live Demo</span>
          Newcastle Harbour · <i>Systems Nominal</i>
        </div>
      </header>

      <main className="grid3">
        {DRONE_ORDER.map((id) => (
          <Column
            key={id}
            def={DRONES[id]}
            selected={cfg.drone === id}
            onSelect={() => setCfg({ ...cfg, drone: id })}
          />
        ))}
      </main>

      <footer>
        <div className="modeblurb">{activeScenario.blurb}</div>
        <div className="bar">
          <div className="group">
            <label>Mode</label>
            <div className="seg">
              {modes.map(([m, label]) => (
                <button
                  key={m}
                  className={cfg.mode === m ? 'on' : ''}
                  onClick={() => setCfg({ ...cfg, mode: m, scenario: SCENARIOS[m][0].id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="group">
            <label>Scenario</label>
            <div className="seg">
              {scenarios.map((sc) => (
                <button key={sc.id} className={activeScenario.id === sc.id ? 'on' : ''} onClick={() => setCfg({ ...cfg, scenario: sc.id })}>
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <div className="group">
            <label>Conditions</label>
            <div className="seg">
              {weathers.map(([w, label]) => (
                <button key={w} className={cfg.weather === w ? 'on' : ''} onClick={() => setCfg({ ...cfg, weather: w })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="start" onClick={onLaunch}>
            Launch
          </button>
        </div>
        <div className="disclaimer split">
          <span>
            Hunter Defence Drones is a fictional company. All specifications are illustrative and are not performance
            guarantees.
          </span>
          <span className="keyhint">← → aircraft · ENTER launch</span>
        </div>
      </footer>
    </div>
  )
}
