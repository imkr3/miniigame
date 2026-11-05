import { GameBase, roundRect } from '../engine.js';

const W = 480, H = 520;
const BRICK_COLS = 8, BRICK_ROWS = 6, BRICK_H = 18, BRICK_GAP = 5, BRICK_TOP = 56;
const ROW_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
const PADDLE_W = 84, WIDE_W = 132, PADDLE_H = 12, PADDLE_Y = H - 40, BALL_R = 6;
const MAX_SPEED = 560;

// 아이템: 벽돌을 깨면 가끔 떨어진다
const POWERS = {
  wide:  { label: 'W', color: '#22d3ee', text: '패들 확장!', weight: 4 },
  multi: { label: 'M', color: '#f472b6', text: '멀티볼!', weight: 3 },
  slow:  { label: 'S', color: '#a3e635', text: '슬로우!', weight: 3 },
  life:  { label: '♥', color: '#f87171', text: '목숨 +1', weight: 1 },
};
const DROP_CHANCE = 0.14;

function pickPower() {
  const entries = Object.entries(POWERS);
  let r = Math.random() * entries.reduce((a, [, p]) => a + p.weight, 0);
  for (const [k, p] of entries) { if ((r -= p.weight) < 0) return k; }
  return 'wide';
}

export default class Breakout extends GameBase {
  static meta = {
    id: 'breakout',
    title: '벽돌깨기',
    description: '공을 튕겨 벽돌을 모두 깨세요. 떨어지는 아이템(W 확장 · M 멀티볼 · S 슬로우 · ♥ 목숨)을 받아보세요!',
    controls: '마우스 이동 또는 ←→ · 클릭/Space 발사',
    touchControls: '화면을 좌우로 끌어 패들 이동 · 탭해서 발사',
  };
  static pad = { left: 'lr', buttons: [{ action: 'action', label: '발사', primary: true, wide: true }] };
  static gestures = { tap: 'action' }; // 스와이프는 패들 드래그에 사용
  static mouseClick = 'action';

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
  }

  init() {
    this.lives = 3;
    this.level = 1;
    this.paddle = { x: W / 2 - PADDLE_W / 2, w: PADDLE_W };
    this.dragX = null;
    this.buildBricks();
    this.resetBall();
  }

  buildBricks() {
    const bw = (W - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS;
    this.bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++)
      for (let c = 0; c < BRICK_COLS; c++) {
        // 레벨이 오르면 위쪽 줄은 두 번 맞아야 깨지고, 일부 칸은 비움
        if (this.level >= 3 && (r + c + this.level) % 7 === 0) continue;
        const hp = this.level >= 2 && r < Math.min(this.level - 1, 3) ? 2 : 1;
        this.bricks.push({
          x: BRICK_GAP + c * (bw + BRICK_GAP), y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: bw, h: BRICK_H, color: ROW_COLORS[r], points: (BRICK_ROWS - r) * 10, hp, maxHp: hp,
        });
      }
  }

  resetBall() {
    const p = this.paddle;
    this.balls = [{ x: p.x + p.w / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, trail: [] }];
    this.drops = [];
    this.effects = { wide: 0, slow: 0 };
    this.speed = 300 + (this.level - 1) * 25;
    this.updateInfo();
  }

  updateInfo() {
    const fx = [this.effects?.wide > 0 && 'W', this.effects?.slow > 0 && 'S'].filter(Boolean).join(' ');
    this.setInfo(`${fx ? `[${fx}] ` : ''}목숨 ${'●'.repeat(this.lives)} · 레벨 ${this.level}`);
  }

  get ballSpeed() { return this.speed * (this.effects.slow > 0 ? 0.68 : 1); }

  setVelocity(b, angle) {
    b.vx = Math.cos(angle) * this.ballSpeed;
    b.vy = Math.sin(angle) * this.ballSpeed;
  }

  launch() {
    const b = this.balls.find((x) => x.stuck);
    if (!b) return;
    this.setVelocity(b, -Math.PI / 2 + (Math.random() - 0.5) * 0.6);
    b.stuck = false;
    this.sound('bounce');
  }

  onAction(action) { if (action === 'action' || action === 'up') this.launch(); }

  movePaddle(dt) {
    const p = this.paddle, ptr = this.pointer;
    // 확장 아이템: 중심을 유지한 채 부드럽게 폭 변경
    const targetW = this.effects.wide > 0 ? WIDE_W : PADDLE_W;
    const nw = p.w + (targetW - p.w) * Math.min(1, dt * 10);
    p.x -= (nw - p.w) / 2; p.w = nw;

    if (this.isDown('left')) p.x -= 460 * dt;
    if (this.isDown('right')) p.x += 460 * dt;
    if (ptr.type === 'mouse') {
      if (ptr.moved) { p.x = ptr.x - p.w / 2; ptr.moved = false; }
    } else if (ptr.down) {
      // 터치는 상대 이동: 손가락이 패들을 가리지 않도록 화면 어디서나 끌기
      if (this.dragX !== null) p.x += (ptr.x - this.dragX) * 1.3;
      this.dragX = ptr.x;
    } else this.dragX = null;
    p.x = Math.max(0, Math.min(W - p.w, p.x));
  }

  update(dt) {
    for (const k of ['wide', 'slow']) {
      if (this.effects[k] > 0 && (this.effects[k] -= dt) <= 0) {
        this.effects[k] = 0;
        if (k === 'slow') for (const b of this.balls) this.rescale(b);
        this.updateInfo();
      }
    }
    this.movePaddle(dt);
    const p = this.paddle;

    // 아이템 낙하
    for (const d of this.drops) {
      d.y += 150 * dt;
      if (d.y + 9 >= PADDLE_Y && d.y - 9 <= PADDLE_Y + PADDLE_H && d.x >= p.x - 8 && d.x <= p.x + p.w + 8) {
        d.taken = true;
        this.applyPower(d.type, d.x);
      }
    }
    this.drops = this.drops.filter((d) => !d.taken && d.y < H + 20);

    for (const b of this.balls) {
      if (b.stuck) { b.x = p.x + p.w / 2; b.y = PADDLE_Y - BALL_R - 1; continue; }
      // 빠른 공이 벽돌을 뚫지 않도록 잘게 나눠 이동
      const steps = Math.ceil((this.ballSpeed * dt) / 4);
      for (let i = 0; i < steps && !b.lost; i++) this.step(b, dt / steps);
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();
    }
    if (this.state !== 'playing') return;

    this.balls = this.balls.filter((b) => !b.lost);
    if (!this.balls.length) {
      this.lives--;
      this.sound('hit');
      this.shake(6);
      this.vibrate(120);
      this.updateInfo();
      if (this.lives <= 0) return this.gameOver();
      this.paddle.w = PADDLE_W;
      this.resetBall();
      return;
    }

    if (this.bricks.length === 0) {
      this.level++;
      this.addScore(200 + this.lives * 50);
      this.sound('levelup');
      this.floatText(W / 2, H / 2, `레벨 ${this.level}!`, '#93c5fd', 26);
      this.buildBricks();
      this.resetBall();
    }
  }

  rescale(b) {
    const v = Math.hypot(b.vx, b.vy);
    if (v > 0) { b.vx *= this.ballSpeed / v; b.vy *= this.ballSpeed / v; }
  }

  applyPower(type, x) {
    const pw = POWERS[type];
    this.floatText(x, PADDLE_Y - 14, pw.text, pw.color, 16);
    this.burst(x, PADDLE_Y, { color: pw.color, count: 14, speed: 120 });
    this.sound('bonus');
    this.vibrate(20);
    if (type === 'wide') this.effects.wide = 12;
    if (type === 'slow') { this.effects.slow = 8; for (const b of this.balls) this.rescale(b); }
    if (type === 'life') this.lives = Math.min(5, this.lives + 1);
    if (type === 'multi') {
      const extra = [];
      for (const b of this.balls.filter((x) => !x.stuck).slice(0, 4)) {
        const a = Math.atan2(b.vy, b.vx);
        for (const off of [-0.45, 0.45]) {
          const nb = { x: b.x, y: b.y, vx: 0, vy: 0, stuck: false, trail: [] };
          this.setVelocity(nb, a + off);
          extra.push(nb);
        }
      }
      if (!extra.length) this.launch();
      this.balls.push(...extra);
    }
    this.updateInfo();
  }

  step(b, dt) {
    const p = this.paddle;
    b.x += b.vx * dt;
    if (b.x < BALL_R || b.x > W - BALL_R) {
      b.vx *= -1; b.x = Math.max(BALL_R, Math.min(W - BALL_R, b.x)); this.sound('bounce');
    }
    if (this.hitBrick(b)) b.vx *= -1;

    b.y += b.vy * dt;
    if (b.y < BALL_R) { b.vy = Math.abs(b.vy); b.y = BALL_R; this.sound('bounce'); }
    if (this.hitBrick(b)) b.vy *= -1;

    // 패들: 맞은 위치에 따라 반사각 변경
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
        b.x >= p.x - BALL_R && b.x <= p.x + p.w + BALL_R) {
      let hit = Math.max(-1, Math.min(1, (b.x - (p.x + p.w / 2)) / (p.w / 2)));
      if (Math.abs(hit) < 0.1) hit = (hit < 0 ? -1 : 1) * (0.1 + Math.random() * 0.1); // 수직 무한 반복 방지
      this.speed = Math.min(MAX_SPEED, this.speed + 4);
      this.setVelocity(b, -Math.PI / 2 + hit * 1.05);
      b.y = PADDLE_Y - BALL_R;
      this.sound('bounce');
    }

    if (b.y > H + BALL_R * 2) b.lost = true;
  }

  hitBrick(b) {
    const i = this.bricks.findIndex((k) =>
      b.x + BALL_R > k.x && b.x - BALL_R < k.x + k.w && b.y + BALL_R > k.y && b.y - BALL_R < k.y + k.h);
    if (i < 0) return false;
    const k = this.bricks[i];
    k.hp--;
    if (k.hp <= 0) {
      this.addScore(k.points);
      this.bricks.splice(i, 1);
      this.burst(k.x + k.w / 2, k.y + k.h / 2, { color: k.color, count: 12, speed: 150, life: 0.5, gravity: 400 });
      this.sound('brick');
      if (Math.random() < DROP_CHANCE && this.bricks.length > 0)
        this.drops.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, type: pickPower() });
    } else {
      this.sound('lock');
    }
    return true;
  }

  draw(ctx) {
    for (const k of this.bricks) {
      ctx.globalAlpha = k.hp < k.maxHp ? 0.55 : 1;
      ctx.fillStyle = k.color;
      roundRect(ctx, k.x, k.y, k.w, k.h, 4);
      if (k.maxHp > 1) { // 단단한 벽돌 표시
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(k.x + 4, k.y + k.h / 2 - 1, k.w - 8, 2);
      }
    }
    ctx.globalAlpha = 1;

    // 아이템 캡슐
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of this.drops ?? []) {
      const pw = POWERS[d.type];
      ctx.fillStyle = pw.color;
      roundRect(ctx, d.x - 16, d.y - 9, 32, 18, 9);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(pw.label, d.x, d.y + 4);
    }
    ctx.textAlign = 'start';

    const p = this.paddle;
    const g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    const wide = this.effects?.wide > 0;
    g.addColorStop(0, wide ? '#a5f3fc' : '#f8fafc'); g.addColorStop(1, wide ? '#0891b2' : '#94a3b8');
    ctx.fillStyle = g;
    roundRect(ctx, p.x, PADDLE_Y, p.w, PADDLE_H, 6);

    const slow = this.effects?.slow > 0;
    for (const b of this.balls ?? []) {
      b.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / b.trail.length) * 0.3;
        ctx.fillStyle = slow ? '#bef264' : '#93c5fd';
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (i / b.trail.length), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = slow ? '#d9f99d' : '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    }

    if (this.state === 'playing' && this.balls.some((b) => b.stuck)) {
      ctx.fillStyle = 'rgba(229,231,235,.7)';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.touchMode ? '탭해서 발사' : '클릭 / Space로 발사', W / 2, PADDLE_Y - 40);
      ctx.textAlign = 'start';
    }
  }
}
