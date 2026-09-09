// Design tokens for the 3D Night City build. Units are meters unless noted.

export type TimePreset = 'day' | 'dusk' | 'night'

/** Brand / neon palette (hex). */
export const C = {
  yellow: 0xfcee0a,
  cyan: 0x37ebf3,
  magenta: 0xff2a6d,
  red: 0xff003c,
  arasakaRed: 0xff1a2b,
  orange: 0xffa030,
  sodium: 0xff9a3c,
  warmWindow: 0xffd28a,
  coolWindow: 0x9fd8ff,
  white: 0xf4f6ff,
  pink: 0xff6ec7,
  green: 0x3cff9a,
  gold: 0xffc857,
  violet: 0xa06bff,
} as const

/** Per time-of-day atmosphere. */
export interface Atmosphere {
  fogColor: number
  fogDensity: number
  skyTop: number
  skyHorizon: number
  skyGlow: number
  ambient: number
  sunDir: [number, number, number]
  sunColor: number
  sunStrength: number
  /** 0..1 how strongly windows / neon / lamps glow. */
  lights: number
  bloomStrength: number
  exposure: number
}

export const ATMOS: Record<TimePreset, Atmosphere> = {
  night: {
    fogColor: 0x1a1026,
    fogDensity: 0.0012,
    skyTop: 0x05040f,
    skyHorizon: 0x3a1a3c,
    skyGlow: 0x7a2c60,
    ambient: 0x342c4c,
    sunDir: [0.2, 0.6, 0.3],
    sunColor: 0x5060a0,
    sunStrength: 0.18,
    lights: 1,
    bloomStrength: 0.6,
    exposure: 1.0,
  },
  dusk: {
    fogColor: 0x4b2a3d,
    fogDensity: 0.0009,
    skyTop: 0x1a1440,
    skyHorizon: 0xff7a3c,
    skyGlow: 0xff4a6a,
    ambient: 0x4a3a58,
    sunDir: [-0.9, 0.12, 0.3],
    sunColor: 0xffa060,
    sunStrength: 0.6,
    lights: 0.75,
    bloomStrength: 0.6,
    exposure: 1.0,
  },
  day: {
    fogColor: 0xb9b2a8,
    fogDensity: 0.00075,
    skyTop: 0x3f7fd6,
    skyHorizon: 0xc8bfae,
    skyGlow: 0xe8dcc0,
    ambient: 0x8a8ea0,
    sunDir: [-0.4, 0.8, 0.3],
    sunColor: 0xfff2d8,
    sunStrength: 1.0,
    lights: 0.12,
    bloomStrength: 0.25,
    exposure: 0.95,
  },
}

/** Driving. */
export const EYE_HEIGHT = 1.18
export const LANE_OFFSET = 3.4 // right of route centre (right-hand traffic)
export const LOOK_AHEAD = 14
export const SPEED_CITY = 21 // m/s ~ 76 km/h
export const SPEED_HIGHWAY = 31
export const ROAD_HALF = 7.5
export const HIGHWAY_HALF = 9
export const HIGHWAY_HEIGHT = 12
export const CORRIDOR = 26 // half-width kept clear of buildings around the route

/** World extents. */
export const MAP_RADIUS = 3400
export const FAR = 3200
