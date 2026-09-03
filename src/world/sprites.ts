import { art, blank, setPx, fillRect, paste, flipX, type Sprite } from '../core/sprite'
import { pal } from '../core/palette'
import { hash2, mulberry32, type Rng } from '../core/rng'
import { textSprite } from '../core/font'

/** Slot rectangle inside a sprite where ad content is pasted (1x px). */
export interface Slot {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------- vegetation

export function treeBroad(rng: Rng): Sprite {
  const w = 40, h = 56
  const s = blank(w, h)
  const cx = 20, cy = 19
  const rx = 17 + rng.int(-2, 2), ry = 16 + rng.int(-2, 3)
  const seed = rng.int(0, 0x7fffffff)
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry
      const r = dx * dx + dy * dy
      const n = (hash2(seed, x * 131 + y * 7) & 255) / 255
      if (r > 1 - n * 0.3) continue
      const light = -dx * 0.55 - dy * 0.75 + (n - 0.5) * 0.8
      const step = light > 0.7 ? 3 : light > 0.2 ? 2 : light > -0.4 ? 1 : 0
      setPx(s, x, y, pal('veg', step))
    }
  fillRect(s, 18, 33, 4, 23, pal('struct', 1))
  fillRect(s, 17, 52, 6, 4, pal('struct', 1))
  fillRect(s, 18, 33, 1, 23, pal('struct', 2))
  return s
}

export function treePine(rng: Rng): Sprite {
  const w = 24, h = 56
  const s = blank(w, h)
  const seed = rng.int(0, 0x7fffffff)
  const tiers = 5
  for (let t = 0; t < tiers; t++) {
    const top = 2 + t * 9
    const maxHalf = 4 + t * 2
    for (let y = 0; y < 12; y++) {
      const half = Math.round((y / 11) * maxHalf)
      for (let x = 12 - half; x <= 12 + half; x++) {
        const n = (hash2(seed, x * 57 + (top + y) * 3) & 255) / 255
        const light = (12 - x) / (half + 1) * 0.5 - y / 12 * 0.3 + (n - 0.5) * 0.5
        const step = light > 0.4 ? 3 : light > 0 ? 2 : light > -0.3 ? 1 : 0
        setPx(s, x, top + y, pal('veg', step))
      }
    }
  }
  fillRect(s, 11, 46, 3, 10, pal('struct', 1))
  return s
}

export function bush(rng: Rng): Sprite {
  const w = 16, h = 10
  const s = blank(w, h)
  const seed = rng.int(0, 0x7fffffff)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - 8) / 8, dy = (y - 6) / 6
      const n = (hash2(seed, x * 31 + y) & 255) / 255
      if (dx * dx + dy * dy > 1 - n * 0.3) continue
      setPx(s, x, y, pal('veg', y < 4 ? 2 : 1))
    }
  return s
}

export function paddy(rng: Rng): Sprite {
  // A low, wide strip of field rows (lies flat on the ground beside the road)
  const w = 96, h = 14
  const s = blank(w, h)
  const seed = rng.int(0, 0x7fffffff)
  for (let y = 0; y < h; y++) {
    const alt = (y >> 1) & 1
    for (let x = 0; x < w; x++) {
      const n = hash2(seed, x + y * 97) & 7
      if (y === h - 1 && n < 3) continue
      setPx(s, x, y, pal('veg', alt ? 1 : 2))
      if (n === 0 && alt) setPx(s, x, y, pal('veg', 3))
    }
  }
  return s
}

export function rock(rng: Rng): Sprite {
  const w = 14, h = 8
  const s = blank(w, h)
  const seed = rng.int(0, 0x7fffffff)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - 7) / 7, dy = (y - 5) / 5
      if (dx * dx + dy * dy > 1) continue
      const n = hash2(seed, x + y * 17) & 3
      setPx(s, x, y, pal('struct', y < 3 && n ? 3 : 2))
    }
  return s
}

// ----------------------------------------------------------------- street

const S = {
  a: pal('struct', 0), b: pal('struct', 1), c: pal('struct', 2), d: pal('struct', 3), e: pal('struct', 4),
  W: pal('lightWarm', 3), w: pal('lightWarm', 2), C: pal('lightCool', 2), c2: pal('lightCool', 1),
  K: pal('mono', 0), L: pal('mono', 2), X: pal('mono', 3),
}

/** Utility (telephone) pole, 10x64. */
export function utilityPole(): Sprite {
  const s = blank(10, 64)
  fillRect(s, 4, 0, 2, 64, S.c)
  fillRect(s, 4, 0, 1, 64, S.d)
  fillRect(s, 0, 6, 10, 1, S.b)
  fillRect(s, 1, 12, 8, 1, S.b)
  for (const x of [0, 3, 6, 9]) setPx(s, x, 5, S.d)
  for (const x of [1, 4, 5, 8]) setPx(s, x, 11, S.d)
  fillRect(s, 3, 60, 4, 4, S.b)
  return s
}

/** Street lamp facing right (toward the road when on the left side). 20x72. */
export function streetLamp(): Sprite {
  const s = blank(20, 72)
  fillRect(s, 2, 6, 2, 66, S.c)
  fillRect(s, 2, 6, 1, 66, S.d)
  fillRect(s, 0, 68, 6, 4, S.b)
  // arm
  fillRect(s, 3, 4, 10, 1, S.c)
  fillRect(s, 12, 3, 4, 1, S.c)
  fillRect(s, 15, 2, 3, 1, S.c)
  // head
  fillRect(s, 13, 0, 7, 2, S.d)
  fillRect(s, 14, 2, 5, 1, S.W)
  fillRect(s, 15, 3, 3, 1, S.w)
  return s
}

/** Road sign (blue board on a post), 16x40. Text varies. */
export function roadSign(rng: Rng): Sprite {
  const s = blank(16, 40)
  fillRect(s, 7, 14, 2, 26, S.c)
  fillRect(s, 0, 0, 16, 14, pal('carB', 1))
  fillRect(s, 0, 0, 16, 1, S.X)
  fillRect(s, 0, 13, 16, 1, S.X)
  fillRect(s, 0, 0, 1, 14, S.X)
  fillRect(s, 15, 0, 1, 14, S.X)
  const words = ['EXIT', 'SEOUL', 'NORTH', 'REST', 'IC 4', '2KM', 'TOLL']
  const t = textSprite(rng.pick(words), S.X)
  paste(s, t, Math.max(2, (16 - t.w) >> 1), 3)
  fillRect(s, 3, 9, 10, 2, S.X)
  return s
}

export function speedSign(rng: Rng): Sprite {
  const s = blank(12, 36)
  fillRect(s, 5, 12, 2, 24, S.c)
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const dx = x - 5.5, dy = y - 5.5
      const r = dx * dx + dy * dy
      if (r <= 36) setPx(s, x, y, r > 22 ? pal('tail', 1) : S.X)
    }
  const t = textSprite(rng.pick(['80', '60', '100']), S.K)
  paste(s, t, Math.max(1, (12 - t.w) >> 1), 4)
  return s
}

export function busStop(): Sprite {
  const s = blank(28, 40)
  fillRect(s, 0, 0, 28, 3, S.d)
  fillRect(s, 1, 3, 2, 37, S.c)
  fillRect(s, 25, 3, 2, 37, S.c)
  fillRect(s, 4, 6, 20, 16, S.a)
  fillRect(s, 5, 7, 18, 14, pal('lightCool', 1))
  fillRect(s, 5, 7, 18, 3, pal('lightCool', 0))
  fillRect(s, 4, 30, 20, 2, S.d)
  fillRect(s, 6, 32, 2, 8, S.c)
  fillRect(s, 20, 32, 2, 8, S.c)
  return s
}

export function guardrail(): Sprite {
  // one post + rail section; placed every segment for continuity
  const s = blank(12, 14)
  fillRect(s, 0, 2, 12, 3, S.d)
  fillRect(s, 0, 3, 12, 1, S.e)
  fillRect(s, 5, 5, 2, 9, S.c)
  return s
}

export function soundBarrier(): Sprite {
  const s = blank(24, 40)
  fillRect(s, 0, 0, 24, 40, S.b)
  fillRect(s, 0, 0, 24, 2, S.d)
  fillRect(s, 0, 0, 2, 40, S.c)
  fillRect(s, 22, 0, 2, 40, S.c)
  for (let y = 6; y < 40; y += 8) fillRect(s, 3, y, 18, 1, S.a)
  return s
}

// --------------------------------------------------------------- buildings

export function building(rng: Rng): Sprite {
  const w = rng.int(36, 80)
  const h = rng.int(56, 150)
  const s = blank(w, h)
  const shade = rng.int(1, 2)
  fillRect(s, 0, 0, w, h, pal('struct', shade))
  fillRect(s, 0, 0, w, 2, pal('struct', shade + 1))
  fillRect(s, w - 2, 0, 2, h, pal('struct', shade - 1))
  // roof detail
  if (rng.chance(0.5)) fillRect(s, rng.int(2, w - 8), -0, 6, 1, pal('struct', 3))
  // windows
  const wx = rng.pick([3, 4]), wy = rng.pick([4, 5])
  const litP = rng.range(0.25, 0.6)
  for (let y = 5; y < h - 14; y += wy + 2)
    for (let x = 3; x < w - 5; x += wx + 2) {
      const lit = rng.chance(litP)
      const v = lit ? pal('glass', rng.chance(0.3) ? 3 : 2) : pal('glass', rng.chance(0.5) ? 0 : 1)
      fillRect(s, x, y, wx, wy - 1, v)
    }
  // ground floor shop
  fillRect(s, 0, h - 12, w, 12, pal('struct', 0))
  fillRect(s, 2, h - 10, w - 4, 8, pal('lightWarm', 1))
  for (let x = 4; x < w - 4; x += 6) fillRect(s, x, h - 9, 3, 6, pal('lightWarm', 3))
  // awning / neon
  if (rng.chance(0.6)) {
    const neon = rng.chance(0.5) ? 'neonA' : 'neonB'
    const words = ['NOODLE', 'BAR', 'HOTEL', 'KARAOKE', 'CAFE', 'PC', '24H', 'SUSHI', 'PHARMA']
    const t = textSprite(rng.pick(words), pal(neon, 2))
    const bw = Math.min(w - 4, t.w + 4)
    const bx = rng.int(1, Math.max(1, w - bw - 1))
    const by = h - 22
    fillRect(s, bx, by, bw, 9, pal('struct', 0))
    fillRect(s, bx, by, bw, 1, pal(neon, 1))
    fillRect(s, bx, by + 8, bw, 1, pal(neon, 1))
    paste(s, t, bx + 2, by + 2)
  }
  return s
}

/** Small house for the countryside. */
export function house(rng: Rng): Sprite {
  const w = 40, h = 30
  const s = blank(w, h)
  fillRect(s, 2, 12, 36, 18, pal('struct', 3))
  for (let y = 0; y < 12; y++) fillRect(s, 20 - y * 1.7, y, y * 3.4 + 1, 1, pal('tail', 0))
  fillRect(s, 0, 12, 40, 1, pal('tail', 1))
  fillRect(s, 8, 18, 6, 6, rng.chance(0.7) ? pal('glass', 3) : pal('glass', 0))
  fillRect(s, 26, 18, 6, 6, rng.chance(0.7) ? pal('glass', 3) : pal('glass', 0))
  fillRect(s, 17, 20, 6, 10, pal('struct', 1))
  fillRect(s, 30, 2, 3, 8, pal('struct', 2))
  return s
}

// ---------------------------------------------------------------- ad hosts

export interface AdHost {
  sprite: Sprite
  slot: Slot
}

/** Roadside billboard. Slot 2:1. */
export function billboard(size: 'm' | 'l'): AdHost {
  const big = size === 'l'
  const w = big ? 96 : 64, h = big ? 84 : 60
  const bw = w - 4, bh = big ? 48 : 32
  const s = blank(w, h)
  fillRect(s, 2, 2, bw, bh, pal('adFrame', 1))
  fillRect(s, 2, 2, bw, 1, pal('adFrame', 2))
  fillRect(s, 2, 2, 1, bh, pal('adFrame', 2))
  const slot = { x: 4, y: 4, w: bw - 4, h: bh - 4 }
  fillRect(s, slot.x, slot.y, slot.w, slot.h, pal('adFrame', 0))
  // lamps on top
  for (let i = 0; i < (big ? 4 : 3); i++) {
    const lx = 6 + Math.round((i * (w - 12)) / (big ? 3 : 2))
    fillRect(s, lx, 0, 3, 2, pal('lightWarm', 3))
  }
  // legs
  const legY = 2 + bh
  const legH = h - legY
  fillRect(s, Math.round(w * 0.22), legY, 3, legH, pal('struct', 2))
  fillRect(s, Math.round(w * 0.72), legY, 3, legH, pal('struct', 2))
  fillRect(s, Math.round(w * 0.22), legY, 1, legH, pal('struct', 3))
  fillRect(s, Math.round(w * 0.72), legY, 1, legH, pal('struct', 3))
  return { sprite: s, slot }
}

/** Banner (현수막) strung between two poles. 3 wave frames. Slot 4:1. */
export function banner(): { frames: Sprite[]; slot: Slot } {
  const w = 52, h = 44
  const slot = { x: 6, y: 7, w: 40, h: 10 }
  const frames: Sprite[] = []
  for (let k = 0; k < 3; k++) {
    const s = blank(w, h)
    fillRect(s, 0, 0, 2, h, S.c)
    fillRect(s, w - 2, 0, 2, h, S.c)
    for (let x = 2; x < w - 2; x++) {
      const dy = Math.round(Math.sin((x / (w - 4)) * Math.PI * 2 + (k * Math.PI * 2) / 3) * 1.2)
      for (let y = 0; y < 14; y++) {
        const yy = 4 + y + dy
        const v = y === 0 || y === 13 ? pal('carC', 0) : pal('carC', 2)
        setPx(s, x, yy, v)
      }
    }
    // tie ropes
    setPx(s, 2, 3, S.d)
    setPx(s, w - 3, 3, S.d)
    frames.push(s)
  }
  return { frames, slot }
}

/** Overhead gantry with an ad panel spanning the road. Slot ~5:1. */
export function gantry(): AdHost {
  const w = 128, h = 56
  const s = blank(w, h)
  fillRect(s, 0, 8, 4, 48, S.c)
  fillRect(s, w - 4, 8, 4, 48, S.c)
  fillRect(s, 0, 8, 1, 48, S.d)
  fillRect(s, w - 4, 8, 1, 48, S.d)
  fillRect(s, 0, 6, w, 3, S.b)
  fillRect(s, 8, 0, 112, 26, pal('adFrame', 1))
  fillRect(s, 8, 0, 112, 1, pal('adFrame', 2))
  const slot = { x: 10, y: 2, w: 108, h: 22 }
  fillRect(s, slot.x, slot.y, slot.w, slot.h, pal('adFrame', 0))
  for (let x = 12; x < w - 12; x += 24) fillRect(s, x, 26, 3, 2, pal('lightWarm', 3))
  return { sprite: s, slot }
}

/** Wall panel used in overlay-ad sections. */
export function wallPanel(): Sprite {
  const s = blank(32, 64)
  fillRect(s, 0, 0, 32, 64, S.a)
  fillRect(s, 0, 0, 32, 2, pal('adFrame', 2))
  fillRect(s, 0, 0, 1, 64, pal('adFrame', 1))
  fillRect(s, 31, 0, 1, 64, pal('adFrame', 1))
  for (let y = 8; y < 64; y += 12) fillRect(s, 2, y, 28, 1, pal('adFrame', 1))
  return s
}

/** Neon shop sign on a post (city). */
export function neonSign(rng: Rng): Sprite {
  const neon = rng.chance(0.5) ? 'neonA' : 'neonB'
  const words = ['OPEN', 'BAR', 'NIGHT', 'DRIVE', 'MOTEL', 'GAS', 'CLUB']
  const t = textSprite(rng.pick(words), pal(neon, 2))
  const w = t.w + 6, h = 36
  const s = blank(w, h)
  fillRect(s, (w >> 1) - 1, 12, 2, 24, S.c)
  fillRect(s, 0, 0, w, 11, S.a)
  fillRect(s, 0, 0, w, 1, pal(neon, 1))
  fillRect(s, 0, 10, w, 1, pal(neon, 1))
  fillRect(s, 0, 0, 1, 11, pal(neon, 1))
  fillRect(s, w - 1, 0, 1, 11, pal(neon, 1))
  paste(s, t, 3, 3)
  return s
}

// ------------------------------------------------------------------ cars

const CAR_MAP = {
  B: pal('carA', 1), D: pal('carA', 0), H: pal('carA', 2),
  W: pal('glass', 0), w: pal('glass', 1),
  T: pal('tail', 1), t: pal('tail', 2),
  E: pal('lightCool', 2), e: pal('lightCool', 1),
  L: pal('mono', 2), K: pal('mono', 0), S: pal('struct', 3), G: pal('struct', 1),
}

export const SEDAN_REAR = art([
  '..........HHHHHHHH..........',
  '........HBBBBBBBBBBH........',
  '.......HBWWWWWWWWWWBH.......',
  '.......BBWwWWWWWWWWBB.......',
  '......BBBWWWWWWWWWWBBB......',
  '......BBBWWWWWWWWWWBBB......',
  '.....HBBBBBBBBBBBBBBBBH.....',
  '....HBBBBBBBBBBBBBBBBBBH....',
  '...HBBBBBBBBBBBBBBBBBBBBH...',
  '..BBttTBBBBBBBBBBBBBBBTttBB.',
  '..BBTTTBBBBBBLLLLBBBBBTTTBB.',
  '..BBTTTBBBBBBLLLLBBBBBTTTBB.',
  '..BDDDDDDDDDDDDDDDDDDDDDDDB.',
  '..SSSSSSSSSSSSSSSSSSSSSSSSS.',
  '..KKKK.GGGGGGGGGGGGGGGG.KKKK',
  '..KKKK..................KKKK',
], CAR_MAP)

export const SEDAN_FRONT = art([
  '..........HHHHHHHH..........',
  '........HBBBBBBBBBBH........',
  '.......HBWWWWWWWWWWBH.......',
  '.......BBWWWWWWWWWwBB.......',
  '......BBBWWWWWWWWWWBBB......',
  '......BBBWWWWWWWWWWBBB......',
  '.....HBBBBBBBBBBBBBBBBH.....',
  '....HBBBBBBBBBBBBBBBBBBH....',
  '...HBBBBBBBBBBBBBBBBBBBBH...',
  '..BBeEEBBBBBGGGGGGBBBBEEeBB.',
  '..BBEEEBBBBBGGGGGGBBBBEEEBB.',
  '..BBeEeBBBBBGGGGGGBBBBeEeBB.',
  '..BDDDDDDDDDLLLLDDDDDDDDDDB.',
  '..SSSSSSSSSSSSSSSSSSSSSSSSS.',
  '..KKKK.GGGGGGGGGGGGGGGG.KKKK',
  '..KKKK..................KKKK',
], CAR_MAP)

export const VAN_REAR = art([
  '.....HHHHHHHHHHHHHHHHHH.....',
  '....HBBBBBBBBBBBBBBBBBBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '...BBBBBBBBBBBBBBBBBBBBBB...',
  '...BtTBBBBBBBBBBBBBBBBTtB...',
  '...BTTBBBBBBBLLLLBBBBBBTTB..',
  '...BDDDDDDDDDDDDDDDDDDDDDB..',
  '...SSSSSSSSSSSSSSSSSSSSSSS..',
  '...KKKK.GGGGGGGGGGGGGG.KKKK.',
  '...KKKK................KKKK.',
], CAR_MAP)

export const VAN_FRONT = art([
  '.....HHHHHHHHHHHHHHHHHH.....',
  '....HBBBBBBBBBBBBBBBBBBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....HBWWWWWWWWWWWWWWWWBH....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '....BBBBBBBBBBBBBBBBBBBB....',
  '...BBBBBBBBBBBBBBBBBBBBBB...',
  '...BEEBBBBBGGGGGGGGBBBBEEB..',
  '...BEEBBBBBGGGGGGGGBBBBEEB..',
  '...BDDDDDDDDDLLLLDDDDDDDDB..',
  '...SSSSSSSSSSSSSSSSSSSSSSS..',
  '...KKKK.GGGGGGGGGGGGGG.KKKK.',
  '...KKKK................KKKK.',
], CAR_MAP)

/** Truck: box body with an ad slot on the back. */
export function truckRear(): AdHost {
  const w = 30, h = 28
  const s = blank(w, h)
  fillRect(s, 2, 0, 26, 20, pal('carA', 2))
  fillRect(s, 3, 1, 24, 18, pal('carA', 1))
  const slot = { x: 4, y: 2, w: 22, h: 16 }
  fillRect(s, slot.x, slot.y, slot.w, slot.h, pal('carC', 2))
  fillRect(s, 2, 20, 26, 2, pal('carA', 0))
  fillRect(s, 2, 22, 3, 2, pal('tail', 2))
  fillRect(s, 25, 22, 3, 2, pal('tail', 2))
  fillRect(s, 12, 22, 6, 2, pal('mono', 2))
  fillRect(s, 2, 24, 26, 1, pal('struct', 3))
  fillRect(s, 2, 25, 5, 3, pal('mono', 0))
  fillRect(s, 23, 25, 5, 3, pal('mono', 0))
  fillRect(s, 8, 25, 14, 2, pal('struct', 1))
  return { sprite: s, slot }
}

export function truckFront(): Sprite {
  const w = 30, h = 28
  const s = blank(w, h)
  fillRect(s, 2, 0, 26, 8, pal('carA', 2))
  fillRect(s, 3, 1, 24, 6, pal('carA', 1))
  fillRect(s, 4, 8, 22, 6, pal('glass', 0))
  fillRect(s, 2, 8, 2, 14, pal('carA', 1))
  fillRect(s, 26, 8, 2, 14, pal('carA', 1))
  fillRect(s, 4, 14, 22, 8, pal('carA', 1))
  fillRect(s, 6, 16, 18, 4, pal('struct', 1))
  fillRect(s, 3, 21, 4, 3, pal('lightCool', 2))
  fillRect(s, 23, 21, 4, 3, pal('lightCool', 2))
  fillRect(s, 2, 24, 26, 1, pal('struct', 3))
  fillRect(s, 2, 25, 5, 3, pal('mono', 0))
  fillRect(s, 23, 25, 5, 3, pal('mono', 0))
  fillRect(s, 8, 25, 14, 2, pal('struct', 1))
  return s
}

/** Recolor a car sprite from the carA ramp to another car ramp. */
export function paintCar(s: Sprite, ramp: 'carA' | 'carB' | 'carC' | 'carD'): Sprite {
  const d = new Uint8Array(s.d)
  for (let i = 0; i < d.length; i++)
    for (let k = 0; k < 3; k++) if (d[i] === pal('carA', k)) d[i] = pal(ramp, k)
  return { w: s.w, h: s.h, d }
}

export { flipX, mulberry32 }
