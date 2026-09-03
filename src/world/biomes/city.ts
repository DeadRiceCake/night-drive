import { CURVE, type RoadBuilder } from '../../road/segments'
import type { ChunkCtx } from './index'

export function city(b: RoadBuilder, ctx: ChunkCtx): void {
  const { rng, props } = ctx
  const start = b.nextIndex
  const sections = rng.int(4, 6)
  let wallStart = -1, wallEnd = -1
  for (let i = 0; i < sections; i++) {
    const r = rng.next()
    const sign = rng.chance(0.5) ? 1 : -1
    if (r < 0.5) b.straight(rng.int(30, 60))
    else if (r < 0.9) b.curve(rng.int(30, 60), sign * rng.pick([CURVE.easy, CURVE.easy, CURVE.medium]))
    else b.curve(rng.int(30, 50), sign * CURVE.easy, rng.chance(0.5) ? 10 : -10)
  }
  if (ctx.allowWall && rng.chance(0.6)) {
    // Long straight so the fixed overlay slot stays on screen ~12s.
    wallStart = b.nextIndex + 8
    b.straight(440)
    wallEnd = b.nextIndex - 8
  }
  b.settle(20)
  const end = b.nextIndex

  let nextBuildL = start + rng.int(0, 4)
  let nextBuildR = start + rng.int(0, 4)
  let nextBillboard = start + rng.int(40, 90)
  let nextGantry = start + rng.int(60, 160)
  let nextNeon = start + rng.int(10, 30)
  let nextStop = start + rng.int(40, 120)

  for (const seg of b.segments) {
    const i = seg.index
    const inWall = i >= wallStart && i < wallEnd
    seg.wall = inWall

    // Street lamps alternate sides
    if (i % 9 === 0) seg.props.push(props.lamp(-1))
    if (i % 9 === 4 && !inWall) seg.props.push(props.lamp(1))

    // Buildings form a continuous street front on both sides
    if (i >= nextBuildL) {
      seg.props.push(props.building(rng, -1, rng.range(1.5, 2.1)))
      nextBuildL = i + rng.int(5, 9)
    }
    if (i >= nextBuildR && !inWall) {
      seg.props.push(props.building(rng, 1, rng.range(1.5, 2.1)))
      nextBuildR = i + rng.int(5, 9)
    }
    if (inWall && (i - wallStart) % 3 === 0) seg.props.push(props.wallPanel())

    if (i === nextNeon && !inWall) {
      seg.props.push(props.neon(rng, rng.chance(0.5) ? 1 : -1))
      nextNeon = i + rng.int(14, 40)
    }
    if (i === nextBillboard && !inWall) {
      seg.props.push(props.billboard(rng, rng.chance(0.5) ? 1 : -1, 'l', 1.35))
      nextBillboard = i + rng.int(70, 150)
    }
    if (i === nextGantry && !inWall) {
      seg.props.push(props.gantry(rng))
      nextGantry = i + rng.int(120, 260)
    }
    if (i === nextStop && !inWall) {
      seg.props.push(props.stop(1))
      nextStop = i + rng.int(120, 260)
    }
    if (i >= end) break
  }
}
