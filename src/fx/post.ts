/** Post chain: render -> bloom -> grade (vignette, chromatic aberration, grain, tint). */
import { Vector2, type Scene, type Camera, type WebGLRenderer, HalfFloatType } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0011 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.028 },
    uLift: { value: new Vector2(0.02, 0.035) },
    uRain: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAberration; uniform float uVignette; uniform float uGrain; uniform vec2 uLift; uniform float uRain;
    varying vec2 vUv;
    float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 uv = vUv;
      vec2 d = (uv - 0.5);
      float r2 = dot(d, d);
      // windshield rain: slight refraction wobble
      if (uRain > 0.0) {
        vec2 cell = floor(uv * vec2(40.0, 24.0));
        float h = hash12(cell + floor(uTime * 0.8));
        vec2 drop = fract(uv * vec2(40.0, 24.0)) - 0.5;
        float dd = length(drop);
        float on = step(0.92, h) * (1.0 - smoothstep(0.15, 0.3, dd));
        uv += drop * on * 0.08 * uRain;
      }
      vec2 off = d * uAberration * (1.0 + r2 * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // teal shadows, warm highlights (CP2077 grade)
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += vec3(-uLift.x, uLift.x * 0.4, uLift.y) * (1.0 - smoothstep(0.0, 0.45, lum));
      col *= vec3(1.03, 1.0, 0.96);
      // vignette
      float v = 1.0 - smoothstep(0.25, 1.15, r2 * 2.0) * uVignette;
      col *= v;
      // grain
      float g = (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;
      col += g;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export class Post {
  composer: EffectComposer
  bloom: UnrealBloomPass
  grade: ShaderPass
  enabled = true
  constructor(private renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number, private bloomScale = 1) {
    this.composer = new EffectComposer(renderer)
    this.composer.renderTarget1.texture.type = HalfFloatType
    this.composer.renderTarget2.texture.type = HalfFloatType
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(new Vector2(w * bloomScale, h * bloomScale), 0.6, 0.4, 0.95)
    this.composer.addPass(this.bloom)
    this.grade = new ShaderPass(GRADE)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())
    this.setSize(w, h)
  }
  setSize(w: number, h: number): void {
    this.composer.setSize(w, h)
    this.bloom.setSize(w * this.bloomScale, h * this.bloomScale)
  }
  render(time: number, rain: number, scene: Scene, camera: Camera): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera)
      return
    }
    this.grade.uniforms.uTime.value = time
    this.grade.uniforms.uRain.value = rain
    this.composer.render()
  }
}
