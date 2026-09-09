/**
 * The drive route: a closed spline through every district. Sampled at fixed
 * spacing so everything (camera, traffic, road mesh, props) indexes by metres.
 */
import { CatmullRomCurve3, Vector3 } from 'three'
import { districtAt, terrainHeight, type DistrictId } from './map'
import { HIGHWAY_HEIGHT } from '../tokens'

export type RoadKind = 'street' | 'highway' | 'coast' | 'hill' | 'badlands' | 'tunnel'

interface Waypoint {
  x: number
  z: number
  kind: RoadKind
}

/** Roughly 20 km. Order matters: it is the driving direction. */
export const WAYPOINTS: Waypoint[] = [
  { x: -760, z: 640, kind: 'street' }, // Corpo Plaza approach: Arasaka Tower dead ahead
  { x: -620, z: 300, kind: 'street' },
  { x: -420, z: 110, kind: 'street' }, // memorial on the right
  { x: -200, z: 40, kind: 'street' },
  { x: 260, z: 60, kind: 'street' }, // Downtown
  { x: 480, z: -200, kind: 'street' },
  { x: 200, z: -430, kind: 'street' },
  { x: -300, z: -520, kind: 'highway' }, // ramp up onto the ring highway
  { x: -240, z: -760, kind: 'highway' },
  { x: -420, z: -960, kind: 'street' }, // Little China
  { x: -240, z: -1160, kind: 'street' },
  { x: 260, z: -1080, kind: 'street' }, // into Kabuki
  { x: 560, z: -900, kind: 'street' },
  { x: 720, z: -1100, kind: 'street' }, // Kabuki market roundabout
  { x: 460, z: -1400, kind: 'street' },
  { x: 60, z: -1560, kind: 'street' }, // Northside
  { x: -560, z: -1780, kind: 'street' },
  { x: -600, z: -2150, kind: 'street' }, // docks
  { x: 100, z: -2220, kind: 'street' },
  { x: 800, z: -2100, kind: 'street' }, // Arasaka Waterfront
  { x: 1320, z: -1900, kind: 'street' },
  { x: 1180, z: -1380, kind: 'highway' },
  { x: 1080, z: -800, kind: 'highway' },
  { x: 900, z: -400, kind: 'street' }, // Japantown
  { x: 1100, z: -60, kind: 'street' },
  { x: 900, z: 180, kind: 'street' }, // Cherry Blossom Market
  { x: 1300, z: 220, kind: 'street' },
  { x: 1700, z: 40, kind: 'street' }, // Charter Hill
  { x: 1800, z: -500, kind: 'street' },
  { x: 1700, z: -1000, kind: 'hill' }, // North Oak
  { x: 2100, z: -1500, kind: 'hill' },
  { x: 2500, z: -1300, kind: 'hill' },
  { x: 2450, z: -700, kind: 'hill' },
  { x: 2250, z: -200, kind: 'highway' },
  { x: 2100, z: 500, kind: 'street' }, // Arroyo
  { x: 2000, z: 950, kind: 'street' },
  { x: 2150, z: 1500, kind: 'street' }, // Rancho Coronado
  { x: 2100, z: 2100, kind: 'street' },
  { x: 2500, z: 2600, kind: 'badlands' },
  { x: 2000, z: 3000, kind: 'badlands' },
  { x: 1300, z: 2700, kind: 'highway' }, // ring highway back toward the city
  { x: 1150, z: 1250, kind: 'street' }, // Vista del Rey
  { x: 850, z: 900, kind: 'street' },
  { x: 400, z: 1000, kind: 'street' }, // The Glen
  { x: -50, z: 1350, kind: 'street' },
  { x: -80, z: 1900, kind: 'street' }, // West Wind Estate
  { x: -450, z: 2450, kind: 'highway' }, // bridge into Pacifica
  { x: -1000, z: 2300, kind: 'street' }, // Coastview
  { x: -1400, z: 1950, kind: 'coast' },
  { x: -1330, z: 1500, kind: 'coast' },
  { x: -1170, z: 1100, kind: 'coast' }, // Wellsprings piers
  { x: -1080, z: 750, kind: 'coast' },
  { x: -850, z: 560, kind: 'street' }, // The Glen edge -> Corpo
]

export const SAMPLE_STEP = 2

export interface RouteSample {
  x: number
  y: number
  z: number
  tx: number
  ty: number
  tz: number
  kind: RoadKind
  district: DistrictId
  /** Curvature, signed (+ = turning left). */
  curv: number
}

export class Route {
  readonly curve: CatmullRomCurve3
  readonly length: number
  readonly samples: RouteSample[] = []
  readonly count: number
  /** Start index of each waypoint segment. */
  readonly kindStarts: { s: number; kind: RoadKind }[] = []

  constructor() {
    const pts = WAYPOINTS.map((w) => new Vector3(w.x, 0, w.z))
    this.curve = new CatmullRomCurve3(pts, true, 'centripetal', 0.5)
    this.curve.arcLengthDivisions = 6000
    this.length = this.curve.getLength()
    this.count = Math.floor(this.length / SAMPLE_STEP)
    const tmp = new Vector3()
    const kinds: RoadKind[] = []
    const ys: number[] = []
    for (let i = 0; i < this.count; i++) {
      const u = i / this.count
      this.curve.getPointAt(u, tmp)
      const t = this.curve.getUtoTmapping(u, 0)
      const wi = Math.floor(t * WAYPOINTS.length) % WAYPOINTS.length
      const kind = WAYPOINTS[wi].kind
      kinds.push(kind)
      const ground = terrainHeight(tmp.x, tmp.z)
      const base = kind === 'highway' ? Math.max(ground, 0) + HIGHWAY_HEIGHT : Math.max(ground, 0.2) + 0.2
      ys.push(base)
      this.samples.push({
        x: tmp.x, y: base, z: tmp.z, tx: 0, ty: 0, tz: 1, kind, district: districtAt(tmp.x, tmp.z), curv: 0,
      })
    }
    // Smooth elevation heavily so ramps and hills are drivable.
    const n = this.count
    const R = 140
    const sm = new Float32Array(n)
    let acc = 0
    for (let i = -R; i <= R; i++) acc += ys[(i + n) % n]
    for (let i = 0; i < n; i++) {
      sm[i] = acc / (2 * R + 1)
      acc += ys[(i + R + 1) % n] - ys[(i - R + n) % n]
    }
    for (let i = 0; i < n; i++) this.samples[i].y = sm[i]
    // Tangents + curvature from neighbours
    for (let i = 0; i < n; i++) {
      const a = this.samples[(i - 1 + n) % n], b = this.samples[(i + 1) % n]
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
      const l = Math.hypot(dx, dy, dz) || 1
      dx /= l; dy /= l; dz /= l
      const s = this.samples[i]
      s.tx = dx; s.ty = dy; s.tz = dz
    }
    for (let i = 0; i < n; i++) {
      const a = this.samples[(i - 8 + n) % n], b = this.samples[(i + 8) % n]
      // signed angle between tangents (about +y)
      const cross = a.tx * b.tz - a.tz * b.tx
      this.samples[i].curv = -cross / (16 * SAMPLE_STEP)
    }
    let last: RoadKind | null = null
    for (let i = 0; i < n; i++) {
      if (kinds[i] !== last) {
        this.kindStarts.push({ s: i * SAMPLE_STEP, kind: kinds[i] })
        last = kinds[i]
      }
    }
  }

  /** Wraps metres into [0, length). */
  wrap(s: number): number {
    s %= this.length
    return s < 0 ? s + this.length : s
  }

  at(s: number): RouteSample {
    const i = Math.floor(this.wrap(s) / SAMPLE_STEP) % this.count
    return this.samples[i]
  }

  /** Interpolated position with lateral offset (metres to the right). */
  pos(s: number, side: number, out: Vector3, lift = 0): Vector3 {
    const w = this.wrap(s) / SAMPLE_STEP
    const i = Math.floor(w) % this.count
    const f = w - Math.floor(w)
    const a = this.samples[i], b = this.samples[(i + 1) % this.count]
    const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f
    // right vector = tangent x up  => (tz, 0, -tx)... for +x east/-z north with y up: right = (−tz, 0, tx)
    const tx = a.tx + (b.tx - a.tx) * f, tz = a.tz + (b.tz - a.tz) * f
    const l = Math.hypot(tx, tz) || 1
    const rx = -tz / l, rz = tx / l
    return out.set(x + rx * side, y + lift, z + rz * side)
  }

  /** Index of the first sample at or after `s`. */
  index(s: number): number {
    return Math.floor(this.wrap(s) / SAMPLE_STEP) % this.count
  }

  /** Metres of the first sample whose district is `id`. */
  findDistrict(id: DistrictId): number {
    // pick the middle of the longest run in that district so the warp lands in the thick of it
    let best = -1, bestLen = 0, runStart = -1
    for (let i = 0; i <= this.count; i++) {
      const inD = i < this.count && this.samples[i].district === id
      if (inD && runStart < 0) runStart = i
      if (!inD && runStart >= 0) {
        const len = i - runStart
        const k = this.samples[runStart + Math.floor(len * 0.35)].kind
        const score = len * (k === 'highway' ? 0.35 : 1)
        if (score > bestLen) { bestLen = score; best = runStart + Math.floor(len * 0.35) }
        runStart = -1
      }
    }
    return best < 0 ? 0 : best * SAMPLE_STEP
  }

  findKind(kind: RoadKind): number {
    // longest run of that kind, a little way in
    let best = 0, bestLen = 0
    for (let i = 0; i < this.kindStarts.length; i++) {
      const k = this.kindStarts[i]
      if (k.kind !== kind) continue
      const next = this.kindStarts[i + 1]?.s ?? this.length
      const len = next - k.s
      if (len > bestLen) { bestLen = len; best = k.s + Math.min(120, len * 0.2) }
    }
    return best
  }
}

/**
 * Spatial hash of route samples for quick "is this near the road" queries
 * during world generation.
 */
export class RouteIndex {
  private cell = 64
  private grid = new Map<number, number[]>()
  constructor(private route: Route) {
    route.samples.forEach((s, i) => {
      const k = this.key(s.x, s.z)
      let arr = this.grid.get(k)
      if (!arr) this.grid.set(k, (arr = []))
      arr.push(i)
    })
  }
  private key(x: number, z: number): number {
    return (Math.floor(x / this.cell) + 4096) * 8192 + (Math.floor(z / this.cell) + 4096)
  }
  /** Distance to the nearest route sample within `maxDist`, else Infinity. Also returns the sample index. */
  nearest(x: number, z: number, maxDist: number): { d: number; i: number } {
    const r = Math.ceil(maxDist / this.cell)
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell)
    let best = Infinity, bi = -1
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gz = cz - r; gz <= cz + r; gz++) {
        const arr = this.grid.get((gx + 4096) * 8192 + (gz + 4096))
        if (!arr) continue
        for (const i of arr) {
          const s = this.route.samples[i]
          const d = Math.hypot(s.x - x, s.z - z)
          if (d < best) { best = d; bi = i }
        }
      }
    }
    return { d: best <= maxDist ? best : Infinity, i: bi }
  }
}
