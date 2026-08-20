// Newcastle Harbour, seen from the water. Working port around the player,
// Nobbys Head and its squat lighthouse at the entrance, the city foreshore
// and CBD along the southern bank, Stockton across the channel.
// Everything repeated is an InstancedMesh; detail layers cull by distance.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  WHARVES, STACKS, CRANES, LOADERS, SHIPS, BUOYS, COAL_PILES,
  NORTH_BANK, SOUTH_HINTERLAND, CITY_LAND, STOCKTON_LAND, BEACH,
  NOBBYS, LIGHTHOUSE, BREAKWALL, STOCKTON_BW, WHARF_DECK,
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
      <sphereGeometry args={[1000, 16, 12]} />
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

// ---------------------------------------------------------------- port machines
// cranes and shiploaders as instanced parts: one draw call per part type
interface PartDef { size: [number, number, number]; locals: Array<[number, number, number, number?, number?]> } // pos + rotX + rotZ
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
    const mesh = makeInstanced(
      new THREE.BoxGeometry(...p.size),
      new THREE.MeshStandardMaterial({ color: colors[key], roughness: 0.75 }),
      items,
      true,
    )
    meshes.push(mesh)
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
        weight: { size: [6, 4.5, 6], locals: [[0, 24.5, -9]] },
      },
      { leg: '#4e5d54', bogie: '#333a42', girder: '#4e5d54', boom: '#5d6e63', weight: '#333a42' },
      2.5,
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

// ---------------------------------------------------------------- land + landmarks
function Landmasses() {
  return (
    <group>
      {[NORTH_BANK, SOUTH_HINTERLAND].map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} receiveShadow>
          <boxGeometry args={[p.w, p.h, p.d]} />
          <meshStandardMaterial color="#4f555b" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[CITY_LAND.x, CITY_LAND.y, CITY_LAND.z]}>
        <boxGeometry args={[CITY_LAND.w, CITY_LAND.h, CITY_LAND.d]} />
        <meshStandardMaterial color="#5a5c58" roughness={0.95} />
      </mesh>
      <mesh position={[STOCKTON_LAND.x, STOCKTON_LAND.y, STOCKTON_LAND.z]}>
        <boxGeometry args={[STOCKTON_LAND.w, STOCKTON_LAND.h, STOCKTON_LAND.d]} />
        <meshStandardMaterial color="#5e6156" roughness={0.95} />
      </mesh>
      {/* Horseshoe Beach: sand nestled against the shoreline by the breakwall root */}
      <mesh position={[BEACH.x, BEACH.y, BEACH.z]}>
        <boxGeometry args={[BEACH.w, BEACH.h, BEACH.d]} />
        <meshStandardMaterial color="#b09c74" roughness={1} />
      </mesh>
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
      {/* walking path along the top */}
      <mesh position={[0, bw.top + 0.06, 0]}>
        <boxGeometry args={[len, 0.12, bw.w * 0.45]} />
        <meshStandardMaterial color="#9a938a" roughness={0.9} />
      </mesh>
    </group>
  )
}

function Nobbys({ gusty }: { gusty: boolean }) {
  const beamRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (beamRef.current) beamRef.current.rotation.y += dt * 0.9
  })
  const H = NOBBYS.height
  return (
    <group position={[NOBBYS.x, 0, NOBBYS.z]}>
      {/* flat-topped headland, steep grassy-brown sides */}
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.baseR, H, 9]} />
        <meshStandardMaterial color="#6f6a49" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, H + 0.05, 0]}>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.topR, 0.1, 9]} />
        <meshStandardMaterial color="#77784e" roughness={1} />
      </mesh>

      {/* the lighthouse: deliberately SHORT — a squat 9 m white stone tower */}
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
        {/* the lamp, always faintly visible, bright in the gusty preset */}
        <mesh position={[0, 8.2, 0]}>
          <sphereGeometry args={[0.7, 10, 8]} />
          <meshStandardMaterial color="#fff2c0" emissive="#ffdf80" emissiveIntensity={gusty ? 4 : 0.8} />
        </mesh>
        <mesh position={[0, 9.3, 0]}>
          <coneGeometry args={[1.5, 1.2, 10]} />
          <meshStandardMaterial color="#b8412f" roughness={0.7} />
        </mesh>
        {/* rotating beam in low light */}
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

      {/* Signal Station + Port Watch: noticeably LARGER than the tower */}
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
        {/* signal mast */}
        <mesh position={[-4, 9, -2]}>
          <cylinderGeometry args={[0.12, 0.18, 8, 6]} />
          <meshStandardMaterial color="#dddad2" />
        </mesh>
      </group>
    </group>
  )
}

function FortScratchley() {
  return (
    <group position={[322, CITY_LAND.y + CITY_LAND.h / 2, 200]}>
      <mesh position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[20, 30, 12, 8]} />
        <meshStandardMaterial color="#6b6b4d" flatShading roughness={1} />
      </mesh>
      {/* stone ramparts + parade ground */}
      <mesh position={[0, 12.6, 0]}>
        <cylinderGeometry args={[18.5, 18.5, 1.2, 8]} />
        <meshStandardMaterial color="#767c52" roughness={1} />
      </mesh>
      <mesh position={[0, 13.8, 0]}>
        <cylinderGeometry args={[18.5, 18.5, 1.6, 8, 1, true]} />
        <meshStandardMaterial color="#8f8a7a" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* gun emplacements facing the sea (east) */}
      {[-8, 8].map((oz) => (
        <group key={oz} position={[12, 13.6, oz]}>
          <mesh>
            <cylinderGeometry args={[2.4, 2.8, 1.6, 8]} />
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

function QueensWharfTower() {
  return (
    <group position={[235, WHARF_DECK, 178]}>
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
  // sandstone cathedral with a square tower, high on the hill behind the CBD —
  // tall enough that the tower breaks the skyline from the water
  return (
    <group position={[250, 0, 342]}>
      <mesh position={[0, 26, 0]}>
        <cylinderGeometry args={[44, 72, 52, 10]} />
        <meshStandardMaterial color="#5d6148" flatShading roughness={1} />
      </mesh>
      <group position={[0, 52, 0]}>
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

// ---------------------------------------------------------------- city (instanced)
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

function City({ gusty }: { gusty: boolean }) {
  const groundY = CITY_LAND.y + CITY_LAND.h / 2
  const { blocks, glass, windows, foreshore, awnings } = useMemo(() => {
    const rnd = mulberry32(31)
    const concrete: Inst[] = []
    const glassItems: Inst[] = []
    const windowItems: Inst[] = []
    const palette = ['#8d8579', '#9aa0a2', '#7b7268', '#a39d8b', '#6f6d6a']

    // CBD: jagged, mostly boxy, a handful of glass towers
    for (let i = 0; i < 48; i++) {
      const x = 140 + rnd() * 255
      const z = 232 + rnd() * 92
      if (x > 295 && z < 250) continue // keep the fort's rise clear
      if (Math.hypot(x - 250, z - 342) < 82) continue // cathedral hill
      let h = 20 + rnd() * 28
      if (rnd() < 0.22) h = 52 + rnd() * 38
      if (x > 195 && x < 310 && h > 46) h = 46 // keep the cathedral's silhouette clear
      const w = 15 + rnd() * 16
      const d = 15 + rnd() * 16
      const isGlass = rnd() < 0.26
      const item = { m: mat4(x, groundY + h / 2, z, (rnd() - 0.5) * 0.12, w, h, d) }
      if (isGlass) glassItems.push(item)
      else concrete.push({ ...item, c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]) })
      // lit-window plane on the north (harbour-facing) face
      windowItems.push({ m: mat4(x, groundY + h / 2, z - d / 2 - 0.15, 0, w * 0.92, h * 0.88, 1) })
    }

    // foreshore: 3-6 storey warm brick frontages behind the promenade
    const fore: Inst[] = []
    const awn: Inst[] = []
    const warm = ['#a3684a', '#b98a5f', '#8a5a44', '#c2a58a', '#96705a']
    for (const rowZ of [192, 208]) {
      let x = 138
      while (x < 395) {
        const w = 12 + rnd() * 10
        if (x > 290 && x < 362) { x += w + 2; continue } // fort + breakwall root
        const h = 9 + rnd() * 13
        const d = 11 + rnd() * 6
        const z = rowZ + rnd() * 6
        fore.push({ m: mat4(x + w / 2, groundY + h / 2, z, 0, w, h, d), c: new THREE.Color(warm[Math.floor(rnd() * warm.length)]) })
        if (rowZ === 192) awn.push({ m: mat4(x + w / 2, groundY + 3.4, z - d / 2 - 1, 0, w * 0.9, 0.3, 2.2) })
        windowItems.push({ m: mat4(x + w / 2, groundY + h / 2, z - d / 2 - 0.15, 0, w * 0.9, h * 0.8, 1) })
        x += w + 3 + rnd() * 4
      }
    }

    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    boxGeo.translate(0, 0, 0)
    const blocks = makeInstanced(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), concrete)
    const glass = makeInstanced(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: '#6d8ba3', metalness: 0.65, roughness: 0.25 }),
      glassItems,
    )
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
      windowItems.map((w) => {
        const m = w.m.clone()
        m.multiply(new THREE.Matrix4().makeRotationY(Math.PI)) // face -z (the harbour)
        return { m }
      }),
    )
    windows.renderOrder = 2
    return { blocks, glass, windows, foreshore: foreshoreMesh, awnings }
  }, [groundY, gusty])
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

function Promenade() {
  const groundY = CITY_LAND.y + CITY_LAND.h / 2
  const { poles, lamps, trunks, crowns } = useMemo(() => {
    const rnd = mulberry32(17)
    const poleItems: Inst[] = []
    const lampItems: Inst[] = []
    for (let x = 138; x <= 396; x += 13) {
      if (x > 292 && x < 362) continue
      poleItems.push({ m: mat4(x, groundY + 2.6, 173, 0, 1, 1, 1) })
      lampItems.push({ m: mat4(x, groundY + 5.1, 173) })
    }
    const trunkItems: Inst[] = []
    const crownItems: Inst[] = []
    for (let x = 142; x <= 392; x += 10) {
      if (x > 288 && x < 364) continue
      const palm = rnd() < 0.7
      const h = palm ? 5.5 + rnd() * 2.5 : 3 + rnd()
      const zz = 180 + rnd() * 4
      trunkItems.push({ m: mat4(x + (rnd() - 0.5) * 4, groundY + h / 2, zz, 0, 1, h / 6, 1) })
      crownItems.push({
        m: mat4(x + (rnd() - 0.5) * 4, groundY + h + (palm ? 0.6 : 1.6), zz, rnd() * 3, palm ? 1 : 2.2, palm ? 0.8 : 1.7, palm ? 1 : 2.2),
        c: new THREE.Color(palm ? '#4e7a3a' : '#3c5e33'),
      })
    }
    return {
      poles: makeInstanced(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), new THREE.MeshStandardMaterial({ color: '#454c53' }), poleItems),
      lamps: makeInstanced(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffdf90', emissiveIntensity: 1.6 }), lampItems),
      trunks: makeInstanced(new THREE.CylinderGeometry(0.16, 0.24, 6, 5), new THREE.MeshStandardMaterial({ color: '#7a6248' }), trunkItems),
      crowns: makeInstanced(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), crownItems),
    }
  }, [groundY])
  return (
    <group name="promenadeDetail">
      {/* paved promenade + sea wall */}
      <mesh position={[265, groundY + 0.12, 177]}>
        <boxGeometry args={[264, 0.24, 16]} />
        <meshStandardMaterial color="#87837a" roughness={0.95} />
      </mesh>
      <mesh position={[265, groundY + 0.5, 169.2]}>
        <boxGeometry args={[264, 1.4, 1.2]} />
        <meshStandardMaterial color="#7b766c" roughness={1} />
      </mesh>
      <mesh position={[265, groundY + 1.35, 169.2]}>
        <boxGeometry args={[264, 0.12, 0.8]} />
        <meshStandardMaterial color="#2f363d" roughness={0.6} />
      </mesh>
      <primitive object={poles} />
      <primitive object={lamps} />
      <primitive object={trunks} />
      <primitive object={crowns} />
    </group>
  )
}

// ---------------------------------------------------------------- stockton
function Stockton() {
  const groundY = STOCKTON_LAND.y + STOCKTON_LAND.h / 2
  const { walls, roofs } = useMemo(() => {
    const rnd = mulberry32(23)
    const wallItems: Inst[] = []
    const roofItems: Inst[] = []
    const wallCols = ['#c9bfa8', '#b8c0c4', '#c7a98a', '#a8b090', '#cfc6b0']
    const roofCols = ['#8a4a3b', '#5d6468', '#7a5a48', '#4e5a60']
    for (let gz = 0; gz < 6; gz++) {
      for (let gx = 0; gx < 9; gx++) {
        if (rnd() < 0.14) continue
        const x = 168 + gx * 25 + (rnd() - 0.5) * 7
        const z = -152 - gz * 26 - (rnd() - 0.5) * 7
        const two = rnd() < 0.25
        const h = two ? 5.6 : 3.2
        const ry = (rnd() - 0.5) * 0.2 + (gz % 2 ? Math.PI / 2 : 0)
        wallItems.push({ m: mat4(x, groundY + h / 2, z, ry), c: new THREE.Color(wallCols[Math.floor(rnd() * wallCols.length)]) })
        roofItems.push({ m: mat4(x, groundY + h + 1.1, z, ry + Math.PI / 4), c: new THREE.Color(roofCols[Math.floor(rnd() * roofCols.length)]) })
      }
    }
    return {
      walls: makeInstanced(new THREE.BoxGeometry(8.5, 3.2, 7), new THREE.MeshStandardMaterial({ roughness: 0.95 }), wallItems),
      roofs: makeInstanced(new THREE.ConeGeometry(6, 2.4, 4), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), roofItems),
    }
  }, [groundY])
  return (
    <group>
      <primitive object={walls} />
      <primitive object={roofs} />
      {/* ferry wharf */}
      <group position={[185, 0, -128]}>
        <mesh position={[0, 2, -5]}>
          <boxGeometry args={[16, 1.2, 22]} />
          <meshStandardMaterial color="#6b6257" roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.6, -12]}>
          <boxGeometry args={[10, 2.6, 6]} />
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
      siloItems.push({ m: mat4(-302 + (i % 4) * 14, 2.5 + 14, -160 - Math.floor(i / 4) * 14, 0) })
    }
    const shedItems: Inst[] = []
    const shedSpots: Array<[number, number, number]> = [
      [-240, -160, 0], [-60, -246, 0.1], [70, -246, 0], [-250, 290, 0.05], [20, 292, 0], [60, 283, 0.1],
    ]
    for (const [x, z, r] of shedSpots) {
      shedItems.push({ m: mat4(x, 2.5 + 5, z, r, 42 + rnd() * 10, 10, 20 + rnd() * 6), c: new THREE.Color(rnd() < 0.5 ? '#7d8288' : '#8d857a') })
    }
    const pileItems: Inst[] = COAL_PILES.map((p) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, 2.5, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
        new THREE.Vector3(p.h, p.w / 2, p.d / 2), // cylinder axis along x after rotZ
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

function FarWestIndustry() {
  const mesh = useMemo(() => {
    const rnd = mulberry32(53)
    const items: Inst[] = []
    for (let i = 0; i < 26; i++) {
      const x = -430 - rnd() * 130
      const z = -180 + rnd() * 340
      const h = 10 + rnd() * 30
      const c = 0.3 + rnd() * 0.12
      items.push({ m: mat4(x, h / 2, z, rnd(), 24 + rnd() * 36, h, 20 + rnd() * 26), c: new THREE.Color(c * 0.95, c, c * 1.05) })
    }
    return makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), items)
  }, [])
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------- horizon ring
// hills and suburbs close the view south and behind Stockton so the
// horizon reads as land, not endless water
function SouthRise() {
  const { mounds, suburbs } = useMemo(() => {
    const rnd = mulberry32(61)
    const moundItems: Inst[] = [
      { m: mat4(-60, 0, 448, 0.2, 180, 52, 130), c: new THREE.Color('#5a5e44') },
      { m: mat4(120, 0, 458, 0.5, 230, 68, 150), c: new THREE.Color('#565a42') },
      { m: mat4(290, 0, 442, 0.9, 170, 46, 120), c: new THREE.Color('#5e6248') },
      { m: mat4(-230, 0, 420, 0.3, 160, 38, 110), c: new THREE.Color('#585c44') },
    ]
    const suburbItems: Inst[] = []
    for (let i = 0; i < 42; i++) {
      const x = -180 + rnd() * 480
      const z = 402 + rnd() * 42
      const c = 0.55 + rnd() * 0.2
      suburbItems.push({ m: mat4(x, 3 + rnd() * 10, z, rnd(), 9 + rnd() * 8, 4 + rnd() * 3, 8 + rnd() * 7), c: new THREE.Color(c, c * 0.93, c * 0.83) })
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
      {/* back plate under the rise */}
      <mesh position={[60, 1.4, 435]}>
        <boxGeometry args={[560, 2.8, 80]} />
        <meshStandardMaterial color="#565a4a" roughness={1} />
      </mesh>
      <primitive object={mounds} />
      <primitive object={suburbs} />
    </group>
  )
}

function StocktonDunes() {
  const mounds = useMemo(() => {
    const items: Inst[] = [
      { m: mat4(210, 0, -318, 0.1, 160, 16, 60), c: new THREE.Color('#7a7458') },
      { m: mat4(330, 0, -324, -0.15, 150, 20, 55), c: new THREE.Color('#767052') },
      { m: mat4(120, 0, -310, 0.3, 90, 12, 45), c: new THREE.Color('#7e785c') },
    ]
    const cone = new THREE.ConeGeometry(0.5, 1, 6)
    cone.translate(0, 0.5, 0)
    return makeInstanced(cone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), items)
  }, [])
  return (
    <group>
      <mesh position={[240, 0.9, -318]}>
        <boxGeometry args={[330, 1.8, 60]} />
        <meshStandardMaterial color="#6e6852" roughness={1} />
      </mesh>
      <primitive object={mounds} />
    </group>
  )
}

// ---------------------------------------------------------------- ocean baths (scenery)
function OceanBaths() {
  return (
    <group position={[420, 0, 170]}>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[70, 1.6, 44]} />
        <meshStandardMaterial color="#7d7568" roughness={1} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[56, 0.5, 30]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[52, 0.3, 26]} />
        <meshStandardMaterial color="#3c7d8a" roughness={0.3} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------- dynamics
// moving vessels with wakes, circling gulls, foam on the breakwalls,
// distance culling for the detail layers
function Dynamics({ weather }: { weather: WeatherDef }) {
  const ferryRef = useRef<THREE.Group>(null)
  const ferryWake = useRef<THREE.Mesh>(null)
  const tugRef = useRef<THREE.Group>(null)
  const tugWake = useRef<THREE.Mesh>(null)
  const gullsRef = useRef<THREE.InstancedMesh>(null)
  const foamMat = useRef<THREE.MeshBasicMaterial>(null)
  const { scene, camera } = useThree()

  const gullGeo = useMemo(() => {
    // a shallow V: two triangles
    const g = new THREE.BufferGeometry()
    const v = new Float32Array([-1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4, 1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    return g
  }, [])

  const foam = useMemo(() => {
    const items: Inst[] = []
    // seaward side of both breakwalls + the base of Nobbys
    for (let t = 0.05; t < 1; t += 0.09) {
      const x = BREAKWALL.x0 + (BREAKWALL.x1 - BREAKWALL.x0) * t
      const z = BREAKWALL.z0 + (BREAKWALL.z1 - BREAKWALL.z0) * t
      items.push({ m: mat4(x + 3, 0.25, z + 7, Math.atan2(69, 206), 16, 1, 6) })
    }
    for (let t = 0.1; t < 1; t += 0.18) {
      const x = STOCKTON_BW.x0 + (STOCKTON_BW.x1 - STOCKTON_BW.x0) * t
      const z = STOCKTON_BW.z0 + (STOCKTON_BW.z1 - STOCKTON_BW.z0) * t
      items.push({ m: mat4(x + 5, 0.25, z + 1, -0.85, 14, 1, 5) })
    }
    for (let a = -0.8; a < 1.6; a += 0.35) {
      items.push({ m: mat4(NOBBYS.x + Math.cos(a) * 55, 0.25, NOBBYS.z + Math.sin(a) * 52, -a, 20, 1, 7) })
    }
    const mat = new THREE.MeshBasicMaterial({ color: '#dfe8ec', transparent: true, opacity: 0.4, depthWrite: false })
    const m = makeInstanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, items)
    m.renderOrder = 1
    return m
  }, [])

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime
    void dt
    // ferry: Stockton wharf <-> Queens Wharf, pausing at each end
    const ferry = ferryRef.current
    if (ferry) {
      const cycle = 90
      const ph = (t % cycle) / cycle
      const leg = ph < 0.5 ? ph * 2 : (1 - ph) * 2
      const ease = Math.min(1, Math.max(0, (leg - 0.04) / 0.92))
      const a = { x: 185, z: -112 }
      const b = { x: 228, z: 158 }
      ferry.position.set(a.x + (b.x - a.x) * ease, 0, a.z + (b.z - a.z) * ease)
      ferry.rotation.y = ph < 0.5 ? Math.atan2(-(b.x - a.x), -(b.z - a.z)) : Math.atan2(b.x - a.x, b.z - a.z)
      const w = ferryWake.current
      if (w) {
        const moving = ease > 0.01 && ease < 0.99
        w.visible = moving
        ;(w.material as THREE.MeshBasicMaterial).opacity = moving ? 0.35 : 0
      }
    }
    // tug: slow loop in the west basin
    const tug = tugRef.current
    if (tug) {
      const a = t * 0.05
      tug.position.set(-60 + Math.cos(a) * 55, 0, 30 + Math.sin(a) * 45)
      tug.rotation.y = -a + Math.PI / 2 + 0.4
      if (tugWake.current) (tugWake.current.material as THREE.MeshBasicMaterial).opacity = 0.3
    }
    // gulls circling Nobbys
    const gulls = gullsRef.current
    if (gulls) {
      const m = new THREE.Matrix4()
      for (let i = 0; i < 12; i++) {
        const a = t * (0.25 + (i % 4) * 0.07) + i * 1.7
        const r = 24 + (i % 5) * 9
        const x = NOBBYS.x + Math.cos(a) * r - 8
        const z = NOBBYS.z + Math.sin(a) * r
        const y = NOBBYS.height + 14 + Math.sin(t * 1.4 + i) * 4 + (i % 3) * 4
        const flap = 1 + Math.sin(t * 9 + i * 2) * 0.35
        m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1.6, flap, 1.6))
        gulls.setMatrixAt(i, m)
      }
      gulls.instanceMatrix.needsUpdate = true
    }
    // foam pulse
    if (foamMat.current) foamMat.current.opacity = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1)) * (1 + weather.whitecaps)
    // distance culling for detail layers
    const cam = camera.position
    const dCity = Math.hypot(cam.x - 265, cam.z - 250)
    const windows = scene.getObjectByName('cityWindows')
    if (windows) windows.visible = dCity < 780
    const awnings = scene.getObjectByName('cityAwnings')
    if (awnings) awnings.visible = dCity < 520
    const prom = scene.getObjectByName('promenadeDetail')
    if (prom) prom.visible = dCity < 620
    if (gulls) gulls.visible = Math.hypot(cam.x - NOBBYS.x, cam.z - NOBBYS.z) < 700
  })

  // grab the foam material ref once mounted
  const foamPrimitive = (
    <primitive
      object={foam}
      onUpdate={(o: THREE.InstancedMesh) => {
        foamMat.current = o.material as THREE.MeshBasicMaterial
      }}
    />
  )

  return (
    <group>
      {foamPrimitive}
      <instancedMesh ref={gullsRef} args={[gullGeo, undefined, 12]} frustumCulled={false}>
        <meshBasicMaterial color="#e8ecef" side={THREE.DoubleSide} />
      </instancedMesh>
      {/* the Stockton ferry */}
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
      {/* a working tug */}
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
          <mesh position={[wh.x, WHARF_DECK + 0.02, wh.z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[wh.w, wh.d]} />
            <meshStandardMaterial color="#4b5259" roughness={0.95} />
          </mesh>
        </group>
      ))}

      <Landmasses />
      <Containers />
      <PortMachines />
      {SHIPS.map((s, i) => (
        <Ship key={i} x={s.x} z={s.z} w={s.w} d={s.d} rot={s.rot} kind={s.kind} />
      ))}
      <PortProps />
      <Buoys />

      <Breakwater bw={BREAKWALL} color="#6e6a60" />
      <Breakwater bw={STOCKTON_BW} color="#69655c" />
      {/* beacon at the Stockton breakwater tip */}
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

      <Nobbys gusty={gusty} />
      <FortScratchley />
      <QueensWharfTower />
      <Cathedral />
      <City gusty={gusty} />
      <Promenade />
      <Stockton />
      <SouthRise />
      <StocktonDunes />
      <OceanBaths />
      <FarWestIndustry />
      <Dynamics weather={weather} />

      {gusty && <Spray weather={weather} />}
    </group>
  )
}
