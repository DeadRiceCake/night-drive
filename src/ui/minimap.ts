/**
 * Heading-up minimap: district polygons, coastline, the drive route and the
 * car. Drawn into one canvas that is both shown in the HUD (DOM) and used as
 * the cockpit navigation screen texture.
 */
import { CanvasTexture, SRGBColorSpace } from 'three'
import { DISTRICTS, coastX, districtName, type DistrictId } from '../city/map'
import type { Route } from '../city/route'

const REGION_COLOR: Record<string, string> = {
  citycenter: '#3a2e5c', watson: '#5c2a3a', westbrook: '#5c3a2a', heywood: '#2a4a5c', santodomingo: '#5c4a2a', pacifica: '#2a3a3a', badlands: '#3a3226',
}

export class Minimap {
  canvas: HTMLCanvasElement
  texture: CanvasTexture
  private ctx: CanvasRenderingContext2D
  private routePts: [number, number][] = []
  private last = 0
  /** metres shown across the canvas */
  span = 1700
  size = 512

  constructor(route: Route) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.size
    this.canvas.height = this.size
    this.canvas.className = 'minimap'
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    for (let i = 0; i < route.count; i += 8) this.routePts.push([route.samples[i].x, route.samples[i].z])
  }

  /** @param heading radians, direction of travel (atan2(tx, tz)) */
  draw(x: number, z: number, heading: number, now: number, current: DistrictId, next: DistrictId | null, nextDist: number): void {
    if (now - this.last < 120) return
    this.last = now
    const c = this.ctx, S = this.size, k = S / this.span
    c.clearRect(0, 0, S, S)
    // background disc
    c.fillStyle = 'rgba(6,8,12,0.78)'
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, 6.3); c.fill()
    c.save()
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 6, 0, 6.3); c.clip()
    c.translate(S / 2, S * 0.6)
    // heading up: rotate the world so the travel direction points up. World: +x east, -z north.
    c.rotate(heading)
    c.scale(k, k)
    c.translate(-x, -z)
    // ocean
    c.fillStyle = '#0e1a2a'
    c.fillRect(x - this.span, z - this.span, this.span * 2, this.span * 2)
    // land: everything east of the coast, drawn as a polygon following coastX
    c.fillStyle = '#1a1a20'
    c.beginPath()
    c.moveTo(4000, -2400)
    for (let zz = -2400; zz <= 3200; zz += 60) c.lineTo(coastX(zz), zz)
    c.lineTo(4000, 3200)
    c.closePath()
    c.fill()
    // districts
    for (const d of DISTRICTS) {
      const [x0, z0, x1, z1] = d.box
      c.fillStyle = REGION_COLOR[d.region] ?? '#333'
      c.globalAlpha = d.id === current ? 0.95 : 0.55
      c.fillRect(x0, z0, x1 - x0, z1 - z0)
      c.globalAlpha = 1
      c.strokeStyle = 'rgba(255,255,255,0.12)'
      c.lineWidth = 4
      c.strokeRect(x0, z0, x1 - x0, z1 - z0)
    }
    // route
    c.strokeStyle = 'rgba(252,238,10,0.9)'
    c.lineWidth = 9
    c.lineJoin = 'round'
    c.beginPath()
    this.routePts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])))
    c.closePath()
    c.stroke()
    // district labels (upright)
    c.font = `600 ${Math.round(22 / k)}px Rajdhani, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (const d of DISTRICTS) {
      const [x0, z0, x1, z1] = d.box
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
      if (Math.hypot(cx - x, cz - z) > this.span * 0.75) continue
      c.save()
      c.translate(cx, cz)
      c.rotate(-heading)
      c.fillStyle = d.id === current ? '#fcee0a' : 'rgba(233,234,240,0.7)'
      c.fillText(d.name.toUpperCase(), 0, 0)
      c.restore()
    }
    c.restore()
    // car marker (fixed, pointing up)
    c.save()
    c.translate(S / 2, S * 0.6)
    c.fillStyle = '#37ebf3'
    c.shadowColor = '#37ebf3'
    c.shadowBlur = 12
    c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill()
    c.restore()
    // ring + north tick
    c.strokeStyle = 'rgba(55,235,243,0.7)'
    c.lineWidth = 3
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 4, 0, 6.3); c.stroke()
    c.save()
    c.translate(S / 2, S * 0.6)
    c.rotate(heading)
    c.fillStyle = '#ff2a6d'
    c.font = '700 26px Rajdhani, sans-serif'
    c.textAlign = 'center'
    c.fillText('N', 0, -S * 0.42)
    c.restore()
    // next district banner
    c.fillStyle = 'rgba(6,8,12,0.85)'
    c.fillRect(S * 0.12, S * 0.84, S * 0.76, 56)
    c.fillStyle = '#fcee0a'
    c.font = '700 26px Rajdhani, sans-serif'
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.fillText(districtName(current).toUpperCase(), S * 0.15, S * 0.84 + 28)
    if (next) {
      c.fillStyle = '#37ebf3'
      c.textAlign = 'right'
      c.font = '600 22px Rajdhani, sans-serif'
      c.fillText(`▸ ${districtName(next).toUpperCase()}  ${nextDist >= 1000 ? (nextDist / 1000).toFixed(1) + ' km' : Math.round(nextDist / 10) * 10 + ' m'}`, S * 0.85, S * 0.84 + 28)
    }
    this.texture.needsUpdate = true
  }
}

/** Scan the route ahead for the first different (non-badlands) district. */
export function nextDistrict(route: Route, s: number, current: DistrictId): { id: DistrictId; dist: number } | null {
  for (let look = 20; look < 6000; look += 20) {
    const d = route.at(s + look).district
    if (d !== current && (d !== 'badlands' || look > 400)) return { id: d, dist: look }
  }
  return null
}
