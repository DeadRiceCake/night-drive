/**
 * Quality tier: chosen from the device (mobile → low) or `?quality=low|high`.
 * The renderer also scales its pixel ratio at runtime from the measured
 * frame rate (see main.ts), so these are starting points, not hard caps.
 */
export const IS_MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 900)

const q = new URLSearchParams(location.search).get('quality')
export const QUALITY: 'low' | 'high' = q === 'low' || q === 'high' ? q : IS_MOBILE ? 'low' : 'high'
const low = QUALITY === 'low'

export const Q = {
  /** initial pixel ratio cap */
  dpr: low ? 1.0 : 1.5,
  /** dynamic resolution floor */
  dprMin: low ? 0.6 : 0.85,
  lamps: low ? 6 : 10,
  neon: low ? 3 : 6,
  /** bloom render scale */
  bloomScale: low ? 0.5 : 1,
  peds: low ? 220 : 420,
  cars: low ? 56 : 80,
  avs: low ? 24 : 40,
  /** rear mirror render target width */
  mirrorW: low ? 384 : 768,
  anisotropy: low ? 4 : 8,
}
