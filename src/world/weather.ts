import { Framebuffer } from '../core/framebuffer'
import { pal } from '../core/palette'
import { mulberry32 } from '../core/rng'
import { DASH_TOP, W, type TimePreset } from '../tokens'

export type Weather = 'clear' | 'rain' | 'fog'

interface Drop {
  x: number
  y: number
  len: number
  speed: number
}

/**
 * Rain streaks on the windshield plus two wiper blades. Everything is drawn
 * with integer lines; the wipers sweep in discrete angle steps.
 */
export class Rain {
  private drops: Drop[] = []
  private rng = mulberry32(0xa1b2)
  private wiperT = 0
  active = false

  constructor(count = 90) {
    for (let i = 0; i < count; i++) this.drops.push(this.spawn(true))
  }

  private spawn(anywhere: boolean): Drop {
    return {
      x: this.rng.int(-10, W + 10),
      y: anywhere ? this.rng.int(0, DASH_TOP) : this.rng.int(-12, 0),
      len: this.rng.int(3, 7),
      speed: this.rng.int(3, 6),
    }
  }

  update(): void {
    if (!this.active) return
    this.wiperT = (this.wiperT + 1) % 120
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]
      d.y += d.speed
      d.x -= 1
      if (d.y > DASH_TOP) this.drops[i] = this.spawn(false)
    }
  }

  /** Wiper blade angle (radians) — sweeps left/right with a hold at the ends. */
  private wiperAngle(): number {
    const t = this.wiperT / 120
    const s = t < 0.5 ? t * 2 : 2 - t * 2
    const eased = s < 0.1 ? 0 : s > 0.9 ? 1 : (s - 0.1) / 0.8
    return Math.PI * (0.88 - 0.72 * eased)
  }

  draw(fb: Framebuffer, preset: TimePreset): void {
    if (!this.active) return
    const col = preset === 'day' ? pal('lightCool', 0) : pal('sky', 4)
    for (const d of this.drops) {
      fb.line(d.x, d.y, d.x - (d.len >> 2), d.y + d.len, col)
    }
    // wipers: pivots near the dash, blades sweep upward
    const a = this.wiperAngle()
    for (const px of [104, 226]) {
      const py = DASH_TOP + 2
      const len = 62
      const x1 = Math.round(px + Math.cos(a) * len)
      const y1 = Math.round(py - Math.sin(a) * len)
      fb.line(px - 1, py, x1 - 1, y1, pal('cockpit', 2))
      fb.line(px, py, x1, y1, pal('cockpit', 0))
      fb.line(px + 1, py, x1 + 1, y1, pal('cockpit', 0))
    }
  }
}
