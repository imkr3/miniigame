// 멀티플레이 방(로비) 서버 핵심 로직 - 게임과 무관한 "방 + 메시지 중계" 서버
// 의존성 없음. Node(WebSocket, server/server.js)와 브라우저(SharedWorker, local-worker.js) 양쪽에서 그대로 사용한다.
//
// 프로토콜 (JSON)
//  클라 → 서버
//   { t:'hello', name }                       닉네임 설정
//   { t:'create', game, settings }            방 만들기 (만든 사람이 방장)
//   { t:'join', code }                        코드로 참가
//   { t:'leave' }                             방 나가기
//   { t:'info', info, ready }                 내 정보(캐릭터 등)·준비 상태
//   { t:'settings', settings }                방 설정 변경 (방장만)
//   { t:'start' }                             게임 시작 (방장만) → 모두에게 start
//   { t:'end' }                               게임 끝 → 방을 대기 상태로 (방장만)
//   { t:'msg', d, to? }                       게임 메시지 중계 (to 가 있으면 그 사람에게만)
//   { t:'ping', c }                           지연 측정
//  서버 → 클라
//   { t:'welcome', id, v }  { t:'room', room }  { t:'start', seed, settings, players }
//   { t:'msg', from, d }    { t:'left', id }    { t:'error', code, msg }  { t:'pong', c, s }

export const PROTOCOL = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
const MAX_MSG = 16 * 1024;

export const GAME_LIMITS = {
  blocks: { max: 8 },
  kart: { max: 8 },
};

export class RoomServer {
  constructor({ log = () => {}, games = GAME_LIMITS } = {}) {
    this.rooms = new Map();
    this.conns = new Map();
    this.nextId = 1;
    this.log = log;
    this.games = games;
  }

  /** 새 연결. send(obj) 는 그 클라이언트에게 객체를 보내는 함수. 반환값의 message/close 를 연결 쪽에서 호출 */
  connect(send) {
    const c = { id: `p${this.nextId++}${Math.random().toString(36).slice(2, 5)}`, send, name: '플레이어', room: null, info: {}, ready: false };
    this.conns.set(c.id, c);
    this.safeSend(c, { t: 'welcome', id: c.id, v: PROTOCOL });
    return { id: c.id, message: (raw) => this.onMessage(c, raw), close: () => this.onClose(c) };
  }

  safeSend(c, obj) { try { c.send(obj); } catch (e) { this.log('send fail', c.id, e?.message); } }

  onMessage(c, raw) {
    if (typeof raw === 'string' && raw.length > MAX_MSG) return;
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = c.room ? this.rooms.get(c.room) : null;
    switch (m.t) {
      case 'hello':
        c.name = String(m.name ?? '').trim().slice(0, 12) || c.name;
        if (room) this.broadcastRoom(room);
        break;
      case 'create': {
        const game = this.games[m.game];
        if (!game) return this.error(c, 'bad_game', '지원하지 않는 게임');
        if (room) this.leaveRoom(c);
        let code;
        do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (this.rooms.has(code));
        const r = { code, game: m.game, host: c.id, players: [c.id], state: 'lobby', settings: obj(m.settings), max: game.max, created: Date.now() };
        this.rooms.set(code, r);
        c.room = code; c.ready = false;
        this.log('create', code, m.game, c.id);
        this.broadcastRoom(r);
        break;
      }
      case 'join': {
        const code = String(m.code ?? '').toUpperCase().trim();
        const r = this.rooms.get(code);
        if (!r) return this.error(c, 'no_room', '방을 찾을 수 없어요');
        if (r.players.includes(c.id)) return this.broadcastRoom(r);
        if (r.players.length >= r.max) return this.error(c, 'full', '방이 가득 찼어요');
        if (room) this.leaveRoom(c);
        r.players.push(c.id);
        c.room = code; c.ready = false;
        this.broadcastRoom(r);
        break;
      }
      case 'leave':
        if (room) this.leaveRoom(c);
        break;
      case 'info':
        if (!room) return;
        c.info = obj(m.info);
        c.ready = !!m.ready;
        this.broadcastRoom(room);
        break;
      case 'settings':
        if (!room || room.host !== c.id) return;
        room.settings = obj(m.settings);
        this.broadcastRoom(room);
        break;
      case 'start': {
        if (!room || room.host !== c.id) return;
        room.state = 'playing';
        room.seed = Math.floor(Math.random() * 2 ** 31);
        const players = room.players.map((id) => this.view(this.conns.get(id)));
        for (const id of room.players) { const p = this.conns.get(id); p.ready = false; this.safeSend(p, { t: 'start', seed: room.seed, settings: room.settings, players, game: room.game }); }
        this.broadcastRoom(room);
        break;
      }
      case 'end':
        if (!room || room.host !== c.id) return;
        room.state = 'lobby';
        this.broadcastRoom(room);
        break;
      case 'msg': {
        if (!room) return;
        const out = { t: 'msg', from: c.id, d: m.d };
        if (m.to) { const p = this.conns.get(m.to); if (p && p.room === room.code) this.safeSend(p, out); }
        else for (const id of room.players) if (id !== c.id) this.safeSend(this.conns.get(id), out);
        break;
      }
      case 'ping':
        this.safeSend(c, { t: 'pong', c: m.c, s: Date.now() });
        break;
    }
  }

  onClose(c) {
    if (c.room) this.leaveRoom(c);
    this.conns.delete(c.id);
  }

  leaveRoom(c) {
    const r = this.rooms.get(c.room);
    c.room = null; c.ready = false;
    if (!r) return;
    r.players = r.players.filter((id) => id !== c.id);
    if (!r.players.length) { this.rooms.delete(r.code); this.log('close', r.code); return; }
    if (r.host === c.id) r.host = r.players[0]; // 방장이 나가면 다음 사람이 방장
    for (const id of r.players) this.safeSend(this.conns.get(id), { t: 'left', id: c.id });
    this.broadcastRoom(r);
  }

  view(c) { return { id: c.id, name: c.name, ready: c.ready, info: c.info }; }

  roomView(r) {
    return { code: r.code, game: r.game, host: r.host, state: r.state, settings: r.settings, max: r.max, players: r.players.map((id) => this.view(this.conns.get(id))) };
  }

  broadcastRoom(r) {
    const room = this.roomView(r);
    for (const id of r.players) this.safeSend(this.conns.get(id), { t: 'room', room });
  }

  error(c, code, msg) { this.safeSend(c, { t: 'error', code, msg }); }

  stats() { return { rooms: this.rooms.size, connections: this.conns.size }; }
}

function obj(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const s = JSON.stringify(v);
  return s.length > 2000 ? {} : JSON.parse(s);
}
