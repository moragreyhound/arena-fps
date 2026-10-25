import * as THREE from 'three'

// Pooled, cheap visual effects: muzzle flashes, tracers, impact sparks/smoke,
// bullet-hole decals, blood, and ejecting shell casings.

function makeSoftCircleTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export class Effects {
  constructor(scene) {
    this.scene = scene
    this._tex = makeSoftCircleTexture()
    this.particles = []
    this.decals = []
    this.casings = []
    this.flashes = []
    this.lights = []
    this._decalGeo = new THREE.CircleGeometry(1, 20)
    this._casingGeo = new THREE.BoxGeometry(0.035, 0.012, 0.024)
  }

  _sprite(color, size, additive = true) {
    const mat = new THREE.SpriteMaterial({
      map: this._tex,
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    const spr = new THREE.Sprite(mat)
    spr.scale.set(size, size, 1)
    return spr
  }

  muzzle(position, scale = 1, color = 0xffd27a) {
    const spr = this._sprite(0xfff3c0, 0.6 * scale)
    spr.position.copy(position)
    spr.rotation.z = Math.random() * Math.PI * 2
    this.scene.add(spr)
    this.flashes.push({ spr, expires: performance.now() + 45, grow: 1 })

    const spr2 = this._sprite(color, 0.28 * scale)
    spr2.position.copy(position)
    this.scene.add(spr2)
    this.flashes.push({ spr: spr2, expires: performance.now() + 30, grow: 1.6 })

    const light = new THREE.PointLight(color, 4, 6)
    light.position.copy(position)
    this.scene.add(light)
    this.lights.push({ light, expires: performance.now() + 50 })
  }

  tracer(from, to, color = 0xfff3b0, glow = 3) {
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    if (len < 0.01) return
    dir.normalize()
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 6)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(mid)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    this.scene.add(mesh)
    this.casings.push({ obj: mesh, expires: performance.now() + 70 + Math.random() * 40, kind: 'tracer' })

    if (glow > 0) {
      const spr = this._sprite(color, glow)
      spr.position.copy(mid)
      this.scene.add(spr)
      this.flashes.push({ spr, expires: performance.now() + 60, grow: 1.2 })
    }
  }

  impact(point, normal, color = 0xffc891) {
    // sparks
    for (let i = 0; i < 7; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8, Math.random() * 5 + 2, (Math.random() - 0.5) * 8
      )
      this._spawnParticle(point, vel, 260 + Math.random() * 200, 0.05 + Math.random() * 0.03, i % 2 ? 0xffc891 : 0xffe0a0, 24)
    }
    // smoke puff
    const n = normal.clone().multiplyScalar(0.15).add(point)
    for (let i = 0; i < 2; i++) {
      this._spawnParticle(n, normal.clone().multiplyScalar(0.5).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6)
      ), 500, 0.22 + Math.random() * 0.1, 0x888888, -1, false)
    }
    this._spawnDecal(point, normal, 0x2a2a2e, 0.12 + Math.random() * 0.06)
  }

  blood(point, normal, headshot = false) {
    const n = normal.clone().multiplyScalar(0.05).add(point)
    for (let i = 0; i < (headshot ? 18 : 12); i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 7, Math.random() * 4 + 1.5, (Math.random() - 0.5) * 7
      )
      this._spawnParticle(n, vel, 300 + Math.random() * 300, 0.05 + Math.random() * 0.04, 0xa31111, 22)
    }
    this._spawnDecal(point, normal, 0x6b0f0f, 0.1 + Math.random() * 0.05)
  }

  shell(position, dir, color = 0xc9a12a) {
    const mesh = new THREE.Mesh(this._casingGeo, new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }))
    mesh.position.copy(position)
    mesh.castShadow = true
    this.scene.add(mesh)
    this.casings.push({
      obj: mesh, kind: 'casing',
      vel: dir.clone().multiplyScalar(2.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, 0)),
      rot: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      expires: performance.now() + 2200,
    })
  }

  _spawnParticle(pos, vel, life, size, color, gravity = 20, additive = true) {
    // reuse an expired particle if possible
    let p = this.particles.find(x => !x.active)
    if (!p) {
      const spr = this._sprite(0xffffff, size)
      this.scene.add(spr)
      p = { spr, active: false, vel: new THREE.Vector3(), life: 0, maxLife: 1, size, gravity }
      this.particles.push(p)
    }
    const spr = p.spr
    spr.material.color.setHex(color)
    spr.material.opacity = 1
    spr.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending
    spr.scale.set(size, size, 1)
    spr.position.copy(pos)
    spr.visible = true
    p.active = true
    p.vel.copy(vel)
    p.life = life
    p.maxLife = life
    p.size = size
    p.gravity = gravity
  }

  _spawnDecal(point, normal, color, scale) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
    const mesh = new THREE.Mesh(this._decalGeo, mat)
    mesh.scale.set(scale, scale, 1)
    mesh.position.copy(point).addScaledVector(normal, 0.012)
    mesh.lookAt(point.clone().add(normal))
    this.scene.add(mesh)
    this.decals.push({ obj: mesh, expires: performance.now() + 12000 })
    while (this.decals.length > 60) {
      const old = this.decals.shift()
      this.scene.remove(old.obj)
      old.obj.material.dispose()
    }
  }

  dispose() {
    for (const p of this.particles) this.scene.remove(p.spr)
    for (const f of this.flashes) this.scene.remove(f.spr)
    for (const l of this.lights) this.scene.remove(l.light)
    for (const c of this.casings) this.scene.remove(c.obj)
    for (const d of this.decals) this.scene.remove(d.obj)
    this.particles = []
    this.flashes = []
    this.lights = []
    this.casings = []
    this.decals = []
    if (this._decalGeo) this._decalGeo.dispose()
    if (this._casingGeo) this._casingGeo.dispose()
  }

  update(dt) {
    const now = performance.now()

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      if (!p.active) continue
      p.life -= dt * 1000
      if (p.life <= 0) {
        p.active = false
        p.spr.visible = false
        continue
      }
      p.vel.y -= (p.gravity || 0) * dt
      p.spr.position.addScaledVector(p.vel, dt)
      const t = p.life / p.maxLife
      p.spr.material.opacity = t
      p.spr.scale.set(p.size * (0.6 + 0.4 * t), p.size * (0.6 + 0.4 * t), 1)
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      if (now >= f.expires) {
        this.scene.remove(f.spr)
        this.flashes.splice(i, 1)
        continue
      }
      const t = (f.expires - now) / 45
      f.spr.scale.setScalar((0.6 + 0.4 * t) * f.spr.scale.x)
      f.spr.material.opacity = t
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      if (now >= this.lights[i].expires) {
        this.scene.remove(this.lights[i].light)
        this.lights.splice(i, 1)
      }
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i]
      if (now >= c.expires) {
        this.scene.remove(c.obj)
        if (c.obj.geometry) c.obj.geometry.dispose()
        if (c.obj.material) c.obj.material.dispose()
        this.casings.splice(i, 1)
        continue
      }
      if (c.kind === 'casing') {
        c.vel.y -= 24 * dt
        c.obj.position.addScaledVector(c.vel, dt)
        if (c.obj.position.y < 0.012) {
          c.obj.position.y = 0.012
          c.vel.y = -c.vel.y * 0.3
          c.vel.x *= 0.7
          c.vel.z *= 0.7
        }
        c.obj.rotation.x += c.rot.x * dt
        c.obj.rotation.y += c.rot.y * dt
        c.obj.rotation.z += c.rot.z * dt
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]
      const left = d.expires - now
      if (left <= 0) {
        this.scene.remove(d.obj)
        d.obj.material.dispose()
        this.decals.splice(i, 1)
        continue
      }
      if (left < 1500) d.obj.material.opacity = 0.95 * (left / 1500)
    }
  }
}