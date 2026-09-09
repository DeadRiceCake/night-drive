import type { TimePreset } from '../tokens'
import { DISTRICTS, type DistrictId } from '../city/map'

export type Weather = 'clear' | 'rain' | 'fog'

export interface Settings {
  time: TimePreset | 'auto' | 'cycle'
  weather: Weather
  speed: number
  seed: number
  fx: boolean
  ads: boolean
  sound: boolean
  at: DistrictId | ''
}

const KEY = 'night-drive.v2.settings'

export const DEFAULTS: Settings = {
  time: 'night', weather: 'clear', speed: 1, seed: 2077, fx: true, ads: true, sound: false, at: '',
}

const CYCLE = [['day', 90], ['dusk', 30], ['night', 150]] as const
const CYCLE_TOTAL = CYCLE.reduce((s, c) => s + c[1], 0)
const cycleStart = Date.now()

export function resolveTime(t: Settings['time']): TimePreset {
  if (t === 'cycle') {
    let e = ((Date.now() - cycleStart) / 1000) % CYCLE_TOTAL
    for (const [p, d] of CYCLE) {
      if (e < d) return p
      e -= d
    }
    return 'night'
  }
  if (t !== 'auto') return t
  const h = new Date().getHours()
  if (h >= 7 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    /* ignore */
  }
  s.at = ''
  const q = new URLSearchParams(location.search)
  const time = q.get('time')
  if (time && ['day', 'dusk', 'night', 'auto', 'cycle'].includes(time)) s.time = time as Settings['time']
  const weather = q.get('weather')
  if (weather && ['clear', 'rain', 'fog'].includes(weather)) s.weather = weather as Weather
  if (!['clear', 'rain', 'fog'].includes(s.weather)) s.weather = 'clear'
  const seed = q.get('seed')
  if (seed && !Number.isNaN(+seed)) s.seed = (+seed) >>> 0
  const speed = q.get('speed')
  if (speed && !Number.isNaN(+speed)) s.speed = Math.max(0.3, Math.min(2, +speed))
  if (q.get('fx') === '0') s.fx = false
  if (q.get('ads') === '0') s.ads = false
  if (q.get('sound') === '1') s.sound = true
  const at = q.get('at')
  if (at && DISTRICTS.some((d) => d.id === at)) s.at = at as DistrictId
  return s
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, at: '' }))
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams()
  q.set('time', s.time)
  q.set('seed', String(s.seed))
  if (s.weather !== 'clear') q.set('weather', s.weather)
  if (s.speed !== 1) q.set('speed', s.speed.toFixed(2))
  if (!s.fx) q.set('fx', '0')
  if (!s.ads) q.set('ads', '0')
  if (s.sound) q.set('sound', '1')
  if (s.at) q.set('at', s.at)
  history.replaceState(null, '', `?${q.toString()}`)
}

const LABELS = {
  time: { auto: '자동', cycle: '순환', day: '낮', dusk: '노을', night: '밤' },
  weather: { clear: '맑음', rain: '비', fog: '스모그' },
}

export interface SettingsHooks {
  onChange: (s: Settings, rebuild: boolean) => void
  onWarp: (id: DistrictId) => void
}

export function mountSettings(root: HTMLElement, initial: Settings, hooks: SettingsHooks): { setOpen: (o: boolean) => void } {
  const s = { ...initial }
  const toggle = document.createElement('button')
  toggle.className = 'ui-toggle'
  toggle.setAttribute('aria-label', '설정')
  toggle.innerHTML = '<span></span><span></span><span></span>'
  const panel = document.createElement('div')
  panel.className = 'ui-panel'
  panel.hidden = true
  root.append(toggle, panel)

  const head = document.createElement('div')
  head.className = 'ui-head'
  head.innerHTML = '<b>NIGHT DRIVE</b><i>NIGHT CITY // 2077</i>'
  panel.appendChild(head)

  const emit = (rebuild: boolean) => {
    saveSettings(s)
    hooks.onChange({ ...s }, rebuild)
  }

  const segmented = <K extends 'time' | 'weather'>(key: K, title: string) => {
    const wrap = document.createElement('div')
    wrap.className = 'ui-row'
    const h = document.createElement('div')
    h.className = 'ui-label'
    h.textContent = title
    const group = document.createElement('div')
    group.className = 'ui-seg'
    group.setAttribute('role', 'radiogroup')
    const labels = LABELS[key] as Record<string, string>
    const buttons: HTMLButtonElement[] = []
    for (const v of Object.keys(labels)) {
      const b = document.createElement('button')
      b.setAttribute('role', 'radio')
      b.textContent = labels[v]
      b.onclick = () => {
        ;(s as Record<string, unknown>)[key] = v
        sync()
        emit(false)
      }
      buttons.push(b)
      group.appendChild(b)
    }
    const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(Object.keys(labels)[i] === s[key])))
    sync()
    wrap.append(h, group)
    panel.appendChild(wrap)
  }
  segmented('time', '시간')
  segmented('weather', '날씨')

  // districts
  {
    const wrap = document.createElement('div')
    wrap.className = 'ui-row'
    const h = document.createElement('div')
    h.className = 'ui-label'
    h.textContent = '구역으로 이동'
    const grid = document.createElement('div')
    grid.className = 'ui-grid'
    for (const d of DISTRICTS) {
      const b = document.createElement('button')
      b.textContent = d.name
      b.dataset.region = d.region
      b.onclick = () => {
        s.at = d.id
        saveSettings(s)
        hooks.onWarp(d.id)
      }
      grid.appendChild(b)
    }
    const bl = document.createElement('button')
    bl.textContent = 'Badlands'
    bl.dataset.region = 'badlands'
    bl.onclick = () => hooks.onWarp('badlands')
    grid.appendChild(bl)
    wrap.append(h, grid)
    panel.appendChild(wrap)
  }

  // speed
  {
    const wrap = document.createElement('div')
    wrap.className = 'ui-row'
    const h = document.createElement('div')
    h.className = 'ui-label'
    const val = document.createElement('span')
    val.className = 'ui-val'
    h.append('속도 ', val)
    const r = document.createElement('input')
    r.type = 'range'
    r.min = '0.3'
    r.max = '2'
    r.step = '0.05'
    r.value = String(s.speed)
    const upd = () => (val.textContent = `${Math.round(s.speed * 100)}%`)
    r.oninput = () => {
      s.speed = +r.value
      upd()
      emit(false)
    }
    upd()
    wrap.append(h, r)
    panel.appendChild(wrap)
  }
  // seed
  {
    const wrap = document.createElement('div')
    wrap.className = 'ui-row'
    const h = document.createElement('div')
    h.className = 'ui-label'
    h.textContent = '시드'
    const line = document.createElement('div')
    line.className = 'ui-line'
    const inp = document.createElement('input')
    inp.type = 'number'
    inp.value = String(s.seed)
    inp.onchange = () => {
      s.seed = Math.max(0, (+inp.value || 0) >>> 0)
      emit(true)
    }
    const dice = document.createElement('button')
    dice.textContent = '무작위'
    dice.onclick = () => {
      s.seed = (Math.random() * 0xffffffff) >>> 0
      inp.value = String(s.seed)
      emit(true)
    }
    line.append(inp, dice)
    wrap.append(h, line)
    panel.appendChild(wrap)
  }
  const check = (key: 'fx' | 'ads' | 'sound', label: string, rebuild: boolean) => {
    const wrap = document.createElement('label')
    wrap.className = 'ui-check'
    const c = document.createElement('input')
    c.type = 'checkbox'
    c.checked = s[key]
    c.onchange = () => {
      s[key] = c.checked
      emit(rebuild)
    }
    wrap.append(c, label)
    panel.appendChild(wrap)
  }
  check('sound', '소리 (엔진·비)', false)
  check('fx', '블룸 · 필름 효과', false)
  check('ads', '광고 표시', false)

  const foot = document.createElement('div')
  foot.className = 'ui-foot'
  foot.textContent = 'ESC 닫기 · 링크를 공유하면 같은 도시가 나옵니다'
  panel.appendChild(foot)

  const setOpen = (open: boolean) => {
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  toggle.onclick = () => setOpen(panel.hidden)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false)
  })
  let idle = 0
  const wake = () => {
    idle = 0
    root.classList.remove('idle')
  }
  for (const ev of ['mousemove', 'mousedown', 'pointerdown', 'click', 'keydown'] as const) document.addEventListener(ev, wake, { capture: true })
  document.addEventListener('touchstart', wake, { passive: true, capture: true })
  setInterval(() => {
    idle++
    if (idle > 5 && panel.hidden) root.classList.add('idle')
  }, 1000)
  return { setOpen }
}
