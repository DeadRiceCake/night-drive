import { describe, expect, it } from 'vitest'
import { buildLUT, pal, P, PALETTE_SIZE, RAMPS, SHIFT_UP, SHIFT_DOWN } from './palette'

describe('palette', () => {
  it('assigns contiguous non-overlapping ramps starting at 1', () => {
    let expected = 1
    for (const k of Object.keys(RAMPS) as (keyof typeof RAMPS)[]) {
      expect(P[k]).toBe(expected)
      expected += RAMPS[k]
    }
    expect(PALETTE_SIZE).toBe(expected)
    expect(PALETTE_SIZE).toBeLessThanOrEqual(256)
  })

  it('clamps steps inside a ramp', () => {
    expect(pal('sky', -3)).toBe(P.sky)
    expect(pal('sky', 99)).toBe(P.sky + RAMPS.sky - 1)
  })

  it('shift tables stay inside their ramp', () => {
    for (const k of Object.keys(RAMPS) as (keyof typeof RAMPS)[]) {
      for (let s = 0; s < RAMPS[k]; s++) {
        const i = P[k] + s
        expect(SHIFT_UP[i]).toBeGreaterThanOrEqual(P[k])
        expect(SHIFT_UP[i]).toBeLessThan(P[k] + RAMPS[k])
        expect(SHIFT_DOWN[i]).toBeGreaterThanOrEqual(P[k])
      }
    }
  })

  it('every preset defines every ramp with the right size', () => {
    for (const p of ['day', 'dusk', 'night'] as const) {
      const lut = buildLUT(p)
      expect(lut.length).toBe(PALETTE_SIZE)
      expect(lut[0]).toBe(0)
      for (let i = 1; i < PALETTE_SIZE; i++) expect(lut[i] >>> 24).toBe(255)
    }
  })
})
