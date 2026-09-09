/** Rain streaks around the camera (world-space particles recycled in a box). */
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3, type Camera } from 'three'

const VERT = /* glsl */ `
attribute float aEnd;
varying float vA;
uniform vec3 uCam;
void main() {
  vA = aEnd;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`
const FRAG = /* glsl */ `
precision highp float;
varying float vA;
uniform float uAlpha;
void main() { gl_FragColor = vec4(0.7, 0.8, 1.0, uAlpha * (0.25 + 0.75 * vA)); }
`

export class Rain {
  lines: LineSegments
  private pos: Float32Array
  private vel: Float32Array
  private material: ShaderMaterial
  private count = 1400
  active = false
  private box = new Vector3(60, 30, 60)
  constructor() {
    this.pos = new Float32Array(this.count * 2 * 3)
    this.vel = new Float32Array(this.count)
    const end = new Float32Array(this.count * 2)
    for (let i = 0; i < this.count; i++) {
      this.vel[i] = 22 + Math.random() * 10
      end[i * 2] = 0
      end[i * 2 + 1] = 1
      this.reset(i, new Vector3(), true)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('aEnd', new BufferAttribute(end, 1))
    this.material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uCam: { value: new Vector3() }, uAlpha: { value: 0 } },
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    })
    this.lines = new LineSegments(g, this.material)
    this.lines.frustumCulled = false
    this.lines.renderOrder = 40
  }
  private reset(i: number, c: Vector3, anywhere: boolean): void {
    const x = c.x + (Math.random() - 0.5) * this.box.x
    const y = c.y + (anywhere ? Math.random() : 1) * this.box.y - 4
    const z = c.z + (Math.random() - 0.5) * this.box.z
    this.pos[i * 6] = x; this.pos[i * 6 + 1] = y; this.pos[i * 6 + 2] = z
    this.pos[i * 6 + 3] = x + 0.15; this.pos[i * 6 + 4] = y - 1.2; this.pos[i * 6 + 5] = z
  }
  update(dt: number, camera: Camera, forward: Vector3): void {
    const target = this.active ? 0.55 : 0
    this.material.uniforms.uAlpha.value += (target - this.material.uniforms.uAlpha.value) * Math.min(1, dt * 2)
    this.lines.visible = this.material.uniforms.uAlpha.value > 0.01
    if (!this.lines.visible) return
    const c = camera.position.clone().addScaledVector(forward, 18)
    for (let i = 0; i < this.count; i++) {
      const dy = this.vel[i] * dt
      this.pos[i * 6 + 1] -= dy
      this.pos[i * 6 + 4] -= dy
      const y = this.pos[i * 6 + 1]
      const x = this.pos[i * 6], z = this.pos[i * 6 + 2]
      if (y < c.y - 6 || Math.abs(x - c.x) > this.box.x / 2 || Math.abs(z - c.z) > this.box.z / 2) this.reset(i, c, false)
    }
    ;(this.lines.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }
}
