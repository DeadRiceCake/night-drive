/**
 * Neon signs, holographic ads and light halos. Sign artwork is drawn once
 * into a canvas atlas; instances reference a tile rectangle.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, InstancedBufferAttribute,
  InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, NormalBlending, PlaneGeometry, Points, Quaternion,
  ShaderMaterial, SRGBColorSpace, Vector3, type Camera,
} from 'three'
import { ATMOS, type TimePreset } from '../tokens'
import type { Rng } from '../core/rng'
import { DISTRICTS } from './map'

export interface Tile {
  u0: number
  v0: number
  u1: number
  v1: number
  /** width / height */
  aspect: number
  kind: 'sign' | 'vsign' | 'holo' | 'brand' | 'ad' | 'gantry'
  color: number
  lang?: 'en' | 'jp' | 'cn'
  text?: string
}

const JP = ['居酒屋', 'ラーメン', '薬局', 'カラオケ', '寿司', '質屋', 'ホテル', '遊技場', '電脳', '義体', 'リッパードク', 'ブレインダンス', '酒', 'パチンコ', 'サイバーウェア', '麺', '無料', '危険', '出口', '歓楽街', '花魁', '桜市場', '夜の街', '天国', '女', '愛', '運命', '夢', '金', '闇市']
const CN = ['夜城', '中華料理', '藥房', '賭場', '麻雀', '義體改造', '餃子', '茶樓', '按摩', '旅館', '電玩', '龍', '福', '小吃', '海鮮', '當鋪', '酒吧', '快餐']
const EN = ['RIPPERDOC', 'BD LOUNGE', 'OPEN 24H', 'XXX', 'CYBERWARE', 'NOODLES', 'PAWN', 'MOTEL', 'BAR', 'CLINIC', 'LIVE', 'GIRLS', 'TATTOO', 'ARCADE', 'SAKE', 'NETRUNNER', 'VEND', 'CASINO', 'LIQUOR', 'DINER', 'PACHINKO', 'BURGER', 'GUNS', 'BRAINDANCE', 'IMPLANTS', 'HOT DOGS', 'HOTEL', 'DRUGS', 'PHARMA', 'CLUB', 'FIGHT', 'JIG-JIG ST', 'LIZZIE\'S', 'AFTERLIFE', 'TOTENTANZ', 'CLOUDS', 'EL COYOTE', 'RIOT', 'CHERRY BLOSSOM', 'KABUKI MARKET']
const BRANDS: [string, number][] = [
  ['ARASAKA', 0xff1a2b], ['MILITECH', 0x3ab0ff], ['KANG TAO', 0xffc857], ['TRAUMA TEAM', 0xffffff], ['KIROSHI', 0x37ebf3],
  ['ZETATECH', 0xff2a6d], ['BIOTECHNICA', 0x3cff9a], ['PETROCHEM', 0xff9a3c], ['ORBITAL AIR', 0x9fd8ff], ['NICOLA', 0xfcee0a],
  ['CHROMANTICORE', 0xff6ec7], ['BUDGET ARMS', 0xffa030], ['ALL FOODS', 0xff2a6d], ['DELAMAIN', 0xfcee0a], ['NCPD', 0x3ab0ff],
  ['MEGABUILDING H10', 0xfcee0a], ['DYNALAR', 0xa06bff], ['SAMURAI', 0xff003c], ['REALWATER', 0x37ebf3], ['NIGHT CITY', 0xfcee0a],
  ['KONPEKI PLAZA', 0x37ebf3], ['ARASAKA', 0xff1a2b], ['MILITECH', 0x3ab0ff], ['TSUNAMI', 0xff2a6d],
]
const AD_LINES: [string, string, number, number][] = [
  ['CHROMANTICORE', 'THE TASTE OF CHROME', 0xff2a6d, 0x37ebf3],
  ['NICOLA', 'REAL PLEASURE. REAL SODA.', 0xfcee0a, 0xff2a6d],
  ['KIROSHI OPTICS', 'SEE EVERYTHING', 0x37ebf3, 0x0a0a1a],
  ['TRAUMA TEAM', 'PLATINUM. WE ARE THERE.', 0xffffff, 0xff003c],
  ['BUDGET ARMS', 'CHEAP. LOUD. YOURS.', 0xffa030, 0x1a0a00],
  ['ARASAKA', 'SECURE THE FUTURE', 0xff1a2b, 0x050508],
  ['ORBITAL AIR', 'FLY BEYOND', 0x9fd8ff, 0x0a1030],
  ['REALWATER', 'FEEL THE BLUE', 0x37ebf3, 0x0a2030],
  ['ALL FOODS', 'FRESH. ALWAYS.', 0xff2a6d, 0x1a0a1a],
  ['DELAMAIN', 'YOUR RIDE. OUR PRIDE.', 0xfcee0a, 0x101010],
  ['ZETATECH', 'UPGRADE YOURSELF', 0xff2a6d, 0x10001a],
  ['MILITECH', 'STRENGTH THROUGH TECH', 0x3ab0ff, 0x000814],
  ['BRAINDANCE', 'LIVE ANOTHER LIFE', 0xa06bff, 0x0a0014],
  ['NIGHT CITY', 'THE CITY OF DREAMS', 0xfcee0a, 0x1a0a20],
  ['CLOUDS', 'A DOLL FOR EVERY DREAM', 0xff6ec7, 0x150010],
  ['XBD', 'FORBIDDEN. FOR REAL.', 0xff003c, 0x100000],
]

export interface Atlas {
  texture: CanvasTexture
  signs: Tile[]
  vsigns: Tile[]
  holos: Tile[]
  brands: Tile[]
  ads: Tile[]
  /** Reserved tiles for user ads (manifest content). */
  adSlots: Tile[]
  gantries: Tile[]
  /** gantry tile per district id */
  gantryFor: Record<string, Tile>
  canvas: HTMLCanvasElement
}

const SIZE = 4096

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Draws every sign design into one atlas texture. Call after fonts load. */
export function buildAtlas(rng: Rng): Atlas {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)
  const signs: Tile[] = [], vsigns: Tile[] = [], holos: Tile[] = [], brands: Tile[] = [], ads: Tile[] = [], adSlots: Tile[] = [], gantries: Tile[] = []
  let x = 0, y = 0, rowH = 0
  const alloc = (w: number, h: number): [number, number] => {
    if (x + w > SIZE) { x = 0; y += rowH + 4; rowH = 0 }
    if (y + h > SIZE) throw new Error(`sign atlas overflow at ${y + h}px`)
    const r: [number, number] = [x, y]
    x += w + 4
    rowH = Math.max(rowH, h)
    return r
  }
  const tile = (px: number, py: number, w: number, h: number, kind: Tile['kind'], color: number): Tile => ({
    u0: px / SIZE, v0: 1 - (py + h) / SIZE, u1: (px + w) / SIZE, v1: 1 - py / SIZE, aspect: w / h, kind, color,
  })
  const neonText = (text: string, px: number, py: number, w: number, h: number, color: number, vertical: boolean, font: string) => {
    ctx.save()
    ctx.translate(px, py)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    // dark backing with a thin frame so signs read as boxes
    ctx.fillStyle = 'rgba(8,6,14,0.92)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = hex(color)
    ctx.lineWidth = 4
    ctx.globalAlpha = 0.85
    ctx.strokeRect(6, 6, w - 12, h - 12)
    ctx.globalAlpha = 1
    ctx.fillStyle = hex(color)
    ctx.shadowColor = hex(color)
    ctx.shadowBlur = 18
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (vertical) {
      const chars = [...text]
      const size = Math.min(w * 0.72, (h - 24) / chars.length)
      ctx.font = `bold ${size}px ${font}`
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 14 + size * (i + 0.5)))
    } else {
      let size = h * 0.62
      ctx.font = `bold ${size}px ${font}`
      const tw = ctx.measureText(text).width
      if (tw > w * 0.9) { size *= (w * 0.9) / tw; ctx.font = `bold ${size}px ${font}` }
      ctx.fillText(text, w / 2, h / 2 + 2)
    }
    ctx.restore()
  }
  const FONT_JP = '"Yu Gothic","Meiryo","Hiragino Sans","Noto Sans JP","MS Gothic",sans-serif'
  const FONT_CN = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif'
  const FONT_EN = 'Rajdhani,Impact,"Arial Narrow",sans-serif'
  const NEON = [0x37ebf3, 0xff2a6d, 0xfcee0a, 0xff6ec7, 0xa06bff, 0xff003c, 0x3cff9a, 0xffa030, 0xffffff, 0xff4a1a]

  // horizontal signs
  const hTexts = [...EN, ...JP.slice(0, 14), ...CN.slice(0, 8)]
  for (const t of hTexts) {
    const w = 320, h = 104
    const [px, py] = alloc(w, h)
    const color = rng.pick(NEON)
    const isJp = JP.includes(t), isCn = CN.includes(t)
    neonText(t, px, py, w, h, color, false, isJp ? FONT_JP : isCn ? FONT_CN : FONT_EN)
    signs.push({ ...tile(px, py, w, h, 'sign', color), lang: isJp ? 'jp' : isCn ? 'cn' : 'en', text: t })
  }
  // vertical signs (kanji / katakana / a few EN)
  const vTexts = [...JP, ...CN, 'HOTEL', 'BAR', 'SUSHI', 'KARAOKE', 'RAMEN', 'CLINIC', 'CASINO', 'SAKE']
  for (const t of vTexts) {
    const w = 80, h = 420
    const [px, py] = alloc(w, h)
    const color = rng.pick(NEON)
    const isJp = JP.includes(t), isCn = CN.includes(t)
    neonText(t, px, py, w, h, color, true, isJp ? FONT_JP : isCn ? FONT_CN : FONT_EN)
    vsigns.push({ ...tile(px, py, w, h, 'vsign', color), lang: isJp ? 'jp' : isCn ? 'cn' : 'en', text: t })
  }
  // brand logotypes (rooftop crowns)
  for (const [t, color] of BRANDS) {
    const w = 512, h = 104
    const [px, py] = alloc(w, h)
    ctx.save()
    ctx.translate(px, py)
    ctx.fillStyle = hex(color)
    ctx.shadowColor = hex(color)
    ctx.shadowBlur = 22
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 80
    ctx.font = `bold ${size}px ${FONT_EN}`
    const tw = ctx.measureText(t).width
    if (tw > w * 0.94) { size *= (w * 0.94) / tw; ctx.font = `bold ${size}px ${FONT_EN}` }
    ctx.fillText(t, w / 2, h / 2 + 4)
    ctx.restore()
    brands.push({ ...tile(px, py, w, h, 'brand', color), text: t })
  }
  // holographic ad posters (portrait)
  for (const [brand, slogan, fg, bg] of AD_LINES) {
    const w = 256, h = 384
    const [px, py] = alloc(w, h)
    ctx.save()
    ctx.translate(px, py)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, hex(bg))
    g.addColorStop(1, hex(fg))
    ctx.fillStyle = g
    ctx.globalAlpha = 0.9
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    // abstract "face" / product silhouette: big soft ellipse + geometric bars
    ctx.fillStyle = hex(fg)
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    ctx.ellipse(w * 0.5, h * 0.42, w * 0.28, h * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.8
    for (let i = 0; i < 6; i++) ctx.fillRect(20 + i * 50, h * 0.62, 30, 6 + rng.int(0, 40))
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = hex(fg)
    ctx.shadowBlur = 20
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 64
    ctx.font = `bold ${size}px ${FONT_EN}`
    const tw = ctx.measureText(brand).width
    if (tw > w * 0.9) { size *= (w * 0.9) / tw; ctx.font = `bold ${size}px ${FONT_EN}` }
    ctx.fillText(brand, w / 2, h * 0.14)
    ctx.font = `600 26px ${FONT_EN}`
    ctx.fillStyle = hex(fg === 0xffffff ? 0xfcee0a : 0xffffff)
    ctx.fillText(slogan, w / 2, h * 0.86)
    // scanlines
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    for (let yy = 0; yy < h; yy += 4) ctx.fillRect(0, yy, w, 1)
    ctx.restore()
    holos.push(tile(px, py, w, h, 'holo', fg))
  }
  // landscape ads (billboards) drawn from the same lines
  for (const [brand, slogan, fg, bg] of AD_LINES) {
    const w = 448, h = 224
    const [px, py] = alloc(w, h)
    ctx.save()
    ctx.translate(px, py)
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, hex(bg))
    g.addColorStop(1, hex(fg))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = hex(fg)
    ctx.shadowBlur = 16
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let size = 72
    ctx.font = `bold ${size}px ${FONT_EN}`
    const tw = ctx.measureText(brand).width
    if (tw > w * 0.85) { size *= (w * 0.85) / tw; ctx.font = `bold ${size}px ${FONT_EN}` }
    ctx.fillText(brand, 28, h * 0.38)
    ctx.font = `600 30px ${FONT_EN}`
    ctx.fillText(slogan, 30, h * 0.72)
    ctx.restore()
    ads.push(tile(px, py, w, h, 'ad', fg))
  }
  // highway destination gantries
  const gantryFor: Record<string, Tile> = {}
  const GANTRY: [string, string][] = [...DISTRICTS.map((d) => [d.id, d.name.toUpperCase() + '  \u2191'] as [string, string]), ['badlands', 'BADLANDS  \u2191']]
  for (const [id, t] of GANTRY) {
    const w = 448, h = 140
    const [px, py] = alloc(w, h)
    ctx.save()
    ctx.translate(px, py)
    ctx.fillStyle = '#0b2e24'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#cfd8d4'
    ctx.lineWidth = 5
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.fillStyle = '#f2f6f4'
    ctx.font = `700 56px ${FONT_EN}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, 24, h / 2 + 2)
    ctx.fillStyle = '#fcee0a'
    ctx.font = `600 24px ${FONT_EN}`
    ctx.fillText('NC-' + (rng.int(1, 9) * 10), w - 110, h - 30)
    ctx.restore()
    const gt = tile(px, py, w, h, 'gantry', 0xf2f6f4)
    gantries.push(gt)
    gantryFor[id] = gt
  }
  // reserved user-ad slots (filled later by ads.ts)
  for (let i = 0; i < 6; i++) {
    const w = 448, h = 224
    const [px, py] = alloc(w, h)
    ctx.fillStyle = '#101018'
    ctx.fillRect(px, py, w, h)
    adSlots.push(tile(px, py, w, h, 'ad', 0xffffff))
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  return { texture, signs, vsigns, holos, brands, ads, adSlots, gantries, gantryFor, canvas }
}

/** Repaints one reserved slot with an image or text ad. */
export function paintAdSlot(atlas: Atlas, slot: Tile, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
  const ctx = atlas.canvas.getContext('2d')!
  const px = slot.u0 * SIZE, py = (1 - slot.v1) * SIZE
  const w = (slot.u1 - slot.u0) * SIZE, h = (slot.v1 - slot.v0) * SIZE
  ctx.save()
  ctx.translate(px, py)
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.clearRect(0, 0, w, h)
  draw(ctx, w, h)
  ctx.restore()
  atlas.texture.needsUpdate = true
}

// ------------------------------------------------------------------ signs

const SIGN_VERT = /* glsl */ `
attribute vec4 aTile;
attribute vec4 aExtra; // intensity, flickerSeed, scroll, unused
varying vec2 vUv;
varying vec4 vTile;
varying vec4 vExtra;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vTile = aTile;
  vExtra = aExtra;
  vec4 w = instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const SIGN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uCam;
uniform float uLights;
uniform float uTime;
uniform float uHolo;
varying vec2 vUv;
varying vec4 vTile;
varying vec4 vExtra;
varying vec3 vWorld;
uniform vec3 uHaze;
void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
  if (uHolo > 0.5) {
    // slow vertical scroll + jitter lines
    uv.y = fract(uv.y + uTime * 0.02 * vExtra.z);
  }
  vec2 auv = mix(vTile.xy, vTile.zw, uv);
  vec4 t = texture2D(uAtlas, auv);
  float flick = 1.0;
  float fs = vExtra.y;
  float t1 = uTime * (2.0 + fs * 5.0) + fs * 40.0;
  flick = 0.82 + 0.18 * sin(t1 * 7.3) * sin(t1 * 3.1);
  if (fract(fs * 91.7) < 0.15) flick *= step(0.2, fract(uTime * 0.7 + fs));
  vec3 col = t.rgb * vExtra.x * (0.2 + 0.7 * uLights) * flick;
  float alpha = t.a;
  if (uHolo > 0.5) {
    float scan = 0.85 + 0.15 * sin(vWorld.y * 12.0 + uTime * 6.0);
    col *= scan;
    alpha *= 0.55;
    // holograms fade near edges
    float e = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    alpha *= e;
  }
  float dist = distance(vWorld, uCam);
  float fd = uFogDensity * (0.3 + 0.7 * exp(-max(vWorld.y - 20.0, 0.0) / 260.0));
  float fog = 1.0 - exp(-fd * fd * dist * dist);
  vec3 fogCol = mix(uFog, uHaze, fog * exp(-max(vWorld.y, 0.0) / 140.0) * 0.8);
  col = mix(col, fogCol, fog * (uHolo > 0.5 ? 0.0 : 1.0));
  alpha *= (uHolo > 0.5 ? (1.0 - fog) : 1.0);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}
`

export interface SignInstance {
  x: number
  y: number
  z: number
  /** rotation about Y in radians (plane faces +z before rotation) */
  rot: number
  w: number
  h: number
  tile: Tile
  intensity?: number
  scroll?: number
  /** Optional URL for clickable ads. */
  url?: string
}

export class SignSet {
  readonly items: SignInstance[] = []
  material: ShaderMaterial
  mesh: InstancedMesh | null = null
  constructor(atlas: Atlas, private holo: boolean) {
    this.material = new ShaderMaterial({
      vertexShader: SIGN_VERT,
      fragmentShader: SIGN_FRAG,
      uniforms: {
        uAtlas: { value: atlas.texture },
        uFog: { value: new Color(0) },
        uHaze: { value: new Color(0) },
        uFogDensity: { value: 0.001 },
        uCam: { value: new Vector3() },
        uLights: { value: 1 },
        uTime: { value: 0 },
        uHolo: { value: holo ? 1 : 0 },
      },
      transparent: true,
      depthWrite: !holo,
      side: DoubleSide,
      blending: holo ? AdditiveBlending : NormalBlending,
    })
  }
  add(s: SignInstance): void {
    this.items.push(s)
  }
  build(): InstancedMesh {
    const geo = new PlaneGeometry(1, 1)
    const n = Math.max(1, this.items.length)
    const mesh = new InstancedMesh(geo, this.material, n)
    const tiles = new Float32Array(n * 4)
    const extra = new Float32Array(n * 4)
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3()
    const up = new Vector3(0, 1, 0)
    this.items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot)
      p.set(it.x, it.y, it.z)
      s.set(it.w, it.h, 1)
      m.compose(p, q, s)
      mesh.setMatrixAt(i, m)
      tiles[i * 4] = it.tile.u0; tiles[i * 4 + 1] = it.tile.v0; tiles[i * 4 + 2] = it.tile.u1; tiles[i * 4 + 3] = it.tile.v1
      extra[i * 4] = it.intensity ?? 2.2
      extra[i * 4 + 1] = (i * 0.37) % 1
      extra[i * 4 + 2] = it.scroll ?? 1
      extra[i * 4 + 3] = 0
    })
    if (this.items.length === 0) mesh.count = 0
    geo.setAttribute('aTile', new InstancedBufferAttribute(tiles, 4))
    geo.setAttribute('aExtra', new InstancedBufferAttribute(extra, 4))
    mesh.frustumCulled = false
    mesh.renderOrder = this.holo ? 20 : 10
    this.mesh = mesh
    return mesh
  }
  update(preset: TimePreset, camera: Camera, time: number, fogMul = 1): void {
    const a = ATMOS[preset]
    const u = this.material.uniforms
    ;(u.uFog.value as Color).set(a.fogColor)
    ;(u.uHaze.value as Color).set(a.skyGlow)
    u.uFogDensity.value = a.fogDensity * fogMul
    ;(u.uCam.value as Vector3).copy(camera.position)
    u.uLights.value = a.lights
    u.uTime.value = time
  }
}

// ------------------------------------------------------------ glow points

const GLOW_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aBlink; // 0 = steady, >0 = blink rate
varying vec3 vColor;
varying float vFade;
uniform float uTime;
uniform float uFogDensity;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float blink = aBlink > 0.0 ? step(0.5, fract(uTime * aBlink + aSize)) : 1.0;
  float fd = uFogDensity * (0.3 + 0.7 * exp(-max(position.y - 20.0, 0.0) / 260.0));
  float fog = exp(-fd * fd * d * d);
  vFade = fog * blink;
  vColor = aColor;
  gl_PointSize = clamp(aSize * uScale / d, 1.0, 64.0);
  gl_Position = projectionMatrix * mv;
}
`
const GLOW_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vFade;
uniform float uLights;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vColor * (0.3 + 0.7 * uLights) * a * vFade * 0.9, a * vFade);
}
`

export class GlowPoints {
  private pos: number[] = []
  private col: number[] = []
  private size: number[] = []
  private blink: number[] = []
  material: ShaderMaterial
  points: Points | null = null
  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uTime: { value: 0 }, uFogDensity: { value: 0.001 }, uScale: { value: 600 }, uLights: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
  }
  add(x: number, y: number, z: number, color: number, size: number, blink = 0): void {
    this.pos.push(x, y, z)
    const c = new Color(color)
    this.col.push(c.r, c.g, c.b)
    this.size.push(size)
    this.blink.push(blink)
  }
  get count(): number {
    return this.size.length
  }
  build(): Points {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    geo.setAttribute('aColor', new BufferAttribute(new Float32Array(this.col), 3))
    geo.setAttribute('aSize', new BufferAttribute(new Float32Array(this.size), 1))
    geo.setAttribute('aBlink', new BufferAttribute(new Float32Array(this.blink), 1))
    const pts = new Points(geo, this.material)
    pts.frustumCulled = false
    pts.renderOrder = 30
    this.points = pts
    return pts
  }
  update(preset: TimePreset, time: number, heightPx: number, fogMul = 1): void {
    const a = ATMOS[preset]
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uFogDensity.value = a.fogDensity * fogMul
    this.material.uniforms.uScale.value = heightPx * 0.9
    this.material.uniforms.uLights.value = a.lights
  }
}
