import './style.css'
import { Framebuffer } from './core/framebuffer'
import { buildLUT, pal } from './core/palette'
import { drawText } from './core/font'
import { startLoop } from './core/loop'
import { renderRoad, applyLighting, makeStats, ditherSpan, type View } from './road/render'
import { renderSky, initSky } from './world/sky'
import { getBackground, renderBackground } from './world/background'
import { World } from './world/world'
import { Rain } from './world/weather'
import { drawCockpit } from './cockpit/cockpit'
import { AdRegistry } from './ads/registry'
import { AdOverlay } from './ads/overlay'
import { DriveAudio } from './audio'
import { loadSettings, mountSettings, resolveTime, type Settings } from './ui/settings'
import { W, H, DRAW_DIST, REAR_DRAW_DIST, DASH_TOP, CAM_H, FOV, MIRROR_REAR, MIRROR_SIDE, SEG_LEN, SPEED_CRUISE, type TimePreset } from './tokens'

const HORIZON = 96
const DEBUG = new URLSearchParams(location.search).get('debug') === '1'

// ------------------------------------------------------------------ DOM
const stage = document.getElementById('stage') as HTMLDivElement
const canvas = document.getElementById('view') as HTMLCanvasElement
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d', { alpha: false })!
const image = ctx.createImageData(W, H)
const pixels = new Uint32Array(image.data.buffer)

let scale = 1
let portrait = false
let lastVw = 0, lastVh = 0
function resize(): void {
  const vw = window.innerWidth, vh = window.innerHeight
  lastVw = vw
  lastVh = vh
  // Portrait phones: rotate the stage 90deg and fit the swapped box.
  portrait = vh > vw * 1.15
  const aw = portrait ? vh : vw, ah = portrait ? vw : vh
  scale = Math.max(1, Math.floor(Math.min(aw / W, ah / H)))
  stage.style.width = `${W * scale}px`
  stage.style.height = `${H * scale}px`
  stage.classList.toggle('portrait', portrait)
  document.documentElement.style.setProperty('--s', String(scale))
  overlay.layout(scale, portrait)
}

// ------------------------------------------------------------- state
let settings: Settings = loadSettings()
let preset: TimePreset = resolveTime(settings.time)
let lut = buildLUT(preset)

const ads = new AdRegistry()
ads.enabled = settings.ads
const overlay = new AdOverlay(stage)
overlay.enabled = settings.ads
const rain = new Rain()
const audio = new DriveAudio()

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

function applyPreset(p: TimePreset): void {
  if (p === preset) return
  preset = p
  lut = buildLUT(preset)
}

function applySettings(s: Settings, rebuild: boolean): void {
  settings = s
  applyPreset(resolveTime(s.time))
  ads.enabled = s.ads
  overlay.enabled = s.ads
  rain.active = s.weather === 'rain'
  audio.setEnabled(s.sound)
  audio.setRain(s.weather === 'rain')
  if (s.sound) audio.start()
  document.body.classList.toggle('crt', s.crt)
  if (rebuild) world = makeWorld()
  else world.cfg.speedMul = s.speed
}

mountSettings(document.getElementById('ui')!, settings, applySettings)
document.body.classList.toggle('crt', settings.crt)
rain.active = settings.weather === 'rain'
audio.enabled = settings.sound
audio.setRain(settings.weather === 'rain')
window.addEventListener('resize', resize)
resize()
ads.load('ads/manifest.json').then(() => {
  // Rebuild so early chunks also get stamped content.
  world = makeWorld()
})

// Audio needs a user gesture; start (or resume) on the first one.
const gesture = () => {
  if (settings.sound) audio.start()
}
document.addEventListener('pointerdown', gesture)
document.addEventListener('keydown', gesture)

// Clock-driven presets (auto / cycle)
setInterval(() => {
  if (settings.time === 'auto' || settings.time === 'cycle') applyPreset(resolveTime(settings.time))
}, 1000)

// -------------------------------------------------------------- render
function fogFor(p: TimePreset): number {
  return pal('far', p === 'night' ? 1 : 3)
}

function view(dir: 1 | -1, horizon: number, bottom: number, drawDist: number, xShift = 0): View {
  const foggy = settings.weather === 'fog'
  const rainy = settings.weather === 'rain'
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
    fogStrength: foggy ? 2.2 : rainy ? 1.3 : preset === 'night' ? 1 : 0.8,
    fogStart: foggy ? 0.08 : rainy ? 0.3 : 0.45,
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

let frameMs = 0
let fps = 0
let fpsAcc = 0, fpsCount = 0, fpsLast = performance.now()

function render(): void {
  const t0 = performance.now()
  // Some embeds never fire `resize`; poll cheaply.
  if (window.innerWidth !== lastVw || window.innerHeight !== lastVh) resize()
  const lit = preset !== 'day'
  const foggy = settings.weather === 'fog'
  // sky + background
  renderSky(fb, preset, HORIZON, world.bgOffset, world.tick)
  const bg = getBackground(world.biome, settings.seed, lit)
  renderBackground(fb, bg, HORIZON, world.bgOffset)
  if (foggy || settings.weather === 'rain') {
    // Haze over the distant layers: heavier near the horizon.
    const fog = fogFor(preset)
    const depth = foggy ? 44 : 20
    for (let y = HORIZON - depth; y < HORIZON; y++) {
      const lvl = Math.round(((y - (HORIZON - depth)) / depth) * (foggy ? 16 : 10))
      ditherSpan(fb, 0, W - 1, y, fog, lvl)
    }
  }
  fb.fillRect(0, HORIZON, W, DASH_TOP + 4 - HORIZON, fogFor(preset))
  // road
  const v = view(1, HORIZON, DASH_TOP + 4, DRAW_DIST)
  renderRoad(fb, world, v, stats)
  applyLighting(fb, stats, v, DASH_TOP + 4)
  overlay.draw(fb, world.tick)
  rain.draw(fb, preset)
  // mirrors
  renderMirror(rearFb, rearStats, 0)
  renderMirror(sideFb, sideStats, 0.9)
  // cockpit
  drawCockpit(
    fb,
    {
      speedKmh: (world.speed / SPEED_CRUISE) * 96,
      rpm: 0.28 + (world.speed / SPEED_CRUISE) * 0.22 + Math.sin(world.tick / 7) * 0.01,
      steer: world.steer,
      signal: world.signal,
      tick: world.tick,
      preset,
    },
    { rear: rearFb, side: sideFb },
  )
  if (DEBUG) {
    drawText(fb, 40, 6, `${fps} FPS ${frameMs.toFixed(1)}MS`, pal('ui', 4))
    drawText(fb, 40, 13, `SEG ${world.baseIndex} ${world.biome.toUpperCase()} ${world.base.kind.toUpperCase()}`, pal('ui', 3))
  }
  fb.present(pixels, lut)
  ctx.putImageData(image, 0, 0)
  const t1 = performance.now()
  frameMs = frameMs * 0.9 + (t1 - t0) * 0.1
  fpsAcc += t1 - fpsLast
  fpsLast = t1
  fpsCount++
  if (fpsAcc >= 1000) {
    fps = Math.round((fpsCount * 1000) / fpsAcc)
    fpsAcc = 0
    fpsCount = 0
  }
}

function update(dt: number): void {
  world.update(dt)
  overlay.update(world.onWall)
  rain.update()
  if (world.tick % 10 === 0) audio.setSpeed(world.speed / SPEED_CRUISE)
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
      if (!r || !p.adUrl) continue
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h && py < seg.clip) return { url: p.adUrl }
    }
  }
  return null
}

/** Client coords -> backbuffer pixel, accounting for the portrait rotation. */
function toBuffer(e: MouseEvent): [number, number] {
  const rect = stage.getBoundingClientRect()
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
  const sx = e.clientX - cx, sy = e.clientY - cy
  let u: number, vv: number
  if (portrait) {
    u = sy + (W * scale) / 2
    vv = -sx + (H * scale) / 2
  } else {
    u = sx + (W * scale) / 2
    vv = sy + (H * scale) / 2
  }
  return [Math.floor(u / scale), Math.floor(vv / scale)]
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
  get settings() { return settings },
  overlay,
  rain,
  audio,
  segLen: SEG_LEN,
  warp: (n: number) => world.warp(n),
  warpToWall: () => world.warpToWall(),
  warpTo: (kind: string) => world.warpToKind(kind),
}
