import { CURVE, HILL, type RoadBuilder } from '../../road/segments'
import type { ChunkCtx } from './index'

export function countryside(b: RoadBuilder, ctx: ChunkCtx): void {
  const { rng, props } = ctx
  const start = b.nextIndex
  const sections = rng.int(4, 7)
  for (let i = 0; i < sections; i++) {
    const r = rng.next()
    const sign = rng.chance(0.5) ? 1 : -1
    if (r < 0.3) b.straight(rng.int(20, 50))
    else if (r < 0.6) b.curve(rng.int(30, 80), sign * rng.pick([CURVE.easy, CURVE.medium]))
    else if (r < 0.85) b.hill(rng.int(40, 90), rng.pick([HILL.low, HILL.medium]))
    else b.curve(rng.int(40, 80), sign * CURVE.easy, rng.pick([HILL.low, -HILL.low]))
  }
  b.settle(24)

  const end = b.nextIndex
  let nextBanner = start + rng.int(30, 90)
  let nextBillboard = start + rng.int(60, 140)
  let nextSign = start + rng.int(20, 60)
  let nextHouse = start + rng.int(30, 80)
  let nextStop = start + rng.int(100, 260)
  let paddySide: -1 | 1 = rng.chance(0.5) ? -1 : 1
  let paddyUntil = start + rng.int(20, 60)

  for (const seg of b.segments) {
    const i = seg.index
    if (i % 14 === 0) seg.props.push(props.utilityPole(1, 1.22))
    if (i % 14 === 7 && rng.chance(0.3)) seg.props.push(props.utilityPole(-1, 1.22))

    // Rice paddies: long flat strips on one side for a stretch
    if (i > paddyUntil) {
      paddySide = rng.chance(0.5) ? -1 : 1
      paddyUntil = i + rng.int(30, 90)
      if (rng.chance(0.4)) paddyUntil = i + rng.int(10, 20) // gap
    }
    const inPaddy = paddyUntil - i > 25 || (paddyUntil - i > 0 && (paddyUntil - i) % 2 === 0)
    if (inPaddy && i % 3 === 0) seg.props.push(props.paddy(rng, paddySide, 1.35 + (i % 6 === 0 ? 2.3 : 0)))

    // Trees: denser on the non-paddy side
    const treeP = 0.22
    for (const side of [-1, 1] as const) {
      const p = side === paddySide && inPaddy ? 0.04 : treeP
      if (rng.chance(p)) seg.props.push(props.tree(rng, side, rng.range(1.5, 4.5)))
      if (rng.chance(0.08)) seg.props.push(props.bush(rng, side, rng.range(1.1, 1.6)))
      if (rng.chance(0.03)) seg.props.push(props.rock(rng, side, rng.range(1.1, 1.5)))
    }

    if (i === nextSign) {
      seg.props.push(props.sign(rng, 1))
      nextSign = i + rng.int(40, 90)
    }
    if (i === nextBanner) {
      seg.props.push(props.banner(rng, rng.chance(0.7) ? 1 : -1))
      nextBanner = i + rng.int(60, 140)
    }
    if (i === nextBillboard) {
      seg.props.push(props.billboard(rng, rng.chance(0.65) ? 1 : -1, rng.chance(0.3) ? 'l' : 'm', 1.4))
      nextBillboard = i + rng.int(100, 220)
    }
    if (i === nextHouse) {
      seg.props.push(props.house(rng, rng.chance(0.5) ? 1 : -1, rng.range(2.2, 4)))
      nextHouse = i + rng.int(40, 120)
    }
    if (i === nextStop) {
      seg.props.push(props.stop(1))
      nextStop = i + rng.int(200, 400)
    }
    if (i >= end) break
  }
}
