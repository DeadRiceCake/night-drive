import { mulberry32, type Rng } from '../core/rng'
import { flipX, type Sprite } from '../core/sprite'
import type { Prop } from '../road/segments'
import type { AdRegistry } from '../ads/registry'
import * as SP from './sprites'

/**
 * Builds Prop instances from a cached set of sprite variants. One factory per
 * world seed so variants are deterministic.
 */
export class PropFactory {
  readonly broad: Sprite[]
  readonly pine: Sprite[]
  readonly bushes: Sprite[]
  readonly rocks: Sprite[]
  readonly paddies: Sprite[]
  readonly pole: Sprite
  readonly lampR: Sprite
  readonly lampL: Sprite
  readonly busStop: Sprite
  readonly guardrail: Sprite
  readonly barrier: Sprite
  readonly wall: Sprite
  readonly bannerFrames: Sprite[]
  readonly bannerSlot: SP.Slot
  readonly portal: Sprite
  private adCounter = 0

  constructor(
    seed: number,
    private ads: AdRegistry,
  ) {
    const rng = mulberry32(seed ^ 0x9e3779b9)
    this.broad = Array.from({ length: 6 }, () => SP.treeBroad(rng))
    this.pine = Array.from({ length: 4 }, () => SP.treePine(rng))
    this.bushes = Array.from({ length: 3 }, () => SP.bush(rng))
    this.rocks = Array.from({ length: 3 }, () => SP.rock(rng))
    this.paddies = Array.from({ length: 2 }, () => SP.paddy(rng))
    this.pole = SP.utilityPole()
    this.lampR = SP.streetLamp()
    this.lampL = flipX(this.lampR)
    this.busStop = SP.busStop()
    this.guardrail = SP.guardrail()
    this.barrier = SP.soundBarrier()
    this.wall = SP.wallPanel()
    const b = SP.banner()
    this.bannerFrames = b.frames
    this.bannerSlot = b.slot
    this.portal = SP.tunnelPortal()
  }

  tunnelPortal(): Prop {
    return { sprite: this.portal, offset: 0, center: true, worldW: 17 }
  }

  tree(rng: Rng, side: -1 | 1, dist: number): Prop {
    const pine = rng.chance(0.35)
    const s = pine ? rng.pick(this.pine) : rng.pick(this.broad)
    const worldW = (pine ? 0.5 : 0.8) * rng.range(0.8, 1.3)
    return { sprite: s, offset: side * dist, worldW }
  }

  bush(rng: Rng, side: -1 | 1, dist: number): Prop {
    return { sprite: rng.pick(this.bushes), offset: side * dist, worldW: 0.3 * rng.range(0.8, 1.2) }
  }

  rock(rng: Rng, side: -1 | 1, dist: number): Prop {
    return { sprite: rng.pick(this.rocks), offset: side * dist, worldW: 0.25 * rng.range(0.8, 1.4) }
  }

  paddy(rng: Rng, side: -1 | 1, dist: number): Prop {
    return { sprite: rng.pick(this.paddies), offset: side * dist, worldW: 2.4 }
  }

  utilityPole(side: -1 | 1, dist = 1.25): Prop {
    return { sprite: this.pole, offset: side * dist, worldW: 0.12 }
  }

  lamp(side: -1 | 1, dist = 1.1): Prop {
    // The lamp arm points toward the road.
    return { sprite: side === -1 ? this.lampR : this.lampL, offset: side * dist, worldW: 0.25, lit: 'warm' }
  }

  sign(rng: Rng, side: -1 | 1, dist = 1.15): Prop {
    return { sprite: rng.chance(0.6) ? SP.roadSign(rng) : SP.speedSign(rng), offset: side * dist, worldW: 0.18 }
  }

  stop(side: -1 | 1, dist = 1.15): Prop {
    return { sprite: this.busStop, offset: side * dist, worldW: 0.35, lit: 'cool' }
  }

  rail(side: -1 | 1): Prop {
    return { sprite: this.guardrail, offset: side * 1.05, worldW: 0.14 }
  }

  soundBarrier(side: -1 | 1): Prop {
    return { sprite: this.barrier, offset: side * 1.3, worldW: 0.3 }
  }

  wallPanel(): Prop {
    return { sprite: this.wall, offset: 1.25, worldW: 0.4 }
  }

  building(rng: Rng, side: -1 | 1, dist: number): Prop {
    const s = SP.building(rng)
    return { sprite: s, offset: side * dist, worldW: (s.w / 40) * 0.7, lit: rng.chance(0.4) ? (rng.chance(0.5) ? 'neonA' : 'neonB') : undefined }
  }

  house(rng: Rng, side: -1 | 1, dist: number): Prop {
    return { sprite: SP.house(rng), offset: side * dist, worldW: 0.9 }
  }

  neon(rng: Rng, side: -1 | 1, dist = 1.15): Prop {
    const s = SP.neonSign(rng)
    return { sprite: s, offset: side * dist, worldW: s.w / 100, lit: 'neonA' }
  }

  billboard(rng: Rng, side: -1 | 1, size: 'm' | 'l', dist = 1.3): Prop {
    const host = SP.billboard(size)
    const id = `bb${this.adCounter++}`
    const ad = this.ads.stamp(host.sprite, host.slot, rng)
    return {
      sprite: host.sprite, offset: side * dist, worldW: size === 'l' ? 1.3 : 0.9, lit: 'warm',
      adId: ad ? id : undefined, adSlot: host.slot, adUrl: ad?.url,
    } as Prop
  }

  banner(rng: Rng, side: -1 | 1, dist = 1.15): Prop {
    const frames = this.bannerFrames.map((f) => ({ w: f.w, h: f.h, d: new Uint8Array(f.d) }))
    const id = `bn${this.adCounter++}`
    let ad = null
    for (const f of frames) ad = this.ads.stamp(f, this.bannerSlot, rng, id)
    return {
      sprite: frames[0], frames, frameHold: 9, offset: side * dist, worldW: 0.55,
      adId: ad ? id : undefined, adSlot: this.bannerSlot, adUrl: ad?.url,
    } as Prop
  }

  gantry(rng: Rng): Prop {
    const host = SP.gantry()
    const id = `gt${this.adCounter++}`
    const ad = this.ads.stamp(host.sprite, host.slot, rng)
    return {
      sprite: host.sprite, offset: 0, center: true, worldW: 2.9, lit: 'warm',
      adId: ad ? id : undefined, adSlot: host.slot, adUrl: ad?.url,
    } as Prop
  }
}
