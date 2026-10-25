/**
 * HUDCustomizer — Drag-and-drop HUD layout editor.
 *
 * Features:
 *   • Edit mode toggled from the pause / settings menu
 *   • Drag any HUD element freely (clamped to viewport)
 *   • Per-element scale slider  (50 % – 200 %)
 *   • Per-element opacity slider (20 % – 100 %)
 *   • Automatic localStorage persistence
 *   • "Reset to Default" restores factory layout
 */

const STORAGE_KEY = 'arena-fps-hud-layout-v2'

const ELEMENTS = [
  { id: 'status-panel', label: 'Status Panel' },
  { id: 'hotbar',       label: 'Weapon Hotbar' },
  { id: 'match-panel',  label: 'Match Panel' },
  { id: 'conn-status',  label: 'Connection' },
  { id: 'fps',          label: 'FPS Counter' },
  { id: 'chat',         label: 'Chat' },
  { id: 'crosshair',    label: 'Crosshair' },
  { id: 'hint',         label: 'Controls Hint' },
]

function defaultLayout() {
  const m = {}
  for (const e of ELEMENTS) m[e.id] = { ox: 0, oy: 0, scale: 1, opacity: 1 }
  return m
}

export class HUDCustomizer {
  constructor() {
    this.layout = this._load()
    this.editing = false
    this.selectedId = null
    this._drag = null
    this._panel = null
    this._toolbar = null
    this._touchMap = {}
    this._touchEls = []
    this._bound = new WeakSet()
    this._buildUI()
    this._applyAll()
  }

  /* ------------------------------------------------------------------ */
  /*  Persistence                                                        */
  /* ------------------------------------------------------------------ */
  _load() {
    try { return { ...defaultLayout(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } }
    catch { return defaultLayout() }
  }
  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout)) } catch { /* noop */ }
  }

  /* ------------------------------------------------------------------ */
  /*  Apply transforms to the live DOM                                   */
  /*  Uses CSS translate/scale properties (independent of `transform`)   */
  /*  so centered elements keep their base transform.                    */
  /* ------------------------------------------------------------------ */
_resolveEl(id) {
  return document.getElementById(id) || this._touchMap[id] || null
}

_applyAll() {
  for (const [id, s] of Object.entries(this.layout)) {
    const el = this._resolveEl(id)
    if (!el) continue
    el.style.translate = `${s.ox}px ${s.oy}px`
    el.style.scale = String(s.scale)
    el.style.opacity = String(s.opacity)
  }
}
_applyOne(id) {
  const s = this.layout[id]
  const el = this._resolveEl(id)
  if (!el || !s) return
  el.style.translate = `${s.ox}px ${s.oy}px`
  el.style.scale = String(s.scale)
  el.style.opacity = String(s.opacity)
}

  /* ------------------------------------------------------------------ */
  /*  Editor DOM (toolbar + property panel)                              */
  /* ------------------------------------------------------------------ */
  _buildUI() {
    /* ---- Toolbar ---- */
    this._toolbar = document.createElement('div')
    this._toolbar.id = 'hud-edit-toolbar'
    this._toolbar.innerHTML = `
      <span class="hed-title">HUD Editor</span>
      <button class="hed-btn hed-save">Save</button>
      <button class="hed-btn hed-reset">Reset</button>
      <button class="hed-btn hed-cancel">Cancel</button>
    `
    document.body.appendChild(this._toolbar)

    this._toolbar.querySelector('.hed-save').addEventListener('click', () => this.save())
    this._toolbar.querySelector('.hed-reset').addEventListener('click', () => this.reset())
    this._toolbar.querySelector('.hed-cancel').addEventListener('click', () => this.exit())

    /* ---- Property panel ---- */
    this._panel = document.createElement('div')
    this._panel.id = 'hud-edit-panel'
    this._panel.innerHTML = `
      <div class="hed-panel-head"><span class="hed-el-name"></span></div>
      <label>Scale <span class="hed-scale-val">100%</span></label>
      <input class="hed-scale" type="range" min="50" max="200" value="100" />
      <label>Opacity <span class="hed-opacity-val">100%</span></label>
      <input class="hed-opacity" type="range" min="20" max="100" value="100" />
    `
    document.body.appendChild(this._panel)

    const scaleInput = this._panel.querySelector('.hed-scale')
    const opacInput = this._panel.querySelector('.hed-opacity')
    scaleInput.addEventListener('input', () => {
      if (!this.selectedId) return
      const v = parseInt(scaleInput.value, 10) / 100
      this.layout[this.selectedId].scale = v
      this._applyOne(this.selectedId)
      this._panel.querySelector('.hed-scale-val').textContent = scaleInput.value + '%'
    })
    opacInput.addEventListener('input', () => {
      if (!this.selectedId) return
      const v = parseInt(opacInput.value, 10) / 100
      this.layout[this.selectedId].opacity = v
      this._applyOne(this.selectedId)
      this._panel.querySelector('.hed-opacity-val').textContent = opacInput.value + '%'
    })

    /* Drag + select on each static HUD element */
    for (const e of ELEMENTS) {
      const el = document.getElementById(e.id)
      if (el) this._bindDrag(el, e.id)
    }

    this._hideUI()
  }

  /**
   * Register the mobile touch controls so they can be edited too.
   * @param {Array<{id:string, el:HTMLElement, label:string}>} list
   */
  registerTouchControls(list) {
    for (const c of list || []) {
      if (!this.layout[c.id]) this.layout[c.id] = { ox: 0, oy: 0, scale: 1, opacity: 1 }
      this._touchMap[c.id] = c.el
      this._bindDrag(c.el, c.id)
    }
    this._touchEls = list || []
    this._applyAll()
  }

  * _editableIds() {
    for (const e of ELEMENTS) yield e.id
    for (const c of this._touchEls) yield c.id
  }

  _labelOf(id) {
    const staticInfo = ELEMENTS.find(e => e.id === id)
    if (staticInfo) return staticInfo.label
    const touch = this._touchEls.find(c => c.id === id)
    return touch ? touch.label : id
  }

  _bindDrag(el, id) {
    if (this._bound.has(el)) return
    this._bound.add(el)
    el.addEventListener('pointerdown', (ev) => this._onDragStart(ev, id))
  }

  _hideUI() {
    this._toolbar.style.display = 'none'
    this._panel.style.display = 'none'
  }
  _showUI() {
    this._toolbar.style.display = 'flex'
    if (this.selectedId) this._showPanel(this.selectedId)
  }
  _showPanel(id) {
    const s = this.layout[id]
    if (!s) return
    this._panel.querySelector('.hed-el-name').textContent = this._labelOf(id)
    this._panel.querySelector('.hed-scale').value = Math.round(s.scale * 100)
    this._panel.querySelector('.hed-opacity').value = Math.round(s.opacity * 100)
    this._panel.querySelector('.hed-scale-val').textContent = Math.round(s.scale * 100) + '%'
    this._panel.querySelector('.hed-opacity-val').textContent = Math.round(s.opacity * 100) + '%'
    this._panel.style.display = 'block'
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & drop                                                        */
  /* ------------------------------------------------------------------ */
  _onDragStart(ev, id) {
    if (!this.editing) return
    ev.preventDefault()
    ev.stopPropagation()
    this._select(id)
    const s = this.layout[id]
    if (!s) return
    this._drag = { id, startX: ev.clientX - s.ox, startY: ev.clientY - s.oy }
    const onMove = (e) => {
      if (!this._drag) return
      const l = this.layout[this._drag.id]
      l.ox = e.clientX - this._drag.startX
      l.oy = e.clientY - this._drag.startY
      /* Clamp within viewport */
      const el = this._resolveEl(this._drag.id)
      if (el) {
        const r = el.getBoundingClientRect()
        const hw = r.width / 2, hh = r.height / 2
        l.ox = Math.max(-r.left - hw + 10, Math.min(window.innerWidth - r.left - hw - 10, l.ox))
        l.oy = Math.max(-r.top - hh + 10, Math.min(window.innerHeight - r.top - hh - 10, l.oy))
      }
      this._applyOne(this._drag.id)
    }
    const onUp = () => {
      this._drag = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  _select(id) {
    /* Remove old highlight */
    if (this.selectedId) {
      const prev = this._resolveEl(this.selectedId)
      if (prev) prev.classList.remove('hed-selected')
    }
    this.selectedId = id
    const el = this._resolveEl(id)
    if (el) el.classList.add('hed-selected')
    this._showPanel(id)
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */
  enter() {
    this.editing = true
    document.body.classList.add('hud-editing')
    for (const id of this._editableIds()) {
      const el = this._resolveEl(id)
      if (el) el.classList.add('hed-editable')
    }
    this._showUI()
  }

  exit() {
    this.editing = false
    document.body.classList.remove('hud-editing')
    for (const id of this._editableIds()) {
      const el = this._resolveEl(id)
      if (el) el.classList.remove('hed-editable', 'hed-selected')
    }
    this.selectedId = null
    this._hideUI()
    document.dispatchEvent(new CustomEvent('hud-edit-closed'))
  }

  save() {
    this._save()
    this._applyAll()
    this.exit()
  }

  reset() {
    const def = defaultLayout()
    for (const c of this._touchEls) {
      if (!def[c.id]) def[c.id] = { ox: 0, oy: 0, scale: 1, opacity: 1 }
    }
    this.layout = def
    this._save()
    this._applyAll()
    if (this.selectedId) this._showPanel(this.selectedId)
  }

  get isEditing() { return this.editing }
}
