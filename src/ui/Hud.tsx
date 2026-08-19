// In-flight HUD. Data arrives ~10 Hz from the game scene; pure DOM, styled
// with the product-configurator visual language.
import { fmtClock, fmtTime } from '../game/sim.ts'

export interface ContactInfo {
  id: string
  label: string
  bearing: number // rad, relative to heading
  range: number
  closing: number // m/s, positive = getting closer
  captured: boolean
}

export interface RaceHud {
  started: boolean
  finished: boolean
  time: number
  lap: number
  laps: number
  nextGate: number
  gates: number
  lastLap: number | null
  goldTime: number
  gateDist: number
}

export interface HudData {
  agl: number
  speed: number
  vspeed: number
  heading: number
  batteryPct: number
  timeLeftS: number
  timeToHomeS: number
  lowBatt: boolean
  windSpeed: number
  windRel: number // rad
  objective: string
  message: string
  wrongWay: boolean
  tumbling: boolean
  descentWarn: boolean
  fenceWarn: boolean
  boost: boolean
  landed: boolean
  flash: boolean
  droneModel: string
  ability: { label: string; ready: boolean; frac: number; detail: string }
  race: RaceHud | null
  contacts: ContactInfo[] | null
  camLabel: string
}

const R2D = 180 / Math.PI

export function Hud({ d }: { d: HudData }) {
  return (
    <div className="hud">
      {/* top left: objective */}
      <div className="hud-obj">
        <div className="hud-label">{d.droneModel} · OBJECTIVE</div>
        <div className="hud-obj-text">{d.objective}</div>
      </div>

      {/* top centre: race block / messages */}
      <div className="hud-top-centre">
        {d.race && (
          <div className="hud-race">
            <div className="hud-race-time">{d.race.started ? fmtTime(d.race.time) : '0:00.0'}</div>
            <div className="hud-race-sub">
              LAP {Math.min(d.race.lap + 1, d.race.laps)}/{d.race.laps} · GATE {d.race.nextGate + 1}/{d.race.gates} ·{' '}
              {Math.round(d.race.gateDist)} M
            </div>
            <div className="hud-race-sub muted">
              {d.race.lastLap !== null ? `LAST LAP ${fmtTime(d.race.lastLap)} · ` : ''}GOLD {fmtClock(d.race.goldTime)}
            </div>
          </div>
        )}
        {d.wrongWay && <div className="hud-warn-big">WRONG WAY — GATE NOT COUNTED</div>}
        {d.message && <div className="hud-msg">{d.message}</div>}
        {d.tumbling && <div className="hud-warn-big">AIRFRAME LIMIT EXCEEDED</div>}
        {!d.tumbling && d.descentWarn && <div className="hud-warn-big">SINK RATE</div>}
        {d.fenceWarn && <div className="hud-warn-big warn-amber">RANGE LIMIT — TURN BACK</div>}
      </div>

      {/* top right: wind rose */}
      <div className="hud-wind">
        <div className="wind-rose">
          <div className="wind-n" style={{ transform: `rotate(${-d.heading * R2D}deg)` }}>
            <span>N</span>
          </div>
          {d.windSpeed > 0.5 && (
            <div className="wind-arrow" style={{ transform: `rotate(${d.windRel * R2D}deg)` }}>
              ↓
            </div>
          )}
        </div>
        <div className="hud-label centered">
          WIND {d.windSpeed < 0.5 ? 'CALM' : `${d.windSpeed.toFixed(0)} M/S`}
        </div>
      </div>

      {/* bottom left: flight numbers */}
      <div className="hud-flight">
        <div className="hud-num-block">
          <div className="hud-num">{Math.max(0, d.agl).toFixed(0)}<u>m</u></div>
          <div className="hud-label">ALT AGL</div>
        </div>
        <div className="hud-num-block">
          <div className="hud-num">{d.speed.toFixed(0)}<u>m/s</u></div>
          <div className="hud-label">GND SPEED{d.boost ? ' · BOOST' : ''}</div>
        </div>
        <div className="hud-num-block">
          <div className={`hud-num ${d.vspeed < -5 ? 'bad' : ''}`}>
            {d.vspeed > 0 ? '+' : ''}{d.vspeed.toFixed(1)}<u>m/s</u>
          </div>
          <div className="hud-label">V/S</div>
        </div>
      </div>

      {/* bottom centre: battery */}
      <div className={`hud-batt ${d.lowBatt ? 'low' : ''}`}>
        <div className="batt-bar">
          <div className="batt-fill" style={{ width: `${d.batteryPct}%` }} />
        </div>
        <div className="batt-row">
          <span>BATT {d.batteryPct.toFixed(0)}%</span>
          <span>ENDURANCE {fmtClock(d.timeLeftS)}</span>
          <span className={d.lowBatt ? 'bad' : ''}>T-HOME {fmtClock(d.timeToHomeS)}</span>
        </div>
      </div>

      {/* bottom right: ability + radar */}
      <div className="hud-right">
        {d.contacts && (
          <div className="radar">
            <div className="radar-ring" />
            {d.contacts.map((c) => {
              const r = Math.min(1, c.range / 400) * 44
              const x = 50 + Math.sin(c.bearing) * r
              const y = 50 - Math.cos(c.bearing) * r
              return (
                <div
                  key={c.id}
                  className={`radar-dot ${c.captured ? 'cap' : ''}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              )
            })}
            <div className="radar-self" />
          </div>
        )}
        {d.contacts &&
          d.contacts.filter((c) => !c.captured).map((c) => (
            <div key={c.id} className="hud-label contact-line">
              {c.label.split(' ·')[0]} · {c.range.toFixed(0)}M · {c.closing >= 0 ? 'CLOSING' : 'OPENING'}{' '}
              {Math.abs(c.closing).toFixed(0)}
            </div>
          ))}
        <div className={`ability ${d.ability.ready ? 'ready' : ''}`}>
          <div className="ability-cd">
            <div className="ability-cd-fill" style={{ width: `${(1 - d.ability.frac) * 100}%` }} />
          </div>
          <div className="hud-label">
            F · {d.ability.label} — {d.ability.detail}
          </div>
        </div>
        <div className="hud-label muted">TAB · {d.camLabel}</div>
      </div>
    </div>
  )
}
