// Design tokens (see DESIGN_SYSTEM.md). All sizes are backbuffer pixels.
export const W = 480
export const H = 270
/** Scale of the backbuffer relative to the original 320x180 layout. */
export const K = W / 320
export const TILE = 8

// Road / projection (world units)
export const SEG_LEN = 200
export const ROAD_W = 2000 // half road width in world units
export const CAM_H = 1000
export const FOV = 100
export const DRAW_DIST = 160
export const REAR_DRAW_DIST = 48

// Lanes: normalized x in [-1, 1] across the road half-width units
export const LANE_ONCOMING = [-0.72, -0.28]
export const LANE_OURS = [0.28, 0.72]

// Speeds (world units / second)
export const SPEED_CRUISE = 4800
export const TRAFFIC_SPEED_MIN = 2800
export const TRAFFIC_SPEED_MAX = 4400

// Cockpit geometry
export const DASH_TOP = 183
export const MIRROR_REAR = { x: 351, y: 13, w: 96, h: 30 }
export const MIRROR_SIDE = { x: 4, y: 182, w: 60, h: 33 }
export const SAFE = { top: 12, left: 24, right: 24, bottom: H - DASH_TOP }

// Motion (ticks @ 60Hz)
export const TICK = 1 / 60
export const BLINK_TICKS = 30

export type TimePreset = 'day' | 'dusk' | 'night'
export type Biome = 'countryside' | 'city' | 'highway'
