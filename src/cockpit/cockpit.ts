/**
 * First-person cockpit attached to the camera: curved leather dash with a
 * stitched cowl, instrument binnacle with a holographic cluster, centre
 * console with the navigation screen (minimap), vents, door cards, side and
 * rear-view mirrors (render target), windshield dust, a car-paint bonnet with
 * environment reflections, and interior accent lights.
 * Camera space: +x right, +y up, -z forward.
 */
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, LinearFilter, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PointLight, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3,
  WebGLRenderTarget, type Scene, type Texture, type WebGLRenderer,
} from 'three'
import { buildCockpitMaterials, type CockpitMaterials } from './materials'
import { Q } from '../quality'

export interface ClusterState {
  kmh: number
  rpm: number
  gear: number
  district: string
  time: string
  next: string
  nextDist: number
}

export class Cockpit {
  group = new Group()
  private mats: CockpitMaterials
  private wheel: Group
  private rearCam: PerspectiveCamera
  private rearRT: WebGLRenderTarget
  private clusterCanvas: HTMLCanvasElement
  private clusterTex: CanvasTexture
  private lastCluster = 0
  private navMat: MeshBasicMaterial
  private ghost: Mesh
  private hidden: Mesh[] = []

  constructor() {
    const M = (this.mats = buildCockpitMaterials())
    const g = this.group

    // ------------------------------------------------------ dash cowl (profile in (forward, y), extruded across x)
    const cowl = new Shape()
    const prof: [number, number][] = [[0.60, -0.54], [0.63, -0.44], [0.72, -0.39], [0.95, -0.375], [1.20, -0.40], [1.42, -0.47], [1.55, -0.55], [1.55, -0.88], [0.60, -0.88]]
    prof.forEach(([f, y], i) => (i ? cowl.lineTo(f, y) : cowl.moveTo(f, y)))
    cowl.closePath()
    const cowlGeo = new ExtrudeGeometry(cowl, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, steps: 1 })
    cowlGeo.rotateY(Math.PI / 2)
    cowlGeo.translate(-1.3, 0, 0)
    // extrude maps forward -> -z after the rotation; profile x is forward distance so z = -f
    const dash = new Mesh(cowlGeo, M.leather)
    g.add(dash)
    // stitched leather strip along the cowl crest
    const crest = new Mesh(new BoxGeometry(2.4, 0.012, 0.36), M.leatherStitch)
    crest.position.set(0, -0.37, -1.02)
    crest.rotation.x = -0.12
    g.add(crest)
    // driver-side brow: the cowl rises over the binnacle
    const brow = new Mesh(new BoxGeometry(0.82, 0.05, 0.46), M.leather)
    brow.position.set(-0.37, -0.365, -1.0)
    brow.rotation.x = -0.14
    g.add(brow)
    const browEdge = new Mesh(new BoxGeometry(0.84, 0.012, 0.03), M.leatherStitch)
    browEdge.position.set(-0.37, -0.35, -0.78)
    g.add(browEdge)
    // passenger side: airbag seam + glovebox line as shallow dark grooves in the cowl top
    for (const [w, d, x, z] of [[0.62, 0.006, 0.82, -0.86], [0.62, 0.006, 0.82, -1.18], [0.006, 0.33, 0.51, -1.02], [0.006, 0.33, 1.13, -1.02]] as const) {
      const groove = new Mesh(new BoxGeometry(w, 0.004, d), new MeshStandardMaterial({ color: 0x050506, roughness: 1, fog: false }))
      groove.position.set(x, -0.383, z)
      g.add(groove)
    }
    // lower dash / knee panel
    const knee = new Mesh(new BoxGeometry(2.5, 0.42, 0.5), M.plastic)
    knee.position.set(0, -0.8, -0.72)
    knee.rotation.x = 0.22
    g.add(knee)
    // yellow accent stripe (Quadra) + carbon trim band
    const stripe = new Mesh(new BoxGeometry(0.5, 0.008, 0.012), new MeshBasicMaterial({ color: 0xfcee0a, fog: false, toneMapped: false }))
    stripe.position.set(0.72, -0.41, -0.66)
    g.add(stripe)
    const trimBand = new Mesh(new BoxGeometry(2.2, 0.05, 0.02), M.carbon)
    trimBand.position.set(0, -0.5, -0.655)
    g.add(trimBand)

    // ------------------------------------------------------ air vents
    const vent = (x: number, y: number, z: number, w: number) => {
      const frame = new Mesh(new BoxGeometry(w, 0.075, 0.03), M.metal)
      frame.position.set(x, y, z)
      g.add(frame)
      const inner = new Mesh(new BoxGeometry(w - 0.02, 0.055, 0.02), new MeshStandardMaterial({ color: 0x050507, roughness: 0.9, fog: false }))
      inner.position.set(x, y, z + 0.008)
      g.add(inner)
      for (let i = 0; i < 4; i++) {
        const slat = new Mesh(new BoxGeometry(w - 0.03, 0.006, 0.02), M.plastic)
        slat.position.set(x, y - 0.02 + i * 0.013, z + 0.012)
        slat.rotation.x = 0.35
        g.add(slat)
      }
    }
    vent(-0.98, -0.44, -0.66, 0.2)
    vent(0.12, -0.44, -0.66, 0.16)
    vent(0.36, -0.44, -0.66, 0.16)
    vent(1.02, -0.44, -0.66, 0.2)

    // ------------------------------------------------------ instrument binnacle + cluster
    const hood = new Mesh(new CylinderGeometry(0.19, 0.19, 0.34, 20, 1, true, Math.PI, Math.PI), M.plastic)
    hood.rotation.z = Math.PI / 2
    hood.rotation.y = Math.PI / 2
    hood.position.set(-0.37, -0.27, -0.9)
    hood.scale.set(1, 1.35, 0.7)
    g.add(hood)
    const hoodRim = new Mesh(new TorusGeometry(0.19, 0.012, 8, 30, Math.PI), M.carbon)
    hoodRim.position.set(-0.37, -0.27, -0.74)
    hoodRim.scale.set(1.35, 0.7, 1)
    g.add(hoodRim)
    this.clusterCanvas = document.createElement('canvas')
    this.clusterCanvas.width = 1024
    this.clusterCanvas.height = 384
    this.clusterTex = new CanvasTexture(this.clusterCanvas)
    this.clusterTex.colorSpace = SRGBColorSpace
    const clusterMat = new MeshBasicMaterial({ map: this.clusterTex, transparent: true, fog: false, toneMapped: false })
    const cl = new Mesh(new PlaneGeometry(0.4, 0.15), clusterMat)
    cl.position.set(-0.37, -0.31, -0.92)
    cl.rotation.x = -0.28
    g.add(cl)
    // glass over the cluster
    const clGlass = new Mesh(new PlaneGeometry(0.42, 0.17), new MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.18, fog: false }))
    clGlass.position.set(-0.37, -0.31, -0.905)
    clGlass.rotation.x = -0.28
    g.add(clGlass)

    // ------------------------------------------------------ centre console + nav screen
    const console_ = new Mesh(new BoxGeometry(0.46, 0.5, 0.34), M.plastic)
    console_.position.set(0.24, -0.74, -0.62)
    console_.rotation.x = -0.42
    g.add(console_)
    const consoleTrim = new Mesh(new BoxGeometry(0.48, 0.32, 0.02), M.carbon)
    consoleTrim.position.set(0.24, -0.63, -0.635)
    consoleTrim.rotation.x = -0.42
    g.add(consoleTrim)
    this.navMat = new MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })
    const nav = new Mesh(new PlaneGeometry(0.24, 0.24), this.navMat)
    nav.position.set(0.34, -0.27, -0.95)
    nav.rotation.x = -0.18
    nav.rotation.y = -0.3
    g.add(nav)
    const navFrame = new Mesh(new BoxGeometry(0.28, 0.28, 0.03), M.plastic)
    navFrame.position.set(0.34, -0.27, -0.97)
    navFrame.rotation.copy(nav.rotation)
    const navStand = new Mesh(new BoxGeometry(0.16, 0.1, 0.06), M.plastic)
    navStand.position.set(0.34, -0.4, -0.98)
    g.add(navStand)
    g.add(navFrame)
    // buttons row
    for (let i = 0; i < 6; i++) {
      const b = new Mesh(new BoxGeometry(0.05, 0.03, 0.02), M.plastic)
      b.position.set(0.09 + i * 0.06, -0.74, -0.55)
      b.rotation.x = -0.42
      g.add(b)
      const led = new Mesh(new BoxGeometry(0.02, 0.004, 0.006), new MeshBasicMaterial({ color: i % 2 ? 0x37ebf3 : 0xfcee0a, fog: false, toneMapped: false }))
      led.position.set(0.09 + i * 0.06, -0.732, -0.545)
      led.rotation.x = -0.42
      g.add(led)
    }
    // gear lever
    const lever = new Mesh(new CylinderGeometry(0.012, 0.016, 0.16, 10), M.metal)
    lever.position.set(0.3, -0.62, -0.32)
    lever.rotation.x = 0.35
    g.add(lever)
    const knob = new Mesh(new SphereGeometry(0.03, 14, 10), M.leather)
    knob.position.set(0.3, -0.55, -0.35)
    g.add(knob)
    const boot = new Mesh(new BoxGeometry(0.2, 0.05, 0.22), M.leather)
    boot.position.set(0.3, -0.7, -0.3)
    g.add(boot)

    // ------------------------------------------------------ A-pillars, header, headliner, visors
    for (const sx of [-1, 1]) {
      const p = new Mesh(new BoxGeometry(0.11, 1.55, 0.13), M.fabric)
      p.position.set(sx * 1.06, 0.12, -0.74)
      p.rotation.z = sx * 0.3
      p.rotation.x = -0.46
      g.add(p)
    }
    const header = new Mesh(new BoxGeometry(2.6, 0.1, 0.34), M.fabric)
    header.position.set(0, 0.64, -0.7)
    header.rotation.x = 0.4
    g.add(header)
    const liner = new Mesh(new PlaneGeometry(2.6, 1.6), M.fabric)
    liner.position.set(0, 0.74, 0.1)
    liner.rotation.x = Math.PI / 2 - 0.06
    g.add(liner)
    for (const sx of [-0.5, 0.5]) {
      const v = new Mesh(new BoxGeometry(0.42, 0.018, 0.17), M.fabric)
      v.position.set(sx, 0.57, -0.62)
      v.rotation.x = 0.5
      g.add(v)
    }

    // ------------------------------------------------------ steering wheel (left-hand drive)
    this.wheel = new Group()
    const rimTex = M.leatherStitch.clone()
    rimTex.map = M.leatherStitch.map!.clone()
    rimTex.map.repeat.set(14, 1)
    rimTex.map.needsUpdate = true
    rimTex.normalMap = M.leatherStitch.normalMap!.clone()
    rimTex.normalMap.repeat.set(14, 1)
    rimTex.normalMap.needsUpdate = true
    const rim = new Mesh(new TorusGeometry(0.19, 0.03, 14, 48), rimTex)
    this.wheel.add(rim)
    for (const a of [Math.PI + 0.12, -0.12, -Math.PI / 2]) {
      const sp = new Mesh(new BoxGeometry(0.15, 0.04, 0.02), M.metal)
      sp.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0)
      sp.rotation.z = a
      this.wheel.add(sp)
    }
    // spoke buttons
    for (const [x, y, c] of [[-0.09, 0.03, 0x37ebf3], [-0.09, -0.005, 0xfcee0a], [0.09, 0.03, 0xff2a6d], [0.09, -0.005, 0x37ebf3]] as const) {
      const b = new Mesh(new BoxGeometry(0.024, 0.016, 0.012), M.plastic)
      b.position.set(x, y, 0.015)
      this.wheel.add(b)
      const led = new Mesh(new BoxGeometry(0.012, 0.004, 0.004), new MeshBasicMaterial({ color: c, fog: false, toneMapped: false }))
      led.position.set(x, y + 0.006, 0.022)
      this.wheel.add(led)
    }
    const hub = new Mesh(new CylinderGeometry(0.062, 0.066, 0.05, 24), M.leather)
    hub.rotation.x = Math.PI / 2
    this.wheel.add(hub)
    const logoCanvas = document.createElement('canvas')
    logoCanvas.width = 256
    logoCanvas.height = 256
    const lc = logoCanvas.getContext('2d')!
    lc.fillStyle = '#101014'
    lc.fillRect(0, 0, 256, 256)
    lc.strokeStyle = '#fcee0a'
    lc.lineWidth = 8
    lc.beginPath(); lc.arc(128, 128, 100, 0, 6.3); lc.stroke()
    lc.fillStyle = '#fcee0a'
    lc.font = '700 46px Rajdhani, Impact, sans-serif'
    lc.textAlign = 'center'
    lc.textBaseline = 'middle'
    lc.fillText('QUADRA', 128, 128)
    const logoTex = new CanvasTexture(logoCanvas)
    logoTex.colorSpace = SRGBColorSpace
    const logo = new Mesh(new PlaneGeometry(0.1, 0.1), new MeshStandardMaterial({ map: logoTex, roughness: 0.4, metalness: 0.3, fog: false }))
    logo.position.set(0, 0, 0.026)
    this.wheel.add(logo)
    this.wheel.position.set(-0.37, -0.42, -0.6)
    this.wheel.rotation.x = -0.42
    g.add(this.wheel)
    const column = new Mesh(new CylinderGeometry(0.045, 0.06, 0.34, 14), M.plastic)
    column.position.set(-0.37, -0.52, -0.78)
    column.rotation.x = Math.PI / 2 - 0.42
    g.add(column)
    for (const sx of [-1, 1]) {
      const stalk = new Mesh(new CylinderGeometry(0.01, 0.012, 0.14, 8), M.plastic)
      stalk.position.set(-0.37 + sx * 0.11, -0.5, -0.74)
      stalk.rotation.z = Math.PI / 2
      stalk.rotation.y = -sx * 0.4
      g.add(stalk)
    }

    // ------------------------------------------------------ mirrors
    this.rearRT = new WebGLRenderTarget(Q.mirrorW, Math.round(Q.mirrorW * 240 / 768))
    this.rearRT.texture.minFilter = LinearFilter
    this.rearRT.texture.colorSpace = SRGBColorSpace
    this.rearCam = new PerspectiveCamera(58, 768 / 240, 0.5, 2500)
    const mirrorMat = new MeshBasicMaterial({ map: this.rearRT.texture, fog: false })
    const mirror = new Mesh(new PlaneGeometry(0.34, 0.105), mirrorMat)
    mirror.scale.x = -1
    mirror.position.set(0.2, 0.43, -0.74)
    mirror.rotation.x = 0.1
    mirror.rotation.y = -0.16
    const frame = new Mesh(new BoxGeometry(0.38, 0.135, 0.05), M.plastic)
    frame.position.copy(mirror.position).add(new Vector3(0, 0, -0.03))
    frame.rotation.copy(mirror.rotation)
    const arm = new Mesh(new CylinderGeometry(0.012, 0.012, 0.12, 8), M.plastic)
    arm.position.set(0.2, 0.52, -0.78)
    arm.rotation.x = 0.4
    g.add(frame, mirror, arm)
    // side mirrors show the outer thirds of the rear view
    const sideMirror = (sx: number, x: number, y: number, z: number, w: number) => {
      const geo = new PlaneGeometry(w, w * 0.62)
      const uv = geo.getAttribute('uv')
      const u0 = sx < 0 ? 0.6 : 0
      for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.4)
      const m = new Mesh(geo, new MeshBasicMaterial({ map: this.rearRT.texture, fog: false }))
      m.scale.x = -1
      m.position.set(x, y, z)
      m.rotation.y = sx * 0.55
      const housing = new Mesh(new BoxGeometry(w + 0.04, w * 0.62 + 0.04, 0.09), M.paint)
      housing.position.set(x - sx * 0.02, y, z - 0.05)
      housing.rotation.y = sx * 0.55
      g.add(housing, m)
      this.hidden.push(m)
    }
    sideMirror(-1, -1.1, -0.1, -1.12, 0.2)
    sideMirror(1, 1.22, -0.12, -1.22, 0.15)

    // ------------------------------------------------------ door cards
    for (const sx of [-1, 1]) {
      const card = new Mesh(new BoxGeometry(0.1, 0.72, 1.5), M.leather)
      card.position.set(sx * 1.22, -0.56, -0.1)
      g.add(card)
      const sill = new Mesh(new BoxGeometry(0.06, 0.03, 1.5), M.metal)
      sill.position.set(sx * 1.2, -0.2, -0.1)
      g.add(sill)
      const rest = new Mesh(new BoxGeometry(0.18, 0.07, 0.55), M.leather)
      rest.position.set(sx * 1.13, -0.36, 0.05)
      g.add(rest)
      const handle = new Mesh(new BoxGeometry(0.05, 0.03, 0.12), M.metal)
      handle.position.set(sx * 1.16, -0.3, -0.3)
      g.add(handle)
    }

    // ------------------------------------------------------ windshield dust + cluster ghost reflection
    const glass = new Mesh(new PlaneGeometry(2.9, 1.5), new MeshBasicMaterial({ map: M.dirt, transparent: true, blending: AdditiveBlending, opacity: 0.13, depthWrite: false, fog: false, toneMapped: false }))
    glass.position.set(0, 0.1, -1.2)
    glass.rotation.x = 0.42
    glass.renderOrder = 20
    g.add(glass)
    this.ghost = new Mesh(new PlaneGeometry(0.4, 0.15), new MeshBasicMaterial({ map: this.clusterTex, transparent: true, blending: AdditiveBlending, opacity: 0.1, depthWrite: false, fog: false, toneMapped: false }))
    this.ghost.position.set(-0.37, 0.02, -1.09)
    this.ghost.rotation.x = 0.42
    this.ghost.scale.y = -1
    this.ghost.renderOrder = 21
    g.add(this.ghost)

    // ------------------------------------------------------ bonnet (car paint, crowned, with a centre crease)
    const bonnetGeo = new PlaneGeometry(2.3, 2.0, 24, 12)
    bonnetGeo.rotateX(-Math.PI / 2)
    const bp = bonnetGeo.getAttribute('position')
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), z = bp.getZ(i) // z: -1..1 (forward is negative)
      const f = (-z + 1) / 2 // 0 at windshield, 1 at nose
      const crown = -0.09 * Math.pow(x / 1.15, 2)
      const crease = 0.012 * Math.exp(-Math.pow(x / 0.08, 2))
      const vents = -0.01 * (Math.abs(x) > 0.55 && Math.abs(x) < 0.75 && f > 0.3 && f < 0.6 ? 1 : 0)
      bp.setY(i, -0.58 - 0.14 * f + crown + crease + vents)
    }
    bonnetGeo.computeVertexNormals()
    const bonnet = new Mesh(bonnetGeo, M.paint)
    bonnet.position.set(0, 0, -2.45)
    g.add(bonnet)
    // wipers resting at the base of the windshield
    for (const [x, rot] of [[-0.45, 0.25], [0.35, 0.25]] as const) {
      const w = new Mesh(new BoxGeometry(0.7, 0.012, 0.03), M.plastic)
      w.position.set(x, -0.56, -1.55)
      w.rotation.y = rot
      g.add(w)
    }

    // ------------------------------------------------------ interior accent lights
    const cyan = new PointLight(0x37ebf3, 0.35, 2.0, 2)
    cyan.position.set(0, -0.75, -0.55)
    g.add(cyan)
    const warm = new PointLight(0xffd28a, 0.18, 1.4, 2)
    warm.position.set(-0.37, -0.2, -0.75)
    g.add(warm)
    const strip = new Mesh(new BoxGeometry(2.0, 0.008, 0.02), new MeshBasicMaterial({ color: 0x37ebf3, fog: false, toneMapped: false }))
    strip.position.set(0, -0.66, -0.56)
    g.add(strip)
  }

  /** Reflection environment for paint / glossy trim (PMREM texture). */
  setEnvironment(env: Texture | null): void {
    for (const m of this.mats.all) {
      m.envMap = env
      m.envMapIntensity = m === this.mats.paint ? 0.55 : 0.3
      m.needsUpdate = true
    }
  }

  setNav(tex: Texture): void {
    this.navMat.map = tex
    this.navMat.needsUpdate = true
  }

  update(steer: number): void {
    this.wheel.rotation.z = -steer * 2.4
  }

  renderMirror(renderer: WebGLRenderer, scene: Scene, camPos: Vector3, forward: Vector3): void {
    this.rearCam.position.copy(camPos).addScaledVector(forward, -0.6)
    this.rearCam.position.y += 0.15
    this.rearCam.lookAt(camPos.clone().addScaledVector(forward, -60))
    this.group.visible = false
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.rearRT)
    renderer.render(scene, this.rearCam)
    renderer.setRenderTarget(prev)
    this.group.visible = true
  }

  drawCluster(s: ClusterState, now: number): void {
    if (now - this.lastCluster < 90) return
    this.lastCluster = now
    const c = this.clusterCanvas.getContext('2d')!
    const W = c.canvas.width, H = c.canvas.height
    c.clearRect(0, 0, W, H)
    c.fillStyle = 'rgba(4,6,10,0.9)'
    c.fillRect(0, 0, W, H)
    // frame corners
    c.strokeStyle = 'rgba(55,235,243,0.55)'
    c.lineWidth = 3
    c.strokeRect(8, 8, W - 16, H - 16)
    c.fillStyle = '#37ebf3'
    c.fillRect(8, 8, 90, 4)
    c.fillRect(W - 98, H - 12, 90, 4)
    // ---- speed arc (left)
    const cx = 200, cy = 200, R = 150
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25
    c.lineWidth = 14
    c.strokeStyle = 'rgba(55,235,243,0.18)'
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke()
    const t = Math.min(1, s.kmh / 200)
    c.strokeStyle = t > 0.7 ? '#ff003c' : '#fcee0a'
    c.shadowColor = c.strokeStyle
    c.shadowBlur = 16
    c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * t); c.stroke()
    c.shadowBlur = 0
    c.strokeStyle = 'rgba(233,234,240,0.5)'
    c.lineWidth = 2
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * (i / 10)
      c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); c.lineTo(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26)); c.stroke()
    }
    c.fillStyle = '#fcee0a'
    c.font = '700 110px Rajdhani, "Arial Narrow", sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(Math.round(s.kmh)), cx, cy - 6)
    c.font = '600 26px Rajdhani, sans-serif'
    c.fillStyle = '#37ebf3'
    c.fillText('KM/H', cx, cy + 62)
    // ---- centre: gear + rpm bar
    c.fillStyle = '#e8e8f0'
    c.font = '700 84px Rajdhani, sans-serif'
    c.fillText(String(s.gear), 470, 150)
    c.font = '600 22px Rajdhani, sans-serif'
    c.fillStyle = '#8d90a3'
    c.fillText('GEAR', 470, 205)
    const bx = 400, by = 250, bw = 140, bh = 16
    const segs = 20
    for (let i = 0; i < segs; i++) {
      const on = i / segs < s.rpm
      c.fillStyle = on ? (i / segs > 0.8 ? '#ff003c' : '#37ebf3') : 'rgba(255,255,255,0.06)'
      c.fillRect(bx + (i * bw) / segs, by, bw / segs - 2, bh)
    }
    c.fillStyle = '#8d90a3'
    c.font = '600 18px Rajdhani, sans-serif'
    c.textAlign = 'left'
    c.fillText('RPM', bx, by + 34)
    // ---- right: nav
    c.fillStyle = '#8d90a3'
    c.font = '600 20px Rajdhani, sans-serif'
    c.fillText('LOCATION', 600, 60)
    c.fillStyle = '#fcee0a'
    c.font = '700 40px Rajdhani, sans-serif'
    c.fillText(s.district.toUpperCase(), 600, 100)
    c.fillStyle = '#8d90a3'
    c.font = '600 20px Rajdhani, sans-serif'
    c.fillText('NEXT', 600, 160)
    c.fillStyle = '#37ebf3'
    c.font = '700 34px Rajdhani, sans-serif'
    c.fillText(`▸ ${s.next.toUpperCase()}`, 600, 196)
    c.fillStyle = '#e8e8f0'
    c.font = '600 28px Rajdhani, sans-serif'
    c.fillText(s.nextDist >= 1000 ? `${(s.nextDist / 1000).toFixed(1)} km` : `${Math.round(s.nextDist / 10) * 10} m`, 600, 236)
    c.fillStyle = '#8d90a3'
    c.font = '600 20px Rajdhani, sans-serif'
    c.fillText('AUTOPILOT  ·  NIGHT CITY', 600, 300)
    c.textAlign = 'right'
    c.fillStyle = '#e8e8f0'
    c.font = '700 34px Rajdhani, sans-serif'
    c.fillText(s.time, W - 40, 300)
    this.clusterTex.needsUpdate = true
  }
}
