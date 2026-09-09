/**
 * Fills every district with buildings, signs, holograms, lamps and props
 * according to a per-district preset. Deterministic for a seed.
 */
import { mulberry32, hashStr, type Rng } from '../core/rng'
import { C, CORRIDOR, HIGHWAY_HALF, ROAD_HALF } from '../tokens'
import { BuildingSet, STYLE, type BuildingInstance } from './buildings'
import { DISTRICTS, coastDistance, districtAt, groundHeight, isWater, terrainHeight, type DistrictId } from './map'
import type { Route, RouteIndex } from './route'
import { GlowPoints, SignSet, type Atlas, type Tile } from './signs'

export type PropKind =
  | 'lamp' | 'antenna' | 'container' | 'tank' | 'chimney' | 'crane' | 'palm' | 'turbine' | 'pumpjack' | 'solar' | 'ac' | 'watertower'
  | 'tree' | 'car' | 'awning' | 'vend' | 'stall' | 'dumpster'

export interface PropInstance {
  kind: PropKind
  x: number
  y: number
  z: number
  rot: number
  s: number
  color?: number
}

interface Preset {
  block: number
  street: number
  lots: number
  density: number
  hMin: number
  hMax: number
  hPow: number
  tallP: number
  tallMul: number
  lit: number
  styles: number[]
  colors: number[]
  neonP: number
  neonColors: number[]
  signP: number
  vsignP: number
  holoP: number
  brandP: number
  /** big video screens on facades */
  screenP: number
  lang: ('en' | 'jp' | 'cn')[]
  lamp: number
  rotJitter: number
  props: Partial<Record<PropKind, number>>
  /** street-level clutter probability per front-row building */
  street_: number
  /** parked cars per 100 m of route */
  parked: number
  setback: number
}

const GREY = [0x1c1e26, 0x22242c, 0x2a2c34, 0x30323a, 0x181a20]
const WARM = [0x2c2622, 0x332c26, 0x3a322c, 0x2a2420]
const GLASS = [0x161c2a, 0x1a2034, 0x121826, 0x1e2438, 0x0e1220]

export const PRESETS: Record<DistrictId, Preset> = {
  corpo: {
    block: 130, street: 34, lots: 1, density: 0.85, hMin: 90, hMax: 280, hPow: 1.2, tallP: 0.3, tallMul: 1.7, lit: 0.3,
    styles: [STYLE.glass, STYLE.glass, STYLE.luxury], colors: GLASS, neonP: 0.55, neonColors: [C.cyan, C.white, C.coolWindow, C.red],
    signP: 0.15, vsignP: 0, holoP: 0.4, brandP: 0.55, screenP: 0.45, lang: ['en'], lamp: C.white, rotJitter: 0, props: { antenna: 0.6 }, street_: 0.2, parked: 2, setback: 6,
  },
  downtown: {
    block: 84, street: 24, lots: 2, density: 0.96, hMin: 45, hMax: 230, hPow: 1.1, tallP: 0.22, tallMul: 2.0, lit: 0.45,
    styles: [STYLE.glass, STYLE.residential, STYLE.glass, STYLE.mega], colors: [...GLASS, ...GREY], neonP: 0.7,
    neonColors: [C.cyan, C.magenta, C.yellow, C.pink, C.violet], signP: 0.9, vsignP: 0.5, holoP: 0.8, brandP: 0.4, screenP: 0.6, lang: ['en', 'jp'],
    lamp: C.white, rotJitter: 0, props: { antenna: 0.7, ac: 0.5 }, street_: 0.7, parked: 4, setback: 3,
  },
  littlechina: {
    block: 72, street: 18, lots: 2, density: 0.95, hMin: 18, hMax: 62, hPow: 1.4, tallP: 0.1, tallMul: 2.2, lit: 0.4,
    styles: [STYLE.residential, STYLE.residential, STYLE.mega], colors: WARM, neonP: 0.45, neonColors: [C.red, C.orange, C.yellow, C.magenta],
    signP: 0.95, vsignP: 0.8, holoP: 0.2, brandP: 0.1, screenP: 0.15, lang: ['cn', 'cn', 'en'], lamp: C.sodium, rotJitter: 0.02, props: { ac: 0.9, antenna: 0.3, watertower: 0.2 },
    street_: 0.9, parked: 5, setback: 2,
  },
  kabuki: {
    block: 62, street: 15, lots: 3, density: 0.97, hMin: 12, hMax: 44, hPow: 1.5, tallP: 0.08, tallMul: 2.6, lit: 0.45,
    styles: [STYLE.residential, STYLE.residential, STYLE.industrial], colors: [...GREY, ...WARM], neonP: 0.32,
    neonColors: [C.cyan, C.magenta, C.pink, C.yellow, C.red], signP: 1, vsignP: 1, holoP: 0.4, brandP: 0.1, screenP: 0.25, lang: ['jp', 'jp', 'en'],
    lamp: C.sodium, rotJitter: 0.04, props: { ac: 1, antenna: 0.4, watertower: 0.25 }, street_: 1, parked: 5, setback: 1.5,
  },
  northside: {
    block: 100, street: 22, lots: 2, density: 0.95, hMin: 10, hMax: 44, hPow: 1.5, tallP: 0.08, tallMul: 2, lit: 0.22,
    styles: [STYLE.industrial, STYLE.industrial, STYLE.unfinished], colors: [0x2a2c30, 0x33302a, 0x26282c, 0x3a3630], neonP: 0.12,
    neonColors: [C.orange, C.sodium, C.red], signP: 0.25, vsignP: 0.05, holoP: 0.05, brandP: 0.2, screenP: 0, lang: ['en'], lamp: C.sodium, rotJitter: 0,
    props: { chimney: 0.6, tank: 0.7, container: 2.5, crane: 0.25, watertower: 0.2, dumpster: 0.6 }, street_: 0.3, parked: 2, setback: 3,
  },
  waterfront: {
    block: 130, street: 28, lots: 2, density: 0.75, hMin: 10, hMax: 30, hPow: 1.5, tallP: 0.05, tallMul: 2, lit: 0.18,
    styles: [STYLE.industrial, STYLE.unfinished], colors: [0x24262c, 0x2c2a2a, 0x1e2024], neonP: 0.15, neonColors: [C.arasakaRed, C.red],
    signP: 0.15, vsignP: 0, holoP: 0.05, brandP: 0.3, screenP: 0, lang: ['en'], lamp: C.sodium, rotJitter: 0, props: { crane: 0.5, container: 3, tank: 0.3 }, street_: 0.2, parked: 1.5, setback: 4,
  },
  japantown: {
    block: 68, street: 17, lots: 2, density: 0.96, hMin: 24, hMax: 95, hPow: 1.3, tallP: 0.15, tallMul: 2.2, lit: 0.45,
    styles: [STYLE.residential, STYLE.glass, STYLE.mega, STYLE.residential], colors: [0x2a2030, 0x1e1a28, 0x261c2c, ...GREY], neonP: 0.8,
    neonColors: [C.pink, C.magenta, C.red, C.cyan, C.violet], signP: 1, vsignP: 1, holoP: 0.6, brandP: 0.2, screenP: 0.45, lang: ['jp', 'jp', 'en'],
    lamp: 0xffb0d0, rotJitter: 0.01, props: { ac: 0.7, antenna: 0.5 }, street_: 1, parked: 4, setback: 2,
  },
  charterhill: {
    block: 140, street: 36, lots: 1, density: 0.6, hMin: 60, hMax: 210, hPow: 1.1, tallP: 0.2, tallMul: 1.5, lit: 0.4,
    styles: [STYLE.luxury, STYLE.glass], colors: [0x2a2a30, 0x35353a, 0x202028, 0x2c2e38], neonP: 0.4, neonColors: [C.white, C.gold, C.coolWindow],
    signP: 0.05, vsignP: 0, holoP: 0.15, brandP: 0.3, screenP: 0.2, lang: ['en'], lamp: C.white, rotJitter: 0, props: { antenna: 0.4, tree: 0.8 }, street_: 0.1, parked: 2, setback: 10,
  },
  northoak: {
    block: 220, street: 40, lots: 2, density: 0.45, hMin: 7, hMax: 16, hPow: 1, tallP: 0, tallMul: 1, lit: 0.5,
    styles: [STYLE.house, STYLE.luxury], colors: [0x3a3632, 0x34343a, 0x2c2c30], neonP: 0.2, neonColors: [C.gold, C.warmWindow],
    signP: 0, vsignP: 0, holoP: 0, brandP: 0, screenP: 0, lang: ['en'], lamp: C.warmWindow, rotJitter: 0.3, props: { palm: 0.5, tree: 4 }, street_: 0, parked: 0.6, setback: 20,
  },
  wellsprings: {
    block: 84, street: 22, lots: 2, density: 0.85, hMin: 14, hMax: 60, hPow: 1.3, tallP: 0.12, tallMul: 2, lit: 0.4,
    styles: [STYLE.residential, STYLE.glass, STYLE.luxury], colors: [0x2c2a30, 0x30303a, 0x282c34], neonP: 0.4, neonColors: [C.cyan, C.green, C.white],
    signP: 0.5, vsignP: 0.2, holoP: 0.25, brandP: 0.15, screenP: 0.15, lang: ['en'], lamp: C.white, rotJitter: 0, props: { palm: 1.5, antenna: 0.3 }, street_: 0.4, parked: 3, setback: 4,
  },
  glen: {
    block: 96, street: 24, lots: 2, density: 0.85, hMin: 25, hMax: 95, hPow: 1.2, tallP: 0.15, tallMul: 1.8, lit: 0.38,
    styles: [STYLE.glass, STYLE.residential], colors: [...GREY, ...GLASS], neonP: 0.3, neonColors: [C.cyan, C.white, C.yellow],
    signP: 0.4, vsignP: 0.1, holoP: 0.25, brandP: 0.25, screenP: 0.2, lang: ['en'], lamp: C.white, rotJitter: 0, props: { antenna: 0.5, ac: 0.3, tree: 0.5 }, street_: 0.4, parked: 3, setback: 4,
  },
  vistadelrey: {
    block: 70, street: 16, lots: 3, density: 0.95, hMin: 8, hMax: 30, hPow: 1.5, tallP: 0.05, tallMul: 2.4, lit: 0.38,
    styles: [STYLE.residential, STYLE.residential, STYLE.house], colors: [0x332a24, 0x3a3028, 0x2c2622, 0x36302a], neonP: 0.2,
    neonColors: [C.yellow, C.orange, C.red], signP: 0.6, vsignP: 0.15, holoP: 0.08, brandP: 0.05, screenP: 0.05, lang: ['en'], lamp: C.sodium, rotJitter: 0.03,
    props: { ac: 0.8, watertower: 0.3, antenna: 0.3, dumpster: 0.5, palm: 0.3 }, street_: 0.7, parked: 5, setback: 2,
  },
  arroyo: {
    block: 140, street: 28, lots: 2, density: 0.8, hMin: 12, hMax: 42, hPow: 1.5, tallP: 0.06, tallMul: 2, lit: 0.28,
    styles: [STYLE.industrial, STYLE.industrial, STYLE.unfinished], colors: [0x2c2a28, 0x34302a, 0x262628, 0x3a3430], neonP: 0.18,
    neonColors: [C.orange, C.sodium, C.yellow], signP: 0.3, vsignP: 0.05, holoP: 0.05, brandP: 0.25, screenP: 0, lang: ['en'], lamp: C.sodium, rotJitter: 0,
    props: { chimney: 0.8, tank: 0.9, container: 1.5, watertower: 0.3, dumpster: 0.5 }, street_: 0.3, parked: 2, setback: 8,
  },
  rancho: {
    block: 64, street: 14, lots: 4, density: 0.9, hMin: 5, hMax: 9, hPow: 1, tallP: 0.02, tallMul: 3, lit: 0.35,
    styles: [STYLE.house], colors: [0x3a3530, 0x40382e, 0x342e2a, 0x3c3a36], neonP: 0.04, neonColors: [C.warmWindow, C.yellow],
    signP: 0.08, vsignP: 0, holoP: 0, brandP: 0, screenP: 0, lang: ['en'], lamp: C.sodium, rotJitter: 0.05, props: { palm: 0.4, watertower: 0.05, tree: 1 }, street_: 0.1, parked: 4, setback: 3,
  },
  coastview: {
    block: 104, street: 26, lots: 1, density: 0.8, hMin: 30, hMax: 120, hPow: 1.1, tallP: 0.2, tallMul: 1.6, lit: 0.06,
    styles: [STYLE.unfinished, STYLE.unfinished, STYLE.residential], colors: [0x2a2a2c, 0x323234, 0x262628], neonP: 0.08, neonColors: [C.violet, C.magenta],
    signP: 0.1, vsignP: 0.05, holoP: 0.04, brandP: 0.05, screenP: 0.03, lang: ['en'], lamp: 0, rotJitter: 0.01, props: { crane: 0.3, palm: 0.6, dumpster: 0.4 }, street_: 0.2, parked: 1.5, setback: 6,
  },
  westwind: {
    block: 92, street: 22, lots: 2, density: 0.85, hMin: 14, hMax: 46, hPow: 1.3, tallP: 0.05, tallMul: 2, lit: 0.26,
    styles: [STYLE.residential, STYLE.residential, STYLE.unfinished], colors: [0x2c2c30, 0x34302e, 0x282a2e], neonP: 0.12,
    neonColors: [C.violet, C.orange, C.cyan], signP: 0.35, vsignP: 0.1, holoP: 0.05, brandP: 0.05, screenP: 0.05, lang: ['en'], lamp: C.sodium, rotJitter: 0.01,
    props: { ac: 0.6, palm: 0.3, antenna: 0.3, dumpster: 0.4 }, street_: 0.4, parked: 3, setback: 3,
  },
  badlands: {
    block: 400, street: 0, lots: 1, density: 0, hMin: 4, hMax: 8, hPow: 1, tallP: 0, tallMul: 1, lit: 0.2, styles: [STYLE.house],
    colors: [0x3a3630], neonP: 0, neonColors: [], signP: 0, vsignP: 0, holoP: 0, brandP: 0, screenP: 0, lang: ['en'], lamp: 0, rotJitter: 0, props: {}, street_: 0, parked: 0, setback: 0,
  },
}

export interface Exclusion {
  x: number
  z: number
  r: number
}

export interface CityData {
  buildings: BuildingSet
  signs: SignSet
  holos: SignSet
  glow: GlowPoints
  props: PropInstance[]
}

export interface GenContext {
  rng: Rng
  route: Route
  index: RouteIndex
  atlas: Atlas
  city: CityData
  exclusions: Exclusion[]
}

function excluded(ex: Exclusion[], x: number, z: number, r: number): boolean {
  for (const e of ex) if (Math.hypot(e.x - x, e.z - z) < e.r + r) return true
  return false
}

function pickTile(rng: Rng, tiles: Tile[], langs: ('en' | 'jp' | 'cn')[]): Tile {
  const lang = rng.pick(langs)
  const pool = tiles.filter((t) => t.lang === lang)
  return rng.pick(pool.length ? pool : tiles)
}

/** Which face of a box faces the route; returns its outward normal and the sign rotation. */
function facing(b: { x: number; z: number; w: number; d: number }, tx: number, tz: number): { nx: number; nz: number; rot: number } {
  const dx = tx - b.x, dz = tz - b.z
  if (Math.abs(dx) * b.d > Math.abs(dz) * b.w) {
    const nx = Math.sign(dx) || 1
    return { nx, nz: 0, rot: nx > 0 ? Math.PI / 2 : -Math.PI / 2 }
  }
  const nz = Math.sign(dz) || 1
  return { nx: 0, nz, rot: nz > 0 ? 0 : Math.PI }
}

const STREET_PROP_COLORS = [0xaa2244, 0x2266aa, 0xaa8822, 0x22aa66, 0x883399, 0x664422]

export function generateDistricts(g: GenContext): void {
  const { rng, index, atlas, city, exclusions } = g
  for (const d of DISTRICTS) {
    const p = PRESETS[d.id]
    const drng = mulberry32(hashStr(d.id) ^ rng.int(0, 1e9))
    const [x0, z0, x1, z1] = d.box
    const pitch = p.block + p.street
    for (let bz = z0 + p.street / 2; bz + p.block <= z1; bz += pitch) {
      for (let bx = x0 + p.street / 2; bx + p.block <= x1; bx += pitch) {
        const cx = bx + p.block / 2, cz = bz + p.block / 2
        if (districtAt(cx, cz) !== d.id) continue
        if (coastDistance(cx, cz) < p.block * 0.75) continue
        if (excluded(exclusions, cx, cz, p.block * 0.6)) continue
        const near = index.nearest(cx, cz, p.block)
        const blockOnRoute = near.d < p.block
        const gy = terrainHeight(cx, cz)
        if (!blockOnRoute && p.street > 0) {
          city.buildings.add({
            x: cx, y: gy - 0.1, z: cz, w: p.block + 3, h: 0.3, d: p.block + 3, style: STYLE.house, color: 0x2a2a30, glow: 0, lit: 0, neon: 0, seed: drng.int(0, 500),
          })
        }
        if (p.lamp && drng.chance(0.85)) city.glow.add(bx - p.street / 2, gy + 9, bz - p.street / 2, p.lamp, 9)
        const lotSize = p.block / p.lots
        for (let lz = 0; lz < p.lots; lz++) {
          for (let lx = 0; lx < p.lots; lx++) {
            if (!drng.chance(p.density)) continue
            const lx0 = bx + lx * lotSize, lz0 = bz + lz * lotSize
            const fw = lotSize * drng.range(0.55, 0.92), fd = lotSize * drng.range(0.55, 0.92)
            const x = lx0 + lotSize / 2 + drng.range(-1, 1) * (lotSize - fw) * 0.4
            const z = lz0 + lotSize / 2 + drng.range(-1, 1) * (lotSize - fd) * 0.4
            const rad = Math.hypot(fw, fd) / 2
            const n = index.nearest(x, z, CORRIDOR + rad + 80)
            if (n.d < CORRIDOR + rad + p.setback) continue
            if (isWater(x, z) || excluded(exclusions, x, z, rad)) continue
            let h = p.hMin + (p.hMax - p.hMin) * Math.pow(drng.next(), p.hPow)
            if (drng.chance(p.tallP)) h *= p.tallMul
            // no needles: keep towers within ~5x their footprint
            h = Math.min(h, Math.max(fw, fd) * 5.5)
            const style = drng.pick(p.styles)
            const y = groundHeight(x, z, n.i >= 0 && n.d < Infinity ? { d: n.d, y: g.route.samples[n.i].y, highway: g.route.samples[n.i].kind === 'highway' } : null)
            const neonOn = drng.chance(p.neonP)
            const neon = neonOn ? (h > 60 ? drng.pick([1, 2, 3, 3]) : drng.pick([1, 1, 3])) : 0
            const glow = neonOn ? drng.pick(p.neonColors) : 0
            const rot = (drng.next() - 0.5) * 2 * p.rotJitter
            const color = drng.pick(p.colors)
            const lit = p.lit * drng.range(0.5, 1.4)
            const base: BuildingInstance = { x, y: y - 0.2, z, w: fw, h, d: fd, rot, style, color, glow, lit, neon, seed: drng.int(0, 1000) }
            // massing: plain box / podium + tower / stepped tiers
            let topW = fw, topD = fd
            if (h > 45 && drng.chance(0.45)) {
              const ph = drng.range(8, 20)
              city.buildings.add({ ...base, h: ph, neon: neonOn ? 2 : 0, seed: drng.int(0, 1000) })
              topW = fw * drng.range(0.5, 0.8)
              topD = fd * drng.range(0.5, 0.8)
              city.buildings.add({ ...base, y: y + ph - 0.4, h: h - ph, w: topW, d: topD, seed: drng.int(0, 1000) })
            } else {
              city.buildings.add(base)
            }
            if (h > 100 && drng.chance(0.6)) {
              const tw = topW * drng.range(0.5, 0.75), td = topD * drng.range(0.5, 0.75), th = h * drng.range(0.25, 0.6)
              city.buildings.add({ ...base, w: tw, d: td, y: y + h - 0.5, h: th, seed: drng.int(0, 1000), neon: neonOn ? 2 : 0 })
              h += th
              topW = tw
              topD = td
            } else if (h > 20 && drng.chance(0.5)) {
              // rooftop mechanical penthouse
              city.buildings.add({ ...base, w: topW * drng.range(0.25, 0.45), d: topD * drng.range(0.25, 0.45), y: y + h - 0.3, h: drng.range(2.5, 4.5), lit: 0, neon: 0, seed: drng.int(0, 1000) })
            }
            const top = y + h
            if (h > 110 || (h > 70 && drng.chance(0.4))) city.glow.add(x, top + 2, z, C.red, 5, 0.9)
            if (p.props.antenna && drng.chance(p.props.antenna) && h > 25) {
              city.props.push({ kind: 'antenna', x: x + (drng.next() - 0.5) * topW * 0.5, y: top, z: z + (drng.next() - 0.5) * topD * 0.5, rot: 0, s: drng.range(0.6, 1.6) })
            }
            if (p.props.watertower && drng.chance(p.props.watertower) && h < 60) {
              city.props.push({ kind: 'watertower', x: x + (drng.next() - 0.5) * topW * 0.4, y: top, z: z + (drng.next() - 0.5) * topD * 0.4, rot: 0, s: 1 })
            }
            if (p.props.ac && drng.chance(p.props.ac)) {
              const cnt = drng.int(1, 4)
              for (let i = 0; i < cnt; i++) city.props.push({ kind: 'ac', x: x + (drng.next() - 0.5) * topW * 0.8, y: top, z: z + (drng.next() - 0.5) * topD * 0.8, rot: 0, s: 1 })
            }
            const isFront = n.d < CORRIDOR + rad + 40
            const s = isFront ? g.route.samples[n.i] : null
            if (p.brandP && drng.chance(p.brandP) && h > 50 && s) {
              const t = drng.pick(atlas.brands)
              const face = facing({ x, z, w: topW, d: topD }, s.x, s.z)
              const sw = Math.min(topW * 0.8, 40), sh = sw / t.aspect
              const off = face.nx ? topW / 2 + 0.3 : topD / 2 + 0.3
              city.signs.add({ x: x + face.nx * off, y: top - sh * 0.9, z: z + face.nz * off, rot: face.rot, w: sw, h: sh, tile: t, intensity: 2.4 })
            }
            if (s) {
              const face = facing(base, s.x, s.z)
              const off = face.nx ? fw / 2 : fd / 2
              const along = face.nx ? fd : fw
              // facade video screens (opaque, bright)
              if (p.screenP && drng.chance(p.screenP) && h > 30 && along > 14) {
                const t = drng.pick(atlas.ads)
                const sw = Math.min(along * drng.range(0.45, 0.8), 34), sh = sw / t.aspect
                const sy = y + drng.range(h * 0.3, Math.max(h * 0.3 + 1, h - sh - 4))
                city.signs.add({ x: x + face.nx * (off + 0.4), y: sy + sh / 2, z: z + face.nz * (off + 0.4), rot: face.rot, w: sw, h: sh, tile: t, intensity: 1.5 })
                city.glow.add(x + face.nx * (off + 2), sy + sh / 2, z + face.nz * (off + 2), t.color, sw * 0.5)
              }
              if (p.signP && drng.chance(p.signP)) {
                const cnt = drng.int(1, h > 30 ? 3 : 2)
                for (let i = 0; i < cnt; i++) {
                  const t = pickTile(drng, atlas.signs, p.lang)
                  const sw = Math.min(along * drng.range(0.35, 0.8), 18), sh = sw / t.aspect
                  const sy = 3.5 + i * (sh + 1.2) + drng.range(0, 1.5)
                  if (sy + sh > h - 1) break
                  const slide = (drng.next() - 0.5) * (along - sw) * 0.8
                  const sx = x + face.nx * (off + 0.35) + (face.nz ? slide : 0)
                  const sz = z + face.nz * (off + 0.35) + (face.nx ? slide : 0)
                  city.signs.add({ x: sx, y: y + sy + sh / 2, z: sz, rot: face.rot, w: sw, h: sh, tile: t, intensity: drng.range(1.8, 2.8) })
                  city.glow.add(sx + face.nx * 0.5, y + sy + sh / 2, sz + face.nz * 0.5, t.color, sw * 0.7)
                }
              }
              if (p.vsignP && drng.chance(p.vsignP)) {
                const cnt = drng.int(1, 2)
                for (let i = 0; i < cnt; i++) {
                  const t = pickTile(drng, atlas.vsigns, p.lang)
                  const sh = Math.min(h * drng.range(0.35, 0.7), 22), sw = sh * t.aspect
                  const cornerSide = i === 0 ? 1 : -1
                  const cx2 = x + face.nx * (off + sw / 2 + 0.2) + (face.nz ? cornerSide * (along / 2 - sw) : 0)
                  const cz2 = z + face.nz * (off + sw / 2 + 0.2) + (face.nx ? cornerSide * (along / 2 - sw) : 0)
                  city.signs.add({ x: cx2, y: y + 4 + sh / 2, z: cz2, rot: face.rot + Math.PI / 2, w: sw, h: sh, tile: t, intensity: drng.range(1.8, 2.6) })
                }
              }
              if (p.holoP && drng.chance(p.holoP) && h > 40) {
                const t = drng.pick(atlas.holos)
                const hh = Math.min(h * drng.range(0.3, 0.55), 70), hw = hh * t.aspect
                const hy = drng.chance(0.5) ? top + hh / 2 + 2 : y + h * drng.range(0.35, 0.7)
                city.holos.add({ x: x + face.nx * (off + 1.2), y: hy, z: z + face.nz * (off + 1.2), rot: face.rot, w: hw, h: hh, tile: t, intensity: 1.6, scroll: drng.range(0.5, 1.5) })
              }
              // street level: awnings, vending machines, stalls, dumpsters
              if (p.street_ && drng.chance(p.street_)) {
                const cnt = drng.int(1, 3)
                for (let i = 0; i < cnt; i++) {
                  const slide = (drng.next() - 0.5) * (along - 6)
                  const px = x + face.nx * (off + 0.9) + (face.nz ? slide : 0)
                  const pz = z + face.nz * (off + 0.9) + (face.nx ? slide : 0)
                  const r = drng.next()
                  const facingRot = face.rot
                  if (r < 0.4) {
                    city.props.push({ kind: 'awning', x: px, y: y + 3.1, z: pz, rot: facingRot, s: drng.range(0.7, 1.4), color: drng.pick(STREET_PROP_COLORS) })
                  } else if (r < 0.7) {
                    city.props.push({ kind: 'vend', x: px - face.nx * 0.4, y, z: pz - face.nz * 0.4, rot: facingRot, s: 1 })
                    city.glow.add(px + face.nx * 0.6, y + 1.2, pz + face.nz * 0.6, drng.pick([C.cyan, C.pink, C.yellow]), 3)
                  } else if (r < 0.85 && (d.id === 'kabuki' || d.id === 'littlechina' || d.id === 'japantown' || d.id === 'vistadelrey')) {
                    city.props.push({ kind: 'stall', x: px + face.nx * 1.2, y, z: pz + face.nz * 1.2, rot: facingRot, s: 1, color: drng.pick(STREET_PROP_COLORS) })
                    city.glow.add(px + face.nx * 1.2, y + 2.3, pz + face.nz * 1.2, drng.pick([C.warmWindow, C.pink, C.red]), 5)
                  } else {
                    city.props.push({ kind: 'dumpster', x: px, y, z: pz, rot: facingRot + drng.range(-0.3, 0.3), s: 1 })
                  }
                }
              }
            } else if (p.holoP && drng.chance(p.holoP * 0.25) && h > 60) {
              const t = drng.pick(atlas.holos)
              const hh = Math.min(h * 0.4, 60), hw = hh * t.aspect
              city.holos.add({ x, y: top + hh / 2 + 3, z, rot: drng.range(0, Math.PI * 2), w: hw, h: hh, tile: t, intensity: 1.3, scroll: drng.range(0.5, 1.5) })
            }
          }
        }
        for (const [kind, prob] of Object.entries(p.props) as [PropKind, number][]) {
          if (kind === 'antenna' || kind === 'ac' || kind === 'watertower') continue
          const count = Math.floor(prob) + (drng.chance(prob % 1) ? 1 : 0)
          for (let i = 0; i < count; i++) {
            const px = bx + drng.range(4, p.block - 4), pz = bz + drng.range(4, p.block - 4)
            const pn = index.nearest(px, pz, 60)
            if (pn.d < CORRIDOR + 6) continue
            if (isWater(px, pz) || excluded(exclusions, px, pz, 6)) continue
            const py = groundHeight(px, pz, pn.i >= 0 ? { d: pn.d, y: g.route.samples[pn.i].y, highway: g.route.samples[pn.i].kind === 'highway' } : null)
            city.props.push({ kind, x: px, y: py, z: pz, rot: drng.range(0, Math.PI * 2), s: drng.range(0.8, 1.3), color: drng.pick([0x8a2a2a, 0x2a5a8a, 0x8a7a2a, 0x3a6a3a, 0x6a6a6a]) })
          }
        }
      }
    }
  }
}

/** Roadside dressing per district: trees and estate walls on the hills, container stacks in the docks. */
export function generateRoadside(g: GenContext): void {
  const { rng, route, city } = g
  const drng = mulberry32(rng.int(0, 1e9) ^ 0x7ee)
  for (let s = 0; s < route.length; s += 12) {
    const smp = route.at(s)
    if (smp.kind === 'highway') continue
    const d = smp.district
    const l = Math.hypot(smp.tx, smp.tz) || 1
    const rx = -smp.tz / l, rz = smp.tx / l
    const heading = Math.atan2(smp.tx, smp.tz)
    const side = (Math.floor(s / 12) % 2 === 0 ? 1 : -1)
    const at = (off: number) => [smp.x + rx * off * side, smp.z + rz * off * side] as const
    const gy = (x: number, z: number) => groundHeight(x, z, { d: Math.hypot(x - smp.x, z - smp.z), y: smp.y, highway: false })
    if (d === 'northoak' || d === 'charterhill' || d === 'rancho' || d === 'glen') {
      if (drng.chance(d === 'northoak' ? 0.8 : 0.4)) {
        const [x, z] = at(ROAD_HALF + drng.range(4, 9))
        if (!isWater(x, z)) city.props.push({ kind: 'tree', x, y: gy(x, z), z, rot: drng.range(0, 6.28), s: drng.range(0.7, 1.4) })
      }
      if (d === 'northoak' && Math.floor(s / 12) % 6 === 0) {
        // estate wall with warm gate lamps
        const [x, z] = at(ROAD_HALF + 14)
        if (!isWater(x, z)) {
          city.buildings.add({ x, y: gy(x, z) - 0.3, z, w: 1.2, h: 2.6, d: 60, rot: -heading, style: STYLE.house, color: 0x2a2624, glow: 0, lit: 0, neon: 0 })
          city.glow.add(x, gy(x, z) + 3.2, z, C.warmWindow, 4)
        }
      }
    } else if ((d === 'northside' || d === 'waterfront' || d === 'arroyo') && drng.chance(0.55)) {
      const [x, z] = at(ROAD_HALF + drng.range(3, 6))
      if (isWater(x, z)) continue
      const y = gy(x, z)
      const n = drng.int(1, 3)
      for (let i = 0; i < n; i++) city.props.push({ kind: 'container', x, y: y + i * 2.6, z, rot: heading + drng.range(-0.06, 0.06), s: 1, color: drng.pick([0x8a2a2a, 0x2a5a8a, 0x8a7a2a, 0x3a6a3a, 0x6a6a6a, 0x8a4a1a]) })
    } else if (d === 'wellsprings' || d === 'coastview') {
      if (smp.kind === 'coast' && Math.floor(s / 12) % 3 === 0) {
        const [x, z] = at(ROAD_HALF + 3)
        if (!isWater(x, z)) city.props.push({ kind: 'palm', x, y: gy(x, z), z, rot: drng.range(0, 6.28), s: drng.range(0.9, 1.3) })
      }
    }
  }
}

/** Walkways, pipes and sign bridges crossing over the street in dense districts. */
export function generateOverheads(g: GenContext): void {
  const { rng, route, city, atlas } = g
  const drng = mulberry32(rng.int(0, 1e9) ^ 0x0b3)
  for (let s = 40; s < route.length; s += drng.range(90, 170)) {
    const smp = route.at(s)
    if (smp.kind !== 'street') continue
    const p = PRESETS[smp.district]
    if (p.street_ < 0.6 || !drng.chance(0.7)) continue
    const l = Math.hypot(smp.tx, smp.tz) || 1
    const rx = -smp.tz / l, rz = smp.tx / l
    const heading = Math.atan2(smp.tx, smp.tz)
    const span = ROAD_HALF * 2 + 14
    const h = drng.range(9, 18)
    const kind = drng.next()
    if (kind < 0.45) {
      // enclosed walkway between the two sides
      city.buildings.add({ x: smp.x, y: smp.y + h, z: smp.z, w: span, h: 3.2, d: 4, rot: -heading, style: STYLE.residential, color: drng.pick([0x22242c, 0x2a2430]), glow: drng.pick(p.neonColors), lit: 0.6, neon: drng.chance(0.6) ? 3 : 0, seed: drng.int(0, 999) })
    } else if (kind < 0.75) {
      // pipe bundle
      for (let i = 0; i < 3; i++) city.buildings.add({ x: smp.x, y: smp.y + h + i * 0.9, z: smp.z + (i - 1) * 0.2, w: span, h: 0.7, d: 0.7, rot: -heading, style: STYLE.industrial, color: 0x3a3a40, glow: 0, lit: 0, neon: 0 })
    } else {
      // sign bridge with hanging neon
      city.buildings.add({ x: smp.x, y: smp.y + h, z: smp.z, w: span, h: 0.5, d: 0.5, rot: -heading, style: STYLE.house, color: 0x2a2a30, glow: 0, lit: 0, neon: 0 })
      const cnt = drng.int(2, 4)
      for (let i = 0; i < cnt; i++) {
        const t = pickTile(drng, atlas.signs, p.lang)
        const sw = drng.range(4, 7), sh = sw / t.aspect
        const off = (i - (cnt - 1) / 2) * (span / cnt)
        city.signs.add({ x: smp.x + rx * off, y: smp.y + h - sh / 2 - 0.4, z: smp.z + rz * off, rot: heading + Math.PI, w: sw, h: sh, tile: t, intensity: 2.2 })
        city.glow.add(smp.x + rx * off, smp.y + h - sh / 2, smp.z + rz * off, t.color, sw * 0.6)
      }
    }
    // support posts
    for (const sg of [-1, 1]) {
      city.buildings.add({ x: smp.x + rx * (span / 2 - 0.6) * sg, y: smp.y - 0.4, z: smp.z + rz * (span / 2 - 0.6) * sg, w: 1.3, h: h + 1.5, d: 1.3, rot: -heading, style: STYLE.house, color: 0x26262c, glow: 0, lit: 0, neon: 0 })
    }
  }
}

/** Parked cars along the route, on both sides. */
export function generateParked(g: GenContext): void {
  const { rng, route, city } = g
  const drng = mulberry32(rng.int(0, 1e9) ^ 0xca5)
  const CAR_COLORS = [0x1a1a1e, 0x2a2a30, 0x3a1a1a, 0x1a2a3a, 0x4a4a50, 0x2a1a3a, 0x8a8a90, 0x1a3a2a, 0x5a2a10, 0x101018, 0xb0b0b8, 0x7a1010]
  for (let s = 0; s < route.length; s += 9) {
    const smp = route.at(s)
    if (smp.kind === 'highway' || smp.kind === 'badlands' || smp.kind === 'hill' || smp.kind === 'coast') continue
    const per100 = PRESETS[smp.district].parked
    if (!drng.chance(per100 * 0.09)) continue
    const side = drng.chance(0.5) ? 1 : -1
    const l = Math.hypot(smp.tx, smp.tz) || 1
    const rx = -smp.tz / l, rz = smp.tx / l
    const off = (ROAD_HALF + 2.6) * side
    const x = smp.x + rx * off, z = smp.z + rz * off
    if (isWater(x, z)) continue
    const heading = Math.atan2(smp.tx, smp.tz) + (side > 0 ? 0 : Math.PI) + drng.range(-0.05, 0.05)
    city.props.push({ kind: 'car', x, y: smp.y - 0.35, z, rot: heading, s: 1, color: drng.pick(CAR_COLORS) })
    if (drng.chance(0.12)) city.glow.add(x, smp.y, z, drng.pick([C.cyan, C.magenta, C.violet]), 5)
  }
}

/** Overhead destination gantries on highways + lamp posts are placed by RoadSystem; this adds the sign planes. */
export function generateGantries(g: GenContext): void {
  const { route, city, atlas } = g
  let k = 0
  for (let s = 250; s < route.length; s += 480) {
    const smp = route.at(s)
    if (smp.kind !== 'highway') continue
    const l = Math.hypot(smp.tx, smp.tz) || 1
    const rx = -smp.tz / l, rz = smp.tx / l
    const heading = Math.atan2(smp.tx, smp.tz)
    const half = HIGHWAY_HALF + 1.5
    // beam + posts as dark boxes
    city.buildings.add({ x: smp.x, y: smp.y + 6.2, z: smp.z, w: half * 2 + 1, h: 0.7, d: 0.6, rot: -heading, style: STYLE.house, color: 0x26262c, glow: 0, lit: 0, neon: 0 })
    for (const sg of [-1, 1]) {
      city.buildings.add({ x: smp.x + rx * half * sg, y: smp.y - 0.5, z: smp.z + rz * half * sg, w: 0.6, h: 7, d: 0.6, style: STYLE.house, color: 0x26262c, glow: 0, lit: 0, neon: 0 })
    }
    // name the next real district the road reaches (skip badlands gaps between boxes)
    let ahead: DistrictId = 'badlands'
    for (let look = 300; look < 4000; look += 100) {
      const d = route.at(s + look).district
      if (d !== smp.district && d !== 'badlands') { ahead = d; break }
    }
    const t = atlas.gantryFor[ahead] ?? atlas.gantries[k % atlas.gantries.length]
    k++
    const w = 9, h = w / t.aspect
    // sign faces back toward the driver: plane faces +z at rot 0, driver approaches along +tangent
    city.signs.add({ x: smp.x + rx * 3.5, y: smp.y + 6.6 + h / 2, z: smp.z + rz * 3.5, rot: heading + Math.PI, w, h, tile: t, intensity: 1.3 })
    city.glow.add(smp.x + rx * 3.5, smp.y + 6.6 + h, smp.z + rz * 3.5, C.white, 4)
  }
}

/** Sparse desert props well outside the city. */
export function generateBadlands(g: GenContext): void {
  const { rng, index, city } = g
  const drng = mulberry32(rng.int(0, 1e9))
  for (let z = -3600; z < 3600; z += 80) {
    for (let x = -3600; x < 3600; x += 80) {
      const px = x + drng.range(-30, 30), pz = z + drng.range(-30, 30)
      if (districtAt(px, pz) !== 'badlands' || isWater(px, pz)) continue
      const cityR = Math.max(Math.abs(px + 300) / 2900, Math.abs(pz - 100) / 2800)
      if (cityR < 0.98) continue
      if (index.nearest(px, pz, 40).d < 30) continue
      const r = drng.next()
      const y = terrainHeight(px, pz)
      if (r < 0.06) city.props.push({ kind: 'turbine', x: px, y, z: pz, rot: 0.6, s: drng.range(0.9, 1.4) })
      else if (r < 0.1) city.props.push({ kind: 'pumpjack', x: px, y, z: pz, rot: drng.range(0, 6.28), s: 1 })
      else if (r < 0.16) city.props.push({ kind: 'solar', x: px, y, z: pz, rot: 0, s: drng.range(1, 2) })
      else if (r < 0.19) {
        city.buildings.add({ x: px, y, z: pz, w: drng.range(6, 14), h: drng.range(3, 5), d: drng.range(6, 12), rot: drng.range(0, 6.28), style: STYLE.industrial, color: 0x4a4038, glow: C.sodium, lit: 0.3, neon: 0, seed: drng.int(0, 999) })
        city.glow.add(px, y + 5, pz, C.sodium, 6)
      } else if (r < 0.45) {
        city.props.push({ kind: 'tree', x: px, y, z: pz, rot: drng.range(0, 6.28), s: drng.range(0.3, 0.6) })
      }
    }
  }
}
