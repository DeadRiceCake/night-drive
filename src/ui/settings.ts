import type { Biome, TimePreset } from '../tokens'

export interface Settings {
  time: TimePreset | 'auto'
  biome: Biome | 'mixed'
  speed: number
  seed: number
  crt: boolean
  ads: boolean
}

const KEY = 'night-drive.settings'

export const DEFAULTS: Settings = { time: 'night', biome: 'mixed', speed: 1, seed: 1234, crt: false, ads: true }

export function resolveTime(t: Settings['time']): TimePreset {
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
  const q = new URLSearchParams(location.search)
  const time = q.get('time')
  if (time && ['day', 'dusk', 'night', 'auto'].includes(time)) s.time = time as Settings['time']
  const biome = q.get('scene')
  if (biome && ['countryside', 'city', 'highway', 'mixed'].includes(biome)) s.biome = biome as Settings['biome']
  const seed = q.get('seed')
  if (seed && !Number.isNaN(+seed)) s.seed = (+seed) >>> 0
  const speed = q.get('speed')
  if (speed && !Number.isNaN(+speed)) s.speed = Math.max(0.4, Math.min(1.8, +speed))
  if (q.get('crt') === '1') s.crt = true
  if (q.get('ads') === '0') s.ads = false
  return s
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams()
  q.set('time', s.time)
  q.set('scene', s.biome)
  q.set('seed', String(s.seed))
  if (s.speed !== 1) q.set('speed', s.speed.toFixed(2))
  if (s.crt) q.set('crt', '1')
  if (!s.ads) q.set('ads', '0')
  history.replaceState(null, '', `?${q.toString()}`)
}

const LABELS = {
  time: { auto: '자동', day: '낮', dusk: '노을', night: '밤' },
  biome: { mixed: '혼합', countryside: '시골', city: '도시', highway: '고속도로' },
}

/**
 * Builds the settings panel DOM. `onChange` receives the new settings and a
 * flag telling whether the world must be rebuilt (seed/biome).
 */
export function mountSettings(root: HTMLElement, initial: Settings, onChange: (s: Settings, rebuild: boolean) => void): void {
  const s = { ...initial }
  const toggle = document.createElement('button')
  toggle.className = 'ui-toggle'
  toggle.setAttribute('aria-label', '설정')
  toggle.textContent = '≡'
  const panel = document.createElement('div')
  panel.className = 'ui-panel'
  panel.hidden = true
  root.append(toggle, panel)

  const emit = (rebuild: boolean) => {
    saveSettings(s)
    onChange({ ...s }, rebuild)
  }

  const segmented = <K extends 'time' | 'biome'>(key: K, title: string, rebuild: boolean) => {
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
        emit(rebuild)
      }
      buttons.push(b)
      group.appendChild(b)
    }
    const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(Object.keys(labels)[i] === s[key])))
    sync()
    wrap.append(h, group)
    panel.appendChild(wrap)
  }

  segmented('time', '시간', false)
  segmented('biome', '지역', true)

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
    r.min = '0.4'
    r.max = '1.8'
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

  const check = (key: 'crt' | 'ads', label: string, rebuild: boolean) => {
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
  check('crt', 'CRT 스캔라인', false)
  check('ads', '광고 표시', true)

  const foot = document.createElement('div')
  foot.className = 'ui-foot'
  foot.textContent = 'ESC 닫기 · 링크를 공유하면 같은 풍경이 나옵니다'
  panel.appendChild(foot)

  const setOpen = (open: boolean) => {
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  toggle.onclick = () => setOpen(panel.hidden)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false)
  })

  // Hide the toggle while idle
  let idle = 0
  const wake = () => {
    idle = 0
    root.classList.remove('idle')
  }
  document.addEventListener('mousemove', wake)
  document.addEventListener('touchstart', wake, { passive: true })
  setInterval(() => {
    idle++
    if (idle > 5 && panel.hidden) root.classList.add('idle')
  }, 1000)
}
