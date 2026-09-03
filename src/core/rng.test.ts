import { describe, expect, it } from 'vitest'
import { hash2, mulberry32 } from './rng'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })
  it('int is inclusive of both ends', () => {
    const r = mulberry32(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(r.int(0, 3))
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })
  it('hash2 differs for nearby inputs', () => {
    expect(hash2(1, 2)).not.toBe(hash2(2, 1))
    expect(hash2(0, 0)).not.toBe(hash2(0, 1))
  })
})
