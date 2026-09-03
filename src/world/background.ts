import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { mulberry32, smoothNoise } from '../core/rng'
import { blank, setPx, fillRect, type Sprite } from '../core/sprite'
import { K, type Biome } from '../tokens'

export interface BgLayers {
  /** Furthest (lightest) layer. */
  far: Sprite
  /** Nearer layer. */
  near: Sprite
  /** Parallax speeds (px per unit of curve offset). */
  farSpeed: number
  nearSpeed: number
}

const LW = Math.round(512 * K)

function mountains(seed: number, h: number, base: number, amp: number, ramp: number, freq: number): Sprite {
  h = Math.round(h * K)
  base = Math.round(base * K)
  amp *= K
  const s = blank(LW, h)
  for (let x = 0; x < LW; x++) {
    // periodic noise so the layer wraps seamlessly
    const u = (x / LW) * freq
    const n =
      smoothNoise(seed, u) * 0.6 +
      smoothNoise(seed + 1, u * 2.3) * 0.25 +
      smoothNoise(seed + 2, u * 5.1) * 0.15
    // blend toward wrap
    const uw = ((x + LW / 2) / LW) * freq
    const n2 =
      smoothNoise(seed, uw) * 0.6 +
      smoothNoise(seed + 1, uw * 2.3) * 0.25 +
      smoothNoise(seed + 2, uw * 5.1) * 0.15
    const t = x / LW
    const blend = t < 0.5 ? 1 : 1 - (t - 0.5) * 2
    const nn = n * blend + n2 * (1 - blend)
    const top = Math.round(h - base - nn * amp)
    for (let y = Math.max(0, top); y < h; y++) {
      // slightly darker lower slopes via dither on the far ramp
      const v = y - top < 2 ? ramp + 1 : ramp
      setPx(s, x, y, v)
    }
  }
  return s
}

function skyline(seed: number, h: number, lit: boolean): Sprite {
  h = Math.round(h * K)
  const rng = mulberry32(seed ^ 0x51c7)
  const s = blank(LW, h)
  let x = 0
  while (x < LW) {
    const w = rng.int(Math.round(6 * K), Math.round(22 * K))
    const bh = rng.int(Math.round(8 * K), h - 4)
    const top = h - bh
    const shade = rng.chance(0.5) ? 0 : 1
    fillRect(s, x, top, w, bh, pal('far', shade))
    // antenna / roof detail
    if (rng.chance(0.3)) setPx(s, x + (w >> 1), top - 1, pal('far', shade))
    if (rng.chance(0.15)) {
      setPx(s, x + (w >> 1), top - 2, pal('far', shade))
      setPx(s, x + (w >> 1), top - 3, pal('tail', 1))
    }
    // windows
    for (let wy = top + 2; wy < h - 1; wy += 3)
      for (let wx = x + 1; wx < x + w - 1; wx += 3) {
        if (lit) {
          if (rng.chance(0.42)) setPx(s, wx, wy, rng.chance(0.3) ? pal('glass', 3) : pal('glass', 2))
        } else if (rng.chance(0.5)) setPx(s, wx, wy, pal('glass', 1))
      }
    x += w + rng.int(0, 2)
  }
  return s
}

const cache = new Map<string, BgLayers>()

export function getBackground(biome: Biome, seed: number, lit: boolean): BgLayers {
  const key = `${biome}:${seed}:${lit ? 1 : 0}`
  let bg = cache.get(key)
  if (bg) return bg
  if (biome === 'city') {
    bg = {
      far: mountains(seed + 10, 34, 4, 22, pal('far', 2), 3),
      near: skyline(seed, 30, lit),
      farSpeed: 0.25,
      nearSpeed: 0.55,
    }
  } else if (biome === 'highway') {
    bg = {
      far: mountains(seed + 10, 40, 4, 30, pal('far', 2), 3),
      near: mountains(seed + 20, 26, 2, 14, pal('far', 0), 6),
      farSpeed: 0.25,
      nearSpeed: 0.5,
    }
  } else {
    bg = {
      far: mountains(seed + 10, 44, 6, 32, pal('far', 2), 3),
      near: mountains(seed + 20, 24, 3, 18, pal('far', 0), 5),
      farSpeed: 0.25,
      nearSpeed: 0.55,
    }
  }
  cache.set(key, bg)
  return bg
}

function drawWrapped(fb: Framebuffer, s: Sprite, x: number, y: number, clipY: number): void {
  let sx = x % LW
  if (sx > 0) sx -= LW
  for (; sx < fb.w; sx += LW) fb.blitScaled(s, sx, y, s.w, s.h, false, clipY)
}

/** Draw parallax layers so their bottom edge sits on `horizon`. */
export function renderBackground(fb: Framebuffer, bg: BgLayers, horizon: number, offset: number): void {
  drawWrapped(fb, bg.far, -Math.round(offset * bg.farSpeed), horizon - bg.far.h, horizon)
  drawWrapped(fb, bg.near, -Math.round(offset * bg.nearSpeed), horizon - bg.near.h, horizon)
}
