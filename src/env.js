import * as THREE from 'three'

// Environment manager: a full day/night cycle layered with a weather cycle
// (clear -> overcast -> rain storms with lightning). The *day* look is anchored
// to each map's authored sky / fog / sun so custom maps keep their identity,
// while sunset / night / dawn palettes are derived from it.

const NIGHT_SKY = 0x0a1224
const NIGHT_FOG = 0x0d1830
const OVERCAST_SKY = 0x7c8ea6
const OVERCAST_FOG = 0x93a4ba
const RAIN_TINT = 0x8fa6c6

const D2R = Math.PI / 180

export class Environment {
  /**
   * @param {THREE.Scene} scene
   * @param {Object}      opts
   * @param {THREE.DirectionalLight} opts.sun
   * @param {THREE.AmbientLight}      opts.ambient
   * @param {THREE.HemisphereLight}   opts.hemi
   * @param {THREE.PerspectiveCamera} opts.camera
   * @param {Object} base — numeric color/intensity anchors from the map
   */
  constructor(scene, opts) {
    this.scene = scene
    this.sun = opts.sun
    this.ambient = opts.ambient
    this.hemi = opts.hemi
    this.camera = opts.camera
    this.base = opts.base || {}

    this.cycleDur = 300          // seconds for a full day/night cycle
    this.weatherDur = 170        // seconds for a full weather cycle
    this.time = Math.random()    // random starting time of day so every match differs
    this.weatherX = Math.random()

    this.overcast = 0
    this.rainA = 0
    this.lightning = 0

    this.sunDir = new THREE.Vector3(0.5, 0.9, 0.3)

    this._kf = this._buildKeyframes()
    this._c = new THREE.Color()
    this._d = new THREE.Color()
    this._setSky = new THREE.Color()
    this._setFog = new THREE.Color()

    this._buildRain()
  }

  /* ------------------------------------------------------------------ */
  /*  Palette keyframes (day anchored to the map's authored look)        */
  /* ------------------------------------------------------------------ */
  _anchors() {
    const sky = new THREE.Color(this.base.skyH != null ? this.base.skyH : 0x9fc3ec)
    const fog = new THREE.Color(this.base.fogH != null ? this.base.fogH : 0xbcd4ec)
    const sun = new THREE.Color(this.base.sunH != null ? this.base.sunH : 0xffe7b8)
    const sunI = this.base.sunI != null ? this.base.sunI : 1.15
    const ambI = this.base.ambI != null ? this.base.ambI : 0.72
    const warm = new THREE.Color(0xffb06a)
    const orange = new THREE.Color(0xff8f3f)
    const moon = new THREE.Color(0x94a9d1)
    const night = new THREE.Color(NIGHT_SKY)
    const nightFog = new THREE.Color(NIGHT_FOG)
    const dawn = new THREE.Color(0x8fa3cc)
    return { sky, fog, sun, sunI, ambI, warm, orange, moon, night, nightFog, dawn }
  }

  _buildKeyframes() {
    const a = this._anchors()
    const stops = [
      { t: 0.00, sky: a.sky.clone().lerp(a.night, 0.45).lerp(a.orange, 0.18), fog: a.fog.clone().lerp(a.nightFog, 0.55), sun: a.warm, sunI: a.sunI * 0.6, ambI: a.ambI * 0.5, hemiI: 0.24, el: 10, az: 100 },
      { t: 0.18, sky: a.sky, fog: a.fog, sun: a.sun, sunI: a.sunI, ambI: a.ambI, hemiI: 0.4, el: 55, az: 130 },
      { t: 0.38, sky: a.sky.clone().lerp(new THREE.Color(0xffffff), 0.07), fog: a.fog, sun: a.sun, sunI: a.sunI * 0.95, ambI: a.ambI * 0.95, hemiI: 0.42, el: 46, az: 205 },
      { t: 0.47, sky: a.sky.clone().lerp(a.orange, 0.55), fog: a.fog.clone().lerp(new THREE.Color(0xe0a37c), 0.5), sun: a.warm, sunI: a.sunI * 0.5, ambI: a.ambI * 0.45, hemiI: 0.2, el: 10, az: 275 },
      { t: 0.52, sky: a.night, fog: a.nightFog, sun: a.moon, sunI: 0.5, ambI: 0.3, hemiI: 0.14, el: 4, az: 300 },
      { t: 0.82, sky: a.night, fog: a.nightFog, sun: a.moon, sunI: 0.5, ambI: 0.3, hemiI: 0.14, el: 4, az: 330 },
      { t: 0.90, sky: a.dawn, fog: a.dawn, sun: a.warm, sunI: a.sunI * 0.55, ambI: a.ambI * 0.5, hemiI: 0.24, el: 18, az: 40 },
    ]
    stops.push({ t: 1.0, ...stops[0] })
    return stops
  }

  // Sample a keyframe stop value at time t (0..1), lerping hue colors.
  _at(t, key) {
    const kf = this._kf
    let i = 0
    while (i < kf.length - 2 && kf[i + 1].t <= t) i++
    const a = kf[i], b = kf[i + 1]
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)))
    if (typeof a[key] === 'number') return a[key] + (b[key] - a[key]) * f
    return this._c.lerpColors(a[key], b[key], f).clone()
  }

  /* ------------------------------------------------------------------ */
  /*  Weather cycle: clear -> overcast -> storm -> overcast -> clear    */
  /*  x in [0,1), outputs target { overcast, rain }                      */
  /* ------------------------------------------------------------------ */
  _weatherTarget(x) {
    const seg = (a, b) => Math.max(0, Math.min(1, (x - a) / (b - a || 1)))
    const over = x < 0.38 ? 0 : x < 0.5 ? seg(0.38, 0.5) : x < 0.82 ? 1 : x < 0.94 ? 1 - seg(0.82, 0.94) : 0
    const rain = x < 0.6 ? 0 : x < 0.66 ? seg(0.6, 0.66) : x < 0.86 ? 1 : x < 0.92 ? 1 - seg(0.86, 0.92) : 0
    return { over, rain }
  }

  /* ------------------------------------------------------------------ */
  /*  Rain particle field                                                */
  /* ------------------------------------------------------------------ */
  _buildRain() {
    const N = 1300
    this._rainN = N
    this._rainPos = new Float32Array(N * 3)
    this._rainGeo = new THREE.BufferGeometry()
    this._rainGeo.setAttribute('position', new THREE.BufferAttribute(this._rainPos, 3))
    this._rainMat = new THREE.PointsMaterial({
      color: 0xbcd2ef, size: 0.08, transparent: true, opacity: 0,
      depthWrite: false,
    })
    this._rainPts = new THREE.Points(this._rainGeo, this._rainMat)
    this._rainPts.frustumCulled = false
    this._rainPts.visible = false
    this.scene.add(this._rainPts)
    const cam = this.camera.position
    for (let i = 0; i < N; i++) {
      const ix = i * 3
      this._rainPos[ix] = cam.x + (Math.random() - 0.5) * 120
      this._rainPos[ix + 1] = cam.y + Math.random() * 70 - 5
      this._rainPos[ix + 2] = cam.z + (Math.random() - 0.5) * 120
    }
  }

  _updateRain(dt) {
    const cam = this.camera.position
    const p = this._rainPos
    const half = 60
    const top = 55
    for (let i = 0; i < this._rainN; i++) {
      const ix = i * 3
      p[ix + 1] -= 34 * dt
      if (p[ix + 1] < cam.y - 6) {
        p[ix + 1] = cam.y + top
        p[ix] = cam.x + (Math.random() - 0.5) * half * 2
        p[ix + 2] = cam.z + (Math.random() - 0.5) * half * 2
      }
    }
    this._rainGeo.attributes.position.needsUpdate = true
  }

  /* ------------------------------------------------------------------ */
  /*  Per-frame update                                                   */
  /* ------------------------------------------------------------------ */
  update(dt) {
    this.time = (this.time + dt / this.cycleDur) % 1
    this.weatherX = (this.weatherX + dt / this.weatherDur) % 1

    const t = this._weatherTarget(this.weatherX)
    this.overcast += (t.over - this.overcast) * Math.min(1, dt * 0.4)
    this.rainA += (t.rain - this.rainA) * Math.min(1, dt * 0.5)

    // smooth day/night values
    const skyC = this._at(this.time, 'sky')
    const fogC = this._at(this.time, 'fog')
    const sunC = this._at(this.time, 'sun')
    const sunI = this._at(this.time, 'sunI')
    const ambI = this._at(this.time, 'ambI')
    const hemiI = this._at(this.time, 'hemiI')
    const el = this._at(this.time, 'el')
    const az = this._at(this.time, 'az')

    // weather overlay: overcast greys the sky and lengthens fog
    const n = this.overcast
    this._setSky.copy(skyC).lerp(new THREE.Color(OVERCAST_SKY), n * 0.6)
    this._setFog.copy(fogC).lerp(new THREE.Color(OVERCAST_FOG), n)
    if (this.rainA > 0) this._setSky.lerp(new THREE.Color(RAIN_TINT), this.rainA * 0.35)

    // lightning flash: briefly brightens the whole scene
    this.lightning = Math.max(0, this.lightning - dt * 3.5)
    if (this.rainA > 0.65 && Math.random() < dt * 0.45) this.lightning = 1
    const flash = this.lightning

    this.scene.background = this._setSky
    if (this.scene.fog) {
      const fogMult = 1 + n * 0.35 + this.rainA * 0.5
      this.scene.fog.near = this.base.fogNear != null ? this.base.fogNear : 80
      this.scene.fog.far = Math.min(1.15 * (this.base.fogFar || 260), (this.base.fogFar || 260) * fogMult)
      this.scene.fog.color = this._setFog
    }

    if (this.hemi) this.hemi.intensity = hemiI * (1 - n * 0.45) + flash * 0.35
    if (this.ambient) this.ambient.intensity = Math.max(0.12, (ambI * (1 - n * 0.3) * (0.35 + 0.65 * sunI)) + flash * 0.4)

    // sun/moon position from elevation + azimuth
    const elR = el * D2R, azR = az * D2R
    this.sunDir.set(
      Math.cos(elR) * Math.sin(azR),
      Math.sin(elR),
      Math.cos(elR) * Math.cos(azR),
    ).normalize()

    if (this.sun) {
      this.sun.color.copy(sunC)
      this.sun.intensity = sunI * (1 - n * 0.5) + flash * 0.6
    }

    // rain
    const rainVis = this.rainA > 0.02
    this._rainPts.visible = rainVis
    if (rainVis) {
      this._rainMat.opacity = Math.min(1, 0.85 * this.rainA)
      this._updateRain(dt)
    }
  }

  dispose() {
    if (this.scene && this._rainPts) this.scene.remove(this._rainPts)
    if (this._rainGeo) this._rainGeo.dispose()
    if (this._rainMat) this._rainMat.dispose()
  }
}