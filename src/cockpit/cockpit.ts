/**
 * First-person cockpit attached to the camera: dashboard, hood, wheel,
 * pillars, rear-view mirror (render target) and a holographic cluster.
 */
import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, SRGBColorSpace, TorusGeometry, Vector3, WebGLRenderTarget, type Scene, type WebGLRenderer,
} from 'three'

export interface ClusterState {
  kmh: number
  rpm: number
  gear: number
  district: string
  time: string
}

export class Cockpit {
  group = new Group()
  private wheel: Group
  private rearCam: PerspectiveCamera
  private rearRT: WebGLRenderTarget
  private clusterCanvas: HTMLCanvasElement
  private clusterTex: CanvasTexture
  private lastCluster = 0
  private mirror: Mesh

  constructor() {
    const dark = new MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.85, metalness: 0.15, fog: false })
    const darker = new MeshStandardMaterial({ color: 0x08080a, roughness: 0.9, metalness: 0.1, fog: false })
    const trim = new MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.6, fog: false })
    const accent = new MeshBasicMaterial({ color: 0xfcee0a, fog: false, toneMapped: false })

    // dashboard: wide wedge
    const dash = new Mesh(new BoxGeometry(2.4, 0.22, 0.75), dark)
    dash.position.set(0, -0.56, -0.95)
    dash.rotation.x = -0.18
    this.group.add(dash)
    const dashTop = new Mesh(new BoxGeometry(2.4, 0.04, 0.5), darker)
    dashTop.position.set(0, -0.47, -1.18)
    dashTop.rotation.x = -0.32
    this.group.add(dashTop)
    // hood
    const hood = new Mesh(new BoxGeometry(2.0, 0.04, 1.5), new MeshStandardMaterial({ color: 0x08080a, roughness: 0.75, metalness: 0.3, fog: false }))
    hood.position.set(0, -0.86, -2.2)
    hood.rotation.x = 0.09
    this.group.add(hood)
    // yellow accent stripe across the dash (Quadra style)
    const stripe = new Mesh(new BoxGeometry(0.9, 0.012, 0.012), accent)
    stripe.position.set(0.25, -0.505, -0.98)
    this.group.add(stripe)

    // A-pillars + header
    for (const sx of [-1, 1]) {
      const p = new Mesh(new BoxGeometry(0.09, 1.5, 0.09), darker)
      p.position.set(sx * 1.02, 0.1, -0.7)
      p.rotation.z = sx * 0.28
      p.rotation.x = -0.45
      this.group.add(p)
    }
    const header = new Mesh(new BoxGeometry(2.5, 0.09, 0.3), darker)
    header.position.set(0, 0.66, -0.75)
    header.rotation.x = 0.35
    this.group.add(header)

    // steering wheel (left-hand drive)
    this.wheel = new Group()
    const rim = new Mesh(new TorusGeometry(0.19, 0.021, 10, 40), trim)
    this.wheel.add(rim)
    for (const a of [0, 2.1, -2.1]) {
      const sp = new Mesh(new BoxGeometry(0.035, 0.18, 0.02), trim)
      sp.position.set(Math.sin(a) * 0.09, -Math.cos(a) * 0.09, 0)
      sp.rotation.z = a
      this.wheel.add(sp)
    }
    const hub = new Mesh(new CylinderGeometry(0.05, 0.05, 0.04, 16), dark)
    hub.rotation.x = Math.PI / 2
    this.wheel.add(hub)
    this.wheel.position.set(-0.37, -0.36, -0.62)
    this.wheel.rotation.x = -0.4
    this.group.add(this.wheel)
    const column = new Mesh(new CylinderGeometry(0.03, 0.04, 0.35, 10), darker)
    column.position.set(-0.37, -0.45, -0.8)
    column.rotation.x = Math.PI / 2 - 0.4
    this.group.add(column)

    // rear-view mirror
    this.rearRT = new WebGLRenderTarget(512, 160)
    this.rearRT.texture.minFilter = LinearFilter
    this.rearRT.texture.colorSpace = SRGBColorSpace
    this.rearCam = new PerspectiveCamera(58, 512 / 160, 0.5, 2500)
    const mirrorMat = new MeshBasicMaterial({ map: this.rearRT.texture, fog: false })
    this.mirror = new Mesh(new PlaneGeometry(0.34, 0.105), mirrorMat)
    this.mirror.scale.x = -1
    this.mirror.position.set(0.22, 0.42, -0.72)
    this.mirror.rotation.x = 0.12
    this.mirror.rotation.y = -0.18
    const frame = new Mesh(new BoxGeometry(0.37, 0.13, 0.02), darker)
    frame.position.copy(this.mirror.position).add(new Vector3(0, 0, -0.012))
    frame.rotation.copy(this.mirror.rotation)
    this.group.add(frame, this.mirror)

    // holographic cluster (canvas)
    this.clusterCanvas = document.createElement('canvas')
    this.clusterCanvas.width = 512
    this.clusterCanvas.height = 192
    this.clusterTex = new CanvasTexture(this.clusterCanvas)
    this.clusterTex.colorSpace = SRGBColorSpace
    const cl = new Mesh(new PlaneGeometry(0.34, 0.128), new MeshBasicMaterial({ map: this.clusterTex, transparent: true, fog: false, toneMapped: false }))
    cl.position.set(-0.37, -0.31, -0.9)
    cl.rotation.x = -0.25
    this.group.add(cl)
    // ambient interior glow strips (cyan under dash)
    const glow = new Mesh(new BoxGeometry(2.0, 0.01, 0.02), new MeshBasicMaterial({ color: 0x37ebf3, fog: false, toneMapped: false }))
    glow.position.set(0, -0.62, -0.62)
    this.group.add(glow)
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
    c.fillStyle = 'rgba(6,8,12,0.55)'
    c.fillRect(0, 0, W, H)
    // frame
    c.strokeStyle = 'rgba(55,235,243,0.6)'
    c.lineWidth = 2
    c.strokeRect(6, 6, W - 12, H - 12)
    c.fillStyle = '#37ebf3'
    c.fillRect(6, 6, 60, 3)
    c.fillRect(W - 66, H - 9, 60, 3)
    // speed
    c.fillStyle = '#fcee0a'
    c.font = 'bold 96px Rajdhani, "Arial Narrow", sans-serif'
    c.textAlign = 'right'
    c.textBaseline = 'alphabetic'
    c.fillText(String(Math.round(s.kmh)), 250, 120)
    c.font = '600 26px Rajdhani, sans-serif'
    c.fillStyle = '#37ebf3'
    c.textAlign = 'left'
    c.fillText('KM/H', 262, 118)
    c.fillText(`GEAR ${s.gear}`, 262, 86)
    // rpm bar
    const bx = 30, by = 140, bw = W - 60, bh = 14
    c.fillStyle = 'rgba(55,235,243,0.18)'
    c.fillRect(bx, by, bw, bh)
    const segs = 28
    for (let i = 0; i < segs; i++) {
      const on = i / segs < s.rpm
      c.fillStyle = on ? (i / segs > 0.8 ? '#ff003c' : '#fcee0a') : 'rgba(255,255,255,0.05)'
      c.fillRect(bx + (i * bw) / segs + 1, by + 2, bw / segs - 3, bh - 4)
    }
    c.font = '600 20px Rajdhani, sans-serif'
    c.fillStyle = '#fcee0a'
    c.textAlign = 'left'
    c.fillText(s.district.toUpperCase(), 30, 174)
    c.textAlign = 'right'
    c.fillStyle = '#e8e8f0'
    c.fillText(s.time, W - 30, 174)
    this.clusterTex.needsUpdate = true
  }
}
