export class NetworkClient {
  constructor(url) {
    this.url = url
    this.handlers = {}
    this.connected = false
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.connected = true
      this._emit('open', {})
    }
    this.ws.onclose = () => {
      this.connected = false
      this._emit('close', {})
    }
    this.ws.onerror = (e) => {
      this._emit('error', { error: e })
    }
    this.ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      this._emit(msg.type, msg)
    }
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn)
  }

  _emit(type, msg) {
    for (const fn of (this.handlers[type] || [])) fn(msg)
  }

  send(type, data = {}) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  close() {
    try { this.ws.close() } catch {}
  }
}
