/**
 * TouchControls — PUBG-style mobile multi-touch input system.
 *
 * Separated input zones:
 *   Left screen zone  → Dynamic virtual joystick (movement)
 *   Right screen zone → Full-screen swipe for camera rotation
 *   Fixed left fire   → Tap to fire while right thumb aims
 *   Fixed right fire  → Tap-to-drag with direct camera panning
 *   Action buttons    → ADS, Jump, Crouch, Prone, Reload, Grenade,
 *                       Sprint, Weapon Slots 1-4
 *
 * Multi-touch is tracked via Touch.identifier so claw-grip players
 * can move, look, and fire simultaneously without conflict.
 */

const JOY_MAX_RADIUS = 44
const JOY_DEADZONE = 0.14
const LOOK_SENSITIVITY = 1.0

export class TouchControls {
  /**
   * @param {HTMLElement} container — must be a full-viewport overlay
   * @param {Object}      cb       — input callbacks
   * @param {Function}    cb.onMove(fwd, back, left, right, sprint)
   * @param {Function}    cb.onLook(dx, dy)
   * @param {Function}    cb.onFire(pressed)
   * @param {Function}    cb.onJump()
   * @param {Function}    cb.onCrouch()
   * @param {Function}    cb.onProne()
   * @param {Function}    cb.onReload()
   * @param {Function}    cb.onADS(pressed)
   * @param {Function}    cb.onSprint(pressed)
   * @param {Function}    cb.onWeapon(slotIndex)
   * @param {Function}    cb.onGrenade()
   */
  constructor(container, cb) {
    this.el = container
    this.cb = cb
    this._touches = new Map()
    this._joyCenter = { x: 0, y: 0 }
    this._joyActive = false
    this._inputEnabled = true
    this._editPreviewEl = null
    this._buildDOM()
    this._bind()
  }

  /* ------------------------------------------------------------------ */
  /*  DOM                                                                */
  /* ------------------------------------------------------------------ */
  _buildDOM() {
    this.el.innerHTML = ''

    /* ---------- Joystick ---------- */
    this._joyBase = this._div('tc-joy-base')
    this._joyThumb = this._div('tc-joy-thumb')
    this._joyBase.appendChild(this._joyThumb)

    /* ---------- Fire buttons ---------- */
    this._leftFire = this._btn('tc-fire tc-fire-left', 'FIRE')
    this._rightFire = this._btn('tc-fire tc-fire-right', 'FIRE')

    /* ---------- Action buttons ---------- */
    this._adsBtn = this._btn('tc-act tc-ads', 'ADS')
    this._jumpBtn = this._btn('tc-act tc-jump', 'JUMP')
    this._crouchBtn = this._btn('tc-act tc-crouch', 'KNEEL')
    this._proneBtn = this._btn('tc-act tc-prone', 'PRONE')
    this._reloadBtn = this._btn('tc-act tc-reload', 'R')
    this._grenadeBtn = this._btn('tc-act tc-grenade', 'G')
    this._sprintBtn = this._btn('tc-act tc-sprint', 'SPRINT')
    this._pauseBtn = this._btn('tc-act tc-pause', '\u275A\u275A')

    /* ---------- Weapon slots ---------- */
    this._wslots = []
    for (let i = 0; i < 4; i++) {
      const s = this._btn('tc-wslot', String(i + 1))
      s.dataset.slot = String(i)
      this._wslots.push(s)
    }

    this.el.append(
      this._joyBase,
      this._leftFire, this._rightFire,
      this._adsBtn, this._jumpBtn, this._crouchBtn, this._proneBtn,
      this._reloadBtn, this._grenadeBtn, this._sprintBtn, this._pauseBtn,
      ...this._wslots,
    )
  }

  _div(cls) {
    const d = document.createElement('div')
    d.className = cls
    return d
  }
  _btn(cls, label) {
    const b = document.createElement('div')
    b.className = 'tc-btn ' + cls
    b.textContent = label
    return b
  }

  /* ------------------------------------------------------------------ */
  /*  Event binding                                                      */
  /* ------------------------------------------------------------------ */
  _bind() {
    const o = { passive: false }
    this.el.addEventListener('touchstart', this._onStart.bind(this), o)
    this.el.addEventListener('touchmove', this._onMove.bind(this), o)
    this.el.addEventListener('touchend', this._onEnd.bind(this), o)
    this.el.addEventListener('touchcancel', this._onEnd.bind(this), o)
  }

  /* ------------------------------------------------------------------ */
  /*  Touch handlers                                                     */
  /* ------------------------------------------------------------------ */
  _onStart(e) {
    if (!this._inputEnabled) return
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      const x = t.clientX
      const y = t.clientY

      /* Button hit-test first */
      const hit = this._hitButton(x, y)
      if (hit) {
        this._touches.set(t.identifier, { role: 'btn', el: hit })
        this._activateBtn(hit, true)
        continue
      }

      /* Left 45 % of viewport → dynamic joystick.
         The base is normally parked bottom-left (visible). On grab it
         teleports to the finger; on release it snaps back home. */
      if (x / window.innerWidth < 0.45) {
        this._joyCenter = { x, y }
        this._joyBase.style.left = x + 'px'
        this._joyBase.style.top = y + 'px'
        this._joyActive = true
        this._touches.set(t.identifier, { role: 'joy' })
      } else {
        /* Right zone → camera look */
        this._touches.set(t.identifier, { role: 'look', lx: x, ly: y })
      }
    }
  }

  _onMove(e) {
    if (!this._inputEnabled) return
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      const info = this._touches.get(t.identifier)
      if (!info) continue

      if (info.role === 'joy') {
        const dx = t.clientX - this._joyCenter.x
        const dy = t.clientY - this._joyCenter.y
        const dist = Math.hypot(dx, dy)
        const clamped = Math.min(dist, JOY_MAX_RADIUS)
        const a = Math.atan2(dy, dx)
        const tx = Math.cos(a) * clamped
        const ty = Math.sin(a) * clamped
        this._joyThumb.style.transform = `translate(${tx}px,${ty}px)`
        const nx = (clamped / JOY_MAX_RADIUS) * Math.cos(a)
        const ny = (clamped / JOY_MAX_RADIUS) * Math.sin(a)
        this.cb.onMove(
          ny < -JOY_DEADZONE,
          ny > JOY_DEADZONE,
          nx < -JOY_DEADZONE,
          nx > JOY_DEADZONE,
          false,
        )
      } else if (info.role === 'look') {
        const dx = t.clientX - info.lx
        const dy = t.clientY - info.ly
        info.lx = t.clientX
        info.ly = t.clientY
        this.cb.onLook(dx, dy)
      }
    }
  }

  _onEnd(e) {
    for (const t of Array.from(e.changedTouches)) {
      const info = this._touches.get(t.identifier)
      if (!info) continue

      if (info.role === 'joy') {
        this._joyBase.style.left = ''
        this._joyBase.style.top = ''
        this._joyThumb.style.transform = ''
        this._joyActive = false
        this.cb.onMove(false, false, false, false, false)
      } else if (info.role === 'btn') {
        this._activateBtn(info.el, false)
      }
      this._touches.delete(t.identifier)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Button hit-test + activation                                       */
  /* ------------------------------------------------------------------ */
  _hitButton(x, y) {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    return el.closest?.('.tc-btn') || null
  }

  _activateBtn(btn, on) {
    btn.classList.toggle('active', on)

    /* Hold buttons: press / release map directly */
    if (btn.classList.contains('tc-fire-left') || btn.classList.contains('tc-fire-right')) {
      this.cb.onFire(on)
      return
    }
    if (btn.classList.contains('tc-ads')) { this.cb.onADS(on); return }
    if (btn.classList.contains('tc-sprint')) { this.cb.onSprint(on); return }

    /* Tap buttons: fire the action on release */
    if (on) return
    if (btn.classList.contains('tc-jump')) this.cb.onJump()
    else if (btn.classList.contains('tc-crouch')) this.cb.onCrouch()
    else if (btn.classList.contains('tc-prone')) this.cb.onProne()
    else if (btn.classList.contains('tc-reload')) this.cb.onReload()
    else if (btn.classList.contains('tc-grenade')) this.cb.onGrenade()
    else if (btn.classList.contains('tc-pause')) this.cb.onPause()
    else if (btn.classList.contains('tc-wslot')) {
      this.cb.onWeapon(parseInt(btn.dataset.slot, 10))
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */
  show() { this.el.style.display = 'block' }
  hide() { this.el.style.display = 'none' }

  /**
   * Registry of every draggable touch control — used by the HUD editor.
   * @returns {Array<{id:string, el:HTMLElement, label:string}>}
   */
  getControls() {
    return [
      { id: 'joy-base',  el: this._joyBase,  label: 'Joystick' },
      { id: 'fire-left', el: this._leftFire, label: 'Left Fire' },
      { id: 'fire-right', el: this._rightFire, label: 'Right Fire' },
      { id: 'ads',       el: this._adsBtn,   label: 'ADS' },
      { id: 'jump',      el: this._jumpBtn,  label: 'Jump' },
      { id: 'crouch',    el: this._crouchBtn, label: 'Crouch' },
      { id: 'prone',     el: this._proneBtn, label: 'Prone' },
      { id: 'reload',    el: this._reloadBtn, label: 'Reload' },
      { id: 'grenade',   el: this._grenadeBtn, label: 'Grenade' },
      { id: 'sprint',    el: this._sprintBtn, label: 'Sprint' },
      { id: 'pause',     el: this._pauseBtn, label: 'Pause' },
      ...this._wslots.map((s, i) => ({ id: 'wslot-' + i, el: s, label: 'Weapon ' + (i + 1) })),
    ]
  }

  setInputEnabled(on) {
    this._inputEnabled = !!on
    if (!on) this._releaseAll()
  }

  _releaseAll() {
    for (const [, info] of this._touches) {
      if (info.role === 'btn') this._activateBtn(info.el, false)
    }
    this._touches.clear()
    this._joyBase.style.left = ''
    this._joyBase.style.top = ''
    this._joyThumb.style.transform = ''
    if (this._joyActive) this.cb.onMove(false, false, false, false, false)
    this._joyActive = false
  }

  /**
   * Moves the touch controls into a body-level "edit preview" layer so the
   * HUD editor can drag them, while gameplay input is disabled.
   */
  enterEditMode() {
    if (this._editPreviewEl) return
    this.setInputEnabled(false)
    this.hide()
    this._editPreviewEl = document.createElement('div')
    this._editPreviewEl.id = 'hud-edit-touch-preview'
    this._editPreviewEl.style.cssText =
      'position:fixed;inset:0;z-index:250;pointer-events:none;'
    document.body.appendChild(this._editPreviewEl)
    for (const child of [...this.el.children]) this._editPreviewEl.appendChild(child)
  }

  exitEditMode() {
    if (!this._editPreviewEl) return
    for (const child of [...this._editPreviewEl.children]) this.el.appendChild(child)
    this._editPreviewEl.remove()
    this._editPreviewEl = null
    this.setInputEnabled(true)
    this.show()
  }

  dispose() {
    this.el.innerHTML = ''
    this._touches.clear()
    if (this._editPreviewEl) this._editPreviewEl.remove()
  }
}
