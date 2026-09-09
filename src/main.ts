import './style.css'
import {
  ACESFilmicToneMapping, DirectionalLight, FogExp2, Group, HemisphereLight, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three'
import * as THREE from 'three'
import { mulberry32 } from './core/rng'
import { ATMOS, EYE_HEIGHT, LANE_OFFSET, LOOK_AHEAD, SPEED_CITY, SPEED_HIGHWAY, type TimePreset } from './tokens'
import { Route, RouteIndex } from './city/route'
import { DISTRICT_BY_ID, districtName, type DistrictId } from './city/map'
import { BuildingSet } from './city/buildings'
import { buildFacadeAtlas, type FacadeAtlas } from './city/facades'
import { buildSurfaces, type SurfaceTextures } from './city/surfaces'
import { LightPool, type NeonEntry } from './fx/lights'
import { buildAtlas, GlowPoints, SignSet } from './city/signs'
import { generateBadlands, generateDistricts, generateGantries, generateOverheads, generateParked, generateRoadside, type CityData, type PropInstance } from './city/generator'
import { Peds } from './city/peds'
import { EXCLUSIONS, placeLandmarks } from './city/landmarks'
import { animateTurbines, buildProps, type PropMeshes } from './city/props'
import { buildTerrain, Ocean, RoadSystem } from './city/roads'
import { Sky } from './city/sky'
import { Traffic } from './city/traffic'
import { Ads, AdOverlay } from './city/ads'
import { Cockpit } from './cockpit/cockpit'
import { Post } from './fx/post'
import { Rain } from './fx/weather'
import { DriveAudio } from './audio'
import { loadSettings, mountSettings, resolveTime, type Settings } from './ui/settings'
import { Minimap, nextDistrict } from './ui/minimap'
import { BoxGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator } from 'three'

const DEBUG = new URLSearchParams(location.search).get('debug') === '1'

// ------------------------------------------------------------------ DOM
const canvas = document.getElementById('view') as HTMLCanvasElement
const hudEl = document.getElementById('hud') as HTMLDivElement
const loadingEl = document.getElementById('loading') as HTMLDivElement
hudEl.innerHTML = `
  <div class="hud-corner tl"></div><div class="hud-corner tr"></div><div class="hud-corner bl"></div><div class="hud-corner br"></div>
  <div class="hud-district"><b id="hud-name">Corpo Plaza</b><i id="hud-region">CITY CENTER</i><em id="hud-next"></em></div>
  <div class="hud-clock"><b id="hud-time">23:47</b>NIGHT CITY</div>
  <div class="hud-speed"><b id="hud-kmh">0</b><i>KM/H</i></div>
  ${DEBUG ? '<div class="hud-debug" id="hud-debug"></div>' : ''}
`
const hudName = document.getElementById('hud-name')!
const hudRegion = document.getElementById('hud-region')!
const hudNext = document.getElementById('hud-next')!
const hudTime = document.getElementById('hud-time')!
const hudKmh = document.getElementById('hud-kmh')!
const hudDebug = document.getElementById('hud-debug')

// ------------------------------------------------------------- renderer
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 1
const scene = new Scene()
scene.fog = new FogExp2(0x1a1024, 0.001)
const camera = new PerspectiveCamera(68, 16 / 9, 0.1, 6000)
const hemi = new HemisphereLight(0x3a2a55, 0x101014, 0.8)
const sun = new DirectionalLight(0x5060a0, 0.2)
scene.add(hemi, sun)
const sky = new Sky()
scene.add(sky.mesh)
const cockpit = new Cockpit()
camera.add(cockpit.group)
scene.add(camera)
const rain = new Rain()
scene.add(rain.lines)
const lights = new LightPool()
scene.add(lights.group)
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy())
const post = new Post(renderer, scene, camera, window.innerWidth, window.innerHeight)
const audio = new DriveAudio()

// ------------------------------------------------------------- settings
let settings: Settings = loadSettings()
let preset: TimePreset = resolveTime(settings.time)

const REGION_LABEL: Record<string, string> = {
  citycenter: 'CITY CENTER', watson: 'WATSON', westbrook: 'WESTBROOK', heywood: 'HEYWOOD', santodomingo: 'SANTO DOMINGO', pacifica: 'PACIFICA', badlands: 'BADLANDS',
}

// ------------------------------------------------------------- world
interface World {
  group: Group
  route: Route
  buildings: BuildingSet
  signs: SignSet
  holos: SignSet
  glow: GlowPoints
  roads: RoadSystem
  ocean: Ocean
  props: PropMeshes
  traffic: Traffic
  peds: Peds
  ads: Ads
  wallRange: [number, number]
  facades: FacadeAtlas
  surfaces: SurfaceTextures
}

let world: World | null = null
const route = new Route()
const routeIndex = new RouteIndex(route)
const minimap = new Minimap(route)
hudEl.appendChild(minimap.canvas)
cockpit.setNav(minimap.texture)

// reflection environment for the cockpit: the sky dome plus a ring of neon-coloured emitters
const pmrem = new PMREMGenerator(renderer)
const envSky = new Sky()
const envScene = new Scene()
envScene.add(envSky.mesh)
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2
  const b = new Mesh(new BoxGeometry(24, 70 + (i % 3) * 50, 24), new MeshBasicMaterial({ color: new Color([0x37ebf3, 0xff2a6d, 0xfcee0a, 0xffd28a, 0x9fd8ff][i % 5]).multiplyScalar(0.45) }))
  b.position.set(Math.cos(a) * 320, 30 + (i % 3) * 30, Math.sin(a) * 320)
  envScene.add(b)
}
let envPreset: TimePreset | '' = ''
let envTex: import('three').Texture | null = null
function refreshEnv(): void {
  if (envPreset === preset) return
  envPreset = preset
  envSky.update(preset, 0)
  const rt = pmrem.fromScene(envScene, 0.05, 0.1, 6000)
  envTex?.dispose()
  envTex = rt.texture
  cockpit.setEnvironment(envTex)
}
let s = 0
let speed = 0
let steer = 0
let curDistrict: DistrictId | '' = ''

async function buildWorld(seed: number): Promise<World> {
  const rng = mulberry32(seed)
  const atlas = buildAtlas(rng)
  const facades = buildFacadeAtlas(rng, ANISO)
  const surfaces = buildSurfaces(rng, ANISO)
  const city: CityData = {
    buildings: new BuildingSet(), signs: new SignSet(atlas, false), holos: new SignSet(atlas, true), glow: new GlowPoints(), props: [] as PropInstance[],
  }
  const g = { rng, route, index: routeIndex, atlas, city, exclusions: EXCLUSIONS }
  const group = new Group()
  group.add(placeLandmarks(g))
  generateDistricts(g)
  generateBadlands(g)
  generateParked(g)
  generateGantries(g)
  generateOverheads(g)
  generateRoadside(g)
  const ads = new Ads(atlas, city.signs)
  await ads.load('ads/manifest.json')
  ads.place(route, routeIndex, rng, 0)
  city.buildings.setAtlas(facades.albedo, facades.detail)
  const roads = new RoadSystem(route, city, surfaces, EXCLUSIONS)
  group.add(roads.group)
  const props = buildProps(city.props, city.glow)
  group.add(props.group)
  group.add(city.buildings.build())
  group.add(city.signs.build())
  group.add(city.holos.build())
  group.add(city.glow.build())
  group.add(buildTerrain(route, routeIndex))
  const ocean = new Ocean()
  group.add(ocean.mesh)
  const traffic = new Traffic(route, seed)
  group.add(traffic.group)
  const peds = new Peds(route, seed)
  group.add(peds.group)
  lights.setLamps(roads.lamps)
  const neon: NeonEntry[] = []
  city.glow.forEach((x, y, z, color, size) => { if (size >= 6) neon.push({ x, y, z, color, size }) })
  lights.setNeon(neon)
  // ad wall: the first 300 m of downtown after entering it
  const dt = route.findDistrict('downtown')
  const wallRange: [number, number] = [dt + 60, dt + 420]
  if (DEBUG) console.info('[world]', { buildings: city.buildings.items.length, signs: city.signs.items.length, holos: city.holos.items.length, glow: city.glow.count, props: city.props.length })
  return { group, route, buildings: city.buildings, signs: city.signs, holos: city.holos, glow: city.glow, roads, ocean, props, traffic, peds, ads, wallRange, facades, surfaces }
}

function disposeWorld(w: World): void {
  scene.remove(w.group)
  w.facades.albedo.dispose(); w.facades.detail.dispose(); w.surfaces.albedo.dispose(); w.surfaces.detail.dispose()
  w.group.traverse((o) => {
    const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] }
    m.geometry?.dispose()
    if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose())
    else m.material?.dispose()
  })
}

const overlay = new AdOverlay(document.body)

function applySettings(next: Settings, rebuild: boolean): void {
  settings = next
  preset = resolveTime(next.time)
  rain.active = next.weather === 'rain'
  post.enabled = next.fx
  audio.setEnabled(next.sound)
  audio.setRain(next.weather === 'rain')
  if (next.sound) audio.start()
  overlay.enabled = next.ads
  if (world) world.ads.enabled = next.ads
  if (rebuild) void rebuildWorld(next.seed)
}

let building = false
async function rebuildWorld(seed: number): Promise<void> {
  if (building) return
  building = true
  loadingEl.classList.remove('done')
  if (world) disposeWorld(world)
  world = null
  await new Promise((r) => setTimeout(r, 30))
  const w = await buildWorld(seed)
  scene.add(w.group)
  world = w
  w.ads.enabled = settings.ads
  loadingEl.classList.add('done')
  building = false
}

function warpTo(id: string): void {
  if (id === 'badlands') s = route.findKind('badlands')
  else if (['highway', 'coast', 'hill', 'street'].includes(id)) s = route.findKind(id as never)
  else s = route.findDistrict(id as DistrictId)
  speed = 0
  world?.traffic.respawnAll(s)
  world?.peds.respawnAll(s)
}

mountSettings(document.getElementById('ui')!, settings, {
  onChange: applySettings,
  onWarp: (id) => warpTo(id),
})

// ------------------------------------------------------------- resize
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = w < h ? 80 : 68
  camera.updateProjectionMatrix()
  post.setSize(w, h)
}
window.addEventListener('resize', resize)
resize()

// ------------------------------------------------------------- loop
const camPos = new Vector3(), look = new Vector3(), forward = new Vector3(), rightV = new Vector3(), UP = new Vector3(0, 1, 0)
let last = performance.now()
let time = 0
let fps = 0, fpsAcc = 0, fpsN = 0
let audioTick = 0

function frame(now: number): void {
  requestAnimationFrame(frame)
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.1) dt = 0.1
  time += dt
  if (!world) return
  const a = ATMOS[preset]
  const fogMul = settings.weather === 'fog' ? 2.1 : settings.weather === 'rain' ? 1.35 : 1
  const wet = settings.weather === 'rain' ? 1 : preset === 'night' ? 0.7 : 0.35

  // ---- drive
  const smp = route.at(s)
  const target = (smp.kind === 'highway' ? SPEED_HIGHWAY : smp.kind === 'badlands' ? SPEED_HIGHWAY * 0.95 : SPEED_CITY) * settings.speed
  let want = target
  const gap = world.traffic.gapAhead(s)
  if (gap < 30) want = Math.min(want, target * 0.6)
  speed += (want - speed) * Math.min(1, dt * (want < speed ? 1.6 : 0.5))
  s = route.wrap(s + speed * dt)
  route.pos(s, LANE_OFFSET, camPos, EYE_HEIGHT)
  route.pos(s + LOOK_AHEAD, LANE_OFFSET, look, EYE_HEIGHT * 0.92)
  // subtle body motion
  camPos.y += Math.sin(time * 9.1) * 0.006 + Math.sin(time * 2.3) * 0.01
  camera.position.copy(camPos)
  camera.lookAt(look)
  const curv = smp.curv
  steer += (curv * 26 - steer) * Math.min(1, dt * 4)
  camera.rotateZ(-steer * 0.06)
  forward.copy(look).sub(camPos).normalize()
  rightV.crossVectors(forward, UP).normalize()
  cockpit.update(steer)
  lights.update(s, route.length, camPos, forward, rightV, preset, preset !== 'day')

  // ---- atmosphere
  ;(scene.fog as FogExp2).color.set(a.fogColor)
  ;(scene.fog as FogExp2).density = a.fogDensity * fogMul
  hemi.color.set(a.skyGlow)
  hemi.groundColor.set(0x101014)
  hemi.intensity = 0.5 + 0.6 * a.sunStrength
  sun.color.set(a.sunColor)
  sun.intensity = a.sunStrength * 1.4
  sun.position.set(a.sunDir[0], a.sunDir[1], a.sunDir[2]).multiplyScalar(1000).add(camPos)
  sun.target.position.copy(camPos)
  sun.target.updateMatrixWorld()
  renderer.toneMappingExposure = a.exposure
  post.bloom.strength = a.bloomStrength * (settings.weather === 'rain' ? 1.15 : 1)
  sky.mesh.position.copy(camPos)
  sky.update(preset, time)
  world.buildings.applyAtmosphere(preset, camera, time)
  world.buildings.material.uniforms.uFogDensity.value = a.fogDensity * fogMul
  world.signs.update(preset, camera, time, fogMul)
  world.holos.update(preset, camera, time, fogMul)
  world.glow.update(preset, time, renderer.domElement.height, fogMul)
  world.roads.update(preset, camera, time, wet, fogMul)
  world.ocean.update(preset, camera, time, fogMul)
  world.traffic.update(dt, s, speed, preset, renderer.domElement.height, fogMul, time)
  world.peds.update(dt, s, time)
  animateTurbines(world.props, time)
  rain.update(dt, camera, forward)
  overlay.update(s > world.wallRange[0] && s < world.wallRange[1])

  // ---- HUD
  const kmh = speed * 3.6
  hudKmh.textContent = String(Math.round(kmh))
  if (smp.district !== curDistrict) {
    curDistrict = smp.district
    hudName.textContent = districtName(smp.district)
    hudRegion.textContent = REGION_LABEL[DISTRICT_BY_ID[smp.district].region] ?? ''
    hudName.animate([{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'ease-out' })
  }
  const nx = nextDistrict(route, s, smp.district)
  hudNext.textContent = nx ? `NEXT ▸ ${districtName(nx.id).toUpperCase()} · ${nx.dist >= 1000 ? (nx.dist / 1000).toFixed(1) + ' KM' : Math.round(nx.dist / 10) * 10 + ' M'}` : ''
  minimap.draw(camPos.x, camPos.z, Math.atan2(smp.tx, smp.tz), now, smp.district, nx?.id ?? null, nx?.dist ?? 0)
  refreshEnv()
  const d = new Date()
  hudTime.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  cockpit.drawCluster({ kmh, rpm: 0.25 + (speed / SPEED_HIGHWAY) * 0.55 + Math.sin(time * 13) * 0.01, gear: Math.min(6, 1 + Math.floor(kmh / 22)), district: districtName(smp.district), time: hudTime.textContent, next: nx ? districtName(nx.id) : '—', nextDist: nx?.dist ?? 0 }, now)
  if ((audioTick = (audioTick + 1) % 8) === 0) audio.setSpeed(speed / SPEED_CITY)

  // ---- render
  cockpit.renderMirror(renderer, scene, camPos, forward)
  post.render(time, settings.weather === 'rain' ? 1 : 0, scene, camera)

  fpsAcc += dt
  fpsN++
  if (fpsAcc >= 1) {
    fps = Math.round(fpsN / fpsAcc)
    fpsAcc = 0
    fpsN = 0
    if (hudDebug) hudDebug.textContent = `${fps} FPS  s=${Math.round(s)}  ${smp.kind}  ${smp.district}  spd=${Math.round(speed)}  calls=${renderer.info.render.calls}  tris=${renderer.info.render.triangles}`
  }
}

// ------------------------------------------------------------- input
const ndc = new Vector2()
function toNdc(e: MouseEvent): Vector2 {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  return ndc
}
canvas.addEventListener('mousemove', (e) => {
  if (!world) return
  canvas.style.cursor = world.ads.hit(toNdc(e), camera) ? 'pointer' : 'default'
})
canvas.addEventListener('click', (e) => {
  if (!world) return
  const url = world.ads.hit(toNdc(e), camera)
  if (url) window.open(url, '_blank', 'noopener')
})
const gesture = () => {
  if (settings.sound) audio.start()
}
document.addEventListener('pointerdown', gesture)
document.addEventListener('keydown', gesture)
setInterval(() => {
  if (settings.time === 'auto' || settings.time === 'cycle') preset = resolveTime(settings.time)
}, 1000)
document.addEventListener('visibilitychange', () => {
  last = performance.now()
})

// ------------------------------------------------------------- boot
async function boot(): Promise<void> {
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
    await (document.fonts.load('700 40px Rajdhani').catch(() => undefined))
  } catch {
    /* ignore */
  }
  applySettings(settings, false)
  await rebuildWorld(settings.seed)
  if (settings.at) warpTo(settings.at)
  else { s = 20; world?.traffic.respawnAll(s); world?.peds.respawnAll(s) }
  speed = 0
  requestAnimationFrame(frame)
}
void boot()

// Debug helpers
;(window as unknown as { nd: unknown }).nd = {
  get world() { return world },
  get s() { return s },
  get preset() { return preset },
  get settings() { return settings },
  warpTo,
  setTime: (p: TimePreset) => { preset = p },
  camera,
  renderer,
  scene,
  THREE,
}
