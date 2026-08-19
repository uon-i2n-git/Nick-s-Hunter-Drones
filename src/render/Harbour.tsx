// The low-poly working harbour: sky, lights, wharves, cranes, instanced
// containers, moored ships, instanced skyline, drifting spray in the gusts.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { WHARVES, STACKS, CRANES, SHIPS, WHARF_DECK } from '../game/world.ts'
import { windAt, type WeatherDef } from '../game/weather.ts'
import { Water } from './Water.tsx'

// deterministic prng for scatter
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Sky({ weather }: { weather: WeatherDef }) {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(weather.skyTop) },
      uBottom: { value: new THREE.Color(weather.skyBottom) },
    }),
    [weather],
  )
  return (
    <mesh>
      <sphereGeometry args={[1800, 16, 12]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`}
        fragmentShader={`uniform vec3 uTop; uniform vec3 uBottom; varying float vY;
          void main(){ float f = smoothstep(-0.05, 0.5, vY); gl_FragColor = vec4(mix(uBottom, uTop, f), 1.0); }`}
      />
    </mesh>
  )
}

const CONTAINER_COLORS = ['#8a4a3b', '#3b6a8a', '#4a7a52', '#b06a2a', '#6a7078', '#7a3b45']

function Containers() {
  const mesh = useMemo(() => {
    const boxes: Array<{ x: number; y: number; z: number; rot: number; color: THREE.Color }> = []
    const rnd = mulberry32(7)
    for (const s of STACKS) {
      const rotated = s.w < s.d // rotated stacks run along z
      const len = 12.2
      const wid = 2.6
      for (let c = 0; c < s.cols; c++) {
        for (let r = 0; r < s.rows; r++) {
          for (let l = 0; l < s.layers; l++) {
            if (l === s.layers - 1 && rnd() < 0.3) continue // ragged tops
            const u = (c - (s.cols - 1) / 2) * len
            const v = (r - (s.rows - 1) / 2) * wid
            boxes.push({
              x: s.x + (rotated ? v : u) + (rnd() - 0.5) * 0.15,
              y: WHARF_DECK + 1.3 + l * 2.6,
              z: s.z + (rotated ? u : v) + (rnd() - 0.5) * 0.15,
              rot: (rotated ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.02,
              color: new THREE.Color(CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)]),
            })
          }
        }
      }
    }
    const geo = new THREE.BoxGeometry(12, 2.6, 2.4)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 })
    const im = new THREE.InstancedMesh(geo, mat, boxes.length)
    const m = new THREE.Matrix4()
    boxes.forEach((b, i) => {
      m.makeRotationY(b.rot)
      m.setPosition(b.x, b.y, b.z)
      im.setMatrixAt(i, m)
      im.setColorAt(i, b.color)
    })
    im.castShadow = true
    im.receiveShadow = true
    return im
  }, [])
  return <primitive object={mesh} />
}

function Crane({ x, z, rot }: { x: number; z: number; rot: number }) {
  const steel = '#c8552e'
  const dark = '#333a42'
  return (
    <group position={[x, WHARF_DECK, z]} rotation-y={rot}>
      {/* portal legs */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <mesh position={[s * 9, 16, 0]} castShadow>
            <boxGeometry args={[2.2, 32, 2.2]} />
            <meshStandardMaterial color={steel} roughness={0.7} />
          </mesh>
          <mesh position={[s * 9, 1.5, 0]}>
            <boxGeometry args={[4, 3, 4]} />
            <meshStandardMaterial color={dark} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* cross beam + machinery house */}
      <mesh position={[0, 32.5, 0]} castShadow>
        <boxGeometry args={[22, 2.5, 3]} />
        <meshStandardMaterial color={steel} roughness={0.7} />
      </mesh>
      <mesh position={[0, 36, 1]} castShadow>
        <boxGeometry args={[8, 5, 6]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      {/* tower to 45 m and boom out over the water */}
      <mesh position={[0, 40, 0]} castShadow>
        <boxGeometry args={[2.5, 9, 2.5]} />
        <meshStandardMaterial color={steel} roughness={0.7} />
      </mesh>
      <mesh position={[0, 43.5, -16]} rotation-x={0.12} castShadow>
        <boxGeometry args={[1.8, 1.8, 38]} />
        <meshStandardMaterial color={steel} roughness={0.7} />
      </mesh>
      {/* hoist cable + spreader */}
      <mesh position={[0, 30, -28]}>
        <boxGeometry args={[0.12, 26, 0.12]} />
        <meshStandardMaterial color={'#111518'} />
      </mesh>
      <mesh position={[0, 16.5, -28]}>
        <boxGeometry args={[6, 0.8, 2.2]} />
        <meshStandardMaterial color={'#d8a020'} roughness={0.6} />
      </mesh>
    </group>
  )
}

function Ship({ x, z, w, d, rot, kind }: { x: number; z: number; w: number; d: number; rot: number; kind: string }) {
  const hull = kind === 'bulk' ? '#5a2f2a' : '#2f4a5a'
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 6, d]} />
        <meshStandardMaterial color={hull} roughness={0.8} />
      </mesh>
      <mesh position={[0, 6.4, 0]}>
        <boxGeometry args={[w * 0.96, 0.8, d * 0.9]} />
        <meshStandardMaterial color={'#77614f'} roughness={0.9} />
      </mesh>
      {/* superstructure aft */}
      <mesh position={[w * 0.36, 6 + (kind === 'bulk' ? 5 : 2.5), 0]} castShadow>
        <boxGeometry args={kind === 'bulk' ? [12, 10, d * 0.7] : [6, 5, d * 0.7]} />
        <meshStandardMaterial color={'#c9cdd2'} roughness={0.7} />
      </mesh>
      {kind === 'bulk' && (
        <mesh position={[-w * 0.1, 8, 0]} castShadow>
          <boxGeometry args={[w * 0.55, 3.4, d * 0.75]} />
          <meshStandardMaterial color={'#455059'} roughness={0.85} />
        </mesh>
      )}
    </group>
  )
}

function Skyline() {
  const mesh = useMemo(() => {
    const rnd = mulberry32(21)
    const items: Array<{ x: number; z: number; w: number; h: number; d: number; c: number }> = []
    // city arc behind the main wharf (south), ~900 m out
    for (let i = 0; i < 70; i++) {
      const a = Math.PI / 2 + (rnd() - 0.5) * 1.5 // centred on +Z (south)
      const r = 820 + rnd() * 200
      const h = 25 + rnd() * 65
      items.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 18 + rnd() * 26, h, d: 18 + rnd() * 26, c: 0.28 + rnd() * 0.2 })
    }
    // scattered industry north
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6
      const r = 780 + rnd() * 220
      items.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 30 + rnd() * 40, h: 12 + rnd() * 26, d: 24 + rnd() * 30, c: 0.3 + rnd() * 0.12 })
    }
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 })
    const im = new THREE.InstancedMesh(geo, mat, items.length)
    const m = new THREE.Matrix4()
    items.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d)
      m.setPosition(b.x, 0, b.z)
      im.setMatrixAt(i, m)
      im.setColorAt(i, new THREE.Color(b.c * 0.9, b.c, b.c * 1.08))
    })
    return im
  }, [])
  return <primitive object={mesh} />
}

function Spray({ weather }: { weather: WeatherDef }) {
  const ref = useRef<THREE.Points>(null)
  const N = 260
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const rnd = mulberry32(3)
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - 0.5) * 400
      pos[i * 3 + 1] = rnd() * 12
      pos[i * 3 + 2] = (rnd() - 0.5) * 400
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useFrame((st, dt) => {
    const pts = ref.current
    if (!pts) return
    const cam = st.camera.position
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const w = windAt(weather, { x: cam.x, y: 0, z: cam.z }, st.clock.elapsedTime)
    for (let i = 0; i < N; i++) {
      arr[i * 3] += w.x * 1.4 * dt
      arr[i * 3 + 2] += w.z * 1.4 * dt
      // wrap in a 400 m box around the camera
      if (arr[i * 3] - cam.x > 200) arr[i * 3] -= 400
      if (arr[i * 3] - cam.x < -200) arr[i * 3] += 400
      if (arr[i * 3 + 2] - cam.z > 200) arr[i * 3 + 2] -= 400
      if (arr[i * 3 + 2] - cam.z < -200) arr[i * 3 + 2] += 400
    }
    attr.needsUpdate = true
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#aebcc4" size={0.5} transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  )
}

export function Harbour({ weather }: { weather: WeatherDef }) {
  const { scene } = useThree()
  useMemo(() => {
    scene.fog = new THREE.FogExp2(weather.fogColor, weather.fogDensity)
    return null
  }, [scene, weather])

  return (
    <group>
      <Sky weather={weather} />
      <Water weather={weather} />
      <hemisphereLight args={['#b9cbd8', '#3a424a', weather.hemiIntensity]} />
      <ambientLight intensity={0.22} />

      {WHARVES.map((wh, i) => (
        <group key={i}>
          <mesh position={[wh.x, wh.y, wh.z]} receiveShadow>
            <boxGeometry args={[wh.w, wh.h, wh.d]} />
            <meshStandardMaterial color="#565d64" roughness={0.95} />
          </mesh>
          {/* deck edge strip */}
          <mesh position={[wh.x, WHARF_DECK + 0.02, wh.z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[wh.w, wh.d]} />
            <meshStandardMaterial color="#4b5259" roughness={0.95} />
          </mesh>
        </group>
      ))}

      <Containers />
      {CRANES.map((c, i) => (
        <Crane key={i} {...c} />
      ))}
      {SHIPS.map((s, i) => (
        <Ship key={i} x={s.x} z={s.z} w={s.w} d={s.d} rot={s.rot} kind={s.kind} />
      ))}
      <Skyline />
      {weather.whitecaps > 0 && <Spray weather={weather} />}
    </group>
  )
}
