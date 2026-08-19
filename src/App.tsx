import { useCallback, useState } from 'react'
import { Hangar } from './ui/Hangar.tsx'
import { ReportScreen } from './ui/Report.tsx'
import { FlightScreen } from './FlightScreen.tsx'
import type { Report, SimConfig } from './game/sim.ts'

type Screen = { kind: 'hangar' } | { kind: 'flight' } | { kind: 'report'; report: Report }

export default function App() {
  const [cfg, setCfg] = useState<SimConfig>({ drone: 'kestrel', mode: 'free', weather: 'clear' })
  const [screen, setScreen] = useState<Screen>({ kind: 'hangar' })
  const [flightKey, setFlightKey] = useState(0)

  const launch = useCallback(() => {
    setFlightKey((k) => k + 1)
    setScreen({ kind: 'flight' })
  }, [])

  return (
    <>
      {screen.kind === 'hangar' && <Hangar cfg={cfg} setCfg={setCfg} onLaunch={launch} />}
      {screen.kind === 'flight' && (
        <FlightScreen
          key={flightKey}
          cfg={cfg}
          onExit={() => setScreen({ kind: 'hangar' })}
          onReport={(report) => setScreen({ kind: 'report', report })}
          onRestart={() => setFlightKey((k) => k + 1)}
        />
      )}
      {screen.kind === 'report' && (
        <ReportScreen report={screen.report} onRetry={launch} onHangar={() => setScreen({ kind: 'hangar' })} />
      )}
    </>
  )
}
