import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { drawText } from '../core/font'
import { DASH_TOP, MIRROR_REAR, SAFE, W } from '../tokens'

/** Network ad configuration. Leave client empty to show the placeholder. */
export const ADSENSE = {
  client: '', // e.g. 'ca-pub-0000000000000000'
  slot: '', // e.g. '1234567890'
  width: 300,
  height: 250,
}

/**
 * DOM overlay for network ads (AdSense etc.). The ad iframe is never drawn
 * into the canvas; instead the canvas draws a pixel billboard frame around a
 * fixed screen rectangle where the DOM element sits.
 */
export class AdOverlay {
  private el: HTMLDivElement
  private inner: HTMLDivElement
  /** 0..16 dither visibility. */
  private vis = 0
  private target = 0
  rect = { x: 0, y: 0, w: 0, h: 0 }
  private scale = 1
  private available = false
  private loaded = false
  enabled = true

  constructor(stage: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ad-overlay'
    this.el.hidden = true
    this.inner = document.createElement('div')
    this.inner.className = 'ad-overlay-inner'
    this.el.appendChild(this.inner)
    stage.appendChild(this.el)
    this.inner.textContent = ''
  }

  /** Recompute the fixed slot for the current integer scale. */
  layout(scale: number): void {
    this.scale = scale
    const w1 = Math.ceil(ADSENSE.width / scale) + 6
    const h1 = Math.ceil(ADSENSE.height / scale) + 6
    // Sits below the rear-view mirror, right of centre, above the dash.
    const top = MIRROR_REAR.y + MIRROR_REAR.h + 8
    const maxW = W - SAFE.left - SAFE.right - 40
    const maxH = DASH_TOP - top - 12
    this.available = w1 <= maxW && h1 <= maxH
    this.rect = { x: W - SAFE.right - w1 - 6, y: top, w: w1, h: h1 }
    this.el.style.width = `${ADSENSE.width}px`
    this.el.style.height = `${ADSENSE.height}px`
    this.el.style.left = `${(this.rect.x + 3) * scale}px`
    this.el.style.top = `${(this.rect.y + 3) * scale}px`
  }

  private ensureAd(): void {
    if (this.loaded) return
    this.loaded = true
    if (!ADSENSE.client) {
      this.inner.classList.add('placeholder')
      this.inner.textContent = 'AD SLOT ' + ADSENSE.width + 'x' + ADSENSE.height
      return
    }
    const ins = document.createElement('ins')
    ins.className = 'adsbygoogle'
    ins.style.display = 'inline-block'
    ins.style.width = `${ADSENSE.width}px`
    ins.style.height = `${ADSENSE.height}px`
    ins.setAttribute('data-ad-client', ADSENSE.client)
    ins.setAttribute('data-ad-slot', ADSENSE.slot)
    this.inner.appendChild(ins)
    const s = document.createElement('script')
    s.async = true
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}`
    s.crossOrigin = 'anonymous'
    document.head.appendChild(s)
    s.onload = () => {
      try {
        ;((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({})
      } catch {
        /* ignore */
      }
    }
  }

  /** Called every tick with whether the camera is inside a wall section. */
  update(active: boolean): void {
    this.target = active && this.available && this.enabled ? 16 : 0
    if (this.vis < this.target) this.vis++
    else if (this.vis > this.target) this.vis--
    const show = this.vis >= 16
    if (show) this.ensureAd()
    this.el.hidden = !show
  }

  /** Draw the billboard frame around the fixed rect. */
  draw(fb: Framebuffer, tick: number): void {
    if (this.vis <= 0) return
    const { x, y, w, h } = this.rect
    const lvl = this.vis
    const frame = pal('adFrame', 1), edge = pal('adFrame', 2), dark = pal('ui', 0)
    // legs down to the dash
    for (let yy = y + h; yy < DASH_TOP; yy++) {
      fb.hlineDither(x + 6, x + 9, yy, fb.get(x + 6, yy), pal('struct', 2), lvl)
      fb.hlineDither(x + w - 10, x + w - 7, yy, fb.get(x + w - 10, yy), pal('struct', 2), lvl)
    }
    for (let yy = y - 2; yy < y + h + 2; yy++) {
      const inner = yy >= y + 1 && yy < y + h - 1
      fb.hlineDither(x - 2, x + w + 1, yy, fb.get(x - 2, yy), yy === y - 2 || yy === y + h + 1 ? edge : frame, lvl)
      if (inner && lvl >= 16) fb.hline(x + 1, x + w - 2, yy, dark)
    }
    if (lvl >= 16) {
      fb.vline(x - 2, y - 2, y + h + 1, edge)
      fb.vline(x + w + 1, y - 2, y + h + 1, edge)
      // lamps
      for (let i = 0; i < 4; i++) {
        const lx = x + 4 + Math.round((i * (w - 10)) / 3)
        fb.fillRect(lx, y - 5, 3, 2, pal('lightWarm', 3))
        fb.vline(lx + 1, y - 3, y - 3, pal('struct', 3))
      }
      if (!ADSENSE.client) {
        const blink = Math.floor(tick / 30) % 2 === 0
        drawText(fb, x + 4, y + 4, blink ? 'AD SLOT' : 'ADSENSE', pal('ui', 3))
      }
    }
    void this.scale
  }
}
