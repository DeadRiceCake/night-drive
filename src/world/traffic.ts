import type { Sprite } from '../core/sprite'
import type { Rng } from '../core/rng'
import { LANE_ONCOMING, LANE_OURS, SEG_LEN, SPEED_CRUISE, TRAFFIC_SPEED_MAX, TRAFFIC_SPEED_MIN } from '../tokens'
import { SEDAN_FRONT, SEDAN_REAR, VAN_FRONT, VAN_REAR, truckFront, truckRear, paintCar } from './sprites'
import type { AdRegistry } from '../ads/registry'

export type CarKind = 'sedan' | 'van' | 'truck'
type CarRamp = 'carA' | 'carB' | 'carC' | 'carD'

export interface Car {
  z: number
  offset: number
  /** Lane the car is moving toward (same as offset when not changing). */
  targetOffset: number
  speed: number
  /** Preferred cruising speed. */
  cruise: number
  dirZ: 1 | -1
  kind: CarKind
  worldW: number
  rear: Sprite
  front: Sprite
  brake: boolean
}

export interface PlayerRef {
  z: number
  x: number
  speed: number
}

export function carSprite(car: Car, towardCamera: boolean): Sprite {
  return towardCamera ? car.front : car.rear
}

const RAMPS: CarRamp[] = ['carA', 'carB', 'carC', 'carD']
const LANE_TOL = 0.3

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
    const kindR = rng.next()
    const kind: CarKind = kindR < 0.65 ? 'sedan' : kindR < 0.88 ? 'van' : 'truck'
    const worldW = kind === 'sedan' ? 0.3 : kind === 'van' ? 0.32 : 0.38
    const ci = rng.int(0, RAMPS.length - 1)
    const set = this.sprites![kind][ci]
    const rear = kind === 'truck' && this.truckAds[ci] ? this.truckAds[ci] : set.rear
    const ratio = cruise / SPEED_CRUISE
    let car: Car
    if (r < 0.45) {
      // oncoming
      const lane = rng.pick(LANE_ONCOMING) + rng.range(-0.04, 0.04)
      const speed = rng.range(cruise * 0.8, cruise * 1.1)
      car = { z: position + (drawDist - 4) * SEG_LEN, offset: lane, targetOffset: lane, speed, cruise: speed, dirZ: -1, kind, worldW, rear, front: set.front, brake: false }
    } else if (r < 0.85) {
      // slower car ahead in our direction
      const lane = rng.pick(LANE_OURS) + rng.range(-0.03, 0.03)
      const speed = rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX) * ratio
      car = { z: position + drawDist * 0.85 * SEG_LEN, offset: lane, targetOffset: lane, speed, cruise: speed, dirZ: 1, kind, worldW, rear, front: set.front, brake: false }
    } else {
      // faster car overtaking from behind, in the left lane
      const lane = LANE_OURS[0] + rng.range(-0.02, 0.02)
      const speed = cruise * rng.range(1.15, 1.35)
      const k: CarKind = kind === 'truck' ? 'sedan' : kind
      const s2 = this.sprites![k][ci]
      car = { z: position - 24 * SEG_LEN, offset: lane, targetOffset: lane, speed, cruise: speed, dirZ: 1, kind: k, worldW: k === 'sedan' ? 0.3 : worldW, rear: s2.rear, front: s2.front, brake: false }
    }
    // avoid spawning on top of another car in the same lane
    for (const o of this.cars) {
      if (Math.abs(o.offset - car.offset) < LANE_TOL && Math.abs(o.z - car.z) < 6 * SEG_LEN) return
    }
    this.cars.push(car)
  }

  update(dt: number, position: number, cruise: number, density: number, drawDist: number, player: PlayerRef): void {
    const target = Math.round(density * 14)
    if (this.cars.length < target && this.rng.chance(0.035)) this.spawn(position, drawDist, cruise)

    for (const c of this.cars) {
      c.brake = false
      if (c.dirZ === 1) {
        // Obstacle ahead in my lane: the nearest slower car, or the player.
        let obstacleZ = Infinity, obstacleSpeed = 0
        for (const o of this.cars) {
          if (o === c || o.dirZ !== 1) continue
          if (Math.abs(o.offset - c.offset) > LANE_TOL && Math.abs(o.targetOffset - c.offset) > LANE_TOL) continue
          const gap = o.z - c.z
          if (gap > 0 && gap < obstacleZ - c.z) { obstacleZ = o.z; obstacleSpeed = o.speed }
        }
        if (Math.abs(player.x - c.offset) < LANE_TOL || Math.abs(player.x - c.targetOffset) < LANE_TOL) {
          const gap = player.z - c.z
          if (gap > 0 && gap < obstacleZ - c.z) { obstacleZ = player.z; obstacleSpeed = player.speed }
        }
        const gapSegs = (obstacleZ - c.z) / SEG_LEN
        if (gapSegs < 6 && obstacleSpeed < c.speed) {
          // Try the other lane first, otherwise brake to follow.
          const other = c.offset < 0.5 ? LANE_OURS[1] : LANE_OURS[0]
          if (c.targetOffset === c.offset && !this.laneBusy(c.z, other, 5, 8, player, c)) {
            c.targetOffset = other + this.rng.range(-0.03, 0.03)
          } else {
            c.speed = Math.max(obstacleSpeed * (gapSegs < 3 ? 0.9 : 1), c.speed - 5000 * dt)
            c.brake = true
          }
        } else if (c.speed < c.cruise) {
          c.speed = Math.min(c.cruise, c.speed + 1500 * dt)
        }
        // lane change motion
        const d = c.targetOffset - c.offset
        if (d !== 0) {
          const step = Math.sign(d) * Math.min(Math.abs(d), 0.3 * dt)
          c.offset += step
          if (Math.abs(c.targetOffset - c.offset) < 0.005) c.offset = c.targetOffset
        }
      }
      c.z += c.dirZ * c.speed * dt
    }
    const minZ = position - 30 * SEG_LEN
    const maxZ = position + (drawDist + 20) * SEG_LEN
    this.cars = this.cars.filter((c) => c.z > minZ && c.z < maxZ)
  }

  /** Nearest same-direction car ahead of `z` within `lane` (±tolerance). */
  ahead(z: number, lane: number, maxSegs: number): Car | null {
    let best: Car | null = null
    for (const c of this.cars) {
      if (c.dirZ !== 1) continue
      if (Math.abs(c.offset - lane) > LANE_TOL && Math.abs(c.targetOffset - lane) > LANE_TOL) continue
      const gap = c.z - z
      if (gap > 0 && gap < maxSegs * SEG_LEN && (!best || c.z < best.z)) best = c
    }
    return best
  }

  /**
   * True if a same-direction car (or the player) occupies `lane` between
   * `behindSegs` behind and `aheadSegs` ahead of z.
   */
  laneBusy(z: number, lane: number, behindSegs: number, aheadSegs: number, player?: PlayerRef, exclude?: Car): boolean {
    for (const c of this.cars) {
      if (c === exclude || c.dirZ !== 1) continue
      if (Math.abs(c.offset - lane) > LANE_TOL && Math.abs(c.targetOffset - lane) > LANE_TOL) continue
      const gap = c.z - z
      if (gap > -behindSegs * SEG_LEN && gap < aheadSegs * SEG_LEN) return true
    }
    if (player && Math.abs(player.x - lane) < LANE_TOL) {
      const gap = player.z - z
      if (gap > -behindSegs * SEG_LEN && gap < aheadSegs * SEG_LEN) return true
    }
    return false
  }
}
