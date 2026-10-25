import './style.css'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { buildMap, parseMapText } from './map.js'
import { register, listMaps, getMap } from './maps/index.js'
import { WeaponSystem, WEAPON_DEFS, SLOT_ORDER, ADS_FOV } from './weapons.js'
import { RemotePlayer, BODY_RADIUS } from './player.js'
import { Effects } from './effects.js'
import { SoundFX } from './sounds.js'
import { NetworkClient } from './network.js'
import * as UI from './ui.js'
import { initSettingsUI } from './settings.js'
import { TouchControls } from './TouchControls.js'
import { HUDCustomizer } from './HUDCustomizer.js'
import { Environment } from './env.js'
import { VoiceChat } from './voice.js'

// Server-less static build for drag-and-drop hosts (Vercel/Netlify/Cloudflare):
// set to true by vite-static.config.js via the __HOSTED__ define.
const HOSTED = typeof __HOSTED__ !== 'undefined' ? !!__HOSTED__ : false

UI.buildStaticDOM()
UI.initMenuTabs()
hideLANUIForHosted()
UI.showMenu(true)

const settingsAPI = initSettingsUI((s) => applySettings(s))
let settings = settingsAPI.settings

document.getElementById('settings-reset-btn').addEventListener('click', () => {
  sfx.ensure(); sfx.uiClick()
  settingsAPI.reset()
})

// ---------------------------------------------------------------------------
// Global game state
// ---------------------------------------------------------------------------
let scene, camera, renderer, world, sunLight, ambientLight, hemiLight
let env = null
let playerMaterial, groundMaterial
let playerBody
let weaponSystem
let effects
let sfx = new SoundFX()
let colliderMeshes = []
let spawnPoints = []
let remotePlayers = new Map()
let remoteTargets = new Map()
let net = null
let netHandlersDone = false
let voice = null
let myId = null
let myName = 'Player'
let mode = 'solo'
let matchInfo = null
let myTeam = null
let inputSetup = false
let touchControls = null
let hudCustomizer = null
const isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0

let isPlaying = false
let isPaused = false
let mouseHeld = false
let leaderboardVisible = false
let localHealth = 100
let localAlive = true

let crouchToggle = false
let scoped = false
let baseFov = settings.fov
let currentFov = baseFov
let fpsFrames = 0
let fpsAcc = 0

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const camEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const recoilCur = { pitch: 0, yaw: 0 }
const swayInput = { x: 0, y: 0 }
const TouchSensitivityScale = 2.0
const moveState = { forward: false, backward: false, left: false, right: false, sprint: false, crouch: false }
const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
const stride = { acc: 0 }
let lastNetSend = 0
let prevVelY = 0

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function applySettings(s) {
  baseFov = s.fov
  sfx.setVolume(s.volume)
  UI.setFPSVisible(s.showFps)
  if (renderer) {
    const rr = { low: 0.75, medium: 1, high: Math.min(window.devicePixelRatio, 2), ultra: Math.min(window.devicePixelRatio, 3) }[s.quality] || 2
    renderer.setPixelRatio(rr)
    renderer.shadowMap.enabled = s.quality !== 'low'
    renderer.shadowMap.type = s.quality === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    if (sunLight) sunLight.castShadow = s.quality !== 'low'
  }
}

// ---------------------------------------------------------------------------
// Main menu wiring
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Main menu state
// ---------------------------------------------------------------------------
function hideLANUIForHosted() {
  if (!HOSTED) return
  const lanTab = document.querySelector('.menu-tab[data-mode="lan"]')
  if (lanTab) lanTab.style.display = 'none'
  const lanSec = document.querySelector('.mode-section[data-mode="lan"]')
  if (lanSec) lanSec.style.display = 'none'
  const note = document.querySelector('.menu-foot-note')
  if (note) note.style.display = 'none'
  const sub = document.querySelector('.subtitle')
  if (sub) sub.textContent = 'Solo practice & custom maps — static-hosting friendly'
}

function populateSoloMaps() {
  UI.populateMapSelect(listMaps(), 'dust2')
}
populateSoloMaps()

document.getElementById('play-btn').addEventListener('click', () => {
  sfx.ensure(); sfx.uiClick()
  const name = document.getElementById('name-input').value.trim() || 'Player'
  myName = name.slice(0, 16)
  mode = HOSTED ? 'solo' : UI.getSelectedMode()
  if (mode === 'solo') {
    startGame(null, getMap(UI.getSelectedMapId()))
  } else {
    const url = document.getElementById('server-input').value.trim()
    if (!url) { UI.setMenuStatus('Enter a server address.'); return }
    UI.setMenuStatus('Connecting...')
    connectLan(() => {
      net.send('join', { name: myName, match: UI.getSelectedMatchId(), password: getServerPassword() })
    })
  }
})

document.getElementById('refresh-matches').addEventListener('click', () => {
  sfx.ensure()
  const url = document.getElementById('server-input').value.trim()
  if (!url) { UI.setLanStatus('Enter a server address first.'); return }
  connectLan(() => {
    UI.setLanStatus('Refreshing matches…')
    net.send('getMapList')
  })
})

document.getElementById('create-btn').addEventListener('click', () => {
  sfx.ensure()
  const matchName = document.getElementById('create-name').value.trim() || 'Custom match'
  const url = document.getElementById('server-input').value.trim()
  if (!url) { UI.setCreateStatus('Enter a server address first.'); return }
  connectLan(() => {
    net.send('createMatch', {
      name: matchName.slice(0, 24),
      playerName: myName,
      map: document.getElementById('create-map').value || 'dust2',
      mode: document.getElementById('create-mode').value,
      timeLimit: Math.max(1, parseInt(document.getElementById('create-time').value) || 10),
      scoreLimit: Math.max(5, parseInt(document.getElementById('create-score').value) || 50),
      password: getServerPassword(),
    })
  })
})

document.getElementById('import-map-btn').addEventListener('click', () => {
  document.getElementById('import-map-input').click()
})
document.getElementById('import-map-input').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const parsed = parseMapText(String(reader.result))
    if (!parsed.def) { UI.setImportStatus(parsed.error || 'Could not read map.'); return }
    const def = register(parsed.def)
    if (!def) { UI.setImportStatus('Map needs a valid id.'); return }
    UI.populateMapSelect(listMaps(), def.id)
    UI.setImportStatus(`Imported ${def.name} — select it above.`)
  }
  reader.readAsText(file)
})

document.getElementById('resume-btn').addEventListener('click', () => {
  sfx.uiClick()
  setPaused(false)
  if (renderer && renderer.domElement) renderer.domElement.requestPointerLock()
})
document.getElementById('mute-btn').addEventListener('click', () => {
  audioMuted = !audioMuted
  sfx.setEnabled(!audioMuted)
  document.getElementById('mute-btn').textContent = audioMuted ? 'Unmute sound' : 'Mute sound'
})
document.getElementById('menu-btn').addEventListener('click', () => {
  location.reload()
})
let audioMuted = false

UI.bindSettingsButtons({
  onOpen: () => { sfx.ensure(); sfx.uiClick() },
})

// Voice-chat panel: reachable from the pause menu and via the B hotkey.
document.getElementById('voice-open-btn').addEventListener('click', () => {
  sfx.uiClick()
  openVoicePanel()
})

UI.bindVoiceControls({
  onMicToggle: () => { sfx.ensure(); if (voice) voice.toggleMic() },
  onOthersVolume: (v) => { if (voice) voice.setOthersVolume(v) },
  onPlayerMute: (id, muted) => { if (voice) voice.setPeerMuted(id, muted) },
  onPlayerVolume: (id, v) => { if (voice) voice.setPeerVolume(id, v) },
})

// Opens the voice panel and ensures the player list is current. Pauses the
// game first so the pointer is released and the panel is clickable.
function openVoicePanel() {
  if (isPlaying && !isPaused) { setPaused(true); document.exitPointerLock() }
  if (voice) refreshVoiceUI(true)
  UI.openVoicePanel(true)
}

// Shows or hides every voice control. Voice is LAN-only, so solo play hides
// them entirely rather than leaving dead buttons in the HUD and pause menu.
function setVoiceUIEnabled(enabled) {
  const hud = document.getElementById('voice-hud-btn')
  if (hud) hud.style.display = enabled ? '' : 'none'
  const open = document.getElementById('voice-open-btn')
  if (open) open.style.display = enabled ? '' : 'none'
  if (!enabled) UI.openVoicePanel(false)
}

function ensureVoice() {
  // A reconnect creates a new NetworkClient; rebuild the VoiceChat so its
  // signaling is bound to the live socket instead of the dead one.
  if (voice && voice.net !== net) { voice.dispose(); voice = null }
  if (voice) return voice
  if (mode !== 'lan' || !net) return null
  voice = new VoiceChat({
    net,
    getMyId: () => myId,
    getMyPos: () => (playerBody ? playerBody.position : null),
    getMyYaw: () => euler.y,
    getPeerPos: (id) => { const rp = remotePlayers.get(id); return rp && rp.group ? rp.group.position : null },
    getPeerName: (id) => { const rp = remotePlayers.get(id); return rp ? rp.name : String(id) },
    onPeersChanged: () => refreshVoiceUI(true),
    onStatus: (s) => UI.updateVoiceStatus(s),
  })
  return voice
}

function refreshVoiceUI(rebuildPlayers) {
  if (!voice) return
  const s = voice.getState()
  UI.updateVoiceStatus(s)
  if (rebuildPlayers) {
    UI.renderVoicePlayers(s.peers.map(p => ({ id: p.id, name: p.name, state: p.state, muted: p.muted, volume: p.volume })))
  }
}

// Reconciles the voice peer set against the authoritative player list.
function syncVoicePeers(playerList) {
  const v = ensureVoice()
  if (!v) return
  const ids = new Set()
  for (const pd of (playerList || [])) if (pd.id !== myId) ids.add(pd.id)
  for (const id of [...v.peers.keys()]) if (!ids.has(id)) v.peerLeft(id)
  for (const id of ids) v.peerJoined(id)
  refreshVoiceUI(true)
}

function setPaused(p) {
  isPaused = p
  UI.showPause(p)
  if (touchControls) touchControls[p ? 'hide' : 'show']()
  if (p) { setScope(false); UI.closeChat() }
}

function getServerPassword() {
  const el = document.getElementById('server-password')
  return el ? el.value.trim() : ''
}

// ---------------------------------------------------------------------------
// LAN connection
// ---------------------------------------------------------------------------
function connectLan(onOpen) {
  const url = document.getElementById('server-input').value.trim()
  if (!url) return
  if (net && net.connected) { if (onOpen) onOpen(); return }

  try {
    net = new NetworkClient(url)
  } catch (e) {
    UI.setMenuStatus('Could not connect: ' + e.message)
    UI.setLanStatus('Could not connect: ' + e.message)
    return
  }
  wireNetHandlers()

  net.on('open', () => {
    UI.setLanStatus('Connected — refreshing match list…')
    net.send('getMapList')
    if (onOpen) onOpen()
  })
  net.on('error', () => {
    UI.setMenuStatus('Connection error. Check the address and that the server is running.')
    UI.setLanStatus('Connection error. Check address & server.')
  })
  net.on('close', () => {
    UI.setConnStatus('Disconnected from server')
    if (voice) { voice.reset(); refreshVoiceUI(true) }
  })
}

function wireNetHandlers() {
  net.on('matchList', (msg) => {
    UI.renderMatchList(msg.matches || [], msg.selected)
    const maps = msg.maps || []
    const sel = document.getElementById('create-map')
    sel.innerHTML = maps.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
    let status = `Connected · ${maps.length} map(s), ${(msg.matches || []).length} match(es)`
    if (msg.ui && msg.ui.hasPassword) status += ' · <span style="color:var(--amber)">🔒 password-protected</span>'
    UI.setLanStatus(status)
    if (msg.ui && msg.ui.accent) {
      document.documentElement.style.setProperty('--accent', msg.ui.accent)
    }
  })

  net.on('reload', () => {
    setTimeout(() => location.reload(), 400)
  })

  net.on('init', (msg) => {
    myId = msg.id
    myTeam = msg.team || null
    matchInfo = msg.match || null
    startGame(msg, msg.map)
  })

  net.on('matchTick', (msg) => {
    if (matchInfo) matchInfo.elapsed = msg.elapsed
    const teamInfo = msg.teamScores ? `T ${msg.teamScores.T} : ${msg.teamScores.CT} CT` : ''
    UI.setMatchPanel(msg.name || (matchInfo && matchInfo.name), msg.timeLeft, teamInfo)
  })

  net.on('matchEnd', (msg) => {
    UI.showMatchEnd(msg)
    setTimeout(() => { if (document.getElementById('match-end-overlay').style.display === 'flex') UI.showMatchEnd(null) }, 5000)
  })

  net.on('playerJoined', (msg) => {
    if (scene) {
      const prev = remotePlayers.get(msg.id)
      if (prev) { prev.dispose(scene); remotePlayers.delete(msg.id); remoteTargets.delete(msg.id) }
    }
    const rp = new RemotePlayer(scene, msg.id, msg.name, msg.team)
    rp.updateTransform(msg.pos, 0)
    rp.setWeapon(msg.weapon || 'pistol')
    remotePlayers.set(msg.id, rp)
    remoteTargets.set(msg.id, { pos: msg.pos, rot: 0 })
    if (voice) voice.peerJoined(msg.id)
    UI.addKillFeed(`<b>${escapeHtml(msg.name)}</b> joined`, 'system')
  })

  net.on('playerLeft', (msg) => {
    const rp = remotePlayers.get(msg.id)
    if (rp) { rp.dispose(scene); remotePlayers.delete(msg.id); remoteTargets.delete(msg.id) }
    if (voice) voice.peerLeft(msg.id)
  })

  net.on('move', (msg) => {
    remoteTargets.set(msg.id, { pos: msg.pos, rot: msg.rot })
  })

  net.on('weapon', (msg) => {
    const rp = remotePlayers.get(msg.id)
    if (rp) rp.setWeapon(msg.weapon)
  })

  net.on('shot', (msg) => {
    if (!effects) return
    const from = new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z)
    const to = new THREE.Vector3(msg.point.x, msg.point.y, msg.point.z)
    effects.tracer(from, to, 0xffcf6b, 2.2)
  })

  net.on('health', (msg) => {
    if (msg.id === myId) {
      if (msg.health < localHealth && localAlive) {
        euler.x += (Math.random() - 0.5) * 0.02
        euler.y += (Math.random() - 0.5) * 0.02
        UI.flashDamage(0.6)
        if (msg.attackerPos) {
          const dx = msg.attackerPos.x - playerBody.position.x
          const dz = msg.attackerPos.z - playerBody.position.z
          UI.showDamageIndicator(Math.atan2(dx, dz) - euler.y)
        }
      }
      localHealth = msg.health
      setMyAlive(msg.alive)
      UI.updateHealthBar(localHealth / 100)
    } else {
      const rp = remotePlayers.get(msg.id)
      if (rp) {
        if (!rp.alive && msg.health > 0) rp.respawn(rp.group.position, rp.group.rotation.y)
        else rp.setHealth(msg.health)
      }
    }
  })

  net.on('death', (msg) => {
    const weaponName = (WEAPON_DEFS[msg.weapon] || {}).name || msg.weapon || ''
    const hs = msg.headshot ? '<span class="hs"> HEADSHOT</span>' : ''
    UI.addKillFeed(`<b style="color:#ffcf6b">${escapeHtml(msg.killerName)}</b> [${weaponName}] eliminated <b style="color:#ff8080">${escapeHtml(msg.victimName)}</b>${hs}`)
    if (msg.killerId === myId) {
      sfx.kill()
      UI.killConfirm()
      UI.flashDamage(0.5)
    }
    if (msg.victimId === myId) {
      setMyAlive(false)
      UI.showDeathOverlay(true, `Killed by ${msg.killerName}`)
      UI.deathFlash()
      sfx.death()
      if (msg.killerPos) {
        const dx = msg.killerPos.x - playerBody.position.x
        const dz = msg.killerPos.z - playerBody.position.z
        UI.showDamageIndicator(Math.atan2(dx, dz) - euler.y)
      }
      startDeathTimer(2.3)
    }
    const rp = remotePlayers.get(msg.victimId)
    if (rp) rp.setDead()
  })

  net.on('respawn', (msg) => {
    clearInterval(deathTimerInterval)
    if (document.getElementById('death-timer')) document.getElementById('death-timer').textContent = '2.3'
    playerBody.position.set(msg.pos.x, msg.pos.y, msg.pos.z)
    playerBody.velocity.set(0, 0, 0)
    localHealth = 100
    setMyAlive(true)
    UI.updateHealthBar(1)
    UI.showDeathOverlay(false)
  })

  net.on('mapChange', (msg) => {
    if (!msg.map) return
    matchInfo = msg.match || matchInfo
    myTeam = msg.team || myTeam || null
    UI.setTeamTag(myTeam === 'CT' ? 'CT' : myTeam === 'T' ? 'T' : '')
    UI.addChatMessage('Server', `Map switched to ${msg.map.name || msg.map.id}`, 'system')
    UI.showDeathOverlay(false)
    clearInterval(deathTimerInterval)
    if (document.getElementById('death-timer')) document.getElementById('death-timer').textContent = '2.3'
    localHealth = 100
    setMyAlive(true)
    UI.updateHealthBar(1)
    buildWorld(msg.map, msg.spawn || null)
    for (const pd of (msg.players || [])) {
      const rp = new RemotePlayer(scene, pd.id, pd.name, pd.team)
      rp.updateTransform(pd.pos, pd.rot || 0)
      rp.setWeapon(pd.weapon || 'pistol')
      rp.setHealth(pd.health)
      if (!pd.alive) rp.setDead()
      remotePlayers.set(pd.id, rp)
      remoteTargets.set(pd.id, { pos: pd.pos, rot: pd.rot || 0 })
    }
    syncVoicePeers(msg.players)
    UI.setMatchPanel(msg.match && msg.match.name || (matchInfo && matchInfo.name), null, myTeam && myTeam !== 'none' ? (myTeam === 'CT' ? 'CT' : 'T') : '')
  })

  net.on('leaderboard', (msg) => {
    const rows = msg.players.map(p => ({ name: p.name, kills: p.kills, deaths: p.deaths, team: p.team, self: p.id === myId }))
    UI.updateLeaderboard(rows)
  })

  net.on('chat', (msg) => {
    const cls = msg.team === 'CT' ? 'ct' : msg.team === 'T' ? 't' : ''
    UI.addChatMessage(msg.name, msg.text, cls)
  })

  net.on('teamChanged', (msg) => {
    myTeam = msg.team || null
    UI.setTeamTag(myTeam === 'CT' ? 'CT' : myTeam === 'T' ? 'T' : '')
    UI.addChatMessage('Server', `You are now on team ${myTeam || 'FFA'}`, 'system')
  })

  net.on('uiTheme', (msg) => {
    const s = { ...settings }
    if (msg.accent) s.accent = msg.accent
    const root = document.documentElement
    root.style.setProperty('--accent', msg.accent || '#ff5252')
    if (msg.message) UI.addChatMessage('Server', msg.message, 'system')
  })

  net.on('joinError', (msg) => {
    UI.setMenuStatus(msg.error || 'Could not join the server.')
    UI.setLanStatus(msg.error || 'Could not join the server.')
  })

  net.on('serverConfig', (msg) => {
    if (!msg.hasPassword) return
    UI.setLanStatus('This server is password protected — check the "Server password" field.')
  })
}

function setMyAlive(alive) {
  localAlive = alive
}

let deathTimerInterval = null
function startDeathTimer(seconds) {
  clearInterval(deathTimerInterval)
  let t = seconds
  UI.setDeathTimer(t)
  deathTimerInterval = setInterval(() => {
    t = Math.max(0, t - 0.1)
    if (t <= 0) { clearInterval(deathTimerInterval); return }
    UI.setDeathTimer(t)
  }, 100)
}

// ---------------------------------------------------------------------------
// Game bootstrap
// ---------------------------------------------------------------------------
function startGame(initMsg, mapDef) {
  UI.showMenu(false)
  UI.showHUD(true)
  isPlaying = true
  UI.setMatchPanel(matchInfo ? matchInfo.name : 'Solo', null, null)
  UI.setTeamTag(myTeam === 'CT' ? 'CT' : myTeam === 'T' ? 'T' : '')
  UI.setConnStatus(mode === 'lan' ? `Connected as ${myName}` : `Solo — ${myName}`)
  setVoiceUIEnabled(mode === 'lan')

  const spawn = initMsg && initMsg.spawn ? initMsg.spawn : null
  buildWorld(mapDef, spawn)

  if (!inputSetup) {
    setupInput()
    window.addEventListener('resize', onResize)
    inputSetup = true
  }

  if (!hudCustomizer) {
    hudCustomizer = new HUDCustomizer()
    wireHUDCustomizer()
  }

  if (isTouchDevice && !touchControls) {
    initTouchControls()
  }

  // Spawn the players that were already in the match server-side.
  if (initMsg && Array.isArray(initMsg.players)) {
    for (const pd of initMsg.players) {
      if (pd.id === myId) continue
      const rp = new RemotePlayer(scene, pd.id, pd.name, pd.team)
      rp.updateTransform(pd.pos, pd.rot || 0)
      rp.setWeapon(pd.weapon || 'pistol')
      rp.setHealth(pd.health)
      if (!pd.alive) rp.setDead()
      remotePlayers.set(pd.id, rp)
      remoteTargets.set(pd.id, { pos: pd.pos, rot: pd.rot || 0 })
    }
  }

  // Voice chat is LAN-only: create the VoiceChat and register the players that
  // were already in the match before we joined.
  if (mode === 'lan') syncVoicePeers(initMsg && initMsg.players)

  animate()
}

function teardownWorld() {
  if (env) { env.dispose(); env = null }
  for (const rp of remotePlayers.values()) if (rp.dispose) rp.dispose(scene)
  remotePlayers.clear()
  remoteTargets.clear()
  if (effects) { effects.dispose(); effects = null }
  if (weaponSystem) { weaponSystem.dispose(); weaponSystem = null }
  if (scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => { if (m && m.dispose) m.dispose() })
        else if (o.material.dispose) o.material.dispose()
      }
    })
    scene = null
  }
  if (world) {
    for (const b of [...world.bodies]) world.removeBody(b)
    world = null
  }
  colliderMeshes = []
  spawnPoints = []
  playerBody = null
}

// Builds a fresh scene + physics world for a map definition. If `requestedSpawn`
// is given it's used for the player body, otherwise a map-appropriate spawn is
// picked (random for FFA, team spawn for TDM).
function buildWorld(mapDef, requestedSpawn) {
  const prevWeapon = weaponSystem ? weaponSystem.current : null
  if (scene) teardownWorld()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(mapDef.sky)
  scene.fog = new THREE.Fog(mapDef.fog.color, mapDef.fog.near, mapDef.fog.far)

  world = new CANNON.World()
  world.gravity.set(0, -18, 0)
  groundMaterial = new CANNON.Material('ground')
  playerMaterial = new CANNON.Material('player')
  world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, playerMaterial, { friction: 0.0, restitution: 0.0 }))

  const sizes = { width: window.innerWidth, height: window.innerHeight }
  camera = new THREE.PerspectiveCamera(baseFov, sizes.width / sizes.height, 0.1, 1000)
  // The camera must be in the scene graph so its children (the first-person
  // weapon viewmodels) render too.
  scene.add(camera)

  const canvas = document.querySelector('#webgl')
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  applySettings(settings)

  ambientLight = new THREE.AmbientLight(mapDef.light.ambient, mapDef.light.ambientIntensity)
  scene.add(ambientLight)
  const sun = mapDef.light.sun
  sunLight = new THREE.DirectionalLight(sun.color, sun.intensity)
  sunLight.position.set(sun.x, sun.y, sun.z)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(2048, 2048)
  const sc = 130
  sunLight.shadow.camera.left = -sc
  sunLight.shadow.camera.right = sc
  sunLight.shadow.camera.top = sc
  sunLight.shadow.camera.bottom = -sc
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 420
  sunLight.shadow.bias = -0.0004
  scene.add(sunLight)
  scene.add(sunLight.target)
  hemiLight = new THREE.HemisphereLight(0x93b3d8, 0x2a2118, 0.35)
  scene.add(hemiLight)

  effects = new Effects(scene)

  const map = buildMap(scene, world, groundMaterial, mapDef)
  colliderMeshes = map.colliderMeshes
  spawnPoints = map.spawnPoints

  env = new Environment(scene, {
    sun: sunLight,
    ambient: ambientLight,
    hemi: hemiLight,
    camera,
    base: {
      skyH: mapDef.sky,
      fogH: mapDef.fog.color,
      fogNear: mapDef.fog.near,
      fogFar: mapDef.fog.far,
      sunH: mapDef.light.sun.color,
      sunI: mapDef.light.sun.intensity,
      ambI: mapDef.light.ambientIntensity,
    },
  })

  const spawn = requestedSpawn || selectSpawn(mapDef, myTeam)
  playerBody = new CANNON.Body({
    mass: 10,
    shape: new CANNON.Sphere(BODY_RADIUS),
    position: new CANNON.Vec3(spawn.x, spawn.y, spawn.z),
    fixedRotation: true,
    material: playerMaterial,
  })
  world.addBody(playerBody)

  weaponSystem = new WeaponSystem(camera, { scene, effects, sfx })
  const wid = prevWeapon && WEAPON_DEFS[prevWeapon] ? prevWeapon : 'pistol'
  weaponSystem.setSlot(wid)
  onWeaponChanged(wid)

  if (mode === 'solo') {
    spawnDummies(spawnPoints)
  }
}

// Matches the server's spawn rules: fixed team areas in TDM, random otherwise.
function selectSpawn(mapDef, team) {
  const def = mapDef
  if (!def) return { x: 0, y: 2, z: 0 }
  if (matchInfo && matchInfo.mode === 'tdm' && team && def.teams && def.teams[team]) {
    const arr = def.teams[team]
    return arr[Math.floor(Math.random() * arr.length)] || { x: 0, y: 2, z: 0 }
  }
  const arr = def.spawns || []
  return arr[Math.floor(Math.random() * arr.length)] || { x: 0, y: 2, z: 0 }
}

// ---------------------------------------------------------------------------
// Solo practice dummies
// ---------------------------------------------------------------------------
function spawnDummies(points) {
  const usable = points.slice(1)
  const widz = ['ak', 'smg', 'shotgun', 'awp', 'lmg', 'pistol']
  usable.slice(0, 10).forEach((p, i) => {
    const dummy = new RemotePlayer(scene, `dummy-${i}`, `Target ${i + 1}`, 'none')
    dummy.updateTransform({ ...p, y: BODY_RADIUS }, Math.random() * Math.PI * 2)
    dummy.setWeapon(widz[Math.floor(Math.random() * widz.length)])
    dummy.setHealth(100)
    remotePlayers.set(dummy.id, dummy)
  })
}

function respawnDummy(dummy) {
  setTimeout(() => {
    if (!remotePlayers.has(dummy.id)) return
    const rand = Math.random() * Math.PI * 2
    dummy.respawn(
      { x: (Math.random() - 0.5) * 100, y: BODY_RADIUS, z: (Math.random() - 0.5) * 90 },
      rand
    )
  }, 2200)
}

// ---------------------------------------------------------------------------
// Weapon / scope helpers
// ---------------------------------------------------------------------------
function onWeaponChanged(wid) {
  UI.setActiveSlot(SLOT_ORDER.indexOf(wid) + 1)
  if (mode === 'lan' && net) net.send('weapon', { weapon: wid })
  if (scoped && ADS_FOV[wid] == null) setScope(false)
}

function setScope(on) {
  scoped = on
  weaponSystem.setAds(on)
  if (on) { sfx.ensure(); sfx.zoom(0) } else { sfx.zoom(1) }
  if (!on) UI.showScope(false)
}

function switchTeam() {
  if (mode !== 'lan' || !net) return
  const want = myTeam === 'T' ? 'CT' : 'T'
  net.send('switchTeam', { team: want })
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function sendChat(text) {
  const t = text.trim()
  if (!t) { UI.closeChat(); return }
  if (t.startsWith('/')) {
    runChatCommand(t)
    UI.closeChat()
    return
  }
  if (mode === 'lan' && net) {
    net.send('chat', { name: myName, text: t.slice(0, 140), team: myTeam })
  } else {
    UI.addChatMessage(myName, t, myTeam === 'CT' ? 'ct' : myTeam === 'T' ? 't' : '')
  }
  UI.closeChat()
}

function runChatCommand(t) {
  const [cmd, arg] = t.split(/\s+/)
  switch (cmd.toLowerCase()) {
    case '/team':
    case '/t': {
      if (!arg) { UI.addChatMessage('Cmd', 'Usage: /team <T|CT> — or press F', 'system'); return }
      const want = arg.toUpperCase() === 'CT' ? 'CT' : 'T'
      if (mode !== 'lan' || !net) { UI.addChatMessage('Cmd', 'Teams are only available on a LAN server.', 'system'); return }
      net.send('switchTeam', { team: want })
      break
    }
    case '/help':
      UI.addChatMessage('Cmd', '/team <T|CT> · /help — type F to swap teams in TDM', 'system')
      break
    default:
      UI.addChatMessage('Cmd', `Unknown command ${cmd} — /help`, 'system')
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function setupInput() {
  const canvas = renderer.domElement

  canvas.addEventListener('click', () => {
    sfx.ensure()
    // Touch devices drive the camera with the on-screen joystick / look zones;
    // pointer lock isn't supported there and would swallow taps.
    if (isTouchDevice) return
    if (hudCustomizer && hudCustomizer.isEditing) return
    if (isPlaying && !isPaused) canvas.requestPointerLock()
  })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  document.addEventListener('pointerlockchange', () => {
    if (hudCustomizer && hudCustomizer.isEditing) return
    if (document.pointerLockElement !== canvas && isPlaying && !isPaused) {
      setPaused(true)
    }
  })

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return
    const s = 0.0022 * settings.sensitivity
    const iy = settings.invertY ? -1 : 1
    euler.y -= e.movementX * s
    euler.x -= e.movementY * s * iy
    euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.x))
    swayInput.x += e.movementX * 0.004
    swayInput.y += e.movementY * 0.004
  })

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return
    sfx.ensure()
    if (e.button === 0) {
      mouseHeld = true
      attemptFire()
    } else if (e.button === 2 && ADS_FOV[weaponSystem.current] != null && !isCrouched()) {
      setScope(true)
    }
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseHeld = false
    if (e.button === 2 && scoped) setScope(false)
  })

  window.addEventListener('wheel', (e) => {
    if (!isPlaying || isPaused || document.pointerLockElement !== canvas || UI.isChatOpen()) return
    weaponSystem.cycle(e.deltaY > 0 ? 1 : -1)
    onWeaponChanged(weaponSystem.current)
  }, { passive: true })

  window.addEventListener('keydown', (e) => {
    if (UI.isChatOpen()) {
      if (e.code === 'Enter') {
        e.preventDefault()
        const input = document.getElementById('chat-input')
        sendChat(input.value)
      } else if (e.code === 'Escape') {
        e.preventDefault()
        UI.closeChat()
      }
      return
    }

    if (e.code === 'Escape') {
      if (isPlaying && !isPaused) {
        setPaused(true)
        document.exitPointerLock()
      }
      return
    }

    // Voice panel toggle: opens (pausing the game) or closes if already open.
    if (e.code === 'KeyB') {
      if (UI.isVoicePanelOpen()) UI.openVoicePanel(false)
      else openVoicePanel()
      return
    }
    if (!isPlaying || isPaused) return

    switch (e.code) {
      case 'KeyW': moveState.forward = true; break
      case 'KeyS': moveState.backward = true; break
      case 'KeyA': moveState.left = true; break
      case 'KeyD': moveState.right = true; break
      case 'ShiftLeft': case 'ShiftRight': moveState.sprint = true; break
      case 'ControlLeft': case 'ControlRight': moveState.crouch = true; break
      case 'KeyC': crouchToggle = !crouchToggle; break
      case 'Enter': e.preventDefault(); UI.openChat(); break
      case 'KeyF': switchTeam(); break
      case 'Space':
        if (isGrounded() && localAlive && !isCrouched()) {
          playerBody.velocity.y = 7.2
          sfx.jump()
        }
        break
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': {
        const idx = parseInt(e.code.slice(5), 10) - 1
        if (SLOT_ORDER[idx]) { weaponSystem.setSlot(SLOT_ORDER[idx]); onWeaponChanged(SLOT_ORDER[idx]) }
        break
      }
      case 'KeyQ':
        weaponSystem.setSlot('knife'); onWeaponChanged('knife'); break
      case 'KeyR': weaponSystem.reload(performance.now(), () => { if (scoped) setScope(false) }); break
      case 'KeyV': if (voice) voice.toggleMic(); break
      case 'Tab': e.preventDefault(); leaderboardVisible = true; UI.showLeaderboard(true); break
    }
  })

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': moveState.forward = false; break
      case 'KeyS': moveState.backward = false; break
      case 'KeyA': moveState.left = false; break
      case 'KeyD': moveState.right = false; break
      case 'ShiftLeft': case 'ShiftRight': moveState.sprint = false; break
      case 'ControlLeft': case 'ControlRight': moveState.crouch = false; break
      case 'Tab': leaderboardVisible = false; UI.showLeaderboard(false); break
    }
  })
}

function isCrouched() {
  return moveState.crouch || crouchToggle
}

function isGrounded() {
  raycaster.set(new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z), new THREE.Vector3(0, -1, 0))
  raycaster.far = 0.95
  const hits = raycaster.intersectObjects(colliderMeshes, false)
  return hits.length > 0 && hits[0].distance <= 0.82
}

function isMoving() {
  return moveState.forward || moveState.backward || moveState.left || moveState.right
}

function attemptFire() {
  if (!isPlaying || isPaused || !localAlive) return
  const now = performance.now()
  const def = weaponSystem.def()
  if (!weaponSystem.canFire(now)) return

  const targets = Array.from(remotePlayers.values())
    .filter(p => p.alive)
    .map(p => ({ id: p.id, player: p, hitboxes: p.hitboxes }))

  const result = weaponSystem.fire(now, targets, colliderMeshes, isMoving())
  if (!result) return

  // camera recoil kick — the crosshair is pushed up and randomly left/right,
  // then recovers over time (heavier weapons kick harder and settle slower)
  const rec = result.recoil
  recoilCur.pitch += 0.012 + rec * 0.05
  recoilCur.yaw += (Math.random() - 0.5) * rec * 0.16
  recoilCur.pitch = Math.min(recoilCur.pitch, Math.PI * 0.4)
  recoilCur.yaw = Math.max(-0.14, Math.min(0.14, recoilCur.yaw))

  if (result.hit) {
    const headshot = result.zone === 'head'
    if (result.normal) effects.blood(result.point, result.normal, headshot)
    sfx.hit(headshot)
    UI.hitmarker(headshot)
  } else if (result.normal && !result.melee) {
    effects.impact(result.point, result.normal)
  }

  if (mode === 'lan' && net) {
    net.send('shot', {
      origin: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      point: { x: result.point.x, y: result.point.y, z: result.point.z },
    })
    if (result.hit) {
      net.send('hit', { targetId: result.targetId, damage: Math.round(result.damage), zone: result.zone, weapon: def.id, melee: def.melee })
    }
  } else if (mode === 'solo' && result.hit) {
    const dummy = remotePlayers.get(result.targetId)
    if (dummy && dummy.alive) {
      const headshot = result.zone === 'head'
      UI.addKillFeed(`You hit <b>${escapeHtml(dummy.name)}</b> (${result.zone})`, headshot ? 'hs' : '')
      dummy.setHealth(dummy.health - result.damage)
      if (!dummy.alive) {
        UI.addKillFeed(`You destroyed <b style="color:#ffcf6b">${escapeHtml(dummy.name)}</b>`)
        sfx.kill()
        UI.killConfirm()
        respawnDummy(dummy)
      }
    }
  }
}

function onResize() {
  if (!camera || !renderer) return
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

// ---------------------------------------------------------------------------
// HUD Customizer + Touch Controls integration
// ---------------------------------------------------------------------------
function wireHUDCustomizer() {
  const editBtn = document.getElementById('edit-hud-btn')
  if (!editBtn || !hudCustomizer) return
  editBtn.style.display = 'inline-block'
  editBtn.addEventListener('click', () => {
    sfx.ensure(); sfx.uiClick()
    UI.showPause(false)
    if (touchControls) touchControls.enterEditMode()
    hudCustomizer.enter()
  })
  document.addEventListener('hud-edit-closed', () => {
    UI.showPause(true)
    if (touchControls) touchControls.exitEditMode()
  })
  const hotkey = (e) => {
    if (e.code === 'KeyM' && hudCustomizer && hudCustomizer.isEditing) {
      hudCustomizer.save()
    }
  }
  window.addEventListener('keydown', hotkey)
}

function initTouchControls() {
  const container = document.getElementById('touch-controls')
  if (!container) return
  touchControls = new TouchControls(container, {
    onMove: (f, b, l, r, sprint) => {
      moveState.forward = f
      moveState.backward = b
      moveState.left = l
      moveState.right = r
      moveState.sprint = sprint
    },
    onLook: (dx, dy) => {
      const s = 0.0022 * settings.sensitivity * TouchSensitivityScale
      const iy = settings.invertY ? -1 : 1
      euler.y -= dx * s
      euler.x -= dy * s * iy
      euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.x))
      swayInput.x += dx * 0.01
      swayInput.y += dy * 0.01
    },
    onFire: (pressed) => {
      if (pressed && isPlaying && !isPaused && localAlive) {
        mouseHeld = true
        attemptFire()
      } else if (!pressed) {
        mouseHeld = false
      }
    },
    onJump: () => {
      sfx.ensure()
      if (isGrounded() && localAlive && !isCrouched()) {
        playerBody.velocity.y = 7.2
        sfx.jump()
      }
    },
    onCrouch: () => { crouchToggle = !crouchToggle },
    onProne: () => {
      /* Prone uses the crouch posture in the current physics model */
      crouchToggle = true
    },
    onReload: () => {
      if (weaponSystem) weaponSystem.reload(performance.now(), () => { if (scoped) setScope(false) })
    },
    onADS: (pressed) => {
      if (!weaponSystem) return
      if (pressed && ADS_FOV[weaponSystem.current] != null && !isCrouched()) {
        setScope(true)
      } else if (!pressed && scoped) {
        setScope(false)
      }
    },
    onSprint: (pressed) => {
      moveState.sprint = pressed
    },
    onWeapon: (idx) => {
      if (weaponSystem && SLOT_ORDER[idx]) {
        weaponSystem.setSlot(SLOT_ORDER[idx])
        onWeaponChanged(SLOT_ORDER[idx])
      }
    },
    onPause: () => {
      setPaused(true)
      if (document.exitPointerLock) document.exitPointerLock()
    },
    onGrenade: () => {
      sfx.ensure(); sfx.uiClick()
    },
  })
  if (hudCustomizer) hudCustomizer.registerTouchControls(touchControls.getControls())
  UI.setTouchControlsVisible(isPlaying && isTouchDevice)
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate)
  const delta = Math.min(clock.getDelta(), 0.05)

  // FPS counter
  fpsFrames += 1
  fpsAcc += delta
  if (fpsAcc >= 0.5) {
    UI.updateFPS(fpsFrames / fpsAcc)
    fpsFrames = 0
    fpsAcc = 0
  }

  if (!isPlaying) return
  if (isPaused) {
    if (renderer) renderer.render(scene, camera)
    return
  }

  world.fixedStep()

  const crouched = isCrouched()

  // Movement
  let speed = 6.5
  if (moveState.sprint && !scoped && !crouched) speed = 9.5
  if (crouched) speed = 2.7
  else if (weaponSystem.adsActive) speed = 4.0
  const input = new THREE.Vector3()
  if (moveState.forward) input.z -= 1
  if (moveState.backward) input.z += 1
  if (moveState.left) input.x -= 1
  if (moveState.right) input.x += 1
  if (input.lengthSq() > 0) input.normalize()
  input.applyEuler(new THREE.Euler(0, euler.y, 0))

  if (localAlive) {
    playerBody.velocity.x = input.x * speed
    playerBody.velocity.z = input.z * speed
  } else {
    playerBody.velocity.x = 0
    playerBody.velocity.z = 0
  }

  const eyeH = crouched ? 0.2 : 0.62
  camera.position.set(playerBody.position.x, playerBody.position.y + eyeH, playerBody.position.z)
  camEuler.set(euler.x + recoilCur.pitch, euler.y + recoilCur.yaw, 0, 'YXZ')
  camera.quaternion.setFromEuler(camEuler)
  const recoilRecover = Math.min(1, delta * (7 + weaponSystem.def().recoil * 1.5))
  recoilCur.pitch += (0 - recoilCur.pitch) * recoilRecover
  recoilCur.yaw += (0 - recoilCur.yaw) * recoilRecover

  // Look-sway momentum for the viewmodel (decays back to zero)
  swayInput.x *= Math.max(0, 1 - delta * 9)
  swayInput.y *= Math.max(0, 1 - delta * 9)
  if (Math.abs(swayInput.x) < 0.0005) swayInput.x = 0
  if (Math.abs(swayInput.y) < 0.0005) swayInput.y = 0

  // Smooth FOV for scoping
  const adsFov = ADS_FOV[weaponSystem.current]
  const fovTarget = (scoped && adsFov != null)
    ? baseFov + (adsFov - baseFov) * weaponSystem.adsSmooth
    : baseFov
  currentFov += (fovTarget - currentFov) * Math.min(1, delta * 14)
  if (Math.abs(camera.fov - currentFov) > 0.01) {
    camera.fov = currentFov
    camera.updateProjectionMatrix()
  }

  // Scope overlay for scoped weapons
  const scopeOn = scoped && WEAPON_DEFS[weaponSystem.current].scoped && weaponSystem.adsSmooth > 0.45
  UI.showScope(scopeOn)
  document.getElementById('crosshair').style.display = scopeOn ? 'none' : 'block'

  // Day/night + weather cycle
  if (env) env.update(delta)

  // Shadow light follows the player so shadows stay sharp near you
  sunLight.position.copy(playerBody.position).addScaledVector(env ? env.sunDir : new THREE.Vector3(0.55, 0.8, 0.3), 150)
  sunLight.target.position.copy(playerBody.position)

  // Footsteps
  if (localAlive && isMoving() && isGrounded()) {
    stride.acc += speed * delta
    if (stride.acc > 2.3) { stride.acc = 0; sfx.footstep() }
  }

  // Continuous fire for automatic weapons
  if (mouseHeld && weaponSystem.def().auto) attemptFire()

  weaponSystem.update(delta, isMoving(), moveState.sprint, swayInput.x, swayInput.y)
  effects.update(delta)
  if (voice) voice.update()

  // HUD
  const wdef = WEAPON_DEFS[weaponSystem.current]
  UI.updateWeaponHUD(wdef.name, weaponSystem.ammo[weaponSystem.current], wdef.magSize, weaponSystem.reloading)
  if (mode === 'solo') UI.updateHealthBar(1)

  // Network sync + interpolation
  if (mode === 'lan' && net) {
    const now = performance.now()
    if (now - lastNetSend > 50) {
      lastNetSend = now
      net.send('move', {
        pos: { x: playerBody.position.x, y: playerBody.position.y, z: playerBody.position.z },
        rot: euler.y,
      })
    }
    for (const [id, rp] of remotePlayers) {
      const t = remoteTargets.get(id)
      if (!t) continue
      const cur = rp.group.position
      cur.x += (t.pos.x - cur.x) * 0.25
      cur.y += ((t.pos.y - BODY_RADIUS) - cur.y) * 0.25
      cur.z += (t.pos.z - cur.z) * 0.25
      rp.group.rotation.y += (t.rot - rp.group.rotation.y) * 0.25
    }
  }

  if (renderer) renderer.render(scene, camera)
  prevVelY = playerBody.velocity.y
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault()
}, true)

// Release the microphone and tear down peer connections when leaving the page.
window.addEventListener('pagehide', () => { if (voice) voice.dispose() })

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}