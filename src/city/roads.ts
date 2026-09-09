/**
 * Road ribbon along the route (textured asphalt with lane marks, wet
 * reflections and the dynamic light pool), pavements, side-street grid,
 * elevated highway structure, lamps along the route, terrain and ocean.
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PlaneGeometry, Quaternion, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type Camera, type Texture,
} from 'three'
import { ATMOS, C, HIGHWAY_HALF, ROAD_HALF, type TimePreset } from '../tokens'
import { DISTRICTS, districtAt, groundHeight, isWater, terrainHeight, terrainTint, type DistrictId } from './map'
import { SAMPLE_STEP, type Route, type RouteIndex } from './route'
import type { CityData, Exclusion } from './generator'
import { PRESETS } from './generator'
import type { LampEntry } from '../fx/lights'

const ROAD_VERT = /* glsl */ `
attribute float aKind;
attribute float aLampColor;
attribute float aHalf;
attribute float aCross;
attribute vec2 aRight;
varying vec2 vUv;
varying vec3 vWorld;
varying float vKind;
varying float vLamp;
varying float vHalf;
varying float vCross;
varying vec2 vRight;
void main() {
  vUv = uv;
  vKind = aKind;
  vLamp = aLampColor;
  vHalf = aHalf;
  vCross = aCross;
  vRight = aRight;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const ROAD_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <lights_pars_begin>
uniform sampler2D uAlbedo;
uniform sampler2D uDetail;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uCam;
uniform float uLights;
uniform float uWet;
uniform vec3 uSky;
uniform vec3 uAmbient;
uniform float uSunK;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uLampSpacing;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying float vKind;
varying float vLamp;
varying float vHalf;
varying float vCross;
varying vec2 vRight;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float x = vUv.x; // -1..1 across
  float s = vUv.y; // metres along
  float across = x * vHalf;
  bool pave = vKind > 2.5;
  // ------------------------------------------------ textures (left half asphalt, right half pavement)
  vec2 uvC = pave ? vec2(across / 4.0, s / 4.0) : vec2(across / 6.0, s / 6.0);
  vec2 gx = dFdx(uvC) * vec2(0.5, 1.0), gy = dFdy(uvC) * vec2(0.5, 1.0);
  vec2 uv = vec2((pave ? 0.5 : 0.0) + fract(uvC.x) * 0.5, fract(uvC.y));
  vec4 alb = textureGrad(uAlbedo, uv, gx, gy);
  vec4 det = textureGrad(uDetail, uv, gx, gy);
  vec3 base = alb.rgb;
  if (vKind > 1.5 && vKind < 2.5) base = mix(base, vec3(0.32, 0.27, 0.2), 0.7); // dirt / hill road
  // tyre wear: slightly lighter, smoother bands where wheels run
  float lane = abs(fract(abs(across) / (vHalf * 0.5) + 0.5) - 0.5) * 2.0;
  float wear = (1.0 - pave) * smoothstep(0.55, 0.85, lane) * 0.4;
  base *= 1.0 + 0.25 * wear;
  float rough = det.b - 0.25 * wear;
  // ------------------------------------------------ lane marks
  float ax = abs(x);
  float edge = smoothstep(0.955, 0.965, ax) * (1.0 - smoothstep(0.985, 0.995, ax));
  float centre = (1.0 - smoothstep(0.012, 0.02, ax)) * step(0.5, fract(s / 6.0));
  float divider = (1.0 - smoothstep(0.008, 0.016, abs(ax - 0.5))) * step(0.6, fract(s / 4.0 + 0.3));
  vec3 lineCol = mix(vec3(0.85, 0.85, 0.8), vec3(1.0, 0.85, 0.3), step(0.5, vKind) * step(vKind, 1.5)); // highway: yellow
  float marks = max(edge, max(centre * 0.9, divider * 0.6));
  // zebra crossing + stop line where a side street meets the route
  float zebra = step(0.5, vCross) * step(vCross, 3.5) * step(0.5, fract(across / 0.9)) * step(ax, 0.94);
  float stopLine = step(3.9, vCross) * step(vCross, 4.4) * step(0.02, ax) * step(ax, 0.94);
  marks = max(marks, max(zebra * 0.85, stopLine * 0.9));
  marks *= 1.0 - pave;
  // paint is worn: break it up with the texture noise
  marks *= 0.55 + 0.6 * smoothstep(0.35, 0.7, vnoise(vec2(across * 3.0, s * 1.5)));
  base = mix(base, lineCol * 0.9, marks);
  rough = mix(rough, 0.6, marks);
  // ------------------------------------------------ normal
  vec3 T = normalize(vec3(vRight.x, 0.0, vRight.y));
  vec3 N0 = vec3(0.0, 1.0, 0.0);
  vec3 Bt = normalize(cross(N0, T));
  vec2 nm = det.rg * 2.0 - 1.0;
  float nz = sqrt(max(0.0, 1.0 - dot(nm, nm)));
  // puddles flatten the normal
  float puddle = smoothstep(0.55, 0.8, vnoise(vec2(across * 0.35 + 7.0, s * 0.08))) * (1.0 - pave) * (vKind > 1.5 ? 0.25 : 1.0);
  float wet = uWet * (0.35 + 0.65 * puddle);
  vec3 N = normalize(mix(T * nm.x + Bt * nm.y + N0 * nz, N0, wet * 0.85));
  rough = mix(rough, 0.05, wet);
  base *= 1.0 - 0.45 * wet; // wet asphalt is darker
  // ------------------------------------------------ lighting
  vec3 toCam = uCam - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float nd = max(0.0, dot(N, uSunDir));
  vec3 col = base * (uAmbient * 1.8 * (0.85 + 0.15 * N.y) + uSunColor * uSunK * nd * 1.2);
  float graze = pow(1.0 - max(V.y, 0.0), 3.0);
  // sky sheen on wet surface
  col = mix(col, uSky * 0.9, graze * wet * 0.35);
  vec3 pV = (viewMatrix * vec4(vWorld, 1.0)).xyz;
  vec3 nV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec3 vV = normalize(-pV);
  float shin = mix(200.0, 10.0, rough);
  float specK = mix(1.2, 0.08, rough);
  vec3 diff = vec3(0.0);
  vec3 spec = vec3(0.0);
  IncidentLight dl;
  #if NUM_POINT_LIGHTS > 0
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    getPointLightInfo(pointLights[i], pV, dl);
    float ndl = max(dot(nV, dl.direction), 0.0);
    diff += dl.color * ndl;
    vec3 hv = normalize(dl.direction + vV);
    spec += dl.color * pow(max(dot(nV, hv), 0.0), shin) * ndl;
  }
  #endif
  #if NUM_SPOT_LIGHTS > 0
  for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
    getSpotLightInfo(spotLights[i], pV, dl);
    float ndl = max(dot(nV, dl.direction), 0.0);
    diff += dl.color * ndl;
    vec3 hv = normalize(dl.direction + vV);
    spec += dl.color * pow(max(dot(nV, hv), 0.0), shin) * ndl;
  }
  #endif
  col += base * diff * RECIPROCAL_PI * det.a + spec * specK * (0.4 + 0.6 * graze);
  // lamp streaks on wet road (fake long reflections of lamps beyond the light pool)
  float period = uLampSpacing;
  float ls = fract(s / period);
  float side = step(0.5, fract(floor(s / period) * 0.5)) * 2.0 - 1.0;
  float streakX = exp(-pow((x - side * 0.85) * 3.0, 2.0));
  float streakS = exp(-pow(min(ls, 1.0 - ls) * period / 14.0, 2.0));
  vec3 lampCol = mix(vec3(1.0, 0.62, 0.25), vec3(0.85, 0.9, 1.0), vLamp);
  col += lampCol * streakX * streakS * wet * uLights * 0.45 * (0.4 + graze) * (1.0 - pave);
  // neon spill: general magenta/cyan sheen near the city (subtle)
  col += mix(vec3(0.3, 0.05, 0.25), vec3(0.05, 0.25, 0.3), step(0.5, fract(s / 60.0))) * graze * wet * uLights * 0.2;
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}
`

interface Strip {
  pos: number[]
  uv: number[]
  kind: number[]
  lampc: number[]
  half: number[]
  cross: number[]
  right: number[]
  idx: number[]
}

function newStrip(): Strip {
  return { pos: [], uv: [], kind: [], lampc: [], half: [], cross: [], right: [], idx: [] }
}

function stripGeometry(st: Strip): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(st.pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(st.uv, 2))
  g.setAttribute('aKind', new Float32BufferAttribute(st.kind, 1))
  g.setAttribute('aLampColor', new Float32BufferAttribute(st.lampc, 1))
  g.setAttribute('aHalf', new Float32BufferAttribute(st.half, 1))
  g.setAttribute('aCross', new Float32BufferAttribute(st.cross, 1))
  g.setAttribute('aRight', new Float32BufferAttribute(st.right, 2))
  g.setIndex(st.idx)
  g.computeBoundingSphere()
  return g
}

/**
 * Distance from (x,z) to the edge of the nearest side-street gap of the
 * district's block grid. Negative inside a gap. Infinity where there is no grid.
 */
export function gridGap(x: number, z: number, id: DistrictId): number {
  if (id === 'badlands' || id === 'northoak') return Infinity
  const d = DISTRICTS.find((dd) => dd.id === id)!
  const p = PRESETS[id]
  const pitch = p.block + p.street
  const [x0, z0] = d.box
  const mx = (((x - x0) % pitch) + pitch) % pitch, mz = (((z - z0) % pitch) + pitch) % pitch
  const dx = Math.min(mx, pitch - mx), dz = Math.min(mz, pitch - mz)
  return Math.min(dx, dz) - p.street / 2
}

export class RoadSystem {
  group = new Group()
  material: ShaderMaterial
  lampSpacing = 30
  /** lamp heads along the route, for the dynamic light pool */
  lamps: LampEntry[] = []
  constructor(private route: Route, city: CityData, textures: { albedo: Texture; detail: Texture }, exclusions: Exclusion[] = []) {
    this.material = new ShaderMaterial({
      vertexShader: ROAD_VERT,
      fragmentShader: ROAD_FRAG,
      uniforms: UniformsUtils.merge([
        UniformsLib.lights,
        {
          uAlbedo: { value: null },
          uDetail: { value: null },
          uFog: { value: new Color(0) },
          uFogDensity: { value: 0.001 },
          uCam: { value: new Vector3() },
          uLights: { value: 1 },
          uWet: { value: 0.7 },
          uSky: { value: new Color(0.2, 0.1, 0.25) },
          uAmbient: { value: new Color(0.2, 0.2, 0.3) },
          uSunK: { value: 0 },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color(1, 1, 1) },
          uLampSpacing: { value: this.lampSpacing },
          uTime: { value: 0 },
        },
      ]),
      lights: true,
    })
    this.material.uniforms.uAlbedo.value = textures.albedo
    this.material.uniforms.uDetail.value = textures.detail
    this.group.add(new Mesh(this.ribbon(), this.material))
    const walks = this.pavements()
    if (walks) this.group.add(new Mesh(walks, this.material))
    const grid = this.gridStreets(exclusions)
    if (grid) this.group.add(new Mesh(grid, this.material))
    this.buildHighway()
    this.buildLamps(city)
  }

  private crossAt(i: number): number {
    const s = this.route.samples[i]
    if (s.kind !== 'street') return -1
    // distance to the gap edge, measured along the route (approximate with the point distance)
    const g = gridGap(s.x, s.z, s.district)
    return g === Infinity ? -1 : g
  }

  /** Road surface: two triangles per sample. */
  private ribbon(): BufferGeometry {
    const r = this.route
    const n = r.count
    const st = newStrip()
    for (let i = 0; i <= n; i++) {
      const s = r.samples[i % n]
      const half = s.kind === 'highway' ? HIGHWAY_HALF : ROAD_HALF
      const l = Math.hypot(s.tx, s.tz) || 1
      const rx = -s.tz / l, rz = s.tx / l
      const lc = PRESETS[s.district].lamp === C.sodium ? 0 : 1
      const k = s.kind === 'highway' ? 1 : s.kind === 'hill' || s.kind === 'badlands' ? 2 : 0
      const cross = this.crossAt(i % n)
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1
        st.pos.push(s.x + rx * half * sg, s.y + 0.02, s.z + rz * half * sg)
        st.uv.push(sg, i * SAMPLE_STEP)
        st.kind.push(k)
        st.lampc.push(lc)
        st.half.push(half)
        st.cross.push(cross)
        st.right.push(rx, rz)
      }
      if (i < n) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
        st.idx.push(a, b, c, b, d, c)
      }
    }
    return stripGeometry(st)
  }

  /** Raised pavements on both sides of street-kind route, broken where side streets join. */
  private pavements(): BufferGeometry | null {
    const r = this.route
    const st = newStrip()
    const w = 4.2
    for (const sg of [-1, 1]) {
      let run = 0
      let vi = st.pos.length / 3
      for (let i = 0; i <= r.count; i++) {
        const s = r.samples[i % r.count]
        const ok = (s.kind === 'street' || s.kind === 'coast') && gridGap(s.x, s.z, s.district) > 0.4
        if (!ok) { run = 0; continue }
        const l = Math.hypot(s.tx, s.tz) || 1
        const rx = -s.tz / l, rz = s.tx / l
        const o0 = (ROAD_HALF + 0.3) * sg, o1 = (ROAD_HALF + 0.3 + w) * sg
        const lc = PRESETS[s.district].lamp === C.sodium ? 0 : 1
        st.pos.push(s.x + rx * o0, s.y + 0.17, s.z + rz * o0, s.x + rx * o1, s.y + 0.17, s.z + rz * o1)
        st.uv.push(0, i * SAMPLE_STEP, 2, i * SAMPLE_STEP)
        st.kind.push(3, 3)
        st.lampc.push(lc, lc)
        st.half.push(w / 2, w / 2)
        st.cross.push(-1, -1)
        st.right.push(rx, rz, rx, rz)
        vi += 2
        if (run > 0) {
          const a = vi - 4, b = vi - 3, c = vi - 2, d = vi - 1
          st.idx.push(a, c, b, b, c, d)
        }
        run++
      }
    }
    return st.pos.length ? stripGeometry(st) : null
  }

  /** The block grid of every flat district as textured side streets. */
  private gridStreets(exclusions: Exclusion[]): BufferGeometry | null {
    const st = newStrip()
    const seg = 40
    const quad = (x0: number, z0: number, x1: number, z1: number, half: number, along: 'x' | 'z', s0: number) => {
      const y = 0.36
      const rx = along === 'x' ? 0 : 1, rz = along === 'x' ? 1 : 0
      const vi = st.pos.length / 3
      // four corners: start-left, start-right, end-left, end-right
      st.pos.push(x0 - rx * half, y, z0 - rz * half, x0 + rx * half, y, z0 + rz * half, x1 - rx * half, y, z1 - rz * half, x1 + rx * half, y, z1 + rz * half)
      const s1 = s0 + Math.hypot(x1 - x0, z1 - z0)
      st.uv.push(-1, s0, 1, s0, -1, s1, 1, s1)
      for (let k = 0; k < 4; k++) { st.kind.push(0); st.lampc.push(1); st.half.push(half); st.cross.push(-1); st.right.push(rx, rz) }
      st.idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2)
    }
    const blocked = (x: number, z: number): boolean => {
      if (isWater(x, z) || districtAt(x, z) === 'badlands') return true
      for (const e of exclusions) if (Math.hypot(e.x - x, e.z - z) < e.r) return true
      return false
    }
    for (const d of DISTRICTS) {
      if (d.id === 'northoak') continue
      const p = PRESETS[d.id]
      const pitch = p.block + p.street
      const half = Math.min(p.street / 2 - 1.5, 8)
      const [x0, z0, x1, z1] = d.box
      for (let x = x0; x <= x1; x += pitch) {
        for (let z = z0; z < z1; z += seg) {
          const ze = Math.min(z + seg, z1)
          if (blocked(x, (z + ze) / 2) || districtAt(x + 1, (z + ze) / 2) !== d.id && districtAt(x - 1, (z + ze) / 2) !== d.id) continue
          quad(x, z, x, ze, half, 'z', z)
        }
      }
      for (let z = z0; z <= z1; z += pitch) {
        for (let x = x0; x < x1; x += seg) {
          const xe = Math.min(x + seg, x1)
          if (blocked((x + xe) / 2, z) || districtAt((x + xe) / 2, z + 1) !== d.id && districtAt((x + xe) / 2, z - 1) !== d.id) continue
          quad(x, z, xe, z, half, 'x', x)
        }
      }
    }
    return st.pos.length ? stripGeometry(st) : null
  }

  /** Vertical strip along the road edge (barriers, curbs). */
  private wall(offset: number, y0: number, y1: number, filter: (k: string, i: number) => boolean, color: number, emissive = 0): Mesh | null {
    const r = this.route
    const pos: number[] = []
    const idx: number[] = []
    let run = 0
    let vi = 0
    for (let i = 0; i <= r.count; i++) {
      const s = r.samples[i % r.count]
      if (!filter(s.kind, i % r.count)) { run = 0; continue }
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
    // street curbs (low), broken at side streets like the pavements
    const curbOk = (k: string, i: number) => {
      if (k === 'highway' || k === 'badlands' || k === 'hill') return false
      const smp = r.samples[i]
      return gridGap(smp.x, smp.z, smp.district) > 0.4
    }
    for (const sg of [-1, 1]) {
      const curb = this.wall(sg * (ROAD_HALF + 0.3), -0.3, 0.18, curbOk, 0x55555c)
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
        idx.push(bl0, br0, bl1, br0, br1, bl1)
        idx.push(bl0, bl1, tl0, bl1, tl1, tl0)
        idx.push(br0, tr0, br1, tr0, tr1, br1)
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
      const rot = Math.atan2(sideSign * rz, -sideSign * rx)
      const py = s.y - (s.kind === 'highway' ? 0 : 0.2)
      city.props.push({ kind: 'lamp', x: px, y: py, z: pz, rot, s: 1, color })
      this.lamps.push({ s: i * SAMPLE_STEP, x: px + Math.cos(rot) * 2.2, y: py + 8.6, z: pz - Math.sin(rot) * 2.2, color })
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
    ;(u.uSunDir.value as Vector3).set(...a.sunDir).normalize()
    ;(u.uSunColor.value as Color).set(a.sunColor)
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
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    // cut the terrain under the road so hills never poke through the asphalt
    const n = index.nearest(x, z, 60)
    const smp = n.i >= 0 ? route.samples[n.i] : null
    const h = groundHeight(x, z, smp ? { d: n.d, y: smp.y, highway: smp.kind === 'highway' } : null)
    pos.setY(i, isWater(x, z) ? -6 : h)
    terrainTint(x, z, tmp)
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeVertexNormals()
  const m = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
  m.position.y = -0.05
  return m
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
