/**
 * Instanced prop geometry: lamps, antennas, containers, tanks, chimneys,
 * cranes, palms, turbines, pumpjacks, solar, AC units, water towers.
 */
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4,
  MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PropInstance, PropKind } from './generator'
import type { GlowPoints } from './signs'
import { C } from '../tokens'
import { carGeometry } from './traffic'

function colored(geo: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex)
  const n = geo.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return geo
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, ry = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return colored(g, hex)
}
function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, hex: number, seg = 10): BufferGeometry {
  const g = new CylinderGeometry(rt, rb, h, seg)
  g.translate(x, y, z)
  return colored(g, hex)
}

const DARK = 0x26262c, STEEL = 0x3a3c44, RUST = 0x4a3a30, CONC = 0x33343a

function geometryFor(kind: PropKind): BufferGeometry {
  switch (kind) {
    case 'lamp':
      return mergeGeometries([
        cyl(0.12, 0.18, 9, 0, 4.5, 0, DARK, 8),
        box(2.4, 0.14, 0.14, 1.2, 8.9, 0, DARK),
        box(1.0, 0.22, 0.4, 2.2, 8.8, 0, 0x50505a),
      ])
    case 'antenna':
      return mergeGeometries([
        cyl(0.1, 0.16, 12, 0, 6, 0, STEEL, 6),
        box(2.4, 0.08, 0.08, 0, 9, 0, STEEL),
        box(1.6, 0.08, 0.08, 0, 11, 0, STEEL, Math.PI / 2),
        box(0.6, 0.6, 0.6, 0, 5, 0, STEEL),
      ])
    case 'container':
      return box(12.2, 2.6, 2.45, 0, 1.3, 0, 0xffffff)
    case 'tank':
      return mergeGeometries([
        cyl(6, 6, 8, 0, 4, 0, 0x8a8a90, 18),
        (() => { const g = new SphereGeometry(6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.35, 1); g.translate(0, 8, 0); return colored(g, 0x80808a) })(),
        box(0.5, 9, 0.5, 6.2, 4.5, 0, STEEL),
      ])
    case 'chimney':
      return mergeGeometries([cyl(1.4, 2.2, 32, 0, 16, 0, 0x4a4a50, 12), cyl(1.6, 1.6, 1.2, 0, 32.4, 0, 0x2a2a30, 12)])
    case 'crane':
      return mergeGeometries([
        box(3, 44, 3, 0, 22, 0, RUST),
        box(46, 1.6, 1.6, 20, 45, 0, RUST),
        box(14, 1.4, 1.4, -8, 45, 0, RUST),
        box(2.6, 2.4, 2.6, 2.5, 47.5, 0, 0x50504a),
        box(0.15, 26, 0.15, 36, 32, 0, STEEL),
        box(1.2, 1.2, 1.2, 36, 18, 0, 0x606060),
      ])
    case 'palm': {
      const parts: BufferGeometry[] = [cyl(0.22, 0.4, 9, 0, 4.5, 0, 0x3a2e22, 7)]
      for (let i = 0; i < 7; i++) {
        const f = new PlaneGeometry(1.3, 5.5)
        f.translate(0, 2.4, 0)
        f.rotateX(-0.95)
        f.rotateY((i / 7) * Math.PI * 2)
        f.translate(0, 9, 0)
        parts.push(colored(f, 0x1f3a24))
      }
      return mergeGeometries(parts)
    }
    case 'turbine':
      return mergeGeometries([cyl(1.1, 2.2, 62, 0, 31, 0, 0xb0b4bc, 10), box(5, 2.6, 2.6, 0.5, 62.5, 0, 0xc4c8d0)])
    case 'pumpjack':
      return mergeGeometries([
        box(6, 0.6, 3, 0, 0.3, 0, CONC),
        box(0.6, 5, 0.6, 0, 2.8, -0.8, RUST),
        box(0.6, 5, 0.6, 0, 2.8, 0.8, RUST),
        (() => { const g = new BoxGeometry(9, 0.5, 0.7); g.rotateZ(0.18); g.translate(0.5, 5.3, 0); return colored(g, RUST) })(),
        box(1.2, 1.6, 1.0, 4.9, 5.4, 0, RUST),
        cyl(1.4, 1.4, 0.8, -3.6, 1.6, 0, 0x50505a, 12),
      ])
    case 'solar': {
      const parts: BufferGeometry[] = []
      for (let r = 0; r < 4; r++) {
        const g = new BoxGeometry(14, 0.12, 3)
        g.rotateX(-0.45)
        g.translate(0, 1.4, r * 5)
        parts.push(colored(g, 0x18243a))
        parts.push(box(0.3, 1.4, 0.3, 0, 0.7, r * 5, STEEL))
      }
      return mergeGeometries(parts)
    }
    case 'ac':
      return mergeGeometries([box(1.3, 0.9, 1.0, 0, 0.45, 0, 0x606068), cyl(0.36, 0.36, 0.1, 0, 0.95, 0, 0x30303a, 10)])
    case 'tree': {
      const parts: BufferGeometry[] = [cyl(0.25, 0.4, 3, 0, 1.5, 0, 0x2a2018, 6)]
      const crown = new SphereGeometry(3.2, 8, 6)
      crown.scale(1, 1.25, 1)
      crown.translate(0, 5.2, 0)
      parts.push(colored(crown, 0x101a12))
      return mergeGeometries(parts)
    }
    case 'car':
      return colored(carGeometry(), 0xffffff)
    case 'awning':
      return mergeGeometries([
        (() => { const g = new BoxGeometry(4, 0.12, 1.7); g.rotateX(0.18); g.translate(0, 0, 0.85); return colored(g, 0xffffff) })(),
        box(0.08, 0.08, 1.6, -1.9, -0.1, 0.8, STEEL),
        box(0.08, 0.08, 1.6, 1.9, -0.1, 0.8, STEEL),
      ])
    case 'vend':
      return mergeGeometries([
        box(1.1, 2.0, 0.85, 0, 1.0, 0, 0x2a2a34),
        box(0.7, 1.1, 0.06, 0.05, 1.25, 0.44, 0x8ad8ff),
        box(0.9, 0.16, 0.06, 0, 0.35, 0.44, 0x50505a),
      ])
    case 'stall':
      return mergeGeometries([
        box(2.6, 0.9, 1.6, 0, 0.45, 0, 0x3a3230),
        box(0.08, 2.4, 0.08, -1.25, 1.2, -0.75, STEEL),
        box(0.08, 2.4, 0.08, 1.25, 1.2, -0.75, STEEL),
        box(0.08, 2.4, 0.08, -1.25, 1.2, 0.75, STEEL),
        box(0.08, 2.4, 0.08, 1.25, 1.2, 0.75, STEEL),
        (() => { const g = new BoxGeometry(3.0, 0.08, 2.2); g.rotateX(0.12); g.translate(0, 2.45, 0); return colored(g, 0xffffff) })(),
        box(0.5, 0.35, 0.5, 0.4, 1.1, 0.2, 0xaa4040),
        box(0.4, 0.3, 0.4, -0.5, 1.05, -0.1, 0x40aa60),
      ])
    case 'dumpster':
      return mergeGeometries([box(1.8, 1.3, 1.1, 0, 0.65, 0, 0x2a3a2c), box(1.85, 0.12, 1.15, 0, 1.36, 0, 0x1e2a20)])
    case 'watertower':
      return mergeGeometries([
        cyl(2.6, 2.4, 3.2, 0, 5.6, 0, 0x5a4a3c, 12),
        cyl(0.2, 2.6, 0.9, 0, 7.6, 0, 0x4a3c30, 12),
        box(0.25, 4.2, 0.25, 1.6, 2.1, 1.6, STEEL),
        box(0.25, 4.2, 0.25, -1.6, 2.1, 1.6, STEEL),
        box(0.25, 4.2, 0.25, 1.6, 2.1, -1.6, STEEL),
        box(0.25, 4.2, 0.25, -1.6, 2.1, -1.6, STEEL),
      ])
  }
}

export interface PropMeshes {
  group: Group
  /** turbine blade meshes (animated) */
  blades: InstancedMesh | null
  turbines: PropInstance[]
}

export function buildProps(props: PropInstance[], glow: GlowPoints): PropMeshes {
  const group = new Group()
  const byKind = new Map<PropKind, PropInstance[]>()
  for (const p of props) {
    let a = byKind.get(p.kind)
    if (!a) byKind.set(p.kind, (a = []))
    a.push(p)
  }
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3(), up = new Vector3(0, 1, 0)
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.25, side: DoubleSide })
  for (const [kind, list] of byKind) {
    const geo = geometryFor(kind)
    const mesh = new InstancedMesh(geo, mat, list.length)
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot)
      pos.set(p.x, p.y, p.z)
      scl.set(p.s, p.s, p.s)
      m.compose(pos, q, scl)
      mesh.setMatrixAt(i, m)
      if (kind === 'container' || kind === 'car' || kind === 'awning' || kind === 'stall') mesh.setColorAt(i, new Color(p.color ?? 0x6a6a6a))
      // light accents
      switch (kind) {
        case 'lamp': glow.add(p.x + Math.cos(p.rot) * 2.2, p.y + 8.7 * p.s, p.z - Math.sin(p.rot) * 2.2, p.color ?? C.sodium, 11); break
        case 'chimney': glow.add(p.x, p.y + 33 * p.s, p.z, C.red, 4, 0.5); break
        case 'crane': glow.add(p.x + Math.cos(p.rot) * 40 * p.s, p.y + 45 * p.s, p.z - Math.sin(p.rot) * 40 * p.s, C.red, 4, 0.7); glow.add(p.x, p.y + 46 * p.s, p.z, C.sodium, 6); break
        case 'turbine': glow.add(p.x, p.y + 64 * p.s, p.z, C.red, 4, 0.5); break
        case 'tank': glow.add(p.x + 6 * p.s, p.y + 9.5 * p.s, p.z, C.sodium, 5); break
        case 'watertower': if (Math.random() < 0.3) glow.add(p.x, p.y + 8, p.z, C.red, 2.5, 1.1); break
      }
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  // turbine blades
  const turbines = byKind.get('turbine') ?? []
  let blades: InstancedMesh | null = null
  if (turbines.length) {
    const g = mergeGeometries([0, 1, 2].map((i) => {
      const b = new BoxGeometry(1.4, 28, 0.35)
      b.translate(0, 14, 0)
      b.rotateZ((i / 3) * Math.PI * 2)
      return colored(b, 0xd0d4dc)
    }))
    blades = new InstancedMesh(g, mat, turbines.length)
    blades.frustumCulled = false
    group.add(blades)
  }
  return { group, blades, turbines }
}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3()
const _qy = new Quaternion(), _qz = new Quaternion()
export function animateTurbines(pm: PropMeshes, t: number): void {
  if (!pm.blades) return
  pm.turbines.forEach((p, i) => {
    _qy.setFromAxisAngle(new Vector3(0, 1, 0), p.rot)
    _qz.setFromAxisAngle(new Vector3(0, 0, 1), t * 0.9 + i)
    _q.copy(_qy).multiply(_qz)
    _p.set(p.x + Math.cos(p.rot) * 3.2 * p.s, p.y + 62.5 * p.s, p.z - Math.sin(p.rot) * 3.2 * p.s)
    _s.set(p.s, p.s, p.s)
    _m.compose(_p, _q, _s)
    pm.blades!.setMatrixAt(i, _m)
  })
  pm.blades.instanceMatrix.needsUpdate = true
}
