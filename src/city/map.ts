/**
 * Night City map: districts, coastline, terrain. Metres; +x east, -z north.
 * Origin is the centre of Corpo Plaza.
 */
import { Color } from 'three'
import { hash2 } from '../core/rng'

export type DistrictId =
  | 'corpo' | 'downtown'
  | 'littlechina' | 'kabuki' | 'northside' | 'waterfront'
  | 'japantown' | 'charterhill' | 'northoak'
  | 'wellsprings' | 'glen' | 'vistadelrey'
  | 'arroyo' | 'rancho'
  | 'coastview' | 'westwind'
  | 'badlands'

export type Region = 'citycenter' | 'watson' | 'westbrook' | 'heywood' | 'santodomingo' | 'pacifica' | 'badlands'

export interface District {
  id: DistrictId
  name: string
  region: Region
  /** x0, z0, x1, z1 */
  box: [number, number, number, number]
}

export const DISTRICTS: District[] = [
  { id: 'corpo', name: 'Corpo Plaza', region: 'citycenter', box: [-950, -450, -100, 450] },
  { id: 'downtown', name: 'Downtown', region: 'citycenter', box: [-100, -500, 600, 500] },
  { id: 'littlechina', name: 'Little China', region: 'watson', box: [-850, -1250, 200, -500] },
  { id: 'kabuki', name: 'Kabuki', region: 'watson', box: [200, -1250, 950, -500] },
  { id: 'northside', name: 'Northside', region: 'watson', box: [-950, -2350, 650, -1250] },
  { id: 'waterfront', name: 'Arasaka Waterfront', region: 'watson', box: [650, -2350, 1300, -1450] },
  { id: 'japantown', name: 'Japantown', region: 'westbrook', box: [600, -500, 1400, 300] },
  { id: 'charterhill', name: 'Charter Hill', region: 'westbrook', box: [1400, -800, 2150, 300] },
  { id: 'northoak', name: 'North Oak', region: 'westbrook', box: [1300, -2400, 2800, -800] },
  { id: 'wellsprings', name: 'Wellsprings', region: 'heywood', box: [-1200, 450, -250, 1450] },
  { id: 'glen', name: 'The Glen', region: 'heywood', box: [-250, 500, 650, 1450] },
  { id: 'vistadelrey', name: 'Vista del Rey', region: 'heywood', box: [650, 300, 1450, 1450] },
  { id: 'arroyo', name: 'Arroyo', region: 'santodomingo', box: [1450, 300, 2550, 1350] },
  { id: 'rancho', name: 'Rancho Coronado', region: 'santodomingo', box: [1450, 1350, 2750, 2550] },
  { id: 'coastview', name: 'Coastview', region: 'pacifica', box: [-1500, 1500, -450, 2750] },
  { id: 'westwind', name: 'West Wind Estate', region: 'pacifica', box: [-450, 1450, 350, 2550] },
]

export const DISTRICT_BY_ID: Record<DistrictId, District> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
) as Record<DistrictId, District>
DISTRICT_BY_ID.badlands = { id: 'badlands', name: 'Badlands', region: 'badlands', box: [-9999, -9999, 9999, 9999] }

/** Gaps between district boxes belong to the nearest district (within this distance) so the map reads seamless. */
export const GAP_FILL = 320

export function districtAt(x: number, z: number): DistrictId {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.box
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d.id
  }
  let best: DistrictId = 'badlands', bestD = GAP_FILL
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.box
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1)
    const dist = Math.hypot(dx, dz)
    if (dist < bestD) { bestD = dist; best = d.id }
  }
  return best
}

/** Coast x at a given z: everything west of it is ocean. */
export function coastX(z: number): number {
  // Bay bulges in around Watson; Pacifica sticks out further west. Segments blend so the shore is continuous.
  if (z < -2350) return 1600 // the bay: water north of Watson
  const watson = -1000 + 60 * Math.sin(z / 330)
  const centre = -1230 + 40 * Math.sin(z / 250)
  const pacifica = -1520 + 30 * Math.sin(z / 200)
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
  if (z < -600) return watson
  if (z < -300) return watson + (centre - watson) * smooth((z + 600) / 300)
  if (z < 1200) return centre
  if (z < 1700) return centre + (pacifica - centre) * smooth((z - 1200) / 500)
  return pacifica
}

export function isWater(x: number, z: number): boolean {
  if (z < -2400 && x < 1500) return true
  return x < coastX(z)
}

/** Signed distance-ish to the coastline; negative when in water. */
export function coastDistance(x: number, z: number): number {
  let d = x - coastX(z)
  if (x < 1500) d = Math.min(d, z + 2400)
  return d
}

function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z)
  const fx = x - xi, fz = z - zi
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const n = (a: number, b: number) => hash2(seed + a, b) / 4294967296
  const a = n(xi, zi), b = n(xi + 1, zi), c = n(xi, zi + 1), d = n(xi + 1, zi + 1)
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz
}

/** Terrain height. Flat in the city; hills in North Oak, rolling badlands outside. */
export function terrainHeight(x: number, z: number): number {
  if (isWater(x, z)) return -4
  let h = 0
  // North Oak hills
  const dx = (x - 2150) / 800, dz = (z + 1650) / 650
  const r = dx * dx + dz * dz
  if (r < 1) {
    const t = 1 - r
    h += 110 * t * t + 25 * t * vnoise(x / 180, z / 180, 11)
  }
  // Badlands: rise gently past the city edge
  const cityR = Math.max(Math.abs(x + 300) / 2900, Math.abs(z - 100) / 2800)
  if (cityR > 0.92) {
    const t = Math.min(1, (cityR - 0.92) / 0.3)
    h += t * (40 * vnoise(x / 420, z / 420, 5) + 12 * vnoise(x / 90, z / 90, 7))
  }
  return h
}

/**
 * Terrain height after the road cut: within 60 m of a route sample the ground
 * blends down to the road surface (mirrors buildTerrain in roads.ts).
 */
export function groundHeight(x: number, z: number, near: { d: number; y: number; highway: boolean } | null): number {
  let h = terrainHeight(x, z)
  if (near && near.d < 60 && (!near.highway || near.y - h < 4)) {
    const t = Math.min(1, 1 - Math.max(0, (near.d - 18) / 42))
    h = h + (near.y - 0.35 - h) * t
  }
  return h
}

export function districtName(id: DistrictId): string {
  return DISTRICT_BY_ID[id].name
}

/** Distance from (x,z) to the nearest edge of district `id`'s box. */
export function edgeDistance(x: number, z: number, id: DistrictId): number {
  const d = DISTRICT_BY_ID[id]
  if (id === 'badlands') return Infinity
  const [x0, z0, x1, z1] = d.box
  return Math.min(x - x0, x1 - x, z - z0, z1 - z)
}

/**
 * Neighbouring district across the nearest edge of `id`'s box (badlands when
 * there is none). Used to blend presets so borders don't read as hard cuts.
 */
export function neighbourAcross(x: number, z: number, id: DistrictId): DistrictId {
  const d = DISTRICT_BY_ID[id]
  if (id === 'badlands') return 'badlands'
  const [x0, z0, x1, z1] = d.box
  const cands: [number, number, number][] = [[x - x0, x0 - 30, z], [x1 - x, x1 + 30, z], [z - z0, x, z0 - 30], [z1 - z, x, z1 + 30]]
  cands.sort((a, b) => a[0] - b[0])
  return districtAt(cands[0][1], cands[0][2])
}

/** How much (0..1) a point should take from its neighbour's preset. Peaks at 0.5 on the border. */
export function blendWeight(x: number, z: number, id: DistrictId, width = 180): number {
  const e = edgeDistance(x, z, id)
  if (e >= width) return 0
  return 0.5 * (1 - e / width)
}

const T_SAND = new Color(0x6a5844), T_CITY = new Color(0x141418), T_DIRT = new Color(0x3c3226), T_GRASS = new Color(0x22281c)
const _tc = new Color()
function baseTint(id: DistrictId, x: number, z: number, out: Color): Color {
  if (id === 'badlands') {
    const vn = 0.5 + 0.5 * Math.sin(x * 0.011 * 1.7 + Math.sin(z * 0.013 * 2.3) * 1.5) * Math.cos(z * 0.013 * 1.3 + Math.sin(x * 0.011 * 1.1))
    return out.copy(T_SAND).lerp(T_DIRT, 0.6 * vn)
  }
  if (id === 'northoak') return out.copy(T_GRASS)
  if (id === 'rancho' || id === 'coastview') return out.copy(T_DIRT).lerp(T_CITY, 0.5)
  return out.copy(T_CITY)
}

/** Terrain vertex colour, blended across district borders. */
export function terrainTint(x: number, z: number, out: Color): Color {
  const id = districtAt(x, z)
  baseTint(id, x, z, out)
  const w = blendWeight(x, z, id, 140)
  if (w > 0) {
    const nb = neighbourAcross(x, z, id)
    if (nb !== id) out.lerp(baseTint(nb, x, z, _tc), w)
  }
  return out
}
