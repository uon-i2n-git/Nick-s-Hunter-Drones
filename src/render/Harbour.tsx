// Newcastle Harbour. Water is a plane at y=0; everything else stands on
// terrain above it with a visible shoreline. Working port around the player,
// the city rising on the south bank, Stockton across the channel, Nobbys Head
// and its squat lighthouse at the entrance.
// Everything repeated is an InstancedMesh; detail layers cull by distance.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  WHARVES, STACKS, CRANES, LOADERS, SHIPS, BUOYS, COAL_PILES,
  NOBBYS, LIGHTHOUSE, BREAKWALL, STOCKTON_BW, WHARF_DECK, BEACH,
  terrainHeight, coastZ,
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
// vertex-coloured heightfields: grass with asphalt mottling, dipping below
// the water outside the coastline so the shoreline emerges naturally
function makeField(
  x0: number, x1: number, z0: number, z1: number, step: number,
  heightFn: (x: number, z: number) => number,
  colorFn: (x: number, z: number, rnd: () => number) => THREE.Color,
): THREE.Mesh {
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
    pos.setY(i, heightFn(x, z))
    c.copy(colorFn(x, z, rnd))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
  mesh.receiveShadow = true
  return mesh
}

const GRASS = new THREE.Color('#5b7146')
const GRASS2 = new THREE.Color('#6a7d4e')
const ASPHALT = new THREE.Color('#5c6164')
const DIRT = new THREE.Color('#7d7358')

function Terrain() {
  const meshes = useMemo(() => {
    // south bank: port back-land flat, city rising 4 -> 18, bay recess east
    const south = makeField(-320, 700, 138, 470, 20,
      (x, z) => (z < coastZ(x) ? -1.8 : terrainHeight(x, z) - 0.05),
      (x, z, rnd) => {
        if (z < coastZ(x)) return ASPHALT // hidden underwater
        if (x < 150 && z <= 330) return rnd() < 0.6 ? ASPHALT.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.05) : DIRT.clone()
        const g = rnd() < 0.75 ? GRASS : GRASS2
        return g.clone().offsetHSL(0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.06)
      },
    )
    // north bank: flat Stockton land behind the coal apron
    const north = makeField(-320, 440, -470, -238, 22,
      (x, z) => terrainHeight(x, z) - 0.05,
      (x, _z, rnd) => {
        const g = x < 140 ? (rnd() < 0.6 ? ASPHALT : DIRT) : rnd() < 0.7 ? GRASS2 : DIRT
        return g.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.05)
      },
    )
    return [south, north]
  }, [])
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {/* Horseshoe Beach: sand in the bay corner */}
      <mesh position={[BEACH.x, BEACH.y, BEACH.z]}>
        <boxGeometry args={[BEACH.w, BEACH.h, BEACH.d]} />
        <meshStandardMaterial color="#b09c74" roughness={1} />
      </mesh>
    </group>
  )
}

// shoreline: white surf strips + rocky revetment along non-wharf edges
function Shoreline() {
  const { surf, rocks } = useMemo(() => {
    const surfItems: Inst[] = []
    const rockItems: Inst[] = []
    const addRun = (x0: number, z0: number, x1: number, z1: number, n: number, revet: boolean) => {
      const ry = Math.atan2(-(z1 - z0), x1 - x0)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        surfItems.push({ m: mat4(x, 0.22, z, ry, (Math.hypot(x1 - x0, z1 - z0) / n) * 1.15, 1, 5) })
        if (revet) rockItems.push({ m: mat4(x, 0.8, z, ry, Math.hypot(x1 - x0, z1 - z0) / n + 2, 2.2, 4) })
      }
    }
    addRun(-320, 137, -152, 137, 6, true) // port back-land west of the wharf
    addRun(152, 136, 432, 136, 9, false) // city sea wall front
    addRun(432, 141, 690, 373, 10, true) // the receding bay coast
    addRun(-320, -177, 252, -177, 12, false) // north apron front (concrete)
    addRun(255, -239, 435, -239, 6, true) // stockton shore east of the apron
    // around Nobbys base + both breakwaters
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      surfItems.push({ m: mat4(NOBBYS.x + Math.cos(a) * (NOBBYS.baseR + 4), 0.22, NOBBYS.z + Math.sin(a) * (NOBBYS.baseR + 2), -a, 24, 1, 6) })
    }
    for (const bw of [BREAKWALL, STOCKTON_BW]) {
      const n = 6
      const ry = Math.atan2(-(bw.z1 - bw.z0), bw.x1 - bw.x0)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        surfItems.push({ m: mat4(bw.x0 + (bw.x1 - bw.x0) * t, 0.22, bw.z0 + (bw.z1 - bw.z0) * t + 7, ry, 30, 1, 5) })
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
        weight: { size: [6, 4.5, 6], locals: [[0, 24.5, -9]] },
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

// ---------------------------------------------------------------- Nobbys
function Nobbys({ gusty }: { gusty: boolean }) {
  const beamRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (beamRef.current) beamRef.current.rotation.y += dt * 0.9
  })
  const H = NOBBYS.height
  return (
    <group position={[NOBBYS.x, 0, NOBBYS.z]}>
      {/* steep grassy-brown headland, flat top */}
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.baseR, H, 9]} />
        <meshStandardMaterial color="#6f6a49" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, H + 0.05, 0]}>
        <cylinderGeometry args={[NOBBYS.topR, NOBBYS.topR, 0.1, 9]} />
        <meshStandardMaterial color="#77784e" roughness={1} />
      </mesh>
      {/* cliffs on the seaward (east) face */}
      <mesh position={[NOBBYS.baseR * 0.62, H / 2 - 1, 0]} rotation-y={0.1}>
        <boxGeometry args={[10, H - 2, NOBBYS.baseR * 1.4]} />
        <meshStandardMaterial color="#8a7a5c" flatShading roughness={1} />
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

// ---------------------------------------------------------------- landmarks
function FortScratchley() {
  const y = terrainHeight(400, 190)
  return (
    <group position={[400, y, 190]}>
      <mesh position={[0, 5, 0]} castShadow>
        <cylinderGeometry args={[20, 30, 10, 8]} />
        <meshStandardMaterial color="#6b6b4d" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 10.6, 0]}>
        <cylinderGeometry args={[18.5, 18.5, 1.2, 8]} />
        <meshStandardMaterial color="#767c52" roughness={1} />
      </mesh>
      <mesh position={[0, 11.8, 0]}>
        <cylinderGeometry args={[18.5, 18.5, 1.6, 8, 1, true]} />
        <meshStandardMaterial color="#8f8a7a" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {[-8, 8].map((oz) => (
        <group key={oz} position={[12, 11.6, oz]}>
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
    <group position={[230, 4.2, 149]}>
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
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[40, 62, 16, 10]} />
        <meshStandardMaterial color="#5d6148" flatShading roughness={1} />
      </mesh>
      <group position={[0, 16, 0]}>
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

// sea wall -> promenade -> waterfront road -> foreshore rows -> CBD in depth
function City({ gusty }: { gusty: boolean }) {
  const { blocks, glass, windows, foreshore, awnings } = useMemo(() => {
    const rnd = mulberry32(31)
    const concrete: Inst[] = []
    const glassItems: Inst[] = []
    const windowItems: Inst[] = []
    const palette = ['#8d8579', '#9aa0a2', '#7b7268', '#a39d8b', '#6f6d6a']

    // CBD: at least three rows deep behind the foreshore, 12-90 m jagged
    for (let i = 0; i < 52; i++) {
      const x = 155 + rnd() * 260
      const z = 202 + rnd() * 130
      if (Math.hypot(x - 280, z - 360) < 80) continue // cathedral hill
      if (x > 360 && z < 240) continue // fort rise
      let h = 12 + rnd() * 30
      if (rnd() < 0.24) h = 50 + rnd() * 40
      if (x > 230 && x < 330 && h > 40) h = 40 // keep the cathedral's silhouette clear
      const w = 15 + rnd() * 16
      const d = 15 + rnd() * 16
      const gy = terrainHeight(x, z)
      const isGlass = rnd() < 0.26
      const item = { m: mat4(x, gy + h / 2, z, (rnd() - 0.5) * 0.12, w, h, d) }
      if (isGlass) glassItems.push(item)
      else concrete.push({ ...item, c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]) })
      windowItems.push({ m: mat4(x, gy + h / 2, z - d / 2 - 0.15, 0, w * 0.92, h * 0.88, 1) })
    }

    // foreshore: two rows of 3-6 storey warm frontages behind the waterfront road
    const fore: Inst[] = []
    const awn: Inst[] = []
    const warm = ['#a3684a', '#b98a5f', '#8a5a44', '#c2a58a', '#96705a', '#c7b18e']
    for (const rowZ of [168, 184]) {
      let x = 152
      while (x < 415) {
        const w = 12 + rnd() * 10
        if (x > 355 && x < 372) { x += w + 2; continue } // breakwall root
        const h = 9 + rnd() * 12 // 3-6 storeys
        const d = 11 + rnd() * 6
        const z = rowZ + rnd() * 6
        const gy = terrainHeight(x + w / 2, z)
        fore.push({ m: mat4(x + w / 2, gy + h / 2, z, 0, w, h, d), c: new THREE.Color(warm[Math.floor(rnd() * warm.length)]) })
        if (rowZ === 168) awn.push({ m: mat4(x + w / 2, gy + 3.4, z - d / 2 - 1, 0, w * 0.9, 0.3, 2.2) })
        windowItems.push({ m: mat4(x + w / 2, gy + h / 2, z - d / 2 - 0.15, 0, w * 0.9, h * 0.8, 1) })
        x += w + 3 + rnd() * 4
      }
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
      windowItems.map((w) => {
        const m = w.m.clone()
        m.multiply(new THREE.Matrix4().makeRotationY(Math.PI))
        return { m }
      }),
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

// sea wall, promenade, waterfront road, streets, poles, trees
function Foreshore() {
  const { poles, lamps, trunks, crowns, roads } = useMemo(() => {
    const rnd = mulberry32(17)
    const poleItems: Inst[] = []
    const lampItems: Inst[] = []
    for (let x = 154; x <= 428; x += 13) {
      if (x > 354 && x < 372) continue
      poleItems.push({ m: mat4(x, 4.2 + 2.6, 145) })
      lampItems.push({ m: mat4(x, 4.2 + 5.1, 145) })
    }
    const trunkItems: Inst[] = []
    const crownItems: Inst[] = []
    for (let x = 158; x <= 424; x += 10) {
      if (x > 352 && x < 374) continue
      const palm = rnd() < 0.7
      const h = palm ? 5.5 + rnd() * 2.5 : 3 + rnd()
      const zz = 151 + rnd() * 4
      trunkItems.push({ m: mat4(x + (rnd() - 0.5) * 4, 4.2 + h / 2, zz, 0, 1, h / 6, 1) })
      crownItems.push({
        m: mat4(x + (rnd() - 0.5) * 4, 4.2 + h + (palm ? 0.6 : 1.6), zz, rnd() * 3, palm ? 1 : 2.2, palm ? 0.8 : 1.7, palm ? 1 : 2.2),
        c: new THREE.Color(palm ? '#4e7a3a' : '#3c5e33'),
      })
    }
    // roads: waterfront road + rising cross streets + contour streets + port + apron
    const roadItems: Inst[] = []
    const slope = Math.atan(14 / 260)
    roadItems.push({ m: mat4(290, 4.28, 160, 0, 276, 0.14, 8) }) // waterfront road
    for (const cx of [200, 270, 340]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, terrainHeight(cx, 250) + 0.12, 250),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-slope, 0, 0)),
        new THREE.Vector3(7, 0.14, 185),
      )
      roadItems.push({ m })
    }
    for (const cz of [205, 260, 310]) {
      roadItems.push({ m: mat4(285, terrainHeight(285, cz) + 0.15, cz, 0, 265, 0.14, 7) })
    }
    roadItems.push({ m: mat4(-85, 3.1, 210, 0, 460, 0.14, 8) }) // port back road
    roadItems.push({ m: mat4(-35, 3.1, -206, 0, 560, 0.14, 8) }) // apron road
    for (const cz of [-262, -288]) roadItems.push({ m: mat4(290, 3.05, cz, 0, 250, 0.14, 6) }) // stockton streets
    return {
      poles: makeInstanced(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), new THREE.MeshStandardMaterial({ color: '#454c53' }), poleItems),
      lamps: makeInstanced(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffdf90', emissiveIntensity: 1.6 }), lampItems),
      trunks: makeInstanced(new THREE.CylinderGeometry(0.16, 0.24, 6, 5), new THREE.MeshStandardMaterial({ color: '#7a6248' }), trunkItems),
      crowns: makeInstanced(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), crownItems),
      roads: makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#3a3f43', roughness: 0.95 }), roadItems),
    }
  }, [])
  return (
    <group>
      {/* 4 m concrete sea wall along the city foreshore */}
      <mesh position={[290, 2, 140]} castShadow receiveShadow>
        <boxGeometry args={[280, 4.4, 4]} />
        <meshStandardMaterial color="#8a857b" roughness={0.9} />
      </mesh>
      {/* promenade deck behind it */}
      <mesh position={[290, 4.05, 149]} receiveShadow>
        <boxGeometry args={[280, 0.3, 14]} />
        <meshStandardMaterial color="#87837a" roughness={0.95} />
      </mesh>
      <mesh position={[290, 4.45, 141.2]}>
        <boxGeometry args={[280, 0.5, 0.6]} />
        <meshStandardMaterial color="#2f363d" roughness={0.6} />
      </mesh>
      <primitive object={roads} />
      <group name="promenadeDetail">
        <primitive object={poles} />
        <primitive object={lamps} />
        <primitive object={trunks} />
        <primitive object={crowns} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- stockton
function Stockton() {
  const { walls, roofs } = useMemo(() => {
    const rnd = mulberry32(23)
    const wallItems: Inst[] = []
    const roofItems: Inst[] = []
    const wallCols = ['#c9bfa8', '#b8c0c4', '#c7a98a', '#a8b090', '#cfc6b0']
    const roofCols = ['#8a4a3b', '#5d6468', '#7a5a48', '#4e5a60']
    for (let gz = 0; gz < 6; gz++) {
      for (let gx = 0; gx < 10; gx++) {
        if (rnd() < 0.14) continue
        const x = 168 + gx * 26 + (rnd() - 0.5) * 7
        const z = -254 - gz * 26 - (rnd() - 0.5) * 7
        const two = rnd() < 0.25
        const h = two ? 5.6 : 3.2
        const ry = (rnd() - 0.5) * 0.2 + (gz % 2 ? Math.PI / 2 : 0)
        wallItems.push({ m: mat4(x, 3 + h / 2, z, ry), c: new THREE.Color(wallCols[Math.floor(rnd() * wallCols.length)]) })
        roofItems.push({ m: mat4(x, 3 + h + 1.1, z, ry + Math.PI / 4), c: new THREE.Color(roofCols[Math.floor(rnd() * roofCols.length)]) })
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
      {/* ferry wharf reaching out from the apron */}
      <group position={[185, 0, -232]}>
        <mesh position={[0, 2, 22]}>
          <boxGeometry args={[16, 1.2, 44]} />
          <meshStandardMaterial color="#6b6257" roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.6, 4]}>
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
      siloItems.push({ m: mat4(-302 + (i % 4) * 14, 3 + 14, -262 - Math.floor(i / 4) * 14, 0) })
    }
    const shedItems: Inst[] = []
    const shedSpots: Array<[number, number, number]> = [
      [-240, -262, 0], [-60, -268, 0.1], [70, -268, 0], [-250, 290, 0.05], [20, 292, 0], [60, 283, 0.1],
    ]
    for (const [x, z, r] of shedSpots) {
      shedItems.push({ m: mat4(x, 3 + 5, z, r, 42 + rnd() * 10, 10, 20 + rnd() * 6), c: new THREE.Color(rnd() < 0.5 ? '#7d8288' : '#8d857a') })
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

// ---------------------------------------------------------------- horizon ring
function SouthRise() {
  const { mounds, suburbs } = useMemo(() => {
    const rnd = mulberry32(61)
    const moundItems: Inst[] = [
      { m: mat4(-60, 8, 448, 0.2, 180, 46, 120), c: new THREE.Color('#5a5e44') },
      { m: mat4(120, 12, 456, 0.5, 230, 58, 130), c: new THREE.Color('#565a42') },
      { m: mat4(290, 14, 442, 0.9, 170, 40, 110), c: new THREE.Color('#5e6248') },
      { m: mat4(-230, 4, 420, 0.3, 160, 36, 110), c: new THREE.Color('#585c44') },
    ]
    const suburbItems: Inst[] = []
    for (let i = 0; i < 42; i++) {
      const x = -160 + rnd() * 460
      const z = 396 + rnd() * 44
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

function StocktonDunes() {
  const mounds = useMemo(() => {
    const items: Inst[] = [
      { m: mat4(230, 2, -330, 0.1, 160, 14, 55), c: new THREE.Color('#7a7458') },
      { m: mat4(350, 2, -336, -0.15, 150, 18, 50), c: new THREE.Color('#767052') },
      { m: mat4(130, 2, -322, 0.3, 90, 11, 42), c: new THREE.Color('#7e785c') },
    ]
    const cone = new THREE.ConeGeometry(0.5, 1, 6)
    cone.translate(0, 0.5, 0)
    return makeInstanced(cone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), items)
  }, [])
  return <primitive object={mounds} />
}

function OceanBaths() {
  return (
    <group position={[655, 0, 264]}>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[60, 1.6, 40]} />
        <meshStandardMaterial color="#7d7568" roughness={1} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[50, 0.5, 30]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[46, 0.3, 26]} />
        <meshStandardMaterial color="#3c7d8a" roughness={0.3} />
      </mesh>
    </group>
  )
}

function FarWestIndustry() {
  const mesh = useMemo(() => {
    const rnd = mulberry32(53)
    const items: Inst[] = []
    for (let i = 0; i < 26; i++) {
      const x = -480 - rnd() * 140
      const z = -180 + rnd() * 340
      const h = 10 + rnd() * 30
      const c = 0.3 + rnd() * 0.12
      items.push({ m: mat4(x, h / 2, z, rnd(), 24 + rnd() * 36, h, 20 + rnd() * 26), c: new THREE.Color(c * 0.95, c, c * 1.05) })
    }
    return makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), items)
  }, [])
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------- dynamics
function Dynamics({ weather }: { weather: WeatherDef }) {
  const ferryRef = useRef<THREE.Group>(null)
  const ferryWake = useRef<THREE.Mesh>(null)
  const tugRef = useRef<THREE.Group>(null)
  const tugWake = useRef<THREE.Mesh>(null)
  const gullsRef = useRef<THREE.InstancedMesh>(null)
  const { scene, camera } = useThree()

  const gullGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const v = new Float32Array([-1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4, 1.1, 0.25, 0, 0, 0, 0, 0, 0, 0.4])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    return g
  }, [])

  useFrame((st) => {
    const t = st.clock.elapsedTime
    // ferry: Stockton wharf <-> Queens Wharf
    const ferry = ferryRef.current
    if (ferry) {
      const cycle = 90
      const ph = (t % cycle) / cycle
      const leg = ph < 0.5 ? ph * 2 : (1 - ph) * 2
      const ease = Math.min(1, Math.max(0, (leg - 0.04) / 0.92))
      const a = { x: 185, z: -218 }
      const b = { x: 228, z: 128 }
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
    // surf pulse + distance culling for detail layers
    const surf = scene.getObjectByName('surf') as THREE.InstancedMesh | undefined
    if (surf) (surf.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1)) * (1 + weather.whitecaps)
    const cam = camera.position
    const dCity = Math.hypot(cam.x - 280, cam.z - 220)
    const windows = scene.getObjectByName('cityWindows')
    if (windows) windows.visible = dCity < 820
    const awnings = scene.getObjectByName('cityAwnings')
    if (awnings) awnings.visible = dCity < 540
    const prom = scene.getObjectByName('promenadeDetail')
    if (prom) prom.visible = dCity < 650
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

      <Nobbys gusty={gusty} />
      <FortScratchley />
      <QueensWharfTower />
      <Cathedral />
      <City gusty={gusty} />
      <Foreshore />
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
