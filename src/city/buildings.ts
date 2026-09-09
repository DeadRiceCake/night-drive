/**
 * All box-shaped structures (buildings, megabuilding tiers, tower shafts,
 * containers...) are instances of one InstancedMesh. Facades sample the
 * procedural atlas (albedo + glass mask, normal + roughness + AO) in
 * metre-space per face, windows light up per cell from a hash, and the
 * dynamic light pool (street lamps, headlights) shades everything.
 */
import {
  BoxGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, UniformsLib, UniformsUtils,
  Vector3, type Camera, type Texture,
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
  brick: 8, // old brick / tenement (Kabuki, Little China, Vista)
  plain: 9, // structural: posts, beams, slabs, parapets (no windows)
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
varying vec3 vTan;
varying vec3 vBit;
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
  vec3 ax = instanceMatrix[0].xyz / sc.x;
  vec3 ay = instanceMatrix[1].xyz / sc.y;
  vec3 az = instanceMatrix[2].xyz / sc.z;
  if (abs(n.x) > 0.5) {
    vFace = vec2((p.z + 0.5) * sc.z, p.y * sc.y); vFaceSize = vec2(sc.z, sc.y);
    vTan = az * sign(n.x); vBit = ay;
  } else if (abs(n.z) > 0.5) {
    vFace = vec2((p.x + 0.5) * sc.x, p.y * sc.y); vFaceSize = vec2(sc.x, sc.y);
    vTan = ax * -sign(n.z); vBit = ay;
  } else {
    vFace = vec2((p.x + 0.5) * sc.x, (p.z + 0.5) * sc.z); vFaceSize = vec2(sc.x, sc.z);
    vTan = ax; vBit = az;
  }
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
#include <common>
#include <lights_pars_begin>
uniform sampler2D uAlbedo;
uniform sampler2D uDetail;
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
varying vec3 vTan;
varying vec3 vBit;
varying vec2 vFace;
varying vec2 vFaceSize;
varying float vTop;
varying vec4 vParams;
varying vec3 vColor;
varying vec3 vGlow;

const vec2 TS = vec2(0.25, 0.125); // tile size in atlas uv

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Sample tile \`tile\` at in-tile uv (0..1, y up) with continuous gradients so mips don't seam. */
vec4 tileTex(sampler2D t, float tile, vec2 uvT, vec2 gx, vec2 gy) {
  float col = mod(tile, 4.0);
  float row = floor(tile / 4.0);
  vec2 uv = vec2((col + uvT.x) * TS.x, (row + 1.0 - uvT.y) * TS.y);
  return textureGrad(t, uv, gx * TS, gy * TS);
}

void main() {
  float seed = vParams.x;
  float lit = vParams.y;
  float style = vParams.z;
  float neon = vParams.w;
  float sh = hash12(vec2(seed * 0.37, seed * 1.13));
  // tint: instance colour scaled so a mid-grey atlas lands on the district palette
  vec3 tint = vColor * 2.6 * (1.0 + 1.3 * uSunK); // daylight: palettes are night-dark, lift them toward real concrete albedo
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTan);
  vec3 B = normalize(vBit);

  // ---------------------------------------------------------- style table
  vec2 cell = vec2(3.6, 3.4);
  float tile = 2.0;
  float glassy = 0.0;
  vec3 warm = vec3(1.0, 0.82, 0.55);
  vec3 cool = vec3(0.62, 0.85, 1.0);
  float warmRatio = 0.55;
  float floorBand = 0.0;
  if (style < 0.5) { cell = vec2(2.6, 3.6); tile = 0.0 + floor(sh * 2.0); glassy = 1.0; warmRatio = 0.3; floorBand = 1.0; }
  else if (style < 1.5) { cell = vec2(3.2, 3.0); tile = 2.0 + floor(sh * 3.0); warmRatio = 0.8; }
  else if (style < 2.5) { cell = vec2(7.0, 5.0); tile = 5.0 + floor(sh * 2.0); warmRatio = 0.9; }
  else if (style < 3.5) { cell = vec2(5.0, 3.6); tile = 7.0; }
  else if (style < 4.5) { cell = vec2(2.6, 2.8); tile = 8.0 + floor(sh * 2.0); warmRatio = 0.65; floorBand = 1.0; }
  else if (style < 5.5) { cell = vec2(4.0, 3.2); tile = 10.0; warmRatio = 0.95; }
  else if (style < 6.5) { cell = vec2(6.5, 6.5); tile = 11.0; }
  else if (style < 7.5) { cell = vec2(7.0, 3.6); tile = 12.0 + floor(sh * 2.0); glassy = 0.6; warmRatio = 0.4; floorBand = 1.0; }
  else if (style < 8.5) { cell = vec2(3.0, 3.2); tile = 14.0 + floor(sh * 2.0); warmRatio = 0.85; }
  else { cell = vec2(4.0, 4.0); tile = 25.0; }

  bool side = vTop < 0.5 && vTop > -0.5;
  bool top = vTop > 0.5;
  bool isArasaka = style > 5.5 && style < 6.5;
  bool isUnfinished = style > 2.5 && style < 3.5;

  // ------------------------------------------------------ atlas sampling
  vec2 tileM = side ? cell * 4.0 : vec2(8.0);
  if (!side) tile = 24.0;
  vec2 uvC = vFace / tileM;
  vec2 uvT = fract(uvC);
  vec2 gx = dFdx(uvC), gy = dFdy(uvC);
  // ground floor of side faces: shopfront tile (8 m x 8 m), only where the building is tall enough to be a street building
  float shopMask = 0.0;
  if (side && vFace.y < 4.5 && !isArasaka && vFaceSize.y > 6.0 && (style < 4.5 || (style > 7.5 && style < 8.5))) {
    float shopOn = step(0.25, lit);
    shopMask = shopOn * step(2.5, vFaceSize.x);
  }
  vec4 alb, det;
  if (shopMask > 0.5) {
    vec2 uvS = vFace / 8.0;
    // slide the shop tile along the facade so units don't align with window columns
    uvS.x += floor(seed * 7.0) * 0.37;
    alb = tileTex(uAlbedo, 16.0 + floor(hash12(vec2(seed, 3.1)) * 4.0), fract(uvS), dFdx(uvS), dFdy(uvS));
    det = tileTex(uDetail, 16.0 + floor(hash12(vec2(seed, 3.1)) * 4.0), fract(uvS), dFdx(uvS), dFdy(uvS));
  } else {
    alb = tileTex(uAlbedo, tile, uvT, gx, gy);
    det = tileTex(uDetail, tile, uvT, gx, gy);
  }
  // window LOD: cells per pixel. Mid range sharpens the mip-blurred mask back into rectangles,
  // far range fades per-cell sparkle into the building's average lit colour (no sub-pixel noise).
  vec2 cpp = vec2(length(dFdx(vFace / cell)), length(dFdy(vFace / cell)));
  float cellPx = max(cpp.x, cpp.y);
  float lodMid = smoothstep(0.02, 0.12, cellPx);
  float lodFar = smoothstep(0.18, 0.5, cellPx);
  float mask = mix(alb.a, smoothstep(0.3, 0.7, alb.a), lodMid);
  float rough = det.b;
  float ao = det.a;
  vec3 albedo = alb.rgb * tint;
  // large-scale grime: darker near the ground, per-building tone, random dark blotches
  albedo *= 0.75 + 0.25 * smoothstep(0.0, 8.0, vFace.y);
  albedo *= 0.85 + 0.3 * hash12(floor(vFace / vec2(9.0, 14.0)) + seed * 0.7);

  // ------------------------------------------------------ normal mapping
  vec2 nm = det.rg * 2.0 - 1.0;
  float nz = sqrt(max(0.0, 1.0 - dot(nm, nm)));
  vec3 Nw = normalize(T * nm.x + B * nm.y + N * nz);

  // -------------------------------------------------------- base lighting
  float hemi = 0.6 + 0.4 * Nw.y;
  float nd = max(0.0, dot(Nw, uSunDir));
  vec3 col = albedo * (1.0 + 1.6 * uSunK) * (uAmbient * hemi * ao + uSunColor * uSunK * nd);
  // street glow: lamps and signs wash the first floors (in addition to the real lights)
  float streetGlow = exp(-max(vWorld.y - 1.0, 0.0) / 9.0) * uLights;
  col += albedo * vec3(1.0, 0.6, 0.3) * 0.5 * streetGlow;

  // -------------------------------------------------------- dynamic lights
  vec3 pV = (viewMatrix * vec4(vWorld, 1.0)).xyz;
  vec3 nV = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  vec3 vV = normalize(-pV);
  float shin = mix(120.0, 8.0, rough);
  float specK = mix(0.6, 0.06, rough) * (1.0 - 0.5 * mask * (1.0 - glassy));
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
  col += albedo * diff * RECIPROCAL_PI * ao + spec * specK;

  if (side) {
    vec2 uv = vFace / cell;
    vec2 c = floor(uv);
    vec2 f = fract(uv);
    float h = hash12(c + seed * 13.7);
    // skip the very top / bottom partial rows
    float inWin = mask * step(0.6, vFace.y) * step(vFace.y, vFaceSize.y - 0.4);
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
    // interior seen through the glass: one of four room tiles per window
    float room = 20.0 + floor(hash12(c * 0.53 + seed * 9.1) * 4.0);
    vec2 uvR = vFace / cell;
    vec3 interior = tileTex(uAlbedo, room, f, dFdx(uvR), dFdy(uvR)).rgb;
    vec3 litCol = wcol * interior * bright * (0.15 + 0.7 * uLights) * (1.0 - 0.3 * glassy);
    // horizontal light bands on some floors of glass / mega towers (long strip lights)
    float band = floorBand * step(0.93, hash12(vec2(c.y * 0.37, seed * 4.1))) * step(0.42, f.y) * step(f.y, 0.5);
    col = mix(col, vGlow * (1.4 * uLights + 0.1), band * step(0.5, neon));
    if (isUnfinished) { litCol *= 0.5; on *= step(0.85, hash12(c * 0.7 + seed)); }
    if (isArasaka) {
      // arasaka: black monolith with red-lit vertical grooves, segmented per floor band
      vec2 cA = floor(vFace / vec2(6.5, 70.0));
      vec2 fA = fract(vFace / vec2(6.5, 70.0));
      float seam = step(fA.x, 0.018) + step(0.982, fA.x);
      float segOn = step(0.45, hash12(cA * 1.3 + seed));
      float pulse = 0.8 + 0.2 * sin(uTime * 0.6 + cA.y * 0.7 + cA.x);
      vec3 red = vec3(1.0, 0.06, 0.12) * (1.3 * uLights + 0.1) * pulse;
      col = mix(col, red, seam * segOn);
      col += vec3(0.05, 0.015, 0.02) * step(fract(vFace.y / 4.0), 0.06) * uLights;
      inWin = 0.0;
    }
    // unlit glass: sky reflection + the dynamic specular already added; glassy towers reflect more
    vec3 glassCol = mix(albedo * 0.6, uSkyRef * 0.5, 0.35 * glassy + 0.15) * (0.25 + 0.75 * uSunK);
    col = mix(col, glassCol + spec * 0.8, inWin * (1.0 - on) * (0.5 + 0.5 * glassy));
    col = mix(col, litCol + spec * 0.3, inWin * on);
    // far LOD: average of lit and dark windows
    vec3 avgLit = mix(cool, warm, bWarm) * 0.55 * (0.15 + 0.7 * uLights);
    float avgOn = clamp(lit * 0.9, 0.0, 0.85) * (isUnfinished ? 0.15 : 1.0) * (isArasaka ? 0.0 : 1.0);
    vec3 farCol = mix(albedo * (uAmbient * 0.8 + uSunColor * uSunK * 0.6), avgLit, avgOn * 0.45);
    col = mix(col, farCol, lodFar * 0.85);
    // shop windows: bright, warm or neon-tinted
    if (shopMask > 0.5) {
      float shopOn = step(0.35, hash12(vec2(floor(vFace.x / 8.0), seed)));
      vec3 shopCol = mix(vec3(1.0, 0.8, 0.55), vGlow + vec3(0.35), step(0.5, neon)) * (0.2 + 0.9 * uLights);
      vec3 shopInt = tileTex(uAlbedo, 22.0, fract(vFace / vec2(8.0, 4.5)), dFdx(vFace / 8.0), dFdy(vFace / 8.0)).rgb;
      col = mix(col, shopCol * shopInt * (0.6 + 0.4 * hash12(vec2(floor(vFace.x / 8.0), seed * 2.0))), mask * shopOn);
    }
    // neon strips
    float edge = min(vFace.x, vFaceSize.x - vFace.x);
    float doV = step(0.5, mod(neon, 2.0));
    float doT = step(1.5, neon);
    float strip = doV * step(edge, 0.45) * step(1.0, vFace.y);
    float topStrip = doT * step(vFaceSize.y - 1.1, vFace.y) * step(vFace.y, vFaceSize.y - 0.3);
    col = mix(col, vGlow * (1.9 * uLights + 0.15), clamp(strip + topStrip, 0.0, 1.0));
  } else if (top) {
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
      uniforms: UniformsUtils.merge([
        UniformsLib.lights,
        {
          uAlbedo: { value: null },
          uDetail: { value: null },
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
      ]),
      lights: true,
      side: DoubleSide,
    })
  }

  setAtlas(albedo: Texture, detail: Texture): void {
    this.material.uniforms.uAlbedo.value = albedo
    this.material.uniforms.uDetail.value = detail
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
