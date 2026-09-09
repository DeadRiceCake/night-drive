/**
 * Procedural facade texture atlas. Everything is painted into canvases at
 * boot: an albedo atlas (RGB) whose alpha is the window-glass mask, and a
 * detail atlas holding a tangent-space normal (RG), roughness (B) and
 * ambient occlusion (A) derived from a painted height map.
 *
 * Layout: 4 columns x 8 rows of 512 px tiles (2048 x 4096).
 *   0..15  facade styles (see TILE_OF in buildings.ts)
 *   16..19 ground-floor shopfronts (8 m x 8 m)
 *   20..23 lit interiors seen through a window (one window cell)
 *   24     roof (gravel + seams)
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three'
import type { Rng } from '../core/rng'

export const ATLAS_W = 2048
export const ATLAS_H = 4096
export const TILE = 512
export const COLS = 4
export const ROWS = 8

export interface FacadeAtlas {
  albedo: Texture
  detail: Texture
}

type Ctx = CanvasRenderingContext2D

interface Layers {
  a: Ctx // albedo
  m: Ctx // glass mask (white = glass)
  h: Ctx // height 0..1 as grey
  r: Ctx // roughness as grey
}

function canvas(w: number, h: number): Ctx {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c.getContext('2d', { willReadFrequently: true })!
}

function grey(v: number): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgb(${g},${g},${g})`
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return rgb(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k))
}

/** Fine random grain, used as a repeating pattern. */
function makeNoise(rng: Rng, size: number, soft: boolean): HTMLCanvasElement {
  const c = canvas(size, size)
  const img = c.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const v = 110 + rng.next() * 90
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  c.putImageData(img, 0, 0)
  if (!soft) return c.canvas
  // soft: upscale a tiny noise for blotches
  const big = canvas(size, size)
  big.imageSmoothingEnabled = true
  big.drawImage(c.canvas, 0, 0, 24, 24, 0, 0, size, size)
  return big.canvas
}

let NOISE: CanvasPattern | null = null
let BLOTCH: CanvasPattern | null = null

/** Multiply-style grain over a rect. */
function grain(ctx: Ctx, x: number, y: number, w: number, h: number, amount: number, soft = false): void {
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = amount
  ctx.fillStyle = (soft ? BLOTCH : NOISE)!
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

/** Vertical dirt streaks running down from a y position. */
function streaks(ctx: Ctx, rng: Rng, x: number, y: number, w: number, len: number, count: number, alpha: number): void {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const sx = x + rng.next() * w
    const sw = 2 + rng.next() * 6
    const g = ctx.createLinearGradient(0, y, 0, y + len * (0.4 + rng.next() * 0.6))
    g.addColorStop(0, `rgba(0,0,0,${alpha})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(sx, y, sw, len)
  }
  ctx.restore()
}

interface WinSpec {
  /** glass rect as fractions of the cell */
  x0: number
  y0: number
  x1: number
  y1: number
  frame: number
  frameCol: string
  glass: string
  sill: boolean
  /** 0 = none, 1 = mullion cross, 2 = vertical mullion only */
  mullion: number
}

interface TileSpec {
  wall: string
  grain: number
  blotch: number
  cols: number
  rows: number
  win: WinSpec | null
  balcony: number
  ac: number
  seams: 'none' | 'panel' | 'brick' | 'concrete' | 'slab' | 'metal' | 'groove'
  roughWall: number
  roughGlass: number
  heightWall: number
  /** probability a window cell is missing (unfinished) */
  hole: number
  extras?: (L: Layers, x: number, y: number, rng: Rng) => void
  /** draw floor slabs between rows (residential / mega) */
  slab: boolean
  streaks: number
  /** ribbon: continuous horizontal band windows */
  ribbon: boolean
}

const BASE: TileSpec = {
  wall: '#8a8a8e', grain: 0.5, blotch: 0.35, cols: 4, rows: 4, win: null, balcony: 0, ac: 0, seams: 'none',
  roughWall: 0.85, roughGlass: 0.12, heightWall: 0.5, hole: 0, slab: false, streaks: 0.4, ribbon: false,
}

function win(o: Partial<WinSpec>): WinSpec {
  return { x0: 0.14, y0: 0.2, x1: 0.86, y1: 0.86, frame: 5, frameCol: '#5a5a60', glass: '#2a3038', sill: true, mullion: 0, ...o }
}

// ---------------------------------------------------------------- drawing

function drawWall(L: Layers, x: number, y: number, s: TileSpec, rng: Rng): void {
  const { a, h, r, m } = L
  a.fillStyle = s.wall
  a.fillRect(x, y, TILE, TILE)
  grain(a, x, y, TILE, TILE, s.grain)
  grain(a, x, y, TILE, TILE, s.blotch, true)
  m.fillStyle = '#000'
  m.fillRect(x, y, TILE, TILE)
  h.fillStyle = grey(s.heightWall)
  h.fillRect(x, y, TILE, TILE)
  grain(h, x, y, TILE, TILE, 0.18)
  r.fillStyle = grey(s.roughWall)
  r.fillRect(x, y, TILE, TILE)
  // seams
  a.save(); h.save()
  if (s.seams === 'panel' || s.seams === 'metal') {
    const pw = s.seams === 'metal' ? 64 : 128, ph = s.seams === 'metal' ? 512 : 128
    a.strokeStyle = 'rgba(0,0,0,0.28)'
    a.lineWidth = 2
    h.strokeStyle = grey(s.heightWall - 0.14)
    h.lineWidth = 3
    for (let px = 0; px <= TILE; px += pw) { a.beginPath(); a.moveTo(x + px + 0.5, y); a.lineTo(x + px + 0.5, y + TILE); a.stroke(); h.beginPath(); h.moveTo(x + px + 0.5, y); h.lineTo(x + px + 0.5, y + TILE); h.stroke() }
    for (let py = 0; py <= TILE; py += ph) { a.beginPath(); a.moveTo(x, y + py + 0.5); a.lineTo(x + TILE, y + py + 0.5); a.stroke(); h.beginPath(); h.moveTo(x, y + py + 0.5); h.lineTo(x + TILE, y + py + 0.5); h.stroke() }
    // per-panel tone
    for (let py = 0; py < TILE; py += ph) for (let px = 0; px < TILE; px += pw) {
      a.fillStyle = `rgba(${rng.next() < 0.5 ? 0 : 255},${rng.next() < 0.5 ? 0 : 255},${rng.next() < 0.5 ? 0 : 255},${0.03 + rng.next() * 0.05})`
      a.fillRect(x + px, y + py, pw, ph)
    }
  } else if (s.seams === 'brick') {
    const bw = 34, bh = 14
    for (let row = 0, py = 0; py < TILE; py += bh, row++) {
      const off = row % 2 ? bw / 2 : 0
      for (let px = -bw; px < TILE; px += bw) {
        const tone = 0.85 + rng.next() * 0.3
        a.fillStyle = shade(s.wall, tone)
        a.fillRect(x + px + off + 1, y + py + 1, bw - 2, bh - 2)
        h.fillStyle = grey(s.heightWall + 0.05 + rng.next() * 0.04)
        h.fillRect(x + px + off + 1, y + py + 1, bw - 2, bh - 2)
      }
    }
    // mortar lines are the base (darker) colour showing through
    a.fillStyle = 'rgba(0,0,0,0.25)'
    for (let py = 0; py < TILE; py += bh) a.fillRect(x, y + py, TILE, 1.5)
    grain(a, x, y, TILE, TILE, 0.35)
  } else if (s.seams === 'concrete') {
    // board-form concrete: faint horizontal lines + tie holes
    a.strokeStyle = 'rgba(0,0,0,0.12)'
    a.lineWidth = 1
    for (let py = 0; py < TILE; py += 22) { a.beginPath(); a.moveTo(x, y + py + 0.5); a.lineTo(x + TILE, y + py + 0.5); a.stroke() }
    for (let i = 0; i < 24; i++) {
      const px = x + 30 + (i % 4) * 128 + (rng.next() - 0.5) * 6, py = y + 40 + Math.floor(i / 4) * 80
      a.fillStyle = 'rgba(0,0,0,0.35)'
      a.beginPath(); a.arc(px, py, 3, 0, 6.3); a.fill()
      h.fillStyle = grey(s.heightWall - 0.2)
      h.beginPath(); h.arc(px, py, 3, 0, 6.3); h.fill()
    }
  } else if (s.seams === 'groove') {
    // vertical grooves every cell column (arasaka)
    const cw = TILE / s.cols
    for (let c = 0; c <= s.cols; c++) {
      const px = x + c * cw
      a.fillStyle = 'rgba(0,0,0,0.6)'
      a.fillRect(px - 4, y, 8, TILE)
      h.fillStyle = grey(s.heightWall - 0.3)
      h.fillRect(px - 4, y, 8, TILE)
    }
    a.fillStyle = 'rgba(255,255,255,0.05)'
    for (let py = 0; py < TILE; py += 32) a.fillRect(x, y + py, TILE, 1)
  }
  a.restore(); h.restore()
}

function drawWindows(L: Layers, x: number, y: number, s: TileSpec, rng: Rng): void {
  if (!s.win) return
  const { a, m, h, r } = L
  const w = s.win
  const cw = TILE / s.cols, ch = TILE / s.rows
  for (let row = 0; row < s.rows; row++) {
    for (let col = 0; col < s.cols; col++) {
      const cx = x + col * cw, cy = y + row * ch
      // window rect in px (canvas y grows downwards; y0 is the bottom of the glass in facade space)
      const gx0 = cx + (s.ribbon ? 0 : w.x0 * cw), gx1 = cx + (s.ribbon ? cw : w.x1 * cw)
      const gy0 = cy + (1 - w.y1) * ch, gy1 = cy + (1 - w.y0) * ch
      const gw = gx1 - gx0, gh = gy1 - gy0
      if (s.hole > 0 && rng.next() < s.hole) {
        // unfinished: bare opening, dark
        a.fillStyle = '#0c0c10'
        a.fillRect(gx0, gy0, gw, gh)
        h.fillStyle = grey(0.1)
        h.fillRect(gx0, gy0, gw, gh)
        continue
      }
      // frame (slightly proud of the wall)
      a.fillStyle = w.frameCol
      a.fillRect(gx0 - w.frame, gy0 - w.frame, gw + 2 * w.frame, gh + 2 * w.frame)
      h.fillStyle = grey(s.heightWall + 0.06)
      h.fillRect(gx0 - w.frame, gy0 - w.frame, gw + 2 * w.frame, gh + 2 * w.frame)
      r.fillStyle = grey(0.45)
      r.fillRect(gx0 - w.frame, gy0 - w.frame, gw + 2 * w.frame, gh + 2 * w.frame)
      // glass: recessed, dark with a top-down gradient (sky reflection) and grime at the bottom
      const g = a.createLinearGradient(0, gy0, 0, gy1)
      g.addColorStop(0, shade(w.glass, 1.35))
      g.addColorStop(0.5, w.glass)
      g.addColorStop(1, shade(w.glass, 0.75))
      a.fillStyle = g
      a.fillRect(gx0, gy0, gw, gh)
      m.fillStyle = '#fff'
      m.fillRect(gx0, gy0, gw, gh)
      h.fillStyle = grey(s.heightWall - 0.22)
      h.fillRect(gx0, gy0, gw, gh)
      r.fillStyle = grey(s.roughGlass)
      r.fillRect(gx0, gy0, gw, gh)
      // mullions
      if (w.mullion) {
        a.fillStyle = w.frameCol
        m.fillStyle = '#000'
        h.fillStyle = grey(s.heightWall)
        const mx = gx0 + gw / 2
        a.fillRect(mx - 2, gy0, 4, gh); m.fillRect(mx - 2, gy0, 4, gh); h.fillRect(mx - 2, gy0, 4, gh)
        if (w.mullion === 1) {
          const my = gy0 + gh * 0.42
          a.fillRect(gx0, my - 2, gw, 4); m.fillRect(gx0, my - 2, gw, 4); h.fillRect(gx0, my - 2, gw, 4)
        }
      }
      // per-window blinds / curtains hint on unlit glass (subtle, mask stays glass)
      if (rng.next() < 0.35) {
        a.fillStyle = 'rgba(200,190,170,0.16)'
        const bh = gh * (0.3 + rng.next() * 0.5)
        a.fillRect(gx0, gy0, gw, bh)
      }
      // sill: light strip under the glass + shadow under the sill
      if (w.sill) {
        a.fillStyle = shade(s.wall, 1.25)
        a.fillRect(gx0 - w.frame - 3, gy1 + w.frame, gw + 2 * w.frame + 6, 5)
        h.fillStyle = grey(s.heightWall + 0.24)
        h.fillRect(gx0 - w.frame - 3, gy1 + w.frame, gw + 2 * w.frame + 6, 5)
        a.fillStyle = 'rgba(0,0,0,0.35)'
        a.fillRect(gx0 - w.frame - 3, gy1 + w.frame + 5, gw + 2 * w.frame + 6, 4)
        streaks(a, rng, gx0 - 4, gy1 + w.frame + 8, gw + 8, ch * 0.5, 3, 0.18 * s.streaks)
      }
      // ac unit hanging below some windows
      if (s.ac > 0 && rng.next() < s.ac) {
        const aw = cw * 0.28, ah = ch * 0.18
        const ax = gx0 + rng.next() * (gw - aw), ay = gy1 + w.frame + 6
        a.fillStyle = '#9a9ca0'
        a.fillRect(ax, ay, aw, ah)
        a.fillStyle = '#6a6c70'
        a.fillRect(ax + 3, ay + 3, aw - 6, ah - 6)
        a.fillStyle = 'rgba(0,0,0,0.5)'
        a.fillRect(ax, ay + ah, aw, 4)
        m.fillStyle = '#000'
        m.fillRect(ax, ay, aw, ah)
        h.fillStyle = grey(0.95)
        h.fillRect(ax, ay, aw, ah)
        r.fillStyle = grey(0.5)
        r.fillRect(ax, ay, aw, ah)
        streaks(a, rng, ax, ay + ah, aw, ch * 0.6, 2, 0.25)
      }
    }
    // balcony slab + railing across the row (front of the windows)
    if (s.balcony > 0 && rng.next() < s.balcony) {
      const by = y + row * ch + (1 - w.y0) * ch + w.frame + 2
      const railH = ch * 0.3
      // slab
      a.fillStyle = shade(s.wall, 1.3)
      a.fillRect(x, by, TILE, 9)
      a.fillStyle = 'rgba(0,0,0,0.55)'
      a.fillRect(x, by + 9, TILE, 10)
      h.fillStyle = grey(1.0)
      h.fillRect(x, by, TILE, 9)
      h.fillStyle = grey(0.3)
      h.fillRect(x, by + 9, TILE, 10)
      m.fillStyle = '#000'
      m.fillRect(x, by, TILE, 19)
      // railing above the slab (thin bars, over glass)
      a.fillStyle = '#3a3a40'
      m.fillStyle = '#000'
      h.fillStyle = grey(0.9)
      for (let bx = 0; bx < TILE; bx += 14) { a.fillRect(x + bx, by - railH, 2, railH); m.fillRect(x + bx, by - railH, 2, railH); h.fillRect(x + bx, by - railH, 2, railH) }
      a.fillRect(x, by - railH - 2, TILE, 4); m.fillRect(x, by - railH - 2, TILE, 4); h.fillRect(x, by - railH - 2, TILE, 4)
      // occasional laundry / plants
      if (rng.next() < 0.5) {
        const px = x + rng.next() * (TILE - 30)
        a.fillStyle = ['#8a3a3a', '#3a5a8a', '#c8c0a0', '#3a6a3a'][Math.floor(rng.next() * 4)]
        a.fillRect(px, by - railH + 4, 26, railH - 8)
        m.fillStyle = '#000'
        m.fillRect(px, by - railH + 4, 26, railH - 8)
      }
    }
    if (s.slab) {
      const sy = y + row * ch
      a.fillStyle = 'rgba(255,255,255,0.12)'
      a.fillRect(x, sy, TILE, 3)
      a.fillStyle = 'rgba(0,0,0,0.3)'
      a.fillRect(x, sy + 3, TILE, 4)
      h.fillStyle = grey(s.heightWall + 0.25)
      h.fillRect(x, sy, TILE, 3)
    }
  }
}

// ------------------------------------------------------------- shopfronts

function drawShop(L: Layers, x: number, y: number, variant: number, rng: Rng): void {
  const { a, m, h, r } = L
  // 8 m x 8 m tile; storefront occupies the bottom 4.5 m => bottom 288 px
  const base: TileSpec = { ...BASE, wall: ['#6a6668', '#7a7470', '#5c5e66', '#6e6a62'][variant], seams: variant % 2 ? 'concrete' : 'panel', heightWall: 0.5 }
  drawWall(L, x, y, base, rng)
  const top = y + TILE - 288
  // darker recessed storefront band
  a.fillStyle = '#1c1c22'
  a.fillRect(x, top, TILE, 288)
  h.fillStyle = grey(0.3)
  h.fillRect(x, top, TILE, 288)
  r.fillStyle = grey(0.7)
  r.fillRect(x, top, TILE, 288)
  // signboard strip (3.2..4.1 m): dark box with a bright edge (real signs are meshes)
  a.fillStyle = '#26262c'
  a.fillRect(x, top, TILE, 58)
  a.fillStyle = 'rgba(255,255,255,0.08)'
  a.fillRect(x, top + 56, TILE, 2)
  h.fillStyle = grey(0.62)
  h.fillRect(x, top, TILE, 58)
  // columns / piers between units
  const units = variant === 2 ? 3 : 2
  const uw = TILE / units
  for (let u = 0; u <= units; u++) {
    const px = x + u * uw
    a.fillStyle = base.wall
    a.fillRect(px - 14, top + 58, 28, 230)
    grain(a, px - 14, top + 58, 28, 230, 0.4)
    h.fillStyle = grey(0.62)
    h.fillRect(px - 14, top + 58, 28, 230)
    r.fillStyle = grey(0.85)
    r.fillRect(px - 14, top + 58, 28, 230)
  }
  for (let u = 0; u < units; u++) {
    const ux = x + u * uw + 14, uwid = uw - 28
    const kind = (variant + u) % 4
    const fy = top + 58, fh = 230
    if (kind === 0 || kind === 3) {
      // display window with door on the right
      const dw = 70
      a.fillStyle = '#0e1418'
      a.fillRect(ux + 8, fy + 10, uwid - dw - 16, fh - 30)
      m.fillStyle = '#fff'
      m.fillRect(ux + 8, fy + 10, uwid - dw - 16, fh - 30)
      r.fillStyle = grey(0.1)
      r.fillRect(ux + 8, fy + 10, uwid - dw - 16, fh - 30)
      h.fillStyle = grey(0.28)
      h.fillRect(ux + 8, fy + 10, uwid - dw - 16, fh - 30)
      // frame
      a.strokeStyle = '#8a8a90'; a.lineWidth = 4
      a.strokeRect(ux + 8, fy + 10, uwid - dw - 16, fh - 30)
      // door
      a.fillStyle = '#2a2a30'
      a.fillRect(ux + uwid - dw, fy + 20, dw - 8, fh - 20)
      a.fillStyle = '#0e1418'
      a.fillRect(ux + uwid - dw + 8, fy + 30, dw - 24, fh - 110)
      m.fillStyle = '#fff'
      m.fillRect(ux + uwid - dw + 8, fy + 30, dw - 24, fh - 110)
      a.fillStyle = '#b0b0b8'
      a.fillRect(ux + uwid - dw + 8, fy + fh - 70, 4, 22)
      // low wall under the window
      a.fillStyle = shade(base.wall, 0.8)
      a.fillRect(ux + 8, fy + fh - 20, uwid - dw - 16, 20)
      m.fillStyle = '#000'
      m.fillRect(ux + 8, fy + fh - 20, uwid - dw - 16, 20)
    } else if (kind === 1) {
      // roller shutter (corrugated) with graffiti
      for (let sy = fy + 6; sy < fy + fh; sy += 10) {
        a.fillStyle = sy % 20 === 6 ? '#4c4c54' : '#3a3a42'
        a.fillRect(ux + 4, sy, uwid - 8, 10)
        h.fillStyle = grey(sy % 20 === 6 ? 0.5 : 0.42)
        h.fillRect(ux + 4, sy, uwid - 8, 10)
      }
      r.fillStyle = grey(0.5)
      r.fillRect(ux + 4, fy + 6, uwid - 8, fh - 6)
      // graffiti tag: a few bold strokes
      a.save()
      a.globalAlpha = 0.8
      const cols = ['#ff2a6d', '#37ebf3', '#fcee0a', '#ffffff', '#a06bff']
      for (let i = 0; i < 4; i++) {
        a.strokeStyle = cols[Math.floor(rng.next() * cols.length)]
        a.lineWidth = 8 + rng.next() * 10
        a.beginPath()
        a.moveTo(ux + 20 + rng.next() * (uwid - 40), fy + 60 + rng.next() * 120)
        a.bezierCurveTo(ux + rng.next() * uwid, fy + rng.next() * fh, ux + rng.next() * uwid, fy + rng.next() * fh, ux + 20 + rng.next() * (uwid - 40), fy + 60 + rng.next() * 120)
        a.stroke()
      }
      a.restore()
      grain(a, ux, fy, uwid, fh, 0.5)
    } else {
      // recessed entrance with posters + pipes + a vent grille
      a.fillStyle = '#141418'
      a.fillRect(ux + 6, fy + 8, uwid - 12, fh - 8)
      h.fillStyle = grey(0.2)
      h.fillRect(ux + 6, fy + 8, uwid - 12, fh - 8)
      // posters
      for (let i = 0; i < 3; i++) {
        const pw = 46, ph = 64
        const px = ux + 16 + i * (pw + 10) + rng.next() * 6, py = fy + 30 + rng.next() * 40
        a.fillStyle = ['#c84a6a', '#4a7ac8', '#c8b04a', '#e0e0e8', '#6ac87a'][Math.floor(rng.next() * 5)]
        a.fillRect(px, py, pw, ph)
        a.fillStyle = 'rgba(0,0,0,0.6)'
        a.fillRect(px + 6, py + 8, pw - 12, 10)
        a.fillRect(px + 6, py + 24, pw - 12, 26)
        a.fillStyle = 'rgba(255,255,255,0.25)'
        a.fillRect(px + 6, py + ph - 12, pw - 12, 6)
        grain(a, px, py, pw, ph, 0.4)
      }
      // grille
      a.fillStyle = '#3a3a42'
      a.fillRect(ux + uwid - 70, fy + 30, 54, 54)
      for (let gy = fy + 36; gy < fy + 80; gy += 8) { a.fillStyle = '#101014'; a.fillRect(ux + uwid - 66, gy, 46, 3) }
      // pipes
      a.fillStyle = '#5a5a62'
      a.fillRect(ux + uwid - 28, fy + 8, 8, fh - 8)
      a.fillRect(ux + uwid - 16, fy + 8, 5, fh - 8)
      h.fillStyle = grey(0.85)
      h.fillRect(ux + uwid - 28, fy + 8, 8, fh - 8)
      h.fillRect(ux + uwid - 16, fy + 8, 5, fh - 8)
      r.fillStyle = grey(0.35)
      r.fillRect(ux + uwid - 28, fy + 8, 8, fh - 8)
      streaks(a, rng, ux + 6, fy + 8, uwid - 12, fh, 5, 0.3)
    }
  }
  // grime at the pavement line
  const g = a.createLinearGradient(0, y + TILE - 30, 0, y + TILE)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  a.fillStyle = g
  a.fillRect(x, y + TILE - 30, TILE, 30)
}

// -------------------------------------------------------------- interiors

function drawInterior(L: Layers, x: number, y: number, variant: number, rng: Rng): void {
  const { a, m, h, r } = L
  // back wall with a warm-ish gradient (lighting comes from above)
  const g = a.createLinearGradient(0, y, 0, y + TILE)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.15, '#d8d0c0')
  g.addColorStop(1, '#5a5048')
  a.fillStyle = g
  a.fillRect(x, y, TILE, TILE)
  m.fillStyle = '#000'
  m.fillRect(x, y, TILE, TILE)
  h.fillStyle = grey(0.5)
  h.fillRect(x, y, TILE, TILE)
  r.fillStyle = grey(0.9)
  r.fillRect(x, y, TILE, TILE)
  // ceiling light bar
  a.fillStyle = '#ffffff'
  a.fillRect(x + 40, y + 18, TILE - 80, 14)
  if (variant === 0) {
    // horizontal blinds, half down
    a.fillStyle = 'rgba(40,36,34,0.85)'
    for (let by = y + 40; by < y + TILE * 0.55; by += 16) a.fillRect(x, by, TILE, 7)
  } else if (variant === 1) {
    // curtain on the left (vertical folds)
    for (let cx = x; cx < x + TILE * 0.45; cx += 22) {
      a.fillStyle = cx % 44 === 0 ? '#8a3a3a' : '#6a2a2a'
      a.fillRect(cx, y + 30, 22, TILE - 30)
    }
    // furniture silhouette
    a.fillStyle = 'rgba(20,16,14,0.8)'
    a.fillRect(x + TILE * 0.55, y + TILE * 0.62, TILE * 0.35, TILE * 0.3)
  } else if (variant === 2) {
    // office: rows of panels + a screen
    a.fillStyle = 'rgba(30,30,38,0.7)'
    a.fillRect(x, y + TILE * 0.55, TILE, TILE * 0.45)
    a.fillStyle = '#7ad0ff'
    a.fillRect(x + TILE * 0.3, y + TILE * 0.45, TILE * 0.25, TILE * 0.14)
    a.fillStyle = 'rgba(0,0,0,0.5)'
    for (let cx = x; cx < x + TILE; cx += 100) a.fillRect(cx, y + 30, 6, TILE)
  } else {
    // dim room, mostly a plant and a lamp
    a.fillStyle = 'rgba(0,0,0,0.45)'
    a.fillRect(x, y, TILE, TILE)
    a.fillStyle = '#ffe0a0'
    a.beginPath(); a.arc(x + TILE * 0.75, y + TILE * 0.5, 26, 0, 6.3); a.fill()
    a.fillStyle = '#1a2a18'
    a.beginPath(); a.arc(x + TILE * 0.25, y + TILE * 0.7, 60, 0, 6.3); a.fill()
  }
  void rng
}

function drawRoof(L: Layers, x: number, y: number, rng: Rng): void {
  const s: TileSpec = { ...BASE, wall: '#55555a', seams: 'panel', grain: 0.7, blotch: 0.4, heightWall: 0.5 }
  drawWall(L, x, y, s, rng)
  const { a, h } = L
  // gravel darkening + tar seams
  a.fillStyle = 'rgba(0,0,0,0.25)'
  a.fillRect(x, y, TILE, TILE)
  a.strokeStyle = 'rgba(0,0,0,0.5)'
  a.lineWidth = 6
  for (let i = 0; i < 6; i++) {
    a.beginPath()
    a.moveTo(x + rng.next() * TILE, y + rng.next() * TILE)
    a.lineTo(x + rng.next() * TILE, y + rng.next() * TILE)
    a.stroke()
  }
  // vents
  for (let i = 0; i < 5; i++) {
    const px = x + rng.next() * (TILE - 40), py = y + rng.next() * (TILE - 40)
    a.fillStyle = '#7a7a80'
    a.fillRect(px, py, 30, 30)
    h.fillStyle = grey(0.9)
    h.fillRect(px, py, 30, 30)
  }
}

// ----------------------------------------------------------------- specs

export function facadeSpecs(): TileSpec[] {
  const glassWin = win({ x0: 0.04, y0: 0.06, x1: 0.96, y1: 0.97, frame: 3, frameCol: '#3a3e48', glass: '#1e2630', sill: false, mullion: 2 })
  const list: TileSpec[] = [
    // 0,1 glass curtain wall
    { ...BASE, wall: '#3a3e48', grain: 0.3, blotch: 0.15, win: glassWin, seams: 'none', roughWall: 0.5, heightWall: 0.5, slab: true, streaks: 0.1 },
    { ...BASE, wall: '#2c3038', grain: 0.3, blotch: 0.15, win: { ...glassWin, glass: '#24303a', frameCol: '#5a5e68', mullion: 1 }, seams: 'none', roughWall: 0.45, slab: true, streaks: 0.1 },
    // 2,3,4 residential concrete
    { ...BASE, wall: '#8a857c', win: win({ x0: 0.16, y0: 0.22, x1: 0.84, y1: 0.86, mullion: 1 }), balcony: 0.55, ac: 0.35, seams: 'concrete', slab: true, streaks: 1 },
    { ...BASE, wall: '#7c7a80', win: win({ x0: 0.12, y0: 0.18, x1: 0.88, y1: 0.86, frameCol: '#4a4a50', mullion: 2 }), balcony: 0.35, ac: 0.55, seams: 'panel', slab: true, streaks: 0.9 },
    { ...BASE, wall: '#8e8478', win: win({ x0: 0.2, y0: 0.24, x1: 0.8, y1: 0.84, frameCol: '#6a6058' }), balcony: 0.75, ac: 0.25, seams: 'concrete', slab: false, streaks: 1.2 },
    // 5,6 industrial
    { ...BASE, wall: '#6a6c70', grain: 0.6, win: win({ x0: 0.08, y0: 0.5, x1: 0.92, y1: 0.9, frame: 4, frameCol: '#3a3a40', glass: '#20242a', mullion: 1, sill: false }), seams: 'metal', roughWall: 0.7, streaks: 1.2 },
    { ...BASE, wall: '#74706a', grain: 0.7, win: win({ x0: 0.3, y0: 0.55, x1: 0.7, y1: 0.9, frame: 4, frameCol: '#3a3a40', glass: '#1e2024', sill: false }), seams: 'panel', roughWall: 0.8, streaks: 1.4 },
    // 7 unfinished frame
    { ...BASE, wall: '#7a7a7a', grain: 0.8, blotch: 0.5, win: win({ x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.85, frame: 2, frameCol: '#5a5a5a', glass: '#0c0c10', sill: false }), hole: 0.85, seams: 'concrete', roughWall: 0.95, slab: true, streaks: 1.5 },
    // 8,9 megabuilding
    { ...BASE, wall: '#5a5c64', grain: 0.4, win: win({ x0: 0.1, y0: 0.15, x1: 0.9, y1: 0.85, frame: 3, frameCol: '#404248', glass: '#242a32', sill: false }), ac: 0.4, seams: 'panel', slab: true, streaks: 0.8 },
    { ...BASE, wall: '#4e5058', grain: 0.4, win: win({ x0: 0.08, y0: 0.2, x1: 0.92, y1: 0.9, frame: 3, frameCol: '#34363c', glass: '#202830', sill: false, mullion: 2 }), balcony: 0.3, ac: 0.5, seams: 'metal', slab: true, streaks: 0.8 },
    // 10 house
    { ...BASE, wall: '#9a9080', grain: 0.5, win: win({ x0: 0.22, y0: 0.28, x1: 0.78, y1: 0.82, frameCol: '#e8e4d8', glass: '#2a3038', mullion: 1 }), seams: 'none', roughWall: 0.9, streaks: 0.5 },
    // 11 arasaka
    { ...BASE, wall: '#161618', grain: 0.2, blotch: 0.1, win: null, seams: 'groove', roughWall: 0.35, heightWall: 0.55, streaks: 0 },
    // 12,13 luxury ribbon
    { ...BASE, wall: '#8c8c90', grain: 0.3, blotch: 0.2, win: win({ x0: 0, y0: 0.2, x1: 1, y1: 0.85, frame: 3, frameCol: '#c8c4b8', glass: '#222a34', sill: true }), seams: 'none', roughWall: 0.6, ribbon: true, slab: false, streaks: 0.2 },
    { ...BASE, wall: '#7a7c84', grain: 0.3, blotch: 0.2, win: win({ x0: 0, y0: 0.12, x1: 1, y1: 0.92, frame: 2, frameCol: '#a8a8b0', glass: '#1e262e', sill: false, mullion: 2 }), seams: 'none', roughWall: 0.5, ribbon: true, slab: true, streaks: 0.2 },
    // 14,15 brick / old
    { ...BASE, wall: '#7a5a48', grain: 0.5, win: win({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.86, frameCol: '#d8d0c0', glass: '#2a2a30', mullion: 1 }), ac: 0.6, seams: 'brick', roughWall: 0.9, streaks: 1.2 },
    { ...BASE, wall: '#6a5650', grain: 0.5, win: win({ x0: 0.18, y0: 0.22, x1: 0.82, y1: 0.86, frameCol: '#3a3a40', glass: '#262a30' }), balcony: 0.4, ac: 0.7, seams: 'brick', roughWall: 0.9, streaks: 1.4 },
  ]
  return list
}

// ---------------------------------------------------------------- build

/** Paints every tile and uploads two textures. ~150 ms on a desktop. */
export function buildFacadeAtlas(rng: Rng, anisotropy: number): FacadeAtlas {
  const L: Layers = { a: canvas(ATLAS_W, ATLAS_H), m: canvas(ATLAS_W, ATLAS_H), h: canvas(ATLAS_W, ATLAS_H), r: canvas(ATLAS_W, ATLAS_H) }
  NOISE = L.a.createPattern(makeNoise(rng, 256, false), 'repeat')
  BLOTCH = L.a.createPattern(makeNoise(rng, 256, true), 'repeat')
  const at = (i: number): [number, number] => [(i % COLS) * TILE, Math.floor(i / COLS) * TILE]
  const specs = facadeSpecs()
  specs.forEach((s, i) => {
    const [x, y] = at(i)
    drawWall(L, x, y, s, rng)
    drawWindows(L, x, y, s, rng)
    if (s.streaks > 0) streaks(L.a, rng, x, y, TILE, TILE, 6, 0.12 * s.streaks)
  })
  for (let v = 0; v < 4; v++) drawShop(L, ...at(16 + v), v, rng)
  for (let v = 0; v < 4; v++) drawInterior(L, ...at(20 + v), v, rng)
  drawRoof(L, ...at(24), rng)
  // spare tiles: plain dark wall so a bad index never shows garbage
  for (let i = 25; i < 32; i++) drawWall(L, ...at(i), { ...BASE, wall: '#3a3a40' }, rng)

  // combine: albedo.a = mask
  const alb = L.a.getImageData(0, 0, ATLAS_W, ATLAS_H)
  const msk = L.m.getImageData(0, 0, ATLAS_W, ATLAS_H)
  for (let i = 0; i < ATLAS_W * ATLAS_H; i++) alb.data[i * 4 + 3] = msk.data[i * 4]

  // detail: normal from height (Sobel), roughness, ao (height-based cavity)
  const hgt = L.h.getImageData(0, 0, ATLAS_W, ATLAS_H).data
  const rgh = L.r.getImageData(0, 0, ATLAS_W, ATLAS_H).data
  const det = new ImageData(ATLAS_W, ATLAS_H)
  const W = ATLAS_W, H = ATLAS_H
  const hv = (x: number, y: number) => hgt[((y + H) % H) * W * 4 + ((x + W) % W) * 4]
  const strength = 2.2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // clamp inside the tile so normals don't wrap across neighbouring tiles
      const tx0 = Math.floor(x / TILE) * TILE, ty0 = Math.floor(y / TILE) * TILE
      const xl = Math.max(tx0, x - 1), xr = Math.min(tx0 + TILE - 1, x + 1)
      const yu = Math.max(ty0, y - 1), yd = Math.min(ty0 + TILE - 1, y + 1)
      const dx = (hv(xr, y) - hv(xl, y)) / 255
      const dy = (hv(x, yd) - hv(x, yu)) / 255 // canvas y down => facade v up
      let nx = -dx * strength, ny = dy * strength, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      // cavity ao: how much lower than the 5px neighbourhood
      const c = hv(x, y)
      const nb = (hv(Math.max(tx0, x - 5), y) + hv(Math.min(tx0 + TILE - 1, x + 5), y) + hv(x, Math.max(ty0, y - 5)) + hv(x, Math.min(ty0 + TILE - 1, y + 5))) / 4
      const ao = Math.max(0.35, Math.min(1, 1 - (nb - c) / 255 * 2.2))
      const o = (y * W + x) * 4
      det.data[o] = (nx * 0.5 + 0.5) * 255
      det.data[o + 1] = (ny * 0.5 + 0.5) * 255
      det.data[o + 2] = rgh[o]
      det.data[o + 3] = ao * 255
    }
  }
  // DataTextures: a canvas would premultiply RGB by the mask alpha and lose the wall colour.
  const albedo = dataTex(alb.data, SRGBColorSpace, anisotropy)
  const detail = dataTex(det.data, NoColorSpace, anisotropy)
  return { albedo, detail }
}

function dataTex(data: Uint8ClampedArray, colorSpace: string, anisotropy: number): DataTexture {
  const t = new DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ATLAS_W, ATLAS_H, RGBAFormat, UnsignedByteType)
  t.colorSpace = colorSpace as typeof SRGBColorSpace
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = true
  t.anisotropy = anisotropy
  t.flipY = false
  t.needsUpdate = true
  return t
}
