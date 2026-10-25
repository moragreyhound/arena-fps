import * as THREE from 'three'

const ZONE_MULT = {
  pistol:  { head: 4.2, torso: 1.1, arm: 0.7, leg: 0.7 },
  ak:      { head: 3.6, torso: 1.2, arm: 0.85, leg: 0.85 },
  smg:     { head: 3.4, torso: 1.05, arm: 0.75, leg: 0.75 },
  shotgun: { head: 4.0, torso: 1.15, arm: 0.9, leg: 0.9 },
  awp:     { head: 4.5, torso: 1.4, arm: 1.0, leg: 1.0 },
  lmg:     { head: 3.2, torso: 1.1, arm: 0.8, leg: 0.8 },
  knife:   { head: 2.0, torso: 1.0, arm: 1.0, leg: 1.0 },
}

export const ADS_FOV = {
  pistol: 55,
  ak: 50,
  smg: 55,
  shotgun: 52,
  awp: 18,
  lmg: 52,
  knife: null,
}

export const WEAPON_DEFS = {
  pistol:  { id: 'pistol', name: 'Pistol', damage: 26, fireRate: 300, range: 130, auto: false, melee: false, magSize: 12, reloadTime: 1100, spread: 0.011, moveSpread: 0.02, pellets: 1, tracerColor: 0xffe08a, tracerGlow: 2.2, recoil: 0.55, sound: 'pistol', scoped: false, falloff: { min: 18, max: 26, start: 20, end: 75 } },
  ak:      { id: 'ak', name: 'AK-47', damage: 30, fireRate: 110, range: 180, auto: true, melee: false, magSize: 30, reloadTime: 2000, spread: 0.014, moveSpread: 0.032, pellets: 1, tracerColor: 0xffcf6b, tracerGlow: 2.6, recoil: 0.95, sound: 'ak', scoped: false, falloff: { min: 24, max: 30, start: 30, end: 110 } },
  smg:     { id: 'smg', name: 'MP5', damage: 18, fireRate: 92, range: 120, auto: true, melee: false, magSize: 35, reloadTime: 1700, spread: 0.02, moveSpread: 0.045, pellets: 1, tracerColor: 0xffd9a0, tracerGlow: 2, recoil: 0.5, sound: 'smg', scoped: false, falloff: { min: 11, max: 18, start: 15, end: 70 } },
  shotgun: { id: 'shotgun', name: 'Shotgun', damage: 9, fireRate: 850, range: 55, auto: false, melee: false, magSize: 8, reloadTime: 2300, spread: 0.06, moveSpread: 0.09, pellets: 8, tracerColor: 0xffb060, tracerGlow: 1.6, recoil: 1.15, sound: 'shotgun', scoped: false, falloff: { min: 3, max: 9, start: 8, end: 38 } },
  awp:     { id: 'awp', name: 'AWP', damage: 115, fireRate: 1300, range: 220, auto: false, melee: false, magSize: 5, reloadTime: 3000, spread: 0.002, moveSpread: 0.02, pellets: 1, tracerColor: 0xcfe8ff, tracerGlow: 4, recoil: 1.8, sound: 'awp', scoped: true, falloff: null },
  lmg:     { id: 'lmg', name: 'M249', damage: 26, fireRate: 104, range: 170, auto: true, melee: false, magSize: 100, reloadTime: 3500, spread: 0.032, moveSpread: 0.06, pellets: 1, tracerColor: 0xffcf6b, tracerGlow: 2.4, recoil: 0.85, sound: 'lmg', scoped: false, falloff: { min: 20, max: 26, start: 35, end: 120 } },
  knife:   { id: 'knife', name: 'Knife', damage: 75, fireRate: 380, range: 2.6, auto: false, melee: true, magSize: Infinity, reloadTime: 0, spread: 0, moveSpread: 0, pellets: 1, tracerColor: 0xffffff, tracerGlow: 0, recoil: 0.15, sound: 'knife', scoped: false, falloff: null },
}

export const SLOT_ORDER = ['pistol', 'ak', 'smg', 'shotgun', 'awp', 'lmg', 'knife']

// ---------------------------------------------------------------------------
// Procedural weapon models (original geometry, CS-style silhouettes).
// Each builder returns { group, muzzleZ } — the muzzle ends up facing -Z.
// Geometry + materials are cached per unique size/color so the same parts are
// shared between the first-person viewmodels and every third-person rig.
// ---------------------------------------------------------------------------
const matCache = new Map()
function WMAT(hex, rough = 0.5, metal = 0.35) {
  const key = `${hex}|${rough}|${metal}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })
    matCache.set(key, m)
  }
  return m
}
const geoCache = new Map()
function cacheGeo(key, make) {
  let g = geoCache.get(key)
  if (!g) { g = make(); geoCache.set(key, g) }
  return g
}
function wbox(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const geo = cacheGeo(`b:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d))
  const m = new THREE.Mesh(geo, WMAT(color))
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}
function wcyl(r, h, x, y, z, color, axis = 'z', seg = 8) {
  const geo = cacheGeo(`c:${r},${h},${seg}`, () => new THREE.CylinderGeometry(r, r * 0.97, h, seg))
  const m = new THREE.Mesh(geo, WMAT(color, 0.45, 0.5))
  m.position.set(x, y, z)
  if (axis === 'z') m.rotation.x = Math.PI / 2
  else if (axis === 'x') m.rotation.z = Math.PI / 2
  return m
}
function wsph(r, x, y, z, color, seg = 10) {
  const geo = cacheGeo(`s:${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.floor(seg * 0.8)))
  const m = new THREE.Mesh(geo, WMAT(color, 0.45, 0.4))
  m.position.set(x, y, z)
  return m
}
function wtorus(R, tube, x, y, z, color) {
  const geo = cacheGeo(`t:${R},${tube}`, () => new THREE.TorusGeometry(R, tube, 8, 14))
  const m = new THREE.Mesh(geo, WMAT(color, 0.35, 0.6))
  m.position.set(x, y, z)
  return m
}

const COL = {
  steelDark: 0x33363c,   // receivers, slides
  steelMid: 0x44484f,    // dust covers, brakes
  steelLight: 0x565b63,  // barrels
  steelBright: 0x8b93a0, // polished slide
  polymer: 0x1f2226,     // grips, stocks, magazines
  polymerDark: 0x191b1f,
  wood: 0x6b4b34,        // AK / M3 wood
  woodDark: 0x4f3b26,
  pumpWood: 0x5f4a1e,    // shotgun pump forend
  tan: 0x8a7a55,         // MP5 / M249 furniture
  tanDark: 0x6f6046,
  olive: 0x5a5a3f,       // M249 cover
  oliveDark: 0x40402e,
  rifleGreen: 0x4a5b4d,  // AWP stock
  scopeDark: 0x20242a,
  lens: 0x16273a,
  blade: 0xc9ccd2,
}

function buildPistol() {
  const g = new THREE.Group()
  // Big .50-style pistol silhouette
  g.add(wbox(0.075, 0.095, 0.30, 0, 0.02, -0.04, COL.steelBright))          // slide
  g.add(wbox(0.05, 0.022, 0.26, 0, 0.076, -0.04, COL.steelDark))             // top rail
  g.add(wbox(0.04, 0.035, 0.05, 0, 0.075, 0.11, COL.steelDark))              // rear sight
  g.add(wbox(0.025, 0.035, 0.03, 0, 0.075, -0.16, COL.steelDark))            // front sight
  g.add(wbox(0.042, 0.042, 0.09, 0, -0.012, -0.155, COL.steelLight))         // barrel hood
  g.add(wbox(0.036, 0.038, 0.03, 0, -0.012, -0.20, COL.steelDark))           // muzzle
  g.add(wbox(0.07, 0.07, 0.16, 0, -0.02, 0.04, COL.steelMid))                // frame
  g.add(wbox(0.05, 0.032, 0.09, 0, -0.068, 0.005, COL.steelDark))            // trigger guard
  g.add(wbox(0.062, 0.13, 0.09, 0, -0.13, 0.075, COL.polymer))               // grip
  g.add(wbox(0.064, 0.11, 0.026, 0, -0.12, 0.035, COL.woodDark))             // grip panel
  g.add(wbox(0.035, 0.035, 0.03, 0, 0.035, 0.155, COL.steelDark))            // hammer spur
  g.add(wbox(0.045, 0.03, 0.05, 0, -0.195, 0.075, COL.steelMid))             // mag base
  return { group: g, muzzleZ: -0.215 }
}

function buildAK() {
  const g = new THREE.Group()
  g.add(wbox(0.085, 0.105, 0.30, 0, 0, -0.02, COL.steelDark))                // receiver
  g.add(wbox(0.075, 0.03, 0.26, 0, 0.066, -0.03, COL.steelMid))              // dust cover
  g.add(wbox(0.055, 0.05, 0.06, 0, 0.045, 0.10, COL.steelDark))              // rear sight block
  g.add(wbox(0.03, 0.055, 0.03, 0, 0.045, -0.26, COL.steelDark))             // front sight post
  g.add(wbox(0.035, 0.035, 0.22, 0, 0.062, -0.14, COL.steelDark))            // gas tube
  g.add(wbox(0.08, 0.095, 0.20, 0, -0.005, -0.16, COL.wood))                 // wood handguard
  g.add(wbox(0.075, 0.115, 0.24, 0, -0.012, 0.19, COL.woodDark))             // wood stock
  g.add(wbox(0.06, 0.042, 0.16, 0, 0.055, 0.19, COL.wood))                   // stock cheek
  g.add(wbox(0.05, 0.10, 0.07, 0, -0.125, 0.10, COL.wood, -0.35, 0, 0))      // pistol grip
  g.add(wbox(0.035, 0.028, 0.08, 0, -0.055, 0.075, COL.steelDark))           // trigger guard
  g.add(wbox(0.055, 0.09, 0.07, 0, -0.13, -0.04, COL.woodDark))              // mag (upper)
  g.add(wbox(0.05, 0.09, 0.065, 0, -0.195, -0.075, COL.woodDark))            // mag (curve)
  g.add(wbox(0.035, 0.02, 0.05, 0, -0.24, -0.09, COL.steelMid))              // mag floor plate
  g.add(wcyl(0.015, 0.18, 0, 0.006, -0.30, COL.steelLight, 'z', 8))          // barrel
  g.add(wcyl(0.024, 0.055, 0, 0.006, -0.375, COL.steelMid, 'z', 8))          // muzzle brake
  return { group: g, muzzleZ: -0.40 }
}

function buildSmg() {
  const g = new THREE.Group()
  g.add(wbox(0.075, 0.095, 0.30, 0, 0, 0.06, COL.steelDark))                 // receiver
  g.add(wbox(0.045, 0.025, 0.24, 0, 0.06, 0.06, COL.steelMid))               // top cover
  g.add(wcyl(0.012, 0.20, 0, 0.042, -0.02, COL.steelDark, 'z', 8))           // cocking tube
  g.add(wbox(0.04, 0.05, 0.05, 0, 0.05, 0.16, COL.steelDark))                // hooded rear sight
  g.add(wcyl(0.036, 0.20, 0, -0.005, -0.03, COL.tan, 'z', 12))               // handguard
  g.add(wcyl(0.028, 0.04, 0, -0.005, -0.12, COL.tanDark, 'z', 10))           // finger grooves
  g.add(wcyl(0.028, 0.04, 0, -0.005, -0.05, COL.tanDark, 'z', 10))
  g.add(wtorus(0.026, 0.007, 0, 0.045, -0.15, COL.steelDark))                // ring front sight
  g.add(wcyl(0.013, 0.30, 0, -0.005, -0.02, COL.steelLight, 'z', 8))         // barrel
  g.add(wcyl(0.017, 0.045, 0, -0.005, -0.175, COL.steelDark, 'z', 8))        // muzzle
  g.add(wbox(0.05, 0.07, 0.16, 0, 0, 0.24, COL.tan))                         // stock receiver
  g.add(wbox(0.05, 0.09, 0.06, 0, 0, 0.33, COL.polymer))                     // buttplate
  g.add(wbox(0.05, 0.085, 0.06, 0, -0.115, 0.10, COL.polymer, -0.3, 0, 0))   // grip
  g.add(wbox(0.03, 0.035, 0.08, 0, -0.05, 0.08, COL.steelDark))              // trigger guard
  g.add(wbox(0.04, 0.10, 0.055, 0.015, -0.13, 0.02, COL.polymerDark))        // magazine
  g.add(wbox(0.035, 0.09, 0.05, 0.015, -0.20, -0.02, COL.polymerDark))       // mag curve
  return { group: g, muzzleZ: -0.20 }
}

function buildShotgun() {
  const g = new THREE.Group()
  g.add(wbox(0.08, 0.115, 0.22, 0, 0.01, 0.14, COL.steelDark))               // receiver
  g.add(wcyl(0.013, 0.48, 0, 0.02, -0.10, COL.steelLight, 'z', 8))           // barrel
  g.add(wcyl(0.014, 0.44, 0, -0.015, -0.08, COL.steelDark, 'z', 8))          // magazine tube
  g.add(wcyl(0.032, 0.18, 0, -0.015, -0.08, COL.pumpWood, 'z', 10))          // pump forend
  g.add(wcyl(0.026, 0.03, 0, -0.015, -0.115, COL.tanDark, 'z', 10))          // pump grooves
  g.add(wcyl(0.026, 0.03, 0, -0.015, -0.045, COL.tanDark, 'z', 10))
  g.add(wbox(0.02, 0.032, 0.02, 0, 0.052, -0.33, COL.steelDark))             // bead sight
  g.add(wcyl(0.02, 0.05, 0, 0.02, -0.335, COL.steelDark, 'z', 8))            // muzzle
  g.add(wbox(0.065, 0.125, 0.26, 0, -0.015, 0.31, COL.wood))                 // stock
  g.add(wbox(0.05, 0.09, 0.06, 0, -0.12, 0.17, COL.wood, -0.3, 0, 0))        // grip
  g.add(wbox(0.03, 0.035, 0.08, 0, -0.05, 0.16, COL.steelDark))              // trigger guard
  return { group: g, muzzleZ: -0.36 }
}

function buildAwp() {
  const g = new THREE.Group()
  g.add(wcyl(0.014, 0.52, 0, 0.035, -0.24, COL.steelLight, 'z', 8))          // barrel
  g.add(wcyl(0.02, 0.06, 0, 0.035, -0.505, COL.steelDark, 'z', 8))           // muzzle brake
  g.add(wbox(0.075, 0.10, 0.30, 0, 0.03, 0.10, COL.scopeDark))               // receiver
  g.add(wbox(0.03, 0.03, 0.09, 0.05, 0.02, 0.14, COL.steelLight))            // bolt handle
  g.add(wbox(0.05, 0.025, 0.14, 0, 0.075, -0.02, COL.steelDark))             // scope mount
  g.add(wcyl(0.028, 0.26, 0, 0.095, -0.04, COL.scopeDark, 'z', 10))          // scope body
  g.add(wcyl(0.038, 0.07, 0, 0.095, -0.155, COL.scopeDark, 'z', 10))         // objective bell
  g.add(wcyl(0.033, 0.012, 0, 0.095, -0.19, COL.lens, 'z', 10))              // objective lens
  g.add(wcyl(0.03, 0.05, 0, 0.095, 0.095, COL.scopeDark, 'z', 10))           // eyepiece
  g.add(wbox(0.07, 0.12, 0.34, 0, -0.02, 0.33, COL.rifleGreen))              // stock
  g.add(wbox(0.05, 0.05, 0.20, 0, 0.045, 0.26, COL.rifleGreen))              // cheek riser
  g.add(wbox(0.05, 0.09, 0.06, 0, -0.13, 0.16, COL.rifleGreen, -0.35, 0, 0)) // grip
  g.add(wbox(0.03, 0.035, 0.10, 0, -0.06, 0.12, COL.scopeDark))              // trigger guard
  g.add(wbox(0.045, 0.08, 0.07, 0, -0.12, 0.03, COL.oliveDark))              // magazine
  return { group: g, muzzleZ: -0.535 }
}

function buildLmg() {
  const g = new THREE.Group()
  g.add(wbox(0.09, 0.105, 0.28, 0, 0.01, 0.07, COL.steelDark))               // receiver
  g.add(wbox(0.065, 0.03, 0.24, 0, 0.078, 0.05, COL.olive))                  // top cover
  g.add(wbox(0.04, 0.032, 0.12, 0, 0.10, 0.04, COL.olive))                   // carry handle
  g.add(wcyl(0.016, 0.40, 0, 0.005, -0.12, COL.steelLight, 'z', 8))          // heavy barrel
  g.add(wbox(0.03, 0.07, 0.05, 0, 0.035, -0.24, COL.steelDark))              // gas block
  g.add(wbox(0.02, 0.03, 0.02, 0, 0.06, -0.24, COL.steelDark))               // front sight post
  g.add(wbox(0.016, 0.016, 0.16, -0.03, 0.0, -0.30, COL.oliveDark, 0, 0, 0.16))  // bipod (folded)
  g.add(wbox(0.016, 0.016, 0.16, 0.03, 0.0, -0.30, COL.oliveDark, 0, 0, -0.16))
  g.add(wbox(0.035, 0.16, 0.14, -0.055, -0.125, -0.02, COL.tan))             // box magazine
  g.add(wbox(0.05, 0.02, 0.14, -0.055, -0.205, -0.02, COL.tanDark))          // mag floor
  g.add(wbox(0.06, 0.10, 0.18, 0, -0.005, 0.28, COL.tan))                    // stock
  g.add(wbox(0.06, 0.12, 0.05, 0, 0.005, 0.375, COL.tanDark))                // buttpad
  g.add(wbox(0.05, 0.11, 0.06, 0, -0.13, 0.11, COL.polymer, -0.35, 0, 0))    // grip
  g.add(wbox(0.03, 0.035, 0.09, 0, -0.06, 0.09, COL.steelDark))              // trigger guard
  return { group: g, muzzleZ: -0.32 }
}

function buildKnife() {
  const g = new THREE.Group()
  g.add(wbox(0.05, 0.014, 0.22, 0, 0, -0.11, COL.blade))                     // blade
  g.add(wbox(0.032, 0.012, 0.08, 0, 0.006, -0.25, COL.blade))                // blade tip
  g.add(wbox(0.05, 0.01, 0.05, 0, -0.008, -0.16, COL.steelDark))             // spine
  g.add(wbox(0.08, 0.03, 0.02, 0, 0, 0.005, COL.polymer))                    // guard
  g.add(wbox(0.045, 0.045, 0.10, 0, 0, 0.075, COL.polymer))                  // handle
  g.add(wbox(0.035, 0.04, 0.03, 0, 0, 0.13, COL.polymerDark))                // pommel
  return { group: g, muzzleZ: -0.28 }
}

const WEAPON_BUILDERS = {
  pistol: buildPistol,
  ak: buildAK,
  smg: buildSmg,
  shotgun: buildShotgun,
  awp: buildAwp,
  lmg: buildLmg,
  knife: buildKnife,
}

// Third-person weapon shown in remote players' hands (scaled down).
export function buildPlayerWeapon(wid) {
  const { group } = (WEAPON_BUILDERS[wid] || WEAPON_BUILDERS.pistol)()
  group.scale.setScalar(0.55)
  group.traverse(o => { if (o.isMesh) o.castShadow = true })
  return group
}

export class WeaponSystem {
  // opts: { effects, sfx, scene }
  constructor(camera, opts) {
    this.camera = camera
    this.scene = opts.scene
    this.effects = opts.effects
    this.sfx = opts.sfx
    this.raycaster = new THREE.Raycaster()
    this.lastFire = 0
    this.round = 0
    this.current = 'pistol'
    this.mag = 30 // picked up by a reset below
    this.ammo = {}
    for (const id of SLOT_ORDER) this.ammo[id] = WEAPON_DEFS[id].magSize
    this.reloading = false
    this.ads = false
    this.adsSmooth = 0
    this.viewModels = {}
    this._effects = {} // viewmodel animation state
    this._reloadT = 1   // reload animation progress (1 = not reloading)
    this._reloadDur = 1
    this._buildViewModels()
    this.setSlot('pistol')
  }

  setAds(on) { this.ads = !!on }

  _buildViewModels() {
    for (const id of SLOT_ORDER) {
      const { group, muzzleZ } = WEAPON_BUILDERS[id]()
      group.position.set(0.36, -0.26, -0.62)
      group.visible = false
      this.camera.add(group)

      const muzzle = new THREE.Object3D()
      // Just past the barrel tip so tracers start at the muzzle.
      muzzle.position.set(0, 0, muzzleZ - 0.06)
      group.add(muzzle)

      this.viewModels[id] = { group, muzzle }
      this._effects[id] = { recoil: 0, recoilYaw: 0, swayX: 0, swayY: 0, reloadSpin: 0 }
    }
  }

  setSlot(id) {
    if (!WEAPON_DEFS[id]) return
    this.current = id
    for (const k of SLOT_ORDER) this.viewModels[k].group.visible = (k === id)
    this.reloading = false
  }

  cycle(dir) {
    const idx = SLOT_ORDER.indexOf(this.current)
    const next = (idx + dir + SLOT_ORDER.length) % SLOT_ORDER.length
    this.setSlot(SLOT_ORDER[next])
  }

  def() { return WEAPON_DEFS[this.current] }

  canFire(now) {
    if (this.reloading) return false
    const d = this.def()
    if (this.ammo[this.current] <= 0 && d.magSize !== Infinity) return false
    return now - this.lastFire >= d.fireRate
  }

  reload(now, onDone) {
    const d = this.def()
    if (this.reloading || d.magSize === Infinity || this.ammo[this.current] === d.magSize) return
    this.reloading = true
    this._reloadDur = Math.max(0.2, d.reloadTime / 1000)
    this._reloadT = 0
    this._effects[this.current].reloadSpin = (Math.random() - 0.5) * 0.5
    this.sfx.reload()
    setTimeout(() => {
      this.ammo[this.current] = d.magSize
      this.reloading = false
      this._reloadT = 1
      if (onDone) onDone()
    }, d.reloadTime)
  }

  // Returns fired result (even on miss) so the caller can relay tracers.
  // targets: [{ id, player, hitboxes:[{mesh, zone}] }]
  // colliders: plain map meshes (non-thin).
  fire(now, targets, colliders, moving) {
    if (!this.canFire(now)) {
      if (this.ammo[this.current] <= 0 && this.def().magSize !== Infinity) this.sfx.empty()
      return null
    }
    const d = this.def()
    this.lastFire = now
    if (d.magSize !== Infinity) this.ammo[this.current] -= 1

    this._effects[this.current].recoil = d.recoil
    this._effects[this.current].recoilYaw = (Math.random() - 0.5) * d.recoil * 0.9
    this.sfx.gun(d.sound)

    const origin = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    const baseDir = new THREE.Vector3()
    this.camera.getWorldDirection(baseDir)

    // force fresh world matrices (remote players may not have rendered yet)
    this.scene.updateMatrixWorld()

    const hitMeshes = []
    for (const t of targets) for (const hb of t.hitboxes) hitMeshes.push(hb.mesh)

    let totalDamage = 0
    let firstHit = null // {targetId, zone, point, normal, damage}
    let anyWall = null  // {point, normal}
    let meleeHit = false

    const pellets = d.melee ? 1 : d.pellets
    const spread = d.spread + (moving ? d.moveSpread : 0)

    for (let i = 0; i < pellets; i++) {
      const dir = this._spreadDir(baseDir, spread)
      this.raycaster.set(origin, dir)
      this.raycaster.far = d.range
      let hits
      if (d.melee) {
        hits = this.raycaster.intersectObjects(hitMeshes, false)
        // melee always "connects" as a whiff/connect; mark hit only if within reach
        meleeHit = hits.length > 0
        if (hits.length > 0) {
          const h = hits[0]
          const target = targets.find(t => t.id === h.object.userData.playerId)
          if (target && target.player.alive) {
            totalDamage += d.damage * (ZONE_MULT[d.id]?.[h.object.userData.zone] ?? 1)
            firstHit = { targetId: target.id, zone: h.object.userData.zone, point: h.point, normal: this._hitNormal(h), damage: totalDamage }
          }
        }
      } else {
        hits = this.raycaster.intersectObjects([...hitMeshes, ...colliders], false)
        if (hits.length === 0) continue
        const h = hits[0]
        if (h.object.userData.playerId !== undefined && h.object.userData.zone) {
          const target = targets.find(t => t.id === h.object.userData.playerId)
          if (target && target.player.alive) {
            const zone = h.object.userData.zone
            let dmg = d.damage * (ZONE_MULT[d.id]?.[zone] ?? 1)
            if (d.falloff) {
              const dist = origin.distanceTo(h.point)
              const t = Math.max(0, Math.min(1, (dist - d.falloff.start) / (d.falloff.end - d.falloff.start)))
              const mult = (dmg / d.damage)
              dmg = dmg * (1 - t) + Math.max(1, d.falloff.min * mult) * t
            }
            totalDamage += dmg
            if (!firstHit || zone === 'head') {
              firstHit = { targetId: target.id, zone, point: h.point, normal: this._hitNormal(h), damage: dmg }
            }
          } else {
            anyWall = anyWall || { point: h.point, normal: this._hitNormal(h) }
          }
        } else {
          anyWall = { point: h.point, normal: this._hitNormal(h) }
        }
      }
    }

    // Visual: representative tracer from the muzzle tip
    const mv = this.viewModels[this.current].muzzle
    const muzzleWorld = new THREE.Vector3()
    mv.getWorldPosition(muzzleWorld)
    const end = anyWall ? anyWall.point : origin.clone().addScaledVector(baseDir, d.range)
    const glowR = !d.melee ? (firstHit || anyWall ? d.tracerGlow : 1.2) : 0
    if (!d.melee) this.effects.tracer(muzzleWorld, end, d.tracerColor, glowR)
    if (!d.melee) this.effects.muzzle(muzzleWorld, this.current === 'awp' ? 2.6 : 1, this.current === 'awp' ? 0xbdd7ff : 0xffd27a)

    if (d.melee) {
      const slash = origin.clone().addScaledVector(baseDir, d.range - 0.2)
      this.effects.impact(slash, new THREE.Vector3(0, 1, 0), 0xffffff)
    }

    if (!d.melee) {
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), baseDir).normalize()
      if (Math.random() > 0.75) this.effects.shell(muzzleWorld.clone().addScaledVector(side, 0.06), side)
    }

    const result = {
      hit: !!firstHit,
      targetId: firstHit ? firstHit.targetId : null,
      zone: firstHit ? firstHit.zone : null,
      point: firstHit ? firstHit.point : (anyWall ? anyWall.point : end),
      normal: firstHit ? firstHit.normal : (anyWall ? anyWall.normal : null),
      damage: totalDamage,
      recoil: d.recoil,
      melee: d.melee,
    }
    return result
  }

  _hitNormal(hit) {
    if (hit.face && hit.face.normal) {
      const n = hit.face.normal.clone()
      if (hit.object && hit.object.matrixWorld) n.transformDirection(hit.object.matrixWorld)
      return n
    }
    if (hit.normal) return hit.normal.clone()
    return new THREE.Vector3(0, 1, 0)
  }

  _spreadDir(base, spread) {
    if (spread <= 0) return base.clone()
    const up = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(base, up).normalize()
    const upv = new THREE.Vector3().crossVectors(right, base).normalize()
    const a = (Math.random() * 2 - 1) * spread
    const b = (Math.random() * 2 - 1) * spread
    return base.clone().addScaledVector(right, a).addScaledVector(upv, b).normalize()
  }

  // Called every frame from the game loop. Handles viewmodel recoil recovery,
  // walking bob, ads raise/lower, look sway and the reload animation.
  // swayX / swayY are normalized look velocity (roughly -1..1).
  update(dt, moving, running, swayX = 0, swayY = 0) {
    const now = performance.now()
    const view = this.viewModels[this.current]
    const st = this._effects[this.current]

    // Reload animation progress
    if (this.reloading && this._reloadT < 1) {
      this._reloadT = Math.min(1, this._reloadT + dt / this._reloadDur)
    }

    const canAds = ADS_FOV[this.current] != null
    const targetAds = (this.ads && canAds && !this.reloading) ? 1 : 0
    this.adsSmooth += (targetAds - this.adsSmooth) * Math.min(1, dt * 10)

    // recoil recovery (slower for a more felt kick)
    const recRate = 4.5 + (this.def().recoil || 0) * 2.5
    st.recoil = Math.max(0, st.recoil - dt * recRate)
    st.recoilYaw = Math.max(0, Math.abs(st.recoilYaw) - dt * recRate) * Math.sign(st.recoilYaw)

    // look sway — decays back to center when the mouse stops
    st.swayX += (Math.max(-1, Math.min(1, swayX)) - st.swayX) * Math.min(1, dt * 6)
    st.swayY += (Math.max(-1, Math.min(1, swayY)) - st.swayY) * Math.min(1, dt * 6)

    const time = now / 1000
    // idle breathing + walking bob (subtle "holding" motion)
    const idleX = Math.sin(time * 1.5) * 0.004
    const idleZ = Math.cos(time * 1.1) * 0.004
    const bobAmp = moving ? 1 : 0.1
    const bobX = moving ? Math.sin(time * (running ? 10 : 6.5)) * (running ? 0.028 : 0.016) : 0
    const bob = moving ? Math.sin(time * (running ? 10 : 6.5)) * (running ? 0.03 : 0.018) : Math.sin(time * 1.5) * 0.006
    const bobY = moving ? Math.abs(Math.cos(time * (running ? 10 : 6.5))) * (running ? 0.022 : 0.013) : 0
    const a = this.adsSmooth

    // Reload: dip the weapon down/back at the start, hold it low, then raise it.
    let rDip = 0, rRot = 0, rSpin = 0
    if (this.reloading) {
      const rt = this._reloadT
      const envelope = rt < 0.2 ? rt / 0.2 : (rt > 0.72 ? (1 - rt) / 0.28 : 1)
      rDip = envelope * 0.14
      rRot = envelope * 0.55
      rSpin = envelope * st.reloadSpin * 0.4
    }

    // blend between hip-fire and ads positions — weapon kicks back & tilts on fire
    const px = (0.36 + idleX + bobX + st.swayX * 0.012) * (1 - a)
    const py = ((-0.26 + bobY * bobAmp - st.swayY * 0.010 - rDip) * (1 - a)) - 0.16 * a
    const pz = (-0.62 - st.recoil * 0.12 + rDip * 0.3) * (1 - a) - 0.42 * a
    const tx = rRot * (1 - a)
    const ty = (st.recoilYaw * 0.30 + st.swayX * 0.05 + rSpin) * (1 - a)
    const tz = (bob * 0.6 + idleZ + st.recoil * 0.03 + st.swayY * 0.03) * (1 - a)

    view.group.position.set(px, py, pz)
    view.group.rotation.x = tx
    view.group.rotation.y = ty
    view.group.rotation.z = tz
  }

  get adsActive() { return this.adsSmooth > 0.35 }

  dispose() {
    for (const id of SLOT_ORDER) {
      const view = this.viewModels[id]
      if (view && view.group && this.camera) {
        this.camera.remove(view.group)
        view.group.traverse(o => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => { if (m && m.dispose) m.dispose() })
            else if (o.material.dispose) o.material.dispose()
          }
        })
      }
    }
  }
}