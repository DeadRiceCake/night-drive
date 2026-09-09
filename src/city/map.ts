/**
 * Night City map: districts, coastline, terrain. Metres; +x east, -z north.
 * Origin is the centre of Corpo Plaza.
 */
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

export function districtAt(x: number, z: number): DistrictId {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.box
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d.id
  }
  return 'badlands'
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
