/**
 * Ground surface textures painted at boot: asphalt (left half) and
 * pavement (right half) in one 1024 x 512 albedo and one detail texture
 * (normal RG, roughness B, AO A). Each half tiles at 6 m (asphalt) / 4 m
 * (pavement).
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three'
import type { Rng } from '../core/rng'

export interface SurfaceTextures {
  albedo: Texture
  detail: Texture
}

const W = 1024, H = 512, HALF = 512

function ctx2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c.getContext('2d', { willReadFrequently: true })!
}

function grey(v: number): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgb(${g},${g},${g})`
}

export function buildSurfaces(rng: Rng, anisotropy: number): SurfaceTextures {
  const a = ctx2d(W, H), h = ctx2d(W, H), r = ctx2d(W, H)
  // ---------------------------------------------------------- asphalt
  a.fillStyle = '#2a2b2f'
  a.fillRect(0, 0, HALF, H)
  h.fillStyle = grey(0.5)
  h.fillRect(0, 0, HALF, H)
  r.fillStyle = grey(0.78)
  r.fillRect(0, 0, HALF, H)
  // aggregate: thousands of tiny light/dark specks
  for (let i = 0; i < 26000; i++) {
    const x = rng.next() * HALF, y = rng.next() * H
    const v = 30 + rng.next() * 40
    a.fillStyle = `rgb(${v},${v},${v + 3})`
    a.fillRect(x, y, 1 + rng.next() * 2, 1 + rng.next() * 2)
    h.fillStyle = grey(0.5 + (rng.next() - 0.5) * 0.25)
    h.fillRect(x, y, 2, 2)
  }
  // tar patches (darker, smoother)
  for (let i = 0; i < 9; i++) {
    a.fillStyle = 'rgba(12,12,14,0.55)'
    r.fillStyle = grey(0.45)
    const x = rng.next() * HALF, y = rng.next() * H, w = 30 + rng.next() * 90, hh = 20 + rng.next() * 60
    a.beginPath(); a.ellipse(x, y, w, hh, rng.next() * 3, 0, 6.3); a.fill()
    r.beginPath(); r.ellipse(x, y, w, hh, rng.next() * 3, 0, 6.3); r.fill()
  }
  // cracks
  a.strokeStyle = 'rgba(0,0,0,0.75)'
  h.strokeStyle = grey(0.28)
  for (let i = 0; i < 14; i++) {
    let x = rng.next() * HALF, y = rng.next() * H
    a.lineWidth = 1 + rng.next() * 1.5
    h.lineWidth = a.lineWidth + 1
    a.beginPath(); a.moveTo(x, y); h.beginPath(); h.moveTo(x, y)
    const n = 4 + Math.floor(rng.next() * 8)
    for (let k = 0; k < n; k++) {
      x += (rng.next() - 0.5) * 60
      y += (rng.next() - 0.5) * 60
      a.lineTo(x, y); h.lineTo(x, y)
    }
    a.stroke(); h.stroke()
  }
  // wrap-friendly: mirror-stamp the edges so seams hide (cheap trick: darken edges slightly)
  // ---------------------------------------------------------- pavement
  a.fillStyle = '#5c5a58'
  a.fillRect(HALF, 0, HALF, H)
  h.fillStyle = grey(0.55)
  h.fillRect(HALF, 0, HALF, H)
  r.fillStyle = grey(0.9)
  r.fillRect(HALF, 0, HALF, H)
  for (let i = 0; i < 16000; i++) {
    const x = HALF + rng.next() * HALF, y = rng.next() * H
    const v = 70 + rng.next() * 50
    a.fillStyle = `rgb(${v},${v - 2},${v - 4})`
    a.fillRect(x, y, 1 + rng.next() * 2, 1 + rng.next() * 2)
  }
  // slab grid: 4 m tile => 128 px per slab (1 m) -> use 1.33 m slabs (3 per tile) for variety
  const slab = HALF / 3
  a.strokeStyle = 'rgba(0,0,0,0.45)'
  a.lineWidth = 3
  h.strokeStyle = grey(0.35)
  h.lineWidth = 4
  for (let i = 0; i <= 3; i++) {
    const x = HALF + i * slab, y = i * slab
    a.beginPath(); a.moveTo(x + 0.5, 0); a.lineTo(x + 0.5, H); a.stroke()
    h.beginPath(); h.moveTo(x + 0.5, 0); h.lineTo(x + 0.5, H); h.stroke()
    a.beginPath(); a.moveTo(HALF, y + 0.5); a.lineTo(W, y + 0.5); a.stroke()
    h.beginPath(); h.moveTo(HALF, y + 0.5); h.lineTo(W, y + 0.5); h.stroke()
  }
  // per-slab tone + gum spots + stains
  for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
    a.fillStyle = `rgba(${rng.next() < 0.5 ? 0 : 255},${rng.next() < 0.5 ? 0 : 255},${rng.next() < 0.5 ? 0 : 255},${0.03 + rng.next() * 0.06})`
    a.fillRect(HALF + sx * slab + 2, sy * slab + 2, slab - 4, slab - 4)
  }
  for (let i = 0; i < 40; i++) {
    a.fillStyle = 'rgba(20,20,22,0.5)'
    a.beginPath(); a.arc(HALF + rng.next() * HALF, rng.next() * H, 2 + rng.next() * 3, 0, 6.3); a.fill()
  }
  for (let i = 0; i < 6; i++) {
    a.fillStyle = 'rgba(0,0,0,0.18)'
    a.beginPath(); a.ellipse(HALF + rng.next() * HALF, rng.next() * H, 20 + rng.next() * 60, 10 + rng.next() * 30, rng.next() * 3, 0, 6.3); a.fill()
  }

  // ---------------------------------------------------------- pack
  const alb = a.getImageData(0, 0, W, H)
  const hg = h.getImageData(0, 0, W, H).data
  const rg = r.getImageData(0, 0, W, H).data
  const det = new Uint8Array(W * H * 4)
  const hv = (x: number, y: number, x0: number) => hg[(((y + H) % H) * W + (x0 + (((x - x0) + HALF) % HALF))) * 4]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = x < HALF ? 0 : HALF
      const dx = (hv(x + 1, y, x0) - hv(x - 1, y, x0)) / 255
      const dy = (hv(x, y + 1, x0) - hv(x, y - 1, x0)) / 255
      let nx = -dx * 2.5, ny = dy * 2.5, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const o = (y * W + x) * 4
      det[o] = (nx * 0.5 + 0.5) * 255
      det[o + 1] = (ny * 0.5 + 0.5) * 255
      det[o + 2] = rg[o]
      det[o + 3] = 255
    }
  }
  for (let i = 0; i < W * H; i++) alb.data[i * 4 + 3] = 255
  const mk = (data: Uint8Array | Uint8ClampedArray, cs: typeof SRGBColorSpace | typeof NoColorSpace) => {
    const t = new DataTexture(data instanceof Uint8Array ? data : new Uint8Array(data.buffer), W, H, RGBAFormat, UnsignedByteType)
    t.colorSpace = cs
    t.minFilter = LinearMipmapLinearFilter
    t.magFilter = LinearFilter
    t.generateMipmaps = true
    t.anisotropy = anisotropy
    t.flipY = false
    t.needsUpdate = true
    return t
  }
  return { albedo: mk(alb.data, SRGBColorSpace), detail: mk(det, NoColorSpace) }
}
