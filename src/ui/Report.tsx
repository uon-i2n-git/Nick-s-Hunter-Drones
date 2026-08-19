// Capability report: the results screen, framed as a customer-facing summary.
import { useEffect } from 'react'
import { DRONES } from '../game/drones.ts'
import { fmtClock, fmtTime, type Report } from '../game/sim.ts'

interface Props {
  report: Report
  onRetry: () => void
  onHangar: () => void
}

const MODE_NAME = { free: 'Free Flight', race: 'Ring Course', intercept: 'Intercept' } as const
const WX_NAME = { clear: 'Clear', gusty: 'Gusty Southerly' } as const

export function ReportScreen({ report, onRetry, onHangar }: Props) {
  const def = DRONES[report.drone]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') onRetry()
      if (e.code === 'Escape' || e.code === 'Enter') onHangar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRetry, onHangar])

  return (
    <div className="report-root">
      <div className="report">
        <div className="report-head">
          <div>
            <div className="tag">Capability Report</div>
            <h2>{def.model}</h2>
            <div className="report-sub">
              {MODE_NAME[report.mode]} · {WX_NAME[report.weather]} · {report.reason}
            </div>
          </div>
          {report.medal && <div className={`medal ${report.medal}`}>{report.medal.toUpperCase()}</div>}
        </div>
        <hr />
        <div className="report-grid">
          <div className="hud-num-block">
            <div className="hud-num">{fmtClock(report.timeOnTask)}</div>
            <div className="hud-label">Time on Task</div>
          </div>
          <div className="hud-num-block">
            <div className="hud-num">{report.energyUsedPct}<u>%</u></div>
            <div className="hud-label">Energy Used</div>
          </div>
          <div className="hud-num-block">
            <div className="hud-num">{report.distanceKm.toFixed(1)}<u>km</u></div>
            <div className="hud-label">Distance Flown</div>
          </div>
          {report.raceTime !== undefined && (
            <div className="hud-num-block">
              <div className="hud-num">{fmtTime(report.raceTime)}</div>
              <div className="hud-label">Race Time</div>
            </div>
          )}
        </div>
        {report.lapTimes && report.lapTimes.length > 0 && (
          <div className="report-laps">
            {report.lapTimes.map((t, i) => (
              <span key={i}>
                LAP {i + 1} · {fmtTime(t)}
              </span>
            ))}
          </div>
        )}
        <hr />
        <ul className="sells report-objectives">
          {report.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <div className="report-line">{report.line}</div>
        <hr />
        <div className="report-buttons">
          <button className="start" onClick={onRetry}>
            Retry (R)
          </button>
          <button className="select on" onClick={onHangar}>
            Change Drone
          </button>
          <button className="select on" onClick={onHangar}>
            Main Menu
          </button>
        </div>
        <div className="disclaimer centered">All specifications are illustrative. Nick's Hunter Drones is fictional.</div>
      </div>
    </div>
  )
}
