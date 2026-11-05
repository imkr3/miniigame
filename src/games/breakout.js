import { GameBase, roundRect } from '../engine.js';

const W = 480, H = 400;
const BRICK_COLS = 8, BRICK_ROWS = 5, BRICK_H = 18, BRICK_GAP = 4, BRICK_TOP = 50;
const ROW_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8'];
const PADDLE_W = 80, PADDLE_H = 10, PADDLE_Y = H - 30, BALL_R = 6;

export default class Breakout extends GameBase {
  static meta = {
    id: 'breakout',
    title: '벽돌깨기',
    description: '공을 튕겨 벽돌을 모두 깨세요.',
    controls: '←→ 또는 마우스/터치 드래그 · Space/탭 발사',
  };

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
  }

  init() {
    this.lives = 3;
    this.level = 1;
    this.paddle = { x: W / 2 - PADDLE_W / 2 };
    this.buildBricks();
    this.resetBall();
  }

  buildBricks() {
    const bw = (W - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS;
    this.bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++)
      for (let c = 0; c < BRICK_COLS; c++)
        this.bricks.push({
          x: BRICK_GAP + c * (bw + BRICK_GAP), y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: bw, h: BRICK_H, color: ROW_COLORS[r], points: (BRICK_ROWS - r) * 10,
        });
  }

  resetBall() {
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, stuck: true };
    this.speed = 280 + (this.level - 1) * 30;
    this.updateInfo();
  }

  updateInfo() { this.setInfo(`목숨 ${'●'.repeat(this.lives)} · 레벨 ${this.level}`); }

  launch() {
    const b = this.ball;
    if (!b.stuck) return;
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6;
    b.vx = Math.cos(a) * this.speed;
    b.vy = Math.sin(a) * this.speed;
    b.stuck = false;
  }

  onAction(action) { if (action === 'action') this.launch(); }

  update(dt) {
    // 패들 이동: 키보드 또는 포인터
    const p = this.paddle;
    if (this.isDown('left')) p.x -= 420 * dt;
    if (this.isDown('right')) p.x += 420 * dt;
    if (this.pointer.down) p.x = this.pointer.x - PADDLE_W / 2;
    p.x = Math.max(0, Math.min(W - PADDLE_W, p.x));

    const b = this.ball;
    if (b.stuck) { b.x = p.x + PADDLE_W / 2; b.y = PADDLE_Y - BALL_R - 1; return; }

    // 축별로 나눠 이동해서 어느 면에 부딪혔는지 판정
    b.x += b.vx * dt;
    if (b.x < BALL_R || b.x > W - BALL_R) { b.vx *= -1; b.x = Math.max(BALL_R, Math.min(W - BALL_R, b.x)); }
    if (this.hitBrick()) b.vx *= -1;

    b.y += b.vy * dt;
    if (b.y < BALL_R) { b.vy = Math.abs(b.vy); b.y = BALL_R; }
    if (this.hitBrick()) b.vy *= -1;

    // 패들: 맞은 위치에 따라 반사각 변경
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 8 &&
        b.x >= p.x - BALL_R && b.x <= p.x + PADDLE_W + BALL_R) {
      const hit = (b.x - (p.x + PADDLE_W / 2)) / (PADDLE_W / 2); // -1 ~ 1
      const a = -Math.PI / 2 + hit * 1.05;
      b.vx = Math.cos(a) * this.speed;
      b.vy = Math.sin(a) * this.speed;
      b.y = PADDLE_Y - BALL_R;
    }

    if (b.y > H + BALL_R) {
      this.lives--;
      if (this.lives <= 0) { this.updateInfo(); return this.gameOver(); }
      this.resetBall();
    }

    if (this.bricks.length === 0) {
      this.level++;
      this.addScore(200);
      this.buildBricks();
      this.resetBall();
    }
  }

  hitBrick() {
    const b = this.ball;
    const i = this.bricks.findIndex((k) =>
      b.x + BALL_R > k.x && b.x - BALL_R < k.x + k.w && b.y + BALL_R > k.y && b.y - BALL_R < k.y + k.h);
    if (i < 0) return false;
    this.addScore(this.bricks[i].points);
    this.bricks.splice(i, 1);
    return true;
  }

  draw(ctx) {
    for (const k of this.bricks) { ctx.fillStyle = k.color; roundRect(ctx, k.x, k.y, k.w, k.h, 4); }
    ctx.fillStyle = '#e2e8f0';
    roundRect(ctx, this.paddle.x, PADDLE_Y, PADDLE_W, PADDLE_H, 5);
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }
}
