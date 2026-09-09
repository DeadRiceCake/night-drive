/**
 * All box-shaped structures (buildings, megabuilding tiers, tower shafts,
 * containers...) are instances of one InstancedMesh. Windows, floor bands and
 * neon strips are drawn procedurally in the fragment shader, so no textures.
 */
import {
  BoxGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial,
  Vector3, type Camera,
} from 'three'
import { ATMOS, C, type TimePreset } from '../tokens'

/** Facade styles understood by the shader. */
export const STYLE = {
  glass: 0, // corporate glass tower: wide windows, cool light
  residential: 1, // concrete apartment block, small warm windows, balconies
  industrial: 2, // sparse big windows, sodium tint
  unfinished: 3, // bare concrete frame, almost no light
  mega: 4, // megabuilding: dense grid of small windows, horizontal light bands
  house: 5, // suburban house, 1-2 floors
  arasaka: 6, // black monolith with thin red seams
  luxury: 7, // charter hill: white/gold glass
} as const

export interface BuildingInstance {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  rot?: number
  style: number
  color: number
  glow: number
  /** window lit ratio 0..1 */
  lit: number
  /** 0 = no neon strips, 1 = vertical edge strips, 2 = top band, 3 = both */
  neon: number
  seed?: number
}

const VERT = /* glsl */ `
attribute vec4 aParams;   // seed, lit, style, neon
attribute vec3 aColor;
attribute vec3 aGlow;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vFace;
varying vec2 vFaceSize;
varying float vTop;
varying vec4 vParams;
varying vec3 vColor;
varying vec3 vGlow;
void main() {
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec3 p = position;
  vec3 n = normal;
  if (abs(n.x) > 0.5) { vFace = vec2((p.z + 0.5) * sc.z, p.y * sc.y); vFaceSize = vec2(sc.z, sc.y); }
  else if (abs(n.z) > 0.5) { vFace = vec2((p.x + 0.5) * sc.x, p.y * sc.y); vFaceSize = vec2(sc.x, sc.y); }
  else { vFace = vec2((p.x + 0.5) * sc.x, (p.z + 0.5) * sc.z); vFaceSize = vec2(sc.x, sc.z); }
  vTop = n.y;
  vec4 w = instanceMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormal = normalize((instanceMatrix * vec4(n, 0.0)).xyz);
  vParams = aParams;
  vColor = aColor;
  vGlow = aGlow;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uCam;
uniform float uLights;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunK;
uniform vec3 uAmbient;
uniform vec3 uSkyRef;
uniform vec3 uHaze;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vFace;
varying vec2 vFaceSize;
varying float vTop;
varying vec4 vParams;
varying vec3 vColor;
varying vec3 vGlow;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float seed = vParams.x;
  float lit = vParams.y;
  float style = vParams.z;
  float neon = vParams.w;
  vec3 base = vColor;
  float nd = max(0.0, dot(vNormal, uSunDir));
  // fake AO between buildings + hemisphere
  float hemi = 0.6 + 0.4 * vNormal.y;
  vec3 col = base * (1.0 + 1.8 * uSunK) * (uAmbient * hemi + uSunColor * uSunK * nd);
  // street glow: lamps and signs light the first floors
  float streetGlow = exp(-max(vWorld.y - 1.0, 0.0) / 9.0) * uLights;
  col += base * vec3(1.0, 0.55, 0.25) * 1.2 * streetGlow;

  if (vTop < 0.5 && vTop > -0.5) {
    vec2 cell = vec2(3.6, 3.4);
    vec2 inset = vec2(0.12, 0.22);
    float glassy = 0.0;
    vec3 warm = vec3(1.0, 0.82, 0.55);
    vec3 cool = vec3(0.62, 0.85, 1.0);
    float warmRatio = 0.55;
    float floorBand = 0.0;
    if (style < 0.5) { cell = vec2(2.6, 3.6); inset = vec2(0.09, 0.14); glassy = 1.0; warmRatio = 0.3; floorBand = 1.0; }
    else if (style < 1.5) { cell = vec2(3.2, 3.0); inset = vec2(0.22, 0.28); warmRatio = 0.8; }
    else if (style < 2.5) { cell = vec2(7.0, 5.0); inset = vec2(0.2, 0.3); warmRatio = 0.9; }
    else if (style < 3.5) { cell = vec2(5.0, 3.6); inset = vec2(0.1, 0.12); }
    else if (style < 4.5) { cell = vec2(2.6, 2.8); inset = vec2(0.16, 0.24); warmRatio = 0.65; floorBand = 1.0; }
    else if (style < 5.5) { cell = vec2(4.0, 3.2); inset = vec2(0.3, 0.3); warmRatio = 0.95; }
    else if (style < 6.5) { cell = vec2(13.0, 70.0); inset = vec2(0.47, 0.02); }
    else { cell = vec2(7.0, 3.6); inset = vec2(0.03, 0.3); glassy = 1.0; warmRatio = 0.4; floorBand = 1.0; }

    vec2 uv = vFace / cell;
    vec2 c = floor(uv);
    vec2 f = fract(uv);
    float h = hash12(c + seed * 13.7);
    // panelised concrete + grime: per-panel tone, darker near the ground and under the roofline
    float panel = 0.82 + 0.36 * hash12(floor(vFace / vec2(8.0, 12.0)) + seed * 0.7);
    col *= panel;
    col *= 0.7 + 0.3 * smoothstep(0.0, 6.0, vFace.y);
    // floor slabs / balcony ledges on residential and mega blocks
    float slab = step(f.y, 0.1) * (step(0.5, style) * step(style, 1.5) + step(3.5, style) * step(style, 4.5));
    col *= 1.0 - 0.45 * slab;
    col += vec3(0.06) * step(0.1, f.y) * step(f.y, 0.14) * slab;
    // ground-floor shopfronts: wide bright windows on the first floor
    float shop = step(vFace.y, 4.2) * step(1.0, vFace.y) * step(0.25, lit) * step(style, 1.5) * step(0.4, fract(vFace.x / 9.0));
    
    float inWin = step(inset.x, f.x) * step(f.x, 1.0 - inset.x) * step(inset.y, f.y) * step(f.y, 1.0 - inset.y);
    // skip the very top / bottom partial rows
    inWin *= step(0.8, vFace.y) * step(vFace.y, vFaceSize.y - 0.6);
    // clusters: a coarse hash per 4x3 window block modulates the lit ratio so windows come in patches
    float cluster = hash12(floor(c / vec2(4.0, 3.0)) + seed * 7.1);
    float floorDark = step(0.85, hash12(vec2(c.y, seed * 2.3))); // some floors fully dark
    float on = step(1.0 - lit * (0.4 + 1.2 * cluster), h) * (1.0 - floorDark);
    // slow random flicker on a few windows
    float fl = hash12(c * 3.1 + seed);
    on *= (fl < 0.06) ? step(0.5, fract(uTime * (0.4 + fl * 30.0) + fl * 7.0)) : 1.0;
    // building-wide tint (warm or cool) with per-window variation
    float bWarm = step(1.0 - warmRatio, hash12(vec2(seed * 3.3, seed * 1.7)));
    float isWarm = mix(bWarm, 1.0 - bWarm, step(0.85, hash12(c * 1.71 + seed * 3.0)));
    vec3 wcol = mix(cool, warm, isWarm);
    float bright = 0.35 + 1.1 * pow(hash12(c * 2.3 + seed * 5.0), 2.0);
    vec3 litCol = wcol * bright * (0.1 + 0.5 * uLights) * (1.0 - 0.35 * glassy);
    // horizontal light bands on some floors of glass / mega towers (long strip lights)
    float band = floorBand * step(0.93, hash12(vec2(c.y * 0.37, seed * 4.1))) * step(0.42, f.y) * step(f.y, 0.5);
    col = mix(col, vGlow * (1.4 * uLights + 0.1), band * step(0.5, neon));
    // unfinished: bare frame, windows are holes -> darker
    if (style > 2.5 && style < 3.5) { litCol *= 0.5; on *= step(0.85, hash12(c * 0.7 + seed)); }
    if (style > 5.5 && style < 6.5) {
      // arasaka: black monolith with red-lit vertical grooves, segmented per floor band
      float seam = step(f.x, 0.03) + step(0.97, f.x);
      float segOn = step(0.45, hash12(c * 1.3 + seed));
      float pulse = 0.8 + 0.2 * sin(uTime * 0.6 + c.y * 0.7 + c.x);
      vec3 red = vec3(1.0, 0.06, 0.12) * (1.3 * uLights + 0.1) * pulse;
      col = mix(col, red, seam * segOn);
      // faint horizontal floor lines every 4 m so the mass reads against the sky
      col += vec3(0.05, 0.015, 0.02) * step(fract(vFace.y / 4.0), 0.06) * uLights;
      inWin = 0.0;
    }
    // glass reflection of the sky on unlit panes (day/dusk)
    vec3 glassCol = mix(base * 0.7, uSkyRef * 0.55, 0.28 * glassy + 0.1) * (0.3 + 0.7 * uSunK);
    col = mix(col, glassCol, inWin * (1.0 - on) * (0.2 + 0.8 * glassy));
    col = mix(col, litCol, inWin * on);
    vec3 shopCol = mix(vec3(1.0, 0.75, 0.45), vGlow + vec3(0.3), step(0.5, neon)) * (0.15 + 0.8 * uLights);
    col = mix(col, shopCol * (0.5 + 0.3 * hash12(vec2(floor(vFace.x / 9.0), seed))), shop * 0.7);
    // floor band lines on glass towers
    col *= 1.0 - floorBand * 0.35 * step(f.y, 0.06);
    // neon strips
    float edge = min(vFace.x, vFaceSize.x - vFace.x);
    float doV = step(0.5, mod(neon, 2.0));
    float doT = step(1.5, neon);
    float strip = doV * step(edge, 0.45) * step(1.0, vFace.y);
    float topStrip = doT * step(vFaceSize.y - 1.1, vFace.y) * step(vFace.y, vFaceSize.y - 0.3);
    col = mix(col, vGlow * (1.9 * uLights + 0.15), clamp(strip + topStrip, 0.0, 1.0));
  } else if (vTop > 0.5) {
    // roof: darker, slight grid of hvac
    vec2 c = floor(vFace / 6.0);
    float h = hash12(c + seed);
    col *= 0.7 + 0.2 * step(0.7, h);
    float doT = step(1.5, neon);
    float e = min(min(vFace.x, vFaceSize.x - vFace.x), min(vFace.y, vFaceSize.y - vFace.y));
    col = mix(col, vGlow * (1.7 * uLights + 0.15), doT * step(e, 0.7));
  }
  float dist = distance(vWorld, uCam);
  float fd = uFogDensity * (0.3 + 0.7 * exp(-max(vWorld.y - 20.0, 0.0) / 260.0));
  float fog = 1.0 - exp(-fd * fd * dist * dist);
  // city haze: distant things sink into the light-polluted glow near the horizon
  float low = exp(-max(vWorld.y, 0.0) / 140.0);
  vec3 fogCol = mix(uFog, uHaze, fog * low * 0.8);
  col = mix(col, fogCol, fog);
  gl_FragColor = vec4(col, 1.0);
}
`

export class BuildingSet {
  readonly items: BuildingInstance[] = []
  material: ShaderMaterial
  mesh: InstancedMesh | null = null

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uFog: { value: new Color(0) },
        uFogDensity: { value: 0.001 },
        uCam: { value: new Vector3() },
        uLights: { value: 1 },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color(1, 1, 1) },
        uSunK: { value: 0 },
        uAmbient: { value: new Color(0.2, 0.2, 0.3) },
        uSkyRef: { value: new Color(0.2, 0.2, 0.3) },
        uHaze: { value: new Color(0.3, 0.15, 0.3) },
        uTime: { value: 0 },
      },
      side: DoubleSide,
    })
  }

  add(b: BuildingInstance): void {
    this.items.push(b)
  }

  build(): InstancedMesh {
    const geo = new BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    const n = this.items.length
    const mesh = new InstancedMesh(geo, this.material, n)
    const params = new Float32Array(n * 4)
    const colors = new Float32Array(n * 3)
    const glows = new Float32Array(n * 3)
    const m = new Matrix4()
    const q = new Quaternion()
    const pos = new Vector3(), scl = new Vector3()
    const col = new Color()
    this.items.forEach((b, i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), b.rot ?? 0)
      pos.set(b.x, b.y, b.z)
      scl.set(b.w, b.h, b.d)
      m.compose(pos, q, scl)
      mesh.setMatrixAt(i, m)
      params[i * 4] = b.seed ?? (i * 0.618) % 97
      params[i * 4 + 1] = b.lit
      params[i * 4 + 2] = b.style
      params[i * 4 + 3] = b.neon
      col.set(b.color)
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b
      col.set(b.glow)
      glows[i * 3] = col.r; glows[i * 3 + 1] = col.g; glows[i * 3 + 2] = col.b
    })
    geo.setAttribute('aParams', new InstancedBufferAttribute(params, 4))
    geo.setAttribute('aColor', new InstancedBufferAttribute(colors, 3))
    geo.setAttribute('aGlow', new InstancedBufferAttribute(glows, 3))
    mesh.frustumCulled = false
    mesh.instanceMatrix.needsUpdate = true
    this.mesh = mesh
    return mesh
  }

  applyAtmosphere(preset: TimePreset, camera: Camera, time: number): void {
    const a = ATMOS[preset]
    const u = this.material.uniforms
    ;(u.uFog.value as Color).set(a.fogColor)
    u.uFogDensity.value = a.fogDensity
    ;(u.uCam.value as Vector3).copy(camera.position)
    u.uLights.value = a.lights
    ;(u.uSunDir.value as Vector3).set(...a.sunDir).normalize()
    ;(u.uSunColor.value as Color).set(a.sunColor)
    u.uSunK.value = a.sunStrength
    ;(u.uAmbient.value as Color).set(a.ambient)
    ;(u.uSkyRef.value as Color).set(a.skyHorizon)
    ;(u.uHaze.value as Color).set(a.skyGlow)
    u.uTime.value = time
  }
}

export const NEON_COLORS = [C.cyan, C.magenta, C.yellow, C.pink, C.violet, C.red, C.green, C.orange]
