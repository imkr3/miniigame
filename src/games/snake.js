import { GameBase, DIRS, randInt, roundRect } from '../engine.js';
import { sfx } from '../sfx.js';

// 스네이크
// - 부드러운 이동(칸 사이를 미끄러지듯), 빨리 연속으로 먹으면 콤보
// - 아이템: 황금 별(보너스), 얼음 사과(잠깐 느려짐), 가위(꼬리 3칸 잘라냄), 유령(5초 동안 내 몸 통과)
// - 첫 방향을 누를 때까지 출발하지 않고 기다림
// - 설정: 속도, 벽 통과, 장애물 모드
const COLS = 20, ROWS = 20, CELL = 20;
const W = COLS * CELL, H = ROWS * CELL;
const BONUS_TIME = 6, ITEM_TIME = 8, COMBO_TIME = 3;
const SPEEDS = { slow: 0.16, normal: 0.13, fast: 0.095 };
// 스테이지 모드 지형: [x, y, 너비, 높이] 바위 사각형 (출발 줄은 자동으로 비움)
const STAGES = [
  { name: '네 개의 돌', rects: [[4, 4, 2, 2], [14, 4, 2, 2], [4, 14, 2, 2], [14, 14, 2, 2]] },
  { name: '두 막대', rects: [[3, 5, 14, 1], [3, 14, 14, 1]] },
  { name: '십자로', rects: [[9, 2, 2, 7], [9, 11, 2, 7], [2, 9, 7, 2], [11, 9, 7, 2]] },
  { name: '상자', rects: [[4, 4, 12, 1], [4, 15, 12, 1], [4, 5, 1, 4], [4, 11, 1, 4], [15, 5, 1, 4], [15, 11, 1, 4]] },
  { name: '기둥 숲', pillars: true },
  { name: 'H 골목', rects: [[5, 3, 2, 14], [13, 3, 2, 14], [7, 9, 6, 1]] },
  { name: '소용돌이', rects: [[2, 2, 16, 1], [17, 2, 1, 14], [4, 15, 14, 1], [4, 5, 1, 10], [4, 5, 11, 1], [14, 5, 1, 7], [7, 12, 8, 1]] },
  { name: '미궁', rects: [[3, 3, 1, 6], [3, 12, 1, 6], [16, 3, 1, 6], [16, 12, 1, 6], [6, 6, 8, 1], [6, 13, 8, 1], [8, 3, 4, 1], [8, 16, 4, 1]] },
];

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
    { id: 'mode', label: '모드', type: 'select', default: 'classic', options: [['classic', '클래식 (끝없이)'], ['stage', `스테이지 (${STAGES.length}개 지형, 목표만큼 먹으면 다음)`]], tip: '스테이지 모드에서는 장애물·포털 설정을 쓰지 않아요' },
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
    this.ghostT = 0;
    this.hold = true; // 첫 방향 입력을 기다림
    this.bonus = null;
    this.item = null;
    this.rocks = [];
    this.food = null;
    this.portals = null;
    this.feast = null;
    this.stageMode = this.cfg.mode === 'stage';
    this.waitT = 0; this.banner = null;
    if (this.stageMode) {
      this.stageNo = 1;
      this.setRecord(`snake-stage${this.cfg.wrap ? '-wrap' : ''}`);
      this.loadStage();
      return;
    }
    if (this.cfg.portals) this.movePortals();
    if (this.cfg.rocks) for (let i = 0; i < 3; i++) this.addRock();
    this.food = this.freeCell();
    const tag = `${this.cfg.wrap ? 'wrap' : ''}${this.cfg.rocks ? 'rocks' : ''}${this.cfg.portals ? 'portal' : ''}`;
    this.setRecord(tag ? `snake-${tag}` : 'snake');
    this.updateInfo();
  }

  /** 스테이지 모드: 지형을 깔고 뱀을 출발 위치로 */
  loadStage() {
    const st = STAGES[(this.stageNo - 1) % STAGES.length], lap = Math.floor((this.stageNo - 1) / STAGES.length);
    this.rocks = [];
    if (st.pillars) for (let y = 2; y < ROWS - 1; y += 4) for (let x = 2; x < COLS - 1; x += 4) this.rocks.push({ x, y }, { x: x + 1, y: y + 1 });
    for (const [x0, y0, w, h] of st.rects ?? []) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.rocks.push({ x, y });
    this.rocks = this.rocks.filter((r) => !(r.y === 10 && r.x >= 2 && r.x <= 13) && r.x >= 0 && r.y >= 0 && r.x < COLS && r.y < ROWS);
    this.clearCache('snake-rocks');
    this.snake = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];
    this.dir = DIRS.right; this.queue = [];
    this.bonus = null; this.item = null; this.food = null;
    this.interval = this.base * Math.pow(0.95, this.stageNo - 1 + lap * 2);
    this.stageEat = 0;
    this.stageGoal = 8 + Math.min(this.stageNo, 10) * 2;
    this.food = this.freeCell(3);
    this.waitT = 1.3;
    this.banner = { text: `스테이지 ${this.stageNo}`, sub: st.name, t: 1.6 };
    this.stageStart = this.time;
    this.updateInfo();
  }

  occupied(x, y) {
    return this.snake.some((s) => s.x === x && s.y === y) || this.rocks.some((r) => r.x === x && r.y === y)
      || (this.food && this.food.x === x && this.food.y === y) || (this.bonus && this.bonus.x === x && this.bonus.y === y)
      || (this.item && this.item.x === x && this.item.y === y)
      || (this.feast?.items.some((f) => f.x === x && f.y === y) ?? false)
      || (this.portals?.some((p) => p.x === x && p.y === y) ?? false);
  }

  startFeast() {
    const items = [];
    for (let i = 0; i < 6; i++) { const c = this.freeCell(3); if (c) { items.push(c); this.feast = { items, got: 0, t: 6 }; } }
    if (!items.length) return;
    this.feast = { items, got: 0, t: 6 };
    this.floatText(W / 2, 40, '🍒 먹이 폭풍! (6초)', '#f9a8d4', 16);
    this.sound('power');
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
    const fx = [this.slowT > 0 && '🧊', this.ghostT > 0 && '👻', this.combo > 1 && `콤보 ×${this.combo}`].filter(Boolean).join(' ');
    const head = this.stageMode ? `스테이지 ${this.stageNo} · 남은 먹이 ${Math.max(0, this.stageGoal - this.stageEat)}` : `길이 ${this.snake.length}`;
    this.setInfo(`${head}${fx ? ` · ${fx}` : ''}`);
  }

  onAction(action) {
    const d = DIRS[action];
    if (!d) return;
    if (this.hold) { this.hold = false; this.timer = 0; if (d.x === -this.dir.x && d.y === -this.dir.y) return; } // 아무 방향이나 누르면 출발
    const last = this.queue.at(-1) ?? this.dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return; // 역방향 금지
    if (this.queue.length < 3) this.queue.push(d);
  }

  update(dt) {
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.waitT > 0) { this.waitT -= dt; this.timer = 0; return; } // 스테이지 시작 전 잠깐 멈춤
    if (this.hold) { this.timer = 0; return; }
    if (this.ghostT > 0 && (this.ghostT -= dt) <= 0) this.updateInfo();
    if (this.bonus && (this.bonus.t -= dt) <= 0) this.bonus = null;
    if (this.feast && (this.feast.t -= dt) <= 0) this.feast = null;
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
    const feastIdx = this.feast ? this.feast.items.findIndex(at) : -1;
    const grow = eatFood || feastIdx >= 0;
    const body = grow ? this.snake : this.snake.slice(0, -1); // 꼬리는 이번 턴에 빠짐
    if ((out && !this.cfg.wrap) || (this.ghostT <= 0 && body.some((s) => s.x === head.x && s.y === head.y)) || this.rocks.some(at)) {
      this.shake(8);
      this.burst((this.snake[0].x + 0.5) * CELL, (this.snake[0].y + 0.5) * CELL, { color: '#4ade80', count: 24, speed: 180 });
      this.sound('hit');
      return this.gameOver('게임 오버', `길이 ${this.snake.length} · 먹이 ${this.eaten}개`);
    }
    this.snake.unshift(head);
    const cx = (head.x + 0.5) * CELL, cy = (head.y + 0.5) * CELL;
    if (eatFood) {
      this.eaten++;
      if (this.stageMode && ++this.stageEat >= this.stageGoal) {
        // 스테이지 클리어: 빨리 깰수록 보너스
        const bonus = 100 * this.stageNo + Math.max(0, Math.round(60 - (this.time - this.stageStart)) * 5);
        this.addScore(bonus);
        this.floatText(W / 2, H / 2 + 30, `클리어 보너스 +${bonus}`, '#fde68a', 16);
        this.sound('levelup');
        this.stageNo++;
        this.loadStage();
        return;
      }
      // 콤보: 3초 안에 다음 먹이를 먹으면 점수 배수
      this.combo = this.comboT > 0 ? this.combo + 1 : 1;
      this.comboT = COMBO_TIME;
      const pts = 10 * Math.min(this.combo, 8);
      this.addScore(pts);
      if (this.combo > 1) this.floatText(cx, cy - 8, `콤보 ×${this.combo} +${pts}`, '#fde68a', 13);
      this.interval = Math.max(0.06, this.interval * 0.975);
      this.burst(cx, cy, { color: '#fb923c', count: 10, speed: 100, life: 0.4 });
      sfx.tone(520 * Math.pow(1.06, Math.min(this.combo, 12) - 1), 880 * Math.pow(1.06, Math.min(this.combo, 12) - 1), 0.07, 0.05); // 콤보가 오를수록 높은 음
      this.vibrate(15);
      this.food = this.freeCell();
      if (!this.food) return this.gameOver('완벽한 클리어!');
      if (this.eaten % 5 === 0 && !this.bonus) { const c = this.freeCell(); if (c) this.bonus = { ...c, t: BONUS_TIME }; }
      if (this.eaten % 7 === 3 && !this.item) { const c = this.freeCell(); if (c) this.item = { ...c, t: ITEM_TIME, kind: ['ice', 'cut', 'ghost'][randInt(3)] }; }
      if (this.cfg.rocks && !this.stageMode && this.eaten % 4 === 0) this.addRock();
      if (this.portals && this.eaten % 10 === 0) this.movePortals();
      // 먹이 폭풍: 15개마다 6초 동안 작은 먹이가 잔뜩 (클래식 모드)
      if (!this.stageMode && this.eaten % 15 === 0) this.startFeast();
    } else if (feastIdx >= 0) {
      this.feast.items.splice(feastIdx, 1);
      this.feast.got++;
      const pts = 15 + this.feast.got * 5;
      this.addScore(pts);
      this.floatText(cx, cy - 8, `+${pts}`, '#fca5a5', 12);
      this.burst(cx, cy, { color: '#f472b6', count: 6, speed: 80, life: 0.3 });
      sfx.tone(700 + this.feast.got * 40, 1100 + this.feast.got * 40, 0.05, 0.04);
      if (!this.feast.items.length) { this.addScore(100); this.floatText(W / 2, 40, '폭풍 싹쓸이! +100', '#fde68a', 16); this.sound('bonus'); this.feast = null; }
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
      else if (this.item.kind === 'ghost') { this.ghostT = 5; this.floatText(cx, cy - 8, '유령! 몸 통과', '#c4b5fd', 14); }
      else {
        const cut = Math.min(3, this.snake.length - 3);
        for (let i = 0; i < cut; i++) this.snake.pop();
        this.addScore(cut * 15);
        this.floatText(cx, cy - 8, `싹둑! +${cut * 15}`, '#f9a8d4', 14);
      }
      this.burst(cx, cy, { color: { ice: '#7dd3fc', ghost: '#c4b5fd' }[this.item.kind] ?? '#f9a8d4', count: 14, speed: 120 });
      this.sound('power');
      this.item = null;
    }
    this.updateInfo();
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    // 체크무늬 바탕 + 바위는 캐시해 두고 붙이기만 함
    this.drawCached(ctx, 'snake-bg', 0, 0, W, H, (c) => {
      // 풀밭 체크무늬 + 가장자리 어둡게
      c.fillStyle = '#14251c'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#183022';
      for (let y = 0; y < ROWS; y++) for (let x = y % 2; x < COLS; x += 2) c.fillRect(x * CELL, y * CELL, CELL, CELL);
      for (let i = 0; i < 160; i++) { // 풀잎
        c.strokeStyle = `rgba(134,239,172,${0.05 + Math.random() * 0.08})`; c.lineWidth = 1;
        const x = Math.random() * W, y = Math.random() * H;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 3); c.stroke();
      }
      const vg = c.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
    });
    if (this.cfg.wrap) { ctx.strokeStyle = 'rgba(56,189,248,.35)'; ctx.setLineDash([4, 4]); ctx.strokeRect(1, 1, W - 2, H - 2); ctx.setLineDash([]); }
    if (this.rocks.length) this.drawCached(ctx, `snake-rocks${this.stageMode ? `s${this.stageNo}-` : ''}${this.rocks.length}`, 0, 0, W, H, (c) => {
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
      // 사과: 그라데이션 + 꼭지 + 잎 + 반짝임
      const fx = (this.food.x + 0.5) * CELL, fy = (this.food.y + 0.5) * CELL + 1, fr = (CELL / 2 - 3) * pulse;
      const ag = ctx.createRadialGradient(fx - fr * 0.4, fy - fr * 0.4, 1, fx, fy, fr);
      ag.addColorStop(0, '#fdba74'); ag.addColorStop(1, '#ea580c');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy - fr + 1); ctx.lineTo(fx + 1, fy - fr - 3); ctx.stroke();
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.ellipse(fx + 4, fy - fr - 2, 3.5, 1.8, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(fx - fr * 0.35, fy - fr * 0.35, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    if (this.feast) { // 먹이 폭풍: 작은 체리
      const blink = this.feast.t < 1.5 && Math.floor(this.feast.t * 8) % 2 === 0;
      if (!blink) for (const f of this.feast.items) {
        const fx = (f.x + 0.5) * CELL, fy = (f.y + 0.5) * CELL + 2;
        ctx.strokeStyle = '#65a30d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx - 3, fy - 1); ctx.lineTo(fx, fy - 8); ctx.lineTo(fx + 3, fy - 1); ctx.stroke();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(fx - 3, fy, 3.4, 0, Math.PI * 2); ctx.arc(fx + 3, fy, 3.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (this.bonus && !(this.bonus.t < 2 && Math.floor(this.bonus.t * 8) % 2 === 0)) this.drawStar(ctx, this.bonus, '#facc15', pulse);
    if (this.item && !(this.item.t < 2 && Math.floor(this.item.t * 8) % 2 === 0)) {
      ctx.font = `${Math.round(15 * pulse)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText({ ice: '🧊', ghost: '👻' }[this.item.kind] ?? '✂️', (this.item.x + 0.5) * CELL, (this.item.y + 0.5) * CELL + 1);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    // 유령 상태: 반투명 (끝나기 1.5초 전부터 깜빡여 알림)
    if (this.ghostT > 0) ctx.globalAlpha = this.ghostT < 1.5 && Math.floor(this.ghostT * 8) % 2 ? 0.85 : 0.45;
    this.drawSnake(ctx);
    ctx.globalAlpha = 1;
    if (this.hold && !this.banner && this.state === 'playing') {
      ctx.fillStyle = 'rgba(10,14,20,.6)'; ctx.fillRect(0, H / 2 + 34, W, 34);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.font = '800 14px system-ui, sans-serif';
      ctx.fillText(this.touchMode ? '가고 싶은 방향으로 밀면 출발!' : '방향키를 누르면 출발!', W / 2, H / 2 + 56);
      ctx.textAlign = 'start';
    }
    if (this.banner) {
      ctx.globalAlpha = Math.min(1, this.banner.t / 0.3);
      ctx.fillStyle = 'rgba(10,14,20,.6)'; ctx.fillRect(0, H / 2 - 44, W, 76);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillText(this.banner.text, W / 2, H / 2 - 6);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(`${this.banner.sub} · 먹이 ${this.stageGoal}개`, W / 2, H / 2 + 20);
      ctx.textAlign = 'start'; ctx.globalAlpha = 1;
    }
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
    // 등 무늬: 마디마다 밝은 점 + 몸통 위 하이라이트
    for (let i = 2; i < pts.length; i += 2) {
      const a = pts[i];
      if (a.jump) continue;
      ctx.fillStyle = slow ? 'rgba(224,242,254,.35)' : 'rgba(187,247,208,.32)';
      ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(2, (CELL - 8 - (i / pts.length) * 4) * 0.22), 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i], b = pts[i - 1];
      if (b.jump || Math.hypot(a.x - b.x, a.y - b.y) > CELL * 1.5) continue;
      ctx.moveTo(a.x - 2, a.y - 3); ctx.lineTo(b.x - 2, b.y - 3);
    }
    ctx.stroke();
    // 머리
    const h = pts[0], d = this.dir;
    // 혀 (가끔 날름)
    if (Math.floor(performance.now() / 260) % 5 === 0) {
      const tx = h.x + d.x * 13, ty = h.y + d.y * 13;
      ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(h.x + d.x * 8, h.y + d.y * 8); ctx.lineTo(tx, ty);
      ctx.lineTo(tx + d.x * 3 + d.y * 2.5, ty + d.y * 3 + d.x * 2.5); ctx.moveTo(tx, ty); ctx.lineTo(tx + d.x * 3 - d.y * 2.5, ty + d.y * 3 - d.x * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = slow ? '#7dd3fc' : '#86efac';
    ctx.beginPath(); ctx.arc(h.x, h.y, CELL / 2 - 1, 0, Math.PI * 2); ctx.fill();
    const ex = h.x + d.x * 3, ey = h.y + d.y * 3;
    for (const sd of [1, -1]) {
      const px = ex + d.y * 4.2 * sd, py = ey + d.x * 4.2 * sd;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(px + d.x * 1.2, py + d.y * 1.2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + d.x * 1.2 - 0.7, py + d.y * 1.2 - 0.7, 0.7, 0, Math.PI * 2); ctx.fill();
    }
    if (this.combo > 1) {
      ctx.fillStyle = '#fde68a'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`×${this.combo}`, h.x, h.y - 13); ctx.textAlign = 'start';
    }
  }
}
