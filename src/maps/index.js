// Map registry + JSON parsing. Pure JS (no THREE imports) so the Node server
// can share the same code for built-in maps and server-hosted custom maps.

import { dust2 } from './dust2.js'

const registry = new Map()

export function register(def) {
  if (!def || typeof def !== 'object') return null
  const norm = normalizeMapDef(def)
  if (!norm || !norm.id) return null
  registry.set(norm.id, norm)
  return norm
}

export function getMap(id) {
  return registry.get(String(id))
}

export function unregister(id) {
  const def = registry.get(String(id))
  if (!def) return false
  if (def.source === 'built-in') return false
  registry.delete(String(id))
  return true
}

export function listMaps() {
  return Array.from(registry.values()).map(m => ({ id: m.id, name: m.name || m.id, source: m.source || 'built-in' }))
}

export function parseMapJSON(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { error: 'Invalid JSON: ' + e.message }
  }
  const def = normalizeMapDef(raw)
  if (!def) return { error: 'Map file has no usable definition.' }
  return { def }
}

export function normalizeMapDef(raw) {
  if (!raw || typeof raw !== 'object') return null
  const colors = normColor(raw.sky)
  const out = {
    id: String(raw.id || 'map_' + Math.floor(Math.random() * 1e6)).slice(0, 32),
    name: String(raw.name || raw.id || 'Custom map').slice(0, 40),
    author: String(raw.author || 'unknown').slice(0, 40),
    source: raw.source || 'custom',
    sky: colors.sky,
    fog: normFog(raw.fog),
    light: normalizeLight(raw.light),
    ground: normGround(raw.ground),
    grid: !!raw.grid,
    geometry: Array.isArray(raw.geometry) ? raw.geometry.map(normGeo).filter(Boolean) : [],
    spawns: Array.isArray(raw.spawns) ? raw.spawns.map(normVec).filter(Boolean) : [],
    teams: normTeams(raw.teams),
  }
  if (out.spawns.length === 0) out.spawns = [{ x: 0, y: 2, z: 0 }]
  return out
}

function normFog(f) {
  const color = normColor(f && f.color).fog
  return {
    near: typeof f?.near === 'number' ? f.near : 80,
    far: typeof f?.far === 'number' ? f.far : 260,
    color,
  }
}

function normalizeLight(l) {
  const amb = normColor(l && l.ambient).ambient
  let sun = { color: 0xffe7b8, intensity: 1.15, x: 70, y: 110, z: 40 }
  if (l && l.sun) {
    const s = normColor(l.sun.color).sun
    sun = {
      color: s,
      intensity: typeof l.sun.intensity === 'number' ? l.sun.intensity : 1.15,
      x: typeof l.sun.x === 'number' ? l.sun.x : 60,
      y: typeof l.sun.y === 'number' ? l.sun.y : 100,
      z: typeof l.sun.z === 'number' ? l.sun.z : 40,
    }
  }
  return {
    ambient: amb,
    ambientIntensity: typeof l?.ambientIntensity === 'number' ? l.ambientIntensity : 0.72,
    sun,
  }
}

function normGround(g) {
  const color = normColor(g && g.color).ground
  return {
    w: typeof g?.w === 'number' ? g.w : 150,
    d: typeof g?.d === 'number' ? g.d : 130,
    color,
  }
}

function normGeo(g) {
  if (!g || typeof g !== 'object') return null
  const pos = tryNum(g.x, 0), y = tryNum(g.y, 0), z = tryNum(g.z, 0)
  const color = normColor(g.color).geo
  const base = {
    x: pos, y, z, color,
    collide: g.collide !== false,
    shadow: g.shadow !== false,
    receive: g.receive !== false,
  }
  if (g.type === 'cylinder' || g.type === 'sphere') {
    const r = tryNum(g.r, 1)
    if (r <= 0) return null
    return { type: g.type, r, h: tryNum(g.h, r * 2), ...base }
  }
  return {
    type: 'box',
    w: tryNum(g.w, 1), h: tryNum(g.h, 1), d: tryNum(g.d, 1),
    yaw: tryNum(g.yaw, 0),
    ...base,
  }
}

function normVec(v) {
  if (!v || typeof v !== 'object') return null
  const x = tryNum(v.x, 0), y = tryNum(v.y, 2), z = tryNum(v.z, 0)
  return { x, y, z }
}

function normTeams(t) {
  if (!t || typeof t !== 'object') return null
  const out = {}
  for (const k of ['T', 'CT']) {
    if (Array.isArray(t[k])) {
      const arr = t[k].map(normVec).filter(Boolean)
      if (arr.length) out[k] = arr
    }
  }
  return Object.keys(out).length ? out : null
}

function normColor(c) {
  if (typeof c === 'number') {
    const n = Math.floor(c) & 0xffffff
    return { geo: n, ground: n, sky: n, fog: n, ambient: n, sun: n }
  }
  if (typeof c === 'string') {
    let n
    if (c.startsWith('#')) n = parseInt(c.slice(1), 16)
    else if (c.startsWith('0x')) n = parseInt(c.slice(2), 16)
    else n = parseInt(c, 16)
    if (Number.isNaN(n)) n = 0x888888
    n &= 0xffffff
    return { geo: n, ground: n, sky: n, fog: n, ambient: n, sun: n }
  }
  return { geo: 0x888888, ground: 0x888888, sky: 0x888888, fog: 0x888888, ambient: 0x888888, sun: 0x888888 }
}

function tryNum(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

register({ ...dust2, source: 'built-in' })