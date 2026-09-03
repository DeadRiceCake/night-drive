// Design tokens (see DESIGN_SYSTEM.md). All sizes are backbuffer pixels.
export const W = 320
export const H = 180
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
export const SPEED_CRUISE = 7200
export const TRAFFIC_SPEED_MIN = 4200
export const TRAFFIC_SPEED_MAX = 6600

// Cockpit geometry
export const DASH_TOP = 122
export const MIRROR_REAR = { x: 234, y: 9, w: 64, h: 20 }
export const MIRROR_SIDE = { x: 3, y: 121, w: 40, h: 22 }
export const SAFE = { top: 8, left: 16, right: 16, bottom: H - DASH_TOP }

// Motion (ticks @ 60Hz)
export const TICK = 1 / 60
export const BLINK_TICKS = 30

export type TimePreset = 'day' | 'dusk' | 'night'
export type Biome = 'countryside' | 'city' | 'highway'
