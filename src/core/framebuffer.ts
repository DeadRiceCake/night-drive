import type { Sprite } from './sprite'

/** 4x4 Bayer matrix, values 0..15. */
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** Dither level: 0 = all `a`, 16 = all `b`. Levels 4/8/12 = 25/50/75%. */
export type DitherLevel = number

/**
 * Indexed software framebuffer. Every write is an integer pixel; there is no
 * anti-aliasing anywhere in this class by construction.
 */
export class Framebuffer {
  readonly idx: Uint8Array
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.idx = new Uint8Array(w * h)
  }

  clear(i: number): void {
    this.idx.fill(i)
  }

  px(x: number, y: number, i: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.idx[y * this.w + x] = i
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.idx[y * this.w + x]
  }

  /** Horizontal line from x0 to x1 inclusive. */
  hline(x0: number, x1: number, y: number, i: number): void {
    if (y < 0 || y >= this.h) return
    if (x0 > x1) [x0, x1] = [x1, x0]
    if (x0 < 0) x0 = 0
    if (x1 >= this.w) x1 = this.w - 1
    if (x0 > x1) return
    this.idx.fill(i, y * this.w + x0, y * this.w + x1 + 1)
  }

  /** Dithered horizontal line: pixel gets `b` where bayer < level, else `a`. */
  hlineDither(x0: number, x1: number, y: number, a: number, b: number, level: DitherLevel): void {
    if (level <= 0) return this.hline(x0, x1, y, a)
    if (level >= 16) return this.hline(x0, x1, y, b)
    if (y < 0 || y >= this.h) return
    if (x0 > x1) [x0, x1] = [x1, x0]
    if (x0 < 0) x0 = 0
    if (x1 >= this.w) x1 = this.w - 1
    const row = BAYER[y & 3]
    const base = y * this.w
    for (let x = x0; x <= x1; x++) this.idx[base + x] = row[x & 3] < level ? b : a
  }

  vline(x: number, y0: number, y1: number, i: number): void {
    if (x < 0 || x >= this.w) return
    if (y0 > y1) [y0, y1] = [y1, y0]
    if (y0 < 0) y0 = 0
    if (y1 >= this.h) y1 = this.h - 1
    for (let y = y0; y <= y1; y++) this.idx[y * this.w + x] = i
  }

  fillRect(x: number, y: number, w: number, h: number, i: number): void {
    for (let yy = y; yy < y + h; yy++) this.hline(x, x + w - 1, yy, i)
  }

  fillRectDither(x: number, y: number, w: number, h: number, a: number, b: number, level: DitherLevel): void {
    for (let yy = y; yy < y + h; yy++) this.hlineDither(x, x + w - 1, yy, a, b, level)
  }

  rect(x: number, y: number, w: number, h: number, i: number): void {
    this.hline(x, x + w - 1, y, i)
    this.hline(x, x + w - 1, y + h - 1, i)
    this.vline(x, y, y + h - 1, i)
    this.vline(x + w - 1, y, y + h - 1, i)
  }

  /** Bresenham line (integer endpoints). */
  line(x0: number, y0: number, x1: number, y1: number, i: number): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.px(x0, y0, i)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  /** Midpoint circle outline. */
  circle(cx: number, cy: number, r: number, i: number): void {
    let x = r, y = 0, err = 1 - r
    while (x >= y) {
      this.px(cx + x, cy + y, i); this.px(cx + y, cy + x, i)
      this.px(cx - y, cy + x, i); this.px(cx - x, cy + y, i)
      this.px(cx - x, cy - y, i); this.px(cx - y, cy - x, i)
      this.px(cx + y, cy - x, i); this.px(cx + x, cy - y, i)
      y++
      if (err < 0) err += 2 * y + 1
      else { x--; err += 2 * (y - x) + 1 }
    }
  }

  /** Filled circle via horizontal spans. */
  disc(cx: number, cy: number, r: number, i: number): void {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy))
      this.hline(cx - dx, cx + dx, cy + dy, i)
    }
  }

  /** 1:1 sprite blit, index 0 transparent. Optional horizontal flip. */
  blit(s: Sprite, x: number, y: number, flip = false): void {
    x |= 0; y |= 0
    const { w, h, d } = s
    for (let sy = 0; sy < h; sy++) {
      const dy = y + sy
      if (dy < 0 || dy >= this.h) continue
      const rowBase = dy * this.w
      for (let sx = 0; sx < w; sx++) {
        const dx = x + sx
        if (dx < 0 || dx >= this.w) continue
        const v = d[sy * w + (flip ? w - 1 - sx : sx)]
        if (v) this.idx[rowBase + dx] = v
      }
    }
  }

  /**
   * Nearest-neighbour scaled blit into an integer destination rect.
   * Rows at or below `clipY` are not drawn (for hill occlusion).
   */
  blitScaled(s: Sprite, x: number, y: number, dw: number, dh: number, flip = false, clipY = this.h): void {
    x |= 0; y |= 0; dw |= 0; dh |= 0
    if (dw <= 0 || dh <= 0) return
    const { w, h, d } = s
    const yEnd = Math.min(y + dh, clipY, this.h)
    const xEnd = Math.min(x + dw, this.w)
    const y0 = Math.max(y, 0)
    const x0 = Math.max(x, 0)
    for (let dy = y0; dy < yEnd; dy++) {
      const sy = (((dy - y) * h) / dh) | 0
      const srow = sy * w
      const drow = dy * this.w
      for (let dx = x0; dx < xEnd; dx++) {
        let sx = (((dx - x) * w) / dw) | 0
        if (flip) sx = w - 1 - sx
        const v = d[srow + sx]
        if (v) this.idx[drow + dx] = v
      }
    }
  }

  /** Copy another framebuffer at (x,y), optionally flipped horizontally. */
  blitFb(src: Framebuffer, x: number, y: number, flip = false): void {
    this.blit({ w: src.w, h: src.h, d: src.idx }, x, y, flip)
  }

  /** Remap pixels in a rect through a table, with dither level (16 = all). */
  remapRect(x: number, y: number, w: number, h: number, table: Uint8Array, level: DitherLevel = 16): void {
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w)
    const y0 = Math.max(0, y), y1 = Math.min(this.h, y + h)
    for (let yy = y0; yy < y1; yy++) {
      const row = BAYER[yy & 3]
      const base = yy * this.w
      for (let xx = x0; xx < x1; xx++) {
        if (level >= 16 || row[xx & 3] < level) this.idx[base + xx] = table[this.idx[base + xx]]
      }
    }
  }

  /** Remap a horizontal span through a table with dither. */
  remapSpan(x0: number, x1: number, y: number, table: Uint8Array, level: DitherLevel = 16): void {
    if (y < 0 || y >= this.h || level <= 0) return
    if (x0 > x1) [x0, x1] = [x1, x0]
    if (x0 < 0) x0 = 0
    if (x1 >= this.w) x1 = this.w - 1
    const row = BAYER[y & 3]
    const base = y * this.w
    for (let x = x0; x <= x1; x++) {
      if (level >= 16 || row[x & 3] < level) this.idx[base + x] = table[this.idx[base + x]]
    }
  }

  /** Resolve indices through the LUT into an RGBA ImageData buffer. */
  present(target: Uint32Array, lut: Uint32Array): void {
    const idx = this.idx
    for (let i = 0, n = idx.length; i < n; i++) target[i] = lut[idx[i]]
  }
}
