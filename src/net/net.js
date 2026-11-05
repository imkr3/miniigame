// 멀티플레이 클라이언트: WebSocket(실제 서버) 또는 'local'(같은 브라우저 탭끼리, SharedWorker)
//
// 서버 주소 결정 순서: mountGame 옵션 server → 주소창 ?server= → window.MINIIGAME_SERVER → 사용자가 로비에서 입력한 값 → 'local'

export function resolveServer(opt) {
  return opt
    || new URLSearchParams(location.search).get('server')
    || globalThis.MINIIGAME_SERVER
    || (() => { try { return localStorage.getItem('miniigame:server'); } catch { return null; } })()
    || 'local';
}

export class NetClient {
  constructor(url) {
    this.url = url;
    this.handlers = {};
    this.id = null;
    this.room = null;
    this.latency = 0;
    this.closed = false;
  }

  /** 이벤트: room, start, msg(from, d), left(id), error(msg), close. 반환값을 호출하면 해제 */
  on(type, fn) {
    (this.handlers[type] ??= new Set()).add(fn);
    return () => this.handlers[type]?.delete(fn);
  }
  emit(type, ...args) { for (const fn of this.handlers[type] ?? []) { try { fn(...args); } catch (e) { console.error(e); } } }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('서버 연결 시간 초과')), 8000);
      this._onWelcome = () => { clearTimeout(timeout); resolve(this); };
      if (this.url === 'local') {
        if (!globalThis.SharedWorker) { clearTimeout(timeout); reject(new Error('이 브라우저는 로컬 테스트 서버(SharedWorker)를 지원하지 않아요. 서버 주소를 입력하세요.')); return; }
        this.worker = new SharedWorker(new URL('./local-worker.js', import.meta.url), { type: 'module', name: 'miniigame-local' });
        this.port = this.worker.port;
        this.port.onmessage = (e) => this.recv(e.data);
        this.port.start();
        this._send = (o) => this.port.postMessage(JSON.stringify(o));
        this._pagehide = () => this.port.postMessage('__close');
        addEventListener('pagehide', this._pagehide);
      } else {
        let ws;
        try { ws = new WebSocket(this.url); } catch (e) { clearTimeout(timeout); reject(e); return; }
        this.ws = ws;
        ws.onmessage = (e) => { try { this.recv(JSON.parse(e.data)); } catch { /* ignore */ } };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('서버에 연결할 수 없어요')); };
        ws.onclose = () => { if (!this.closed) this.emit('close'); this.closed = true; };
        this._send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
      }
    });
  }

  recv(m) {
    switch (m.t) {
      case 'welcome': this.id = m.id; this._onWelcome?.(); this.ping(); break;
      case 'room': this.room = m.room; this.emit('room', m.room); break;
      case 'start': this.emit('start', m); break;
      case 'msg': this.emit('msg', m.from, m.d); break;
      case 'left': this.emit('left', m.id); break;
      case 'error': this.emit('error', m.msg, m.code); break;
      case 'pong': this.latency = Math.round((performance.now() - m.c) / 2); this.emit('pong', this.latency); break;
    }
  }

  send(o) { this._send?.(o); }
  hello(name) { this.send({ t: 'hello', name }); }
  create(game, settings) { this.send({ t: 'create', game, settings }); }
  join(code) { this.send({ t: 'join', code }); }
  leave() { this.send({ t: 'leave' }); this.room = null; this.emit('room', null); }
  setInfo(info, ready) { this.send({ t: 'info', info, ready }); }
  setSettings(settings) { this.send({ t: 'settings', settings }); }
  start() { this.send({ t: 'start' }); }
  end() { this.send({ t: 'end' }); }
  relay(d, to) { this.send(to ? { t: 'msg', d, to } : { t: 'msg', d }); }
  ping() { this.send({ t: 'ping', c: performance.now() }); }

  get isHost() { return !!this.room && this.room.host === this.id; }
  get me() { return this.room?.players.find((p) => p.id === this.id); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { if (this.room) this.send({ t: 'leave' }); } catch { /* ignore */ }
    if (this.port) { this.port.postMessage('__close'); removeEventListener('pagehide', this._pagehide); }
    this.ws?.close();
  }
}
