// 공통 게임 엔진: 캔버스/HUD/오버레이 생성, 게임 루프, 입력(키보드·터치), 최고 점수 저장.
// 각 게임은 GameBase를 상속해서 init / update(dt) / draw(ctx) / onAction(action) 만 구현하면 된다.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'action', Enter: 'action',
  KeyP: 'pause', Escape: 'pause',
};

const CSS = `
.mg-root{width:100%;margin:0 auto;font-family:system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#eee;user-select:none}
.mg-hud{display:flex;gap:12px;align-items:center;padding:6px 10px;background:#1b1d26;border-radius:10px 10px 0 0;font-size:14px}
.mg-hud .mg-info{flex:1;text-align:right;opacity:.8}
.mg-hud button{background:#2d3142;color:#eee;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit}
.mg-stage{position:relative;background:#0e0f14;border-radius:0 0 10px 10px;overflow:hidden}
.mg-stage canvas{display:block;width:100%;height:auto;touch-action:none}
.mg-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;background:rgba(10,11,16,.72);padding:16px}
.mg-overlay[hidden]{display:none}
.mg-overlay h2{margin:0;font-size:26px}
.mg-overlay p{margin:0;opacity:.85;font-size:14px;line-height:1.5}
.mg-overlay .mg-hint{margin-top:8px;padding:6px 14px;border-radius:999px;background:#3b82f6;color:#fff;font-weight:600}
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

// 한 페이지에 게임이 여러 개 있어도 마지막으로 클릭/시작한 게임만 키 입력을 받는다.
let activeGame = null;

export class GameBase {
  /** 서브클래스에서 덮어쓴다. */
  static meta = { id: 'base', title: 'Game', description: '', controls: '' };

  /**
   * @param {HTMLElement} container 게임을 붙일 요소
   * @param {{width:number,height:number,maxWidth?:number,onEvent?:(e:object)=>void}} opts
   */
  constructor(container, { width, height, maxWidth, onEvent } = {}) {
    injectStyle();
    this.meta = this.constructor.meta;
    this.width = width;
    this.height = height;
    this.onEvent = onEvent;
    this.state = 'ready'; // ready | playing | paused | over
    this.score = 0;
    this.bestKey = `miniigame:${this.meta.id}:best`;
    this.best = storage.get(this.bestKey);
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false };

    this._buildDom(container, maxWidth ?? Math.round(width * 1.5));
    this._bindEvents();
    activeGame = this;

    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  // ---- 서브클래스가 구현할 훅 ----
  init() {}            // 새 판 시작 시 상태 초기화
  update(_dt) {}       // playing 상태에서만 호출 (dt: 초)
  draw(_ctx) {}        // 매 프레임 호출
  onAction(_action, _repeat) {} // playing 중 입력: left/right/up/down/action

  // ---- 서브클래스가 쓰는 유틸 ----
  isDown(action) { return this.keys.has(action); }
  setScore(n) { if (n !== this.score) { this.score = n; this._renderHud(); } }
  addScore(n) { this.setScore(this.score + n); }
  setInfo(text) { this.$info.textContent = text; }

  gameOver(title = '게임 오버') {
    if (this.state === 'over') return;
    this.state = 'over';
    this._overAt = performance.now();
    const isBest = this.score > this.best;
    if (isBest) { this.best = this.score; storage.set(this.bestKey, this.best); }
    this._renderHud();
    this._showOverlay(title, `점수 ${this.score}${isBest ? ' · 최고 기록!' : ` · 최고 ${this.best}`}`, 'Space / 탭으로 다시 시작');
    this._emit('gameover', { score: this.score, best: this.best });
  }

  // ---- 외부(호스트 사이트)에서 쓰는 API ----
  start() {
    this.setScore(0);
    this.init();
    this.state = 'playing';
    this._hideOverlay();
    this._emit('start');
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._showOverlay('일시정지', '', 'Space / 탭으로 계속');
    this._emit('pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._last = performance.now();
    this._hideOverlay();
    this._emit('resume');
  }
  togglePause() { this.state === 'playing' ? this.pause() : this.resume(); }
  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
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
    root.className = 'mg-root';
    root.style.maxWidth = `${maxWidth}px`;
    root.innerHTML = `
      <div class="mg-hud">
        <span>점수 <b class="mg-score">0</b></span>
        <span>최고 <b class="mg-best">0</b></span>
        <span class="mg-info"></span>
        <button type="button" class="mg-pause">⏸</button>
      </div>
      <div class="mg-stage">
        <canvas></canvas>
        <div class="mg-overlay"><h2></h2><p></p><span class="mg-hint"></span></div>
      </div>`;
    container.appendChild(root);
    this.root = root;
    this.$score = root.querySelector('.mg-score');
    this.$best = root.querySelector('.mg-best');
    this.$info = root.querySelector('.mg-info');
    this.$stage = root.querySelector('.mg-stage');
    this.$overlay = root.querySelector('.mg-overlay');
    root.querySelector('.mg-pause').addEventListener('click', () => this.togglePause());

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = root.querySelector('canvas');
    canvas.width = this.width * dpr;
    canvas.height = this.height * dpr;
    canvas.style.aspectRatio = `${this.width} / ${this.height}`;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._renderHud();
    const m = this.meta;
    this._showOverlay(m.title, [m.description, m.controls].filter(Boolean).join('<br>'), 'Space / 탭으로 시작');
  }

  _renderHud() {
    this.$score.textContent = this.score;
    this.$best.textContent = Math.max(this.best, this.score);
  }

  _showOverlay(title, body, hint) {
    this.$overlay.querySelector('h2').textContent = title;
    this.$overlay.querySelector('p').innerHTML = body;
    this.$overlay.querySelector('.mg-hint').textContent = hint;
    this.$overlay.hidden = false;
  }
  _hideOverlay() { this.$overlay.hidden = true; }

  _press(action, repeat = false) {
    if (action === 'pause') { if (!repeat) this.togglePause(); return; }
    if (this.state === 'ready' || this.state === 'over') {
      // 게임오버 직후 연타로 바로 재시작되는 것 방지
      const cooled = !this._overAt || performance.now() - this._overAt > 600;
      if (action === 'action' && !repeat && cooled) this.start();
      return;
    }
    if (this.state === 'paused') { if (action === 'action' && !repeat) this.resume(); return; }
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
      const a = KEYMAP[e.code];
      if (!a || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      e.preventDefault();
      this.keys.add(a);
      this._press(a, e.repeat);
    };
    this._onKeyUp = (e) => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); };
    this._onDocPointer = (e) => {
      if (this.root.contains(e.target)) activeGame = this;
      else if (activeGame === this) { activeGame = null; this.keys.clear(); }
    };
    this._onVisibility = () => { if (document.hidden) this.pause(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerdown', this._onDocPointer);
    document.addEventListener('visibilitychange', this._onVisibility);

    // 터치/마우스: 탭 = action, 스와이프 = 방향
    let start = null;
    this.$stage.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY };
      this.pointer.down = true;
      this._toLocal(e);
    });
    this.$stage.addEventListener('pointermove', (e) => this._toLocal(e));
    const end = (e) => {
      this.pointer.down = false;
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.hypot(dx, dy) < 24) this._press('action');
      else if (Math.abs(dx) > Math.abs(dy)) this._press(dx > 0 ? 'right' : 'left');
      else this._press(dy > 0 ? 'down' : 'up');
    };
    this.$stage.addEventListener('pointerup', end);
    this.$stage.addEventListener('pointercancel', () => { start = null; this.pointer.down = false; });
  }

  _frame = (now) => {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this._booted) { this._booted = true; this.init(); }
    if (this.state === 'playing') this.update(dt);
    const ctx = this.ctx;
    ctx.fillStyle = '#0e0f14';
    ctx.fillRect(0, 0, this.width, this.height);
    this.draw(ctx);
    this._raf = requestAnimationFrame(this._frame);
  };
}

// 작은 공용 헬퍼
export const DIRS = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};
export const randInt = (n) => Math.floor(Math.random() * n);
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  ctx.fill();
}
