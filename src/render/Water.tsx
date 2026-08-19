// Water plane with animated procedural normals, sun glint, fresnel toward the
// sky colour, optional whitecaps in the gusty preset. One draw call.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WeatherDef } from '../game/weather.ts'

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uWhitecaps;
  uniform float uSunIntensity;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    // gentle animated normal from layered moving waves
    float amp = 0.06 + 0.10 * uWhitecaps;
    float h1 = sin(p.x * 0.18 + t * 1.1) * cos(p.y * 0.15 + t * 0.8);
    float h2 = sin((p.x + p.y) * 0.42 - t * 1.7);
    float h3 = noise(p * 0.35 + vec2(t * 0.5, t * 0.3)) * 2.0 - 1.0;
    float dx = (h1 * 0.18 + h2 * 0.42 + h3 * 0.5) * amp;
    float h1b = sin(p.y * 0.2 - t * 0.9) * cos(p.x * 0.13 + t * 0.7);
    float dz = (h1b * 0.2 + h2 * 0.42 - h3 * 0.5) * amp;
    vec3 n = normalize(vec3(-dx, 1.0, -dz));

    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(view, n), 0.0), 3.0);
    float diff = max(dot(n, uSunDir), 0.0);
    vec3 col = mix(uDeep * (0.5 + 0.5 * diff), uSky, fresnel * 0.75);

    // sun glint
    vec3 refl = reflect(-view, n);
    float spec = pow(max(dot(refl, uSunDir), 0.0), 90.0) * uSunIntensity;
    col += vec3(1.0, 0.95, 0.85) * spec * 0.7;

    // whitecaps: sparse crests only
    if (uWhitecaps > 0.01) {
      float caps = smoothstep(0.86, 0.97, noise(p * 0.32 + vec2(t * 1.1, -t * 0.8)));
      col = mix(col, vec3(0.8, 0.85, 0.88), caps * 0.35 * uWhitecaps);
    }

    float dist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 2.2);
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`

export function Water({ weather }: { weather: WeatherDef }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.6, 0.35).normalize() },
      uDeep: { value: new THREE.Color(weather.id === 'clear' ? '#123245' : '#18242c') },
      uSky: { value: new THREE.Color(weather.skyBottom) },
      uFogColor: { value: new THREE.Color(weather.fogColor) },
      uFogDensity: { value: weather.fogDensity },
      uWhitecaps: { value: weather.whitecaps },
      uSunIntensity: { value: weather.sunIntensity },
    }),
    [weather],
  )
  useFrame((st) => {
    if (mat.current) mat.current.uniforms.uTime.value = st.clock.elapsedTime
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
      <planeGeometry args={[4000, 4000, 1, 1]} />
      <shaderMaterial ref={mat} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  )
}
