/** Seeded PRNG (mulberry32) plus hashing helpers. Deterministic across runs. */
export type Rng = {
  next(): number // [0,1)
  int(min: number, max: number): number // inclusive
  pick<T>(arr: readonly T[]): T
  chance(p: number): boolean
  range(min: number, max: number): number
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    range: (min, max) => min + next() * (max - min),
  }
}

/** 32-bit integer hash of two ints (for chunk seeds, noise). */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Value noise in [0,1) for integer x, seeded. */
export function noise1(seed: number, x: number): number {
  return hash2(seed, x | 0) / 4294967296
}

/** Smooth 1D noise, x real. */
export function smoothNoise(seed: number, x: number): number {
  const xi = Math.floor(x)
  const t = x - xi
  const a = noise1(seed, xi)
  const b = noise1(seed, xi + 1)
  const s = t * t * (3 - 2 * t)
  return a + (b - a) * s
}
