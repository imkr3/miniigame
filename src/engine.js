// 공통 게임 엔진
// - 화면(캔버스) 크기를 컨테이너에 맞춰 자동 조절 (fit 모드: 높이까지 맞춤)
// - 입력 통일: 키보드 / 터치(탭·스와이프) / 화면 가상 패드 / 마우스
// - HUD(점수·최고점수·정보·소리·일시정지), 시작·일시정지·게임오버 오버레이
// - 효과음, 파티클·화면 흔들림·떠오르는 글자
// 각 게임은 GameBase를 상속해서 init / update(dt) / draw(ctx) / onAction(action, repeat) 만 구현하면 된다.
import { sfx } from './sfx.js';

// 기본 키 배치 (액션 → 키 코드 목록). 게임은 static bindings 로 덮어쓰고, 사용자는 ⚙ 설정에서 바꿀 수 있다.
const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  action: ['Space', 'Enter'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
};
const SYSTEM_ACTIONS = ['pause', 'restart', 'mute'];
const DEFAULT_LABELS = {
  left: '왼쪽', right: '오른쪽', up: '위', down: '아래', action: '동작',
  pause: '일시정지', restart: '처음부터', mute: '소리 켜기/끄기',
};
const MODIFIER_CODES = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];

/** 키 코드를 사람이 읽기 쉬운 이름으로 */
export function keyName(code) {
  if (!code) return '—';
  const named = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt',
    AltRight: 'R-Alt', MetaLeft: 'L-Cmd', MetaRight: 'R-Cmd', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Tab: 'Tab', CapsLock: 'Caps', Backspace: '⌫',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return code;
}

// 모든 게임 공통 설정
const GLOBAL_SETTINGS = [
  { id: 'vibrate', label: '진동 (모바일)', type: 'toggle', default: true },
  { id: 'shake', label: '화면 흔들림', type: 'toggle', default: true },
];

const CSS = `
.mg-root{--mg-bg:#0e0f14;--mg-panel:#171a23;--mg-accent:#3b82f6;display:flex;flex-direction:column;width:100%;margin:0 auto;
  font-family:system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#e5e7eb;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
  background:var(--mg-panel);border-radius:14px;overflow:hidden;box-sizing:border-box}
.mg-root *{box-sizing:border-box}
.mg-root{position:relative}
.mg-settings{position:absolute;inset:0;z-index:5;background:#0b0d12;overflow:auto;-webkit-overflow-scrolling:touch;
  display:flex;justify-content:center;padding:14px;animation:mg-fade .15s}
.mg-settings .mg-panel{width:100%;max-width:460px;margin:auto 0}
.mg-settings h3{margin:14px 0 8px;font-size:13px;color:#9ca3af;font-weight:700;letter-spacing:.3px}
.mg-settings h3:first-child{margin-top:0}
.mg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #222737;font-size:14px}
.mg-row .mg-ctl{display:flex;gap:6px;align-items:center}
.mg-key{min-width:64px;padding:6px 10px;border-radius:8px;border:1px solid #333a4f;background:#1d2130;color:#e5e7eb;font:inherit;
  font-size:13px;font-weight:700;cursor:pointer}
.mg-key:hover{border-color:var(--mg-accent)}
.mg-key.mg-empty{color:#6b7280;font-weight:400}
.mg-key.mg-listen{border-color:#facc15;color:#facc15;animation:mg-pulse 1s infinite}
.mg-row input[type=range]{width:120px;accent-color:var(--mg-accent)}
.mg-row .mg-val{min-width:52px;text-align:right;font-variant-numeric:tabular-nums;color:#cbd5e1;font-size:13px}
.mg-row input[type=checkbox]{width:20px;height:20px;accent-color:var(--mg-accent)}
.mg-row select{background:#1d2130;color:#e5e7eb;border:1px solid #333a4f;border-radius:8px;padding:6px 8px;font:inherit;font-size:13px}
.mg-tip{font-size:12px;color:#6b7280;margin:6px 0 0;line-height:1.5}
.mg-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;position:sticky;bottom:0;padding:8px 0;background:#0b0d12}
.mg-foot button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;background:#2a3040;color:#e5e7eb}
.mg-foot button.mg-primary{background:var(--mg-accent);color:#fff}
.mg-stats{font-size:13px;opacity:.75;margin:0}
.mg-root.mg-fit{height:100%;border-radius:0}
.mg-hud{display:flex;gap:10px;align-items:center;padding:8px 10px 8px 14px;font-size:14px;flex:none}
.mg-hud b{font-variant-numeric:tabular-nums;font-size:16px;margin-left:3px}
.mg-hud .mg-info{flex:1;text-align:right;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-hud button{touch-action:manipulation;background:#262b3a;color:#e5e7eb;border:0;border-radius:8px;width:32px;height:30px;cursor:pointer;font-size:15px;line-height:1;flex:none}
.mg-hud button:hover{background:#323949}
.mg-stage{position:relative;display:flex;align-items:center;justify-content:center;background:var(--mg-bg);overflow:hidden}
.mg-fit .mg-stage{flex:1;min-height:0}
.mg-screen{position:relative;flex:none}
.mg-screen canvas{display:block;width:100%;height:100%;touch-action:none;position:relative}
.mg-screen canvas.mg-3d{position:absolute;inset:0}
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
.mg-btns button{min-width:64px;height:64px;padding:0 10px;font-size:16px;border-radius:50px;white-space:nowrap}
.mg-btns button.mg-wide{min-width:120px;height:72px}
/* 가로 모드(폰 눕힘): 버튼을 화면 양옆으로 */
.mg-land{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr;grid-template-areas:"hud hud hud" "pl stage pr"}
.mg-land .mg-hud{grid-area:hud;padding-left:max(14px,env(safe-area-inset-left));padding-right:max(10px,env(safe-area-inset-right))}
.mg-land .mg-stage{grid-area:stage;min-width:0}
.mg-land .mg-pad{display:contents}
.mg-land .mg-pad>:first-child{grid-area:pl;align-self:end;padding:10px 10px max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
.mg-land .mg-pad>:last-child{grid-area:pr;align-self:end;flex-direction:row-reverse;flex-wrap:wrap-reverse;
  justify-content:flex-start;align-content:flex-start;width:174px;
  padding:10px max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) 10px}
.mg-land .mg-btns button{order:var(--rev)}
.mg-land .mg-btns button.mg-wide{min-width:72px;width:72px;height:72px;border-radius:50%;padding:0}
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

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
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
  /** 기본 키 배치 덮어쓰기 (액션 → 키 코드 목록) 예: { hold: ['KeyC'] } */
  static bindings = {};
  /** 설정창에 보일 액션 이름 */
  static actionLabels = {};
  /** 게임 설정 항목: [{ id, label, type: 'range'|'toggle'|'select', default, min, max, step, unit, options: [[값, 이름]], tip }] */
  static settings = [];
  /** 멀티플레이 지원 시 { min, max, label } (게임은 lobbyConfig()/startMulti() 구현) */
  static multiplayer = null;
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
  constructor(container, opts = {}) {
    const { width, height, fit = false, maxWidth, controls = 'auto', onEvent, onExit } = opts;
    this.opts = opts; // server: 멀티플레이 서버 주소 등
    injectStyle();
    const C = this.constructor;
    this.meta = C.meta;
    this.defaultBindings = { ...DEFAULT_BINDINGS, ...C.bindings };
    this.bindingsKey = `miniigame:${this.meta.id}:keys`;
    this.bindings = { ...this.defaultBindings, ...loadJSON(this.bindingsKey, {}) };
    this._buildKeymap();
    this.settingsKey = `miniigame:${this.meta.id}:settings`;
    this.cfg = {};
    for (const it of [...GLOBAL_SETTINGS, ...C.settings]) this.cfg[it.id] = it.default;
    Object.assign(this.cfg, loadJSON('miniigame:global', {}), loadJSON(this.settingsKey, {}));
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
    this.camera = { x: 0, y: 0 }; // 스크롤 게임용: 파티클·글자 효과가 월드 좌표를 따라가도록
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
  vibrate(ms = 30) { if (this.touchMode && this.cfg.vibrate) navigator.vibrate?.(ms); }
  /** 설정값이 바뀌었을 때 (서브클래스에서 필요하면 구현) */
  onSettingsChange(_id) {}
  /** 화면 크기가 바뀌었을 때 (CSS 픽셀) - 3D 레이어 등 */
  onResize(_w, _h) {}
  /** 게임이 제거될 때 (WebGL 자원 정리 등) */
  onDestroy() {}

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
  shake(amount = 6, time = 0.25) { if (this.cfg.shake) this._shake = { t: time, max: time, amount }; }

  /** @param {string} [stats] 게임오버 화면에 덧붙일 통계 문구 */
  gameOver(title = '게임 오버', stats = '', { multi = false } = {}) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.keys.clear();
    this._overAt = performance.now();
    // 멀티플레이 결과는 혼자 하기 기록(최고 점수·TOP 5)에 넣지 않음
    const isBest = !multi && this.score > this.best;
    if (isBest) { this.best = this.score; storage.set(this.bestKey, this.best); }
    const { top, rank } = this.score > 0 && !multi ? pushTop(this.meta.id, this.score) : { top: multi ? [] : getTop(this.meta.id), rank: -1 };
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
    this._showOverlay(title, `<div class="mg-big">${this.score}</div>${badge}${stats ? `<p class="mg-stats">${esc(stats)}</p>` : ''}${list}`, multi ? 'multi-end' : 'restart');
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
  /** 멀티플레이 로비 열기 (필요할 때만 불러옴) */
  async openLobby() {
    if (!this.constructor.multiplayer) return;
    if (!this.lobby) { const { Lobby } = await import('./net/lobby.js'); this.lobby = new Lobby(this); }
    this.lobby.open();
  }

  /** 진행 중인 판을 버리고 새로 시작 */
  restart() { this.keys.clear(); this._emit('restart'); this.start(); }
  toggleMute() { sfx.setMuted(!sfx.muted); this._renderButtons(); }
  destroy() {
    cancelAnimationFrame(this._raf);
    this.onDestroy();
    this.net?.close();
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
        <button type="button" class="mg-gear" aria-label="설정">⚙</button>
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
    root.mgGame = this; // 디버그·테스트용 핸들 (document.querySelector('.mg-root').mgGame)
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
    // 클릭한 버튼에 포커스가 남지 않도록 (키보드 입력이 버튼으로 가지 않게)
    root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !this.$settings?.contains(b)) b.blur(); });
    this.$mute.addEventListener('click', () => { sfx.unlock(); this.toggleMute(); });
    $('.mg-gear').addEventListener('click', () => this.openSettings());
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
    // --rev: 가로 모드에서 마지막 버튼(주로 핵심 동작)이 오른쪽 아래 엄지 위치에 오도록 역순 배치
    const right = buttons.map((b, i) =>
      `<button type="button" data-action="${b.action}" style="--rev:${buttons.length - i}" class="${b.primary ? 'mg-primary' : ''} ${b.wide ? 'mg-wide' : ''}">${b.label}</button>`).join('');
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
    if (this.touchMode) return this.meta.touchControls || this.meta.controls;
    const custom = JSON.stringify(this.bindings) !== JSON.stringify(this.defaultBindings);
    return custom ? '조작키를 바꿨어요 · ⚙ 설정에서 확인' : this.meta.controls;
  }

  _buildKeymap() {
    this.keymap = {};
    for (const [action, codes] of Object.entries(this.bindings)) for (const c of codes) if (c) this.keymap[c] = action;
  }

  // ---- 설정창 ----
  openSettings() {
    if (this.$settings) return;
    if (this.state === 'playing') this.pause();
    this.keys.clear();
    activeGame = this;
    this.$settings = document.createElement('div');
    this.$settings.className = 'mg-settings';
    this.root.appendChild(this.$settings);
    this._listening = null;
    this._renderSettings();
  }

  closeSettings() {
    if (!this.$settings) return;
    this.$settings.remove();
    this.$settings = null;
    this._listening = null;
    const ctrl = this.$overlay.querySelector('.mg-ctrl');
    if (ctrl) ctrl.textContent = this._controlsText();
  }

  _renderSettings() {
    const C = this.constructor;
    const labels = { ...DEFAULT_LABELS, ...C.actionLabels };
    const actions = [...Object.keys(this.defaultBindings).filter((a) => !SYSTEM_ACTIONS.includes(a)), ...SYSTEM_ACTIONS];
    const L = this._listening;
    const keyRows = actions.map((a) => {
      const codes = this.bindings[a] ?? [];
      const chip = (slot) => {
        const listening = L && L.action === a && L.slot === slot;
        const code = codes[slot];
        return `<button type="button" class="mg-key ${listening ? 'mg-listen' : ''} ${code ? '' : 'mg-empty'}" data-a="${a}" data-slot="${slot}">${
          listening ? '키 입력…' : esc(code ? keyName(code) : '없음')}</button>`;
      };
      return `<div class="mg-row"><span>${esc(labels[a] ?? a)}</span><span class="mg-ctl">${chip(0)}${chip(1)}</span></div>`;
    }).join('');

    const ctl = (it) => {
      const v = this.cfg[it.id];
      if (it.type === 'toggle') return `<input type="checkbox" data-s="${it.id}" ${v ? 'checked' : ''}>`;
      if (it.type === 'select') return `<select data-s="${it.id}">${it.options.map(([val, name]) =>
        `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`;
      return `<input type="range" data-s="${it.id}" min="${it.min}" max="${it.max}" step="${it.step ?? 1}" value="${v}">
        <span class="mg-val" data-v="${it.id}">${this._fmt(it, v)}</span>`;
    };
    const setRows = (list) => list.map((it) => `<div class="mg-row"><span>${esc(it.label)}${it.tip ? `<p class="mg-tip">${esc(it.tip)}</p>` : ''}</span>
      <span class="mg-ctl">${ctl(it)}</span></div>`).join('');

    this.$settings.innerHTML = `<div class="mg-panel">
      ${C.settings.length ? `<h3>${esc(this.meta.title)} 설정</h3>${setRows(C.settings)}` : ''}
      <h3>공통</h3>${setRows(GLOBAL_SETTINGS)}
      ${this.touchMode ? '' : `<h3>조작키</h3>${keyRows}
        <p class="mg-tip">버튼을 누른 뒤 원하는 키를 입력하세요. Backspace = 지우기, Esc = 취소. 다른 동작에 쓰던 키는 거기서 빠집니다.</p>`}
      <div class="mg-foot"><button type="button" data-reset>기본값으로</button><button type="button" class="mg-primary" data-close>닫기</button></div>
    </div>`;

    const $ = (s) => this.$settings.querySelectorAll(s);
    $('[data-a]').forEach((b) => b.addEventListener('click', () => {
      this._listening = { action: b.dataset.a, slot: Number(b.dataset.slot) };
      this._renderSettings();
    }));
    $('[data-s]').forEach((el) => {
      const it = [...GLOBAL_SETTINGS, ...C.settings].find((x) => x.id === el.dataset.s);
      el.addEventListener('input', () => {
        const v = it.type === 'toggle' ? el.checked : it.type === 'range' ? Number(el.value)
          : (typeof it.default === 'number' ? Number(el.value) : el.value);
        this._setCfg(it.id, v);
        const out = this.$settings.querySelector(`[data-v="${it.id}"]`);
        if (out) out.textContent = this._fmt(it, v);
      });
    });
    $('[data-close]')[0].addEventListener('click', () => this.closeSettings());
    $('[data-reset]')[0].addEventListener('click', () => {
      this.bindings = { ...this.defaultBindings };
      saveJSON(this.bindingsKey, {});
      this._buildKeymap();
      for (const it of [...GLOBAL_SETTINGS, ...C.settings]) this._setCfg(it.id, it.default);
      this._renderSettings();
    });
  }

  _fmt(it, v) {
    if (it.format) return it.format(v);
    return `${v}${it.unit ?? ''}`;
  }

  _setCfg(id, v) {
    this.cfg[id] = v;
    const global = GLOBAL_SETTINGS.some((g) => g.id === id);
    const key = global ? 'miniigame:global' : this.settingsKey;
    saveJSON(key, { ...loadJSON(key, {}), [id]: v });
    this.onSettingsChange(id);
  }

  _settingsKey(e) {
    const L = this._listening;
    if (!L) {
      if (e.code === 'Escape') { e.preventDefault(); this.closeSettings(); }
      return;
    }
    if (e.target.closest?.('input,select')) e.target.blur?.();
    e.preventDefault();
    this._listening = null;
    if (e.code === 'Escape') return this._renderSettings();
    const next = {};
    for (const [a, codes] of Object.entries(this.bindings)) next[a] = [...codes];
    if (e.code === 'Backspace' || e.code === 'Delete') {
      next[L.action][L.slot] = null;
    } else {
      // 이미 다른 동작에 쓰던 키면 거기서 제거
      for (const a of Object.keys(next)) next[a] = next[a].map((c) => (c === e.code ? null : c));
      next[L.action][L.slot] = e.code;
    }
    for (const a of Object.keys(next)) {
      next[a] = next[a].slice(0, 2);
      while (next[a].length && !next[a].at(-1)) next[a].pop();
    }
    this.bindings = next;
    // 기본값과 다른 동작만 저장
    const diff = {};
    for (const a of Object.keys(next)) if (JSON.stringify(next[a]) !== JSON.stringify(this.defaultBindings[a] ?? [])) diff[a] = next[a];
    saveJSON(this.bindingsKey, diff);
    this._buildKeymap();
    this._renderSettings();
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
    this.onResize(w, h);
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
    if (kind === 'multi-end') return this.touchMode ? '' : 'Space = 혼자 하기';
    if (this.touchMode) return kind === 'resume' ? '' : '화면 아무 곳이나 탭해도 시작돼요';
    return { start: 'Space 키로 시작', restart: 'Space 다시 시작', resume: 'Space 계속 · R 처음부터' }[kind];
  }

  _showOverlay(title, body, kind) {
    this._overlayKind = kind;
    const mp = this.constructor.multiplayer;
    const buttons = {
      start: [['시작', 'action', true], ...(mp ? [['🌐 멀티플레이', 'multi', false]] : [])],
      restart: [['다시 시작', 'action', true], ...(mp ? [['🌐 멀티플레이', 'multi', false]] : [])],
      resume: [['계속', 'action', true], ['처음부터', 'restart', false]],
      'multi-end': [['🌐 방으로 돌아가기', 'multi', true], ['혼자 하기', 'action', false]],
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
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.dataset.act === 'multi') this.openLobby();
        else this._press(b.dataset.act);
      });
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
      if (this.$settings) return this._settingsKey(e);
      if (this.lobbyOpen) { if (e.code === 'Escape' && !e.target.closest?.('input')) this.lobby.close(); return; }
      // 버튼에 포커스가 남아 있으면 Enter/Space가 그 버튼을 다시 눌러버림 (예: 목록 카드 → 게임 재시작) → 차단
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && e.target.closest?.('button,a,[role=button]')) {
        e.preventDefault();
        e.target.blur();
      }
      const a = this.keymap[e.code];
      const mod = (e.ctrlKey || e.metaKey || e.altKey) && !MODIFIER_CODES.includes(e.code);
      if (!a || mod) return;
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
    // 멀티플레이 중(noAutoPause)에는 다른 창으로 가도 멈추지 않음
    this._onVisibility = () => { if (document.hidden && !this.noAutoPause) this.pause(); };
    this._onBlur = () => { if (!this.noAutoPause) this.pause(); this.keys.clear(); };

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
    // clearColor = null 이면 투명 (3D 레이어 위에 HUD만 그리는 게임)
    if (this.clearColor === null) ctx.clearRect(0, 0, this.width, this.height);
    else { ctx.fillStyle = this.clearColor ?? '#0e0f14'; ctx.fillRect(0, 0, this.width, this.height); }
    ctx.save();
    if (this._shake.t > 0) {
      const k = this._shake.amount * (this._shake.t / this._shake.max);
      ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2);
    }
    this.draw(ctx);
    ctx.translate(-this.camera.x, -this.camera.y);
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
