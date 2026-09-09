/**
 * Road ribbon along the route (asphalt shader with lane marks and wet
 * reflections), elevated highway structure, lamps along the route, terrain
 * and ocean.
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PlaneGeometry, Quaternion, ShaderMaterial, Vector3, type Camera,
} from 'three'
import { ATMOS, C, HIGHWAY_HALF, ROAD_HALF, type TimePreset } from '../tokens'
import { districtAt, groundHeight, isWater, terrainHeight } from './map'
import { SAMPLE_STEP, type Route, type RouteIndex } from './route'
import type { CityData } from './generator'
import { PRESETS } from './generator'

const ROAD_VERT = /* glsl */ `
attribute float aKind;
attribute float aLampColor;
varying vec2 vUv;
varying vec3 vWorld;
varying float vKind;
varying float vLamp;
void main() {
  vUv = uv;
  vKind = aKind;
  vLamp = aLampColor;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const ROAD_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uCam;
uniform float uLights;
uniform float uWet;
uniform vec3 uSky;
uniform vec3 uAmbient;
uniform float uSunK;
uniform float uLampSpacing;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying float vKind;
varying float vLamp;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float x = vUv.x; // -1..1 across
  float s = vUv.y; // metres along
  vec3 asphalt = vec3(0.075, 0.078, 0.09);
  float n = vnoise(vec2(x * 8.0, s * 0.35)) * 0.5 + vnoise(vec2(x * 40.0, s * 2.0)) * 0.5;
  asphalt *= 0.75 + 0.5 * n;
  // lane marks: edge lines + dashed centre + dashed lane dividers
  float ax = abs(x);
  float edge = smoothstep(0.955, 0.965, ax) * (1.0 - smoothstep(0.985, 0.995, ax));
  float centre = (1.0 - smoothstep(0.012, 0.02, ax)) * step(0.5, fract(s / 6.0));
  float divider = (1.0 - smoothstep(0.008, 0.016, abs(ax - 0.5))) * step(0.6, fract(s / 4.0 + 0.3));
  vec3 lineCol = mix(vec3(0.85, 0.85, 0.8), vec3(1.0, 0.85, 0.3), step(0.5, vKind) * step(vKind, 1.5)); // highway: yellow
  float marks = max(edge, max(centre * 0.9, divider * 0.6));
  vec3 col = asphalt * (uAmbient * 2.2 + vec3(uSunK) * 0.8);
  col = mix(col, lineCol * (0.25 + 0.6 * uSunK + 0.3 * uLights), marks);
  // wet reflection: fake specular streaks from the lamps (periodic along s) + sky sheen at grazing angles
  vec3 toCam = uCam - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float graze = pow(1.0 - max(v.y, 0.0), 3.0);
  float puddle = smoothstep(0.55, 0.8, vnoise(vec2(x * 3.0 + 7.0, s * 0.08)));
  float wet = uWet * (0.35 + 0.65 * puddle) * (vKind > 1.5 ? 0.25 : 1.0);
  col = mix(col, uSky * 0.9, graze * wet * 0.3);
  // lamp streaks: lamps sit at |x| ~ 1.05 every uLampSpacing metres, alternating sides.
  float period = uLampSpacing;
  float ls = fract(s / period);
  float side = step(0.5, fract(floor(s / period) * 0.5)) * 2.0 - 1.0; // alternate
  float streakX = exp(-pow((x - side * 0.85) * 3.0, 2.0));
  float streakS = exp(-pow(min(ls, 1.0 - ls) * period / 14.0, 2.0));
  vec3 lampCol = mix(vec3(1.0, 0.62, 0.25), vec3(0.85, 0.9, 1.0), vLamp);
  col += lampCol * streakX * streakS * wet * uLights * 0.8 * (0.4 + graze);
  // neon spill: general magenta/cyan sheen near the city (subtle)
  col += mix(vec3(0.3, 0.05, 0.25), vec3(0.05, 0.25, 0.3), step(0.5, fract(s / 60.0))) * graze * wet * uLights * 0.25;
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}
`

export class RoadSystem {
  group = new Group()
  material: ShaderMaterial
  lampSpacing = 30
  constructor(private route: Route, city: CityData) {
    this.material = new ShaderMaterial({
      vertexShader: ROAD_VERT,
      fragmentShader: ROAD_FRAG,
      uniforms: {
        uFog: { value: new Color(0) },
        uFogDensity: { value: 0.001 },
        uCam: { value: new Vector3() },
        uLights: { value: 1 },
        uWet: { value: 0.7 },
        uSky: { value: new Color(0.2, 0.1, 0.25) },
        uAmbient: { value: new Color(0.2, 0.2, 0.3) },
        uSunK: { value: 0 },
        uLampSpacing: { value: this.lampSpacing },
        uTime: { value: 0 },
      },
    })
    this.group.add(new Mesh(this.ribbon(), this.material))
    this.buildHighway()
    this.buildLamps(city)
  }

  /** Road surface: two triangles per sample. */
  private ribbon(): BufferGeometry {
    const r = this.route
    const n = r.count
    const pos = new Float32Array((n + 1) * 2 * 3)
    const uv = new Float32Array((n + 1) * 2 * 2)
    const kind = new Float32Array((n + 1) * 2)
    const lampc = new Float32Array((n + 1) * 2)
    const idx: number[] = []
    for (let i = 0; i <= n; i++) {
      const s = r.samples[i % n]
      const half = s.kind === 'highway' ? HIGHWAY_HALF : ROAD_HALF
      const l = Math.hypot(s.tx, s.tz) || 1
      const rx = -s.tz / l, rz = s.tx / l
      const lc = PRESETS[s.district].lamp === C.sodium ? 0 : 1
      const k = s.kind === 'highway' ? 1 : s.kind === 'hill' || s.kind === 'badlands' ? 2 : 0
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1
        const v = (i * 2 + side)
        pos[v * 3] = s.x + rx * half * sg
        pos[v * 3 + 1] = s.y + 0.02
        pos[v * 3 + 2] = s.z + rz * half * sg
        uv[v * 2] = sg
        uv[v * 2 + 1] = i * SAMPLE_STEP
        kind[v] = k
        lampc[v] = lc
      }
      if (i < n) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
        idx.push(a, b, c, b, d, c)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.setAttribute('aKind', new BufferAttribute(kind, 1))
    g.setAttribute('aLampColor', new BufferAttribute(lampc, 1))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return g
  }

  /** Vertical strip along the road edge (barriers, curbs). */
  private wall(offset: number, y0: number, y1: number, filter: (k: string) => boolean, color: number, emissive = 0): Mesh | null {
    const r = this.route
    const pos: number[] = []
    const idx: number[] = []
    let run = 0
    let vi = 0
    for (let i = 0; i <= r.count; i++) {
      const s = r.samples[i % r.count]
      if (!filter(s.kind)) { run = 0; continue }
      const l = Math.hypot(s.tx, s.tz) || 1
      const rx = -s.tz / l, rz = s.tx / l
      pos.push(s.x + rx * offset, s.y + y0, s.z + rz * offset, s.x + rx * offset, s.y + y1, s.z + rz * offset)
      vi += 2
      if (run > 0) {
        const a = vi - 4, b = vi - 3, c = vi - 2, d = vi - 1
        idx.push(a, c, b, b, c, d)
      }
      run++
    }
    if (!pos.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1, side: DoubleSide, emissive, emissiveIntensity: emissive ? 1.5 : 0 })
    return new Mesh(g, m)
  }

  private buildHighway(): void {
    const r = this.route
    const isHw = (k: string) => k === 'highway'
    // deck slab under the surface
    const slab = this.deck(HIGHWAY_HALF + 1.2, -2.2, -0.05, isHw, 0x1c1c22)
    if (slab) this.group.add(slab)
    for (const sg of [-1, 1]) {
      const w = this.wall(sg * (HIGHWAY_HALF + 0.4), -0.1, 1.35, isHw, 0x34343c)
      if (w) this.group.add(w)
    }
    // small sodium markers along the barrier tops
    for (let i = 0; i < r.count; i += 7) {
      const smp = r.samples[i]
      if (smp.kind !== 'highway') continue
      const l = Math.hypot(smp.tx, smp.tz) || 1
      const rx = -smp.tz / l, rz = smp.tx / l
      for (const sg of [-1, 1]) this.cityGlowQueue.push([smp.x + rx * (HIGHWAY_HALF + 0.4) * sg, smp.y + 1.45, smp.z + rz * (HIGHWAY_HALF + 0.4) * sg, 0xff8a30, 1.6])
    }
    // pillars every 36 m
    const pillars: Matrix4[] = []
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3()
    for (let i = 0; i < r.count; i += 18) {
      const smp = r.samples[i]
      if (smp.kind !== 'highway') continue
      const g = isWater(smp.x, smp.z) ? -6 : terrainHeight(smp.x, smp.z)
      const h = smp.y - 2.2 - g
      if (h < 1) continue
      const ang = Math.atan2(smp.tx, smp.tz)
      q.setFromAxisAngle(new Vector3(0, 1, 0), ang)
      p.set(smp.x, g + h / 2, smp.z)
      s.set(3.2, h, 2.4)
      pillars.push(m.clone().compose(p, q, s))
    }
    if (pillars.length) {
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 }), pillars.length)
      pillars.forEach((mm, i) => mesh.setMatrixAt(i, mm))
      mesh.frustumCulled = false
      this.group.add(mesh)
    }
    // street curbs (low)
    for (const sg of [-1, 1]) {
      const curb = this.wall(sg * (ROAD_HALF + 0.3), -0.3, 0.18, (k) => k !== 'highway' && k !== 'badlands' && k !== 'hill', 0x3a3a40)
      if (curb) this.group.add(curb)
    }
    // coast railing glow
    for (let i = 0; i < r.count; i += 8) {
      const smp = r.samples[i]
      if (smp.kind !== 'coast') continue
      const l = Math.hypot(smp.tx, smp.tz) || 1
      const rx = -smp.tz / l, rz = smp.tx / l
      this.cityGlowQueue.push([smp.x - rx * (ROAD_HALF + 2), smp.y + 1.2, smp.z - rz * (ROAD_HALF + 2), C.cyan, 3])
    }
  }

  private deck(half: number, y0: number, y1: number, filter: (k: string) => boolean, color: number): Mesh | null {
    const r = this.route
    const pos: number[] = []
    const idx: number[] = []
    let run = 0, vi = 0
    for (let i = 0; i <= r.count; i++) {
      const s = r.samples[i % r.count]
      if (!filter(s.kind)) { run = 0; continue }
      const l = Math.hypot(s.tx, s.tz) || 1
      const rx = -s.tz / l, rz = s.tx / l
      // 4 verts: bottom-left, bottom-right, top-left, top-right (box cross-section, no top face)
      pos.push(
        s.x - rx * half, s.y + y0, s.z - rz * half,
        s.x + rx * half, s.y + y0, s.z + rz * half,
        s.x - rx * half, s.y + y1, s.z - rz * half,
        s.x + rx * half, s.y + y1, s.z + rz * half,
      )
      vi += 4
      if (run > 0) {
        const p0 = vi - 8
        const [bl0, br0, tl0, tr0, bl1, br1, tl1, tr1] = [p0, p0 + 1, p0 + 2, p0 + 3, p0 + 4, p0 + 5, p0 + 6, p0 + 7]
        idx.push(bl0, br0, bl1, br0, br1, bl1) // bottom
        idx.push(bl0, bl1, tl0, bl1, tl1, tl0) // left side
        idx.push(br0, tr0, br1, tr0, tr1, br1) // right side
      }
      run++
    }
    if (!pos.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return new Mesh(g, new MeshStandardMaterial({ color, roughness: 0.95, side: DoubleSide }))
  }

  private cityGlowQueue: [number, number, number, number, number][] = []

  private buildLamps(city: CityData): void {
    const r = this.route
    const step = Math.round(this.lampSpacing / SAMPLE_STEP)
    for (let i = 0; i < r.count; i += step) {
      const s = r.samples[i]
      const l = Math.hypot(s.tx, s.tz) || 1
      const rx = -s.tz / l, rz = s.tx / l
      const k = Math.floor(i / step)
      const sideSign = k % 2 === 0 ? -1 : 1
      const preset = PRESETS[s.district]
      let color = preset.lamp
      if (s.kind === 'highway') color = C.sodium
      if (s.kind === 'badlands' || s.kind === 'hill') { if (k % 3 !== 0) continue; color = C.sodium }
      if (!color) { if (k % 4 !== 0) continue; color = 0x6a5aa0 }
      const half = s.kind === 'highway' ? HIGHWAY_HALF + 0.6 : ROAD_HALF + 1.2
      const px = s.x + rx * half * sideSign, pz = s.z + rz * half * sideSign
      // arm points toward the road: rotation so that +x local -> -sideSign * right
      const rot = Math.atan2(sideSign * rz, -sideSign * rx)
      city.props.push({ kind: 'lamp', x: px, y: s.y - (s.kind === 'highway' ? 0 : 0.2), z: pz, rot, s: 1, color })
    }
    for (const g of this.cityGlowQueue) city.glow.add(g[0], g[1], g[2], g[3], g[4])
  }

  update(preset: TimePreset, camera: Camera, time: number, wet: number, fogMul = 1): void {
    const a = ATMOS[preset]
    const u = this.material.uniforms
    ;(u.uFog.value as Color).set(a.fogColor)
    u.uFogDensity.value = a.fogDensity * fogMul
    ;(u.uCam.value as Vector3).copy(camera.position)
    u.uLights.value = a.lights
    u.uWet.value = wet
    ;(u.uSky.value as Color).set(a.skyGlow)
    ;(u.uAmbient.value as Color).set(a.ambient)
    u.uSunK.value = a.sunStrength
    u.uTime.value = time
  }
}

// ------------------------------------------------------------- terrain

export function buildTerrain(route: Route, index: RouteIndex): Mesh {
  const size = 7600, seg = 304
  const g = new PlaneGeometry(size, size, seg, seg)
  g.rotateX(-Math.PI / 2)
  const pos = g.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const sand = new Color(0x6a5844), city = new Color(0x141418), dirt = new Color(0x3c3226), grass = new Color(0x22281c)
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    // cut the terrain under the road so hills never poke through the asphalt
    const n = index.nearest(x, z, 60)
    const smp = n.i >= 0 ? route.samples[n.i] : null
    const h = groundHeight(x, z, smp ? { d: n.d, y: smp.y, highway: smp.kind === 'highway' } : null)
    pos.setY(i, isWater(x, z) ? -6 : h)
    const d = districtAt(x, z)
    if (d === 'badlands') tmp.copy(sand).lerp(dirt, 0.6 * (vn(x * 0.011, z * 0.013) * 0.7 + vn(x * 0.05, z * 0.047) * 0.3))
    else if (d === 'northoak') tmp.copy(grass)
    else if (d === 'rancho' || d === 'coastview') tmp.copy(dirt).lerp(city, 0.5)
    else tmp.copy(city)
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeVertexNormals()
  const m = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
  m.position.y = -0.05
  return m
}

function vn(x: number, z: number): number {
  return 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 2.3) * 1.5) * Math.cos(z * 1.3 + Math.sin(x * 1.1))
}

const OCEAN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`
const OCEAN_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uFog; uniform float uFogDensity; uniform vec3 uCam; uniform vec3 uSky; uniform float uTime; uniform float uLights; uniform float uSunK;
varying vec3 vWorld;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 toCam = uCam - vWorld; float dist = length(toCam); vec3 v = toCam / dist;
  float graze = pow(1.0 - max(v.y, 0.0), 2.0);
  vec3 deep = vec3(0.01, 0.02, 0.05) + vec3(0.02, 0.05, 0.08) * uSunK;
  float n = vnoise(vWorld.xz * 0.05 + uTime * 0.15) * vnoise(vWorld.xz * 0.11 - uTime * 0.1);
  vec3 col = mix(deep, uSky * 0.8, graze * 0.9);
  col += uSky * n * 0.5 * (0.3 + graze);
  // city glow reflecting on the bay + moon glitter path
  col += vec3(0.3, 0.1, 0.25) * uLights * graze * 0.5;
  float glitter = step(0.985, hash12(floor(vWorld.xz * 0.6 + uTime * vec2(0.6, 0.2)))) * graze;
  col += vec3(0.6, 0.7, 0.9) * glitter * (0.4 + uSunK);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}
`
export class Ocean {
  mesh: Mesh
  material: ShaderMaterial
  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG,
      uniforms: {
        uFog: { value: new Color(0) }, uFogDensity: { value: 0.001 }, uCam: { value: new Vector3() }, uSky: { value: new Color(0.2, 0.1, 0.25) },
        uTime: { value: 0 }, uLights: { value: 1 }, uSunK: { value: 0 },
      },
    })
    const g = new PlaneGeometry(9000, 9000)
    g.rotateX(-Math.PI / 2)
    this.mesh = new Mesh(g, this.material)
    this.mesh.position.y = -3
  }
  update(preset: TimePreset, camera: Camera, time: number, fogMul = 1): void {
    const a = ATMOS[preset]
    const u = this.material.uniforms
    ;(u.uFog.value as Color).set(a.fogColor)
    u.uFogDensity.value = a.fogDensity * fogMul
    ;(u.uCam.value as Vector3).copy(camera.position)
    ;(u.uSky.value as Color).set(a.skyGlow)
    u.uTime.value = time
    u.uLights.value = a.lights
    u.uSunK.value = a.sunStrength
  }
}
