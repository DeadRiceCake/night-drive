import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { drawText, textSprite } from '../core/font'
import { DASH_TOP, H, MIRROR_REAR, MIRROR_SIDE, W, BLINK_TICKS, type TimePreset } from '../tokens'

export interface CockpitState {
  speedKmh: number
  rpm: number // 0..1
  steer: number // radians
  signal: number // -1 | 0 | 1
  tick: number
  preset: TimePreset
}

const C = (s: number) => pal('cockpit', s)
const G = (s: number) => pal('gauge', s)

/** Draws a gauge dial with ticks and a needle. `value` in 0..1. */
function gauge(fb: Framebuffer, cx: number, cy: number, r: number, value: number, lit: boolean, label: string): void {
  fb.disc(cx, cy, r + 3, C(0))
  fb.circle(cx, cy, r + 3, C(2))
  const start = (225 * Math.PI) / 180
  const sweep = (-270 * Math.PI) / 180
  const tickCol = lit ? G(1) : G(0)
  for (let i = 0; i <= 10; i++) {
    const a = start + sweep * (i / 10)
    const major = i % 5 === 0
    const inner = r - (major ? 6 : 3)
    const x0 = Math.round(cx + Math.cos(a) * inner)
    const y0 = Math.round(cy - Math.sin(a) * inner)
    const x1 = Math.round(cx + Math.cos(a) * r)
    const y1 = Math.round(cy - Math.sin(a) * r)
    fb.line(x0, y0, x1, y1, major ? (lit ? G(2) : G(1)) : tickCol)
  }
  // red zone for rpm
  if (label === 'RPM') {
    for (let i = 8; i <= 10; i++) {
      const a = start + sweep * (i / 10)
      fb.px(Math.round(cx + Math.cos(a) * (r - 1)), Math.round(cy - Math.sin(a) * (r - 1)), pal('tail', 2))
      fb.px(Math.round(cx + Math.cos(a) * (r - 2)), Math.round(cy - Math.sin(a) * (r - 2)), pal('tail', 2))
    }
  }
  const a = start + sweep * Math.max(0, Math.min(1, value))
  const nx = Math.round(cx + Math.cos(a) * (r - 4))
  const ny = Math.round(cy - Math.sin(a) * (r - 4))
  fb.line(cx, cy, nx, ny, pal('tail', 2))
  fb.line(cx + 1, cy, nx + 1, ny, pal('tail', 1))
  fb.disc(cx, cy, 3, C(3))
  drawText(fb, cx - 5, cy + 8, label, lit ? G(1) : G(0))
}

function pillars(fb: Framebuffer): void {
  // Roof edge
  fb.fillRect(0, 0, W, 5, C(0))
  fb.hline(0, W - 1, 5, C(1))
  // Left A-pillar: wide at top, tapering down-left
  for (let y = 0; y < DASH_TOP; y++) {
    const wLeft = Math.max(3, Math.round(51 - y * 0.26))
    fb.hline(0, wLeft - 1, y, C(1))
    fb.px(wLeft - 1, y, C(2))
    fb.px(0, y, C(0))
    const wRight = Math.max(3, Math.round(30 - y * 0.15))
    fb.hline(W - wRight, W - 1, y, C(1))
    fb.px(W - wRight, y, C(2))
  }
}

function dashboard(fb: Framebuffer, st: CockpitState, lit: boolean): void {
  // Dash top has a gentle bulge toward the centre
  for (let x = 0; x < W; x++) {
    const bulge = Math.round(4 * Math.cos(((x - W / 2) / W) * Math.PI))
    const top = DASH_TOP - bulge
    fb.vline(x, top, H - 1, C(1))
    fb.px(x, top, C(3))
    fb.px(x, top + 1, C(2))
  }
  fb.fillRect(0, H - 12, W, 12, C(0))

  // Instrument hood
  const hx = 138, hy = DASH_TOP + 3, hw = 204, hh = H - hy
  fb.fillRect(hx, hy, hw, hh, C(0))
  fb.hline(hx, hx + hw - 1, hy, C(3))
  fb.vline(hx, hy, H - 1, C(2))
  fb.vline(hx + hw - 1, hy, H - 1, C(2))
  fb.fillRect(hx + 6, hy + 6, hw - 12, hh - 12, C(1))

  // Gauges
  const gy = DASH_TOP + 42
  gauge(fb, 189, gy, 25, Math.min(1, st.speedKmh / 220), lit, 'KMH')
  gauge(fb, 291, gy, 25, st.rpm, lit, 'RPM')

  // Center readouts: digital speed (2x font) + small bars
  const cx = 240
  fb.fillRect(cx - 21, DASH_TOP + 14, 42, 14, C(0))
  const spd = String(Math.round(st.speedKmh)).padStart(3, ' ')
  const ts = textSprite(spd, lit ? G(2) : G(1))
  fb.blitScaled(ts, cx - ts.w, DASH_TOP + 16, ts.w * 2, ts.h * 2)
  // fuel / temp bars
  for (let i = 0; i < 2; i++) {
    const bx = cx - 15 + i * 21
    fb.fillRect(bx, DASH_TOP + 33, 9, 18, C(0))
    const level = i === 0 ? 12 : 9
    fb.fillRect(bx + 2, DASH_TOP + 33 + 18 - level, 5, level, lit ? G(1) : G(0))
  }
  // Warning / indicator lights
  const on = Math.floor(st.tick / BLINK_TICKS) % 2 === 0
  const sigL = st.signal === -1 && on
  const sigR = st.signal === 1 && on
  const green = pal('veg', 3), dim = C(2)
  const ay = DASH_TOP + 58
  // left arrow
  fb.px(cx - 13, ay, sigL ? green : dim)
  fb.px(cx - 12, ay - 1, sigL ? green : dim)
  fb.px(cx - 12, ay + 1, sigL ? green : dim)
  fb.hline(cx - 12, cx - 7, ay, sigL ? green : dim)
  // right arrow
  fb.px(cx + 13, ay, sigR ? green : dim)
  fb.px(cx + 12, ay - 1, sigR ? green : dim)
  fb.px(cx + 12, ay + 1, sigR ? green : dim)
  fb.hline(cx + 7, cx + 12, ay, sigR ? green : dim)
  // headlight indicator (night)
  fb.fillRect(cx - 3, ay - 1, 6, 3, lit ? pal('lightCool', 1) : dim)

  // Vents and buttons on the dash sides
  for (let i = 0; i < 3; i++) fb.hline(72, 117, DASH_TOP + 18 + i * 6, C(0))
  for (let i = 0; i < 3; i++) fb.hline(363, 408, DASH_TOP + 18 + i * 6, C(0))
  for (let i = 0; i < 4; i++) fb.fillRect(369 + i * 12, DASH_TOP + 45, 7, 7, lit ? (i === 1 ? G(1) : C(3)) : C(2))
}

function wheel(fb: Framebuffer, steer: number): void {
  const cx = 240, cy = H + 27, r = 78
  // rim: a thick ring
  for (let k = 0; k < 7; k++) fb.circle(cx, cy, r - k, k === 0 ? C(3) : k === 6 ? C(0) : C(2))
  // spokes at 9 o'clock, 3 o'clock and 6 o'clock, rotated by steer
  const spokes = [Math.PI, 0, Math.PI / 2]
  for (const a0 of spokes) {
    const a = a0 + steer
    const x1 = Math.round(cx + Math.cos(a) * (r - 6))
    const y1 = Math.round(cy + Math.sin(a) * (r - 6))
    for (let o = -3; o <= 3; o++) {
      const ox = Math.round(Math.cos(a + Math.PI / 2) * o)
      const oy = Math.round(Math.sin(a + Math.PI / 2) * o)
      fb.line(cx + ox, cy + oy, x1 + ox, y1 + oy, Math.abs(o) === 3 ? C(0) : C(2))
    }
  }
  fb.disc(cx, cy, 18, C(2))
  fb.circle(cx, cy, 18, C(0))
}

function mirrorFrame(fb: Framebuffer, x: number, y: number, w: number, h: number, stalkUp: boolean): void {
  fb.fillRect(x - 3, y - 3, w + 6, h + 6, C(0))
  fb.rect(x - 3, y - 3, w + 6, h + 6, C(2))
  if (stalkUp) fb.fillRect(x + (w >> 1) - 1, 5, 3, y - 5, C(0))
}

export interface MirrorViews {
  rear: Framebuffer
  side: Framebuffer
}

export function drawCockpit(fb: Framebuffer, st: CockpitState, mirrors: MirrorViews): void {
  const lit = st.preset !== 'day'
  pillars(fb)
  // rear-view mirror
  mirrorFrame(fb, MIRROR_REAR.x, MIRROR_REAR.y, MIRROR_REAR.w, MIRROR_REAR.h, true)
  fb.blitFb(mirrors.rear, MIRROR_REAR.x, MIRROR_REAR.y, true)
  dashboard(fb, st, lit)
  // side mirror (left, housed on the door)
  mirrorFrame(fb, MIRROR_SIDE.x, MIRROR_SIDE.y, MIRROR_SIDE.w, MIRROR_SIDE.h, false)
  fb.blitFb(mirrors.side, MIRROR_SIDE.x, MIRROR_SIDE.y, true)
  fb.fillRect(0, MIRROR_SIDE.y + MIRROR_SIDE.h + 3, MIRROR_SIDE.w + 9, 6, C(2))
  wheel(fb, st.steer)
}
