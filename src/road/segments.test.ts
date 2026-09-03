import { describe, expect, it } from 'vitest'
import { RoadBuilder, CURVE, HILL } from './segments'

describe('RoadBuilder', () => {
  it('produces contiguous indices and continuous heights', () => {
    const b = new RoadBuilder(10, 0, 'test')
    b.straight(5).curve(20, CURVE.medium).hill(30, HILL.low).settle(10)
    const segs = b.segments
    expect(segs[0].index).toBe(10)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].index).toBe(segs[i - 1].index + 1)
      expect(segs[i].y0).toBe(segs[i - 1].y)
    }
    expect(b.nextIndex).toBe(10 + segs.length)
  })

  it('returns to y=0 after settle', () => {
    const b = new RoadBuilder(0, 0, 'test')
    b.hill(40, HILL.medium).road(10, 0, 0, 0, 8).settle(20)
    expect(Math.abs(b.lastY)).toBeLessThan(1e-6)
  })

  it('eases curve in and out', () => {
    const b = new RoadBuilder(0, 0, 'test')
    b.curve(40, CURVE.hard)
    const c = b.segments.map((s) => s.curve)
    expect(c[0]).toBeLessThan(CURVE.hard)
    expect(Math.max(...c)).toBe(CURVE.hard)
    expect(c[c.length - 1]).toBe(0)
  })
})
