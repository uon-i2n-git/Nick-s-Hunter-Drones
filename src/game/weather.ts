// Two weather presets. Wind feeds the drag term in physics as relative airspeed.
import { v3, type V3 } from './physics.ts'

export type WeatherId = 'clear' | 'gusty'

export interface WeatherDef {
  id: WeatherId
  name: string
  baseWind: number // m/s
  gust: number // +/- m/s
  // visuals
  skyTop: string
  skyBottom: string
  fogColor: string
  fogDensity: number
  sunIntensity: number
  hemiIntensity: number
  whitecaps: number // 0..1
}

export const WEATHERS: Record<WeatherId, WeatherDef> = {
  clear: {
    id: 'clear',
    name: 'Clear',
    baseWind: 0,
    gust: 0,
    skyTop: '#3d6ea5',
    skyBottom: '#b8ccd8',
    fogColor: '#b0c4d0',
    fogDensity: 0.00035, // ~8 km visibility
    sunIntensity: 3.0,
    hemiIntensity: 1.05,
    whitecaps: 0,
  },
  gusty: {
    id: 'gusty',
    name: 'Gusty Southerly',
    baseWind: 11,
    gust: 6,
    skyTop: '#37434f',
    skyBottom: '#828d96',
    fogColor: '#828d96',
    fogDensity: 0.0011,
    sunIntensity: 1.9,
    hemiIntensity: 1.15,
    whitecaps: 1,
  },
}

// Southerly: wind FROM the south. South is +Z here, so the wind vector points -Z.
// Noise: three incommensurate sinusoids in the 3–7 s band plus a slow direction
// wobble and a little spatial variation, so gusts arrive as distinct shoves.
export function windAt(w: WeatherDef, pos: V3, t: number): V3 {
  if (w.baseWind === 0) return v3()
  const g =
    Math.sin(t * (Math.PI * 2 / 3.3) + 1.7) * 0.45 +
    Math.sin(t * (Math.PI * 2 / 4.9) + 4.1) * 0.35 +
    Math.sin(t * (Math.PI * 2 / 6.7) + 0.6 + pos.x * 0.004) * 0.2
  const speed = w.baseWind + w.gust * g
  const dir = Math.PI + 0.22 * Math.sin(t * 0.31 + pos.z * 0.003) // blowing towards -Z
  return v3(Math.sin(dir) * speed, 0, Math.cos(dir) * speed)
}
