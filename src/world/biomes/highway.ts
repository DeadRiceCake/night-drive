import { CURVE, HILL, type RoadBuilder } from '../../road/segments'
import type { ChunkCtx } from './index'

export function highway(b: RoadBuilder, ctx: ChunkCtx): void {
  const { rng, props } = ctx
  const start = b.nextIndex
  const sections = rng.int(3, 5)
  let tunnelFrom = -1, tunnelTo = -1
  let bridgeFrom = -1, bridgeTo = -1
  for (let i = 0; i < sections; i++) {
    const r = rng.next()
    const sign = rng.chance(0.5) ? 1 : -1
    if (r < 0.35) b.straight(rng.int(40, 90))
    else if (r < 0.75) b.curve(rng.int(60, 120), sign * CURVE.easy)
    else b.hill(rng.int(80, 140), HILL.low)
  }
  const special = rng.next()
  if (special < 0.3) {
    b.straight(12)
    tunnelFrom = b.nextIndex
    b.straight(rng.int(70, 130))
    tunnelTo = b.nextIndex
    b.straight(12)
    b.mark(tunnelFrom, tunnelTo, 'tunnel')
  } else if (special < 0.6) {
    bridgeFrom = b.nextIndex
    b.curve(rng.int(60, 110), (rng.chance(0.5) ? 1 : -1) * CURVE.easy)
    bridgeTo = b.nextIndex
    b.mark(bridgeFrom, bridgeTo, 'bridge')
  }
  b.settle(30)
  const end = b.nextIndex

  let barrierUntil = start + rng.int(30, 80)
  let barrierSide: -1 | 1 = 1
  let nextBillboard = start + rng.int(40, 100)
  let nextGantry = start + rng.int(80, 200)
  let nextSign = start + rng.int(20, 60)

  for (const seg of b.segments) {
    const i = seg.index
    if (i === tunnelFrom || i === tunnelTo) seg.props.push(props.tunnelPortal())
    if (seg.kind === 'tunnel') continue
    if (seg.kind === 'bridge') {
      seg.props.push(props.rail(-1))
      seg.props.push(props.rail(1))
      if (i % 12 === 0) seg.props.push(props.lamp(1))
      continue
    }
    if (i % 10 === 0) {
      seg.props.push(props.lamp(-1))
      seg.props.push(props.lamp(1))
    }
    seg.props.push(props.rail(-1))
    if (i > barrierUntil) {
      barrierSide = rng.chance(0.5) ? -1 : 1
      barrierUntil = i + rng.int(20, 70)
      if (rng.chance(0.5)) barrierUntil = i + rng.int(5, 15)
    }
    const inBarrier = barrierUntil - i > 15
    if (inBarrier) seg.props.push(props.soundBarrier(barrierSide))
    else {
      seg.props.push(props.rail(1))
      if (rng.chance(0.12)) seg.props.push(props.tree(rng, rng.chance(0.5) ? -1 : 1, rng.range(1.8, 4)))
    }
    if (i === nextSign) {
      seg.props.push(props.sign(rng, 1))
      nextSign = i + rng.int(50, 120)
    }
    if (i === nextBillboard) {
      seg.props.push(props.billboard(rng, rng.chance(0.6) ? 1 : -1, 'l', 1.6))
      nextBillboard = i + rng.int(80, 180)
    }
    if (i === nextGantry) {
      seg.props.push(props.gantry(rng))
      nextGantry = i + rng.int(150, 300)
    }
    if (i >= end) break
  }
}
