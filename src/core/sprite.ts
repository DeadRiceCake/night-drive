/** A palette-indexed sprite. Index 0 is transparent. */
export interface Sprite {
  w: number
  h: number
  d: Uint8Array
}

export type CharMap = Record<string, number>

/**
 * Build a sprite from string-art rows. Characters map to palette indices via
 * `map`; '.' and ' ' are transparent. All rows are padded to the widest.
 */
export function art(rows: string[], map: CharMap): Sprite {
  const w = Math.max(...rows.map((r) => r.length))
  const h = rows.length
  const d = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === '.' || c === ' ') continue
      const v = map[c]
      if (v === undefined) throw new Error(`art: unmapped char '${c}' at row ${y}`)
      d[y * w + x] = v
    }
  }
  return { w, h, d }
}

export function blank(w: number, h: number, fill = 0): Sprite {
  const d = new Uint8Array(w * h)
  if (fill) d.fill(fill)
  return { w, h, d }
}

export function setPx(s: Sprite, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return
  s.d[y * s.w + x] = v
}

export function fillRect(s: Sprite, x: number, y: number, w: number, h: number, v: number): void {
  for (let yy = Math.max(0, y); yy < Math.min(s.h, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(s.w, x + w); xx++) s.d[yy * s.w + xx] = v
}

/** Paste `src` into `dst` at (x, y); transparent pixels skipped. */
export function paste(dst: Sprite, src: Sprite, x: number, y: number, flip = false): void {
  for (let sy = 0; sy < src.h; sy++)
    for (let sx = 0; sx < src.w; sx++) {
      const v = src.d[sy * src.w + (flip ? src.w - 1 - sx : sx)]
      if (v) setPx(dst, x + sx, y + sy, v)
    }
}

export function flipX(s: Sprite): Sprite {
  const out = blank(s.w, s.h)
  paste(out, s, 0, 0, true)
  return out
}

/** Nearest-neighbour resample to an integer size. */
export function scaleSprite(s: Sprite, dw: number, dh: number): Sprite {
  const out = blank(dw, dh)
  for (let y = 0; y < dh; y++) {
    const sy = ((y * s.h) / dh) | 0
    for (let x = 0; x < dw; x++) {
      const sx = ((x * s.w) / dw) | 0
      out.d[y * dw + x] = s.d[sy * s.w + sx]
    }
  }
  return out
}

/** Replace every occurrence of one index with another (palette swap). */
export function recolor(s: Sprite, from: number, to: number): Sprite {
  const d = new Uint8Array(s.d)
  for (let i = 0; i < d.length; i++) if (d[i] === from) d[i] = to
  return { w: s.w, h: s.h, d }
}

/** Remap through a table (e.g. shift a whole sprite's ramp steps). */
export function remap(s: Sprite, table: (v: number) => number): Sprite {
  const d = new Uint8Array(s.d)
  for (let i = 0; i < d.length; i++) if (d[i]) d[i] = table(d[i])
  return { w: s.w, h: s.h, d }
}
