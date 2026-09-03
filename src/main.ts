import './style.css'
import { Framebuffer } from './core/framebuffer'
import { buildLUT, pal } from './core/palette'
import { startLoop } from './core/loop'
import { renderRoad, applyLighting, makeStats, type View } from './road/render'
import { renderSky, initSky } from './world/sky'
import { getBackground, renderBackground } from './world/background'
import { World } from './world/world'
import { drawCockpit } from './cockpit/cockpit'
import { AdRegistry } from './ads/registry'
import { AdOverlay } from './ads/overlay'
import { loadSettings, mountSettings, resolveTime, type Settings } from './ui/settings'
import { W, H, DRAW_DIST, REAR_DRAW_DIST, DASH_TOP, CAM_H, FOV, MIRROR_REAR, MIRROR_SIDE, SEG_LEN, type TimePreset } from './tokens'

const HORIZON = 96

// ------------------------------------------------------------------ DOM
const stage = document.getElementById('stage') as HTMLDivElement
const canvas = document.getElementById('view') as HTMLCanvasElement
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d', { alpha: false })!
const image = ctx.createImageData(W, H)
const pixels = new Uint32Array(image.data.buffer)

let scale = 1
let lastVw = 0, lastVh = 0
function resize(): void {
  const vw = window.innerWidth, vh = window.innerHeight
  lastVw = vw
  lastVh = vh
  scale = Math.max(1, Math.floor(Math.min(vw / W, vh / H)))
  stage.style.width = `${W * scale}px`
  stage.style.height = `${H * scale}px`
  document.documentElement.style.setProperty('--s', String(scale))
  overlay.layout(scale)
}

// ------------------------------------------------------------- state
let settings: Settings = loadSettings()
let preset: TimePreset = resolveTime(settings.time)
let lut = buildLUT(preset)

const ads = new AdRegistry()
ads.enabled = settings.ads
const overlay = new AdOverlay(stage)
overlay.enabled = settings.ads

const fb = new Framebuffer(W, H)
const rearFb = new Framebuffer(MIRROR_REAR.w, MIRROR_REAR.h)
const sideFb = new Framebuffer(MIRROR_SIDE.w, MIRROR_SIDE.h)
const stats = makeStats(H)
const rearStats = makeStats(MIRROR_REAR.h)
const sideStats = makeStats(MIRROR_SIDE.h)

let world = makeWorld()
function makeWorld(): World {
  initSky(settings.seed)
  return new World({ seed: settings.seed, biome: settings.biome, speedMul: settings.speed }, ads)
}

function applySettings(s: Settings, rebuild: boolean): void {
  settings = s
  preset = resolveTime(s.time)
  lut = buildLUT(preset)
  ads.enabled = s.ads
  overlay.enabled = s.ads
  document.body.classList.toggle('crt', s.crt)
  if (rebuild) world = makeWorld()
  else world.cfg.speedMul = s.speed
}

mountSettings(document.getElementById('ui')!, settings, applySettings)
document.body.classList.toggle('crt', settings.crt)
window.addEventListener('resize', resize)
resize()
ads.load('ads/manifest.json').then(() => {
  // Rebuild so early chunks also get stamped content.
  world = makeWorld()
})

// Time preset may change with the clock when set to auto
setInterval(() => {
  if (settings.time === 'auto') {
    const p = resolveTime('auto')
    if (p !== preset) {
      preset = p
      lut = buildLUT(preset)
    }
  }
}, 60_000)

// -------------------------------------------------------------- render
function fogFor(p: TimePreset): number {
  return pal('far', p === 'night' ? 1 : 3)
}

function view(dir: 1 | -1, horizon: number, bottom: number, drawDist: number, xShift = 0): View {
  return {
    position: world.position,
    playerX: world.playerX + xShift,
    dir,
    drawDist,
    camH: CAM_H,
    fov: FOV,
    horizon,
    bottom,
    preset,
    fogColor: fogFor(preset),
    fogStrength: preset === 'night' ? 1 : 0.8,
    tick: world.tick,
  }
}

function renderMirror(target: Framebuffer, st: ReturnType<typeof makeStats>, xShift: number): void {
  const horizon = Math.round(target.h * 0.45)
  renderSky(target, preset, horizon, world.bgOffset, world.tick, false)
  target.fillRect(0, horizon, target.w, target.h - horizon, fogFor(preset))
  const v = view(-1, horizon, target.h, REAR_DRAW_DIST, xShift)
  v.fov = 110
  renderRoad(target, world, v, st)
  applyLighting(target, st, v, target.h)
}

function render(): void {
  // Some embeds never fire `resize`; poll cheaply.
  if (window.innerWidth !== lastVw || window.innerHeight !== lastVh) resize()
  const lit = preset !== 'day'
  // sky + background
  renderSky(fb, preset, HORIZON, world.bgOffset, world.tick)
  const bg = getBackground(world.biome, settings.seed, lit)
  renderBackground(fb, bg, HORIZON, world.bgOffset)
  fb.fillRect(0, HORIZON, W, DASH_TOP + 4 - HORIZON, fogFor(preset))
  // road
  const v = view(1, HORIZON, DASH_TOP + 4, DRAW_DIST)
  renderRoad(fb, world, v, stats)
  applyLighting(fb, stats, v, DASH_TOP + 4)
  overlay.draw(fb, world.tick)
  // mirrors
  renderMirror(rearFb, rearStats, 0)
  renderMirror(sideFb, sideStats, 0.9)
  // cockpit
  drawCockpit(
    fb,
    {
      speedKmh: (world.speed / 7200) * 96,
      rpm: 0.28 + (world.speed / 7200) * 0.22 + Math.sin(world.tick / 7) * 0.01,
      steer: world.steer,
      signal: world.signal,
      tick: world.tick,
      preset,
    },
    { rear: rearFb, side: sideFb },
  )
  fb.present(pixels, lut)
  ctx.putImageData(image, 0, 0)
}

function update(dt: number): void {
  world.update(dt)
  overlay.update(world.onWall)
}

startLoop(update, render)

// ------------------------------------------------------- ad clicks
function propAt(px: number, py: number): { url: string } | null {
  const b = world.baseIndex
  for (let i = 0; i < DRAW_DIST; i++) {
    const seg = world.segments[b + i - world.first]
    if (!seg) break
    for (const p of seg.props) {
      const r = p.adRect
      const url = (p as { adUrl?: string }).adUrl
      if (!r || !url) continue
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h && py < seg.clip) return { url }
    }
  }
  return null
}

function toBuffer(e: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect()
  return [Math.floor(((e.clientX - rect.left) / rect.width) * W), Math.floor(((e.clientY - rect.top) / rect.height) * H)]
}

canvas.addEventListener('mousemove', (e) => {
  const [x, y] = toBuffer(e)
  canvas.style.cursor = propAt(x, y) ? 'pointer' : 'default'
})
canvas.addEventListener('click', (e) => {
  const [x, y] = toBuffer(e)
  const hit = propAt(x, y)
  if (hit) window.open(hit.url, '_blank', 'noopener')
})

// Debug helpers
;(window as unknown as { nd: unknown }).nd = {
  get world() { return world },
  get preset() { return preset },
  overlay,
  segLen: SEG_LEN,
  warp: (n: number) => world.warp(n),
  warpToWall: () => world.warpToWall(),
}
