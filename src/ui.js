const HOTBAR_SLOTS = [
  ['1', 'PISTOL'], ['2', 'AK'], ['3', 'SMG'], ['4', 'SHOTGUN'], ['5', 'AWP'], ['6', 'LMG'], ['7', 'KNIFE'],
]

export function buildStaticDOM() {
  document.body.innerHTML = `
    <canvas id="webgl"></canvas>

    <!-- ============ MAIN MENU ============ -->
    <div id="menu">
      <div class="menu-bg">
        <div class="orb orb-a"></div>
        <div class="orb orb-b"></div>
        <div class="orb orb-c"></div>
        <div class="menu-grid"></div>
      </div>
      <div class="menu-panel glass">
        <div class="logo">
          <div class="logo-mark">A</div>
          <div>
            <h1>Arena <span>FPS</span></h1>
            <p class="subtitle">Solo practice, custom maps &amp; LAN multiplayer</p>
          </div>
        </div>

        <label class="fld">Player name</label>
        <input id="name-input" type="text" maxlength="16" placeholder="Enter your name" value="Player${Math.floor(Math.random() * 1000)}" />

        <div class="menu-tabs">
          <div class="menu-tab active" data-mode="solo">Solo Practice</div>
          <div class="menu-tab" data-mode="lan">Join LAN Game</div>
        </div>

        <div class="mode-section active" data-mode="solo">
          <label class="fld">Map</label>
          <select id="solo-map"></select>
          <button id="import-map-btn" type="button" class="mini-btn">Import custom map (.json)</button>
          <input id="import-map-input" type="file" accept=".json,application/json" style="display:none" />
          <div id="import-status" class="mini-status"></div>
        </div>

        <div class="mode-section" data-mode="lan">
          <label class="fld">Server address</label>
          <input id="server-input" type="text" placeholder="ws://192.168.1.10:3000" value="ws://${location.hostname || 'localhost'}:3000" />
          <label class="fld">Server password <span class="opt-note">(if required)</span></label>
          <input id="server-password" type="password" maxlength="32" placeholder="Leave blank if no password" />
          <button id="refresh-matches" type="button" class="mini-btn">Refresh matches</button>
          <div id="lan-status" class="mini-status"></div>

          <label class="fld">Match</label>
          <div id="match-list" class="match-list"></div>

          <details id="create-detail">
            <summary>Host a custom match</summary>
            <div class="create-grid">
              <label class="fld">Name</label>
              <input id="create-name" type="text" placeholder="Match room" value="Kill House" />
              <label class="fld">Map</label>
              <select id="create-map"></select>
              <label class="fld">Mode</label>
              <select id="create-mode">
                <option value="dm">Free For All</option>
                <option value="tdm">Team Deathmatch</option>
              </select>
              <label class="fld">Time (min)</label>
              <input id="create-time" type="number" min="1" max="60" value="10" />
              <label class="fld">Score limit</label>
              <input id="create-score" type="number" min="5" max="500" value="50" />
            </div>
            <button id="create-btn" type="button" class="mini-btn">Create match</button>
            <div id="create-status" class="mini-status"></div>
          </details>
        </div>

        <button id="play-btn" class="primary-btn">Play</button>
        <div id="menu-status"></div>

        <div class="menu-foot">
          <button id="settings-open-btn" type="button" class="mini-btn">Settings</button>
          <span class="menu-foot-note">Admin server GUI: <code>http://${location.hostname || 'localhost'}:3000</code></span>
        </div>
      </div>
    </div>

    <!-- ============ SETTINGS ============ -->
    <div id="settings-modal">
      <div class="settings-panel glass">
        <div class="settings-head">
          <h2>Settings</h2>
          <button id="settings-close-btn" class="icon-btn" title="Close">&times;</button>
        </div>
        <div class="settings-grid">
          <div class="set-row">
            <label for="set-sensitivity">Mouse sensitivity</label>
            <input id="set-sensitivity" type="range" min="0.1" max="3" step="0.05" />
            <span class="set-val" id="val-sensitivity">1.0</span>
          </div>
          <div class="set-row">
            <label for="set-fov">Field of view</label>
            <input id="set-fov" type="range" min="60" max="110" step="1" />
            <span class="set-val" id="val-fov">80</span>
          </div>
          <div class="set-row">
            <label for="set-volume">Master volume</label>
            <input id="set-volume" type="range" min="0" max="1" step="0.05" />
            <span class="set-val" id="val-volume">70%</span>
          </div>
          <div class="set-row">
            <label for="set-crossColor">Crosshair color</label>
            <input id="set-crossColor" type="color" value="#ffffff" />
          </div>
          <div class="set-row">
            <label for="set-crossSize">Crosshair size</label>
            <input id="set-crossSize" type="range" min="10" max="40" step="1" />
            <span class="set-val" id="val-crossSize">20</span>
          </div>
          <div class="set-row">
            <label for="set-quality">Graphics quality</label>
            <select id="set-quality">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>
          <div class="set-row toggle">
            <label for="set-showfps">Show FPS counter</label>
            <input id="set-showfps" type="checkbox" />
          </div>
          <div class="set-row toggle">
            <label for="set-inverty">Invert mouse Y</label>
            <input id="set-inverty" type="checkbox" />
          </div>
        </div>
        <div class="settings-foot">
          <button id="settings-reset-btn" class="mini-btn">Reset to defaults</button>
          <button id="settings-done-btn" class="primary-btn">Done</button>
        </div>
      </div>
    </div>

    <!-- ============ VOICE CHAT ============ -->
    <div id="voice-panel">
      <div class="settings-panel glass voice-panel">
        <div class="settings-head">
          <h2>Voice chat</h2>
          <button id="voice-close-btn" class="icon-btn" title="Close">&times;</button>
        </div>
        <div id="voice-status-line" class="voice-status"></div>
        <div class="voice-self">
          <div class="voice-self-info">
            <span class="voice-dot off" id="voice-self-dot"></span>
            <span id="voice-self-label">Mic off</span>
          </div>
          <button id="voice-mic-toggle" class="mini-btn voice-mic-toggle" type="button">Enable mic</button>
        </div>
        <div class="set-row">
          <label for="voice-others-vol">Others' mic volume</label>
          <input id="voice-others-vol" type="range" min="0" max="100" step="1" value="100" />
          <span class="set-val" id="val-voice-others">100%</span>
        </div>
        <div class="voice-players-head">Players in this match</div>
        <div class="voice-players" id="voice-players"></div>
        <div class="voice-hint">Proximity chat — louder up close, silent beyond ~34&nbsp;m. <b>V</b> toggles your mic · <b>B</b> opens this panel.</div>
      </div>
    </div>

    <!-- ============ PAUSE ============ -->
    <div id="pause-menu">
      <div class="menu-panel glass">
        <h1 style="font-size:20px;">Paused</h1>
        <button id="resume-btn" class="primary-btn">Resume</button>
        <button id="settings-pause-btn" class="primary-btn ghost">Settings</button>
        <button id="edit-hud-btn" class="primary-btn ghost">Edit HUD</button>
        <button id="mute-btn">Mute sound</button>
        <button id="voice-open-btn">Voice chat</button>
        <button id="menu-btn">Exit to Main Menu</button>
      </div>
    </div>

    <!-- ============ HUD ============ -->
    <div id="hud">
      <div id="touch-controls"></div>
      <div id="crosshair"></div>
      <div id="scope">
        <div class="scope-circle"></div>
        <div class="scope-lines">
          <span class="vl"></span><span class="hl"></span>
          <span class="scope-dot"></span>
        </div>
      </div>
      <div id="hitmarker"></div>
      <div id="kill-flash"></div>
      <div id="kill-confirm"></div>
      <div id="damage-vignette"></div>
      <div id="damage-indicators"></div>
      <div id="conn-status"></div>
      <div id="fps"></div>
      <div id="match-panel">
        <span id="match-name">Solo</span>
        <span id="match-time"></span>
        <span id="team-tag"></span>
        <span id="team-scores"></span>
      </div>

      <div id="status-panel">
        <div class="weapon-ammo">
          <div id="weapon-label">Pistol</div>
          <div id="ammo-label">12 / 12</div>
        </div>
        <div class="hp-row">
          <span>HP</span>
          <div class="bar-track"><div class="bar-fill" id="health-fill"></div></div>
          <span id="hp-num">100</span>
        </div>
      </div>

      <div id="hotbar">
        ${HOTBAR_SLOTS.map(([key, label], i) => `<div class="slot ${i === 0 ? 'active' : ''}" data-slot="${i + 1}"><div class="key">${key}</div>${label}</div>`).join('')}
      </div>

      <div id="chat">
        <div id="chat-messages"></div>
        <div id="chat-input-row" class="hidden">
          <input id="chat-input" type="text" maxlength="140" placeholder="Message… (Enter to send)" />
        </div>
      </div>

      <div id="killfeed"></div>

      <button id="voice-hud-btn" class="voice-hud-btn off" type="button" title="Toggle microphone (V)">
        <span class="voice-dot off"></span><span id="voice-hud-text">MIC OFF</span>
      </button>

      <div id="hint">
        <b>WASD</b> move · <b>Shift</b> sprint · <b>Ctrl</b> crouch · <b>RMB</b> scope<br>
        <b>LMB</b> fire · <b>R</b> reload · <b>1-7</b> weapon · <b>Tab</b> scores · <b>Enter</b> chat · <b>V</b> mic · <b>B</b> voice
      </div>

      <div id="leaderboard">
        <h3>Leaderboard <span id="lb-mode-tag"></span></h3>
        <table>
          <thead><tr><th style="width:22px;">#</th><th>Player</th><th>Kills</th><th>Deaths</th></tr></thead>
          <tbody id="leaderboard-body"></tbody>
        </table>
      </div>

      <div id="match-end-overlay">
        <h2 id="match-end-title">Match over</h2>
        <table id="match-end-table"></table>
        <small>Next round starts soon…</small>
      </div>

      <div id="death-overlay">
        <h2>You died</h2>
        <p id="death-reason"></p>
        <div id="death-timer-wrap">
          <div id="death-timer">2.3</div>
          <div class="death-timer-txt">RESPAWNING</div>
        </div>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export function initMenuTabs() {
  const tabs = document.querySelectorAll('.menu-tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      document.querySelectorAll('.mode-section').forEach(s => s.classList.remove('active'))
      document.querySelector(`.mode-section[data-mode="${tab.dataset.mode}"]`).classList.add('active')
    })
  })
}

export function getSelectedMode() {
  return document.querySelector('.menu-tab.active').dataset.mode
}

export function setMenuStatus(text) {
  document.getElementById('menu-status').textContent = text || ''
}

export function showMenu(show) {
  const el = document.getElementById('menu')
  if (show) {
    el.classList.remove('hide')
    el.style.display = 'flex'
    requestAnimationFrame(() => el.classList.add('in'))
  } else {
    el.classList.add('hide')
    setTimeout(() => { if (el.classList.contains('hide')) el.style.display = 'none' }, 300)
  }
}

export function showPause(show) {
  const el = document.getElementById('pause-menu')
  el.classList.toggle('in', !!show)
  el.style.display = show ? 'flex' : 'none'
}

export function showHUD(show) { document.getElementById('hud').style.display = show ? 'block' : 'none' }
export function setTouchControlsVisible(show) {
  const el = document.getElementById('touch-controls')
  if (el) el.style.display = show ? 'block' : 'none'
}
export function showLeaderboard(show) {
  const el = document.getElementById('leaderboard')
  el.classList.toggle('show', !!show)
  el.style.display = show ? 'block' : 'none'
}
export function setConnStatus(text) { document.getElementById('conn-status').textContent = text || '' }

export function setMatchPanel(matchName, timeLeft, teamInfo) {
  document.getElementById('match-name').textContent = matchName || 'Solo'
  document.getElementById('match-time').textContent = timeLeft ? fmtTime(timeLeft) : ''
  document.getElementById('team-scores').textContent = teamInfo || ''
}

export function setTeamTag(text) {
  const tag = document.getElementById('team-tag')
  tag.textContent = text || ''
  tag.className = text ? 'team-tag ' + (text === 'CT' ? 'ct' : 't') : ''
}

function fmtTime(sec) {
  if (typeof sec !== 'number' || sec < 0) return ''
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function setActiveSlot(n) {
  document.querySelectorAll('.slot').forEach(el => {
    const on = parseInt(el.dataset.slot) === n
    el.classList.toggle('active', on)
    if (on) {
      el.classList.remove('pop')
      void el.offsetWidth
      el.classList.add('pop')
    }
  })
}

export function updateWeaponHUD(name, ammo, magSize, reloading) {
  document.getElementById('weapon-label').textContent = name
  const label = document.getElementById('ammo-label')
  if (magSize === Infinity) label.textContent = reloading ? '...' : 'MELEE'
  else label.textContent = reloading ? 'Reloading…' : `${ammo} / ${magSize}`
}

export function updateHealthBar(pct) {
  const fill = document.getElementById('health-fill')
  fill.style.width = `${Math.max(0, pct) * 100}%`
  fill.style.background = pct > 0.5 ? 'linear-gradient(90deg,#4caf50,#8fe388)' : pct > 0.25 ? 'linear-gradient(90deg,#ffb300,#ffd54f)' : 'linear-gradient(90deg,#e53935,#ff6b5f)'
  const num = document.getElementById('hp-num')
  if (num) num.textContent = Math.max(0, Math.round(pct * 100))
}

export function showDeathOverlay(show, reason) {
  const el = document.getElementById('death-overlay')
  el.classList.toggle('in', !!show)
  el.style.display = show ? 'flex' : 'none'
  if (reason !== undefined) document.getElementById('death-reason').textContent = reason
}

export function setDeathTimer(sec) {
  const el = document.getElementById('death-timer')
  if (el) el.textContent = sec.toFixed(1)
}

// Low-HP / damage red vignette flash
export function flashDamage(intensity = 1) {
  const el = document.getElementById('damage-vignette')
  el.style.opacity = Math.max(el.style.opacity || 0, 0.75 * intensity)
  el.classList.remove('on')
  void el.offsetWidth
  el.classList.add('on')
  clearTimeout(el._t)
  el._t = setTimeout(() => {
    el.style.opacity = '0'
  }, 450)
}

// Directional damage indicator (angle in radians relative to view yaw)
export function showDamageIndicator(angleRad) {
  const box = document.getElementById('damage-indicators')
  if (!box) return
  const div = document.createElement('div')
  div.className = 'dmg-ind'
  const x = Math.sin(angleRad) * 50
  const y = -Math.cos(angleRad) * 50
  div.style.transform = `translate(${x}px, ${y}px) rotate(${-angleRad}rad)`
  box.appendChild(div)
  while (box.children.length > 5) box.removeChild(box.firstChild)
  setTimeout(() => {
    div.classList.add('out')
    setTimeout(() => div.remove(), 500)
  }, 900)
}

// Kill confirmation flash (triggered when you land a kill)
export function killConfirm() {
  const el = document.getElementById('kill-confirm')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 700)
}

// Full red screen flash when you die
export function deathFlash() {
  const el = document.getElementById('kill-flash')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 900)
}

export function showMatchEnd(msg) {
  const el = document.getElementById('match-end-overlay')
  if (!msg) { el.style.display = 'none'; el.classList.remove('in'); return }
  el.style.display = 'flex'
  el.classList.add('in')
  document.getElementById('match-end-title').textContent = msg.title || 'Match over'
  const rows = (msg.players || []).slice(0, 10)
  const getTeam = p => p.team ? (p.team === 'CT' ? '[CT] ' : '[T] ') : ''
  document.getElementById('match-end-table').innerHTML =
    `<tr><th>Player</th><th>Kills</th><th>Deaths</th></tr>` +
    rows.map(p => `<tr><td>${getTeam(p)}${escapeHtml(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('')
}

export function addKillFeed(text, cls) {
  const feed = document.getElementById('killfeed')
  const div = document.createElement('div')
  div.innerHTML = text
  if (cls) div.classList.add(cls)
  feed.appendChild(div)
  div.classList.add('in')
  while (feed.children.length > 6) feed.removeChild(feed.firstChild)
  setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 400) }, 5000)
}

export function hitmarker(headshot) {
  const el = document.getElementById('hitmarker')
  el.classList.remove('hs', 'show')
  if (headshot) el.classList.add('hs')
  void el.offsetWidth
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 140)
}

export function updateLeaderboard(rows) {
  const body = document.getElementById('leaderboard-body')
  const sorted = [...rows].sort((a, b) => b.kills - a.kills)
  body.innerHTML = sorted.map((r, i) => {
    const rowCls = r.team ? `team-${r.team === 'CT' ? 'ct' : 't'}` : ''
    return `<tr class="${rowCls}"${r.self ? ' data-self="1"' : ''}>
      <td style="color:#666;">${i + 1}</td>
      <td>${r.team ? (r.team === 'CT' ? '[CT] ' : '[T] ') : ''}${escapeHtml(r.name)}${r.self ? ' <span class="you-tag">you</span>' : ''}</td>
      <td>${r.kills}</td><td>${r.deaths}</td>
    </tr>`
  }).join('')
  const tag = document.getElementById('lb-mode-tag')
  const tdm = rows.some(r => r.team)
  if (tag) tag.textContent = tdm ? '· Team Deathmatch' : '· Free For All'
}

export function populateMapSelect(items, selectedId) {
  const sel = document.getElementById('solo-map')
  sel.innerHTML = items.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('')
  if (selectedId) sel.value = selectedId
  return sel
}

export function getSelectedMapId() {
  return document.getElementById('solo-map').value
}

export function setImportStatus(text) {
  document.getElementById('import-status').textContent = text || ''
}

export function setLanStatus(text) {
  document.getElementById('lan-status').textContent = text || ''
}

export function renderMatchList(matches, selectedId) {
  const el = document.getElementById('match-list')
  const sel = getSelectedMatchId()
  if (!matches || matches.length === 0) {
    el.innerHTML = '<div class="match-row muted">No matches — host one below or press Play to join the default arena.</div>'
    return
  }
  el.innerHTML = matches.map(m => `
    <div class="match-row ${(selectedId || sel) === m.id ? 'selected' : ''}" data-mid="${escapeHtml(m.id)}">
      <div class="match-main">
        <span class="match-name">${escapeHtml(m.name)}</span>
        <span class="match-meta">${escapeHtml(m.map_name || '')} · ${m.mode === 'tdm' ? 'TDM' : 'FFA'} · ${m.players} player${m.players === 1 ? '' : 's'}${m.status === 'live' ? ' · LIVE' : ''}</span>
      </div>
    </div>`).join('')
  el.querySelectorAll('.match-row').forEach(row => {
    row.addEventListener('click', () => {
      el.querySelectorAll('.match-row').forEach(r => r.classList.remove('selected'))
      row.classList.add('selected')
    })
  })
}

export function getSelectedMatchId() {
  const row = document.querySelector('#match-list .match-row.selected')
  return row ? row.dataset.mid : null
}

export function setCreateStatus(text) {
  document.getElementById('create-status').textContent = text || ''
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
export function showSettings(show) {
  const el = document.getElementById('settings-modal')
  if (show) {
    el.classList.add('in')
    el.style.display = 'flex'
  } else {
    el.classList.remove('in')
    setTimeout(() => { if (!el.classList.contains('in')) el.style.display = 'none' }, 220)
  }
}

export function bindSettingsButtons({ onOpen, onResolve }) {
  document.getElementById('settings-open-btn').addEventListener('click', () => { if (onOpen) onOpen(); showSettings(true) })
  document.getElementById('settings-pause-btn').addEventListener('click', () => { if (onOpen) onOpen(); showSettings(true) })
  const close = () => { showSettings(false); if (onResolve) onResolve() }
  document.getElementById('settings-close-btn').addEventListener('click', close)
  document.getElementById('settings-done-btn').addEventListener('click', close)
}

export function updateSettingsValues(s) {
  const map = { sensitivity: 'val-sensitivity', fov: 'val-fov', volume: 'val-volume', crossSize: 'val-crossSize' }
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id)
    if (!el || !(k in s)) continue
    if (k === 'volume') el.textContent = Math.round(s.volume * 100) + '%'
    else if (k === 'sensitivity') el.textContent = Number(s.sensitivity).toFixed(2)
    else el.textContent = s[k]
  }
}

// ---------------------------------------------------------------------------
// Voice chat panel
// ---------------------------------------------------------------------------
function voiceEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function openVoicePanel(show) {
  const el = document.getElementById('voice-panel')
  if (!el) return
  if (show) {
    el.classList.add('in')
    el.style.display = 'flex'
  } else {
    el.classList.remove('in')
    setTimeout(() => { if (!el.classList.contains('in')) el.style.display = 'none' }, 200)
  }
}

export function toggleVoicePanel() {
  const el = document.getElementById('voice-panel')
  if (!el) return
  openVoicePanel(el.style.display !== 'flex')
}

export function isVoicePanelOpen() {
  const el = document.getElementById('voice-panel')
  return !!el && el.style.display === 'flex'
}

export function updateVoiceStatus(s) {
  const line = document.getElementById('voice-status-line')
  const dot = document.getElementById('voice-self-dot')
  const label = document.getElementById('voice-self-label')
  const btn = document.getElementById('voice-mic-toggle')
  const hud = document.getElementById('voice-hud-btn')
  const hudText = document.getElementById('voice-hud-text')
  if (!line) return

  if (!s.supported) {
    line.textContent = s.secure
      ? 'This browser blocks microphone access.'
      : 'Voice needs a secure context — open the game over HTTPS or use localhost.'
    line.className = 'voice-status warn'
    if (label) label.textContent = 'Mic unavailable'
    if (btn) { btn.disabled = true; btn.textContent = 'Enable mic' }
    if (dot) dot.className = 'voice-dot off'
    if (hud) { hud.disabled = true; hud.classList.remove('on'); hud.classList.add('off') }
    if (hudText) hudText.textContent = 'VOICE N/A'
    return
  }

  if (s.error) {
    line.textContent = s.error
    line.className = 'voice-status warn'
  } else {
    line.textContent = s.micOn
      ? 'Microphone live. Nearby players can hear you.'
      : 'Mic is off. Enable it to be heard by nearby players.'
    line.className = 'voice-status'
  }

  const micOn = !!s.micOn
  const talking = !!s.talking
  if (label) label.textContent = micOn ? (talking ? 'Talking…' : 'Mic on') : 'Mic off'
  if (dot) dot.className = 'voice-dot ' + (micOn ? (talking ? 'live' : 'on') : 'off')
  if (btn) { btn.disabled = false; btn.textContent = micOn ? 'Mute mic' : 'Enable mic' }
  if (hud) {
    hud.disabled = false
    hud.classList.toggle('on', micOn)
    hud.classList.toggle('off', !micOn)
    const hd = hud.querySelector('.voice-dot')
    if (hd) hd.className = 'voice-dot ' + (micOn ? (talking ? 'live' : 'on') : 'off')
  }
  if (hudText) hudText.textContent = micOn ? (talking ? 'MIC LIVE' : 'MIC ON') : 'MIC OFF'

  // Keep the master slider in sync unless the user is currently dragging it.
  const ovol = document.getElementById('voice-others-vol')
  if (ovol && document.activeElement !== ovol) {
    const want = String(Math.round((s.othersVolume != null ? s.othersVolume : 1) * 100))
    if (ovol.value !== want) ovol.value = want
    const val = document.getElementById('val-voice-others')
    if (val) val.textContent = want + '%'
  }
}

export function renderVoicePlayers(rows) {
  const box = document.getElementById('voice-players')
  if (!box) return
  if (!rows || rows.length === 0) {
    box.innerHTML = '<div class="voice-empty">No other players in this match. Voice is available in LAN games.</div>'
    return
  }
  box.innerHTML = rows.map(r => {
    const id = voiceEsc(r.id)
    const name = voiceEsc(r.name || r.id)
    const vol = Math.round((r.volume != null ? r.volume : 1) * 100)
    const state = r.state === 'connected' ? 'on'
      : (r.state === 'connecting' || r.state === 'new' || r.state === 'none' ? 'wait' : 'off')
    return `<div class="vp-row" data-id="${id}">
      <span class="vp-name" title="${name}"><span class="vp-state ${state}"></span>${name}</span>
      <input class="vp-vol" type="range" min="0" max="100" step="1" value="${vol}" aria-label="Volume for ${name}" />
      <button class="vp-mute ${r.muted ? 'muted' : ''}" type="button">${r.muted ? 'Unmute' : 'Mute'}</button>
    </div>`
  }).join('')
}

export function bindVoiceControls(h) {
  const close = document.getElementById('voice-close-btn')
  if (close) close.addEventListener('click', () => openVoicePanel(false))
  const mic = document.getElementById('voice-mic-toggle')
  if (mic) mic.addEventListener('click', () => { if (h.onMicToggle) h.onMicToggle() })
  const hud = document.getElementById('voice-hud-btn')
  if (hud) hud.addEventListener('click', () => { if (h.onMicToggle) h.onMicToggle() })
  const ovol = document.getElementById('voice-others-vol')
  if (ovol) ovol.addEventListener('input', () => {
    const v = Number(ovol.value) / 100
    const val = document.getElementById('val-voice-others')
    if (val) val.textContent = Math.round(v * 100) + '%'
    if (h.onOthersVolume) h.onOthersVolume(v)
  })
  const list = document.getElementById('voice-players')
  if (list) {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button.vp-mute')
      if (!btn) return
      const row = btn.closest('.vp-row')
      if (!row || !h.onPlayerMute) return
      h.onPlayerMute(row.dataset.id, !btn.classList.contains('muted'))
    })
    list.addEventListener('input', (e) => {
      const input = e.target.closest('input.vp-vol')
      if (!input) return
      const row = input.closest('.vp-row')
      if (!row || !h.onPlayerVolume) return
      h.onPlayerVolume(row.dataset.id, Number(input.value) / 100)
    })
  }
}

// ---------------------------------------------------------------------------
// FPS counter
// ---------------------------------------------------------------------------
let fpsShown = true
export function setFPSVisible(v) { fpsShown = !!v; document.getElementById('fps').style.display = v ? 'block' : 'none' }
export function updateFPS(fps) {
  if (!fpsShown) return
  const el = document.getElementById('fps')
  el.textContent = Math.round(fps) + ' FPS'
  el.classList.toggle('low', fps < 40)
  el.classList.toggle('ok', fps >= 40 && fps < 60)
}

// ---------------------------------------------------------------------------
// Scope overlay
// ---------------------------------------------------------------------------
export function showScope(show) {
  const el = document.getElementById('scope')
  el.classList.toggle('on', !!show)
  el.style.display = show ? 'block' : 'none'
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
let chatState = false

export function isChatOpen() {
  return chatState || document.activeElement === document.getElementById('chat-input')
}

export function openChat() {
  const row = document.getElementById('chat-input-row')
  const input = document.getElementById('chat-input')
  row.classList.remove('hidden')
  chatState = true
  input.focus()
}

export function closeChat() {
  const row = document.getElementById('chat-input-row')
  const input = document.getElementById('chat-input')
  row.classList.add('hidden')
  chatState = false
  input.value = ''
  input.blur()
}

export function addChatMessage(name, text, cls) {
  const box = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = 'chat-msg ' + (cls || '')
  if (name) {
    const nm = document.createElement('span')
    nm.className = 'chat-name ' + (cls || '')
    nm.textContent = name + ':'
    div.appendChild(nm)
  }
  const tx = document.createElement('span')
  tx.textContent = text
  div.appendChild(tx)
  box.appendChild(div)
  while (box.children.length > 24) box.removeChild(box.firstChild)
  setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 1500) }, 12000)
}

export const SYSTEM_MSG = 'system'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}