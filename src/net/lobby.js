// 공통 멀티플레이 로비 화면 (게임 화면 위에 뜨는 패널)
// 게임은 static multiplayer = { min, max, label } 과 lobbyConfig() → { settings: [...], info: [...] }, startMulti(net, start) 를 제공
import { NetClient, resolveServer } from './net.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const CSS = `
.mg-lobby .mg-panel{max-width:420px}
.mg-lobby h2{margin:0 0 4px;font-size:20px}
.mg-lobby .mg-sub{color:#94a3b8;font-size:12px;margin:0 0 12px;line-height:1.5}
.mg-lobby input[type=text]{width:100%;background:#1d2130;color:#e5e7eb;border:1px solid #333a4f;border-radius:10px;padding:10px 12px;font:inherit;font-size:15px}
.mg-lobby .mg-code-in{text-transform:uppercase;letter-spacing:4px;font-weight:800;text-align:center}
.mg-lobby .mg-btn{border:0;border-radius:10px;padding:11px 14px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;background:#2a3040;color:#e5e7eb;width:100%}
.mg-lobby .mg-btn.mg-primary{background:var(--mg-accent);color:#fff}
.mg-lobby .mg-btn:disabled{opacity:.45;cursor:not-allowed}
.mg-lobby .mg-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mg-lobby .mg-gap{height:10px}
.mg-lobby .mg-roomcode{font-size:34px;font-weight:900;letter-spacing:8px;text-align:center;color:#fde68a;margin:2px 0}
.mg-lobby .mg-players{list-style:none;margin:8px 0;padding:0}
.mg-lobby .mg-players li{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:8px;background:#151925;margin-bottom:5px;font-size:14px}
.mg-lobby .mg-players li.mg-me{outline:2px solid #3b82f6}
.mg-lobby .mg-tag{font-size:11px;padding:2px 8px;border-radius:999px;background:#334155;color:#cbd5e1;margin-left:6px}
.mg-lobby .mg-tag.mg-ok{background:#166534;color:#bbf7d0}
.mg-lobby .mg-err{color:#fca5a5;font-size:13px;margin:8px 0 0}
.mg-lobby .mg-server{font-size:12px;color:#94a3b8;margin-top:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.mg-lobby .mg-server button{background:none;border:0;color:#93c5fd;cursor:pointer;font:inherit;text-decoration:underline;padding:0}
`;

export class Lobby {
  constructor(game) {
    this.game = game;
    this.name = load('miniigame:name', '');
    this.info = load(`miniigame:${game.meta.id}:mpinfo`, null);
    if (!document.getElementById('mg-lobby-style')) {
      const s = document.createElement('style'); s.id = 'mg-lobby-style'; s.textContent = CSS; document.head.appendChild(s);
    }
  }

  get net() { return this.game.net; }
  get cfg() { return this.game.lobbyConfig(); }

  open() {
    if (this.el) return;
    if (this.game.state === 'playing') this.game.pause();
    this.el = document.createElement('div');
    this.el.className = 'mg-settings mg-lobby';
    this.game.root.appendChild(this.el);
    this.game.lobbyOpen = true;
    if (this.net && !this.net.closed) this.render(); else this.renderConnect();
  }

  close() {
    this.el?.remove();
    this.el = null;
    this.game.lobbyOpen = false;
  }

  panel(html) {
    this.el.innerHTML = `<div class="mg-panel">${html}</div>`;
    return (sel) => this.el.querySelector(sel);
  }

  serverLabel(url) { return url === 'local' ? '로컬 테스트 (같은 브라우저의 다른 탭끼리)' : url; }

  // ---------- 1단계: 닉네임 + 연결 ----------
  renderConnect(error = '') {
    const url = resolveServer(this.game.opts?.server);
    const $ = this.panel(`
      <h2>🌐 ${esc(this.game.constructor.multiplayer.label ?? '멀티플레이')}</h2>
      <p class="mg-sub">${esc(this.game.meta.title)} · 최대 ${this.game.constructor.multiplayer.max}명</p>
      <input type="text" class="mg-name" maxlength="12" placeholder="닉네임" value="${esc(this.name)}">
      <div class="mg-gap"></div>
      <button class="mg-btn mg-primary mg-go">접속하기</button>
      ${error ? `<p class="mg-err">${esc(error)}</p>` : ''}
      <div class="mg-server">서버: <span>${esc(this.serverLabel(url))}</span> <button class="mg-chg">변경</button></div>
      <div class="mg-gap"></div>
      <button class="mg-btn mg-close">닫기</button>`);
    const go = () => {
      this.name = $('.mg-name').value.trim().slice(0, 12) || `플레이어${Math.floor(Math.random() * 900 + 100)}`;
      save('miniigame:name', this.name);
      this.connect(url);
    };
    $('.mg-go').onclick = go;
    $('.mg-name').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('.mg-close').onclick = () => this.close();
    $('.mg-chg').onclick = () => {
      const v = prompt('멀티플레이 서버 주소 (예: wss://example.com/miniigame-ws)\n비우면 로컬 테스트 모드', url === 'local' ? '' : url);
      if (v === null) return;
      try { if (v.trim()) localStorage.setItem('miniigame:server', v.trim()); else localStorage.removeItem('miniigame:server'); } catch { /* ignore */ }
      this.renderConnect();
    };
    setTimeout(() => $('.mg-name')?.focus(), 50);
  }

  async connect(url) {
    this.panel('<h2>접속 중…</h2>');
    const net = new NetClient(url);
    try {
      await net.connect();
    } catch (e) {
      net.close();
      return this.renderConnect(e.message);
    }
    this.game.net = net;
    net.hello(this.name);
    net.on('room', () => { if (this.el) this.render(); });
    net.on('error', (msg) => { this.error = msg; if (this.el) this.render(); });
    net.on('close', () => { this.game.onNetClosed?.(); this.game.net = null; if (this.el) this.renderConnect('서버와 연결이 끊어졌어요'); });
    // 게임 시작 신호는 로비가 닫혀 있어도 받음 (결과 화면을 보는 중에 방장이 다음 판 시작 등)
    net.on('start', (m) => { this.close(); this.game.startMulti(net, m); });
    this.render();
  }

  // ---------- 2단계: 방 만들기 / 참가 ----------
  render() {
    const net = this.net;
    if (!net) return this.renderConnect();
    if (!net.room) return this.renderHome();
    return this.renderRoom();
  }

  renderHome() {
    const err = this.error; this.error = '';
    const $ = this.panel(`
      <h2>🌐 ${esc(this.game.meta.title)} 멀티플레이</h2>
      <p class="mg-sub">${esc(this.name)} 님, 방을 만들거나 친구가 알려준 코드로 참가하세요.</p>
      <button class="mg-btn mg-primary mg-create">방 만들기</button>
      <div class="mg-gap"></div>
      <div class="mg-grid2"><input type="text" class="mg-code-in" maxlength="4" placeholder="코드"><button class="mg-btn mg-join">참가</button></div>
      ${err ? `<p class="mg-err">${esc(err)}</p>` : ''}
      <div class="mg-gap"></div>
      <button class="mg-btn mg-close">닫기</button>`);
    $('.mg-create').onclick = () => {
      const settings = {};
      for (const it of this.cfg.settings) settings[it.id] = it.default;
      this.net.create(this.game.meta.id, settings);
    };
    const join = () => { const code = $('.mg-code-in').value.trim(); if (code.length === 4) this.net.join(code); };
    $('.mg-join').onclick = join;
    $('.mg-code-in').onkeydown = (e) => { if (e.key === 'Enter') join(); };
    $('.mg-close').onclick = () => this.close();
  }

  // ---------- 3단계: 방 ----------
  field(it, value, editable, cls) {
    if (!editable) {
      const shown = it.type === 'select' ? (it.options.find(([v]) => String(v) === String(value))?.[1] ?? value) : it.type === 'toggle' ? (value ? '켜짐' : '꺼짐') : value;
      return `<span>${esc(shown)}</span>`;
    }
    if (it.type === 'select') return `<select class="${cls}" data-id="${it.id}">${it.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (it.type === 'toggle') return `<input type="checkbox" class="${cls}" data-id="${it.id}" ${value ? 'checked' : ''}>`;
    return `<input type="range" class="${cls}" data-id="${it.id}" min="${it.min}" max="${it.max}" step="${it.step ?? 1}" value="${value}"> <span class="mg-val">${value}</span>`;
  }

  readField(el, it) { return it.type === 'toggle' ? el.checked : it.type === 'range' || typeof it.default === 'number' ? Number(el.value) : el.value; }

  renderRoom() {
    const net = this.net, room = net.room, cfg = this.cfg, mp = this.game.constructor.multiplayer;
    const host = net.isHost, me = net.me;
    // 내 정보(캐릭터 등) 기본값 전송
    if (!this.info) { this.info = {}; for (const it of cfg.info) this.info[it.id] = it.default; }
    if (cfg.info.length && JSON.stringify(me?.info ?? {}) !== JSON.stringify(this.info)) net.setInfo(this.info, me?.ready ?? false);
    const others = room.players.filter((p) => p.id !== room.host);
    const allReady = others.every((p) => p.ready);
    const canStart = host && room.players.length >= mp.min && room.state !== 'playing';
    const err = this.error; this.error = '';
    const $ = this.panel(`
      <p class="mg-sub" style="text-align:center;margin:0">방 코드 (친구에게 알려주세요)</p>
      <div class="mg-roomcode">${esc(room.code)}</div>
      <ul class="mg-players">${room.players.map((p) => `<li class="${p.id === net.id ? 'mg-me' : ''}"><span>${p.id === room.host ? '👑 ' : ''}${esc(p.name)}${p.id === net.id ? ' (나)' : ''}</span>
        <span>${esc(this.game.describeInfo?.(p.info) ?? '')}${p.id !== room.host ? `<span class="mg-tag ${p.ready ? 'mg-ok' : ''}">${p.ready ? '준비 완료' : '대기'}</span>` : '<span class="mg-tag">방장</span>'}</span></li>`).join('')}</ul>
      <p class="mg-sub" style="margin:0 0 6px">${room.players.length}/${room.max}명 · 최소 ${mp.min}명부터 시작${room.state === 'playing' ? ' · <b style="color:#fde68a">게임 진행 중 - 다음 판부터 참가</b>' : ''}</p>
      ${cfg.settings.length ? `<h3>방 설정${host ? '' : ' (방장만 변경)'}</h3>${cfg.settings.map((it) => `<div class="mg-row"><span>${esc(it.label)}</span><span class="mg-ctl">${this.field(it, room.settings[it.id] ?? it.default, host, 'mg-set')}</span></div>`).join('')}` : ''}
      ${cfg.info.length ? `<h3>내 선택</h3>${cfg.info.map((it) => `<div class="mg-row"><span>${esc(it.label)}</span><span class="mg-ctl">${this.field(it, this.info[it.id] ?? it.default, true, 'mg-info')}</span></div>`).join('')}` : ''}
      ${err ? `<p class="mg-err">${esc(err)}</p>` : ''}
      <div class="mg-gap"></div>
      ${host
        ? `<button class="mg-btn mg-primary mg-start" ${canStart ? '' : 'disabled'}>게임 시작${!allReady && others.length ? ' (준비 안 된 사람 있음)' : ''}</button>`
        : `<button class="mg-btn ${me?.ready ? '' : 'mg-primary'} mg-ready">${me?.ready ? '준비 취소' : '준비 완료'}</button>`}
      <div class="mg-gap"></div>
      <div class="mg-grid2"><button class="mg-btn mg-leave">방 나가기</button><button class="mg-btn mg-close">닫기</button></div>
      <p class="mg-sub" style="margin-top:10px">지연 ${net.latency}ms · ${esc(this.serverLabel(net.url))}</p>`);
    this.el.querySelectorAll('.mg-set').forEach((el) => {
      const it = cfg.settings.find((x) => x.id === el.dataset.id);
      el.onchange = () => net.setSettings({ ...room.settings, [it.id]: this.readField(el, it) });
      if (it.type === 'range') el.oninput = () => { el.nextElementSibling.textContent = el.value; };
    });
    this.el.querySelectorAll('.mg-info').forEach((el) => {
      const it = cfg.info.find((x) => x.id === el.dataset.id);
      el.onchange = () => { this.info = { ...this.info, [it.id]: this.readField(el, it) }; save(`miniigame:${this.game.meta.id}:mpinfo`, this.info); net.setInfo(this.info, me?.ready ?? false); };
    });
    $('.mg-start') && ($('.mg-start').onclick = () => net.start());
    $('.mg-ready') && ($('.mg-ready').onclick = () => net.setInfo(this.info ?? {}, !me?.ready));
    $('.mg-leave').onclick = () => net.leave();
    $('.mg-close').onclick = () => this.close();
  }
}
