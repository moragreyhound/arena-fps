// Sound system. Loads real Counter-Strike: Source audio clips (from
// /sounds/cs) into WebAudio buffers when available and falls back to
// synthesized effects otherwise.

const CLIPS = {
  pistol: ['sounds/cs/weapons/deagle/deagle-1.wav'],
  ak: ['sounds/cs/weapons/ak47/ak47-1.wav'],
  smg: ['sounds/cs/weapons/mp5navy/mp5-1.wav'],
  shotgun: ['sounds/cs/weapons/m3/m3-1.wav'],
  awp: ['sounds/cs/weapons/awp/awp1.wav'],
  lmg: ['sounds/cs/weapons/m249/m249-1.wav'],
  knife: ['sounds/cs/weapons/knife/knife_stab.wav', 'sounds/cs/weapons/knife/knife_slash1.wav'],
  reload_ak: ['sounds/cs/weapons/ak47/ak47_clipin.wav', 'sounds/cs/weapons/ak47/ak47_clipout.wav', 'sounds/cs/weapons/ak47/ak47_boltpull.wav'],
  reload_awp: ['sounds/cs/weapons/awp/awp_clipin.wav', 'sounds/cs/weapons/awp/awp_clipout.wav'],
  reload_pistol: ['sounds/cs/weapons/deagle/de_clipin.wav', 'sounds/cs/weapons/deagle/de_clipout.wav'],
  reload_smg: ['sounds/cs/weapons/mp5navy/mp5_clipin.wav', 'sounds/cs/weapons/mp5navy/mp5_clipout.wav'],
  reload_shotgun: ['sounds/cs/weapons/m3/m3_insertshell.wav'],
  reload_lmg: ['sounds/cs/weapons/m249/m249_boxin.wav', 'sounds/cs/weapons/m249/m249_chain.wav'],
  zoom: ['sounds/cs/weapons/zoom.wav'],
  hitbody: ['sounds/cs/player/bhit_helmet-1.wav'],
  headshot: ['sounds/cs/player/headshot1.wav'],
  death: ['sounds/cs/player/death1.wav'],
  step: ['sounds/cs/player/footsteps/grass1.wav', 'sounds/cs/player/footsteps/sand1.wav', 'sounds/cs/player/footsteps/concrete1.wav'],
  ui: ['sounds/cs/ui/buttonclick.wav'],
  uiHover: ['sounds/cs/ui/buttonrollover.wav'],
}

export class SoundFX {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
    this._noise = null
    this._last = {}
    this.buffers = {}
    this.realLoaded = false
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.ctx.destination)
    this.loadReal()
  }

  // Load and decode the bundled Counter-Strike clips (non-blocking, best effort).
  async loadReal() {
    if (!this.ctx || this.realLoaded) return
    const jobs = []
    for (const [name, urls] of Object.entries(CLIPS)) {
      jobs.push((async () => {
        const bufs = []
        for (const u of urls) {
          try {
            const res = await fetch(u)
            if (!res.ok) continue
            const ab = await res.arrayBuffer()
            const buf = await this.ctx.decodeAudioData(ab)
            if (buf) bufs.push(buf)
          } catch { /* clip unavailable */ }
        }
        if (bufs.length) this.buffers[name] = bufs
      })())
    }
    try {
      await Promise.all(jobs)
      this.realLoaded = true
    } catch { /* ignore */ }
  }

  setEnabled(b) {
    this.enabled = !!b
    if (this.master) this.master.gain.value = b ? 0.55 : 0
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v)) * 0.55
  }

  // Play a decoded clip. Returns true when a real clip played.
  _play(name, opts = {}) {
    if (!this.ctx) return false
    const { gain = 0.55, rate = 1, delay = 0, throttle = 0, detune = 30 } = opts
    const now = performance.now()
    if (throttle > 0) {
      if ((this._last[name] || 0) > now - throttle) return true
      this._last[name] = now
    }
    const pool = this.buffers[name]
    if (!pool || pool.length === 0) return false
    const buf = pool[Math.floor(Math.random() * pool.length)]
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * (detune / 100))
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.master)
    src.start(this.ctx.currentTime + delay)
    return true
  }

  // ---- weapon shots ----
  gun(name) {
    if (!this.ctx) return
    const opts = {
      pistol: { gain: 0.5, rate: 1, throttle: 28, detune: 12 },
      ak: { gain: 0.62, rate: 1, throttle: 26, detune: 22 },
      smg: { gain: 0.5, rate: 1, throttle: 30, detune: 20 },
      shotgun: { gain: 0.75, rate: 1, throttle: 40, detune: 30 },
      awp: { gain: 0.8, rate: 1, throttle: 60, detune: 5 },
      lmg: { gain: 0.6, rate: 1, throttle: 28, detune: 18 },
      knife: { gain: 0.45, rate: 1, throttle: 30, detune: 25 },
    }[name] || { gain: 0.55, rate: 1, throttle: 30 }
    const played = this._play(name, opts)
    if (!played) this._synthGun(name)
  }

  reload(name = 'ak') {
    if (!this.ctx) return
    if (this._play(`reload_${name}`, { gain: 0.5, throttle: 0 })) return
    this._noiseBurst({ dur: 0.03, peak: 0.2, filterFreq: 3000, type: 'highpass' })
    this._tone({ type: 'square', freq: 900, freqEnd: 400, dur: 0.05, peak: 0.2, delay: 0.15 })
    this._tone({ type: 'square', freq: 1000, freqEnd: 500, dur: 0.04, peak: 0.18, delay: 0.32 })
  }

  empty() {
    if (!this.ctx) return
    if (this._play('dry', { gain: 0.4 })) return
    this._tone({ type: 'square', freq: 1400, freqEnd: 900, dur: 0.03, peak: 0.15 })
  }

  zoom(stage = 0) {
    if (!this.ctx) return
    this._play('zoom', { gain: 0.5, rate: stage === 0 ? 1 : 1.25, throttle: 40 })
  }

  hit(headshot = false) {
    if (!this.ctx) return
    if (this._play(headshot ? 'headshot' : 'hitbody', { gain: 0.6, throttle: 25 })) return
    const f = headshot ? 1800 : 1200
    this._tone({ type: 'square', freq: f, dur: 0.05, peak: 0.25 })
    this._tone({ type: 'square', freq: f * 1.4, dur: 0.05, peak: 0.2, delay: 0.05 })
  }

  kill() {
    if (!this.ctx) return
    this._play('hitbody', { gain: 0.45, throttle: 0 })
    this._tone({ type: 'sawtooth', freq: 900, freqEnd: 300, dur: 0.25, peak: 0.2 })
  }

  death() {
    if (!this.ctx) return
    if (this._play('death', { gain: 0.85, throttle: 0 })) return
    this._tone({ type: 'sine', freq: 300, freqEnd: 70, dur: 0.5, peak: 0.4 })
    this._noiseBurst({ dur: 0.3, peak: 0.2, filterFreq: 600, freqEnd: 150 })
  }

  footstep() {
    if (!this.ctx) return
    if (this._play('step', { gain: 0.32, rate: 0.9 + Math.random() * 0.25, throttle: 0 })) return
    this._noiseBurst({ dur: 0.06, peak: 0.18, filterFreq: 500, freqEnd: 200 })
    this._tone({ type: 'sine', freq: 120, freqEnd: 60, dur: 0.05, peak: 0.12 })
  }

  jump() {
    if (!this.ctx) return
    this._noiseBurst({ dur: 0.12, peak: 0.12, filterFreq: 800, type: 'bandpass' })
  }

  land() {
    if (!this.ctx) return
    this._noiseBurst({ dur: 0.1, peak: 0.2, filterFreq: 350, freqEnd: 120 })
  }

  uiClick() {
    if (!this.ctx) return
    this._play('ui', { gain: 0.5, throttle: 0 })
    if (!this.buffers.ui) this._tone({ type: 'square', freq: 1000, freqEnd: 700, dur: 0.03, peak: 0.12 })
  }

  uiHover() {
    if (!this.ctx) return
    this._play('uiHover', { gain: 0.3, throttle: 80, detune: 0 })
  }

  // ---- procedural fallback gun ----
  _synthGun(name) {
    switch (name) {
      case 'pistol':
        this._noiseBurst({ dur: 0.12, peak: 0.55, filterFreq: 2600, type: 'bandpass', freqEnd: 500 })
        this._tone({ type: 'square', freq: 140, freqEnd: 55, dur: 0.1, peak: 0.4 })
        break
      case 'ak':
        this._noiseBurst({ dur: 0.16, peak: 0.65, filterFreq: 1500, freqEnd: 300 })
        this._tone({ type: 'sawtooth', freq: 120, freqEnd: 50, dur: 0.14, peak: 0.45 })
        this._noiseBurst({ dur: 0.06, peak: 0.3, filterFreq: 4200, type: 'highpass', freqEnd: 900 })
        break
      case 'smg':
        this._noiseBurst({ dur: 0.1, peak: 0.5, filterFreq: 2200, freqEnd: 600 })
        this._tone({ type: 'square', freq: 160, freqEnd: 80, dur: 0.08, peak: 0.3 })
        break
      case 'shotgun':
        this._noiseBurst({ dur: 0.28, peak: 0.9, filterFreq: 900, freqEnd: 150 })
        this._tone({ type: 'sawtooth', freq: 90, freqEnd: 38, dur: 0.25, peak: 0.6 })
        this._noiseBurst({ dur: 0.1, peak: 0.3, filterFreq: 3800, type: 'highpass', freqEnd: 800 })
        break
      case 'awp':
        this._noiseBurst({ dur: 0.4, peak: 0.9, filterFreq: 700, freqEnd: 90 })
        this._tone({ type: 'sine', freq: 70, freqEnd: 30, dur: 0.4, peak: 0.7 })
        this._noiseBurst({ dur: 0.15, peak: 0.35, filterFreq: 3000, type: 'highpass', freqEnd: 700 })
        break
      case 'lmg':
        this._noiseBurst({ dur: 0.16, peak: 0.6, filterFreq: 1300, freqEnd: 300 })
        this._tone({ type: 'square', freq: 110, freqEnd: 45, dur: 0.14, peak: 0.4 })
        break
      case 'knife':
        this._noiseBurst({ dur: 0.08, peak: 0.25, filterFreq: 4000, type: 'highpass', freqEnd: 1200 })
        this._tone({ type: 'square', freq: 700, freqEnd: 200, dur: 0.06, peak: 0.15 })
        break
      default:
        this._noiseBurst({ dur: 0.14, peak: 0.5, filterFreq: 2000, freqEnd: 500 })
    }
  }

  _buffer() {
    if (this._noise) return this._noise
    const len = this.ctx.sampleRate * 1
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this._noise = buf
    return buf
  }

  _env(t, peak, attack, end, dur) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), t + dur)
    return g
  }

  _noiseBurst({ dur = 0.15, peak = 0.5, attack = 0.002, filterFreq = 1800, filterQ = 1, type = 'lowpass', freqEnd = null, decay = 0 }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this._buffer()
    src.loop = true
    const filt = this.ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.setValueAtTime(filterFreq, t)
    if (freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur)
    filt.Q.value = filterQ
    const g = decay > 0
      ? this._env(t, peak, attack, 0.0001, dur)
      : this.ctx.createGain()
    if (decay === 0) {
      g.gain.setValueAtTime(peak, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    }
    src.connect(filt).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  _tone({ type = 'sine', freq = 200, freqEnd = null, dur = 0.2, peak = 0.4, attack = 0.002, delay = 0 }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur)
    const g = this._env(t, peak, attack, 0.0001, dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
}