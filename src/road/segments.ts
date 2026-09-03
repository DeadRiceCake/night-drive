import type { Sprite } from '../core/sprite'
import { SEG_LEN } from '../tokens'

/** A roadside object attached to a segment. */
export interface Prop {
  sprite: Sprite
  /** Position in road half-widths. Negative = left side. The edge of the
   *  sprite nearest the road sits at this offset. */
  offset: number
  /** Width in road half-widths. */
  worldW: number
  /** If true, the sprite is centred on `offset` instead of edge-aligned. */
  center?: boolean
  /** Optional light source (drawn as a glow at night). */
  lit?: 'warm' | 'cool' | 'neonA' | 'neonB'
  /** Animation frames; if present `sprite` is ignored. */
  frames?: Sprite[]
  frameHold?: number
  /** Ad surface id, if this prop hosts one. */
  adId?: string
  /** Click-through URL of the stamped ad. */
  adUrl?: string
  /** Screen rect of the ad slot, updated each frame when drawn. */
  adRect?: { x: number; y: number; w: number; h: number; scale: number }
  /** Slot rect within the sprite (1x pixels). */
  adSlot?: { x: number; y: number; w: number; h: number }
}

export interface Point {
  worldZ: number
  worldY: number
  camX: number
  camY: number
  camZ: number
  scale: number
  x: number
  y: number
  w: number
}

export type SegmentKind = 'road' | 'bridge' | 'tunnel'

export interface Segment {
  index: number
  curve: number
  /** World y at the far end of this segment. */
  y: number
  /** World y at the near end (== previous segment's y). */
  y0: number
  kind: SegmentKind
  /** Which biome generated this segment. */
  biome: string
  props: Prop[]
  /** Overlay ad wall present on the right side of this segment. */
  wall: boolean
  /** Tunnel segments draw a ceiling strip unless this is the exit segment. */
  ceiling: boolean
  p1: Point
  p2: Point
  clip: number
  /** Distance in segments from camera, set during render. */
  n: number
}

export function makePoint(): Point {
  return { worldZ: 0, worldY: 0, camX: 0, camY: 0, camZ: 0, scale: 0, x: 0, y: 0, w: 0 }
}

export function makeSegment(index: number, curve: number, y0: number, y: number, biome: string): Segment {
  return {
    index, curve, y, y0, kind: 'road', biome, props: [], wall: false, ceiling: false,
    p1: makePoint(), p2: makePoint(), clip: 0, n: 0,
  }
}

const easeIn = (a: number, b: number, p: number) => a + (b - a) * Math.pow(p, 2)
const easeOut = (a: number, b: number, p: number) => a + (b - a) * (1 - Math.pow(1 - p, 2))
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5)

/** Curve / hill presets (curve is per-segment screen-space dx). */
export const CURVE = { none: 0, easy: 2, medium: 4, hard: 6 }
export const HILL = { none: 0, low: 20, medium: 40, high: 60 }

/**
 * Builds a run of segments with eased curves and hills, in the style of
 * classic pseudo-3D racers. Hills are expressed in units of SEG_LEN.
 */
export class RoadBuilder {
  readonly segments: Segment[] = []
  private y: number
  constructor(
    private index: number,
    startY: number,
    readonly biome: string,
  ) {
    this.y = startY
  }

  get lastY(): number {
    return this.y
  }
  get nextIndex(): number {
    return this.index
  }
  get length(): number {
    return this.segments.length
  }

  private add(curve: number, y: number): Segment {
    const s = makeSegment(this.index++, curve, this.y, y, this.biome)
    this.y = y
    this.segments.push(s)
    return s
  }

  /** Add enter/hold/leave sections with curve and a target height. */
  road(enter: number, hold: number, leave: number, curve: number, yDelta = 0): this {
    const startY = this.y
    const endY = startY + yDelta * SEG_LEN
    const total = enter + hold + leave
    const startCurve = this.segments.length ? this.segments[this.segments.length - 1].curve : 0
    // (n + 1) so the last segment of each phase lands exactly on its target.
    for (let n = 0; n < enter; n++) this.add(easeIn(startCurve, curve, (n + 1) / enter), easeInOut(startY, endY, (n + 1) / total))
    for (let n = 0; n < hold; n++) this.add(curve, easeInOut(startY, endY, (enter + n + 1) / total))
    for (let n = 0; n < leave; n++) this.add(easeInOut(curve, 0, (n + 1) / leave), easeInOut(startY, endY, (enter + hold + n + 1) / total))
    return this
  }

  straight(n: number): this {
    return this.road(0, n, 0, 0, 0)
  }

  curve(n: number, c: number, y = 0): this {
    const e = Math.max(2, Math.floor(n / 4))
    return this.road(e, n - 2 * e, e, c, y)
  }

  /** A hill that goes up and back down over `n` segments. */
  hill(n: number, height: number): this {
    const half = Math.floor(n / 2)
    this.road(half, 0, 0, 0, height)
    this.road(0, 0, n - half, 0, -height)
    return this
  }

  /** Return to y=0 smoothly (so chunks stay bounded). */
  settle(n: number): this {
    if (Math.abs(this.y) < 1) return this.straight(n)
    return this.road(0, 0, n, 0, -this.y / SEG_LEN)
  }

  /** Mark a range of already-built segments (by index) as a tunnel or bridge. */
  mark(from: number, to: number, kind: SegmentKind): void {
    for (const s of this.segments) {
      if (s.index >= from && s.index < to) {
        s.kind = kind
        s.ceiling = kind === 'tunnel' && s.index < to - 1
      }
    }
  }

  /** Easing helpers exposed for generators. */
  static easeIn = easeIn
  static easeOut = easeOut
  static easeInOut = easeInOut
}
