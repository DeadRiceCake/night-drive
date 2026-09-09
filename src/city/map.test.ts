import { describe, expect, it } from 'vitest'
import { DISTRICTS, coastX, districtAt, isWater, terrainHeight } from './map'

describe('map', () => {
  it('districts do not overlap', () => {
    for (let i = 0; i < DISTRICTS.length; i++) {
      for (let j = i + 1; j < DISTRICTS.length; j++) {
        const [ax0, az0, ax1, az1] = DISTRICTS[i].box
        const [bx0, bz0, bx1, bz1] = DISTRICTS[j].box
        const overlap = ax0 < bx1 && bx0 < ax1 && az0 < bz1 && bz0 < az1
        expect(overlap, `${DISTRICTS[i].id} overlaps ${DISTRICTS[j].id}`).toBe(false)
      }
    }
  })
  it('places the landmarks in the right districts', () => {
    expect(districtAt(-520, -80)).toBe('corpo') // Arasaka Tower
    expect(districtAt(-470, -830)).toBe('littlechina') // Megabuilding H10
    expect(districtAt(1180, -330)).toBe('japantown') // Megabuilding H8
    expect(districtAt(-950, 2080)).toBe('coastview') // stadium
    expect(districtAt(2220, 880)).toBe('arroyo') // power plant
    expect(districtAt(2200, -1720)).toBe('northoak') // Arasaka estate
    expect(districtAt(3200, 0)).toBe('badlands')
  })
  it('has ocean to the west and a bay to the north', () => {
    expect(isWater(-2000, 0)).toBe(true)
    expect(isWater(0, -3000)).toBe(true)
    expect(isWater(0, 0)).toBe(false)
    expect(coastX(0)).toBeLessThan(-1000)
  })
  it('is flat in the city and hilly in North Oak', () => {
    expect(terrainHeight(0, 0)).toBe(0)
    expect(terrainHeight(700, -1000)).toBe(0)
    expect(terrainHeight(2150, -1650)).toBeGreaterThan(60)
  })
})
