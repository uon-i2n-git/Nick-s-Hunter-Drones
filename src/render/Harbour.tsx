// A working city dockyard: the flyable dock basin is wrapped by land on all
// sides — port flats behind both wharves, the city rising to the south and
// east, a suburb across the north — with one channel gorge cutting east
// through the city to the sea, guarded by a headland light.
// Everything repeated is an InstancedMesh; detail layers cull by distance.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  WHARVES, STACKS, CRANES, LOADERS, SHIPS, BUOYS, COAL_PILES,
  NOBBYS, LIGHTHOUSE, BREAKWALL, STOCKTON_BW, WHARF_DECK,
  BASIN, CHANNEL, OCEAN_X, terrainHeight, OFFICES, NW_BEACH, TRAIN,
} from '../game/world.ts'
import { windAt, type WeatherDef } from '../game/weather.ts'
import { Water } from './Water.tsx'

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

interface Inst { m: THREE.Matrix4; c?: THREE.Color }
function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], shadows = false): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, items.length)
  items.forEach((it, i) => {
    im.setMatrixAt(i, it.m)
    if (it.c) im.setColorAt(i, it.c)
  })
  im.castShadow = shadows
  im.receiveShadow = shadows
  return im
}
const mat4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4()
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz))
  return m
}

// ---------------------------------------------------------------- sky
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
      <sphereGeometry args={[1200, 16, 12]} />
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

// ---------------------------------------------------------------- terrain
const GRASS = new THREE.Color('#5b7146')
const GRASS2 = new THREE.Color('#6a7d4e')
const ASPHALT = new THREE.Color('#5c6164')
const DIRT = new THREE.Color('#7d7358')

function Terrain() {
  const mesh = useMemo(() => {
    const x0 = -900, x1 = 700, z0 = -700, z1 = 700, step = 18
    const nx = Math.ceil((x1 - x0) / step)
    const nz = Math.ceil((z1 - z0) / step)
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz)
    geo.rotateX(-Math.PI / 2)
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const rnd = mulberry32(97)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = terrainHeight(x, z)
      pos.setY(i, h === 0 ? -1.8 : h - 0.05)
      const nearBeach = x < -215 && x > -330 && z < -125 && z > -190
      if (h === 0) c.copy(ASPHALT)
      else if (nearBeach) c.set('#c4ad7e').offsetHSL(0, 0, (rnd() - 0.5) * 0.04)
      else if (h === 3) c.copy(rnd() < 0.6 ? ASPHALT : DIRT).offsetHSL(0, 0, (rnd() - 0.5) * 0.05)
      else c.copy(rnd() < 0.75 ? GRASS : GRASS2).offsetHSL(0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.06)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
    m.receiveShadow = true
    return m
  }, [])
  return <primitive object={mesh} />
}

// shoreline: white surf strips everywhere land meets water, rocks on the
// revetment edges, concrete sea walls along the city banks
function Shoreline() {
  const { surf, rocks } = useMemo(() => {
    const surfItems: Inst[] = []
    const rockItems: Inst[] = []
    const addRun = (x0: number, z0: number, x1: number, z1: number, n: number, revet: boolean) => {
      const ry = Math.atan2(-(z1 - z0), x1 - x0)
      const segLen = Math.hypot(x1 - x0, z1 - z0) / n
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        surfItems.push({ m: mat4(x, 0.22, z, ry, segLen * 1.15, 1, 5) })
        if (revet) rockItems.push({ m: mat4(x, 0.8, z, ry, segLen + 2, 2.2, 4) })
      }
    }
    // basin edges (the boardwalk covers the south x -150..150, the apron the north)
    addRun(-310, 140, -152, 140, 5, false) // south-west foreshore edge
    addRun(-150, 143, 150, 143, 6, false) // along the Honeysuckle boardwalk front
    addRun(-310, -20, -310, 138, 5, true) // west end of the basin (south half)
    addRun(-310, -126, -240, -126, 4, false) // the sandy beach shoreline
    addRun(-310, -126, -310, -24, 3, false)
    addRun(152, -126, 152, -32, 4, false) // basin east wall, north of the gorge
    addRun(152, 70, 152, 140, 3, false) // basin east wall, south of the gorge
    // channel gorge banks
    addRun(155, 68, OCEAN_X, 68, 12, false)
    addRun(155, -30, OCEAN_X, -30, 12, false)
    // ocean coast either side of the mouth
    addRun(OCEAN_X + 2, 76, OCEAN_X + 2, 420, 8, true)
    addRun(OCEAN_X + 2, -38, OCEAN_X + 2, -420, 8, true)
    // around the headland + both moles
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      surfItems.push({ m: mat4(NOBBYS.x + Math.cos(a) * (NOBBYS.baseR + 4), 0.22, NOBBYS.z + Math.sin(a) * (NOBBYS.baseR + 2), -a, 22, 1, 6) })
    }
    for (const bw of [BREAKWALL, STOCKTON_BW]) {
      const ry = Math.atan2(-(bw.z1 - bw.z0), bw.x1 - bw.x0)
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5
        surfItems.push({ m: mat4(bw.x0 + (bw.x1 - bw.x0) * t, 0.22, bw.z0 + (bw.z1 - bw.z0) * t + 6, ry, 26, 1, 5) })
      }
    }
    const surfMat = new THREE.MeshBasicMaterial({ color: '#e6edf0', transparent: true, opacity: 0.4, depthWrite: false })
    const surf = makeInstanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), surfMat, surfItems)
    surf.renderOrder = 1
    const rocks = makeInstanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#5a564e', roughness: 1, flatShading: true }),
      rockItems,
    )
    return { surf, rocks }
  }, [])
  return (
    <group>
      <primitive object={surf} name="surf" />
      <primitive object={rocks} />
    </group>
  )
}

// ---------------------------------------------------------------- port machines
interface PartDef { size: [number, number, number]; locals: Array<[number, number, number, number?, number?]> }
function machineParts(machines: Array<{ x: number; z: number; rot: number }>, parts: Record<string, PartDef>, colors: Record<string, string>, yBase: number) {
  const meshes: THREE.InstancedMesh[] = []
  for (const [key, p] of Object.entries(parts)) {
    const items: Inst[] = []
    for (const mch of machines) {
      const base = new THREE.Matrix4().compose(
        new THREE.Vector3(mch.x, yBase, mch.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, mch.rot, 0)),
        new THREE.Vector3(1, 1, 1),
      )
      for (const [lx, ly, lz, rx, rz] of p.locals) {
        const local = new THREE.Matrix4().compose(
          new THREE.Vector3(lx, ly, lz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx ?? 0, 0, rz ?? 0)),
          new THREE.Vector3(1, 1, 1),
        )
        items.push({ m: base.clone().multiply(local) })
      }
    }
    meshes.push(makeInstanced(new THREE.BoxGeometry(...p.size), new THREE.MeshStandardMaterial({ color: colors[key], roughness: 0.75 }), items, true))
  }
  return meshes
}

function PortMachines() {
  const meshes = useMemo(() => {
    const craneMeshes = machineParts(
      CRANES,
      {
        leg: { size: [2.2, 32, 2.2], locals: [[-9, 16, 0], [9, 16, 0]] },
        foot: { size: [4, 3, 4], locals: [[-9, 1.5, 0], [9, 1.5, 0]] },
        beam: { size: [22, 2.5, 3], locals: [[0, 32.5, 0]] },
        house: { size: [8, 5, 6], locals: [[0, 36, 1]] },
        tower: { size: [2.5, 9, 2.5], locals: [[0, 40, 0]] },
        jib: { size: [1.8, 1.8, 38], locals: [[0, 43.5, -16, 0.12]] },
        cable: { size: [0.12, 26, 0.12], locals: [[0, 30, -28]] },
        spreader: { size: [6, 0.8, 2.2], locals: [[0, 16.5, -28]] },
      },
      { leg: '#c8552e', foot: '#333a42', beam: '#c8552e', house: '#333a42', tower: '#c8552e', jib: '#c8552e', cable: '#111518', spreader: '#d8a020' },
      WHARF_DECK,
    )
    const loaderMeshes = machineParts(
      LOADERS.map((l) => ({ ...l, rot: 0 })),
      {
        leg: { size: [2.5, 26, 2.5], locals: [[-8, 13, 0], [8, 13, 0]] },
        bogie: { size: [5, 2, 3], locals: [[-8, 1, 0], [8, 1, 0]] },
        girder: { size: [20, 3.2, 4], locals: [[0, 26, 0]] },
        boom: { size: [2.2, 2.2, 36], locals: [[0, 26.5, 16, 0.1]] },
        weight: { size: [6, 4.5, 6], locals: [[0, 24.5, -5]] },
      },
      { leg: '#4e5d54', bogie: '#333a42', girder: '#4e5d54', boom: '#5d6e63', weight: '#333a42' },
      WHARF_DECK,
    )
    return [...craneMeshes, ...loaderMeshes]
  }, [])
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- containers
const CONTAINER_COLORS = ['#8a4a3b', '#3b6a8a', '#4a7a52', '#b06a2a', '#6a7078', '#7a3b45']
function Containers() {
  const mesh = useMemo(() => {
    const items: Inst[] = []
    const rnd = mulberry32(7)
    for (const s of STACKS) {
      const rotated = s.w < s.d
      const len = 12.2
      const wid = 2.6
      const baseY = s.y - s.h / 2
      for (let c = 0; c < s.cols; c++) {
        for (let r = 0; r < s.rows; r++) {
          for (let l = 0; l < s.layers; l++) {
            if (l === s.layers - 1 && rnd() < 0.3) continue
            const u = (c - (s.cols - 1) / 2) * len
            const v = (r - (s.rows - 1) / 2) * wid
            items.push({
              m: mat4(
                s.x + (rotated ? v : u) + (rnd() - 0.5) * 0.15,
                baseY + 1.3 + l * 2.6,
                s.z + (rotated ? u : v) + (rnd() - 0.5) * 0.15,
                (rotated ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.02,
              ),
              c: new THREE.Color(CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)]),
            })
          }
        }
      }
    }
    return makeInstanced(new THREE.BoxGeometry(12, 2.6, 2.4), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 }), items, true)
  }, [])
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------- ships
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

// ---------------------------------------------------------------- headland light
function Headland({ gusty }: { gusty: boolean }) {
  const beamRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (beamRef.current) beamRef.current.rotation.y += dt * 0.9
  })
  const H = NOBBYS.height
  return (
    <group position={[NOBBYS.x, 0, NOBBYS.z]}>
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.baseR, H, 9]} />
        <meshStandardMaterial color="#6f6a49" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, H + 0.05, 0]}>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.topR, 0.1, 9]} />
        <meshStandardMaterial color="#77784e" roughness={1} />
      </mesh>
      {/* cliffs on the seaward face */}
      <mesh position={[NOBBYS.baseR * 0.6, H / 2 - 1, 0]} rotation-y={0.1}>
        <boxGeometry args={[10, H - 2, NOBBYS.baseR * 1.35]} />
        <meshStandardMaterial color="#8a7a5c" flatShading roughness={1} />
      </mesh>

      {/* squat 9 m white stone tower */}
      <group position={[0, H, LIGHTHOUSE.z - NOBBYS.z]}>
        <mesh position={[0, 3.5, 0]} castShadow>
          <cylinderGeometry args={[2.0, 2.5, 7, 12]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.6} />
        </mesh>
        <mesh position={[0, 7.3, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 0.6, 12]} />
          <meshStandardMaterial color="#e8e5de" roughness={0.6} />
        </mesh>
        <mesh position={[0, 8.2, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 1.4, 10]} />
          <meshStandardMaterial color="#1e2731" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, 8.2, 0]}>
          <sphereGeometry args={[0.7, 10, 8]} />
          <meshStandardMaterial color="#fff2c0" emissive="#ffdf80" emissiveIntensity={gusty ? 4 : 0.8} />
        </mesh>
        <mesh position={[0, 9.3, 0]}>
          <coneGeometry args={[1.5, 1.2, 10]} />
          <meshStandardMaterial color="#b8412f" roughness={0.7} />
        </mesh>
        {gusty && (
          <group ref={beamRef} position={[0, 8.2, 0]}>
            {[0, Math.PI].map((a) => (
              <mesh key={a} rotation-y={a} rotation-z={Math.PI / 2} position={[Math.cos(a) * 30, 0, -Math.sin(a) * 30]}>
                <coneGeometry args={[2.4, 60, 8, 1, true]} />
                <meshBasicMaterial color="#ffe9a8" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            ))}
          </group>
        )}
      </group>

      {/* signal station, larger than the tower */}
      <group position={[-11, H, 6]}>
        <mesh position={[0, 3, 0]} castShadow>
          <boxGeometry args={[13, 6, 9]} />
          <meshStandardMaterial color="#eeece6" roughness={0.7} />
        </mesh>
        <mesh position={[0, 6.6, 0]}>
          <boxGeometry args={[13.6, 1.2, 9.6]} />
          <meshStandardMaterial color="#a5442f" roughness={0.8} />
        </mesh>
        <mesh position={[9, 2.5, 4]} castShadow>
          <boxGeometry args={[8, 5, 6]} />
          <meshStandardMaterial color="#e9e6df" roughness={0.7} />
        </mesh>
        <mesh position={[9, 5.4, 4]}>
          <boxGeometry args={[8.6, 1, 6.6]} />
          <meshStandardMaterial color="#a5442f" roughness={0.8} />
        </mesh>
        <mesh position={[-4, 9, -2]}>
          <cylinderGeometry args={[0.12, 0.18, 8, 6]} />
          <meshStandardMaterial color="#dddad2" />
        </mesh>
      </group>
    </group>
  )
}

function Breakwater({ bw, color }: { bw: typeof BREAKWALL; color: string }) {
  const len = Math.hypot(bw.x1 - bw.x0, bw.z1 - bw.z0)
  const cx = (bw.x0 + bw.x1) / 2
  const cz = (bw.z0 + bw.z1) / 2
  const ry = Math.atan2(-(bw.z1 - bw.z0), bw.x1 - bw.x0)
  return (
    <group position={[cx, 0, cz]} rotation-y={ry}>
      <mesh position={[0, bw.top / 2 - 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, bw.top + 0.8, bw.w]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, bw.top + 0.06, 0]}>
        <boxGeometry args={[len, 0.12, bw.w * 0.45]} />
        <meshStandardMaterial color="#9a938a" roughness={0.9} />
      </mesh>
    </group>
  )
}

function OldBattery() {
  const y = terrainHeight(500, 100)
  return (
    <group position={[500, y, 100]}>
      <mesh position={[0, 5, 0]} castShadow>
        <cylinderGeometry args={[18, 26, 10, 8]} />
        <meshStandardMaterial color="#6b6b4d" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 10.6, 0]}>
        <cylinderGeometry args={[16.5, 16.5, 1.2, 8]} />
        <meshStandardMaterial color="#767c52" roughness={1} />
      </mesh>
      <mesh position={[0, 11.8, 0]}>
        <cylinderGeometry args={[16.5, 16.5, 1.6, 8, 1, true]} />
        <meshStandardMaterial color="#8f8a7a" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {[-7, 7].map((oz) => (
        <group key={oz} position={[11, 11.6, oz]}>
          <mesh>
            <cylinderGeometry args={[2.2, 2.6, 1.6, 8]} />
            <meshStandardMaterial color="#5c6058" roughness={0.9} />
          </mesh>
          <mesh position={[3, 0.6, 0]} rotation-z={-1.45}>
            <cylinderGeometry args={[0.3, 0.42, 7, 8]} />
            <meshStandardMaterial color="#3a3f3b" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function HarboursideTower() {
  const y = terrainHeight(205, 84)
  return (
    <group position={[205, y, 84]}>
      <mesh position={[0, 13, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.4, 26, 10]} />
        <meshStandardMaterial color="#d8d5cc" roughness={0.6} />
      </mesh>
      <mesh position={[0, 26.6, 0]}>
        <cylinderGeometry args={[3.4, 3.4, 1.6, 12]} />
        <meshStandardMaterial color="#c8c4ba" roughness={0.6} />
      </mesh>
      <mesh position={[0, 28, 0]}>
        <sphereGeometry args={[2.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#8fa3ad" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Cathedral() {
  const y = terrainHeight(280, 360)
  return (
    <group position={[280, y, 360]}>
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[38, 58, 12, 10]} />
        <meshStandardMaterial color="#5d6148" flatShading roughness={1} />
      </mesh>
      <group position={[0, 12, 0]}>
        <mesh position={[0, 7, 0]} castShadow>
          <boxGeometry args={[44, 14, 16]} />
          <meshStandardMaterial color="#b89a6a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 15.5, 0]}>
          <boxGeometry args={[44, 3, 10]} />
          <meshStandardMaterial color="#8a7550" roughness={0.9} />
        </mesh>
        <mesh position={[14, 19, 0]} castShadow>
          <boxGeometry args={[13, 26, 13]} />
          <meshStandardMaterial color="#b89a6a" roughness={0.85} />
        </mesh>
        {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) => (
          <mesh key={`${sx}${sz}`} position={[14 + sx * 5.5, 34, sz * 5.5]}>
            <coneGeometry args={[1, 4, 4]} />
            <meshStandardMaterial color="#8a7550" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- city
function windowsTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 96
  const g = cv.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 64, 96)
  const rnd = mulberry32(11)
  for (let y = 4; y < 92; y += 8) {
    for (let x = 4; x < 60; x += 8) {
      if (rnd() < 0.55) {
        g.fillStyle = rnd() < 0.7 ? '#ffd27a' : '#cfe2ee'
        g.fillRect(x, y, 4, 5)
      }
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.magFilter = THREE.NearestFilter
  return t
}

// four districts wrap the dockyard: warm frontages down both sides of the
// channel gorge, the CBD rising south-east, mid-rise blocks north-east,
// and tall faces on the basin's east corner staring straight down the dock
function City({ gusty }: { gusty: boolean }) {
  const { blocks, glass, windows, foreshore, awnings } = useMemo(() => {
    const rnd = mulberry32(31)
    const concrete: Inst[] = []
    const glassItems: Inst[] = []
    const windowItems: Inst[] = []
    const fore: Inst[] = []
    const awn: Inst[] = []
    const palette = ['#8d8579', '#9aa0a2', '#7b7268', '#a39d8b', '#6f6d6a']
    const warm = ['#a3684a', '#b98a5f', '#8a5a44', '#c2a58a', '#96705a', '#c7b18e']

    const addBlock = (x: number, z: number, w: number, h: number, d: number, faceDir: number) => {
      const gy = terrainHeight(x, z)
      const isGlass = h > 34 && rnd() < 0.3
      const item = { m: mat4(x, gy + h / 2, z, (rnd() - 0.5) * 0.1, w, h, d) }
      if (isGlass) glassItems.push(item)
      else concrete.push({ ...item, c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]) })
      windowItems.push({ m: mat4(x, gy + h / 2, z + faceDir * (d / 2 + 0.15), faceDir > 0 ? 0 : Math.PI, w * 0.92, h * 0.88, 1) })
    }
    const addFrontage = (x: number, z: number, w: number, h: number, d: number, faceDir: number, withAwning: boolean) => {
      const gy = terrainHeight(x, z)
      fore.push({ m: mat4(x, gy + h / 2, z, 0, w, h, d), c: new THREE.Color(warm[Math.floor(rnd() * warm.length)]) })
      if (withAwning) awn.push({ m: mat4(x, gy + 3.4, z + faceDir * (d / 2 + 1), 0, w * 0.9, 0.3, 2.2) })
      windowItems.push({ m: mat4(x, gy + h / 2, z + faceDir * (d / 2 + 0.15), faceDir > 0 ? 0 : Math.PI, w * 0.9, h * 0.8, 1) })
    }

    // channel gorge, south side (faces north, -z): two rows
    for (const rowZ of [86, 104]) {
      let x = 172
      while (x < 600) {
        const w = 12 + rnd() * 10
        if (x > 460 && x < 545) { x += w + 2; continue } // the old battery rise
        addFrontage(x + w / 2, rowZ + rnd() * 5, w, 9 + rnd() * 12, 11 + rnd() * 5, -1, rowZ === 86)
        x += w + 3 + rnd() * 4
      }
    }
    // channel gorge, north side (faces south, +z): two rows
    for (const rowZ of [-50, -68]) {
      let x = 172
      while (x < 600) {
        const w = 12 + rnd() * 10
        addFrontage(x + w / 2, rowZ - rnd() * 5, w, 9 + rnd() * 12, 11 + rnd() * 5, 1, rowZ === -50)
        x += w + 3 + rnd() * 4
      }
    }
    // basin east corner: tall faces only SOUTH of the gorge — the north-east
    // corner stays low (the towers moved to the office campus across the water)
    for (const z of [92, 116]) {
      addBlock(178 + rnd() * 18, z, 20 + rnd() * 10, 26 + rnd() * 30, 16 + rnd() * 8, -1)
    }
    for (const z of [-46, -72, -100]) {
      addBlock(178 + rnd() * 18, z, 18 + rnd() * 8, 8 + rnd() * 6, 14 + rnd() * 6, 1)
    }
    // CBD rising to the south-east
    for (let i = 0; i < 34; i++) {
      const x = 175 + rnd() * 240
      const z = 130 + rnd() * 160
      if (Math.hypot(x - 280, z - 360) < 85) continue // cathedral hill
      let h = 14 + rnd() * 28
      if (rnd() < 0.26) h = 48 + rnd() * 42
      if (x > 230 && x < 330 && z > 250 && h > 38) h = 38 // cathedral silhouette
      addBlock(x, z, 15 + rnd() * 15, h, 15 + rnd() * 15, -1)
    }
    // low blocks north-east, across the channel (no high-rise on this side)
    for (let i = 0; i < 26; i++) {
      const x = 180 + rnd() * 250
      const z = -95 - rnd() * 130
      addBlock(x, z, 15 + rnd() * 14, 8 + rnd() * 10, 15 + rnd() * 12, 1)
    }
    // the Honeysuckle office precinct on the south wharf + campus behind
    for (const o of OFFICES) {
      const item = { m: mat4(o.x, o.y, o.z, 0, o.w, o.h, o.d) }
      if (o.glass) glassItems.push(item)
      else concrete.push({ ...item, c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]) })
      windowItems.push({ m: mat4(o.x, o.y, o.z - o.d / 2 - 0.15, Math.PI, o.w * 0.92, o.h * 0.85, 1) })
    }

    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    const blocks = makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), concrete)
    const glass = makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ color: '#6d8ba3', metalness: 0.65, roughness: 0.25 }), glassItems)
    const foreshoreMesh = makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), fore)
    const awnings = makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ color: '#3d444c', roughness: 0.8 }), awn)
    const windows = makeInstanced(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: windowsTexture(),
        transparent: true,
        opacity: gusty ? 0.95 : 0.28,
        color: gusty ? '#ffffff' : '#9aa2ac',
        depthWrite: false,
      }),
      windowItems,
    )
    windows.renderOrder = 2
    return { blocks, glass, windows, foreshore: foreshoreMesh, awnings }
  }, [gusty])
  return (
    <group>
      <primitive object={blocks} />
      <primitive object={glass} />
      <primitive object={windows} name="cityWindows" />
      <primitive object={foreshore} />
      <primitive object={awnings} name="cityAwnings" />
    </group>
  )
}

// sea walls + promenades along the gorge, streets, poles, trees
function Foreshore() {
  const { poles, lamps, trunks, crowns, roads, walls, paint } = useMemo(() => {
    const rnd = mulberry32(17)
    const poleItems: Inst[] = []
    const lampItems: Inst[] = []
    const trunkItems: Inst[] = []
    const crownItems: Inst[] = []
    const paintItems: Inst[] = []
    // apron floodlight masts + painted lane dashes around the pad
    for (let x = -255; x <= 140; x += 55) {
      poleItems.push({ m: mat4(x, WHARF_DECK + 3.9, -131, 0, 1.3, 1.5, 1.3) })
      lampItems.push({ m: mat4(x, WHARF_DECK + 8, -131, 0, 1.4, 1.4, 1.4) })
    }
    for (const rowZ of [-140, -152]) {
      for (let x = -230; x <= 140; x += 18) {
        paintItems.push({ m: mat4(x, WHARF_DECK + 0.03, rowZ, 0, 6, 0.02, 0.4) })
      }
    }
    // painted square around the launch pad
    paintItems.push({ m: mat4(-110, WHARF_DECK + 0.03, -130.5, 0, 9.5, 0.02, 0.5) })
    paintItems.push({ m: mat4(-110, WHARF_DECK + 0.03, -139.5, 0, 9.5, 0.02, 0.5) })
    paintItems.push({ m: mat4(-105.5, WHARF_DECK + 0.03, -135, 0, 0.5, 0.02, 9.5) })
    paintItems.push({ m: mat4(-114.5, WHARF_DECK + 0.03, -135, 0, 0.5, 0.02, 9.5) })
    // promenade furniture along the gorge south bank
    for (let x = 175; x <= 590; x += 13) {
      if (x > 460 && x < 545) continue
      const gy = terrainHeight(x, 74)
      poleItems.push({ m: mat4(x, gy + 2.6, 73) })
      lampItems.push({ m: mat4(x, gy + 5.1, 73) })
    }
    for (let x = 180; x <= 585; x += 11) {
      if (x > 456 && x < 548) continue
      const palm = rnd() < 0.7
      const h = palm ? 5.5 + rnd() * 2.5 : 3 + rnd()
      const gy = terrainHeight(x, 78)
      trunkItems.push({ m: mat4(x + (rnd() - 0.5) * 4, gy + h / 2, 78 + rnd() * 3, 0, 1, h / 6, 1) })
      crownItems.push({
        m: mat4(x + (rnd() - 0.5) * 4, gy + h + (palm ? 0.6 : 1.6), 78 + rnd() * 3, rnd() * 3, palm ? 1 : 2.2, palm ? 0.8 : 1.7, palm ? 1 : 2.2),
        c: new THREE.Color(palm ? '#4e7a3a' : '#3c5e33'),
      })
    }
    // the same treatment continues along the south basin shore (Honeysuckle):
    // lamps on the boardwalk lip, palms on the grass rise behind it
    for (let x = -290; x <= 145; x += 15) {
      const gy = terrainHeight(x, 148)
      poleItems.push({ m: mat4(x, gy + 2.6, 148) })
      lampItems.push({ m: mat4(x, gy + 5.1, 148) })
    }
    for (let x = -285; x <= 140; x += 12) {
      const palm = rnd() < 0.7
      const h = palm ? 5.5 + rnd() * 2.5 : 3 + rnd()
      const z = 156 + rnd() * 4
      const gy = terrainHeight(x, z)
      trunkItems.push({ m: mat4(x + (rnd() - 0.5) * 4, gy + h / 2, z, 0, 1, h / 6, 1) })
      crownItems.push({
        m: mat4(x + (rnd() - 0.5) * 4, gy + h + (palm ? 0.6 : 1.6), z, rnd() * 3, palm ? 1 : 2.2, palm ? 0.8 : 1.7, palm ? 1 : 2.2),
        c: new THREE.Color(palm ? '#4e7a3a' : '#3c5e33'),
      })
    }
    // sea walls: both gorge banks + the basin's east corner
    const wallItems: Inst[] = [
      { m: mat4(395, 2, 69.5, 0, 490, 4.6, 3.5) },
      { m: mat4(395, 2, -31.5, 0, 490, 4.6, 3.5) },
      { m: mat4(151.5, 2, 105, 0, 3.5, 4.6, 74) },
      { m: mat4(151.5, 2, -79, 0, 3.5, 4.6, 98) },
    ]
    // roads: gorge banks, city grid on the rise, port flats, apron
    const roadItems: Inst[] = []
    roadItems.push({ m: mat4(390, terrainHeight(390, 80) + 0.12, 80, 0, 470, 0.14, 7) })
    roadItems.push({ m: mat4(390, terrainHeight(390, -42) + 0.12, -42, 0, 470, 0.14, 7) })
    for (const cx of [210, 290, 380]) {
      roadItems.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(cx, terrainHeight(cx, 190) + 0.6, 190),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.055, 0, 0)),
          new THREE.Vector3(7, 0.14, 215),
        ),
      })
    }
    for (const cz of [150, 210, 270]) {
      roadItems.push({ m: mat4(290, terrainHeight(290, cz) + 0.35, cz, 0, 230, 0.14, 7) })
    }
    for (const cz of [-105, -160, -215]) {
      roadItems.push({ m: mat4(300, terrainHeight(300, cz) + 0.35, cz, 0, 240, 0.14, 7) })
    }
    // foreshore drive along the south shore, seated on the rise
    for (let cx = -280; cx <= 140; cx += 42) {
      roadItems.push({ m: mat4(cx, terrainHeight(cx, 158) + 0.12, 158, 0, 44, 0.14, 7) })
    }
    roadItems.push({ m: mat4(-80, 3.06, -186, 0, 450, 0.14, 8) }) // behind the apron
    roadItems.push({ m: mat4(-80, 3.06, -252, 0, 450, 0.14, 8) }) // through the back flats
    return {
      poles: makeInstanced(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), new THREE.MeshStandardMaterial({ color: '#454c53' }), poleItems),
      lamps: makeInstanced(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffdf90', emissiveIntensity: 1.6 }), lampItems),
      trunks: makeInstanced(new THREE.CylinderGeometry(0.16, 0.24, 6, 5), new THREE.MeshStandardMaterial({ color: '#7a6248' }), trunkItems),
      crowns: makeInstanced(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), crownItems),
      roads: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#3a3f43', roughness: 0.95 }), roadItems),
      walls: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#8a857b', roughness: 0.9 }), wallItems),
      paint: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#c9d2d8', transparent: true, opacity: 0.55 }), paintItems),
    }
  }, [])
  return (
    <group>
      <primitive object={walls} />
      <primitive object={roads} />
      <primitive object={paint} />
      <group name="promenadeDetail">
        <primitive object={poles} />
        <primitive object={lamps} />
        <primitive object={trunks} />
        <primitive object={crowns} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- north suburb
function NorthSuburb() {
  const { walls, roofs } = useMemo(() => {
    const rnd = mulberry32(23)
    const wallItems: Inst[] = []
    const roofItems: Inst[] = []
    const wallCols = ['#c9bfa8', '#b8c0c4', '#c7a98a', '#a8b090', '#cfc6b0']
    const roofCols = ['#8a4a3b', '#5d6468', '#7a5a48', '#4e5a60']
    for (let gz = 0; gz < 5; gz++) {
      for (let gx = 0; gx < 11; gx++) {
        if (rnd() < 0.14) continue
        const x = 175 + gx * 25 + (rnd() - 0.5) * 7
        const z = -272 - gz * 26 - (rnd() - 0.5) * 7
        const gy = terrainHeight(x, z)
        const two = rnd() < 0.25
        const h = two ? 5.6 : 3.2
        const ry = (rnd() - 0.5) * 0.2 + (gz % 2 ? Math.PI / 2 : 0)
        wallItems.push({ m: mat4(x, gy + h / 2, z, ry), c: new THREE.Color(wallCols[Math.floor(rnd() * wallCols.length)]) })
        roofItems.push({ m: mat4(x, gy + h + 1.1, z, ry + Math.PI / 4), c: new THREE.Color(roofCols[Math.floor(rnd() * roofCols.length)]) })
      }
    }
    return {
      walls: makeInstanced(new THREE.BoxGeometry(8.5, 3.2, 7), new THREE.MeshStandardMaterial({ roughness: 0.95 }), wallItems),
      roofs: makeInstanced(new THREE.ConeGeometry(6, 2.4, 4), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), roofItems),
    }
  }, [])
  return (
    <group>
      <primitive object={walls} />
      <primitive object={roofs} />
      {/* the sandy beach at the north-west corner */}
      <group>
        <mesh position={[NW_BEACH.x, NW_BEACH.y, NW_BEACH.z]}>
          <boxGeometry args={[NW_BEACH.w, NW_BEACH.h, NW_BEACH.d]} />
          <meshStandardMaterial color="#cdb687" roughness={1} />
        </mesh>
        <mesh position={[NW_BEACH.x - 4, 0.25, NW_BEACH.z + 18]} rotation-x={-0.06}>
          <boxGeometry args={[NW_BEACH.w + 10, 0.4, 14]} />
          <meshStandardMaterial color="#d8c9a0" roughness={1} />
        </mesh>
        {[[-296, -172, 9], [-262, -178, 7], [-238, -170, 6]].map(([dx, dz, r], i) => (
          <mesh key={i} position={[dx, 1, dz]}>
            <coneGeometry args={[r * 2.2, 5, 6]} />
            <meshStandardMaterial color="#c8b284" flatShading roughness={1} />
          </mesh>
        ))}
      </group>
      {/* ferry landing on the north apron */}
      <group position={[90, 0, -132]}>
        <mesh position={[0, 2, 2]}>
          <boxGeometry args={[14, 1.2, 12]} />
          <meshStandardMaterial color="#6b6257" roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.6, -3]}>
          <boxGeometry args={[9, 2.6, 5]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- misc port props
function PortProps() {
  const { silos, sheds, piles } = useMemo(() => {
    const rnd = mulberry32(41)
    const siloItems: Inst[] = []
    for (let i = 0; i < 7; i++) {
      siloItems.push({ m: mat4(-288 + (i % 4) * 14, 3 + 14, -212 - Math.floor(i / 4) * 14, 0) })
    }
    const shedItems: Inst[] = []
    const shedSpots: Array<[number, number, number]> = [
      [-90, -244, 0], [120, -244, 0.05], [-190, -244, 0], [110, -168, 0.1],
      [-20, -284, 0.05], [-250, -280, 0], [100, -286, 0],
    ]
    for (const [x, z, r] of shedSpots) {
      shedItems.push({ m: mat4(x, 3 + 5, z, r, 40 + rnd() * 10, 10, 18 + rnd() * 6), c: new THREE.Color(rnd() < 0.5 ? '#7d8288' : '#8d857a') })
    }
    const pileItems: Inst[] = COAL_PILES.map((p) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, WHARF_DECK, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
        new THREE.Vector3(p.h, p.w / 2, p.d / 2),
      )
      return { m }
    })
    return {
      silos: makeInstanced(new THREE.CylinderGeometry(6, 6, 28, 10), new THREE.MeshStandardMaterial({ color: '#b9b4a6', roughness: 0.8 }), siloItems, true),
      sheds: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), shedItems),
      piles: makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 10, 1), new THREE.MeshStandardMaterial({ color: '#191b1d', roughness: 1 }), pileItems),
    }
  }, [])
  return (
    <group>
      <primitive object={silos} />
      <primitive object={sheds} />
      <primitive object={piles} />
    </group>
  )
}

// loaded coal train drawn up on the back flats
function CoalTrain() {
  const { wagons, loads, rails } = useMemo(() => {
    const rnd = mulberry32(67)
    const wagonItems: Inst[] = []
    const loadItems: Inst[] = []
    for (let i = 0; i < TRAIN.wagons; i++) {
      const x = TRAIN.x0 + i * (TRAIN.wagonLen + TRAIN.gap) + TRAIN.wagonLen / 2
      wagonItems.push({
        m: mat4(x, WHARF_DECK + 1.9, TRAIN.z, 0, TRAIN.wagonLen, 2.6, 3.2),
        c: new THREE.Color(rnd() < 0.5 ? '#4a3f38' : '#3c4046'),
      })
      loadItems.push({ m: mat4(x, WHARF_DECK + 3.35, TRAIN.z, 0, TRAIN.wagonLen * 0.88, 0.9, 2.5) })
    }
    const railItems: Inst[] = [
      { m: mat4(-95, WHARF_DECK + 0.11, TRAIN.z - 1.1, 0, 250, 0.22, 0.3) },
      { m: mat4(-95, WHARF_DECK + 0.11, TRAIN.z + 1.1, 0, 250, 0.22, 0.3) },
    ]
    const box = new THREE.BoxGeometry(1, 1, 1)
    return {
      wagons: makeInstanced(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), wagonItems, true),
      loads: makeInstanced(box, new THREE.MeshStandardMaterial({ color: '#191b1d', roughness: 1 }), loadItems),
      rails: makeInstanced(box, new THREE.MeshStandardMaterial({ color: '#6a6e72', metalness: 0.4, roughness: 0.5 }), railItems),
    }
  }, [])
  return (
    <group>
      <primitive object={wagons} />
      <primitive object={loads} />
      <primitive object={rails} />
      {/* locomotive at the head */}
      <group position={[TRAIN.locoX, WHARF_DECK, TRAIN.z]}>
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[16, 3.4, 3.4]} />
          <meshStandardMaterial color="#8a4a3b" roughness={0.8} />
        </mesh>
        <mesh position={[5, 4.6, 0]} castShadow>
          <boxGeometry args={[5, 1.6, 3.2]} />
          <meshStandardMaterial color="#33383e" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

function Buoys() {
  const mesh = useMemo(() => {
    const items: Inst[] = BUOYS.map((b) => ({
      m: mat4(b.x, 0.9, b.z),
      c: new THREE.Color(b.green ? '#2e9e4f' : '#c23a2c'),
    }))
    return makeInstanced(new THREE.ConeGeometry(1.1, 2.6, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), items)
  }, [])
  return <primitive object={mesh} />
}

// hill suburbs on the southern skyline + green rises behind the north suburb
function OuterRises() {
  const { mounds, suburbs } = useMemo(() => {
    const rnd = mulberry32(61)
    const moundItems: Inst[] = [
      { m: mat4(-60, 10, 430, 0.2, 180, 44, 110), c: new THREE.Color('#5a5e44') },
      { m: mat4(140, 14, 440, 0.5, 220, 54, 120), c: new THREE.Color('#565a42') },
      { m: mat4(340, 14, 420, 0.9, 170, 40, 105), c: new THREE.Color('#5e6248') },
      { m: mat4(-240, 6, 405, 0.3, 150, 34, 100), c: new THREE.Color('#585c44') },
      { m: mat4(240, 8, -400, 0.2, 200, 38, 100), c: new THREE.Color('#5c6046') },
      { m: mat4(460, 8, -350, -0.3, 170, 32, 95), c: new THREE.Color('#606449') },
    ]
    // green ridges across the far north so the skyline is land, not sea
    moundItems.push(
      { m: mat4(-80, 14, -520, 0.4, 260, 60, 140), c: new THREE.Color('#59604a') },
      { m: mat4(220, 14, -560, 0.1, 220, 46, 120), c: new THREE.Color('#5d6448') },
      { m: mat4(-340, 12, -500, 0.7, 200, 40, 110), c: new THREE.Color('#565c44') },
    )
    const suburbItems: Inst[] = []
    for (let i = 0; i < 40; i++) {
      const x = -160 + rnd() * 460
      const z = 380 + rnd() * 44
      const gy = terrainHeight(x, Math.min(z, 400))
      const c = 0.55 + rnd() * 0.2
      suburbItems.push({ m: mat4(x, gy + 2 + rnd() * 4, z, rnd(), 9 + rnd() * 8, 4 + rnd() * 3, 8 + rnd() * 7), c: new THREE.Color(c, c * 0.93, c * 0.83) })
    }
    const cone = new THREE.ConeGeometry(0.5, 1, 7)
    cone.translate(0, 0.5, 0)
    return {
      mounds: makeInstanced(cone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), moundItems),
      suburbs: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), suburbItems),
    }
  }, [])
  return (
    <group>
      <primitive object={mounds} />
      <primitive object={suburbs} />
    </group>
  )
}

function FarWestIndustry() {
  const meshes = useMemo(() => {
    const rnd = mulberry32(53)
    const blocks: Inst[] = []
    const roofItems: Inst[] = []
    const stackItems: Inst[] = []
    const tipItems: Inst[] = []
    const tankItems: Inst[] = []
    const windowItems: Inst[] = []
    for (let i = 0; i < 26; i++) {
      const x = -380 - rnd() * 160
      const z = -200 + rnd() * 380
      const h = 10 + rnd() * 30
      const c = 0.3 + rnd() * 0.12
      // mostly grid-aligned, like a real industrial estate
      const ry = (rnd() - 0.5) * 0.16
      const w = 24 + rnd() * 36
      const d = 20 + rnd() * 26
      const gy = terrainHeight(x, z) - 1 // sunk a little so sloped ground never shows a gap
      blocks.push({ m: mat4(x, gy + h / 2, z, ry, w, h, d), c: new THREE.Color(c * 0.95, c, c * 1.05) })
      // rooftop plant + vents
      const nRoof = 1 + Math.floor(rnd() * 2)
      for (let r = 0; r < nRoof; r++) {
        const ox = (rnd() - 0.5) * w * 0.5
        const oz = (rnd() - 0.5) * d * 0.5
        roofItems.push({
          m: mat4(x + ox * Math.cos(ry) + oz * Math.sin(ry), gy + h + 1.1, z - ox * Math.sin(ry) + oz * Math.cos(ry), ry, 4 + rnd() * 6, 2.2, 3 + rnd() * 4),
          c: new THREE.Color(c * 0.8, c * 0.82, c * 0.86),
        })
      }
      // a flue stack on roughly a third, with a warning light on the tall ones
      if (rnd() < 0.36) {
        const H = h + 8 + rnd() * 14
        const sx = x + (rnd() - 0.5) * w * 0.4
        const sz = z + (rnd() - 0.5) * d * 0.4
        stackItems.push({ m: mat4(sx, gy + H / 2, sz, 0, 1.6 + rnd(), H, 1.6 + rnd()) })
        if (H > 34) tipItems.push({ m: mat4(sx, gy + H + 0.5, sz) })
      }
      // lit window strips on the taller faces toward the water
      if (x > -480 && h > 13) {
        const ox = w / 2 + 0.2
        windowItems.push({
          m: mat4(x + ox * Math.cos(ry), gy + h * 0.55, z - ox * Math.sin(ry), ry + Math.PI / 2, d * 0.82, h * 0.55, 1),
        })
      }
    }
    // tank farm on the flats nearest the basin
    for (let i = 0; i < 9; i++) {
      const x = -348 - rnd() * 34
      const z = -120 + i * 28 + (rnd() - 0.5) * 10
      const r = 5 + rnd() * 4
      const h = 7 + rnd() * 5
      const gy = terrainHeight(x, z) - 0.5
      tankItems.push({ m: mat4(x, gy + h / 2, z, 0, r, h, r), c: new THREE.Color(0.62 + rnd() * 0.08, 0.63, 0.6) })
    }
    // a second, hazier rank further out toward the western horizon
    for (let i = 0; i < 14; i++) {
      const x = -560 - rnd() * 180
      const z = -240 + rnd() * 460
      const h = 8 + rnd() * 26
      const c = 0.32 + rnd() * 0.1
      blocks.push({ m: mat4(x, terrainHeight(x, z) + h / 2 - 1, z, rnd(), 28 + rnd() * 40, h, 24 + rnd() * 30), c: new THREE.Color(c * 0.95, c, c * 1.05) })
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    return [
      makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), blocks),
      makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), roofItems),
      makeInstanced(new THREE.CylinderGeometry(1, 1.25, 1, 8), new THREE.MeshStandardMaterial({ color: '#7d7a74', roughness: 0.85 }), stackItems),
      makeInstanced(new THREE.SphereGeometry(0.7, 6, 5), new THREE.MeshStandardMaterial({ color: '#ff5540', emissive: '#ff4030', emissiveIntensity: 2 }), tipItems),
      makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), tankItems),
      makeInstanced(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: windowsTexture(), transparent: true, opacity: 0.4, color: '#9aa2ac', depthWrite: false }),
        windowItems,
      ),
    ]
  }, [])
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {/* elevated conveyor tying the silo corner to the western works */}
      <group>
        <mesh position={[-350, 13, -196]} rotation-y={0.18} castShadow>
          <boxGeometry args={[92, 2.2, 1.8]} />
          <meshStandardMaterial color="#5d6a60" roughness={0.85} />
        </mesh>
        {[-318, -344, -370, -390].map((lx, i) => (
          <mesh key={i} position={[lx, 6, -196 - (lx + 350) * 0.18]}>
            <boxGeometry args={[1.2, 13, 1.2]} />
            <meshStandardMaterial color="#4e5852" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- dynamics
function Dynamics({ weather }: { weather: WeatherDef }) {
  const ferryRef = useRef<THREE.Group>(null)
  const ferryWake = useRef<THREE.Mesh>(null)
  const tugRef = useRef<THREE.Group>(null)
  const tugWake = useRef<THREE.Mesh>(null)
  const gullsRef = useRef<THREE.InstancedMesh>(null)
  const sockYaw = useRef<THREE.Group>(null)
  const sockPitch = useRef<THREE.Group>(null)
  const { scene, camera } = useThree()

  const gullGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const v = new Float32Array([-1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4, 1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    return g
  }, [])

  useFrame((st) => {
    const t = st.clock.elapsedTime
    // ferry crossing the basin: north apron <-> main wharf
    const ferry = ferryRef.current
    if (ferry) {
      const cycle = 70
      const ph = (t % cycle) / cycle
      const leg = ph < 0.5 ? ph * 2 : (1 - ph) * 2
      const ease = Math.min(1, Math.max(0, (leg - 0.05) / 0.9))
      const a = { x: 90, z: -120 }
      const b = { x: 55, z: 100 }
      ferry.position.set(a.x + (b.x - a.x) * ease, 0, a.z + (b.z - a.z) * ease)
      ferry.rotation.y = ph < 0.5 ? Math.atan2(-(b.x - a.x), -(b.z - a.z)) : Math.atan2(b.x - a.x, b.z - a.z)
      const w = ferryWake.current
      if (w) {
        const moving = ease > 0.01 && ease < 0.99
        w.visible = moving
        ;(w.material as THREE.MeshBasicMaterial).opacity = moving ? 0.35 : 0
      }
    }
    // tug loop in the west basin
    const tug = tugRef.current
    if (tug) {
      const a = t * 0.05
      tug.position.set(-70 + Math.cos(a) * 55, 0, 20 + Math.sin(a) * 45)
      tug.rotation.y = -a + Math.PI / 2 + 0.4
      if (tugWake.current) (tugWake.current.material as THREE.MeshBasicMaterial).opacity = 0.3
    }
    // gulls circling the headland
    const gulls = gullsRef.current
    if (gulls) {
      const m = new THREE.Matrix4()
      for (let i = 0; i < 12; i++) {
        const a = t * (0.25 + (i % 4) * 0.07) + i * 1.7
        const r = 22 + (i % 5) * 8
        const x = NOBBYS.x + Math.cos(a) * r - 8
        const z = NOBBYS.z + Math.sin(a) * r
        const y = NOBBYS.height + 14 + Math.sin(t * 1.4 + i) * 4 + (i % 3) * 4
        const flap = 1 + Math.sin(t * 9 + i * 2) * 0.35
        m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1.6, flap, 1.6))
        gulls.setMatrixAt(i, m)
      }
      gulls.instanceMatrix.needsUpdate = true
    }
    // windsock by the launch pad: points downwind, droops when calm
    if (sockYaw.current && sockPitch.current) {
      const w = windAt(weather, { x: -120, y: 8, z: -128 }, t)
      const sp = Math.hypot(w.x, w.z)
      if (sp > 0.2) sockYaw.current.rotation.y = Math.atan2(w.x, w.z)
      sockPitch.current.rotation.x = (1 - Math.min(1, sp / 9)) * 1.15 + Math.sin(t * 5) * 0.04 * Math.min(1, sp / 4)
    }
    // surf pulse + distance culling
    const surf = scene.getObjectByName('surf') as THREE.InstancedMesh | undefined
    if (surf) (surf.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1)) * (1 + weather.whitecaps)
    const cam = camera.position
    const dCity = Math.hypot(cam.x - 260, cam.z - 40)
    const windows = scene.getObjectByName('cityWindows')
    if (windows) windows.visible = dCity < 850
    const awnings = scene.getObjectByName('cityAwnings')
    if (awnings) awnings.visible = dCity < 560
    const prom = scene.getObjectByName('promenadeDetail')
    if (prom) prom.visible = dCity < 680
    if (gulls) gulls.visible = Math.hypot(cam.x - NOBBYS.x, cam.z - NOBBYS.z) < 720
  })

  return (
    <group>
      <instancedMesh ref={gullsRef} args={[gullGeo, undefined, 12]} frustumCulled={false}>
        <meshBasicMaterial color="#e8ecef" side={THREE.DoubleSide} />
      </instancedMesh>
      <group ref={ferryRef}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[6, 2, 14]} />
          <meshStandardMaterial color="#2e6e4e" roughness={0.7} />
        </mesh>
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[4.6, 1.8, 9]} />
          <meshStandardMaterial color="#e9e6dd" roughness={0.7} />
        </mesh>
        <mesh ref={ferryWake} position={[0, 0.15, 12]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[4, 16]} />
          <meshBasicMaterial color="#dfe8ec" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
      {/* windsock beside the launch pad */}
      <group position={[-120, WHARF_DECK, -128]}>
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 6, 6]} />
          <meshStandardMaterial color="#d8d5cc" />
        </mesh>
        <group ref={sockYaw} position={[0, 6, 0]}>
          <group ref={sockPitch}>
            <mesh position={[0, 0, 1.35]} rotation-x={Math.PI / 2}>
              <coneGeometry args={[0.42, 2.6, 8, 1, true]} />
              <meshStandardMaterial color="#ff7a1a" side={THREE.DoubleSide} roughness={0.8} />
            </mesh>
          </group>
        </group>
      </group>
      <group ref={tugRef}>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[4.5, 2, 10]} />
          <meshStandardMaterial color="#2f4a5a" roughness={0.8} />
        </mesh>
        <mesh position={[0, 2.6, -1]}>
          <boxGeometry args={[3.4, 1.6, 4]} />
          <meshStandardMaterial color="#c9cdd2" roughness={0.7} />
        </mesh>
        <mesh ref={tugWake} position={[0, 0.15, 9]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[3.4, 13]} />
          <meshBasicMaterial color="#dfe8ec" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- spray (gusty)
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

// ---------------------------------------------------------------- root
export function Harbour({ weather }: { weather: WeatherDef }) {
  const { scene } = useThree()
  useMemo(() => {
    scene.fog = new THREE.FogExp2(weather.fogColor, weather.fogDensity)
    return null
  }, [scene, weather])
  const gusty = weather.whitecaps > 0
  void BASIN
  void CHANNEL

  return (
    <group>
      <Sky weather={weather} />
      <Water weather={weather} />
      <hemisphereLight args={['#b9cbd8', '#3a424a', weather.hemiIntensity]} />
      <ambientLight intensity={0.22} />

      <Terrain />
      <Shoreline />

      {WHARVES.map((wh, i) => (
        <group key={i}>
          <mesh position={[wh.x, wh.y, wh.z]} receiveShadow>
            <boxGeometry args={[wh.w, wh.h, wh.d]} />
            <meshStandardMaterial color="#565d64" roughness={0.95} />
          </mesh>
          <mesh position={[wh.x, WHARF_DECK + 0.02, wh.z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[wh.w, wh.d]} />
            <meshStandardMaterial color="#4b5259" roughness={0.95} />
          </mesh>
        </group>
      ))}

      <Containers />
      <PortMachines />
      {SHIPS.map((s, i) => (
        <Ship key={i} x={s.x} z={s.z} w={s.w} d={s.d} rot={s.rot} kind={s.kind} />
      ))}
      <PortProps />
      <CoalTrain />
      <Buoys />

      <Breakwater bw={BREAKWALL} color="#6e6a60" />
      <Breakwater bw={STOCKTON_BW} color="#69655c" />
      <group position={[STOCKTON_BW.x1, STOCKTON_BW.top, STOCKTON_BW.z1]}>
        <mesh position={[0, 2.4, 0]}>
          <cylinderGeometry args={[0.25, 0.35, 4.8, 6]} />
          <meshStandardMaterial color="#d8d5cc" />
        </mesh>
        <mesh position={[0, 5, 0]}>
          <sphereGeometry args={[0.45, 8, 6]} />
          <meshStandardMaterial color="#ff5540" emissive="#ff4030" emissiveIntensity={gusty ? 3 : 1} />
        </mesh>
      </group>

      <Headland gusty={gusty} />
      <OldBattery />
      <HarboursideTower />
      <Cathedral />
      <City gusty={gusty} />
      <Foreshore />
      <NorthSuburb />
      <OuterRises />
      <FarWestIndustry />
      <Dynamics weather={weather} />

      {gusty && <Spray weather={weather} />}
    </group>
  )
}
