import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { register, listMaps, getMap, unregister } from './src/maps/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const SERVER_MAPS_DIR = path.join(__dirname, 'maps')
const DEFAULT_MAP = 'dust2'

// Admin credentials. Set ADMIN_USER / ADMIN_PASSWORD env vars to pick your own;
// otherwise a random password is generated and printed at startup.
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))

// ---------------------------------------------------------------------------
// Map registry (built-ins + server-maps/*.json loaded at boot)
// ---------------------------------------------------------------------------
function loadServerMaps() {
  let loaded = 0
  try {
    if (!fs.existsSync(SERVER_MAPS_DIR)) fs.mkdirSync(SERVER_MAPS_DIR, { recursive: true })
    for (const file of fs.readdirSync(SERVER_MAPS_DIR)) {
      if (!file.toLowerCase().endsWith('.json')) continue
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(SERVER_MAPS_DIR, file), 'utf8'))
        const def = register({ ...raw, source: 'server' })
        if (def) { loaded++; console.log(`  loaded custom map "${def.name}" from ${file}`) }
      } catch (e) {
        console.log(`  skipped ${file}: ${e.message}`)
      }
    }
  } catch (e) {
    console.log('  no custom maps folder handled:', e.message)
  }
  if (loaded === 0) console.log('  (no custom maps — add some from the admin GUI at http://localhost:' + PORT + ')')
}
console.log('Arena FPS server starting…')
loadServerMaps()

// ---------------------------------------------------------------------------
// Server-wide UI customization (admin panel)
// ---------------------------------------------------------------------------
const serverStartTime = Date.now()

const serverSettings = {
  name: 'Arena FPS',
  accent: '#ff5252',
  message: '',
  password: '',
}

// ---------------------------------------------------------------------------
// Match management
// ---------------------------------------------------------------------------
/** @type {Map<string, {ws:any, id:string, name:string, matchId:string, team:string|null, weapon:string, pos:any, rot:number, health:number, kills:number, deaths:number, alive:boolean}>} */
const players = new Map() // id -> player record
/** @type {Map<string, {id,name,mapId,mode,timeLimit,scoreLimit,status,host,players:Map,timer,round}>} */
const matches = new Map()
let nextId = 1

function makeMatch(id, name, opts = {}) {
  return {
    id,
    name,
    mapId: opts.mapId || DEFAULT_MAP,
    mode: opts.mode || 'dm',
    timeLimit: (opts.timeLimit || 10) * 60,
    scoreLimit: opts.scoreLimit || 50,
    status: 'lobby',
    host: opts.host || null,
    players: new Map(),
    // match scoring
    teamScores: { T: 0, CT: 0 },
    elapsed: 0,
    round: 0,
  }
}

// Default match everyone can fall into
matches.set('main', makeMatch('main', 'Main Arena', { mapId: DEFAULT_MAP, mode: 'dm' }))

function playerSpawn(match, team, mapDef) {
  const def = mapDef || getMap(match.mapId)
  if (!def) return { x: 0, y: 2, z: 0 }
  if (match.mode === 'tdm' && team && def.teams && def.teams[team]) {
    const arr = def.teams[team]
    return arr[Math.floor(Math.random() * arr.length)]
  }
  const arr = def.spawns || []
  const p = arr[Math.floor(Math.random() * arr.length)]
  return p || { x: 0, y: 2, z: 0 }
}

function assignTeam(match) {
  if (match.mode !== 'tdm') return null
  let t = 0, ct = 0
  for (const p of match.players.values()) {
    if (p.team === 'T') t++
    else ct++
  }
  return t <= ct ? 'T' : 'CT'
}

function teamBalanceWants(match, want) {
  if (!want || (want !== 'T' && want !== 'CT')) return null
  let t = 0, ct = 0
  for (const p of match.players.values()) {
    if (p.team === 'T') t++
    else if (p.team === 'CT') ct++
  }
  const target = want === 'T' ? t : ct
  const other = want === 'T' ? ct : t
  return other < target ? null : want // don't stack teams
}

function playerPayload(p) {
  return { id: p.id, name: p.name, pos: p.pos, rot: p.rot, health: p.health, kills: p.kills, deaths: p.deaths, team: p.team, alive: p.alive, weapon: p.weapon || 'pistol' }
}

function matchPayload(m) {
  return {
    id: m.id, name: m.name,
    map_name: (getMap(m.mapId) || {}).name || m.mapId,
    map: m.mapId, mode: m.mode,
    status: m.status,
    host: m.host,
    players: m.players.size,
  }
}

function broadcastMatchList() {
  broadcast({ type: 'matchList', matches: Array.from(matches.values()).map(matchPayload), maps: listMaps(), ui: { accent: serverSettings.accent, name: serverSettings.name, hasPassword: !!serverSettings.password } })
}

function leaderboardPayload(match) {
  return Array.from(match.players.values()).map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, team: p.team }))
}

function sendMatchTick(m) {
  const p = Array.from(m.players.values())[0]
  if (!p) return
  const timeLeft = Math.max(0, Math.round(m.timeLimit - m.elapsed))
  const msg = {
    type: 'matchTick',
    match: m.id,
    name: m.name,
    mode: m.mode,
    elapsed: m.elapsed,
    timeLeft,
    teamScores: m.mode === 'tdm' ? m.teamScores : null,
  }
  for (const pl of m.players.values()) if (pl.ws.readyState === 1) pl.ws.send(JSON.stringify(msg))
}

function endMatch(m) {
  m.status = 'ending'
  const winner = m.mode === 'tdm'
    ? (m.teamScores.T === m.teamScores.CT ? "It's a draw" : `${m.teamScores.T > m.teamScores.CT ? 'T' : 'CT'} team wins`)
    : null
  const sorted = Array.from(m.players.values()).sort((a, b) => b.kills - a.kills)
  const msg = {
    type: 'matchEnd',
    title: `${m.name} — round ${m.round} complete${winner ? ' · ' + winner : ''}`,
    players: sorted.map(p => ({ name: p.name, kills: p.kills, deaths: p.deaths, team: p.team })),
  }
  for (const pl of m.players.values()) if (pl.ws.readyState === 1) pl.ws.send(JSON.stringify(msg))
  setTimeout(() => {
    if (!matches.has(m.id)) return
    resetRound(m)
  }, 6000)
}

function resetRound(m) {
  m.status = 'live'
  m.round += 1
  m.elapsed = 0
  m.teamScores = { T: 0, CT: 0 }
  for (const pl of m.players.values()) {
    pl.kills = 0
    pl.deaths = 0
    pl.health = 100
    pl.alive = true
    const spawn = playerSpawn(m, pl.team, getMap(m.mapId))
    pl.pos = spawn
    if (pl.ws.readyState === 1) pl.ws.send(JSON.stringify({ type: 'respawn', pos: spawn }))
  }
  broadcast({ type: 'leaderboard', match: m.id, players: leaderboardPayload(m) }, null, m)
  broadcastMatchList()
  sendMatchTick(m)
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

// Track every live socket so the heartbeat can prune stale connections.
// A peer that stops answering pongs is dropped, which triggers the normal
// `close` handler below and broadcasts `playerLeft` so no avatar lingers.
const sockets = new Set()
const HEARTBEAT_MS = 8000

setInterval(() => {
  for (const ws of sockets) {
    if (ws.readyState !== 1) { sockets.delete(ws); continue }
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_MS)

function broadcast(msg, exceptId = null, match = null) {
  const data = JSON.stringify(msg)
  for (const p of players.values()) {
    if (p.id === exceptId) continue
    if (match && p.matchId !== match.id) continue
    if (p.ws.readyState === 1) p.ws.send(data)
  }
}

function sendTo(id, msg) {
  const p = players.get(id)
  if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg))
}

function handleDeath(match, target, killer) {
  target.health = 0
  target.alive = false
  target.deaths += 1
  killer.kills += 1
  if (match.mode === 'tdm' && target.team && killer.team && target.team !== killer.team) {
    match.teamScores[killer.team] += 1
  }
  broadcast({ type: 'death', match: match.id, victimId: target.id, victimName: target.name, killerId: killer.id, killerName: killer.name, killerPos: killer.pos, weapon: lastHitWeapon.get(target.id) || '', headshot: lastHitHeadshot.get(target.id) || false }, null, match)
  broadcast({ type: 'leaderboard', match: match.id, players: leaderboardPayload(match) }, null, match)
  if (match.mode === 'tdm') sendMatchTick(match)

  setTimeout(() => {
    if (!players.has(target.id) || !matches.has(match.id)) return
    if (players.get(target.id).matchId !== match.id) return
    const spawn = playerSpawn(match, target.team, getMap(match.mapId))
    target.health = 100
    target.alive = true
    target.pos = spawn
    sendTo(target.id, { type: 'respawn', pos: spawn })
    broadcast({ type: 'health', match: match.id, id: target.id, health: 100, alive: true }, target.id, match)
  }, 2300)
}

const lastHitWeapon = new Map()
const lastHitHeadshot = new Map()

wss.on('connection', (ws) => {
  const id = String(nextId++)
  let joined = false

  ws.isAlive = true
  sockets.add(ws)
  ws.on('pong', () => { ws.isAlive = true })

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'join') {
      if (serverSettings.password && msg.password !== serverSettings.password) {
        sendTo(id, { type: 'joinError', error: 'Server requires a password.' })
        return
      }
      let match = matches.get(msg.match || 'main') || matches.get('main')
      if (players.has(id)) {
        const old = players.get(id)
        const oldMatch = matches.get(old.matchId)
        if (oldMatch) { oldMatch.players.delete(id); broadcastMatchList() }
      }
      const team = assignTeam(match)
      const spawn = playerSpawn(match, team, getMap(match.mapId))
      const player = {
        ws, id,
        name: String(msg.name || `Player${id}`).slice(0, 16),
        matchId: match.id,
        team,
        weapon: 'pistol',
        pos: spawn, rot: 0, health: 100, kills: 0, deaths: 0, alive: true,
      }
      players.set(id, player)
      match.players.set(id, player)
      if (match.status === 'lobby') match.status = 'live'
      joined = true

      sendTo(id, {
        type: 'init',
        id,
        spawn,
        team,
        match: { id: match.id, name: match.name, mode: match.mode, timeLimit: match.timeLimit, scoreLimit: match.scoreLimit, status: match.status, elapsed: match.elapsed, round: match.round },
        map: getMap(match.mapId),
        players: Array.from(match.players.values()).filter(p => p.id !== id).map(playerPayload),
      })
      sendTo(id, { type: 'uiTheme', accent: serverSettings.accent, serverName: serverSettings.name, message: serverSettings.message })
      broadcast({ type: 'playerJoined', match: match.id, id, name: player.name, pos: player.pos, team: player.team, weapon: player.weapon }, id, match)
      broadcast({ type: 'leaderboard', match: match.id, players: leaderboardPayload(match) }, null, match)
      broadcastMatchList()
      sendMatchTick(match)
      return
    }

    if (msg.type === 'createMatch') {
      if (serverSettings.password && msg.password !== serverSettings.password) {
        sendTo(id, { type: 'joinError', error: 'Server requires a password.' })
        return
      }
      const mapId = String(msg.map || DEFAULT_MAP)
      if (!getMap(mapId)) { sendTo(id, { type: 'matchListError', error: `Unknown map "${mapId}"` }); return }
      if (players.has(id)) {
        const old = players.get(id)
        const oldMatch = matches.get(old.matchId)
        if (oldMatch) { oldMatch.players.delete(id); broadcastMatchList() }
      }
      const mid = 'm' + (nextId++) + Math.floor(Math.random() * 9000 + 1000)
      const m = makeMatch(mid, String(msg.name || 'Custom match').slice(0, 24), {
        mapId, mode: msg.mode === 'tdm' ? 'tdm' : 'dm',
        timeLimit: Math.max(1, Math.min(60, parseInt(msg.timeLimit) || 10)),
        scoreLimit: Math.max(5, Math.min(500, parseInt(msg.scoreLimit) || 50)),
        host: id,
      })
      matches.set(mid, m)
      m.status = 'live'
      broadcastMatchList()
      const team = assignTeam(m)
      const spawn = playerSpawn(m, team, getMap(mapId))
      const p = players.get(id) || {
        ws, id, name: 'Player',
        pos: spawn, rot: 0, health: 100, kills: 0, deaths: 0, alive: true,
      }
      p.name = String((players.get(id) && players.get(id).name) || msg.playerName || `Player${id}`).slice(0, 16)
      p.ws = ws
      p.matchId = m.id
      p.team = team
      p.pos = spawn
      p.health = 100
      p.alive = true
      p.weapon = p.weapon || 'pistol'
      players.set(id, p)
      m.players.set(id, p)
      joined = true
      sendTo(id, {
        type: 'init',
        id, spawn, team,
        match: { id: m.id, name: m.name, mode: m.mode, timeLimit: m.timeLimit, scoreLimit: m.scoreLimit, status: m.status, elapsed: m.elapsed, round: m.round },
        map: getMap(mapId),
        players: Array.from(m.players.values()).filter(x => x.id !== id).map(playerPayload),
      })
      sendTo(id, { type: 'uiTheme', accent: serverSettings.accent, serverName: serverSettings.name, message: serverSettings.message })
      broadcast({ type: 'playerJoined', match: m.id, id, name: p.name, pos: p.pos, team: p.team, weapon: p.weapon }, id, m)
      broadcast({ type: 'leaderboard', match: m.id, players: leaderboardPayload(m) }, null, m)
      sendMatchTick(m)
      return
    }

    if (msg.type === 'getMapList') {
      if (ws.readyState === 1) ws.send(JSON.stringify({
        type: 'matchList',
        matches: Array.from(matches.values()).map(matchPayload),
        maps: listMaps(),
        ui: { accent: serverSettings.accent, name: serverSettings.name, hasPassword: !!serverSettings.password },
      }))
      return
    }

    if (!joined) return
    const player = players.get(id)
    if (!player) return
    const match = matches.get(player.matchId)
    if (!match) return

    if (msg.type === 'move') {
      player.pos = msg.pos
      player.rot = msg.rot
      broadcast({ type: 'move', id, pos: msg.pos, rot: msg.rot }, id)
      return
    }

    if (msg.type === 'shot') {
      broadcast({ type: 'shot', id, origin: msg.origin, point: msg.point }, id)
      return
    }

    if (msg.type === 'weapon') {
      player.weapon = String(msg.weapon || 'pistol').slice(0, 16)
      broadcast({ type: 'weapon', id, weapon: player.weapon }, id)
      return
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 140)
      if (!text) return
      broadcast({ type: 'chat', name: player.name, text, team: player.team }, null, match)
      return
    }

    if (msg.type === 'switchTeam') {
      if (match.mode !== 'tdm') {
        sendTo(id, { type: 'teamChanged', team: null })
        return
      }
      let want = msg.team === 'CT' ? 'CT' : 'T'
      const balanced = teamBalanceWants(match, want)
      if (!balanced) {
        sendTo(id, { type: 'chat', name: 'Server', text: `Team ${want} is full — stay on ${player.team}`, team: null })
        return
      }
      player.team = want
      sendTo(id, { type: 'teamChanged', team: want })
      broadcast({ type: 'chat', name: 'Server', text: `${player.name} switched to ${want}`, team: null }, id, match)
      broadcast({ type: 'leaderboard', match: match.id, players: leaderboardPayload(match) }, null, match)
      return
    }

    if (msg.type === 'hit') {
      const target = match.players.get(msg.targetId)
      if (!target || !target.alive || target.id === player.id) return
      const dmg = Math.max(1, Math.min(150, Number(msg.damage) || 10))
      lastHitWeapon.set(target.id, String(msg.weapon || '').slice(0, 16))
      lastHitHeadshot.set(target.id, msg.zone === 'head' || msg.headshot === true)
      if (match.mode === 'tdm' && player.team === target.team) return // friendly fire off in TDM
      target.health = Math.max(0, target.health - dmg)
      if (target.health <= 0 && target.alive) {
        handleDeath(match, target, player)
      } else {
        broadcast({ type: 'health', id: target.id, health: target.health, alive: true, attackerId: player.id, attackerPos: player.pos })
      }
      return
    }

    // WebRTC voice signaling relay. SDP/ICE payloads are passed only to the
    // addressed player in the same match, never broadcast, and never stored.
    // SDP descriptions are the largest legitimate payloads (~10 KB); anything
    // larger is dropped to bound memory and bandwidth.
    if (msg.type === 'voiceSignal') {
      if (!match) return
      const target = players.get(msg.to)
      if (!target || target.id === player.id || target.matchId !== match.id) return
      if (!msg.signal || typeof msg.signal !== 'object') return
      if (typeof msg.signal.type !== 'string') return
      let size = 0
      try { size = JSON.stringify(msg.signal).length } catch { return }
      if (size > 16384) return
      sendTo(target.id, { type: 'voiceSignal', from: player.id, signal: msg.signal })
      return
    }

    if (msg.type === 'leaveMatch') {
      lastHitWeapon.delete(id)
      lastHitHeadshot.delete(id)
      match.players.delete(id)
      players.delete(id)
      joined = false
      broadcast({ type: 'playerLeft', id }, null, match)
      broadcast({ type: 'leaderboard', match: match.id, players: leaderboardPayload(match) }, null, match)
      broadcastMatchList()
    }
  })

  ws.on('close', () => {
    sockets.delete(ws)
    lastHitWeapon.delete(id)
    lastHitHeadshot.delete(id)
    if (joined) {
      const p = players.get(id)
      const m = matches.get(p && p.matchId)
      if (m) {
        m.players.delete(id)
        broadcast({ type: 'playerLeft', id }, null, m)
        broadcast({ type: 'leaderboard', match: m.id, players: leaderboardPayload(m) }, null, m)
      }
      players.delete(id)
      broadcastMatchList()
    }
  })
})

// ---------------------------------------------------------------------------
// HTTP admin GUI + REST API (served on the same port as the WS server)
// ---------------------------------------------------------------------------
function sendJson(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 4e6) { req.destroy(); reject(new Error('payload too large')) }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function checkAuth(req, res) {
  const parts = String(req.headers.authorization || '').split(' ')
  if (parts[0] === 'Basic' && parts[1]) {
    let decoded = ''
    try { decoded = Buffer.from(parts[1], 'base64').toString('utf8') } catch { decoded = '' }
    const i = decoded.indexOf(':')
    const user = Buffer.from(i === -1 ? '' : decoded.slice(0, i))
    const pass = Buffer.from(i === -1 ? '' : decoded.slice(i + 1))
    const eu = Buffer.from(ADMIN_USER)
    const ep = Buffer.from(ADMIN_PASSWORD)
    if (user.length === eu.length && pass.length === ep.length &&
        crypto.timingSafeEqual(user, eu) && crypto.timingSafeEqual(pass, ep)) {
      return true
    }
  }
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="Arena FPS Admin"',
  })
  res.end('Authorization required')
  return false
}

function registerServerMap(content) {
  let parsed
  try { parsed = JSON.parse(content) } catch (e) { return { error: 'Invalid JSON: ' + e.message } }
  const def = register({ ...parsed, source: 'server' })
  if (!def) return { error: 'Map needs a valid id and definition.' }
  try {
    fs.writeFileSync(path.join(SERVER_MAPS_DIR, def.id + '.json'), JSON.stringify(parsed, null, 2))
  } catch (e) {
    return { error: 'Could not save map file: ' + e.message }
  }
  return { ok: true, id: def.id, name: def.name }
}

httpServer.on('request', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // --- Admin console page ---
  if (req.method === 'GET' && (pathname === '/' || pathname === '/admin')) {
    if (!checkAuth(req, res)) return
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(ADMIN_HTML)
    return
  }

  // --- JSON API (all endpoints require admin auth) ---
  if (pathname.startsWith('/api/')) {
    if (!checkAuth(req, res)) return
    if (req.method === 'GET' && pathname === '/api/state') {
      const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000)
      sendJson(res, 200, {
        name: serverSettings.name,
        accent: serverSettings.accent,
        message: serverSettings.message,
        hasPassword: !!serverSettings.password,
        uptime: uptimeSec,
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        wsConnections: players.size,
        maps: listMaps(),
        players: Array.from(players.values()).map(p => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, matchId: p.matchId })),
        matches: Array.from(matches.values()).map(m => ({
          id: m.id, name: m.name, mapId: m.mapId, mode: m.mode,
          timeLimit: Math.round(m.timeLimit / 60), scoreLimit: m.scoreLimit,
          status: m.status, players: m.players.size, round: m.round, host: m.host,
        })),
      })
      return
    }

    if (req.method === 'POST') {
      let data
      try { data = JSON.parse(await readBody(req)) } catch (e) { sendJson(res, 400, { error: 'Bad request body: ' + e.message }); return }

      if (pathname === '/api/match') {
        const action = String(data.action || 'create')
        if (action === 'create') {
          const mapId = String(data.mapId || DEFAULT_MAP)
          if (!getMap(mapId)) { sendJson(res, 400, { error: 'Unknown map ' + mapId }); return }
          const mid = 'admin' + (nextId++) + Math.floor(Math.random() * 9000 + 1000)
          const m = makeMatch(mid, String(data.name || 'Admin match').slice(0, 24), {
            mapId,
            mode: data.mode === 'tdm' ? 'tdm' : 'dm',
            timeLimit: Math.max(1, Math.min(60, parseInt(data.timeLimit) || 10)),
            scoreLimit: Math.max(5, Math.min(500, parseInt(data.scoreLimit) || 50)),
          })
          m.status = 'live'
          matches.set(mid, m)
          broadcastMatchList()
          sendJson(res, 200, { ok: true, id: mid })
          return
        }

        const m = matches.get(String(data.id))
        if (!m) { sendJson(res, 404, { error: 'Match not found' }); return }

        if (action === 'update') {
          let changed = false
          let mapChanged = false
          if (data.name) { m.name = String(data.name).slice(0, 24); changed = true }
          if (data.mapId && getMap(data.mapId) && m.mapId !== data.mapId) {
            m.mapId = data.mapId
            changed = true
            mapChanged = true
            // reset everyone to fresh spawns on the new map
            resetRound(m)
            broadcast({ type: 'chat', name: 'Server', text: `Map changed to ${(getMap(m.mapId) || {}).name || m.mapId} — respawning everyone.`, team: null }, null, m)
            for (const pl of m.players.values()) {
              if (pl.ws.readyState === 1) {
                const spawn = playerSpawn(m, pl.team, getMap(m.mapId))
                pl.ws.send(JSON.stringify({
                  type: 'mapChange',
                  map: getMap(m.mapId),
                  match: matchPayload(m),
                  spawn,
                  team: pl.team,
                  players: Array.from(m.players.values()).filter(x => x.id !== pl.id).map(playerPayload),
                }))
              }
            }
          }
          if (data.mode) m.mode = data.mode === 'tdm' ? 'tdm' : 'dm'
          if (data.timeLimit) m.timeLimit = Math.max(1, Math.min(60, parseInt(data.timeLimit) || 10)) * 60
          if (data.scoreLimit) m.scoreLimit = Math.max(5, Math.min(500, parseInt(data.scoreLimit) || 50))
          if (changed) broadcastMatchList()
          if (m.players.size > 0 && !mapChanged) sendMatchTick(m)
          sendJson(res, 200, { ok: true, mapChanged })
          return
        }

        if (action === 'restart') {
          if (m.players.size > 0) broadcast({ type: 'chat', name: 'Server', text: 'Match restarted by admin.', team: null }, null, m)
          resetRound(m)
          sendJson(res, 200, { ok: true })
          return
        }

        if (action === 'end') {
          if (m.status === 'live' && m.players.size > 0) endMatch(m)
          sendJson(res, 200, { ok: true })
          return
        }

        if (action === 'delete') {
          if (m.id === 'main') { sendJson(res, 400, { error: 'Cannot delete the default match.' }); return }
          if (m.players.size > 0) { sendJson(res, 400, { error: 'Match still has players.' }); return }
          matches.delete(m.id)
          broadcastMatchList()
          sendJson(res, 200, { ok: true })
          return
        }

        sendJson(res, 400, { error: 'Unknown action' })
        return
      }

      if (pathname === '/api/map') {
        const action = String(data.action || 'upload')
        if (action === 'upload') {
          const result = registerServerMap(String(data.content || ''))
          if (result.error) { sendJson(res, 400, { error: result.error }); return }
          broadcastMatchList()
          sendJson(res, 200, result)
          return
        }
        if (action === 'delete') {
          const id = String(data.id || '')
          const def = getMap(id)
          if (!def) { sendJson(res, 404, { error: 'Unknown map' }); return }
          if (def.source === 'built-in') { sendJson(res, 400, { error: 'Cannot delete a built-in map.' }); return }
          unregister(id)
          try {
            const f = path.join(SERVER_MAPS_DIR, id + '.json')
            if (fs.existsSync(f)) fs.unlinkSync(f)
          } catch { /* ignore */ }
          broadcastMatchList()
          sendJson(res, 200, { ok: true })
          return
        }
        sendJson(res, 400, { error: 'Unknown action' })
        return
      }

      if (pathname === '/api/ui') {
        if (typeof data.name === 'string' && data.name) serverSettings.name = String(data.name).slice(0, 40)
        if (typeof data.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.accent)) serverSettings.accent = data.accent
        if (typeof data.message === 'string') serverSettings.message = String(data.message).slice(0, 200)
        if (typeof data.password === 'string') serverSettings.password = data.password.slice(0, 32)
        broadcast({ type: 'uiTheme', accent: serverSettings.accent, serverName: serverSettings.name, message: serverSettings.message })
        sendJson(res, 200, { ok: true, accent: serverSettings.accent, name: serverSettings.name, hasPassword: !!serverSettings.password })
        return
      }

      if (pathname === '/api/password') {
        serverSettings.password = String(data.password || '').slice(0, 32)
        broadcast({ type: 'serverConfig', hasPassword: !!serverSettings.password })
        sendJson(res, 200, { ok: true, hasPassword: !!serverSettings.password })
        return
      }

      sendJson(res, 404, { error: 'Unknown API endpoint' })
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

// Per-second match timer
setInterval(() => {
  for (const m of matches.values()) {
    if (m.players.size === 0) continue
    m.elapsed += 1
    sendMatchTick(m)
    const limit = m.scoreLimit
    const scoreOver = m.mode === 'tdm' ? (m.teamScores.T >= limit || m.teamScores.CT >= limit)
      : Array.from(m.players.values()).some(p => p.kills >= limit)
    if (scoreOver || m.elapsed >= m.timeLimit) {
      if (m.status === 'live') endMatch(m)
    }
  }
}, 1000)

httpServer.listen(PORT, () => {
  const nets = os.networkInterfaces()
  const addrs = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address)
    }
  }
  console.log(`Arena FPS LAN server listening on port ${PORT}`)
  console.log(`Admin GUI:       http://localhost:${PORT}/   (or your LAN IP, same port)`)
  console.log(`Admin login:     user "${ADMIN_USER}"  password "${ADMIN_PASSWORD}"${process.env.ADMIN_PASSWORD ? '' : '  (auto-generated — set ADMIN_PASSWORD to pick your own)'}`)
  console.log(`Share one of these with players:`)
  for (const a of addrs) console.log(`  ws://${a}:${PORT}`)
  if (addrs.length === 0) console.log(`  (no LAN interface detected — try ws://localhost:${PORT} for same-machine testing)`)
})

// ---------------------------------------------------------------------------
// Admin console page
// ---------------------------------------------------------------------------
const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Server Admin</title>
<style>
  :root{--accent:#ff5252;--panel:rgba(16,19,25,.6);--stroke:rgba(255,255,255,.09);--text:#eef1f6;--muted:#98a1b0}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:radial-gradient(circle at 50% 0%, #1d2430, #07090d 70%);min-height:100vh;color:var(--text);font-family:'Segoe UI',Arial,sans-serif;padding:28px}
  .glass{background:var(--panel);backdrop-filter:blur(20px);border:1px solid var(--stroke);border-radius:16px;padding:20px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  h1{font-size:22px;letter-spacing:1px;text-transform:uppercase;color:#fff}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  header .badge{color:var(--muted);font-size:12px}
  h2{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}
  @media(max-width:900px){.grid{grid-template-columns:1fr}}
  .stats{display:flex;gap:18px;margin:8px 0 0}
  .stat b{display:block;font-size:26px;color:var(--accent)}
  .stat span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
  label{display:block;font-size:11px;color:var(--muted);margin:10px 0 4px;text-transform:uppercase;letter-spacing:1px}
  input,select{width:100%;padding:8px 10px;background:rgba(255,255,255,.05);border:1px solid var(--stroke);border-radius:8px;color:var(--text);outline:none}
  input:focus,select:focus{border-color:var(--accent)}
  input[type=color]{height:38px;padding:2px}
  button{background:rgba(255,255,255,.07);border:1px solid var(--stroke);border-radius:8px;color:var(--text);padding:8px 14px;cursor:pointer;font-size:12px;transition:.15s}
  button:hover{background:rgba(255,255,255,.14);border-color:var(--accent)}
  button.primary{background:var(--accent);border-color:var(--accent);color:#0b0d12;font-weight:700}
  .cols{display:flex;gap:8px;flex-wrap:wrap}
  .match{background:rgba(255,255,255,.035);border:1px solid var(--stroke);border-radius:12px;padding:14px;margin-bottom:12px}
  .match h3{font-size:15px;margin-bottom:8px;color:#fff}
  .match .meta{color:var(--muted);font-size:12px;margin-bottom:10px}
  .match .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .mini{font-size:11px;padding:5px 9px}
  .tag{display:inline-block;font-size:10px;padding:2px 8px;border-radius:6px;margin-left:6px;vertical-align:middle}
  .tag.live{background:rgba(76,175,80,.18);color:#7fe37f}
  .tag.lobby{background:rgba(255,207,107,.15);color:var(--amber,#ffcf6b)}
  .tag.ending{background:rgba(255,82,82,.18);color:#ff7a6b}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--stroke)}
  th{color:var(--muted);font-weight:500}
  .muted{color:var(--muted)}
  .err{color:#ff7a6b;font-size:12px;min-height:16px;margin-top:6px}
  .ok{color:#7fe37f;font-size:12px;min-height:16px;margin-top:6px}
  .row{display:flex;gap:8px;align-items:end}
  .row>*{flex:1}
  .row button{flex:0 0 auto}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  @media(max-width:700px){.grid4{grid-template-columns:repeat(2,1fr)}}
</style></head>
<body>
  <header class="glass" style="padding:16px 24px">
    <div>
      <h1>ARENA FPS — Server Admin</h1>
      <div id="serverName" class="badge"></div>
    </div>
    <div class="stats">
      <div class="stat"><b id="sPlayers">0</b><span>Players</span></div>
      <div class="stat"><b id="sMatches">0</b><span>Matches</span></div>
      <div class="stat"><b id="sMaps">0</b><span>Maps</span></div>
      <div class="stat"><b id="sUptime">0s</b><span>Uptime</span></div>
      <div class="stat"><b id="sMemory">-</b><span>Memory</span></div>
    </div>
  </header>

  <div class="grid">
    <div class="glass">
      <h2>Matches</h2>
      <div id="matchOpMsg" class="ok"></div>
      <div id="matches"></div>
      <hr style="border-color:var(--stroke);margin:14px 0"/>
      <h2>Create match</h2>
      <div>
        <label>Name</label><input id="createName" value="Kill House"/>
        <div class="grid4">
          <div><label>Map</label><select id="createMap"></select></div>
          <div><label>Mode</label><select id="createMode"><option value="dm">FFA</option><option value="tdm">Team Deathmatch</option></select></div>
          <div><label>Time (min)</label><input id="createTime" type="number" value="10" min="1"/></div>
          <div><label>Score limit</label><input id="createScore" type="number" value="50" min="5"/></div>
        </div>
        <div class="cols" style="margin-top:10px"><button class="primary" id="btnCreate">Create match</button></div>
        <div id="createMsg" class="ok"></div>
      </div>
    </div>

    <div>
      <div class="glass" style="margin-bottom:16px">
        <h2>Custom UI</h2>
        <label>Server name</label><input id="uiName" maxlength="40"/>
        <label>Accent color (sent to every client)</label><input id="uiAccent" type="color" value="#ff5252"/>
        <label>Welcome message (chat, sent to everyone)</label><input id="uiMessage" maxlength="200" placeholder="e.g. Welcome to our weekend fragging night!"/>
        <label>Server password (blank = no password)</label><input id="uiPassword" maxlength="32" placeholder="Leave empty to allow any player"/>
        <div id="pwdState" class="muted" style="font-size:11px;margin-top:4px"></div>
        <div class="cols" style="margin-top:10px"><button class="primary" id="btnUi">Apply UI theme</button></div>
        <div id="uiMsg" class="ok"></div>
      </div>

      <div class="glass">
        <h2>Players</h2>
        <table><thead><tr><th>Name</th><th>Team</th><th>K/D</th><th>Match</th></tr></thead><tbody id="players"></tbody></table>
      </div>

      <div class="glass" style="margin-top:16px">
        <h2>Maps</h2>
        <table><thead><tr><th>Map</th><th>Source</th><th></th></tr></thead><tbody id="maps"></tbody></table>
        <label style="margin-top:12px">Upload a custom map (.json)</label>
        <input id="mapFile" type="file" accept=".json,application/json"/>
        <button id="btnUpload" style="margin-top:8px" class="primary">Upload map</button>
        <div id="mapMsg" class="ok"></div>
      </div>
    </div>
  </div>

<script>
let STATE = null;
async function req(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function refresh() {
  try {
    const s = await (await fetch('/api/state')).json();
    STATE = s;
    document.getElementById('serverName').textContent = s.name + ' · admin console';
    document.getElementById('sPlayers').textContent = s.players.length;
    document.getElementById('sMatches').textContent = s.matches.length;
    document.getElementById('sMaps').textContent = s.maps.length;
    if (s.uptime != null) {
      const h = Math.floor(s.uptime / 3600), m = Math.floor((s.uptime % 3600) / 60), sec = s.uptime % 60;
      document.getElementById('sUptime').textContent = (h ? h + 'h ' : '') + m + 'm ' + sec + 's';
    }
    if (s.memoryMB != null) document.getElementById('sMemory').textContent = s.memoryMB + ' MB';
    document.getElementById('uiName').value = s.name;
    document.getElementById('uiAccent').value = s.accent;
    document.getElementById('uiMessage').value = s.message;
    document.documentElement.style.setProperty('--accent', s.accent || '#ff5252');
    const pwdEl = document.getElementById('pwdState');
    if (pwdEl) pwdEl.textContent = s.hasPassword ? 'Password protected — players must enter a password to join.' : 'No password — anyone can join.';

    const mapOpts = s.maps.map(m => '<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');
    const cm = document.getElementById('createMap');
    if (cm.innerHTML !== mapOpts || !cm.innerHTML) cm.innerHTML = mapOpts;

    const mm = document.getElementById('matches');
    mm.innerHTML = s.matches.map(m => {
      const liveCls = m.status === 'live' ? 'live' : m.status === 'ending' ? 'ending' : 'lobby';
      return '<div class="match" data-id="'+esc(m.id)+'">'+
        '<h3>'+esc(m.name)+' <span class="tag '+liveCls+'">'+esc(m.status)+'</span><span class="tag">'+m.players+' players</span></h3>'+
        '<div class="meta">round '+m.round+' · '+esc(m.mapId)+' · '+(m.mode==='tdm'?'Team Deathmatch':'Free For All')+' · '+(m.timeLimit||0)+' min · score limit '+(m.scoreLimit||0)+'</div>'+
        '<div class="grid4">'+
          '<div><label>Map</label><select class="adMap">'+mapOpts+'</select></div>'+
          '<div><label>Mode</label><select class="adMode"><option value="dm"'+(m.mode==='dm'?' selected':'')+'>FFA</option><option value="tdm"'+(m.mode==='tdm'?' selected':'')+'>TDM</option></select></div>'+
          '<div><label>Time</label><input class="adTime" type="number" value="'+(m.timeLimit||10)+'" min="1"/></div>'+
          '<div><label>Score</label><input class="adScore" type="number" value="'+(m.scoreLimit||50)+'" min="5"/></div>'+
        '</div>'+
        '<div class="actions">'+
          '<button class="mini primary act-apply">Apply</button>'+
          '<button class="mini act-restart">Restart</button>'+
          '<button class="mini act-end">End now</button>'+
          '<button class="mini act-delete">Delete</button>'+
        '</div></div>';
    }).join('') || '<div class="muted">No matches yet.</div>';

    const pbody = document.getElementById('players');
    pbody.innerHTML = s.players.map(p => '<tr><td>'+esc(p.name)+'</td><td>'+(p.team||'FFA')+'</td><td>'+p.kills+'/'+p.deaths+'</td><td>'+esc(p.matchId||'')+'</td></tr>').join('') ||
      '<tr><td colspan="4" class="muted">Nobody online right now.</td></tr>';

    const mbody = document.getElementById('maps');
    mbody.innerHTML = s.maps.map(m => {
      const deletable = m.source !== 'built-in';
      return '<tr><td>'+esc(m.name)+' <span class="muted">('+esc(m.id)+')</span></td><td>'+esc(m.source)+'</td>'+
        '<td>'+(deletable ? '<button class="mini map-del" data-id="'+esc(m.id)+'">Delete</button>' : '')+'</td></tr>';
    }).join('');
    document.querySelectorAll('.map-del').forEach(b => b.onclick = async () => {
      const r = await req('/api/map', { action: 'delete', id: b.dataset.id });
      setMsg('mapMsg', r);
      refresh();
    });

document.querySelectorAll('.match').forEach(row => {
          const id = row.dataset.id;
          const selMap = row.querySelector('.adMap'); selMap.value = s.matches.find(x=>x.id===id).mapId;
          row.querySelector('.act-apply').onclick = async () => {
            const r = await req('/api/match', { action: 'update', id,
              mapId: selMap.value, mode: row.querySelector('.adMode').value,
              timeLimit: row.querySelector('.adTime').value, scoreLimit: row.querySelector('.adScore').value });
            setMsg('matchOpMsg', r); refresh();
          };
          row.querySelector('.act-restart').onclick = async () => { const r = await req('/api/match',{action:'restart',id}); setMsg('matchOpMsg', r); refresh(); };
          row.querySelector('.act-end').onclick = async () => { const r = await req('/api/match',{action:'end',id}); setMsg('matchOpMsg', r); refresh(); };
          row.querySelector('.act-delete').onclick = async () => { const r = await req('/api/match',{action:'delete',id}); setMsg('matchOpMsg', r); refresh(); };
        });
  } catch (e) { console.error(e); }
}
function setMsg(id, r) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = r && r.error ? r.error : (r && r.mapChanged ? 'Applied — map changed, players will reload.' : 'Done.');
  el.textContent = text;
  el.className = r && r.error ? 'err' : 'ok';
  setTimeout(() => el.textContent = '', 3500);
}
document.getElementById('btnCreate').onclick = async () => {
  const r = await req('/api/match', { action: 'create',
    name: document.getElementById('createName').value,
    mapId: document.getElementById('createMap').value,
    mode: document.getElementById('createMode').value,
    timeLimit: document.getElementById('createTime').value,
    scoreLimit: document.getElementById('createScore').value });
  setMsg('createMsg', r); refresh();
};
document.getElementById('btnUi').onclick = async () => {
  const r = await req('/api/ui', {
    name: document.getElementById('uiName').value,
    accent: document.getElementById('uiAccent').value,
    message: document.getElementById('uiMessage').value,
    password: document.getElementById('uiPassword').value });
  setMsg('uiMsg', r); refresh();
};
document.getElementById('btnUpload').onclick = async () => {
  const f = document.getElementById('mapFile').files[0];
  if (!f) return;
  const content = await f.text();
  const r = await req('/api/map', { action: 'upload', content });
  setMsg('mapMsg', r); refresh();
};
refresh();
setInterval(refresh, 2000);
</script>
</body></html>`