import { GameBase, roundRect } from '../engine.js';

// 낙하 블록 퍼즐 (장르 오리지널 구현)
const COLS = 10, ROWS = 20, CELL = 24, SIDE = 120;

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

const rotateCW = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());

export default class Blocks extends GameBase {
  static meta = {
    id: 'blocks',
    title: '블록 낙하',
    description: '떨어지는 블록으로 가로줄을 채워 없애세요.',
    controls: '←→ 이동 · ↑ 회전 · ↓ 천천히 · Space 즉시 낙하',
  };

  constructor(container, opts = {}) {
    super(container, { width: COLS * CELL + SIDE, height: ROWS * CELL, ...opts });
  }

  init() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.bag = [];
    this.lines = 0;
    this.level = 1;
    this.timer = 0;
    this.next = this.pull();
    this.spawn();
    this.updateInfo();
  }

  // 7개를 섞어서 순서대로 꺼내는 방식 (같은 블록 연속 편중 방지)
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

  spawn() {
    const type = this.next;
    this.next = this.pull();
    const shape = SHAPES[type];
    this.piece = { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
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

  tryMove(dx, dy) {
    const p = this.piece;
    if (this.collides(p.shape, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    return true;
  }

  rotate() {
    const p = this.piece;
    const r = rotateCW(p.shape);
    for (const kick of [0, -1, 1, -2, 2]) { // 간단한 벽 차기
      if (!this.collides(r, p.x + kick, p.y)) { p.shape = r; p.x += kick; return; }
    }
  }

  lock() {
    const p = this.piece;
    p.shape.forEach((row, y) => row.forEach((v, x) => {
      if (v && p.y + y >= 0) this.board[p.y + y][p.x + x] = p.type;
    }));
    const kept = this.board.filter((row) => row.some((c) => c < 0));
    const cleared = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(-1));
    this.board = kept;
    if (cleared) {
      this.addScore(LINE_SCORE[cleared] * this.level);
      this.lines += cleared;
      this.level = 1 + Math.floor(this.lines / 10);
      this.updateInfo();
    }
    this.spawn();
  }

  updateInfo() { this.setInfo(`레벨 ${this.level} · 줄 ${this.lines}`); }

  get gravity() { return Math.max(0.08, 0.8 - (this.level - 1) * 0.07); }

  onAction(action) {
    if (action === 'left') this.tryMove(-1, 0);
    else if (action === 'right') this.tryMove(1, 0);
    else if (action === 'up') this.rotate();
    else if (action === 'down') { if (this.tryMove(0, 1)) { this.addScore(1); this.timer = 0; } }
    else if (action === 'action') {
      let d = 0;
      while (this.tryMove(0, 1)) d++;
      this.addScore(d * 2);
      this.lock();
    }
  }

  update(dt) {
    this.timer += dt;
    if (this.timer >= this.gravity) {
      this.timer = 0;
      if (!this.tryMove(0, 1)) this.lock();
    }
  }

  ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this.collides(p.shape, p.x, y + 1)) y++;
    return y;
  }

  drawCell(ctx, x, y, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    roundRect(ctx, x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 4);
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    ctx.fillStyle = '#151821';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    this.board.forEach((row, y) => row.forEach((c, x) => { if (c >= 0) this.drawCell(ctx, x, y, COLORS[c]); }));

    const p = this.piece;
    if (p) {
      const gy = this.ghostY();
      p.shape.forEach((row, y) => row.forEach((v, x) => {
        if (!v) return;
        this.drawCell(ctx, p.x + x, gy + y, COLORS[p.type], 0.2);
        this.drawCell(ctx, p.x + x, p.y + y, COLORS[p.type]);
      }));
    }

    // 사이드 패널: 다음 블록
    const ox = COLS * CELL + 16;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('NEXT', ox, 24);
    const ns = SHAPES[this.next];
    ns.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      ctx.fillStyle = COLORS[this.next];
      roundRect(ctx, ox + x * 20, 40 + y * 20, 18, 18, 3);
    }));
  }
}
