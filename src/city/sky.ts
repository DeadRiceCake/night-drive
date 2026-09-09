/** Sky dome: gradient + light-pollution glow at the horizon, stars, moon/sun. */
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { ATMOS, type TimePreset } from '../tokens'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uFog;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunK; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main() {
  float y = vDir.y;
  float h = clamp(y, -0.05, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.65));
  // smog band right at the horizon + city light dome
  col = mix(col, uFog, 1.0 - smoothstep(0.0, 0.05, h));
  col += uGlow * exp(-h * 9.0) * 0.55;
  // sun / moon
  float sd = max(dot(vDir, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.25) * max(uSunK, 0.15);
  // stars (dim: light pollution)
  if (uStars > 0.0 && y > 0.05) {
    vec3 d = floor(vDir * 380.0);
    float s = hash13(d);
    float star = step(0.9975, s) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 90.0));
    col += vec3(0.8, 0.85, 1.0) * star * uStars * smoothstep(0.1, 0.5, y) * 0.22;
  }
  // thin high clouds streaks
  float c = sin(vDir.x * 9.0 + vDir.z * 4.0 + uTime * 0.01) * sin(vDir.z * 13.0 - vDir.x * 3.0);
  col += uGlow * 0.06 * smoothstep(0.3, 0.9, c) * smoothstep(0.02, 0.3, y);
  gl_FragColor = vec4(col, 1.0);
}
`

export class Sky {
  mesh: Mesh
  material: ShaderMaterial
  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTop: { value: new Color() }, uHorizon: { value: new Color() }, uGlow: { value: new Color() }, uFog: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) }, uSunColor: { value: new Color() }, uSunK: { value: 0 }, uStars: { value: 1 }, uTime: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
      depthTest: true,
    })
    this.mesh = new Mesh(new SphereGeometry(4500, 48, 24), this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -100
  }
  update(preset: TimePreset, time: number): void {
    const a = ATMOS[preset]
    const u = this.material.uniforms
    ;(u.uTop.value as Color).set(a.skyTop)
    ;(u.uHorizon.value as Color).set(a.skyHorizon)
    ;(u.uGlow.value as Color).set(a.skyGlow)
    ;(u.uFog.value as Color).set(a.fogColor)
    ;(u.uSunDir.value as Vector3).set(...a.sunDir).normalize()
    ;(u.uSunColor.value as Color).set(a.sunColor)
    u.uSunK.value = a.sunStrength
    u.uStars.value = preset === 'night' ? 1 : preset === 'dusk' ? 0.3 : 0
    u.uTime.value = time
  }
}
