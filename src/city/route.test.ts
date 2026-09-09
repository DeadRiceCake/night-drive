import { describe, expect, it } from 'vitest'
import { Route, RouteIndex, SAMPLE_STEP, WAYPOINTS } from './route'
import { DISTRICTS, districtAt, isWater } from './map'

const route = new Route()

describe('route', () => {
  it('is a closed loop of roughly 20 km sampled every 2 m', () => {
    expect(route.length).toBeGreaterThan(15000)
    expect(route.length).toBeLessThan(30000)
    expect(route.count).toBe(Math.floor(route.length / SAMPLE_STEP))
    const a = route.at(0), b = route.at(route.length - 1)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(10)
  })
  it('never runs through water', () => {
    const wet = route.samples.filter((s) => isWater(s.x, s.z)).map((s) => `${Math.round(s.x)},${Math.round(s.z)}`)
    expect(wet.slice(0, 5)).toEqual([])
  })
  it('visits every district', () => {
    const seen = new Set(route.samples.map((s) => s.district))
    for (const d of DISTRICTS) expect(seen.has(d.id)).toBe(true)
  })
  it('findDistrict lands inside the district', () => {
    for (const d of DISTRICTS) {
      const s = route.at(route.findDistrict(d.id))
      expect(districtAt(s.x, s.z)).toBe(d.id)
    }
  })
  it('elevation is smooth and highways sit high', () => {
    let maxStep = 0
    for (let i = 1; i < route.count; i++) maxStep = Math.max(maxStep, Math.abs(route.samples[i].y - route.samples[i - 1].y))
    expect(maxStep).toBeLessThan(0.4)
    const hw = route.samples.filter((s) => s.kind === 'highway')
    expect(hw.length).toBeGreaterThan(100)
    expect(Math.max(...hw.map((s) => s.y))).toBeGreaterThan(8)
  })
  it('pos offsets to the right of travel', () => {
    const c = route.pos(1000, 0, { set: (x: number, y: number, z: number) => [x, y, z] } as never) as unknown as number[]
    const r = route.pos(1000, 5, { set: (x: number, y: number, z: number) => [x, y, z] } as never) as unknown as number[]
    const t = route.at(1000)
    // right = (-tz, tx): dot of (r - c) with right must be +5
    const dx = r[0] - c[0], dz = r[2] - c[2]
    expect(dx * -t.tz + dz * t.tx).toBeCloseTo(5, 0)
  })
  it('spatial index finds nearby samples', () => {
    const idx = new RouteIndex(route)
    const w = WAYPOINTS[5]
    const n = idx.nearest(w.x, w.z, 40)
    expect(n.d).toBeLessThan(40)
    expect(idx.nearest(9000, 9000, 40).d).toBe(Infinity)
  })
})
