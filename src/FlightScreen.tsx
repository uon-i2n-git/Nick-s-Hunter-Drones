import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sim, type Report, type SimConfig } from './game/sim.ts'
import { GameScene } from './render/GameScene.tsx'
import { Hud, type HudData } from './ui/Hud.tsx'
import { ControlsCard } from './ui/ControlsCard.tsx'

interface Props {
  cfg: SimConfig
  onExit: () => void
  onReport: (r: Report) => void
  onRestart: () => void
}

const GAME_CODES = new Set([
  'Space', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyQ', 'KeyE', 'KeyC', 'ShiftLeft', 'ShiftRight', 'Tab', 'KeyF', 'KeyR', 'KeyH', 'Escape',
])

export function FlightScreen({ cfg, onExit, onReport, onRestart }: Props) {
  const sim = useMemo(() => new Sim(cfg), [cfg])
  const keysRef = useRef<Record<string, boolean>>({})
  const camModeRef = useRef(0)
  const [hud, setHud] = useState<HudData | null>(null)
  const [card, setCard] = useState<'show' | 'fading' | 'hidden'>('show')
  const reported = useRef(false)
  const cardTimers = useRef<number[]>([])

  // the card stays up much longer at launch; H toggles it on/off for good
  useEffect(() => {
    cardTimers.current = [
      window.setTimeout(() => setCard('fading'), 15000),
      window.setTimeout(() => setCard('hidden'), 16500),
    ]
    return () => cardTimers.current.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (GAME_CODES.has(e.code)) e.preventDefault()
      keysRef.current[e.code] = true
      if (e.repeat) return
      if (e.code === 'KeyF') sim.requestAbility()
      if (e.code === 'Tab') camModeRef.current = (camModeRef.current + 1) % 3
      if (e.code === 'KeyR') onRestart()
      if (e.code === 'Escape') onExit()
      if (e.code === 'KeyH') {
        cardTimers.current.forEach(clearTimeout) // manual toggle overrides the launch timer
        setCard((prev) => (prev === 'hidden' ? 'show' : 'hidden'))
      }
    }
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false
    }
    const blur = () => {
      keysRef.current = {}
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [sim, onExit, onRestart])

  const handleHud = useCallback(
    (h: HudData) => {
      setHud(h)
      if (sim.result && !reported.current) {
        reported.current = true
        onReport(sim.result)
      }
    },
    [sim, onReport],
  )

  return (
    <div className="flight-root">
      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        camera={{ fov: 60, near: 0.1, far: 2600, position: [30, 8, 155] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <GameScene sim={sim} keysRef={keysRef} camModeRef={camModeRef} onHud={handleHud} />
      </Canvas>
      {hud && <Hud d={hud} />}
      {card !== 'hidden' && <ControlsCard fading={card === 'fading'} />}
      {hud?.flash && <div className="crash-flash" />}
    </div>
  )
}
