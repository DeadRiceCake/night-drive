import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { drawText } from '../core/font'
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
  fb.disc(cx, cy, r + 2, C(0))
  fb.circle(cx, cy, r + 2, C(2))
  const start = (225 * Math.PI) / 180
  const sweep = (-270 * Math.PI) / 180
  const tickCol = lit ? G(1) : G(0)
  for (let i = 0; i <= 10; i++) {
    const a = start + sweep * (i / 10)
    const major = i % 5 === 0
    const x0 = Math.round(cx + Math.cos(a) * (r - (major ? 4 : 2)))
    const y0 = Math.round(cy - Math.sin(a) * (r - (major ? 4 : 2)))
    const x1 = Math.round(cx + Math.cos(a) * r)
    const y1 = Math.round(cy - Math.sin(a) * r)
    fb.line(x0, y0, x1, y1, major ? (lit ? G(2) : G(1)) : tickCol)
  }
  // red zone for rpm
  if (label === 'RPM') {
    for (let i = 8; i <= 10; i++) {
      const a = start + sweep * (i / 10)
      fb.px(Math.round(cx + Math.cos(a) * (r - 1)), Math.round(cy - Math.sin(a) * (r - 1)), pal('tail', 2))
    }
  }
  const a = start + sweep * Math.max(0, Math.min(1, value))
  fb.line(cx, cy, Math.round(cx + Math.cos(a) * (r - 3)), Math.round(cy - Math.sin(a) * (r - 3)), pal('tail', 2))
  fb.disc(cx, cy, 2, C(3))
  drawText(fb, cx - 5, cy + 5, label, lit ? G(1) : G(0))
}

function pillars(fb: Framebuffer): void {
  // Roof edge
  fb.fillRect(0, 0, W, 3, C(0))
  fb.hline(0, W - 1, 3, C(1))
  // Left A-pillar: wide at top, tapering down-left
  for (let y = 0; y < DASH_TOP; y++) {
    const wLeft = Math.max(2, Math.round(34 - y * 0.26))
    fb.hline(0, wLeft - 1, y, C(1))
    fb.px(wLeft - 1, y, C(2))
    fb.px(0, y, C(0))
    const wRight = Math.max(2, Math.round(20 - y * 0.15))
    fb.hline(W - wRight, W - 1, y, C(1))
    fb.px(W - wRight, y, C(2))
  }
}

function dashboard(fb: Framebuffer, st: CockpitState, lit: boolean): void {
  // Dash top has a gentle bulge toward the centre
  for (let x = 0; x < W; x++) {
    const bulge = Math.round(3 * Math.cos(((x - W / 2) / W) * Math.PI))
    const top = DASH_TOP - bulge
    fb.vline(x, top, H - 1, C(1))
    fb.px(x, top, C(3))
    fb.px(x, top + 1, C(2))
  }
  fb.fillRect(0, H - 8, W, 8, C(0))

  // Instrument hood
  const hx = 92, hy = DASH_TOP + 2, hw = 136, hh = H - hy
  fb.fillRect(hx, hy, hw, hh, C(0))
  fb.hline(hx, hx + hw - 1, hy, C(3))
  fb.vline(hx, hy, H - 1, C(2))
  fb.vline(hx + hw - 1, hy, H - 1, C(2))
  fb.fillRect(hx + 4, hy + 4, hw - 8, hh - 8, C(1))

  // Gauges
  gauge(fb, 126, DASH_TOP + 28, 17, Math.min(1, st.speedKmh / 220), lit, 'KMH')
  gauge(fb, 194, DASH_TOP + 28, 17, st.rpm, lit, 'RPM')

  // Center readouts: digital speed + small bars
  const cx = 160
  fb.fillRect(cx - 14, DASH_TOP + 10, 28, 9, C(0))
  const spd = String(Math.round(st.speedKmh)).padStart(3, ' ')
  drawText(fb, cx - 6, DASH_TOP + 12, spd, lit ? G(2) : G(1))
  // fuel / temp bars
  for (let i = 0; i < 2; i++) {
    const bx = cx - 10 + i * 14
    fb.fillRect(bx, DASH_TOP + 22, 6, 12, C(0))
    const level = i === 0 ? 8 : 6
    fb.fillRect(bx + 1, DASH_TOP + 22 + 12 - level, 4, level, lit ? G(1) : G(0))
  }
  // Warning / indicator lights
  const on = Math.floor(st.tick / BLINK_TICKS) % 2 === 0
  const sigL = st.signal === -1 && on
  const sigR = st.signal === 1 && on
  const green = pal('veg', 3), dim = C(2)
  // left arrow
  fb.px(cx - 8, DASH_TOP + 38, sigL ? green : dim)
  fb.hline(cx - 8, cx - 5, DASH_TOP + 39, sigL ? green : dim)
  fb.px(cx - 8, DASH_TOP + 40, sigL ? green : dim)
  // right arrow
  fb.px(cx + 8, DASH_TOP + 38, sigR ? green : dim)
  fb.hline(cx + 5, cx + 8, DASH_TOP + 39, sigR ? green : dim)
  fb.px(cx + 8, DASH_TOP + 40, sigR ? green : dim)
  // headlight indicator (night) and a couple of dim icons
  fb.fillRect(cx - 2, DASH_TOP + 38, 4, 3, lit ? pal('lightCool', 1) : dim)

  // Vents and buttons on the dash sides
  for (let i = 0; i < 3; i++) fb.hline(48, 78, DASH_TOP + 12 + i * 4, C(0))
  for (let i = 0; i < 3; i++) fb.hline(242, 272, DASH_TOP + 12 + i * 4, C(0))
  for (let i = 0; i < 4; i++) fb.fillRect(246 + i * 8, DASH_TOP + 30, 5, 5, lit ? (i === 1 ? G(1) : C(3)) : C(2))
}

function wheel(fb: Framebuffer, steer: number): void {
  const cx = 160, cy = H + 18, r = 52
  // rim: a thick ring
  for (let k = 0; k < 5; k++) fb.circle(cx, cy, r - k, k === 0 ? C(3) : k === 4 ? C(0) : C(2))
  // spokes at 9 o'clock, 3 o'clock and 6 o'clock, rotated by steer
  const spokes = [Math.PI, 0, Math.PI / 2]
  for (const a0 of spokes) {
    const a = a0 + steer
    const x1 = Math.round(cx + Math.cos(a) * (r - 4))
    const y1 = Math.round(cy + Math.sin(a) * (r - 4))
    for (let o = -2; o <= 2; o++) {
      const ox = Math.round(Math.cos(a + Math.PI / 2) * o)
      const oy = Math.round(Math.sin(a + Math.PI / 2) * o)
      fb.line(cx + ox, cy + oy, x1 + ox, y1 + oy, Math.abs(o) === 2 ? C(0) : C(2))
    }
  }
  fb.disc(cx, cy, 12, C(2))
  fb.circle(cx, cy, 12, C(0))
}

function mirrorFrame(fb: Framebuffer, x: number, y: number, w: number, h: number, stalkUp: boolean): void {
  fb.fillRect(x - 2, y - 2, w + 4, h + 4, C(0))
  fb.rect(x - 2, y - 2, w + 4, h + 4, C(2))
  if (stalkUp) fb.fillRect(x + (w >> 1) - 1, 3, 2, y - 3, C(0))
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
  fb.fillRect(0, MIRROR_SIDE.y + MIRROR_SIDE.h + 2, MIRROR_SIDE.w + 6, 4, C(2))
  wheel(fb, st.steer)
}
