import { hash2, mulberry32 } from '../core/rng'
import { RoadBuilder, type Segment } from '../road/segments'
import { DRAW_DIST, LANE_OURS, REAR_DRAW_DIST, SEG_LEN, SPEED_CRUISE, type Biome } from '../tokens'
import { DENSITY, GENERATORS } from './biomes/index'
import { PropFactory } from './props'
import { Traffic } from './traffic'
import type { AdRegistry } from '../ads/registry'

export interface WorldConfig {
  seed: number
  biome: Biome | 'mixed'
  speedMul: number
}

/**
 * Infinite road: chunks are generated ahead deterministically from the seed,
 * pruned behind. Holds the player state and traffic.
 */
export class World {
  segments: Segment[] = []
  first = 0
  private next = 0
  private lastY = 0
  private chunkIndex = 0
  private mixedBiome: Biome = 'countryside'
  private mixedLeft = 0

  position = 0
  playerX = LANE_OURS[1]
  targetX = LANE_OURS[1]
  speed = SPEED_CRUISE
  bgOffset = 0
  tick = 0
  /** -1 left, 1 right, 0 none — turn signal. */
  signal = 0
  private laneCooldown = 0

  readonly props: PropFactory
  readonly traffic: Traffic

  constructor(
    public cfg: WorldConfig,
    ads: AdRegistry,
  ) {
    this.props = new PropFactory(cfg.seed, ads)
    this.traffic = new Traffic(mulberry32(cfg.seed ^ 0x7a11), ads)
    // Start with a calm straight so the first seconds look good.
    const b = new RoadBuilder(0, 0, this.biomeFor(0))
    b.straight(REAR_DRAW_DIST + 50)
    this.commit(b)
    // Start with road behind us so mirrors have something to show.
    this.position = (REAR_DRAW_DIST + 12) * SEG_LEN
    this.ensure()
  }

  get(index: number): Segment {
    const s = this.segments[index - this.first]
    if (!s) throw new Error(`segment ${index} not loaded (first=${this.first}, n=${this.segments.length})`)
    return s
  }

  get cars() {
    return this.traffic.cars
  }

  get baseIndex(): number {
    return Math.floor(this.position / SEG_LEN)
  }

  get base(): Segment {
    return this.get(this.baseIndex)
  }

  get biome(): Biome {
    return this.base.biome as Biome
  }

  private biomeFor(chunk: number): Biome {
    if (this.cfg.biome !== 'mixed') return this.cfg.biome
    if (this.mixedLeft <= 0) {
      const rng = mulberry32(hash2(this.cfg.seed, chunk * 31 + 7))
      const order: Biome[] = ['countryside', 'highway', 'city', 'highway']
      this.mixedBiome = chunk === 0 ? 'countryside' : order[(order.indexOf(this.mixedBiome) + 1) % order.length]
      this.mixedLeft = rng.int(2, 4)
    }
    this.mixedLeft--
    return this.mixedBiome
  }

  private commit(b: RoadBuilder): void {
    this.segments.push(...b.segments)
    this.next = b.nextIndex
    this.lastY = b.lastY
  }

  private ensure(): void {
    const need = this.baseIndex + DRAW_DIST + 60
    while (this.next < need) {
      const chunk = this.chunkIndex++
      const biome = this.biomeFor(chunk)
      const rng = mulberry32(hash2(this.cfg.seed, chunk))
      const b = new RoadBuilder(this.next, this.lastY, biome)
      GENERATORS[biome](b, { rng, props: this.props, allowWall: chunk % 2 === 1 })
      this.commit(b)
    }
    const keepFrom = this.baseIndex - REAR_DRAW_DIST - 8
    if (keepFrom > this.first) {
      this.segments.splice(0, keepFrom - this.first)
      this.first = keepFrom
    }
  }

  update(dt: number): void {
    this.tick++
    const cruise = SPEED_CRUISE * this.cfg.speedMul
    this.speed += (cruise - this.speed) * Math.min(1, dt * 1.5)
    const base = this.base
    const dz = this.speed * dt
    this.position += dz
    this.bgOffset += base.curve * (dz / SEG_LEN) * 1.6
    this.ensure()

    // --- traffic
    const density = DENSITY[this.biome]
    this.traffic.update(dt, this.position, cruise, density, DRAW_DIST)

    // --- auto lane choice: overtake slower cars, return to the right lane
    this.laneCooldown -= dt
    const right = LANE_OURS[1], left = LANE_OURS[0]
    if (this.laneCooldown <= 0) {
      const ahead = this.traffic.ahead(this.position, this.targetX, 14)
      if (ahead && ahead.speed < this.speed * 0.97) {
        const other = this.targetX === right ? left : right
        if (!this.traffic.laneBusy(this.position, other, 10, 12)) {
          this.targetX = other
          this.signal = other < this.targetX ? -1 : other === left ? -1 : 1
          this.laneCooldown = 4
        }
      } else if (this.targetX === left && !this.traffic.laneBusy(this.position, right, 6, 16)) {
        this.targetX = right
        this.signal = 1
        this.laneCooldown = 5
      }
    }
    const diff = this.targetX - this.playerX
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 0.35 * dt)
    this.playerX += step
    if (Math.abs(diff) < 0.01) {
      this.playerX = this.targetX
      this.signal = 0
    }
  }

  /** Debug: jump ahead by `n` segments, generating chunks as needed. */
  warp(n: number): void {
    while (n > 0) {
      const step = Math.min(n, 100)
      this.position += step * SEG_LEN
      n -= step
      this.ensure()
    }
    this.traffic.cars = []
  }

  /** Debug: jump to the next overlay wall section, if one exists within `maxSegs`. */
  warpToWall(maxSegs = 5000): boolean {
    for (let i = 0; i < maxSegs; i += 50) {
      this.warp(50)
      for (const s of this.segments) if (s.wall && s.index > this.baseIndex + 20) {
        this.position = (s.index + 2) * SEG_LEN
        this.ensure()
        return true
      }
    }
    return false
  }

  /** Visual steering angle: curve + lane change, in radians. */
  get steer(): number {
    const curve = this.base.curve
    const lane = (this.targetX - this.playerX) * 1.2
    return Math.max(-0.5, Math.min(0.5, -curve * 0.06 + lane))
  }

  /** Whether the overlay wall is active at the camera. */
  get onWall(): boolean {
    const b = this.baseIndex
    for (let i = 0; i < 6; i++) {
      const s = this.segments[b + i - this.first]
      if (!s || !s.wall) return false
    }
    return true
  }
}
