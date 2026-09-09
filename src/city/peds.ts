/** Pedestrians: instanced low-poly figures walking the sidewalks along the route. */
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Rng } from '../core/rng'
import { ROAD_HALF } from '../tokens'
import type { Route } from './route'
import { PRESETS } from './generator'

interface Ped {
  s: number
  side: number
  dir: 1 | -1
  speed: number
  phase: number
  standing: boolean
}

const CLOTHES = [0x1a1a20, 0x2a2430, 0x3a2a2a, 0x202a3a, 0x4a4a52, 0x2a1a3a, 0x5a3a20, 0x101014, 0x3a3a3a, 0x6a2030, 0x204a5a, 0x8a7a30]

function pedGeometry() {
  const legs = new BoxGeometry(0.34, 0.85, 0.24)
  legs.translate(0, 0.42, 0)
  const torso = new BoxGeometry(0.46, 0.62, 0.28)
  torso.translate(0, 1.15, 0)
  const head = new SphereGeometry(0.13, 6, 5)
  head.translate(0, 1.6, 0)
  return mergeGeometries([legs, torso, head])
}

export class Peds {
  group = new Group()
  private peds: Ped[] = []
  private mesh: InstancedMesh
  private rng: Rng
  private tmp = new Vector3()
  private m = new Matrix4()
  private q = new Quaternion()
  private scl = new Vector3(1, 1, 1)
  private up = new Vector3(0, 1, 0)

  constructor(private route: Route, seed: number, count = 420) {
    this.rng = mulberry32(seed ^ 0x9ed5)
    this.mesh = new InstancedMesh(pedGeometry(), new MeshStandardMaterial({ color: 0x555560, roughness: 0.95, metalness: 0.0 }), count)
    this.mesh.frustumCulled = false
    this.group.add(this.mesh)
    for (let i = 0; i < count; i++) {
      this.peds.push({ s: 0, side: 1, dir: 1, speed: this.rng.range(0.9, 1.6), phase: this.rng.next() * 6.28, standing: this.rng.chance(0.25) })
      this.mesh.setColorAt(i, new Color(this.rng.pick(CLOTHES)))
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.respawnAll(0)
  }

  private place(p: Ped, playerS: number, rel: number): void {
    p.s = this.route.wrap(playerS + rel)
    const smp = this.route.at(p.s)
    const dense = PRESETS[smp.district].street_
    // sidewalk band: 2..7 m beyond the curb, denser districts use the full band
    const sideSign = this.rng.chance(0.5) ? 1 : -1
    p.side = sideSign * (ROAD_HALF + 1.5 + this.rng.range(0.5, 2 + 4 * dense))
    p.dir = this.rng.chance(0.5) ? 1 : -1
  }

  respawnAll(playerS: number): void {
    for (const p of this.peds) this.place(p, playerS, this.rng.range(-60, 420))
  }

  update(dt: number, playerS: number, time: number): void {
    const r = this.route
    const L = r.length
    this.peds.forEach((p, i) => {
      if (!p.standing) p.s = r.wrap(p.s + p.dir * p.speed * dt)
      let rel = p.s - playerS
      if (rel > L / 2) rel -= L
      if (rel < -L / 2) rel += L
      const smp = r.at(p.s)
      const want = PRESETS[smp.district].street_
      // recycle when out of the window, or thin out in districts with no street life
      if (rel < -60 || rel > 420 || smp.kind === 'highway' || smp.kind === 'badlands' || smp.kind === 'hill' || (want < 0.15 && this.rng.chance(0.02))) {
        this.place(p, playerS, this.rng.range(40, 420))
      }
      const s2 = r.at(p.s)
      const hidden = s2.kind === 'highway' || s2.kind === 'badlands' || s2.kind === 'hill' || PRESETS[s2.district].street_ < 0.15
      r.pos(p.s, p.side, this.tmp)
      const bob = p.standing ? 0 : Math.abs(Math.sin(time * 6 + p.phase)) * 0.05
      this.tmp.y += bob - 0.3
      const ang = Math.atan2(s2.tx * p.dir, s2.tz * p.dir) + (p.standing ? p.phase : 0)
      this.q.setFromAxisAngle(this.up, ang)
      this.scl.set(hidden ? 0 : 1, hidden ? 0 : 0.95 + (p.phase % 0.2), hidden ? 0 : 1)
      this.m.compose(this.tmp, this.q, this.scl)
      this.mesh.setMatrixAt(i, this.m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
