import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { hash2, mulberry32 } from '../core/rng'
import { blank, setPx, type Sprite } from '../core/sprite'
import { K, type TimePreset } from '../tokens'

const STAR_FIELD_W = Math.round(1024 * K)

interface Star {
  x: number
  y: number // 0..1 of sky height
  step: number
  twinkle: number
}

let stars: Star[] | null = null
let galaxy: Sprite | null = null
let clouds: Sprite[] | null = null

function makeStars(seed: number): Star[] {
  const rng = mulberry32(seed ^ 0x5747)
  const out: Star[] = []
  for (let i = 0; i < Math.round(260 * K * K); i++) {
    const r = rng.next()
    out.push({
      x: rng.int(0, STAR_FIELD_W - 1),
      y: Math.pow(rng.next(), 1.4),
      step: r < 0.6 ? 1 : r < 0.9 ? 0 : 2,
      twinkle: rng.int(0, 255),
    })
  }
  return out
}

/** Procedural spiral galaxy, drawn with the galaxy ramp + dither. */
function makeGalaxy(seed: number): Sprite {
  const w = Math.round(150 * K), h = Math.round(76 * K)
  const s = blank(w, h)
  const cx = w / 2, cy = h / 2
  const ang = -0.45
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy
      // rotate into galaxy frame, squash to ellipse
      const u = (dx * ca + dy * sa) / (w * 0.42)
      const vv = (-dx * sa + dy * ca) / (h * 0.42)
      const r = Math.sqrt(u * u + vv * vv)
      if (r > 1.15) continue
      const theta = Math.atan2(vv, u)
      const arm = 0.5 + 0.5 * Math.cos(2 * theta - 6.5 * Math.log(r + 0.08))
      const core = Math.exp(-r * r * 9)
      const disk = Math.exp(-r * r * 2.2) * (0.35 + 0.65 * arm)
      const noise = (hash2(seed, x * 977 + y) & 255) / 255
      let b = core * 1.6 + disk * 0.9 + (noise - 0.5) * 0.18
      b *= 1 - Math.max(0, r - 0.85) / 0.3
      // Map brightness to ramp + dither
      const bay = bayer[y & 3][x & 3] / 16
      let v = 0
      if (b > 1.05) v = pal('galaxy', 3)
      else if (b > 0.75) v = bay < (b - 0.75) / 0.3 ? pal('galaxy', 3) : pal('galaxy', 2)
      else if (b > 0.5) v = bay < (b - 0.5) / 0.25 ? pal('galaxy', 2) : pal('galaxy', 1)
      else if (b > 0.3) v = bay < (b - 0.3) / 0.2 ? pal('galaxy', 1) : pal('galaxy', 0)
      else if (b > 0.17) v = bay < (b - 0.17) / 0.13 ? pal('galaxy', 0) : 0
      if (v) setPx(s, x, y, v)
    }
  }
  // Sprinkle bright stars in the disk
  const rng = mulberry32(seed ^ 0x6a1a)
  for (let i = 0; i < Math.round(40 * K); i++) {
    const x = rng.int(6, w - 7), y = rng.int(4, h - 5)
    if (s.d[y * w + x]) setPx(s, x, y, pal('star', 2))
  }
  return s
}

function makeClouds(seed: number): Sprite[] {
  const rng = mulberry32(seed ^ 0xc10d)
  const out: Sprite[] = []
  for (let i = 0; i < 5; i++) {
    const w = rng.int(Math.round(28 * K), Math.round(70 * K)), h = rng.int(Math.round(8 * K), Math.round(16 * K))
    const s = blank(w, h)
    const blobs = rng.int(3, 6)
    for (let b = 0; b < blobs; b++) {
      const bx = rng.int(4, w - 5), by = rng.int(h / 2, h - 2), br = rng.int(Math.round(4 * K), Math.max(Math.round(5 * K), h - 2))
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const dx = (x - bx) / (br * 1.8), dy = (y - by) / br
          if (dx * dx + dy * dy < 1) setPx(s, x, y, y < by - br * 0.35 ? pal('sky', 5) : pal('sky', 4))
        }
    }
    out.push(s)
  }
  return out
}

export function initSky(seed: number): void {
  stars = makeStars(seed)
  galaxy = makeGalaxy(seed)
  clouds = makeClouds(seed)
}

/**
 * Draws the sky gradient (dithered bands), stars, galaxy and clouds above
 * `horizon`. `offset` is the parallax scroll in pixels.
 */
export function renderSky(fb: Framebuffer, preset: TimePreset, horizon: number, offset: number, tick: number, detail = true): void {
  const fill = true
  const steps = 6
  if (fill) {
    for (let y = 0; y < horizon; y++) {
      const t = (y / horizon) * (steps - 1)
      const s = Math.floor(t)
      const frac = t - s
      const lvl = Math.round(frac * 4) * 4
      fb.hlineDither(0, fb.w - 1, y, pal('sky', s), pal('sky', s + 1), lvl)
    }
  }
  if (!stars) initSky(1)
  if (!detail) return
  if (preset !== 'day') {
    const px = Math.round(offset * 0.05)
    if (preset === 'night' && galaxy) {
      const gx = (((Math.round(fb.w * 0.52 - galaxy.w / 2) - px) % STAR_FIELD_W) + STAR_FIELD_W) % STAR_FIELD_W
      const gy = Math.round(horizon * 0.42 - galaxy.h / 2)
      // galaxy only within the star field horizontal wrap
      const drawAt = (x: number) => fb.blitScaled(galaxy!, x, gy, galaxy!.w, galaxy!.h, false, horizon)
      drawAt(gx)
      drawAt(gx - STAR_FIELD_W)
    }
    const dusk = preset === 'dusk'
    for (const st of stars!) {
      let sx = (st.x - px) % STAR_FIELD_W
      if (sx < 0) sx += STAR_FIELD_W
      if (sx >= fb.w) continue
      const sy = Math.round(st.y * (horizon - 2))
      if (dusk && st.y > 0.45) continue
      let step = st.step
      if (dusk) step = Math.max(0, step - 1)
      // twinkle: occasionally dim
      if (((tick + st.twinkle) >> 3) % 7 === 0) step = Math.max(0, step - 1)
      fb.px(sx, sy, pal('star', step))
      if (st.step === 2 && !dusk && ((tick + st.twinkle) >> 4) % 3 !== 0) {
        fb.px(sx - 1, sy, pal('star', 1))
        fb.px(sx + 1, sy, pal('star', 1))
        fb.px(sx, sy - 1, pal('star', 1))
        fb.px(sx, sy + 1, pal('star', 1))
      }
    }
  }
  if (preset !== 'night' && clouds) {
    const px = Math.round(offset * 0.08)
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i]
      const baseX = Math.round((i * 197 + 40) * K) % STAR_FIELD_W
      let cx = (baseX - px) % STAR_FIELD_W
      if (cx < 0) cx += STAR_FIELD_W
      const cy = Math.round(horizon * (0.18 + 0.12 * ((i * 37) % 5) / 5))
      fb.blitScaled(c, cx, cy, c.w, c.h, false, horizon)
      fb.blitScaled(c, cx - STAR_FIELD_W, cy, c.w, c.h, false, horizon)
    }
  }
}
