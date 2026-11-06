import { GameBase, DIRS, randInt, roundRect } from '../engine.js';

// 스네이크
// - 부드러운 이동(칸 사이를 미끄러지듯), 빨리 연속으로 먹으면 콤보
// - 아이템: 황금 별(보너스), 얼음 사과(잠깐 느려짐), 가위(꼬리 3칸 잘라냄)
// - 설정: 속도, 벽 통과, 장애물 모드
const COLS = 20, ROWS = 20, CELL = 20;
const W = COLS * CELL, H = ROWS * CELL;
const BONUS_TIME = 6, ITEM_TIME = 8, COMBO_TIME = 3;
const SPEEDS = { slow: 0.16, normal: 0.13, fast: 0.095 };

export default class Snake extends GameBase {
  static meta = {
    id: 'snake',
    title: '스네이크',
    description: '먹이를 먹고 몸을 늘리세요. 연속으로 빨리 먹으면 콤보! ⭐ 보너스 · 🧊 잠깐 느려짐 · ✂️ 꼬리 자르기. ⚙에서 벽 통과·장애물·포털 모드',
    controls: '방향키 / WASD (가는 방향 키를 누르고 있으면 빨라짐)',
    touchControls: '화면을 밀어서 방향 전환 (또는 아래 방향 버튼)',
  };
  static mouseClick = null;
  static settings = [
    { id: 'speed', label: '속도', type: 'select', default: 'normal', options: [['slow', '느림'], ['normal', '보통'], ['fast', '빠름']] },
    { id: 'wrap', label: '벽 통과 (반대편으로 나옴)', type: 'toggle', default: false },
    { id: 'rocks', label: '장애물 모드 (먹을수록 바위가 생김)', type: 'toggle', default: false },
    { id: 'portals', label: '포털 (들어가면 반대 포털로 나옴, 먹이 10개마다 이동)', type: 'toggle', default: false },
  ];

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
  }

  init() {
    this.snake = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];
    this.dir = DIRS.right;
    this.queue = [];      // 빠른 연속 입력을 놓치지 않도록 방향 큐
    this.timer = 0;
    this.base = SPEEDS[this.cfg.speed] ?? 0.13;
    this.interval = this.base; // 한 칸 이동 간격(초) — 먹을수록 빨라짐
    this.eaten = 0;
    this.combo = 0;
    this.comboT = 0;
    this.slowT = 0;
    this.bonus = null;
    this.item = null;
    this.rocks = [];
    this.food = null;
    this.portals = null;
    if (this.cfg.portals) this.movePortals();
    if (this.cfg.rocks) for (let i = 0; i < 3; i++) this.addRock();
    this.food = this.freeCell();
    const tag = `${this.cfg.wrap ? 'wrap' : ''}${this.cfg.rocks ? 'rocks' : ''}${this.cfg.portals ? 'portal' : ''}`;
    this.setRecord(tag ? `snake-${tag}` : 'snake');
    this.updateInfo();
  }

  occupied(x, y) {
    return this.snake.some((s) => s.x === x && s.y === y) || this.rocks.some((r) => r.x === x && r.y === y)
      || (this.food && this.food.x === x && this.food.y === y) || (this.bonus && this.bonus.x === x && this.bonus.y === y)
      || (this.item && this.item.x === x && this.item.y === y)
      || (this.portals?.some((p) => p.x === x && p.y === y) ?? false);
  }

  /** 포털 한 쌍을 서로 멀리, 벽에서 한 칸 이상 떨어진 곳에 둔다 */
  movePortals() {
    this.portals = null;
    const inner = (c) => c && c.x > 0 && c.y > 0 && c.x < COLS - 1 && c.y < ROWS - 1;
    let a = null, b = null;
    for (let k = 0; k < 40 && !inner(a); k++) a = this.freeCell(4);
    for (let k = 0; k < 60; k++) {
      const c = this.freeCell(4);
      if (inner(c) && Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 9) { b = c; break; }
    }
    if (inner(a) && b) this.portals = [a, b];
  }

  freeCell(avoidHead = 0) {
    const free = [];
    const h = this.snake[0];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.occupied(x, y)) continue;
      if (avoidHead && Math.abs(x - h.x) + Math.abs(y - h.y) < avoidHead) continue;
      free.push({ x, y });
    }
    return free.length ? free[randInt(free.length)] : null;
  }

  addRock() {
    const c = this.freeCell(5);
    if (c) { this.rocks.push(c); this.clearCache('snake-rocks'); }
  }

  updateInfo() {
    const fx = [this.slowT > 0 && '🧊', this.combo > 1 && `콤보 ×${this.combo}`].filter(Boolean).join(' ');
    this.setInfo(`길이 ${this.snake.length}${fx ? ` · ${fx}` : ''}`);
  }

  onAction(action) {
    const d = DIRS[action];
    if (!d) return;
    const last = this.queue.at(-1) ?? this.dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return; // 역방향 금지
    if (this.queue.length < 3) this.queue.push(d);
  }

  update(dt) {
    if (this.bonus && (this.bonus.t -= dt) <= 0) this.bonus = null;
    if (this.item && (this.item.t -= dt) <= 0) this.item = null;
    if (this.slowT > 0 && (this.slowT -= dt) <= 0) this.updateInfo();
    if (this.combo && (this.comboT -= dt) <= 0) { this.combo = 0; this.updateInfo(); }
    // 지금 가는 방향 키를 누르고 있으면 빠르게 (돌진)
    const name = Object.keys(DIRS).find((k) => DIRS[k] === this.dir);
    this.rushing = !this.queue.length && name && this.isDown(name);
    const step = this.interval * (this.slowT > 0 ? 1.45 : 1) * (this.rushing ? 0.55 : 1);
    this.timer += dt;
    while (this.timer >= step && this.state === 'playing') {
      this.timer -= step;
      this.step();
    }
    this.stepLen = step;
  }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    let head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    const out = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
    if (out && this.cfg.wrap) head = { x: (head.x + COLS) % COLS, y: (head.y + ROWS) % ROWS, wrapped: true };
    const at = (o) => o && head.x === o.x && head.y === o.y;
    const pi = this.portals ? this.portals.findIndex(at) : -1;
    if (pi >= 0) { // 포털: 반대쪽 포털 칸으로 순간 이동 (같은 방향으로 계속)
      const o = this.portals[1 - pi];
      head = { x: o.x, y: o.y, wrapped: true };
      this.sound('rotate');
    }
    const eatFood = at(this.food);
    const body = eatFood ? this.snake : this.snake.slice(0, -1); // 꼬리는 이번 턴에 빠짐
    if ((out && !this.cfg.wrap) || body.some((s) => s.x === head.x && s.y === head.y) || this.rocks.some(at)) {
      this.shake(8);
      this.burst((this.snake[0].x + 0.5) * CELL, (this.snake[0].y + 0.5) * CELL, { color: '#4ade80', count: 24, speed: 180 });
      this.sound('hit');
      return this.gameOver('게임 오버', `길이 ${this.snake.length} · 먹이 ${this.eaten}개`);
    }
    this.snake.unshift(head);
    const cx = (head.x + 0.5) * CELL, cy = (head.y + 0.5) * CELL;
    if (eatFood) {
      this.eaten++;
      // 콤보: 3초 안에 다음 먹이를 먹으면 점수 배수
      this.combo = this.comboT > 0 ? this.combo + 1 : 1;
      this.comboT = COMBO_TIME;
      const pts = 10 * Math.min(this.combo, 8);
      this.addScore(pts);
      if (this.combo > 1) this.floatText(cx, cy - 8, `콤보 ×${this.combo} +${pts}`, '#fde68a', 13);
      this.interval = Math.max(0.06, this.interval * 0.975);
      this.burst(cx, cy, { color: '#fb923c', count: 10, speed: 100, life: 0.4 });
      this.sound('eat');
      this.vibrate(15);
      this.food = this.freeCell();
      if (!this.food) return this.gameOver('완벽한 클리어!');
      if (this.eaten % 5 === 0 && !this.bonus) { const c = this.freeCell(); if (c) this.bonus = { ...c, t: BONUS_TIME }; }
      if (this.eaten % 7 === 3 && !this.item) { const c = this.freeCell(); if (c) this.item = { ...c, t: ITEM_TIME, kind: Math.random() < 0.5 ? 'ice' : 'cut' }; }
      if (this.cfg.rocks && this.eaten % 4 === 0) this.addRock();
      if (this.portals && this.eaten % 10 === 0) this.movePortals();
    } else {
      this.snake.pop();
    }
    if (at(this.bonus)) {
      const pts = 20 + Math.ceil(this.bonus.t) * 10;
      this.addScore(pts);
      this.floatText(cx, cy - 8, `+${pts}`);
      this.burst(cx, cy, { color: '#facc15', count: 16, speed: 140 });
      this.sound('bonus');
      this.bonus = null;
    }
    if (at(this.item)) {
      if (this.item.kind === 'ice') { this.slowT = 6; this.floatText(cx, cy - 8, '천천히~', '#7dd3fc', 14); }
      else {
        const cut = Math.min(3, this.snake.length - 3);
        for (let i = 0; i < cut; i++) this.snake.pop();
        this.addScore(cut * 15);
        this.floatText(cx, cy - 8, `싹둑! +${cut * 15}`, '#f9a8d4', 14);
      }
      this.burst(cx, cy, { color: this.item.kind === 'ice' ? '#7dd3fc' : '#f9a8d4', count: 14, speed: 120 });
      this.sound('power');
      this.item = null;
    }
    this.updateInfo();
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    // 체크무늬 바탕 + 바위는 캐시해 두고 붙이기만 함
    this.drawCached(ctx, 'snake-bg', 0, 0, W, H, (c) => {
      c.fillStyle = '#121520'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#161a26';
      for (let y = 0; y < ROWS; y++) for (let x = y % 2; x < COLS; x += 2) c.fillRect(x * CELL, y * CELL, CELL, CELL);
    });
    if (this.cfg.wrap) { ctx.strokeStyle = 'rgba(56,189,248,.35)'; ctx.setLineDash([4, 4]); ctx.strokeRect(1, 1, W - 2, H - 2); ctx.setLineDash([]); }
    if (this.rocks.length) this.drawCached(ctx, `snake-rocks${this.rocks.length}`, 0, 0, W, H, (c) => {
      for (const r of this.rocks) {
        c.fillStyle = '#57534e'; roundRect(c, r.x * CELL + 2, r.y * CELL + 3, CELL - 4, CELL - 5, 6);
        c.fillStyle = '#78716c'; roundRect(c, r.x * CELL + 4, r.y * CELL + 4, CELL - 10, CELL - 12, 4);
      }
    });

    const now = performance.now();
    const pulse = 1 + Math.sin(now / 180) * 0.08;
    if (this.portals) this.portals.forEach((p, i) => {
      const cx = (p.x + 0.5) * CELL, cy = (p.y + 0.5) * CELL, col = i ? '#22d3ee' : '#c084fc';
      ctx.fillStyle = i ? 'rgba(34,211,238,.18)' : 'rgba(192,132,252,.18)';
      ctx.fillRect(p.x * CELL, p.y * CELL, CELL, CELL);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      for (let k = 0; k < 2; k++) {
        const a0 = now / (i ? -260 : 260) + k * Math.PI;
        ctx.beginPath(); ctx.arc(cx, cy, CELL / 2 - 3 - k * 3, a0, a0 + Math.PI * 1.2); ctx.stroke();
      }
    });
    if (this.food) {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.arc((this.food.x + 0.5) * CELL, (this.food.y + 0.5) * CELL, (CELL / 2 - 3) * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4ade80'; ctx.fillRect((this.food.x + 0.5) * CELL - 1, this.food.y * CELL + 2, 2, 4);
    }
    if (this.bonus && !(this.bonus.t < 2 && Math.floor(this.bonus.t * 8) % 2 === 0)) this.drawStar(ctx, this.bonus, '#facc15', pulse);
    if (this.item && !(this.item.t < 2 && Math.floor(this.item.t * 8) % 2 === 0)) {
      ctx.font = `${Math.round(15 * pulse)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.item.kind === 'ice' ? '🧊' : '✂️', (this.item.x + 0.5) * CELL, (this.item.y + 0.5) * CELL + 1);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    this.drawSnake(ctx);
  }

  drawStar(ctx, p, color, pulse) {
    const bx = (p.x + 0.5) * CELL, by = (p.y + 0.5) * CELL, r = (CELL / 2 - 1) * pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  /** 몸통을 굵은 선으로 이어 그림. 각 마디가 다음에 갈 칸 쪽으로 미끄러지듯 (입력 지연 없이 부드럽게) */
  drawSnake(ctx) {
    const k = this.state === 'playing' ? Math.min(1, this.timer / (this.stepLen || this.interval)) : 0;
    const nd = this.queue[0] ?? this.dir;
    const pts = this.snake.map((s, i) => {
      const t = i === 0 ? { x: s.x + nd.x, y: s.y + nd.y } : this.snake[i - 1];
      if (Math.abs(t.x - s.x) + Math.abs(t.y - s.y) > 1) return { x: (s.x + 0.5) * CELL, y: (s.y + 0.5) * CELL, jump: true }; // 벽 통과 순간
      return { x: (s.x + (t.x - s.x) * k + 0.5) * CELL, y: (s.y + (t.y - s.y) * k + 0.5) * CELL };
    });
    const slow = this.slowT > 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 몸통 (뒤에서 앞으로 점점 진하게)
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i], b = pts[i - 1];
      if (b.jump || Math.hypot(a.x - b.x, a.y - b.y) > CELL * 1.5) continue;
      ctx.strokeStyle = slow ? `hsl(195, 70%, ${45 + (1 - i / pts.length) * 20}%)` : `hsl(142, 65%, ${32 + (1 - i / pts.length) * 22}%)`;
      ctx.lineWidth = CELL - 4 - (i / pts.length) * 4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // 머리
    const h = pts[0], d = this.dir;
    ctx.fillStyle = slow ? '#7dd3fc' : '#86efac';
    ctx.beginPath(); ctx.arc(h.x, h.y, CELL / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    const ex = h.x + d.x * 4, ey = h.y + d.y * 4;
    ctx.beginPath();
    ctx.arc(ex + d.y * 4, ey + d.x * 4, 2.2, 0, Math.PI * 2);
    ctx.arc(ex - d.y * 4, ey - d.x * 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (this.combo > 1) {
      ctx.fillStyle = '#fde68a'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`×${this.combo}`, h.x, h.y - 13); ctx.textAlign = 'start';
    }
  }
}
