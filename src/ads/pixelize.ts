import { BAYER } from '../core/framebuffer'
import { buildRGB, P, RAMPS, type RampName } from '../core/palette'
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

/**
 * Downsample RGBA image data to `w`x`h` (box filter), then quantize to the
 * world palette with ordered (Bayer) dithering. Transparent areas become
 * white-ish (mono.3) so logos on transparent backgrounds still read.
 */
export function pixelize(img: ImageData, w: number, h: number, ditherAmount = 18): Sprite {
  const out = blank(w, h)
  const sw = img.width, sh = img.height
  const data = img.data
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * sh) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / h))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * sw) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / w))
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = sy0; yy < sy1; yy++)
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (yy * sw + xx) * 4
          const a = data[i + 3] / 255
          r += data[i] * a + 255 * (1 - a)
          g += data[i + 1] * a + 255 * (1 - a)
          b += data[i + 2] * a + 255 * (1 - a)
          n++
        }
      r /= n; g /= n; b /= n
      const d = ((BAYER[y & 3][x & 3] - 7.5) / 16) * ditherAmount
      out.d[y * w + x] = nearest(clamp(r + d), clamp(g + d), clamp(b + d))
    }
  }
  return out
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
