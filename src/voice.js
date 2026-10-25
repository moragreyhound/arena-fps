// VoiceChat — proximity voice chat over WebRTC for LAN games.
//
// Design notes:
//  * Audio travels peer-to-peer directly between browsers using HOST ICE
//    candidates only (iceServers: [] — no STUN/TURN), so no third-party service
//    is ever contacted and no audio leaves the local network.
//  * The game server only relays small WebRTC signaling messages (SDP/ICE)
//    between players in the same match; the relay is size-capped server-side.
//  * Nothing is recorded or stored. The microphone is requested only after the
//    player presses the mic toggle (a user gesture), and a visible indicator is
//    shown while it is live.
//  * Per-speaker volume is attenuated by distance and panned according to the
//    direction to the speaker relative to the listener's camera heading.
//  * Per-player mute + volume and a global "others' mic volume" control are
//    provided. Muting flips the local track's `enabled` flag, which never
//    requires renegotiation.
//  * Connection roles are deterministic (the lower player id offers first), so
//    simultaneous offers ("glare") do not occur in practice; a rollback guard
//    is kept as a safety net.

const RANGE_M = 34 // meters: beyond this a peer is silent
const NEAR_M = 2.5 // meters: full volume within this radius
const TALK_RMS = 0.045 // own-mic level above which the "talking" light turns on

export class VoiceChat {
  constructor(opts) {
    this.net = opts.net
    this.getMyId = opts.getMyId
    this.getMyPos = opts.getMyPos
    this.getMyYaw = opts.getMyYaw
    this.getPeerPos = opts.getPeerPos
    this.getPeerName = opts.getPeerName
    this.onPeersChanged = opts.onPeersChanged || (() => {})
    this.onStatus = opts.onStatus || (() => {})

    this.supported = typeof RTCPeerConnection !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia
    this.secure = typeof window !== 'undefined' && window.isSecureContext === true

    this.localStream = null
    this.ctx = null
    this.analyser = null
    this._level = null
    this.micMuted = false
    this.othersVolume = 1
    this.talking = false
    this.error = null

    this.peers = new Map() // id -> { id, name, state, muted, volume, pan }
    this.conns = new Map() // id -> { pc, src, gain, panner, iceQueue, makingOffer, wantOffer, failed, curGain, factor }

    if (this.net && this.net.on) {
      this.net.on('voiceSignal', (msg) => this._onSignal(msg.from, msg.signal))
    }
  }

  getState() {
    const st = {
      supported: this.supported,
      secure: this.secure,
      micOn: !!this.localStream && !this.micMuted,
      talking: this.talking,
      error: this.error,
      othersVolume: this.othersVolume,
      peers: [],
    }
    for (const p of this.peers.values()) {
      st.peers.push({ id: p.id, name: p.name, state: p.state, muted: p.muted, volume: p.volume })
    }
    return st
  }

  _peer(id) {
    let p = this.peers.get(id)
    if (!p) {
      p = {
        id,
        name: this.getPeerName ? this.getPeerName(id) : String(id),
        state: 'none',
        muted: false,
        volume: 1,
        pan: 0,
      }
      this.peers.set(id, p)
    }
    return p
  }

  // A remote player entered the match (or was already present when we joined).
  peerJoined(id) {
    if (this.peers.has(id)) return
    this._peer(id)
    this._connect(id)
    this.onPeersChanged()
  }

  peerLeft(id) {
    if (!this.peers.has(id) && !this.conns.has(id)) return
    this.peers.delete(id)
    this._close(id)
    this.onPeersChanged()
  }

  // Left the server entirely (kept the mic stream for a possible re-join).
  reset() {
    for (const id of [...this.conns.keys()]) this._close(id)
    this.peers.clear()
    this.onPeersChanged()
  }

  dispose() {
    this.reset()
    this.teardownMic()
  }

  // ---- Microphone ---------------------------------------------------------

  async toggleMic() {
    if (!this.supported) {
      this.error = this.secure
        ? 'This browser blocks microphone access.'
        : 'Voice needs a secure context — open the game over HTTPS or use localhost.'
      this.onStatus(this.getState())
      return
    }
    if (!this.localStream) {
      await this._enableMic()
    } else {
      this.micMuted = !this.micMuted
      this._setMicTrackEnabled()
      this.onStatus(this.getState())
    }
  }

  async _enableMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      this.localStream = stream
      this.micMuted = false
      this.error = null
      this._setMicTrackEnabled()
      this._ensureContext()
      this._wireMicAnalyser()
      // Attach our tracks to every peer connection and negotiate them.
      for (const id of this.peers.keys()) {
        if (!this.conns.has(id)) this._connect(id)
        else this._addLocalTracks(id)
      }
      this.onPeersChanged()
      this.onStatus(this.getState())
    } catch (e) {
      this.error = e && e.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it for this page, then toggle the mic again.'
        : e && e.name === 'NotFoundError'
          ? 'No microphone found. Plug one in, then toggle the mic again.'
          : 'Could not start the microphone: ' + ((e && e.message) || 'unknown error')
      this.onStatus(this.getState())
    }
  }

  // Creates (or resumes) the shared AudioContext. This is used both for the
  // microphone level meter and for playing remote voices, so a player who never
  // enables their mic can still hear others. Returns the context or null.
  _ensureContext() {
    if (!this.ctx) {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext)
      if (!AC) return null
      this.ctx = new AC()
    }
    // The context may start suspended until a user gesture; the player has
    // already clicked into the game by this point, so a resume usually sticks.
    if (this.ctx.state === 'suspended') { try { this.ctx.resume() } catch {} }
    return this.ctx
  }

  // Routes the microphone into a level meter only — never to the speakers, so
  // the player never hears their own voice echoed back.
  _wireMicAnalyser() {
    if (!this.ctx || !this.localStream) return
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.3
      this._level = new Float32Array(this.analyser.fftSize)
    }
    try {
      const src = this.ctx.createMediaStreamSource(this.localStream)
      src.connect(this.analyser)
    } catch {}
  }

  teardownMic() {
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) { try { t.stop() } catch {} }
      this.localStream = null
    }
    if (this.ctx) { try { this.ctx.close() } catch {} }
    this.ctx = null
    this.analyser = null
    this._level = null
    this.micMuted = false
    this.talking = false
  }

  _setMicTrackEnabled() {
    if (!this.localStream) return
    for (const t of this.localStream.getAudioTracks()) t.enabled = !this.micMuted
  }

  // ---- Per-player controls ------------------------------------------------

  setPeerMuted(id, muted) {
    const p = this.peers.get(id)
    if (!p) return
    p.muted = !!muted
    this._applyGain(id)
    this.onPeersChanged()
  }

  setPeerVolume(id, volume) {
    const p = this.peers.get(id)
    if (!p) return
    p.volume = Math.max(0, Math.min(1, Number(volume) || 0))
    this._applyGain(id)
    // No peer-list callback here: rebuilding the list mid-drag would break the
    // slider the user is currently holding.
  }

  setOthersVolume(volume) {
    this.othersVolume = Math.max(0, Math.min(1, Number(volume) || 0))
    for (const id of this.conns.keys()) this._applyGain(id)
    this.onStatus(this.getState())
  }

  // ---- WebRTC -------------------------------------------------------------

  // Creates a connection for a peer regardless of mic state: a mic-less peer
  // still answers offers so the other side can be heard, and its own tracks are
  // attached (with a renegotiation offer) the moment the mic is enabled.
  _connect(id) {
    if (this.conns.has(id)) return
    const pc = new RTCPeerConnection({ iceServers: [] })
    const conn = {
      pc, src: null, gain: null, panner: null,
      iceQueue: [], makingOffer: false, wantOffer: false, failed: false, curGain: null, factor: 0,
    }
    this.conns.set(id, conn)

    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) pc.addTrack(t, this.localStream)
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this._send(id, { type: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => { this._wireAudio(id, e.streams[0]) }
    pc.onsignalingstatechange = () => {
      if (conn.wantOffer && pc.signalingState === 'stable') {
        conn.wantOffer = false
        this._negotiate(id)
      }
    }
    pc.onconnectionstatechange = () => {
      const p = this._peer(id)
      p.state = pc.connectionState || 'new'
      if (pc.connectionState === 'connected') conn.failed = false
      else if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && !conn.failed) {
        conn.failed = true
        setTimeout(() => {
          if (this.conns.get(id) === conn &&
              (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
            this._close(id)
            this._connect(id)
          }
        }, 1500)
      }
      this.onPeersChanged()
    }

    // If we already have a microphone, start negotiating. Both sides may offer
    // at once; the collision is resolved deterministically below (the polite
    // peer rolls back and answers, the impolite peer ignores the crossed offer).
    if (this.localStream) this._scheduleNegotiate(id)
    this.onPeersChanged()
  }

  // Adds local audio tracks to a connection that was created before the mic
  // existed, then negotiates them. Muting later never reaches this path.
  _addLocalTracks(id) {
    const conn = this.conns.get(id)
    if (!conn || !this.localStream) return
    if (conn.pc.getSenders().length > 0) return
    for (const t of this.localStream.getAudioTracks()) conn.pc.addTrack(t, this.localStream)
    this._scheduleNegotiate(id)
  }

  // The peer with the lower id is "impolite" and wins a simultaneous-offer
  // collision. Both sides may still offer independently (e.g. the lower-id peer
  // had no microphone when the two connected), so the collision is handled
  // rather than prevented.
  _isImpolite(id) {
    const me = this.getMyId ? String(this.getMyId()) : ''
    return me === '' || me < String(id)
  }

  _scheduleNegotiate(id) {
    const conn = this.conns.get(id)
    if (!conn) return
    if (conn.pc.signalingState === 'stable') {
      conn.wantOffer = false
      this._negotiate(id)
    } else {
      conn.wantOffer = true
    }
  }

  _negotiate(id) {
    const conn = this.conns.get(id)
    if (!conn || !this.localStream || conn.makingOffer) return
    if (conn.pc.signalingState !== 'stable') { conn.wantOffer = true; return }
    if (conn.pc.getSenders().length === 0) return
    conn.makingOffer = true
    conn.pc.createOffer()
      .then((offer) => conn.pc.setLocalDescription(offer))
      .then(() => {
        const d = conn.pc.localDescription
        if (d) this._send(id, { type: 'offer', sdp: d.sdp })
      })
      .catch((e) => { console.warn('[voice] offer failed:', e) })
      .finally(() => { conn.makingOffer = false })
  }

  async _onOffer(id, offer) {
    const conn = this._getOrCreate(id)
    if (!conn) return
    const polite = !this._isImpolite(id)
    // Perfect-negotiation collision handling: if we already have an outgoing
    // offer, the impolite peer ignores this crossed offer (it will retry its
    // own), while the polite peer rolls its offer back and answers.
    const collision = offer.type === 'offer' && (conn.makingOffer || conn.pc.signalingState !== 'stable')
    if (!polite && collision) return
    try {
      if (polite && collision) {
        try { await conn.pc.setLocalDescription({ type: 'rollback' }) } catch {}
      }
      await conn.pc.setRemoteDescription(offer)
      const answer = await conn.pc.createAnswer()
      await conn.pc.setLocalDescription(answer)
      this._send(id, { type: 'answer', sdp: answer.sdp })
      this._flushIce(id)
      this.onPeersChanged()
    } catch (e) {
      console.warn('[voice] offer handling failed:', e)
      this.error = 'Voice connection failed. Toggle your mic to retry.'
      this.onStatus(this.getState())
    }
  }

  _onAnswer(id, answer) {
    const conn = this.conns.get(id)
    if (!conn || conn.pc.signalingState !== 'have-local-offer') return
    conn.pc.setRemoteDescription(answer)
      .then(() => this._flushIce(id))
      .catch((e) => console.warn('[voice] answer failed:', e))
  }

  _onCandidate(id, candidate) {
    const conn = this.conns.get(id)
    if (!conn || !candidate) return
    if (!conn.pc.remoteDescription) { conn.iceQueue.push(candidate); return }
    conn.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
  }

  _flushIce(id) {
    const conn = this.conns.get(id)
    if (!conn) return
    for (const c of conn.iceQueue.splice(0)) {
      conn.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
  }

  _getOrCreate(id) {
    if (!this.conns.has(id)) this._connect(id)
    return this.conns.get(id)
  }

  _close(id) {
    const conn = this.conns.get(id)
    if (!conn) return
    if (conn.src) { try { conn.src.disconnect() } catch {} }
    if (conn.gain) { try { conn.gain.disconnect() } catch {} }
    try { conn.pc.close() } catch {}
    this.conns.delete(id)
  }

  _send(id, signal) {
    if (this.net && this.net.send) this.net.send('voiceSignal', { to: id, signal })
  }

  _onSignal(from, signal) {
    if (from == null || !signal || typeof signal !== 'object' || typeof signal.type !== 'string') return
    const me = this.getMyId ? this.getMyId() : null
    if (me != null && String(from) === String(me)) return
    this._peer(from)
    if (signal.type === 'offer') this._onOffer(from, signal).catch(() => {})
    else if (signal.type === 'answer') this._onAnswer(from, signal)
    else if (signal.type === 'candidate') this._onCandidate(from, signal.candidate)
  }

  // ---- Remote audio graph -------------------------------------------------

  _wireAudio(id, stream) {
    const conn = this.conns.get(id)
    if (!conn || !stream) return
    // Create the context on demand so a player whose own mic is off can still
    // hear other people speaking.
    const ctx = this._ensureContext()
    if (!ctx) return
    if (conn.src) { try { conn.src.disconnect() } catch {} }
    try { conn.src = ctx.createMediaStreamSource(stream) } catch { return }
    conn.gain = ctx.createGain()
    conn.gain.gain.value = 0
    if (ctx.createStereoPanner) {
      conn.panner = ctx.createStereoPanner()
      conn.src.connect(conn.gain)
      conn.gain.connect(conn.panner)
      conn.panner.connect(ctx.destination)
    } else {
      conn.src.connect(conn.gain)
      conn.gain.connect(ctx.destination)
    }
    this._applyGain(id)
    this.onPeersChanged()
  }

  _applyGain(id) {
    const conn = this.conns.get(id)
    const p = this.peers.get(id)
    if (!conn || !conn.gain || !p) return
    const target = (conn.factor || 0) * (p.muted ? 0 : 1) * p.volume * this.othersVolume
    conn.curGain = target
    conn.gain.gain.value = target
    if (conn.panner) conn.panner.pan.value = p.pan || 0
  }

  // ---- Per-frame proximity update (call from the game loop) ---------------

  update() {
    // Runs even when our own mic is off: a silent listener still needs the
    // proximity gain applied to the voices it receives.
    const myPos = this.getMyPos ? this.getMyPos() : null
    const myYaw = this.getMyYaw ? this.getMyYaw() : 0
    const cosY = Math.cos(myYaw)
    const sinY = Math.sin(myYaw)
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    for (const [id, conn] of this.conns) {
      const p = this.peers.get(id)
      const peerPos = this.getPeerPos ? this.getPeerPos(id) : null
      if (!p || !peerPos || !myPos) { conn.factor = 0; if (conn.gain) conn.gain.gain.value = 0; continue }
      const dx = peerPos.x - myPos.x
      const dz = peerPos.z - myPos.z
      const dist = Math.hypot(dx, dz)
      let factor = 0
      if (dist <= NEAR_M) factor = 1
      else if (dist < RANGE_M) factor = Math.pow(1 - (dist - NEAR_M) / (RANGE_M - NEAR_M), 1.5)
      conn.factor = factor
      const localX = dx * cosY - dz * sinY
      const localZ = -dx * sinY - dz * cosY
      p.pan = Math.max(-1, Math.min(1, Math.atan2(localX, localZ) / (Math.PI / 2)))
      if (conn.gain) {
        if (conn.panner) conn.panner.pan.value = p.pan
        const target = factor * (p.muted ? 0 : 1) * p.volume * this.othersVolume
        if (conn.curGain == null) conn.curGain = target
        conn.curGain += (target - conn.curGain) * 0.3
        conn.gain.gain.value = conn.curGain
      }
    }

    // Own-mic level meter drives the "talking" indicator.
    let talking = false
    if (this.analyser && !this.micMuted) {
      this.analyser.getFloatTimeDomainData(this._level)
      let sum = 0
      for (let i = 0; i < this._level.length; i++) { const v = this._level[i]; sum += v * v }
      talking = Math.sqrt(sum / this._level.length) > TALK_RMS
    }
    if (talking !== this.talking) {
      this.talking = talking
      this.onStatus(this.getState())
    }
  }
}
