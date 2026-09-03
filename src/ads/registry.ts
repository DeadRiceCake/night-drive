import type { Rng } from '../core/rng'
import { pal, type RampName } from '../core/palette'
import { fillRect, paste, scaleSprite, type Sprite } from '../core/sprite'
import { textSprite } from '../core/font'
import { pixelize } from './pixelize'
import type { Slot } from '../world/sprites'

export interface AdRecord {
  id: string
  url: string
  kind: 'image' | 'text'
  src?: string
  text?: string
  /** Background / foreground ramps for text ads. */
  bg?: RampName
  fg?: RampName
  weight?: number
}

interface Manifest {
  ads: AdRecord[]
}

/**
 * Self-serve ad pool. Loads a manifest, pixelizes images to slot sizes, and
 * stamps content into host sprites. Stamps requested before loading finishes
 * are applied when the content arrives.
 */
export class AdRegistry {
  ads: AdRecord[] = []
  private images = new Map<string, ImageData>()
  private cache = new Map<string, Sprite>()
  private pending: (() => void)[] = []
  enabled = true
  ready = false

  async load(url: string): Promise<void> {
    try {
      const res = await fetch(url)
      const m = (await res.json()) as Manifest
      this.ads = m.ads.filter((a) => a && a.id && a.url)
      await Promise.all(
        this.ads.filter((a) => a.kind === 'image' && a.src).map(async (a) => {
          try {
            const img = await loadImage(a.src!)
            this.images.set(a.id, imageData(img))
          } catch {
            /* skip broken image */
          }
        }),
      )
    } catch {
      this.ads = []
    }
    this.ready = true
    const p = this.pending
    this.pending = []
    for (const fn of p) fn()
  }

  pick(rng: Rng): AdRecord | null {
    if (!this.enabled || !this.ads.length) return null
    const total = this.ads.reduce((s, a) => s + (a.weight ?? 1), 0)
    let r = rng.next() * total
    for (const a of this.ads) {
      r -= a.weight ?? 1
      if (r <= 0) return a
    }
    return this.ads[this.ads.length - 1]
  }

  /** Content sprite for an ad at a slot size (cached). */
  content(ad: AdRecord, w: number, h: number): Sprite | null {
    const key = `${ad.id}:${w}x${h}`
    const c = this.cache.get(key)
    if (c) return c
    let s: Sprite | null = null
    if (ad.kind === 'image') {
      const img = this.images.get(ad.id)
      if (img) s = pixelize(img, w, h)
    } else if (ad.kind === 'text' && ad.text) {
      s = textAd(ad.text, w, h, ad.bg ?? 'carC', ad.fg ?? 'mono')
    }
    if (s) this.cache.set(key, s)
    return s
  }

  /**
   * Pick an ad and paste it into `host` at `slot`. Returns the ad chosen (or
   * null if ads are disabled / none available). If the registry is not loaded
   * yet, the paste is deferred and the choice is made now for determinism.
   */
  stamp(host: Sprite, slot: Slot, rng: Rng, _tag?: string): AdRecord | null {
    if (!this.enabled) return null
    const seedRoll = rng.next()
    const apply = (): AdRecord | null => {
      if (!this.ads.length) return null
      const total = this.ads.reduce((s, a) => s + (a.weight ?? 1), 0)
      let r = seedRoll * total
      let ad = this.ads[this.ads.length - 1]
      for (const a of this.ads) {
        r -= a.weight ?? 1
        if (r <= 0) { ad = a; break }
      }
      const c = this.content(ad, slot.w, slot.h)
      if (c) paste(host, c, slot.x, slot.y)
      return ad
    }
    if (this.ready) return apply()
    this.pending.push(() => void apply())
    // Return a provisional record so the prop knows it hosts an ad.
    return { id: 'pending', url: '', kind: 'text' }
  }

  /** Resolve the URL for a stamped host after loading (by re-rolling). */
}

function textAd(text: string, w: number, h: number, bg: RampName, fg: RampName): Sprite {
  const s = { w, h, d: new Uint8Array(w * h) }
  fillRect(s, 0, 0, w, h, pal(bg, 2))
  fillRect(s, 0, 0, w, 1, pal(bg, 1))
  fillRect(s, 0, h - 1, w, 1, pal(bg, 1))
  const lines = text.toUpperCase().split('\n').slice(0, 3)
  const glyph = lines.map((l) => textSprite(l, pal(fg, fg === 'mono' ? 0 : 2)))
  const maxW = Math.max(...glyph.map((g) => g.w))
  const scale = Math.max(1, Math.min(Math.floor((w - 4) / maxW), Math.floor((h - 2) / (glyph.length * 6))))
  const totalH = glyph.length * 6 * scale - scale
  let y = Math.max(1, (h - totalH) >> 1)
  for (const g of glyph) {
    const gs = scaleSprite(g, g.w * scale, g.h * scale)
    paste(s, gs, (w - gs.w) >> 1, y)
    y += 6 * scale
  }
  return s
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function imageData(img: HTMLImageElement): ImageData {
  const w = Math.min(img.naturalWidth, 512), h = Math.min(img.naturalHeight, 512)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}
