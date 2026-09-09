/**
 * Canvas-painted PBR-ish materials for the cockpit: leather with stitching,
 * carbon weave, brushed metal, plastic grain, windshield dirt. Each returns
 * a MeshStandardMaterial with map + normalMap + roughnessMap where useful.
 */
import {
  CanvasTexture, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, NoColorSpace, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2, type Texture,
} from 'three'

type Ctx = CanvasRenderingContext2D

function ctx2d(w: number, h: number): Ctx {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c.getContext('2d', { willReadFrequently: true })!
}

function rnd(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function tex(c: Ctx, srgb: boolean, repeat = 1): CanvasTexture {
  const t = new CanvasTexture(c.canvas)
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 8
  return t
}

/** Normal map from a grey height canvas. */
function normalFrom(h: Ctx, strength: number, wrap = true): DataTexture {
  const W = h.canvas.width, H = h.canvas.height
  const d = h.getImageData(0, 0, W, H).data
  const out = new Uint8Array(W * H * 4)
  const hv = (x: number, y: number) => d[(((y + H) % H) * W + ((x + W) % W)) * 4]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hv(x + 1, y) - hv(x - 1, y)) / 255
      const dy = (hv(x, y + 1) - hv(x, y - 1)) / 255
      let nx = -dx * strength, ny = dy * strength, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const o = (y * W + x) * 4
      out[o] = (nx * 0.5 + 0.5) * 255
      out[o + 1] = (ny * 0.5 + 0.5) * 255
      out[o + 2] = (nz * 0.5 + 0.5) * 255
      out[o + 3] = 255
    }
  }
  const t = new DataTexture(out, W, H, RGBAFormat, UnsignedByteType)
  t.colorSpace = NoColorSpace
  if (wrap) t.wrapS = t.wrapT = RepeatWrapping
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.flipY = true
  t.needsUpdate = true
  return t
}

export interface CockpitMaterials {
  leather: MeshStandardMaterial
  leatherStitch: MeshStandardMaterial
  carbon: MeshStandardMaterial
  metal: MeshStandardMaterial
  plastic: MeshStandardMaterial
  fabric: MeshStandardMaterial
  paint: MeshStandardMaterial
  dirt: Texture
  all: MeshStandardMaterial[]
}

export function buildCockpitMaterials(): CockpitMaterials {
  const r = rnd(1337)
  // ---------------------------------------------------------- leather
  const S = 512
  const la = ctx2d(S, S), lh = ctx2d(S, S)
  la.fillStyle = '#17171b'
  la.fillRect(0, 0, S, S)
  lh.fillStyle = '#808080'
  lh.fillRect(0, 0, S, S)
  // pebble grain: many soft circles
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, rad = 1.5 + r() * 3
    const v = 0.5 + r() * 0.5
    la.fillStyle = `rgba(${40 * v},${40 * v},${46 * v},0.35)`
    la.beginPath(); la.arc(x, y, rad, 0, 6.3); la.fill()
    lh.fillStyle = `rgba(${255 * (0.45 + r() * 0.35)},0,0,0.5)`.replace(/rgba\((\d+\.?\d*),0,0/, (_, g) => `rgba(${g},${g},${g}`)
    lh.beginPath(); lh.arc(x, y, rad, 0, 6.3); lh.fill()
  }
  // creases
  la.strokeStyle = 'rgba(0,0,0,0.25)'
  lh.strokeStyle = 'rgba(70,70,70,0.6)'
  for (let i = 0; i < 40; i++) {
    la.lineWidth = 1; lh.lineWidth = 2
    let x = r() * S, y = r() * S
    la.beginPath(); la.moveTo(x, y); lh.beginPath(); lh.moveTo(x, y)
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; la.lineTo(x, y); lh.lineTo(x, y) }
    la.stroke(); lh.stroke()
  }
  const leatherMap = tex(la, true, 6)
  const leatherNormal = normalFrom(lh, 1.4)
  leatherNormal.repeat.set(6, 6)
  const leather = new MeshStandardMaterial({ map: leatherMap, normalMap: leatherNormal, normalScale: new Vector2(0.6, 0.6), roughness: 0.72, metalness: 0.05, fog: false })

  // leather with a stitched seam running horizontally through the middle (for the dash top / wheel)
  const sa = ctx2d(S, S), shh = ctx2d(S, S)
  sa.drawImage(la.canvas, 0, 0)
  shh.drawImage(lh.canvas, 0, 0)
  const seamY = S / 2
  sa.fillStyle = 'rgba(0,0,0,0.55)'
  sa.fillRect(0, seamY - 3, S, 6)
  shh.fillStyle = '#404040'
  shh.fillRect(0, seamY - 3, S, 6)
  for (let x = 4; x < S; x += 22) {
    for (const off of [-12, 12]) {
      sa.fillStyle = '#c8b88a'
      sa.fillRect(x, seamY + off - 1.5, 14, 3)
      shh.fillStyle = '#d0d0d0'
      shh.fillRect(x, seamY + off - 1.5, 14, 3)
    }
  }
  const stitchMap = tex(sa, true, 1)
  const stitchNormal = normalFrom(shh, 1.6)
  const leatherStitch = new MeshStandardMaterial({ map: stitchMap, normalMap: stitchNormal, normalScale: new Vector2(0.7, 0.7), roughness: 0.7, metalness: 0.05, fog: false })

  // ---------------------------------------------------------- carbon
  const ca = ctx2d(256, 256), ch = ctx2d(256, 256)
  const cellC = 16
  for (let y = 0; y < 256; y += cellC) {
    for (let x = 0; x < 256; x += cellC) {
      const odd = ((x + y) / cellC) % 2 === 0
      const g = ca.createLinearGradient(x, y, odd ? x + cellC : x, odd ? y : y + cellC)
      g.addColorStop(0, '#0e0e12')
      g.addColorStop(0.5, '#2c2c34')
      g.addColorStop(1, '#0e0e12')
      ca.fillStyle = g
      ca.fillRect(x, y, cellC, cellC)
      const gh = ch.createLinearGradient(x, y, odd ? x + cellC : x, odd ? y : y + cellC)
      gh.addColorStop(0, '#606060'); gh.addColorStop(0.5, '#a0a0a0'); gh.addColorStop(1, '#606060')
      ch.fillStyle = gh
      ch.fillRect(x, y, cellC, cellC)
    }
  }
  const carbon = new MeshStandardMaterial({ map: tex(ca, true, 8), normalMap: normalFrom(ch, 0.8), roughness: 0.35, metalness: 0.4, fog: false })
  carbon.normalMap!.repeat.set(8, 8)

  // ---------------------------------------------------------- brushed metal
  const ma = ctx2d(256, 256), mh = ctx2d(256, 256)
  ma.fillStyle = '#5a5c62'
  ma.fillRect(0, 0, 256, 256)
  mh.fillStyle = '#808080'
  mh.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    const y = r() * 256, l = 20 + r() * 120, v = 60 + r() * 60
    ma.fillStyle = `rgba(${v},${v},${v + 6},0.35)`
    ma.fillRect(r() * 256, y, l, 1)
    mh.fillStyle = `rgba(${110 + r() * 60},${110 + r() * 60},${110 + r() * 60},0.5)`
    mh.fillRect(r() * 256, y, l, 1)
  }
  const metal = new MeshStandardMaterial({ map: tex(ma, true, 3), normalMap: normalFrom(mh, 0.5), normalScale: new Vector2(0.3, 0.3), roughness: 0.32, metalness: 0.9, fog: false })
  metal.normalMap!.repeat.set(3, 3)

  // ---------------------------------------------------------- plastic grain
  const pa = ctx2d(256, 256), ph = ctx2d(256, 256)
  pa.fillStyle = '#121216'
  pa.fillRect(0, 0, 256, 256)
  ph.fillStyle = '#808080'
  ph.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 20000; i++) {
    const v = 14 + r() * 16
    pa.fillStyle = `rgb(${v},${v},${v + 3})`
    pa.fillRect(r() * 256, r() * 256, 1.5, 1.5)
    const hv = 100 + r() * 56
    ph.fillStyle = `rgb(${hv},${hv},${hv})`
    ph.fillRect(r() * 256, r() * 256, 1.5, 1.5)
  }
  const plastic = new MeshStandardMaterial({ map: tex(pa, true, 5), normalMap: normalFrom(ph, 0.6), normalScale: new Vector2(0.35, 0.35), roughness: 0.82, metalness: 0.08, fog: false })
  plastic.normalMap!.repeat.set(5, 5)

  // ---------------------------------------------------------- headliner fabric
  const fa = ctx2d(256, 256)
  fa.fillStyle = '#26262c'
  fa.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x += 3) {
    const v = 30 + r() * 24
    fa.fillStyle = `rgb(${v},${v},${v + 4})`
    fa.fillRect(x + (y % 6 ? 1.5 : 0), y, 2, 2)
  }
  const fabric = new MeshStandardMaterial({ map: tex(fa, true, 8), roughness: 0.98, metalness: 0, fog: false })

  // ---------------------------------------------------------- car paint (bonnet)
  const paint = new MeshStandardMaterial({ color: new Color(0x0a0b10), roughness: 0.38, metalness: 0.7, fog: false, envMapIntensity: 0.55 })

  // ---------------------------------------------------------- windshield dirt / scratches (alpha in luminance)
  const D = 1024
  const da = ctx2d(D, D / 2)
  da.fillStyle = '#000'
  da.fillRect(0, 0, D, D / 2)
  for (let i = 0; i < 700; i++) {
    const x = r() * D, y = r() * D / 2, rad = 0.6 + r() * 2.2
    da.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.3})`
    da.beginPath(); da.arc(x, y, rad, 0, 6.3); da.fill()
  }
  for (let i = 0; i < 70; i++) {
    // smudge blotches
    const gx = r() * D, gy = r() * D / 2
    const g = da.createRadialGradient(gx, gy, 0, gx, gy, 30 + r() * 90)
    g.addColorStop(0, `rgba(255,255,255,${0.05 + r() * 0.08})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    da.fillStyle = g
    da.fillRect(0, 0, D, D / 2)
  }
  da.strokeStyle = 'rgba(255,255,255,0.18)'
  da.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const x = r() * D, y = r() * D / 2, a = r() * 6.3, l = 20 + r() * 120
    da.beginPath(); da.moveTo(x, y); da.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); da.stroke()
  }
  // wiper arc: cleaner inside two arcs, dirtier at the edges
  da.globalCompositeOperation = 'destination-out'
  for (const cx of [D * 0.3, D * 0.72]) {
    da.fillStyle = 'rgba(0,0,0,0.3)'
    da.beginPath(); da.arc(cx, D / 2 + 40, D * 0.36, Math.PI * 1.05, Math.PI * 1.95); da.lineTo(cx, D / 2 + 40); da.fill()
  }
  const dirt = tex(da, false, 1)
  dirt.wrapS = dirt.wrapT = 1001 as never // ClampToEdge

  const all = [leather, leatherStitch, carbon, metal, plastic, fabric, paint]
  return { leather, leatherStitch, carbon, metal, plastic, fabric, paint, dirt, all }
}
