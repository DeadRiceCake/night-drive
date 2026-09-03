import { describe, expect, it } from 'vitest'
import { Framebuffer } from './framebuffer'
import { art } from './sprite'

describe('Framebuffer', () => {
  it('writes only integer pixels and clips at edges', () => {
    const fb = new Framebuffer(8, 4)
    fb.hline(-5, 20, 1, 7)
    expect(Array.from(fb.idx.slice(8, 16))).toEqual([7, 7, 7, 7, 7, 7, 7, 7])
    expect(fb.idx[0]).toBe(0)
    fb.px(100, 100, 3) // no throw, no write
    expect(fb.idx.every((v) => v === 0 || v === 7)).toBe(true)
  })

  it('dithers with the Bayer matrix (50% = checkerboard)', () => {
    const fb = new Framebuffer(4, 4)
    fb.fillRectDither(0, 0, 4, 4, 1, 2, 8)
    const ones = fb.idx.filter((v) => v === 1).length
    expect(ones).toBe(8)
    // no two horizontally adjacent pixels equal in row 0 for checker pattern
    expect(fb.get(0, 0)).not.toBe(fb.get(1, 0))
  })

  it('nearest-neighbour scaled blit keeps transparency and clipY', () => {
    const s = art(['ab', 'cd'], { a: 1, b: 2, c: 3, d: 4 })
    const fb = new Framebuffer(4, 4)
    fb.blitScaled(s, 0, 0, 4, 4, false, 3)
    expect(fb.get(0, 0)).toBe(1)
    expect(fb.get(3, 0)).toBe(2)
    expect(fb.get(0, 2)).toBe(3)
    expect(fb.get(3, 3)).toBe(0) // clipped row
  })

  it('flips sprites horizontally', () => {
    const s = art(['ab'], { a: 1, b: 2 })
    const fb = new Framebuffer(2, 1)
    fb.blit(s, 0, 0, true)
    expect(Array.from(fb.idx)).toEqual([2, 1])
  })
})
