/**
 * Self-serve ads: manifest -> atlas slots -> billboard instances along the
 * route. Clicking a billboard opens its URL (raycast against instance planes).
 */
import { Raycaster, Vector2, Vector3, type Camera, type InstancedMesh } from 'three'
import type { Rng } from '../core/rng'
import type { Route, RouteIndex } from './route'
import { paintAdSlot, type Atlas, type SignInstance, type SignSet } from './signs'
import { ROAD_HALF, HIGHWAY_HALF } from '../tokens'

export interface AdRecord {
  id: string
  url: string
  kind: 'image' | 'text'
  src?: string
  text?: string
  bg?: string
  fg?: string
  weight?: number
}

interface Manifest {
  ads: AdRecord[]
}

const COLORS: Record<string, string> = {
  lightWarm: '#ffb840', tail: '#ff2a2a', carB: '#3ab0ff', carC: '#3cff9a', veg: '#2a8a3a', struct: '#40404a', neonA: '#ff2a6d', neonB: '#37ebf3', mono: '#f4f6ff',
  yellow: '#fcee0a', cyan: '#37ebf3', magenta: '#ff2a6d', red: '#ff003c', black: '#0a0a10', white: '#f4f6ff',
}

export class Ads {
  enabled = true
  private records: AdRecord[] = []
  private billboards: { index: number; url: string }[] = []
  private ray = new Raycaster()

  constructor(private atlas: Atlas, private signs: SignSet) {}

  async load(url: string): Promise<void> {
    try {
      const res = await fetch(url)
      const man = (await res.json()) as Manifest
      this.records = man.ads.filter((a) => a.url)
    } catch {
      this.records = []
    }
    // paint each record into a reserved slot
    const slots = this.atlas.adSlots
    for (let i = 0; i < Math.min(slots.length, this.records.length); i++) {
      const rec = this.records[i]
      const slot = slots[i]
      if (rec.kind === 'image' && rec.src) {
        try {
          const img = await loadImage(rec.src)
          paintAdSlot(this.atlas, slot, (ctx, w, h) => {
            ctx.fillStyle = '#0c0c14'
            ctx.fillRect(0, 0, w, h)
            const s = Math.min((w * 0.86) / img.width, (h * 0.86) / img.height)
            const dw = img.width * s, dh = img.height * s
            ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
            ctx.strokeStyle = 'rgba(55,235,243,0.7)'
            ctx.lineWidth = 6
            ctx.strokeRect(6, 6, w - 12, h - 12)
          })
          continue
        } catch {
          /* fall through to text */
        }
      }
      paintAdSlot(this.atlas, slot, (ctx, w, h) => {
        ctx.fillStyle = COLORS[rec.bg ?? ''] ?? '#101018'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = COLORS[rec.fg ?? ''] ?? '#fcee0a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const lines = (rec.text ?? rec.id).split('\n')
        let size = Math.min(h / (lines.length + 0.5), 110)
        ctx.font = `bold ${size}px Rajdhani, Impact, sans-serif`
        const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width))
        if (maxW > w * 0.9) { size *= (w * 0.9) / maxW; ctx.font = `bold ${size}px Rajdhani, Impact, sans-serif` }
        ctx.shadowColor = ctx.fillStyle as string
        ctx.shadowBlur = 24
        lines.forEach((l, li) => ctx.fillText(l, w / 2, h / 2 + (li - (lines.length - 1) / 2) * size * 1.05))
      })
    }
  }

  /** Places billboards along the route (before the sign set is built). */
  place(route: Route, index: RouteIndex, rng: Rng, first: number): void {
    void index
    const slots = this.atlas.adSlots
    const n = Math.min(slots.length, Math.max(1, this.records.length || slots.length))
    // every ~600 m, a big roadside billboard on the right, facing the driver
    let k = 0
    for (let s = 220; s < route.length; s += rng.range(420, 720)) {
      const smp = route.at(s)
      if (smp.kind === 'hill' || smp.kind === 'badlands') continue
      const half = smp.kind === 'highway' ? HIGHWAY_HALF : ROAD_HALF
      const side = rng.chance(0.7) ? 1 : -1
      const off = half + rng.range(6, 12)
      const p = route.pos(s, side * off, new Vector3())
      const ang = Math.atan2(smp.tx, smp.tz)
      // face back toward the driver (plane faces +z when rot=0)
      const rot = ang + Math.PI + (side > 0 ? 0.35 : -0.35)
      const w = smp.kind === 'highway' ? 18 : 12, h = w / 2
      const slot = slots[k % n]
      const rec = this.records[k % n]
      const inst: SignInstance = { x: p.x, y: p.y + h / 2 + (smp.kind === 'highway' ? 6 : 7), z: p.z, rot, w, h, tile: slot, intensity: 1.6, url: rec?.url }
      this.signs.add(inst)
      this.billboards.push({ index: first + this.signs.items.length - 1, url: rec?.url ?? '' })
      k++
    }
  }

  /** Returns the URL of the billboard under the pointer, if any. */
  hit(ndc: Vector2, camera: Camera): string | null {
    if (!this.enabled || !this.signs.mesh) return null
    const mesh: InstancedMesh = this.signs.mesh
    this.ray.setFromCamera(ndc, camera)
    const hits = this.ray.intersectObject(mesh, false)
    for (const h of hits) {
      const id = h.instanceId
      if (id === undefined) continue
      const b = this.billboards.find((bb) => bb.index === id)
      if (b && b.url) return b.url
    }
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

/** Screen-fixed DOM slot for network ads (AdSense): shown while passing the ad wall. */
export class AdOverlay {
  private el: HTMLDivElement
  private inner: HTMLDivElement
  private shown = false
  enabled = true
  client = ''
  slot = ''
  constructor(root: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ad-overlay'
    this.el.hidden = true
    this.inner = document.createElement('div')
    this.inner.className = 'ad-overlay-inner'
    this.el.appendChild(this.inner)
    root.appendChild(this.el)
  }
  update(onWall: boolean): void {
    const want = onWall && this.enabled
    if (want === this.shown) return
    this.shown = want
    this.el.hidden = !want
    if (want) this.fill()
  }
  private fill(): void {
    this.inner.innerHTML = ''
    if (!this.client || !this.slot) {
      this.inner.classList.add('placeholder')
      this.inner.textContent = 'AD'
      return
    }
    this.inner.classList.remove('placeholder')
    const ins = document.createElement('ins')
    ins.className = 'adsbygoogle'
    ins.style.display = 'inline-block'
    ins.style.width = '300px'
    ins.style.height = '250px'
    ins.setAttribute('data-ad-client', this.client)
    ins.setAttribute('data-ad-slot', this.slot)
    this.inner.appendChild(ins)
    const w = window as unknown as { adsbygoogle?: unknown[] }
    ;(w.adsbygoogle = w.adsbygoogle || []).push({})
  }
}
