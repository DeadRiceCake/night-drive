import { Framebuffer, BAYER } from '../core/framebuffer'
import { pal, SHIFT_UP, SHIFT_DOWN } from '../core/palette'
import type { Segment, Point, Prop } from './segments'
import { SEG_LEN, ROAD_W, LANE_OURS, LANE_ONCOMING } from '../tokens'
import type { TimePreset } from '../tokens'
import type { Car } from '../world/traffic'
import { carSprite } from '../world/traffic'

export interface View {
  /** Camera z (absolute world units). */
  position: number
  /** Camera x in road half-widths (-1..1). */
  playerX: number
  dir: 1 | -1
  drawDist: number
  camH: number
  fov: number
  /** Horizon row in the target framebuffer. */
  horizon: number
  /** Bottom row (exclusive) to render road to. */
  bottom: number
  preset: TimePreset
  /** Fog color index and strength 0..1. */
  fogColor: number
  fogStrength: number
  /** Global tick for animations. */
  tick: number
}

export interface RenderStats {
  /** Road span per row: [x0, x1] or -1 if none. */
  roadL: Int16Array
  roadR: Int16Array
  /** Row at which the drawn road starts (farthest). */
  farRow: number
  /** Screen x of the player's lane at the nearest row. */
  playerLaneX: number
  /** Lit prop positions drawn this frame (screen x, ground y, size, kind). */
  lights: { x: number; y: number; s: number; kind: string }[]
}

export function makeStats(h: number): RenderStats {
  return { roadL: new Int16Array(h), roadR: new Int16Array(h), farRow: 0, playerLaneX: 0, lights: [] }
}

export interface SegmentSource {
  /** Get segment by absolute index; must exist for the visible range. */
  get(index: number): Segment
  cars: Car[]
}

function project(p: Point, camX: number, camY: number, camZ: number, camDepth: number, W: number, H: number, horizon: number): void {
  p.camX = -camX
  p.camY = p.worldY - camY
  p.camZ = p.worldZ - camZ
  p.scale = camDepth / p.camZ
  p.x = Math.round(W / 2 + (p.scale * p.camX * W) / 2)
  p.y = Math.round(horizon - (p.scale * p.camY * H) / 2)
  p.w = Math.round((p.scale * ROAD_W * W) / 2)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Renders sky-less road + roadside props + cars into `fb`.
 * Everything is drawn per scanline or via nearest-neighbour blits.
 */
export function renderRoad(fb: Framebuffer, src: SegmentSource, v: View, stats: RenderStats): void {
  const W = fb.w, H = fb.h
  const camDepth = 1 / Math.tan(((v.fov / 2) * Math.PI) / 180)
  const baseIndex = Math.floor(v.position / SEG_LEN)
  const basePercent = (v.position - baseIndex * SEG_LEN) / SEG_LEN
  const base = src.get(baseIndex)
  const playerY = lerp(base.y0, base.y, basePercent)
  const camY = playerY + v.camH
  const camXw = v.playerX * ROAD_W * v.dir

  stats.roadL.fill(-1)
  stats.roadR.fill(-1)
  stats.lights.length = 0
  let maxy = v.bottom

  let x = 0
  let dx = v.dir === 1 ? -(base.curve * basePercent) : base.curve * (1 - basePercent)

  const visible: Segment[] = []

  for (let n = 0; n < v.drawDist; n++) {
    const seg = src.get(baseIndex + n * v.dir)
    seg.n = n
    seg.clip = maxy
    const curve = seg.curve * v.dir
    if (v.dir === 1) {
      seg.p1.worldZ = seg.index * SEG_LEN
      seg.p1.worldY = seg.y0
      seg.p2.worldZ = (seg.index + 1) * SEG_LEN
      seg.p2.worldY = seg.y
      project(seg.p1, camXw - x, camY, v.position, camDepth, W, H, v.horizon)
      project(seg.p2, camXw - x - dx, camY, v.position, camDepth, W, H, v.horizon)
    } else {
      // Looking backwards: near point is the segment's far end.
      seg.p1.worldZ = v.position - (seg.index + 1) * SEG_LEN + v.position
      seg.p1.worldY = seg.y
      seg.p2.worldZ = v.position - seg.index * SEG_LEN + v.position
      seg.p2.worldY = seg.y0
      project(seg.p1, camXw - x, camY, v.position, camDepth, W, H, v.horizon)
      project(seg.p2, camXw - x - dx, camY, v.position, camDepth, W, H, v.horizon)
    }
    x += dx
    dx += curve

    if (seg.p1.camZ <= camDepth || seg.p2.y >= seg.p1.y || seg.p2.y >= maxy) {
      visible.push(seg)
      continue
    }

    drawSegment(fb, seg, n, v, stats, maxy)
    maxy = Math.min(maxy, seg.p1.y)
    visible.push(seg)
  }
  stats.farRow = maxy

  // Player lane screen x on the nearest row (for headlight cone)
  stats.playerLaneX = Math.round(W / 2)

  // Sprites and cars, back to front.
  for (let n = visible.length - 1; n >= 0; n--) {
    const seg = visible[n]
    if (seg.p1.camZ <= camDepth) continue
    const fog = fogLevel(n, v)
    for (const prop of seg.props) drawProp(fb, seg, prop, v, fog, stats)
    // Cars in this segment
    for (const car of src.cars) {
      const ci = Math.floor(car.z / SEG_LEN)
      if (ci !== seg.index) continue
      drawCar(fb, seg, car, v, fog, stats)
    }
  }
}

function fogLevel(n: number, v: View): number {
  if (v.fogStrength <= 0) return 0
  const t = n / v.drawDist
  // Starts at 45% distance, saturates at the far end.
  const f = Math.max(0, (t - 0.45) / 0.55) * v.fogStrength
  return Math.min(16, Math.round(f * 16))
}

function drawSegment(fb: Framebuffer, seg: Segment, n: number, v: View, stats: RenderStats, maxy: number): void {
  const p1 = seg.p1, p2 = seg.p2
  const y2 = Math.max(p2.y, 0)
  const y1 = Math.min(p1.y, maxy)
  if (y1 <= y2) return
  const alt = (seg.index % 6) < 3
  const fog = fogLevel(n, v)
  const dark = v.preset === 'night'
  const groundA = pal('ground', dark ? 0 : 1), groundB = pal('ground', dark ? 1 : 2)
  const roadA = pal('road', 1), roadB = pal('road', 2)
  const rumbleA = pal('rumble', 0), rumbleB = pal('rumble', 1)
  const laneCol = pal('lane', 1)
  const centerCol = pal('lane', 0)
  const isTunnel = seg.kind === 'tunnel'
  const isBridge = seg.kind === 'bridge'
  const span = p1.y - p2.y

  for (let y = y2; y < y1; y++) {
    const t = (y - p2.y) / span
    const cx = Math.round(lerp(p2.x, p1.x, t))
    const w = Math.round(lerp(p2.w, p1.w, t))
    const rw = Math.max(1, w >> 3)
    const lw = Math.max(1, w >> 5)
    // ground
    if (isTunnel) {
      fb.hline(0, cx - w - rw - 1, y, pal('struct', 0))
      fb.hline(cx + w + rw + 1, fb.w - 1, y, pal('struct', 0))
    } else if (isBridge) {
      fb.hline(0, cx - w - rw - 1, y, pal('far', dark ? 0 : 1))
      fb.hline(cx + w + rw + 1, fb.w - 1, y, pal('far', dark ? 0 : 1))
    } else {
      fb.hline(0, cx - w - rw - 1, y, alt ? groundA : groundB)
      fb.hline(cx + w + rw + 1, fb.w - 1, y, alt ? groundA : groundB)
    }
    // rumble strips
    fb.hline(cx - w - rw, cx - w - 1, y, alt ? rumbleA : rumbleB)
    fb.hline(cx + w + 1, cx + w + rw, y, alt ? rumbleA : rumbleB)
    // road surface
    fb.hline(cx - w, cx + w, y, alt ? roadA : roadB)
    // edge lines
    if (w > 6) {
      fb.hline(cx - w, cx - w + lw - 1, y, laneCol)
      fb.hline(cx + w - lw + 1, cx + w, y, laneCol)
    }
    // center double line (solid)
    if (w > 4) {
      const g = w > 40 ? 1 : 0
      fb.hline(cx - lw - g, cx - 1 - g, y, centerCol)
      fb.hline(cx + 1 + g, cx + lw + g, y, centerCol)
    }
    // dashed lane lines
    if (alt && w > 10) {
      const lx = Math.round(w * 0.5)
      fb.hline(cx - lx - (lw >> 1), cx - lx + (lw >> 1), y, laneCol)
      fb.hline(cx + lx - (lw >> 1), cx + lx + (lw >> 1), y, laneCol)
    }
    if (fog > 0) ditherSpan(fb, 0, fb.w - 1, y, v.fogColor, fog)
    stats.roadL[y] = cx - w
    stats.roadR[y] = cx + w
  }
}

/** Write `color` into pixels where bayer < level (fog / glow overlays). */
export function ditherSpan(fb: Framebuffer, x0: number, x1: number, y: number, color: number, level: number): void {
  if (level <= 0 || y < 0 || y >= fb.h) return
  if (x0 < 0) x0 = 0
  if (x1 >= fb.w) x1 = fb.w - 1
  const row = BAYER[y & 3]
  const base = y * fb.w
  for (let x = x0; x <= x1; x++) if (row[x & 3] < level) fb.idx[base + x] = color
}

/** Nearest-neighbour blit with fog dithering applied to written pixels. */
function blitFog(fb: Framebuffer, s: { w: number; h: number; d: Uint8Array }, x: number, y: number, dw: number, dh: number, flip: boolean, clipY: number, fogColor: number, fog: number): void {
  if (fog <= 0) return fb.blitScaled(s, x, y, dw, dh, flip, clipY)
  x |= 0; y |= 0; dw |= 0; dh |= 0
  if (dw <= 0 || dh <= 0) return
  const yEnd = Math.min(y + dh, clipY, fb.h)
  const xEnd = Math.min(x + dw, fb.w)
  for (let dy = Math.max(y, 0); dy < yEnd; dy++) {
    const sy = (((dy - y) * s.h) / dh) | 0
    const srow = sy * s.w
    const drow = dy * fb.w
    const brow = BAYER[dy & 3]
    for (let dx = Math.max(x, 0); dx < xEnd; dx++) {
      let sx = (((dx - x) * s.w) / dw) | 0
      if (flip) sx = s.w - 1 - sx
      const v = s.d[srow + sx]
      if (v) fb.idx[drow + dx] = brow[dx & 3] < fog ? fogColor : v
    }
  }
}

function drawProp(fb: Framebuffer, seg: Segment, prop: Prop, v: View, fog: number, stats: RenderStats): void {
  const p = seg.p1
  const spr = prop.frames ? prop.frames[Math.floor(v.tick / (prop.frameHold ?? 8)) % prop.frames.length] : prop.sprite
  const offset = prop.offset * v.dir
  const dw = Math.round(p.w * prop.worldW)
  if (dw < 1) return
  const dh = Math.round((dw * spr.h) / spr.w)
  const flip = v.dir === -1
  const dx = prop.center
    ? p.x + Math.round(p.w * offset) - (dw >> 1)
    : p.x + Math.round(p.w * offset) + (offset < 0 ? -dw : 0)
  const dy = p.y - dh
  if (dy >= seg.clip) return
  blitFog(fb, spr, dx, dy, dw, dh, flip, seg.clip, v.fogColor, fog)
  if (prop.adSlot && prop.adId) {
    const s = prop.adSlot
    const sc = dw / spr.w
    prop.adRect = {
      x: dx + Math.round((flip ? spr.w - s.x - s.w : s.x) * sc),
      y: dy + Math.round(s.y * sc),
      w: Math.round(s.w * sc),
      h: Math.round(s.h * sc),
      scale: sc,
    }
  }
  if (prop.lit && v.preset !== 'day' && fog < 12) {
    stats.lights.push({ x: dx + (dw >> 1), y: p.y, s: dw, kind: prop.lit })
  }
}

function drawCar(fb: Framebuffer, seg: Segment, car: Car, v: View, fog: number, stats: RenderStats): void {
  const percent = (car.z - seg.index * SEG_LEN) / SEG_LEN
  const t = v.dir === 1 ? percent : 1 - percent
  const p1 = seg.p1, p2 = seg.p2
  const scale = lerp(p1.scale, p2.scale, t)
  const sx = lerp(p1.x, p2.x, t)
  const sy = lerp(p1.y, p2.y, t)
  const w = lerp(p1.w, p2.w, t)
  // Facing: oncoming cars show their front to a forward view, and vice versa.
  const towardCamera = car.dirZ !== v.dir
  const spr = carSprite(car, towardCamera)
  const dw = Math.round(w * car.worldW)
  if (dw < 1) return
  const dh = Math.round((dw * spr.h) / spr.w)
  const offset = car.offset * v.dir
  const dx = Math.round(sx + w * offset - dw / 2)
  const dy = Math.round(sy) - dh
  if (dy >= seg.clip) return
  const flip = v.dir === -1
  blitFog(fb, spr, dx, dy, dw, dh, flip, seg.clip, v.fogColor, fog)
  if (v.preset !== 'day' && fog < 14) {
    // Headlights toward camera glow; taillights otherwise.
    stats.lights.push({ x: dx + (dw >> 1), y: Math.round(sy), s: dw, kind: towardCamera ? 'head' : 'tail' })
  }
  void scale
}

/** Lanes helper for AI. */
export const ALL_LANES = [...LANE_ONCOMING, ...LANE_OURS]

/**
 * Night lighting pass. Brightens the road inside the headlight cone and adds
 * glows around lit props/cars, using ramp shifts + dither only.
 */
export function applyLighting(fb: Framebuffer, stats: RenderStats, v: View, bottom: number): void {
  if (v.preset === 'day') return
  const near = bottom
  const far = stats.farRow
  const range = Math.max(1, near - far)
  const cone = v.preset === 'night' ? 1 : 0.5
  for (let y = far; y < near; y++) {
    const L = stats.roadL[y], R = stats.roadR[y]
    if (L < 0) continue
    const d = (y - far) / range // 0 far .. 1 near
    // Level 0..32: >16 means shift twice
    const lvl = Math.round(Math.pow(d, 1.6) * 30 * cone)
    if (lvl <= 0) continue
    const roadW = R - L
    // Cone narrows with distance toward player's lane
    const laneX = L + roadW * ((v.playerX * v.dir + 1) / 2)
    const half = roadW * (0.25 + 0.55 * d)
    const x0 = Math.round(Math.max(L - roadW * 0.15 * d, laneX - half))
    const x1 = Math.round(Math.min(R + roadW * 0.15 * d, laneX + half))
    if (lvl >= 16) {
      fb.remapSpan(x0, x1, y, SHIFT_UP, 16)
      fb.remapSpan(x0, x1, y, SHIFT_UP, lvl - 16)
    } else {
      fb.remapSpan(x0, x1, y, SHIFT_UP, lvl)
    }
  }
  // Light glows
  for (const l of stats.lights) {
    const r = Math.max(2, Math.round(l.s * (l.kind === 'head' ? 0.5 : l.kind === 'tail' ? 0.35 : 0.3)))
    if (r > 40) continue
    glow(fb, l.x, l.y - (l.kind === 'head' || l.kind === 'tail' ? Math.round(l.s * 0.15) : Math.round(l.s * 0.8)), r, l.kind === 'tail' ? 'tail' : 'up')
  }
}

function glow(fb: Framebuffer, cx: number, cy: number, r: number, mode: 'up' | 'tail'): void {
  const table = mode === 'tail' ? TAIL_TABLE : SHIFT_UP
  for (let dy = -r; dy <= r; dy++) {
    const yy = cy + dy
    if (yy < 0 || yy >= fb.h) continue
    const dxm = Math.floor(Math.sqrt(r * r - dy * dy) * 1.6)
    const x0 = cx - dxm, x1 = cx + dxm
    const rr = Math.sqrt(dy * dy + 0) / r
    const level = Math.round((1 - rr) * 10)
    if (level <= 0) continue
    fb.remapSpan(x0, x1, yy, table, level)
  }
}

/** Taillight glow: darken then tint by mapping road ramps toward tail.0. */
const TAIL_TABLE = new Uint8Array(SHIFT_DOWN.length)
for (let i = 0; i < TAIL_TABLE.length; i++) TAIL_TABLE[i] = i
for (let s = 0; s < 4; s++) TAIL_TABLE[pal('road', s)] = pal('tail', 0)
TAIL_TABLE[pal('lane', 0)] = pal('tail', 1)
TAIL_TABLE[pal('lane', 1)] = pal('tail', 1)
for (let s = 0; s < 4; s++) TAIL_TABLE[pal('ground', s)] = pal('tail', 0)
