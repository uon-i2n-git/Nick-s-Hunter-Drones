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
  'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'KeyX',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Tab', 'KeyF', 'KeyR', 'KeyH', 'Escape',
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
      window.setTimeout(() => setCard('fading'), 45000),
      window.setTimeout(() => setCard('hidden'), 46500),
    ]
    return () => cardTimers.current.forEach(clearTimeout)
  }, [])

  // clicked/keyed on: stays until clicked/keyed off (kills the launch timer)
  const toggleCard = useCallback(() => {
    cardTimers.current.forEach(clearTimeout)
    setCard((prev) => (prev === 'hidden' ? 'show' : 'hidden'))
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
      if (e.code === 'KeyH') toggleCard()
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
  }, [sim, onExit, onRestart, toggleCard])

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
      {hud && <Hud d={hud} controlsOn={card !== 'hidden'} onToggleControls={toggleCard} />}
      {card !== 'hidden' && <ControlsCard fading={card === 'fading'} />}
      {hud?.flash && <div className="crash-flash" />}
    </div>
  )
}
