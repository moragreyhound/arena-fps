import * as THREE from 'three'
import { buildPlayerWeapon } from './weapons.js'

export const ZONES = ['head', 'torso', 'arm', 'leg']
// CS-style faction colours: T = tan/yellow, CT = blue.
export const TEAM_COLORS = { T: 0xc5a152, CT: 0x4f7bd9, none: 0xff5252 }
export const TEAM_TEXT = { T: 'T', CT: 'CT', none: '' }

// Radius of the player physics body (a Cannon sphere). The body position is the
// sphere's CENTER, while the RemotePlayer model is rooted at the feet, so the
// model must be dropped by this much to stand on the ground.
export const BODY_RADIUS = 0.7

const SKIN_TONES = [0xc99971, 0xb07a50, 0x9c6842, 0x8a5a36, 0xd8b088]

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function makeNameSprite(text, team) {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 6
  ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const color = TEAM_COLORS[team] || TEAM_COLORS.none
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text.slice(0, 16), canvas.width / 2, canvas.height / 2)
  ctx.shadowBlur = 0
  ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0')
  ctx.fillText(text.slice(0, 16), canvas.width / 2 + 2, canvas.height / 2 + 10)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(1.7, 0.42, 1)
  return sprite
}

// A Counter-Strike-style operator rig. Each damage zone maps to a hitbox mesh:
// head, torso, arm and leg. Two recognisable silhouettes:
//   CT  — helmet, armoured vest, steel-blue uniform
//   T   — balaclava / cap, no armour, tan fatigues
// The hitboxes stay at the same places/sizes for every faction, only the
// decorative plating, headgear and cloth colours differ.
export class RemotePlayer {
  constructor(scene, id, name, team) {
    this.id = id
    this.name = name
    this.team = team || 'none'
    this.health = 100
    this.kills = 0
    this.deaths = 0
    this.alive = true
    this.hitboxes = [] // [{ mesh, zone }]

    const teamColor = TEAM_COLORS[this.team] || TEAM_COLORS.none
    const faction = this.team === 'CT' ? 'CT' : this.team === 'T' ? 'T' : 'NEUTRAL'
    const skinTone = SKIN_TONES[hashStr(id) % SKIN_TONES.length]

    // ---- shared materials (faction decides which are used) ----
    const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.6, metalness: 0.02 })
    const uniform = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85, metalness: 0.05 })
    const uniformDark = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.9, metalness: 0 })
    uniformDark.color.multiplyScalar(0.68)
    const armour = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.4, metalness: 0.5 })
    const armourTrim = new THREE.MeshStandardMaterial({ color: 0x8a909a, roughness: 0.35, metalness: 0.6 })
    const helmet = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.5, metalness: 0.35 })
    const visor = new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.15, metalness: 0.9 })
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.7 })
    const boot = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7 })
    const belt = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.7 })
    const pouch = new THREE.MeshStandardMaterial({ color: 0x4f5b3a, roughness: 0.8 })
    const pack = new THREE.MeshStandardMaterial({ color: 0x3a4230, roughness: 0.85 })

    const group = new THREE.Group()
    const mk = (geo, mat, zone, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      mesh.castShadow = true
      mesh.userData.playerId = id
      mesh.userData.zone = zone
      group.add(mesh)
      if (zone) this.hitboxes.push({ mesh, zone })
      return mesh
    }
    const deco = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      mesh.castShadow = true
      group.add(mesh)
      return mesh
    }

    // ---- legs (shared by all factions) ----
    mk(new THREE.CylinderGeometry(0.16, 0.19, 0.66, 12), uniformDark, 'leg', -0.2, 0.33, 0)
    mk(new THREE.CylinderGeometry(0.16, 0.19, 0.66, 12), uniformDark, 'leg', 0.2, 0.33, 0)
    deco(new THREE.BoxGeometry(0.22, 0.12, 0.36), boot, -0.2, 0.04, 0.02)
    deco(new THREE.BoxGeometry(0.22, 0.12, 0.36), boot, 0.2, 0.04, 0.02)

    // ---- torso ----
    mk(new THREE.CylinderGeometry(0.3, 0.35, 0.62, 16), uniform, 'torso', 0, 0.95, 0)
    deco(new THREE.BoxGeometry(0.46, 0.08, 0.2), belt, 0, 0.66, 0.04)          // belt
    deco(new THREE.BoxGeometry(0.14, 0.1, 0.05), armourTrim, 0, 0.67, -0.21)   // belt buckle

    if (faction === 'CT' || faction === 'NEUTRAL') {
      // Armoured counter-terrorist with helmet.
      deco(new THREE.BoxGeometry(0.44, 0.4, 0.2), armour, 0, 1.0, -0.23)      // chest plate
      deco(new THREE.BoxGeometry(0.46, 0.14, 0.22), armour, 0, 0.8, -0.2)    // lower plate
      deco(new THREE.BoxGeometry(0.3, 0.34, 0.06), armourTrim, 0, 1.0, -0.32) // sternum trim
      deco(new THREE.BoxGeometry(0.28, 0.14, 0.1), pouch, 0, 1.14, -0.28)    // chest pouches
      deco(new THREE.BoxGeometry(0.14, 0.08, 0.08), pouch, -0.18, 0.84, -0.28)
      deco(new THREE.BoxGeometry(0.14, 0.08, 0.08), pouch, 0.18, 0.84, -0.28)
      deco(new THREE.BoxGeometry(0.24, 0.3, 0.1), pack, 0, 1.05, 0.3)         // backpack
      deco(new THREE.SphereGeometry(0.15, 10, 8), armour, -0.4, 1.2, 0)       // shoulder pads
      deco(new THREE.SphereGeometry(0.15, 10, 8), armour, 0.4, 1.2, 0)
      deco(new THREE.BoxGeometry(0.14, 0.06, 0.24), armour, -0.26, 0.4, -0.08) // knee pads
      deco(new THREE.BoxGeometry(0.14, 0.06, 0.24), armour, 0.26, 0.4, -0.08)
      deco(new THREE.BoxGeometry(0.12, 0.16, 0.06), glove, 0.3, 0.44, 0.04)   // sidearm holster

      // Helmeted head.
      mk(new THREE.SphereGeometry(0.21, 16, 12), skin, 'head', 0, 1.55, 0)
      deco(new THREE.CylinderGeometry(0.235, 0.225, 0.16, 14), helmet, 0, 1.665, 0) // shell
      deco(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 14), armourTrim, 0, 1.575, 0) // rim
      deco(new THREE.BoxGeometry(0.28, 0.05, 0.06), helmet, 0, 1.6, -0.19)   // brow
      deco(new THREE.BoxGeometry(0.3, 0.16, 0.06), visor, 0, 1.53, -0.185)   // visor glass
      deco(new THREE.BoxGeometry(0.24, 0.09, 0.06), armour, 0, 1.44, -0.17)  // jaw guard
    } else {
      // Masked terrorist: no armour, tan fatigues, chest rig.
      deco(new THREE.BoxGeometry(0.36, 0.12, 0.1), pouch, 0, 1.12, -0.24)    // chest rig band
      deco(new THREE.BoxGeometry(0.09, 0.13, 0.06), pouch, -0.11, 1.13, -0.265)
      deco(new THREE.BoxGeometry(0.09, 0.13, 0.06), pouch, 0.11, 1.13, -0.265)
      deco(new THREE.BoxGeometry(0.04, 0.34, 0.04), uniformDark, 0, 1.0, -0.27) // jacket zipper
      deco(new THREE.BoxGeometry(0.3, 0.08, 0.16), pouch, 0, 0.72, 0.02)     // belt pouch
      deco(new THREE.BoxGeometry(0.1, 0.04, 0.06), armourTrim, 0, 0.74, -0.21)

      // Hooded / bandana-wrapped head.
      mk(new THREE.SphereGeometry(0.21, 16, 12), skin, 'head', 0, 1.55, 0)
      deco(new THREE.CylinderGeometry(0.2, 0.215, 0.14, 14), helmet, 0, 1.665, 0) // beanie
      deco(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 14), uniformDark, 0, 1.59, 0) // headband
      deco(new THREE.BoxGeometry(0.2, 0.17, 0.08), helmet, 0, 1.52, -0.16)   // balaclava mask
      deco(new THREE.BoxGeometry(0.07, 0.035, 0.03), visor, -0.065, 1.565, -0.185) // eyes
      deco(new THREE.BoxGeometry(0.07, 0.035, 0.03), visor, 0.065, 1.565, -0.185)
    }

    // ---- arms (hitbox) + hands, raised toward the weapon ----
    mk(new THREE.CylinderGeometry(0.08, 0.085, 0.56, 10), uniformDark, 'arm', -0.44, 1.02, 0)
    mk(new THREE.CylinderGeometry(0.08, 0.085, 0.56, 10), uniformDark, 'arm', 0.44, 1.02, 0)
    deco(new THREE.BoxGeometry(0.14, 0.12, 0.24), glove, -0.36, 0.82, -0.16, -0.4, 0, 0.1)
    deco(new THREE.BoxGeometry(0.14, 0.12, 0.24), glove, 0.36, 0.82, -0.16, -0.4, 0, -0.1)

    this.bodyMat = uniform
    this.helmetMat = null

    // weapon the player is holding
    this.weaponGroup = new THREE.Group()
    this.weaponGroup.position.set(0.36, 0.97, -0.42)
    this.weaponGroup.rotation.y = 0
    group.add(this.weaponGroup)
    this.weaponModel = null
    this.weaponId = null

    this.nameSprite = makeNameSprite(name, this.team)
    this.nameSprite.position.set(0, 2.1, 0)
    group.add(this.nameSprite)

    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111318, depthTest: false, transparent: true, opacity: 0.85 }))
    barBg.scale.set(1.25, 0.12, 1)
    barBg.position.set(0, 1.9, 0)
    group.add(barBg)
    this.healthBarBg = barBg

    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4caf50, depthTest: false, transparent: true, opacity: 0.95 }))
    barFg.scale.set(1.25, 0.12, 1)
    barFg.position.set(0, 1.9, 0.01)
    group.add(barFg)
    this.healthBarFg = barFg

    this.group = group
    scene.add(group)
  }

  updateTransform(pos, rotY) {
    this.group.position.set(pos.x, pos.y - BODY_RADIUS, pos.z)
    this.group.rotation.y = rotY
  }

  setWeapon(wid) {
    if (wid === this.weaponId) return
    this.weaponId = wid || 'pistol'
    if (this.weaponModel) {
      this.weaponGroup.remove(this.weaponModel)
      this.weaponModel.traverse(o => { if (o.geometry) o.geometry.dispose() })
    }
    this.weaponModel = buildPlayerWeapon(this.weaponId)
    this.weaponGroup.add(this.weaponModel)
  }

  setTeam(team) {
    this.team = team || 'none'
    this.bodyMat.color.setHex(TEAM_COLORS[this.team] || TEAM_COLORS.none)
  }

  setHealth(h) {
    this.health = Math.max(0, Math.min(100, h))
    const pct = this.health / 100
    this.healthBarFg.scale.x = 1.25 * pct
    this.healthBarFg.position.x = -0.625 * (1 - pct)
    this.healthBarFg.material.color.setHex(pct > 0.5 ? 0x4caf50 : pct > 0.25 ? 0xffb300 : 0xe53935)
    this.alive = this.health > 0
    this.group.visible = this.alive
  }

  // Knock the body over when killed so it reads as a death.
  setDead() {
    this.alive = false
    this.setHealth(0)
    this.group.rotation.x = Math.PI / 2
    this.group.position.y = Math.max(this.group.position.y, 0.35)
  }

  respawn(pos, rotY = 0) {
    this.alive = true
    this.health = 100
    this.group.rotation.x = 0
    this.updateTransform(pos, rotY)
    this.setHealth(100)
  }

  dispose(scene) {
    scene.remove(this.group)
  }
}