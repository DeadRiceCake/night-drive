import { BAYER } from '../core/framebuffer'
import { buildRGB, P, RAMPS, pal, type RampName } from '../core/palette'
import { blank, type Sprite } from '../core/sprite'

/** Ramps that ad content may quantize to (world colors only). */
const ALLOWED: RampName[] = [
  'sky', 'far', 'ground', 'road', 'lane', 'rumble', 'veg', 'struct', 'glass',
  'lightWarm', 'lightCool', 'tail', 'neonA', 'neonB', 'carA', 'carB', 'carC', 'carD', 'mono',
]

let table: { idx: number[]; rgb: Uint8Array } | null = null

function paletteTable(): { idx: number[]; rgb: Uint8Array } {
  if (table) return table
  const rgb = buildRGB('day')
  const idx: number[] = []
  for (const r of ALLOWED) for (let s = 0; s < RAMPS[r]; s++) idx.push(P[r] + s)
  table = { idx, rgb }
  return table
}

function nearest(r: number, g: number, b: number): number {
  const { idx, rgb } = paletteTable()
  let best = idx[0], bd = Infinity
  for (const i of idx) {
    const dr = rgb[i * 3] - r, dg = rgb[i * 3 + 1] - g, db = rgb[i * 3 + 2] - b
    // perceptual-ish weighting
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
    if (d < bd) { bd = d; best = i }
  }
  return best
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Bounding box of pixels that are neither transparent nor near-white. */
function contentBox(img: ImageData): { x0: number; y0: number; x1: number; y1: number } {
  const { width: w, height: h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 24) continue
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }
  return { x0, y0, x1, y1 }
}

export interface PixelizeOptions {
  /** 'contain' keeps the aspect ratio inside the slot (default); 'stretch' fills it. */
  fit?: 'contain' | 'stretch'
  /** Trim transparent / near-white margins before fitting (default true). */
  trim?: boolean
  /** Ordered-dither amplitude in RGB units (default 18). */
  dither?: number
  /** Background palette index for letterboxed area (default mono.3 = white). */
  bg?: number
}

/**
 * Downsample RGBA image data into a `w`x`h` sprite (box filter), then
 * quantize to the world palette with ordered (Bayer) dithering. Transparent
 * areas are composited on white so logos on transparent backgrounds read.
 */
export function pixelize(img: ImageData, w: number, h: number, opts: PixelizeOptions = {}): Sprite {
  const fit = opts.fit ?? 'contain'
  const trim = opts.trim ?? true
  const ditherAmount = opts.dither ?? 18
  const bg = opts.bg ?? pal('mono', 3)
  const out = blank(w, h)
  out.d.fill(bg)

  const box = trim ? contentBox(img) : { x0: 0, y0: 0, x1: img.width - 1, y1: img.height - 1 }
  const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1

  // Destination rect inside the slot
  let dx = 0, dy = 0, dw = w, dh = h
  if (fit === 'contain') {
    const pad = w >= 32 && h >= 12 ? 1 : 0
    const aw = w - pad * 2, ah = h - pad * 2
    const s = Math.min(aw / sw, ah / sh)
    dw = Math.max(1, Math.round(sw * s))
    dh = Math.max(1, Math.round(sh * s))
    dx = Math.floor((w - dw) / 2)
    dy = Math.floor((h - dh) / 2)
  }

  const data = img.data
  const iw = img.width
  for (let y = 0; y < dh; y++) {
    const sy0 = box.y0 + Math.floor((y * sh) / dh)
    const sy1 = Math.max(sy0 + 1, box.y0 + Math.floor(((y + 1) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx0 = box.x0 + Math.floor((x * sw) / dw)
      const sx1 = Math.max(sx0 + 1, box.x0 + Math.floor(((x + 1) * sw) / dw))
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = sy0; yy < sy1; yy++)
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (yy * iw + xx) * 4
          const a = data[i + 3] / 255
          r += data[i] * a + 255 * (1 - a)
          g += data[i + 1] * a + 255 * (1 - a)
          b += data[i + 2] * a + 255 * (1 - a)
          n++
        }
      r /= n; g /= n; b /= n
      const ox = dx + x, oy = dy + y
      const d = ((BAYER[oy & 3][ox & 3] - 7.5) / 16) * ditherAmount
      out.d[oy * w + ox] = nearest(clamp(r + d), clamp(g + d), clamp(b + d))
    }
  }
  return out
}
