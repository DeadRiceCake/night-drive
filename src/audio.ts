/**
 * Procedural engine / road / rain audio with Web Audio. Nothing is loaded
 * from disk. The context is created on the first user gesture.
 */
export class DriveAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineGain: GainNode | null = null
  private osc: OscillatorNode[] = []
  private roadGain: GainNode | null = null
  private rainGain: GainNode | null = null
  private wantRain = false
  private speed = 1
  enabled = false

  /** Create the graph (must be called from a user gesture). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master

    // Engine: two detuned saws through a lowpass, a little vibrato.
    const engineGain = ctx.createGain()
    engineGain.gain.value = 0.18
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 2
    engineGain.connect(lp).connect(master)
    for (const [type, mul] of [['sawtooth', 1], ['square', 0.5], ['sawtooth', 2.01]] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = 60 * mul
      const g = ctx.createGain()
      g.gain.value = mul === 2.01 ? 0.25 : mul === 0.5 ? 0.35 : 0.6
      o.connect(g).connect(engineGain)
      o.start()
      this.osc.push(o)
    }
    this.engineGain = engineGain

    // Road / wind: brown-ish noise through a lowpass.
    const noise = this.noiseSource(ctx)
    const roadLp = ctx.createBiquadFilter()
    roadLp.type = 'lowpass'
    roadLp.frequency.value = 500
    const roadGain = ctx.createGain()
    roadGain.gain.value = 0.35
    noise.connect(roadLp).connect(roadGain).connect(master)
    this.roadGain = roadGain

    // Rain: noise through a bandpass, gated by weather.
    const rainNoise = this.noiseSource(ctx)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3200
    bp.Q.value = 0.6
    const rainGain = ctx.createGain()
    rainGain.gain.value = 0
    rainNoise.connect(bp).connect(rainGain).connect(master)
    this.rainGain = rainGain

    this.setEnabled(this.enabled)
    this.setRain(this.wantRain)
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.04 * white) / 1.04
      d[i] = last * 4
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start()
    return src
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.linearRampToValueAtTime(on ? 0.6 : 0, t + 0.4)
    if (on) void this.ctx.resume()
  }

  /** speedNorm ~ 1 at cruise. */
  setSpeed(speedNorm: number): void {
    this.speed = speedNorm
    if (!this.ctx) return
    const base = 48 + 44 * speedNorm
    const t = this.ctx.currentTime
    const muls = [1, 0.5, 2.01]
    this.osc.forEach((o, i) => o.frequency.setTargetAtTime(base * muls[i], t, 0.2))
    this.roadGain?.gain.setTargetAtTime(0.2 + 0.25 * speedNorm, t, 0.3)
    this.engineGain?.gain.setTargetAtTime(0.12 + 0.08 * speedNorm, t, 0.3)
  }

  setRain(on: boolean): void {
    this.wantRain = on
    if (!this.ctx || !this.rainGain) return
    this.rainGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.8)
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  get currentSpeed(): number {
    return this.speed
  }
}
