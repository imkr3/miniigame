// 공통 게임 엔진
// - 화면(캔버스) 크기를 컨테이너에 맞춰 자동 조절 (fit 모드: 높이까지 맞춤)
// - 입력 통일: 키보드 / 터치(탭·스와이프) / 화면 가상 패드 / 마우스
// - HUD(점수·최고점수·정보·소리·일시정지), 시작·일시정지·게임오버 오버레이
// - 효과음, 파티클·화면 흔들림·떠오르는 글자
// 각 게임은 GameBase를 상속해서 init / update(dt) / draw(ctx) / onAction(action, repeat) 만 구현하면 된다.
import { sfx } from './sfx.js';

const BASE_KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'action', Enter: 'action',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  KeyR: 'restart',
};

const CSS = `
.mg-root{--mg-bg:#0e0f14;--mg-panel:#171a23;--mg-accent:#3b82f6;display:flex;flex-direction:column;width:100%;margin:0 auto;
  font-family:system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#e5e7eb;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
  background:var(--mg-panel);border-radius:14px;overflow:hidden;box-sizing:border-box}
.mg-root *{box-sizing:border-box}
.mg-root.mg-fit{height:100%;border-radius:0}
.mg-hud{display:flex;gap:12px;align-items:center;padding:8px 10px 8px 14px;font-size:14px;flex:none}
.mg-hud b{font-variant-numeric:tabular-nums;font-size:16px;margin-left:3px}
.mg-hud .mg-info{flex:1;text-align:right;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-hud button{touch-action:manipulation;background:#262b3a;color:#e5e7eb;border:0;border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:15px;line-height:1;flex:none}
.mg-hud button:hover{background:#323949}
.mg-stage{position:relative;display:flex;align-items:center;justify-content:center;background:var(--mg-bg);overflow:hidden}
.mg-fit .mg-stage{flex:1;min-height:0}
.mg-screen{position:relative;flex:none}
.mg-screen canvas{display:block;width:100%;height:100%;touch-action:none}
.mg-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  text-align:center;background:rgba(9,10,15,.78);padding:16px;backdrop-filter:blur(2px);cursor:pointer;animation:mg-fade .2s}
.mg-overlay[hidden]{display:none}
.mg-overlay h2{margin:0;font-size:clamp(20px,5vw,30px);letter-spacing:-.5px}
.mg-overlay p{margin:0;opacity:.85;font-size:14px;line-height:1.6;max-width:340px}
.mg-overlay .mg-big{font-size:clamp(28px,8vw,44px);font-weight:800;font-variant-numeric:tabular-nums}
.mg-overlay .mg-new{color:#facc15;font-weight:700}
.mg-actions{display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;justify-content:center}
.mg-actions button{border:0;border-radius:999px;padding:11px 22px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;
  background:#2a3040;color:#e5e7eb;touch-action:manipulation}
.mg-actions button:hover{filter:brightness(1.15)}
.mg-actions button.mg-primary{background:var(--mg-accent);color:#fff;animation:mg-pulse 1.6s ease-in-out infinite}
.mg-overlay .mg-keys{font-size:12px;opacity:.55;margin:0}
.mg-records{list-style:none;margin:2px 0 0;padding:0;font-size:13px;min-width:180px;font-variant-numeric:tabular-nums}
.mg-records li{display:flex;justify-content:space-between;gap:16px;padding:3px 10px;border-radius:6px;opacity:.75}
.mg-records li.mg-me{background:rgba(250,204,21,.15);color:#fde68a;opacity:1;font-weight:700}
@media (max-height:420px){.mg-records{display:none}}
@keyframes mg-pulse{50%{transform:scale(1.05)}}
@keyframes mg-fade{from{opacity:0}}
.mg-pad{display:none;justify-content:space-between;align-items:center;gap:12px;flex:none;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));touch-action:none}
.mg-touch .mg-pad{display:flex}
.mg-pad button{border:0;border-radius:16px;background:#262b3a;color:#e5e7eb;font-size:20px;font-weight:700;
  touch-action:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .05s,background .05s;
  box-shadow:0 3px 0 #0b0d13}
.mg-pad button.mg-on{background:#3a4258;transform:translateY(2px);box-shadow:0 1px 0 #0b0d13}
.mg-pad button.mg-primary{background:var(--mg-accent);color:#fff;box-shadow:0 3px 0 #1d4ed8}
.mg-pad button.mg-primary.mg-on{background:#2563eb}
.mg-dpad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(3,58px);gap:4px;
  grid-template-areas:". up ." "left . right" ". down ."}
.mg-pad button.mg-txt{font-size:14px;white-space:nowrap}
.mg-lr{display:flex;gap:10px}
.mg-lr button{width:72px;height:64px}
.mg-btns{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.mg-btns button{min-width:64px;height:64px;padding:0 12px;font-size:17px;border-radius:50px}
.mg-btns button.mg-wide{min-width:120px;height:72px}
/* 가로 모드(폰 눕힘): 버튼을 화면 양옆으로 */
.mg-land{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr;grid-template-areas:"hud hud hud" "pl stage pr"}
.mg-land .mg-hud{grid-area:hud;padding-left:max(14px,env(safe-area-inset-left));padding-right:max(10px,env(safe-area-inset-right))}
.mg-land .mg-stage{grid-area:stage;min-width:0}
.mg-land .mg-pad{display:contents}
.mg-land .mg-pad>:first-child{grid-area:pl;align-self:end;padding:10px 10px max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
.mg-land .mg-pad>:last-child{grid-area:pr;align-self:end;flex-direction:column-reverse;flex-wrap:nowrap;
  padding:10px max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) 10px}
.mg-land .mg-btns button.mg-wide{min-width:96px;height:96px;border-radius:50%}
@media (max-height:560px){.mg-dpad{grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px)}
  .mg-btns button{height:52px;min-width:52px}.mg-lr button{height:52px;width:60px}.mg-pad{padding-top:6px}}
`;

function injectStyle() {
  if (document.getElementById('mg-style')) return;
  const s = document.createElement('style');
  s.id = 'mg-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const storage = {
  get(key) { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } },
  set(key, v) { try { localStorage.setItem(key, String(v)); } catch { /* 저장 불가 환경 무시 */ } },
};

export const getBest = (id) => storage.get(`miniigame:${id}:best`);

/** 게임별 상위 5개 기록 [{ s: 점수, d: 날짜(ms) }] */
export function getTop(id) {
  try { return JSON.parse(localStorage.getItem(`miniigame:${id}:top`)) || []; } catch { return []; }
}
function pushTop(id, score) {
  const entry = { s: score, d: Date.now() };
  const top = [...getTop(id), entry].sort((a, b) => b.s - a.s).slice(0, 5);
  try { localStorage.setItem(`miniigame:${id}:top`, JSON.stringify(top)); } catch { /* ignore */ }
  return { top, rank: top.indexOf(entry) };
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const isCoarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

// 한 페이지에 게임이 여러 개 있어도 마지막으로 클릭/시작한 게임만 키 입력을 받는다.
let activeGame = null;

export class GameBase {
  /** 게임 정보. controls = 키보드 설명, touchControls = 모바일 설명 */
  static meta = { id: 'base', title: 'Game', description: '', controls: '', touchControls: '' };
  /** 추가 키 매핑 예: { KeyC: 'hold' } */
  static keys = {};
  /** 모바일 가상 패드: left = 'dpad' | 'lr' | null, buttons = [{ action, label, primary?, wide? }] */
  static pad = { left: 'dpad', buttons: [] };
  /** 터치 제스처 → 액션 (null 이면 무시) */
  static gestures = { tap: 'action', left: 'left', right: 'right', up: 'up', down: 'down' };
  /** 플레이 중 마우스 클릭 → 액션 */
  static mouseClick = null;

  /**
   * @param {HTMLElement} container 게임을 붙일 요소
   * @param {object} opts
   * @param {number} opts.width 논리 해상도 너비
   * @param {number} opts.height 논리 해상도 높이
   * @param {boolean} [opts.fit] true면 컨테이너 높이까지 꽉 채움 (전체화면 페이지용)
   * @param {number} [opts.maxWidth] fit이 아닐 때 최대 너비(px)
   * @param {'auto'|'always'|'never'} [opts.controls] 가상 패드 표시
   * @param {(e:object)=>void} [opts.onEvent]
   * @param {()=>void} [opts.onExit] 지정하면 HUD 왼쪽에 '나가기' 버튼 표시
   */
  constructor(container, { width, height, fit = false, maxWidth, controls = 'auto', onEvent, onExit } = {}) {
    injectStyle();
    const C = this.constructor;
    this.meta = C.meta;
    this.keymap = { ...BASE_KEYS, ...C.keys };
    this.width = width;
    this.height = height;
    this.fit = fit;
    this.controlsMode = controls;
    this.onEvent = onEvent;
    this.onExit = onExit;
    this.state = 'ready'; // ready | playing | paused | over
    this.score = 0;
    this.time = 0;        // 플레이 시간(초)
    this.bestKey = `miniigame:${this.meta.id}:best`;
    this.best = storage.get(this.bestKey);
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false, type: 'mouse', moved: false };
    this.fx = [];
    this._shake = { t: 0, amount: 0 };
    this.touchMode = controls === 'always' || (controls === 'auto' && isCoarse());

    this._buildDom(container, maxWidth ?? Math.round(width * 1.5));
    this._bindEvents();
    activeGame = this;

    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  // ---- 서브클래스가 구현할 훅 ----
  init() {}
  update(_dt) {}
  draw(_ctx) {}
  onAction(_action, _repeat) {}

  // ---- 서브클래스용 유틸 ----
  isDown(action) { return this.keys.has(action); }
  setScore(n) { if (n !== this.score) { this.score = n; this._renderHud(); } }
  addScore(n) { this.setScore(this.score + n); }
  setInfo(text) { if (this.$info.textContent !== text) this.$info.textContent = text; }
  sound(name) { sfx.play(name); }
  vibrate(ms = 30) { if (this.touchMode) navigator.vibrate?.(ms); }

  /** 파티클 폭발 */
  burst(x, y, { color = '#fff', count = 12, speed = 140, life = 0.6, size = 3, gravity = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.fx.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size, color, gravity });
    }
  }
  /** 떠오르는 글자 (예: +200) */
  floatText(x, y, text, color = '#fde68a', size = 16) {
    this.fx.push({ kind: 't', x, y, vx: 0, vy: -40, life: 0.9, max: 0.9, text, color, size, gravity: 0 });
  }
  shake(amount = 6, time = 0.25) { this._shake = { t: time, max: time, amount }; }

  gameOver(title = '게임 오버') {
    if (this.state === 'over') return;
    this.state = 'over';
    this.keys.clear();
    this._overAt = performance.now();
    const isBest = this.score > this.best;
    if (isBest) { this.best = this.score; storage.set(this.bestKey, this.best); }
    const { top, rank } = this.score > 0 ? pushTop(this.meta.id, this.score) : { top: getTop(this.meta.id), rank: -1 };
    this._renderHud();
    this.sound('over');
    this.vibrate(120);
    const medal = ['🥇', '🥈', '🥉', '4', '5'];
    const list = top.length ? `<ol class="mg-records">${top.map((r, i) => {
      const d = new Date(r.d);
      return `<li class="${i === rank ? 'mg-me' : ''}"><span>${medal[i]}</span><span>${r.s}</span><span>${d.getMonth() + 1}/${d.getDate()}</span></li>`;
    }).join('')}</ol>` : '';
    const badge = isBest && this.score > 0 ? '<div class="mg-new">🏆 최고 기록!</div>'
      : rank >= 0 ? `<div class="mg-new">${rank + 1}위 기록!</div>` : '';
    this._showOverlay(title, `<div class="mg-big">${this.score}</div>${badge}${list}`, 'restart');
    this._emit('gameover', { score: this.score, best: this.best, newBest: isBest });
  }

  // ---- 외부(호스트 사이트)에서 쓰는 API ----
  start() {
    this.setScore(0);
    this.time = 0;
    this.fx = [];
    this.init();
    this.state = 'playing';
    this._hideOverlay();
    this.sound('start');
    this._emit('start');
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys.clear();
    this._showOverlay('일시정지', '', 'resume');
    this._renderButtons();
    this._emit('pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._last = performance.now();
    this._hideOverlay();
    this._renderButtons();
    this._emit('resume');
  }
  togglePause() { this.state === 'playing' ? this.pause() : this.resume(); }
  /** 진행 중인 판을 버리고 새로 시작 */
  restart() { this.keys.clear(); this._emit('restart'); this.start(); }
  toggleMute() { sfx.setMuted(!sfx.muted); this._renderButtons(); }
  destroy() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerdown', this._onDocPointer);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.root.remove();
    if (activeGame === this) activeGame = null;
  }

  // ---- 내부 ----
  _emit(type, data = {}) {
    this.onEvent?.({ type, game: this.meta.id, score: this.score, ...data });
  }

  _buildDom(container, maxWidth) {
    const root = document.createElement('div');
    root.className = 'mg-root' + (this.fit ? ' mg-fit' : '');
    if (!this.fit) root.style.maxWidth = `${maxWidth}px`;
    root.innerHTML = `
      <div class="mg-hud">
        <button type="button" class="mg-exit" aria-label="나가기">←</button>
        <span>점수<b class="mg-score">0</b></span>
        <span>최고<b class="mg-best">0</b></span>
        <span class="mg-info"></span>
        <button type="button" class="mg-mute" aria-label="소리"></button>
        <button type="button" class="mg-pause" aria-label="일시정지"></button>
      </div>
      <div class="mg-stage">
        <div class="mg-screen">
          <canvas></canvas>
          <div class="mg-overlay"></div>
        </div>
      </div>
      <div class="mg-pad"></div>`;
    container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.$score = $('.mg-score');
    this.$best = $('.mg-best');
    this.$info = $('.mg-info');
    this.$stage = $('.mg-stage');
    this.$screen = $('.mg-screen');
    this.$overlay = $('.mg-overlay');
    this.$pad = $('.mg-pad');
    this.$mute = $('.mg-mute');
    this.$pauseBtn = $('.mg-pause');
    const $exit = $('.mg-exit');
    if (this.onExit) $exit.addEventListener('click', () => this.onExit()); else $exit.remove();
    this.$mute.addEventListener('click', () => { sfx.unlock(); this.toggleMute(); });
    this.$pauseBtn.addEventListener('click', () => {
      sfx.unlock();
      if (this.state === 'ready' || this.state === 'over') this.start(); else this.togglePause();
    });
    this.canvas = $('canvas');
    this.ctx = this.canvas.getContext('2d');

    this._buildPad();
    this._applyTouchMode();
    this._renderHud();
    this._renderButtons();
    this._showOverlay(this.meta.title,
      `<p>${esc(this.meta.description)}</p>{{controls}}${this.best ? `<p class="mg-new">🏆 내 최고 ${this.best}</p>` : ''}`, 'start');

    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this.$stage);
    this._ro.observe(this.root);
    this._layout();
  }

  _buildPad() {
    const { left, buttons = [], labels = {} } = this.constructor.pad;
    const L = { up: '▲', left: '◀', right: '▶', down: '▼', ...labels };
    const btn = (action) =>
      `<button type="button" data-action="${action}" class="${L[action].length > 1 ? 'mg-txt' : ''}" style="grid-area:${action}">${L[action]}</button>`;
    let leftHtml = '<div></div>';
    if (left === 'dpad') leftHtml = `<div class="mg-dpad">${btn('up')}${btn('left')}${btn('right')}${btn('down')}</div>`;
    if (left === 'lr') leftHtml = `<div class="mg-lr">${btn('left')}${btn('right')}</div>`;
    const right = buttons.map((b) =>
      `<button type="button" data-action="${b.action}" class="${b.primary ? 'mg-primary' : ''} ${b.wide ? 'mg-wide' : ''}">${b.label}</button>`).join('');
    this.$pad.innerHTML = `${leftHtml}<div class="mg-btns">${right}</div>`;

    this.$pad.querySelectorAll('button').forEach((el) => {
      const action = el.dataset.action;
      const release = () => { el.classList.remove('mg-on'); this.keys.delete(action); };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sfx.unlock();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('mg-on');
        this.keys.add(action);
        activeGame = this;
        this._press(action);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  _controlsText() {
    return this.touchMode ? (this.meta.touchControls || this.meta.controls) : this.meta.controls;
  }

  _setTouchMode(on) {
    if (this.controlsMode !== 'auto' || this.touchMode === on) return;
    this.touchMode = on;
    this._applyTouchMode();
  }

  _applyTouchMode() {
    this.root.classList.toggle('mg-touch', this.touchMode);
    // 오버레이 안내 문구 갱신
    if (!this.$overlay.hidden && this._overlayKind) {
      const k = this.$overlay.querySelector('.mg-keys');
      if (k) k.textContent = this._hintText(this._overlayKind);
      const p = this.$overlay.querySelector('.mg-ctrl');
      if (p) p.textContent = this._controlsText();
    }
    if (this._ro) this._layout();
  }

  _layout() {
    // 폰을 눕혔을 때는 버튼을 양옆으로 배치
    const land = this.fit && this.touchMode && this.root.clientWidth > this.root.clientHeight * 1.15;
    if (land !== this.root.classList.contains('mg-land')) this.root.classList.toggle('mg-land', land);
    const availW = this.$stage.clientWidth;
    const availH = this.fit ? this.$stage.clientHeight : Infinity;
    if (!availW || !availH) return;
    const scale = Math.min(availW / this.width, availH / this.height);
    const w = Math.floor(this.width * scale), h = Math.floor(this.height * scale);
    this.$screen.style.width = `${w}px`;
    this.$screen.style.height = `${h}px`;
    // 표시 크기에 맞춰 캔버스 해상도도 조절해서 항상 선명하게
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this._renderScale = (w * dpr) / this.width;
  }

  _renderHud() {
    this.$score.textContent = this.score;
    this.$best.textContent = Math.max(this.best, this.score);
  }

  _renderButtons() {
    this.$mute.textContent = sfx.muted ? '🔇' : '🔊';
    this.$pauseBtn.textContent = this.state === 'playing' ? '⏸' : '▶';
  }

  _hintText(kind) {
    if (this.touchMode) return kind === 'resume' ? '' : '화면 아무 곳이나 탭해도 시작돼요';
    return { start: 'Space 키로 시작', restart: 'Space 다시 시작', resume: 'Space 계속 · R 처음부터' }[kind];
  }

  _showOverlay(title, body, kind) {
    this._overlayKind = kind;
    const buttons = {
      start: [['시작', 'action', true]],
      restart: [['다시 시작', 'action', true]],
      resume: [['계속', 'action', true], ['처음부터', 'restart', false]],
    }[kind];
    this.$overlay.innerHTML = `<h2></h2>${body.replace('{{controls}}', '<p class="mg-ctrl"></p>')}
      <div class="mg-actions">${buttons.map(([label, act, primary]) =>
        `<button type="button" data-act="${act}" class="${primary ? 'mg-primary' : ''}">${label}</button>`).join('')}</div>
      <p class="mg-keys"></p>`;
    const ctrl = this.$overlay.querySelector('.mg-ctrl');
    if (ctrl) ctrl.textContent = this._controlsText();
    this.$overlay.querySelector('h2').textContent = title;
    this.$overlay.querySelector('.mg-keys').textContent = this._hintText(kind);
    this.$overlay.querySelectorAll('[data-act]').forEach((b) => {
      // 버튼 누름이 화면 탭 제스처로 중복 처리되지 않도록 전파 차단
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.unlock(); activeGame = this; });
      b.addEventListener('pointerup', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); this._press(b.dataset.act); });
    });
    this.$overlay.hidden = false;
    this._renderButtons();
  }
  _hideOverlay() { this.$overlay.hidden = true; this._renderButtons(); }

  _press(action, repeat = false) {
    if (action === 'mute') { if (!repeat) this.toggleMute(); return; }
    if (action === 'pause') { if (!repeat) this.togglePause(); return; }
    if (action === 'restart') { if (!repeat && this.state !== 'ready') this.restart(); return; }
    if (this.state === 'ready' || this.state === 'over') {
      // 게임오버 직후 연타로 바로 재시작되는 것 방지
      const cooled = !this._overAt || performance.now() - this._overAt > 700;
      if (!repeat && cooled && (action === 'action' || this.touchMode)) this.start();
      return;
    }
    if (this.state === 'paused') { if (!repeat) this.resume(); return; }
    this.onAction(action, repeat);
  }

  _toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * this.width;
    this.pointer.y = ((e.clientY - r.top) / r.height) * this.height;
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (activeGame !== this) return;
      const a = this.keymap[e.code];
      if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      e.preventDefault();
      sfx.unlock();
      this._setTouchMode(false);
      this.keys.add(a);
      this._press(a, e.repeat);
    };
    this._onKeyUp = (e) => { const a = this.keymap[e.code]; if (a) this.keys.delete(a); };
    this._onDocPointer = (e) => {
      if (this.root.contains(e.target)) activeGame = this;
      else if (activeGame === this) { activeGame = null; this.keys.clear(); }
    };
    this._onVisibility = () => { if (document.hidden) this.pause(); };
    this._onBlur = () => { this.pause(); this.keys.clear(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerdown', this._onDocPointer);
    document.addEventListener('visibilitychange', this._onVisibility);

    // 화면 위 포인터: 터치 = 탭/스와이프 제스처, 마우스 = 클릭
    let start = null;
    const C = this.constructor;
    this.$screen.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      this.pointer.type = e.pointerType;
      this._setTouchMode(e.pointerType !== 'mouse');
      start = { x: e.clientX, y: e.clientY, fired: false };
      this.pointer.down = true;
      this._toLocal(e);
      this.$screen.setPointerCapture?.(e.pointerId);
    });
    this.$screen.addEventListener('pointermove', (e) => {
      this._toLocal(e);
      this.pointer.moved = true;
      // 스와이프는 손을 떼기 전에 일정 거리 넘으면 바로 발동 (반응성)
      if (!start || e.pointerType === 'mouse' || this.state !== 'playing') return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 28) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      const a = C.gestures[dir];
      // 손을 떼지 않고 계속 끌면 연속 입력 (블록 여러 칸 이동, 연속 방향 전환)
      if (a) { this._press(a); start = { x: e.clientX, y: e.clientY, fired: true, chained: true }; }
    });
    const end = (e) => {
      this.pointer.down = false;
      if (!start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const s = start;
      start = null;
      if (s.fired || moved >= 28) return;
      if (this.state !== 'playing') { this._press('action'); return; }
      const a = e.pointerType === 'mouse' ? C.mouseClick : C.gestures.tap;
      if (a) this._press(a);
    };
    this.$screen.addEventListener('pointerup', end);
    this.$screen.addEventListener('pointercancel', () => { start = null; this.pointer.down = false; });
    this.$screen.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _updateFx(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      f.vy += f.gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    if (this._shake.t > 0) this._shake.t -= dt;
  }

  _drawFx(ctx) {
    for (const f of this.fx) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      if (f.kind === 'p') ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
      else {
        ctx.font = `800 ${f.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
        ctx.textAlign = 'start';
      }
    }
    ctx.globalAlpha = 1;
  }

  _frame = (now) => {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this._booted) { this._booted = true; this.init(); }
    if (this.state === 'playing') { this.time += dt; this.update(dt); }
    if (this.state !== 'paused') this._updateFx(dt);

    const ctx = this.ctx;
    ctx.setTransform(this._renderScale || 1, 0, 0, this._renderScale || 1, 0, 0);
    ctx.fillStyle = '#0e0f14';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    if (this._shake.t > 0) {
      const k = this._shake.amount * (this._shake.t / this._shake.max);
      ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2);
    }
    this.draw(ctx);
    this._drawFx(ctx);
    ctx.restore();
    this._raf = requestAnimationFrame(this._frame);
  };
}

// 공용 헬퍼
export const DIRS = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};
export const randInt = (n) => Math.floor(Math.random() * n);
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}
