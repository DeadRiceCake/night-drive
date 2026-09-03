import type { Sprite } from '../core/sprite'
import type { Rng } from '../core/rng'
import { LANE_ONCOMING, LANE_OURS, SEG_LEN, TRAFFIC_SPEED_MAX, TRAFFIC_SPEED_MIN } from '../tokens'
import { SEDAN_FRONT, SEDAN_REAR, VAN_FRONT, VAN_REAR, truckFront, truckRear, paintCar } from './sprites'
import type { AdRegistry } from '../ads/registry'

export type CarKind = 'sedan' | 'van' | 'truck'
type CarRamp = 'carA' | 'carB' | 'carC' | 'carD'

export interface Car {
  z: number
  offset: number
  speed: number
  dirZ: 1 | -1
  kind: CarKind
  worldW: number
  rear: Sprite
  front: Sprite
  brake: boolean
}

export function carSprite(car: Car, towardCamera: boolean): Sprite {
  return towardCamera ? car.front : car.rear
}

const RAMPS: CarRamp[] = ['carA', 'carB', 'carC', 'carD']

export class Traffic {
  cars: Car[] = []
  private sprites: Record<CarKind, { rear: Sprite; front: Sprite }[]> | null = null
  private truckAds: Sprite[] = []

  constructor(
    private rng: Rng,
    private ads: AdRegistry,
  ) {}

  private build(): void {
    const tr = truckRear()
    const tf = truckFront()
    this.sprites = {
      sedan: RAMPS.map((r) => ({ rear: paintCar(SEDAN_REAR, r), front: paintCar(SEDAN_FRONT, r) })),
      van: RAMPS.map((r) => ({ rear: paintCar(VAN_REAR, r), front: paintCar(VAN_FRONT, r) })),
      truck: RAMPS.map((r) => ({ rear: paintCar(tr.sprite, r), front: paintCar(tf, r) })),
    }
    // Trucks carry ads on the back: stamp a few variants.
    for (const v of this.sprites.truck) {
      const s = { w: v.rear.w, h: v.rear.h, d: new Uint8Array(v.rear.d) }
      this.ads.stamp(s, tr.slot, this.rng)
      this.truckAds.push(s)
    }
  }

  private spawn(position: number, drawDist: number, cruise: number): void {
    if (!this.sprites) this.build()
    const rng = this.rng
    const r = rng.next()
    let car: Car
    const kindR = rng.next()
    const kind: CarKind = kindR < 0.65 ? 'sedan' : kindR < 0.88 ? 'van' : 'truck'
    const worldW = kind === 'sedan' ? 0.3 : kind === 'van' ? 0.32 : 0.38
    const ci = rng.int(0, RAMPS.length - 1)
    const set = this.sprites![kind][ci]
    const rear = kind === 'truck' && this.truckAds[ci] ? this.truckAds[ci] : set.rear
    if (r < 0.45) {
      // oncoming
      car = {
        z: position + (drawDist - 4) * SEG_LEN, offset: rng.pick(LANE_ONCOMING) + rng.range(-0.04, 0.04),
        speed: rng.range(cruise * 0.8, cruise * 1.1), dirZ: -1, kind, worldW, rear, front: set.front, brake: false,
      }
    } else if (r < 0.85) {
      // slower car ahead in our direction
      car = {
        z: position + drawDist * 0.85 * SEG_LEN, offset: rng.pick(LANE_OURS) + rng.range(-0.03, 0.03),
        speed: rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX) * (cruise / 7200), dirZ: 1, kind, worldW, rear, front: set.front, brake: false,
      }
    } else {
      // faster car overtaking from behind, in the left lane
      car = {
        z: position - 24 * SEG_LEN, offset: LANE_OURS[0] + rng.range(-0.02, 0.02),
        speed: cruise * rng.range(1.15, 1.35), dirZ: 1, kind: kind === 'truck' ? 'sedan' : kind,
        worldW: kind === 'truck' ? 0.3 : worldW, rear: kind === 'truck' ? this.sprites!.sedan[ci].rear : rear,
        front: kind === 'truck' ? this.sprites!.sedan[ci].front : set.front, brake: false,
      }
    }
    // avoid spawning on top of another car in the same lane
    for (const o of this.cars) {
      if (Math.abs(o.offset - car.offset) < 0.25 && Math.abs(o.z - car.z) < 5 * SEG_LEN) return
    }
    this.cars.push(car)
  }

  update(dt: number, position: number, cruise: number, density: number, drawDist: number): void {
    const target = Math.round(density * 14)
    if (this.cars.length < target && this.rng.chance(0.035)) this.spawn(position, drawDist, cruise)

    for (const c of this.cars) {
      c.brake = false
      if (c.dirZ === 1) {
        // follow the car ahead in the same lane
        for (const o of this.cars) {
          if (o === c || o.dirZ !== 1) continue
          if (Math.abs(o.offset - c.offset) > 0.25) continue
          const gap = o.z - c.z
          if (gap > 0 && gap < 3 * SEG_LEN && o.speed < c.speed) {
            c.speed = Math.max(o.speed, c.speed - 6000 * dt)
            c.brake = true
          }
        }
      }
      c.z += c.dirZ * c.speed * dt
    }
    const minZ = position - 30 * SEG_LEN
    const maxZ = position + (drawDist + 20) * SEG_LEN
    this.cars = this.cars.filter((c) => c.z > minZ && c.z < maxZ)
  }

  /** Nearest same-direction car ahead of `z` within `lane` (±0.25). */
  ahead(z: number, lane: number, maxSegs: number): Car | null {
    let best: Car | null = null
    for (const c of this.cars) {
      if (c.dirZ !== 1 || Math.abs(c.offset - lane) > 0.25) continue
      const gap = c.z - z
      if (gap > 0 && gap < maxSegs * SEG_LEN && (!best || c.z < best.z)) best = c
    }
    return best
  }

  /** True if a same-direction car is within ±segs of z in `lane`. */
  laneBusy(z: number, lane: number, behindSegs: number, aheadSegs: number): boolean {
    for (const c of this.cars) {
      if (c.dirZ !== 1 || Math.abs(c.offset - lane) > 0.25) continue
      const gap = c.z - z
      if (gap > -behindSegs * SEG_LEN && gap < aheadSegs * SEG_LEN) return true
    }
    return false
  }
}
