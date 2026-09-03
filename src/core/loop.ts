import { TICK } from '../tokens'

/**
 * Fixed-timestep loop: `update` runs at exactly 60Hz, `render` once per
 * animation frame. Pauses when the tab is hidden.
 */
export function startLoop(update: (dt: number) => void, render: () => void): { stop(): void } {
  let last = performance.now()
  let acc = 0
  let raf = 0
  let running = true
  const MAX_FRAME = 0.25

  const frame = (now: number) => {
    if (!running) return
    let dt = (now - last) / 1000
    last = now
    if (dt > MAX_FRAME) dt = MAX_FRAME
    acc += dt
    let steps = 0
    while (acc >= TICK && steps < 8) {
      update(TICK)
      acc -= TICK
      steps++
    }
    render()
    raf = requestAnimationFrame(frame)
  }

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
    } else {
      last = performance.now()
      acc = 0
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVis)
  raf = requestAnimationFrame(frame)

  return {
    stop() {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    },
  }
}
