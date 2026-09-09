/** Cars on the route (both directions) and flying AVs above the city. */
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4,
  MeshStandardMaterial, Points, Quaternion, ShaderMaterial, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Rng } from '../core/rng'
import { ATMOS, C, type TimePreset } from '../tokens'
import type { Route } from './route'

interface Car {
  s: number
  lane: number // metres right of centre (negative = oncoming side)
  dir: 1 | -1
  speed: number
  underglow: number
}

interface Av {
  x: number
  y: number
  z: number
  dx: number
  dz: number
  speed: number
  phase: number
}

const CAR_COLORS = [0x1a1a1e, 0x2a2a30, 0x3a1a1a, 0x1a2a3a, 0x4a4a50, 0x2a1a3a, 0x8a8a90, 0x1a3a2a, 0x5a2a10, 0x101018, 0xb0b0b8, 0x7a1010, 0xc8a020]
const LANE_MINE = 1.8
const LIGHTS_PER_CAR = 7
const LIGHTS_PER_AV = 3

/** Low-poly wedge car: long nose, cabin set back, rear spoiler. Faces +x. */
export function carGeometry(): BufferGeometry {
  const body = new BoxGeometry(4.7, 0.55, 1.95)
  body.translate(0, 0.55, 0)
  const nose = new BoxGeometry(1.6, 0.32, 1.85)
  nose.rotateZ(0.12)
  nose.translate(1.65, 0.78, 0)
  const cabin = new BoxGeometry(2.2, 0.62, 1.7)
  cabin.translate(-0.45, 1.12, 0)
  const spoiler = new BoxGeometry(0.35, 0.08, 1.9)
  spoiler.translate(-2.2, 1.15, 0)
  const wheels = [[-1.5, 0.95], [-1.5, -0.95], [1.5, 0.95], [1.5, -0.95]].map(([x, z]) => {
    const w = new BoxGeometry(0.7, 0.62, 0.3)
    w.translate(x, 0.32, z)
    return w
  })
  return mergeGeometries([body, nose, cabin, spoiler, ...wheels])
}

const DYN_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor;
varying vec3 vColor; varying float vFade;
uniform float uFogDensity; uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float fd = uFogDensity * (0.3 + 0.7 * exp(-max(position.y - 20.0, 0.0) / 260.0));
  vFade = exp(-fd * fd * d * d);
  vColor = aColor;
  gl_PointSize = clamp(aSize * uScale / d, 1.5, 80.0);
  gl_Position = projectionMatrix * mv;
}
`
const DYN_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor; varying float vFade; uniform float uLights;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vColor * a * vFade * (0.4 + 0.7 * uLights), a * vFade);
}
`

export class Traffic {
  group = new Group()
  private cars: Car[] = []
  private avs: Av[] = []
  private carMesh: InstancedMesh
  private avMesh: InstancedMesh
  private lights: Points
  private lightPos: Float32Array
  private lightCol: Float32Array
  private lightSize: Float32Array
  private lightMat: ShaderMaterial
  private rng: Rng
  private tmp = new Vector3()
  private tmp2 = new Vector3()
  private m = new Matrix4()
  private q = new Quaternion()
  private scl = new Vector3(1, 1, 1)
  private col = new Color()

  constructor(private route: Route, seed: number, carCount = 80, avCount = 40) {
    this.rng = mulberry32(seed ^ 0x5eed)
    this.carMesh = new InstancedMesh(carGeometry(), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.7, color: 0xffffff }), carCount)
    this.carMesh.frustumCulled = false
    this.group.add(this.carMesh)
    for (let i = 0; i < carCount; i++) {
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
      const laneIdx = this.rng.chance(0.5) ? 0 : 1
      const lane = dir === 1 ? (laneIdx === 0 ? LANE_MINE : 5.3) : (laneIdx === 0 ? -1.8 : -5.3)
      this.cars.push({ s: this.rng.range(0, route.length), lane, dir, speed: this.rng.range(16, 27), underglow: this.rng.chance(0.28) ? this.rng.pick([C.cyan, C.magenta, C.violet, C.green]) : 0 })
      this.carMesh.setColorAt(i, new Color(this.rng.pick(CAR_COLORS)))
    }
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true

    const avBody = new BoxGeometry(7, 1.4, 4.2)
    const avTail = new BoxGeometry(3, 0.6, 5.5)
    avTail.translate(-4, 0.2, 0)
    const avFin = new BoxGeometry(1.2, 1.4, 0.3)
    avFin.translate(-4.5, 1.0, 0)
    this.avMesh = new InstancedMesh(mergeGeometries([avBody, avTail, avFin]), new MeshStandardMaterial({ color: 0x202028, roughness: 0.5, metalness: 0.6 }), avCount)
    this.avMesh.frustumCulled = false
    this.group.add(this.avMesh)
    for (let i = 0; i < avCount; i++) {
      const a = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + this.rng.range(-0.15, 0.15)
      this.avs.push({ x: this.rng.range(-2500, 2500), y: this.rng.range(45, 170), z: this.rng.range(-2500, 2500), dx: Math.cos(a), dz: Math.sin(a), speed: this.rng.range(25, 60), phase: this.rng.next() })
    }

    const n = carCount * LIGHTS_PER_CAR + avCount * LIGHTS_PER_AV
    this.lightPos = new Float32Array(n * 3)
    this.lightCol = new Float32Array(n * 3)
    this.lightSize = new Float32Array(n)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.lightPos, 3))
    g.setAttribute('aColor', new BufferAttribute(this.lightCol, 3))
    g.setAttribute('aSize', new BufferAttribute(this.lightSize, 1))
    this.lightMat = new ShaderMaterial({
      vertexShader: DYN_VERT, fragmentShader: DYN_FRAG,
      uniforms: { uFogDensity: { value: 0.001 }, uScale: { value: 600 }, uLights: { value: 1 } },
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    })
    this.lights = new Points(g, this.lightMat)
    this.lights.frustumCulled = false
    this.lights.renderOrder = 31
    this.group.add(this.lights)
  }

  private setLight(i: number, x: number, y: number, z: number, color: number, size: number): void {
    this.lightPos[i * 3] = x; this.lightPos[i * 3 + 1] = y; this.lightPos[i * 3 + 2] = z
    this.col.set(color)
    this.lightCol[i * 3] = this.col.r; this.lightCol[i * 3 + 1] = this.col.g; this.lightCol[i * 3 + 2] = this.col.b
    this.lightSize[i] = size
  }

  private place(c: Car, playerS: number, rel: number, playerSpeed: number): void {
    c.s = this.route.wrap(playerS + rel)
    c.speed = this.rng.range(16, 27)
    if (c.dir === 1 && Math.abs(c.lane - LANE_MINE) < 0.1) c.speed = Math.min(c.speed, playerSpeed * 0.97 || 18)
  }

  /** Scatter every car into its window around the player (after a warp). */
  respawnAll(playerS: number): void {
    this.cars.forEach((c) => {
      const mine = c.dir === 1 && Math.abs(c.lane - LANE_MINE) < 0.1
      const rel = c.dir === 1 ? this.rng.range(mine ? 90 : 25, 700) : this.rng.range(60, 900)
      this.place(c, playerS, rel, 20)
    })
  }

  update(dt: number, playerS: number, playerSpeed: number, preset: TimePreset, heightPx: number, fogMul: number, time: number): void {
    const r = this.route
    const L = r.length
    const up = new Vector3(0, 1, 0)
    let li = 0
    this.cars.forEach((c, i) => {
      c.s = r.wrap(c.s + c.dir * c.speed * dt)
      let rel = c.s - playerS
      if (rel > L / 2) rel -= L
      if (rel < -L / 2) rel += L
      const mine = c.dir === 1 && Math.abs(c.lane - LANE_MINE) < 0.1
      const lo = c.dir === 1 ? -60 : -80, hi = c.dir === 1 ? 700 : 900
      if (rel < lo || rel > hi) {
        rel = this.rng.range(hi * 0.45, hi)
        this.place(c, playerS, rel, playerSpeed)
      }
      // never let a same-lane car drift into the player: match speed when close ahead
      if (mine && rel > 0 && rel < 45) c.speed = Math.max(c.speed, playerSpeed * 1.03)
      if (mine && rel <= 0 && rel > -12) c.s = r.wrap(playerS + 60)
      r.pos(c.s, c.lane, this.tmp)
      const smp = r.at(c.s)
      const ang = Math.atan2(smp.tx * c.dir, smp.tz * c.dir)
      this.q.setFromAxisAngle(up, ang - Math.PI / 2)
      this.m.compose(this.tmp, this.q, this.scl)
      this.carMesh.setMatrixAt(i, this.m)
      const fx = smp.tx * c.dir, fz = smp.tz * c.dir
      const l = Math.hypot(fx, fz) || 1
      const nx = fx / l, nz = fz / l
      const rx = -nz, rz = nx
      const hl = 0xf2f4ff, tl = 0xff1a1a
      const x = this.tmp.x, y = this.tmp.y, z = this.tmp.z
      this.setLight(li++, x + nx * 2.35 + rx * 0.7, y + 0.7, z + nz * 2.35 + rz * 0.7, hl, 4.2)
      this.setLight(li++, x + nx * 2.35 - rx * 0.7, y + 0.7, z + nz * 2.35 - rz * 0.7, hl, 4.2)
      // tail light bar: three points across
      this.setLight(li++, x - nx * 2.35 + rx * 0.7, y + 0.85, z - nz * 2.35 + rz * 0.7, tl, 4)
      this.setLight(li++, x - nx * 2.35, y + 0.85, z - nz * 2.35, tl, 3.5)
      this.setLight(li++, x - nx * 2.35 - rx * 0.7, y + 0.85, z - nz * 2.35 - rz * 0.7, tl, 4)
      // underglow
      this.setLight(li++, x, y + 0.15, z, c.underglow, c.underglow ? 9 : 0)
      this.setLight(li++, x + nx * 1.2, y + 0.15, z + nz * 1.2, c.underglow, c.underglow ? 7 : 0)
    })
    this.carMesh.instanceMatrix.needsUpdate = true

    const ps = r.at(playerS)
    const px = ps.x, pz = ps.z
    this.avs.forEach((a, i) => {
      a.x += a.dx * a.speed * dt
      a.z += a.dz * a.speed * dt
      if (Math.hypot(a.x - px, a.z - pz) > 1500) {
        const ang = this.rng.range(0, Math.PI * 2)
        a.x = px + Math.cos(ang) * this.rng.range(150, 1200)
        a.z = pz + Math.sin(ang) * this.rng.range(150, 1200)
        const d = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + this.rng.range(-0.2, 0.2)
        a.dx = Math.cos(d); a.dz = Math.sin(d)
        a.y = this.rng.range(45, 170)
      }
      const bob = Math.sin(time * 0.7 + a.phase * 10) * 1.5
      this.tmp2.set(a.x, a.y + bob, a.z)
      this.q.setFromAxisAngle(up, Math.atan2(-a.dz, a.dx))
      this.m.compose(this.tmp2, this.q, this.scl)
      this.avMesh.setMatrixAt(i, this.m)
      const blink = ((time * 1.5 + a.phase * 7) % 1) < 0.15 ? 1 : 0
      this.setLight(li++, a.x + a.dx * 3.5, a.y + bob, a.z + a.dz * 3.5, 0xffffff, 10)
      this.setLight(li++, a.x - a.dz * 2.2, a.y + bob - 0.5, a.z + a.dx * 2.2, blink ? C.red : 0x000000, 6)
      this.setLight(li++, a.x + a.dz * 2.2, a.y + bob - 0.5, a.z - a.dx * 2.2, blink ? 0x30ff60 : 0x000000, 6)
    })
    this.avMesh.instanceMatrix.needsUpdate = true
    const g = this.lights.geometry
    ;(g.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(g.getAttribute('aColor') as BufferAttribute).needsUpdate = true
    ;(g.getAttribute('aSize') as BufferAttribute).needsUpdate = true
    const atm = ATMOS[preset]
    this.lightMat.uniforms.uFogDensity.value = atm.fogDensity * fogMul
    this.lightMat.uniforms.uScale.value = heightPx * 0.9
    this.lightMat.uniforms.uLights.value = Math.max(atm.lights, 0.5)
  }

  /** Distance to the nearest car ahead in the player's lane. */
  gapAhead(playerS: number): number {
    const L = this.route.length
    let best = Infinity
    for (const c of this.cars) {
      if (c.dir !== 1 || Math.abs(c.lane - LANE_MINE) > 0.1) continue
      let rel = c.s - playerS
      if (rel > L / 2) rel -= L
      if (rel < -L / 2) rel += L
      if (rel > 0 && rel < best) best = rel
    }
    return best
  }
}
