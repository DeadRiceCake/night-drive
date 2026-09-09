/**
 * Hand-placed landmarks that make the map read as Night City: Arasaka Tower
 * and the corpo cluster, the megabuildings, Pacifica's stadium and mall, the
 * Arroyo power plant, the Arasaka estate in North Oak.
 */
import { CylinderGeometry, LatheGeometry, Mesh, MeshStandardMaterial, Group, Vector2, BoxGeometry, ConeGeometry } from 'three'
import { C } from '../tokens'
import { STYLE } from './buildings'
import { terrainHeight } from './map'
import type { Exclusion, GenContext } from './generator'

export const EXCLUSIONS: Exclusion[] = [
  { x: -520, z: -80, r: 150 }, // Arasaka Tower + plaza
  { x: -330, z: 160, r: 90 }, // memorial
  { x: -700, z: 220, r: 80 },
  { x: -350, z: 300, r: 70 },
  { x: -790, z: -260, r: 80 },
  { x: -230, z: -320, r: 70 },
  { x: 360, z: -260, r: 80 }, // Konpeki
  { x: -470, z: -830, r: 140 }, // H10
  { x: 1180, z: -330, r: 130 }, // H8
  { x: -950, z: 2080, r: 170 }, // stadium
  { x: -1150, z: 1760, r: 150 }, // mall
  { x: 2220, z: 880, r: 190 }, // power plant
  { x: 2200, z: -1720, r: 140 }, // Arasaka estate
  { x: 780, z: -1150, r: 40 }, // Kabuki roundabout centre
]

export function placeLandmarks(g: GenContext): Group {
  const { city, atlas } = g
  const B = city.buildings
  const group = new Group()
  const brand = (name: string) => atlas.brands.find((t) => t.text === name) ?? atlas.brands[0]

  // ---------------------------------------------------------- Arasaka Tower
  {
    const x = -520, z = -80
    B.add({ x, y: 0, z, w: 150, h: 12, d: 150, style: STYLE.arasaka, color: 0x14141a, glow: C.arasakaRed, lit: 0, neon: 2 })
    B.add({ x, y: 0, z, w: 140, h: 200, d: 140, style: STYLE.arasaka, color: 0x16161e, glow: C.arasakaRed, lit: 0, neon: 3 })
    B.add({ x, y: 199, z, w: 112, h: 330, d: 112, style: STYLE.arasaka, color: 0x16161e, glow: C.arasakaRed, lit: 0, neon: 3 })
    B.add({ x, y: 528, z, w: 84, h: 340, d: 84, style: STYLE.arasaka, color: 0x18181f, glow: C.arasakaRed, lit: 0, neon: 3 })
    // slanted crown: a box sheared by rotating a thin wedge
    const crown = new Mesh(new ConeGeometry(66, 110, 4, 1), new MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.7, roughness: 0.4, emissive: 0x330008, emissiveIntensity: 0.6 }))
    crown.position.set(x, 868 + 45, z)
    crown.rotation.y = Math.PI / 4
    group.add(crown)
    // big red logotype on all four sides near the top
    const t = brand('ARASAKA')
    const sw = 72, sh = sw / t.aspect
    for (const [nx, nz, rot] of [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]] as const) {
      city.signs.add({ x: x + nx * 42.5, y: 820, z: z + nz * 42.5, rot, w: sw, h: sh, tile: t, intensity: 3 })
    }
    city.glow.add(x, 960, z, C.arasakaRed, 22, 1.2)
    city.glow.add(x, 870, z, C.arasakaRed, 60)
    // red edge lights up all four corners
    for (let y = 14; y < 868; y += 14) {
      const s = y < 200 ? 70 : y < 528 ? 56 : 42
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) city.glow.add(x + s * sx, y, z + s * sz, C.arasakaRed, 3.2)
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      city.glow.add(x + Math.cos(a) * 52, 913, z + Math.sin(a) * 52, C.arasakaRed, 6)
    }
  }
  // ---------------------------------------------------------- Corpo cluster
  const corpo = (x: number, z: number, w: number, h: number, name: string, color: number, glowC: number, style: number = STYLE.glass) => {
    B.add({ x, y: 0, z, w, h, d: w, style, color, glow: glowC, lit: 0.6, neon: 3 })
    B.add({ x, y: h - 0.5, z, w: w * 0.6, h: h * 0.22, d: w * 0.6, style, color, glow: glowC, lit: 0.6, neon: 2 })
    const t = brand(name)
    const sw = Math.min(w * 0.9, 44), sh = sw / t.aspect
    city.signs.add({ x, y: h + h * 0.22 - sh, z: z + w * 0.3 + 0.4, rot: 0, w: sw, h: sh, tile: t, intensity: 2.6 })
    city.signs.add({ x, y: h + h * 0.22 - sh, z: z - w * 0.3 - 0.4, rot: Math.PI, w: sw, h: sh, tile: t, intensity: 2.6 })
    city.signs.add({ x: x + w * 0.3 + 0.4, y: h + h * 0.22 - sh, z, rot: Math.PI / 2, w: sw, h: sh, tile: t, intensity: 2.6 })
    city.signs.add({ x: x - w * 0.3 - 0.4, y: h + h * 0.22 - sh, z, rot: -Math.PI / 2, w: sw, h: sh, tile: t, intensity: 2.6 })
    city.glow.add(x, h * 1.22 + 3, z, C.red, 6, 0.8)
  }
  corpo(-700, 220, 70, 330, 'MILITECH', 0x0f1a2a, 0x3ab0ff)
  corpo(-350, 300, 62, 290, 'KANG TAO', 0x1a1610, C.gold)
  corpo(-790, -260, 66, 300, 'PETROCHEM', 0x14201a, C.orange)
  corpo(-230, -320, 58, 250, 'BIOTECHNICA', 0x10201a, C.green)
  corpo(360, -260, 64, 230, 'KONPEKI PLAZA', 0x101828, C.cyan, STYLE.luxury)
  corpo(120, 380, 60, 210, 'ZETATECH', 0x1a1020, C.magenta)
  corpo(-950 + 130, -420, 54, 200, 'KIROSHI', 0x0e1a20, C.cyan)
  // memorial: black plinth + tall thin spire of light
  B.add({ x: -330, y: 0, z: 160, w: 60, h: 1.2, d: 60, style: STYLE.house, color: 0x202028, glow: 0, lit: 0, neon: 0 })
  B.add({ x: -330, y: 0, z: 160, w: 4, h: 60, d: 4, style: STYLE.arasaka, color: 0x0a0a0e, glow: C.white, lit: 0, neon: 1 })
  city.glow.add(-330, 62, 160, C.white, 14)
  for (let a = 0; a < 12; a++) {
    const px = -330 + Math.cos((a / 12) * Math.PI * 2) * 26, pz = 160 + Math.sin((a / 12) * Math.PI * 2) * 26
    city.glow.add(px, 1.5, pz, C.cyan, 3)
  }

  // ---------------------------------------------------------- Megabuildings
  const mega = (x: number, z: number, name: string, glowC: number) => {
    const y = terrainHeight(x, z)
    B.add({ x, y, z, w: 210, h: 95, d: 210, style: STYLE.mega, color: 0x22242c, glow: glowC, lit: 0.55, neon: 3 })
    B.add({ x, y: y + 94, z, w: 170, h: 110, d: 170, style: STYLE.mega, color: 0x1e2028, glow: glowC, lit: 0.55, neon: 3 })
    B.add({ x, y: y + 203, z, w: 128, h: 90, d: 128, style: STYLE.mega, color: 0x22242c, glow: glowC, lit: 0.5, neon: 3 })
    B.add({ x, y: y + 292, z, w: 80, h: 50, d: 80, style: STYLE.mega, color: 0x1e2028, glow: glowC, lit: 0.5, neon: 2 })
    const t = brand(name)
    const sw = 120, sh = sw / t.aspect
    city.signs.add({ x, y: y + 200 - sh, z: z + 86, rot: 0, w: sw, h: sh, tile: t, intensity: 2.8 })
    city.signs.add({ x, y: y + 200 - sh, z: z - 86, rot: Math.PI, w: sw, h: sh, tile: t, intensity: 2.8 })
    city.signs.add({ x: x + 86, y: y + 200 - sh, z, rot: Math.PI / 2, w: sw, h: sh, tile: t, intensity: 2.8 })
    city.signs.add({ x: x - 86, y: y + 200 - sh, z, rot: -Math.PI / 2, w: sw, h: sh, tile: t, intensity: 2.8 })
    for (const h of atlas.holos.slice(0, 4)) {
      const a = atlas.holos.indexOf(h) * (Math.PI / 2)
      city.holos.add({ x: x + Math.cos(a) * 108, y: y + 60, z: z + Math.sin(a) * 108, rot: -a + Math.PI / 2, w: 40, h: 40 / h.aspect, tile: h, intensity: 1.6, scroll: 1 })
    }
    city.glow.add(x, y + 346, z, C.red, 8, 1)
    city.props.push({ kind: 'antenna', x: x + 20, y: y + 342, z: z + 10, rot: 0, s: 2.5 })
  }
  mega(-470, -830, 'MEGABUILDING H10', C.yellow)
  mega(1180, -330, 'MEGABUILDING H10', C.pink)

  // ---------------------------------------------------------- Pacifica
  {
    // stadium ring: 28 box segments + floodlight pylons; mostly dark, one purple glow
    const x = -950, z = 2080, r = 120
    const y = terrainHeight(x, z)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      B.add({ x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, w: 30, h: 42 + (i % 3) * 4, d: 22, rot: -a, style: STYLE.unfinished, color: 0x2c2c30, glow: C.violet, lit: 0.05, neon: i % 7 === 0 ? 2 : 0 })
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const px = x + Math.cos(a) * (r + 18), pz = z + Math.sin(a) * (r + 18)
      B.add({ x: px, y, z: pz, w: 3, h: 70, d: 3, style: STYLE.industrial, color: 0x303038, glow: 0, lit: 0, neon: 0 })
      city.glow.add(px, y + 70, pz, C.violet, 10, i === 2 ? 0.25 : 0)
    }
    // Grand Imperial Mall: huge unfinished block with sparse violet neon
    const mx = -1150, mz = 1760
    B.add({ x: mx, y: terrainHeight(mx, mz), z: mz, w: 220, h: 34, d: 170, style: STYLE.unfinished, color: 0x2a2a2e, glow: C.violet, lit: 0.04, neon: 2 })
    B.add({ x: mx + 40, y: terrainHeight(mx, mz) + 33, z: mz - 30, w: 90, h: 40, d: 60, style: STYLE.unfinished, color: 0x26262a, glow: C.magenta, lit: 0.06, neon: 0 })
    city.props.push({ kind: 'crane', x: mx - 90, y: terrainHeight(mx, mz), z: mz + 60, rot: 0.8, s: 1.3 })
    city.props.push({ kind: 'crane', x: mx + 110, y: terrainHeight(mx, mz), z: mz + 90, rot: 2.4, s: 1.1 })
    const t = atlas.holos[Math.min(14, atlas.holos.length - 1)]
    city.holos.add({ x: mx, y: terrainHeight(mx, mz) + 60, z: mz + 88, rot: 0, w: 60, h: 60 / t.aspect, tile: t, intensity: 1.2, scroll: 0.6 })
  }

  // ---------------------------------------------------------- Arroyo power plant
  {
    const x = 2220, z = 880
    const y = terrainHeight(x, z)
    const mat = new MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9, metalness: 0.1 })
    const profile: Vector2[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      const rr = 34 * (1 - 0.55 * Math.sin(t * Math.PI * 0.9)) + 6 * t
      profile.push(new Vector2(rr, t * 110))
    }
    const lathe = new LatheGeometry(profile, 32)
    for (const [dx, dz] of [[-70, -40], [10, -60], [80, -30]] as const) {
      const m = new Mesh(lathe, mat)
      m.position.set(x + dx, y, z + dz)
      group.add(m)
      city.glow.add(x + dx, y + 112, z + dz, C.red, 6, 0.7)
    }
    B.add({ x, y, z, w: 180, h: 28, d: 60, style: STYLE.industrial, color: 0x30302c, glow: C.sodium, lit: 0.35, neon: 2 })
    B.add({ x: x - 60, y, z: z + 70, w: 90, h: 18, d: 50, style: STYLE.industrial, color: 0x34322c, glow: C.orange, lit: 0.3, neon: 0 })
    for (let i = 0; i < 5; i++) city.props.push({ kind: 'chimney', x: x + 60 + i * 18, y, z: z + 70, rot: 0, s: 1.4 })
    for (let i = 0; i < 6; i++) city.props.push({ kind: 'tank', x: x - 120 + i * 30, y, z: z + 120, rot: 0, s: 1.2 })
    const chim = new Mesh(new CylinderGeometry(4, 6, 140, 12), mat)
    chim.position.set(x + 120, y + 70, z + 30)
    group.add(chim)
    city.glow.add(x + 120, y + 142, z + 30, C.red, 6, 0.6)
    const t = brand('PETROCHEM')
    city.signs.add({ x, y: y + 24, z: z + 30.4, rot: 0, w: 60, h: 60 / t.aspect, tile: t, intensity: 2.4 })
  }

  // ---------------------------------------------------------- Arasaka estate (North Oak)
  {
    const x = 2200, z = -1720
    const y = terrainHeight(x, z)
    B.add({ x, y, z, w: 120, h: 14, d: 70, style: STYLE.luxury, color: 0x1a1618, glow: C.arasakaRed, lit: 0.5, neon: 2 })
    B.add({ x: x + 30, y: y + 13, z: z - 10, w: 50, h: 12, d: 40, style: STYLE.luxury, color: 0x1a1618, glow: C.arasakaRed, lit: 0.5, neon: 2 })
    B.add({ x: x - 70, y, z: z + 30, w: 30, h: 26, d: 30, style: STYLE.arasaka, color: 0x0c0c10, glow: C.arasakaRed, lit: 0, neon: 3 })
    const t = brand('ARASAKA')
    city.signs.add({ x: x - 70, y: y + 20, z: z + 45.4, rot: 0, w: 24, h: 24 / t.aspect, tile: t, intensity: 2.6 })
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      city.glow.add(x + Math.cos(a) * 95, y + 1.5, z + Math.sin(a) * 60, C.pink, 2.5)
    }
  }

  // ---------------------------------------------------------- Kabuki market roundabout
  {
    const x = 780, z = -1150
    const y = terrainHeight(x, z)
    B.add({ x, y, z, w: 26, h: 9, d: 26, rot: 0.4, style: STYLE.residential, color: 0x2a2226, glow: C.magenta, lit: 0.7, neon: 3 })
    B.add({ x, y: y + 8.5, z, w: 14, h: 30, d: 14, rot: 0.4, style: STYLE.residential, color: 0x26202a, glow: C.cyan, lit: 0.7, neon: 3 })
    for (let i = 0; i < 6; i++) {
      const t = atlas.vsigns[i * 3 % atlas.vsigns.length]
      const a = (i / 6) * Math.PI * 2
      city.signs.add({ x: x + Math.cos(a) * 9, y: y + 22, z: z + Math.sin(a) * 9, rot: -a + Math.PI / 2, w: 3, h: 3 / t.aspect, tile: t, intensity: 2.6 })
    }
    city.glow.add(x, y + 40, z, C.magenta, 16)
  }

  // Watson docks: big warehouses along the north shore + cranes
  for (let i = 0; i < 6; i++) {
    const x = -700 + i * 230, z = -2290
    B.add({ x, y: 0, z, w: 150, h: 16, d: 60, style: STYLE.industrial, color: 0x2a2c30, glow: C.sodium, lit: 0.25, neon: 0 })
    city.props.push({ kind: 'crane', x: x + 60, y: 0, z: z - 60, rot: Math.PI, s: 1.4 })
  }

  // low ground under stadium and mall so they sit flat
  const slab = new Mesh(new BoxGeometry(600, 0.6, 500), new MeshStandardMaterial({ color: 0x1a1a1e, roughness: 1 }))
  slab.position.set(-1000, terrainHeight(-1000, 1900) - 0.2, 1900)
  group.add(slab)
  return group
}
