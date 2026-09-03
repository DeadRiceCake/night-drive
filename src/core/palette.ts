import type { TimePreset } from '../tokens'

/**
 * Indexed palette. Pixels store ramp indices; presets only change the RGB
 * behind each index. Index 0 is transparent.
 */
export const RAMPS = {
  sky: 6,
  star: 3,
  galaxy: 4,
  far: 4,
  ground: 4,
  road: 4,
  lane: 2,
  rumble: 2,
  veg: 4,
  struct: 5,
  glass: 4,
  lightWarm: 4,
  lightCool: 3,
  tail: 3,
  neonA: 3,
  neonB: 3,
  carA: 3,
  carB: 3,
  carC: 3,
  carD: 3,
  cockpit: 5,
  gauge: 3,
  adFrame: 3,
  ui: 5,
  mono: 4, // black, dark gray, light gray, white
} as const

export type RampName = keyof typeof RAMPS

// Base index of each ramp
export const P: Record<RampName, number> = {} as Record<RampName, number>
let _n = 1
for (const k of Object.keys(RAMPS) as RampName[]) {
  P[k] = _n
  _n += RAMPS[k]
}
export const PALETTE_SIZE = _n

/** Index of ramp r at step s (clamped). */
export function pal(r: RampName, s: number): number {
  const n = RAMPS[r]
  return P[r] + (s < 0 ? 0 : s >= n ? n - 1 : s | 0)
}

/** Ramp name + step of an index (for debugging / quantization). */
export function rampOf(i: number): RampName | null {
  for (const k of Object.keys(RAMPS) as RampName[]) {
    if (i >= P[k] && i < P[k] + RAMPS[k]) return k
  }
  return null
}

/** Brighten / darken tables: index -> adjacent step within its ramp. */
export const SHIFT_UP = new Uint8Array(PALETTE_SIZE)
export const SHIFT_DOWN = new Uint8Array(PALETTE_SIZE)
for (const k of Object.keys(RAMPS) as RampName[]) {
  const base = P[k]
  const n = RAMPS[k]
  for (let s = 0; s < n; s++) {
    SHIFT_UP[base + s] = base + Math.min(n - 1, s + 1)
    SHIFT_DOWN[base + s] = base + Math.max(0, s - 1)
  }
}

type PresetColors = Record<RampName, string[]>

// The only place hex colors are allowed to exist.
const DAY: PresetColors = {
  sky: ['#6fa6e0', '#84b8ea', '#9cc9f2', '#b6d8f6', '#cfe5f9', '#e6f1fc'],
  star: ['#9cc9f2', '#9cc9f2', '#9cc9f2'],
  galaxy: ['#9cc9f2', '#9cc9f2', '#9cc9f2', '#9cc9f2'],
  far: ['#5f7e9c', '#7f9db8', '#9db8cf', '#bcd2e3'],
  ground: ['#4f7d3a', '#5f9143', '#7aa64f', '#93b95a'],
  road: ['#5c5f66', '#65686f', '#6e7178', '#7a7d84'],
  lane: ['#c9c9c9', '#f2f2f2'],
  rumble: ['#c43b3b', '#f0f0f0'],
  veg: ['#2f5a2b', '#3d7434', '#4f8f3f', '#6aa64c'],
  struct: ['#3b3a40', '#5a585f', '#7c7a82', '#a3a1a8', '#cfcdd3'],
  glass: ['#6f8fb0', '#8fb0d0', '#a8c6e0', '#c5dcef'],
  lightWarm: ['#8a8380', '#a09890', '#b8aea2', '#d6cbbb'],
  lightCool: ['#9ea3a8', '#b6bbc0', '#d0d4d8'],
  tail: ['#7a2a2a', '#a33636', '#c94343'],
  neonA: ['#9a6a86', '#b280a0', '#c898b8'],
  neonB: ['#6a8f96', '#84a9b0', '#9fc2c8'],
  carA: ['#8c1d1d', '#b52a2a', '#d84a4a'],
  carB: ['#1e3f7a', '#2d5aa8', '#4a7ad0'],
  carC: ['#b8b8bc', '#d8d8dc', '#f4f4f6'],
  carD: ['#2a4a2a', '#3b6b3b', '#4f8a4f'],
  cockpit: ['#15141a', '#242229', '#35333b', '#4a474f', '#66626a'],
  gauge: ['#4a3a2a', '#c9822b', '#ffcf5a'],
  adFrame: ['#2a2a2e', '#55555c', '#8f8f97'],
  ui: ['#101014', '#1d1d24', '#3a3a46', '#8b8b9c', '#e8e8f0'],
  mono: ['#000000', '#404040', '#b0b0b0', '#ffffff'],
}

const DUSK: PresetColors = {
  sky: ['#2c1e4a', '#4a2a5e', '#7a3a63', '#b0525a', '#e07a4c', '#f5b06a'],
  star: ['#5a4a7a', '#8a7aa8', '#c8b8e0'],
  galaxy: ['#3a2a58', '#5a3a70', '#8a5a78', '#c09078'],
  far: ['#2a1f3a', '#3f2e4f', '#5a4266', '#7a5a7a'],
  ground: ['#2f3a2a', '#3a4a32', '#4a5a3a', '#5a6a42'],
  road: ['#3a3a42', '#42424a', '#4a4a52', '#54545c'],
  lane: ['#a0a0a8', '#d8d8dc'],
  rumble: ['#8a2a2a', '#c8c8c8'],
  veg: ['#1a2a1a', '#243a22', '#2e4a2a', '#3a5a34'],
  struct: ['#221e2a', '#3a3442', '#524a5a', '#6e6478', '#8e8498'],
  glass: ['#3a3a52', '#4a4a66', '#c8a050', '#f0d080'],
  lightWarm: ['#6a4a2a', '#a8702a', '#e0a040', '#ffd070'],
  lightCool: ['#6a7a8a', '#a8c0d0', '#e0f0ff'],
  tail: ['#7a1a1a', '#c02828', '#ff4a4a'],
  neonA: ['#8a2a6a', '#d040a0', '#ff70d0'],
  neonB: ['#1a7a8a', '#30b8d0', '#70f0ff'],
  carA: ['#5a1414', '#8a2020', '#b03030'],
  carB: ['#142a5a', '#204088', '#3058b0'],
  carC: ['#7a7a80', '#a0a0a8', '#c8c8d0'],
  carD: ['#1a2e1a', '#2a4a2a', '#3a6a3a'],
  cockpit: ['#0e0d12', '#1a1820', '#28262e', '#38353e', '#4c4852'],
  gauge: ['#4a2a1a', '#e0842a', '#ffd25a'],
  adFrame: ['#1a1a1e', '#3a3a40', '#6a6a72'],
  ui: ['#101014', '#1d1d24', '#3a3a46', '#8b8b9c', '#e8e8f0'],
  mono: ['#000000', '#404040', '#b0b0b0', '#ffffff'],
}

const NIGHT: PresetColors = {
  sky: ['#05060f', '#0a0c1e', '#111530', '#1c2046', '#2a2e60', '#3d3f7a'],
  star: ['#3d3f7a', '#8a8ec8', '#ffffff'],
  galaxy: ['#1e1a46', '#3a2a6a', '#8a5a7a', '#ffe0b0'],
  far: ['#0a0c18', '#121428', '#1a1c34', '#242844'],
  ground: ['#0c120c', '#111a11', '#162216', '#1c2a1c'],
  road: ['#1a1b22', '#20212a', '#272832', '#30313c'],
  lane: ['#6a6a78', '#a8a8b8'],
  rumble: ['#4a1616', '#5e5e68'],
  veg: ['#070d08', '#0b150c', '#101e11', '#162816'],
  struct: ['#0e0e14', '#1a1a22', '#282832', '#3a3a46', '#50505e'],
  glass: ['#141828', '#1c2034', '#d8a040', '#ffe088'],
  lightWarm: ['#5a3a10', '#c07a20', '#ffb840', '#fff0b0'],
  lightCool: ['#4a5a7a', '#a8c8f0', '#ffffff'],
  tail: ['#6a1010', '#e02020', '#ff6060'],
  neonA: ['#7a1a5a', '#e030a0', '#ff80e0'],
  neonB: ['#106a7a', '#20c0e0', '#80f8ff'],
  carA: ['#2a0a0a', '#4a1414', '#6a2020'],
  carB: ['#0a1430', '#142450', '#203870'],
  carC: ['#3a3a44', '#585864', '#7a7a88'],
  carD: ['#0c180c', '#142814', '#1e3c1e'],
  cockpit: ['#07070a', '#0f0e13', '#17161c', '#211f27', '#2c2a33'],
  gauge: ['#3a2010', '#e07a20', '#ffc850'],
  adFrame: ['#0e0e12', '#26262c', '#4a4a54'],
  ui: ['#101014', '#1d1d24', '#3a3a46', '#8b8b9c', '#e8e8f0'],
  mono: ['#000000', '#404040', '#b0b0b0', '#ffffff'],
}

export const PRESETS: Record<TimePreset, PresetColors> = { day: DAY, dusk: DUSK, night: NIGHT }

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** Build a 32-bit ABGR LUT (little-endian RGBA in memory) for a preset. */
export function buildLUT(preset: TimePreset): Uint32Array {
  const lut = new Uint32Array(PALETTE_SIZE)
  const cols = PRESETS[preset]
  lut[0] = 0
  for (const k of Object.keys(RAMPS) as RampName[]) {
    const arr = cols[k]
    if (arr.length !== RAMPS[k]) throw new Error(`palette ${preset}.${k} has ${arr.length} colors, expected ${RAMPS[k]}`)
    for (let s = 0; s < arr.length; s++) {
      const [r, g, b] = hexToRgb(arr[s])
      lut[P[k] + s] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    }
  }
  return lut
}

/** RGB triplets per index, for nearest-color quantization (ads). */
export function buildRGB(preset: TimePreset): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 3)
  const cols = PRESETS[preset]
  for (const k of Object.keys(RAMPS) as RampName[]) {
    cols[k].forEach((h, s) => {
      const [r, g, b] = hexToRgb(h)
      const i = (P[k] + s) * 3
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
    })
  }
  return out
}
