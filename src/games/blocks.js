import { GameBase, roundRect } from '../engine.js';

// 낙하 블록 퍼즐 (장르 오리지널 구현)
const COLS = 10, ROWS = 20, CELL = 24, SIDE = 112;
const BW = COLS * CELL;

const SHAPES = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
];
const COLORS = ['#38bdf8', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c'];
const LINE_SCORE = [0, 100, 300, 500, 800];
const LINE_TEXT = ['', '', '더블!', '트리플!', '쿼드!'];

const DAS = 0.16;          // 길게 누를 때 연속 이동 시작 지연
const ARR = 0.045;         // 연속 이동 간격
const SOFT = 0.035;        // 소프트 드롭 간격
const LOCK_DELAY = 0.5;    // 바닥에 닿은 뒤 고정까지 여유
const LOCK_RESETS = 15;    // 여유 시간 리셋 최대 횟수

const rotateCW = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
const rotateCCW = (m) => m[0].map((_, i) => m.map((row) => row[row.length - 1 - i]));

export default class Blocks extends GameBase {
  static meta = {
    id: 'blocks',
    title: '블록 낙하',
    description: '떨어지는 블록으로 가로줄을 꽉 채워 없애세요. 여러 줄을 한 번에 지우면 점수가 크게 올라요.',
    controls: '←→ 이동 · ↑/X 회전 · Z 반대 회전 · ↓ 빠르게 · Space 즉시 낙하 · C 보관',
    touchControls: '탭 회전 · 좌우로 끌기 이동 · 아래로 끌기 빠르게 · 위로 밀기 보관',
  };
  static keys = { KeyX: 'up', KeyZ: 'rotl', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold' };
  static pad = {
    left: 'dpad', labels: { up: '회전' },
    buttons: [{ action: 'hold', label: '보관' }, { action: 'action', label: '⤓ 낙하', primary: true, wide: true }],
  };
  static gestures = { tap: 'up', left: 'left', right: 'right', down: 'down', up: 'hold' };

  constructor(container, opts = {}) {
    super(container, { width: BW + SIDE, height: ROWS * CELL, ...opts });
  }

  init() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.bag = [];
    this.queue = [this.pull(), this.pull(), this.pull()];
    this.holdType = -1;
    this.canHold = true;
    this.lines = 0;
    this.level = 1;
    this.gravityT = 0;
    this.shift = null;     // { dir, t } 좌우 연속 이동 상태
    this.softT = 0;
    this.spawn();
    this.updateInfo();
  }

  // 7개를 섞어 순서대로 꺼내는 방식 (같은 블록 편중 방지)
  pull() {
    if (!this.bag.length) {
      this.bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawn(type) {
    if (type === undefined) { type = this.queue.shift(); this.queue.push(this.pull()); }
    const shape = SHAPES[type];
    this.piece = { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: type === 0 ? -1 : 0 };
    this.lockT = 0;
    this.lockResets = 0;
    if (this.collides(shape, this.piece.x, this.piece.y)) this.gameOver();
  }

  collides(shape, px, py) {
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const bx = px + x, by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.board[by][bx] >= 0) return true;
      }
    return false;
  }

  get grounded() { const p = this.piece; return this.collides(p.shape, p.x, p.y + 1); }

  // 바닥에서 움직이면 고정 대기 시간을 조금 연장
  touched() {
    if (this.lockResets < LOCK_RESETS && this.lockT > 0) { this.lockT = 0; this.lockResets++; }
  }

  tryMove(dx, dy) {
    const p = this.piece;
    if (this.collides(p.shape, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    if (dx) this.touched();
    return true;
  }

  rotate(ccw = false) {
    const p = this.piece;
    const r = ccw ? rotateCCW(p.shape) : rotateCW(p.shape);
    for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) {
      if (!this.collides(r, p.x + kx, p.y + ky)) {
        p.shape = r; p.x += kx; p.y += ky;
        this.touched();
        this.sound('rotate');
        return;
      }
    }
  }

  hold() {
    if (!this.canHold) return;
    const cur = this.piece.type;
    if (this.holdType < 0) { this.holdType = cur; this.spawn(); }
    else { const t = this.holdType; this.holdType = cur; this.spawn(t); }
    this.canHold = false;
    this.sound('rotate');
  }

  lock() {
    const p = this.piece;
    p.shape.forEach((row, y) => row.forEach((v, x) => {
      if (v && p.y + y >= 0) this.board[p.y + y][p.x + x] = p.type;
    }));
    if (p.shape.some((row, y) => row.some((v) => v && p.y + y < 0))) return this.gameOver();

    const full = [];
    this.board.forEach((row, y) => { if (row.every((c) => c >= 0)) full.push(y); });
    if (full.length) {
      for (const y of full) {
        for (let x = 0; x < COLS; x++)
          this.burst((x + 0.5) * CELL, (y + 0.5) * CELL, { color: COLORS[this.board[y][x]], count: 3, speed: 160, life: 0.5 });
      }
      this.board = this.board.filter((_, y) => !full.includes(y));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(-1));
      const gained = LINE_SCORE[full.length] * this.level;
      this.addScore(gained);
      this.floatText(BW / 2, full[0] * CELL, `${LINE_TEXT[full.length]} +${gained}`, '#fde68a', full.length >= 4 ? 22 : 16);
      if (full.length >= 4) this.shake(7);
      this.vibrate(40);
      this.lines += full.length;
      const newLevel = 1 + Math.floor(this.lines / 10);
      if (newLevel > this.level) { this.level = newLevel; this.sound('levelup'); this.floatText(BW / 2, ROWS * CELL / 2, `레벨 ${this.level}`, '#93c5fd', 24); }
      else this.sound('clear');
      this.updateInfo();
    } else {
      this.sound('lock');
    }
    this.canHold = true;
    this.spawn();
  }

  updateInfo() { this.setInfo(`레벨 ${this.level} · ${this.lines}줄`); }

  get gravity() { return Math.max(0.05, 0.8 * Math.pow(0.85, this.level - 1)); }

  onAction(action, repeat) {
    if (repeat) return; // 키 반복은 엔진 대신 아래 update의 DAS로 처리
    if (action === 'left' || action === 'right') {
      const dx = action === 'left' ? -1 : 1;
      if (this.tryMove(dx, 0)) this.sound('move');
      this.shift = { dir: action, dx, t: -DAS };
    } else if (action === 'up') this.rotate();
    else if (action === 'rotl') this.rotate(true);
    else if (action === 'hold') this.hold();
    else if (action === 'down') {
      if (this.tryMove(0, 1)) { this.addScore(1); this.gravityT = 0; }
      this.softT = -DAS / 2;
    } else if (action === 'action') {
      let d = 0;
      while (this.tryMove(0, 1)) d++;
      this.addScore(d * 2);
      const p = this.piece;
      this.burst((p.x + p.shape[0].length / 2) * CELL, (p.y + p.shape.length) * CELL, { color: COLORS[p.type], count: 10, speed: 90, life: 0.35 });
      this.shake(3, 0.12);
      this.sound('drop');
      this.lock();
    }
  }

  update(dt) {
    // 좌우 길게 누르기
    if (this.shift) {
      if (!this.isDown(this.shift.dir)) this.shift = null;
      else {
        this.shift.t += dt;
        while (this.shift.t >= ARR) { this.shift.t -= ARR; if (!this.tryMove(this.shift.dx, 0)) break; }
      }
    }
    // 아래 길게 누르기
    if (this.isDown('down')) {
      this.softT += dt;
      while (this.softT >= SOFT) { this.softT -= SOFT; if (this.tryMove(0, 1)) { this.addScore(1); this.gravityT = 0; } }
    }

    if (this.state !== 'playing') return;
    if (this.grounded) {
      this.lockT += dt;
      if (this.lockT >= LOCK_DELAY) this.lock();
    } else {
      this.lockT = 0;
      this.gravityT += dt;
      while (this.gravityT >= this.gravity) {
        this.gravityT -= this.gravity;
        if (!this.tryMove(0, 1)) break;
      }
    }
  }

  ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this.collides(p.shape, p.x, y + 1)) y++;
    return y;
  }

  drawCell(ctx, px, py, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    roundRect(ctx, px + 1, py + 1, size - 2, size - 2, size / 6);
    if (alpha === 1) { // 윗면 하이라이트
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + 3, py + 3, size - 6, Math.max(2, size / 8));
    }
    ctx.globalAlpha = 1;
  }

  drawMini(ctx, type, cx, cy, size, dim = false) {
    const s = SHAPES[type];
    const rows = s.filter((r) => r.some(Boolean));
    const cols = s[0].map((_, i) => s.some((r) => r[i]));
    const firstCol = cols.indexOf(true), w = cols.filter(Boolean).length;
    rows.forEach((row, y) => row.forEach((v, x) => {
      if (v) this.drawCell(ctx, cx - (w * size) / 2 + (x - firstCol) * size, cy - (rows.length * size) / 2 + y * size, size, COLORS[type], dim ? 0.35 : 1);
    }));
  }

  draw(ctx) {
    // 보드 배경 + 격자
    ctx.fillStyle = '#131620';
    ctx.fillRect(0, 0, BW, ROWS * CELL);
    ctx.strokeStyle = '#1b1f2c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(BW, y * CELL + 0.5); }
    ctx.stroke();

    this.board.forEach((row, y) => row.forEach((c, x) => { if (c >= 0) this.drawCell(ctx, x * CELL, y * CELL, CELL, COLORS[c]); }));

    const p = this.piece;
    if (p && this.state !== 'ready') {
      const gy = this.ghostY();
      // 고정 직전이면 살짝 깜빡임
      const lockFade = this.grounded ? 0.65 + 0.35 * Math.cos(this.lockT * 20) : 1;
      p.shape.forEach((row, y) => row.forEach((v, x) => {
        if (!v) return;
        if (gy + y >= 0) this.drawCell(ctx, (p.x + x) * CELL, (gy + y) * CELL, CELL, COLORS[p.type], 0.18);
        if (p.y + y >= 0) this.drawCell(ctx, (p.x + x) * CELL, (p.y + y) * CELL, CELL, COLORS[p.type], lockFade === 1 ? 1 : lockFade);
      }));
    }

    // 사이드 패널
    const cx = BW + SIDE / 2;
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', cx, 22);
    this.queue.forEach((t, i) => this.drawMini(ctx, t, cx, 56 + i * 62, i === 0 ? 18 : 14));
    ctx.fillStyle = '#6b7280';
    ctx.fillText('HOLD', cx, 262);
    if (this.holdType >= 0) this.drawMini(ctx, this.holdType, cx, 298, 16, !this.canHold);
    ctx.fillText('LEVEL', cx, 372);
    ctx.fillText('LINES', cx, 432);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText(this.level, cx, 398);
    ctx.fillText(this.lines, cx, 458);
    ctx.textAlign = 'start';
  }
}
