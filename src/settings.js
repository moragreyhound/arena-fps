// Persistent game settings stored in localStorage. Applied live by main.js/ui.

const KEY = 'arena-fps-settings-v1'

export const SETTINGS_FIELDS = [
  { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, on: { id: 'set-sensitivity' } },
  { key: 'fov', label: 'Field of view', type: 'range', min: 60, max: 110, step: 1, on: { id: 'set-fov' } },
  { key: 'volume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, on: { id: 'set-volume' } },
  { key: 'crosshairColor', label: 'Crosshair color', type: 'color', on: { id: 'set-crossColor' } },
  { key: 'crosshairSize', label: 'Crosshair size', type: 'range', min: 10, max: 40, step: 1, on: { id: 'set-crossSize' } },
  { key: 'showFps', label: 'Show FPS counter', type: 'checkbox', on: { id: 'set-showfps' } },
  { key: 'invertY', label: 'Invert mouse Y', type: 'checkbox', on: { id: 'set-inverty' } },
  { key: 'quality', label: 'Graphics quality', type: 'select', on: { id: 'set-quality' }, opts: ['low', 'medium', 'high', 'ultra'] },
]

export const DEFAULT_SETTINGS = {
  sensitivity: 1,
  fov: 80,
  volume: 0.7,
  crosshairColor: '#ffffff',
  crosshairSize: 20,
  showFps: true,
  invertY: false,
  quality: 'high',
}

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* storage unavailable */ }
}

export function applySettingsToDOM(s) {
  const root = document.documentElement
  root.style.setProperty('--cross-color', s.crosshairColor)
  root.style.setProperty('--cross-size', s.crosshairSize + 'px')
  root.style.setProperty('--accent', s.accent || '#ff5252')
}

// Bind the settings form inputs to the settings store. Returns a live API.
export function initSettingsUI(onChange) {
  const s = loadSettings()
  const commit = () => {
    saveSettings(s)
    applySettingsToDOM(s)
    if (onChange) onChange(s)
  }
  const sync = () => {
    for (const f of SETTINGS_FIELDS) {
      const el = document.getElementById(f.on && f.on.id)
      if (!el) continue
      if (el.type === 'checkbox') el.checked = !!s[f.key]
      else el.value = s[f.key]
    }
    for (const f of SETTINGS_FIELDS) {
      const val = document.getElementById('val-' + f.key)
      if (!val) continue
      if (f.key === 'volume') val.textContent = Math.round(s.volume * 100) + '%'
      else if (f.key === 'sensitivity') val.textContent = Number(s.sensitivity).toFixed(2)
      else if (f.key === 'fov') val.textContent = s.fov
      else if (f.key === 'crossSize') val.textContent = s.crossSize
    }
  }
  const bind = (el, key) => {
    if (!el) return
    el.addEventListener('input', () => {
      if (el.type === 'checkbox') s[key] = el.checked
      else if (el.type === 'range' || el.type === 'number') s[key] = parseFloat(el.value)
      else s[key] = el.value
      commit()
      sync()
    })
    el.addEventListener('change', () => { commit(); sync() })
  }
  for (const f of SETTINGS_FIELDS) {
    const el = document.getElementById(f.on && f.on.id)
    if (el) bind(el, f.key)
  }
  const reset = () => {
    Object.assign(s, DEFAULT_SETTINGS)
    saveSettings(s)
    sync()
    commit()
  }
  sync()
  applySettingsToDOM(s)
  return { settings: s, sync, commit, reset }
}