/**
 * Dynamic light pool. A fixed number of three.js lights (so shaders never
 * recompile) is re-targeted every frame to the street lamps and neon signs
 * nearest to the car, plus two headlight spots attached to the camera.
 * Custom shaders (buildings, roads) read the same uniforms via lights:true;
 * MeshStandardMaterial props, cars and the cockpit get them for free.
 */
import { Color, Group, Object3D, PointLight, SpotLight, Vector3 } from 'three'
import { ATMOS, type TimePreset } from '../tokens'
import { Q } from '../quality'

export interface LampEntry {
  s: number
  x: number
  y: number
  z: number
  color: number
}

export interface NeonEntry {
  x: number
  y: number
  z: number
  color: number
  size: number
}

export const N_LAMPS = Q.lamps
export const N_NEON = Q.neon

export class LightPool {
  group = new Group()
  lamps: PointLight[] = []
  neons: PointLight[] = []
  head: SpotLight[] = []
  private lampList: LampEntry[] = []
  private neonGrid = new Map<number, NeonEntry[]>()
  private cell = 48
  private tmp = new Vector3()

  constructor() {
    for (let i = 0; i < N_LAMPS; i++) {
      const l = new PointLight(0xffffff, 0, 70, 2)
      this.lamps.push(l)
      this.group.add(l)
    }
    for (let i = 0; i < N_NEON; i++) {
      const l = new PointLight(0xff00ff, 0, 40, 2)
      this.neons.push(l)
      this.group.add(l)
    }
    for (let i = 0; i < 2; i++) {
      const s = new SpotLight(0xfff4e0, 0, 90, 0.42, 0.8, 2)
      s.target = new Object3D()
      this.group.add(s, s.target)
      this.head.push(s)
    }
  }

  /** Lamps along the route, sorted by s. */
  setLamps(list: LampEntry[]): void {
    this.lampList = list.slice().sort((a, b) => a.s - b.s)
  }

  /** Neon sign halos (only the bigger ones are worth a light). */
  setNeon(list: NeonEntry[]): void {
    this.neonGrid.clear()
    for (const n of list) {
      if (n.size < 6) continue
      const k = this.key(n.x, n.z)
      let arr = this.neonGrid.get(k)
      if (!arr) this.neonGrid.set(k, (arr = []))
      arr.push(n)
    }
  }

  private key(x: number, z: number): number {
    return (Math.floor(x / this.cell) + 4096) * 8192 + (Math.floor(z / this.cell) + 4096)
  }

  update(s: number, routeLength: number, cam: Vector3, forward: Vector3, right: Vector3, preset: TimePreset, headOn: boolean): void {
    const a = ATMOS[preset]
    const k = a.lights
    // ---- street lamps: window of the sorted list around s (wraps at the loop end)
    const lo = s - 40, hi = s + 260
    const picked: LampEntry[] = []
    const pick = (from: number, to: number) => {
      // binary search first index >= from
      let l = 0, r = this.lampList.length
      while (l < r) { const m = (l + r) >> 1; if (this.lampList[m].s < from) l = m + 1; else r = m }
      for (let i = l; i < this.lampList.length && this.lampList[i].s <= to; i++) picked.push(this.lampList[i])
    }
    pick(lo, hi)
    if (lo < 0) pick(routeLength + lo, routeLength)
    if (hi > routeLength) pick(0, hi - routeLength)
    picked.sort((p, q) => Math.hypot(p.x - cam.x, p.z - cam.z) - Math.hypot(q.x - cam.x, q.z - cam.z))
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i]
      const e = picked[i]
      if (!e || k < 0.2) { l.intensity = 0; continue }
      l.position.set(e.x, e.y, e.z)
      l.color.set(e.color)
      l.intensity = 320 * k
      l.distance = 75
    }
    // ---- neon: nearest halos within 2 cells
    const cx = Math.floor(cam.x / this.cell), cz = Math.floor(cam.z / this.cell)
    const near: { e: NeonEntry; d: number }[] = []
    for (let gx = cx - 2; gx <= cx + 2; gx++) {
      for (let gz = cz - 2; gz <= cz + 2; gz++) {
        const arr = this.neonGrid.get((gx + 4096) * 8192 + (gz + 4096))
        if (!arr) continue
        for (const e of arr) {
          // prefer things ahead of the car
          const dx = e.x - cam.x, dz = e.z - cam.z
          const ahead = dx * forward.x + dz * forward.z
          const d = Math.hypot(dx, dz) - Math.max(0, ahead) * 0.4
          near.push({ e, d })
        }
      }
    }
    near.sort((p, q) => p.d - q.d)
    for (let i = 0; i < this.neons.length; i++) {
      const l = this.neons[i]
      const n = near[i]
      if (!n || k < 0.2) { l.intensity = 0; continue }
      l.position.set(n.e.x, n.e.y, n.e.z)
      l.color.set(n.e.color)
      l.intensity = 60 * k * Math.min(1.6, n.e.size / 8)
      l.distance = 45
    }
    // ---- headlights
    for (let i = 0; i < 2; i++) {
      const h = this.head[i]
      const side = i === 0 ? -0.75 : 0.75
      // in front of the bonnet so the cockpit itself never sits inside the cone
      h.position.copy(cam).addScaledVector(forward, 3.4).addScaledVector(right, side)
      h.position.y = cam.y - 0.55
      this.tmp.copy(h.position).addScaledVector(forward, 40)
      this.tmp.y -= 2.6
      h.target.position.copy(this.tmp)
      h.target.updateMatrixWorld()
      h.intensity = headOn ? 260 * (0.35 + 0.65 * k) : 0
      h.color.set(0xfff2dc)
    }
  }

  /** Warm-up: make sure a colour object exists per light (avoids per-frame allocation). */
  static color(c: number): Color {
    return new Color(c)
  }
}
