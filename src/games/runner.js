import { GameBase, roundRect } from '../engine.js';

const W = 640, H = 220, GROUND = 180;
const PLAYER = { x: 70, w: 28, h: 34 };
const GRAVITY = 2200, JUMP_V = -720;

export default class Runner extends GameBase {
  static meta = {
    id: 'runner',
    title: '점프 러너',
    description: '달려오는 장애물을 뛰어넘으세요. 점점 빨라집니다!',
    controls: 'Space / ↑ / 탭 점프 (길게 누르면 높이 점프)',
  };

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
  }

  init() {
    this.y = GROUND - PLAYER.h;
    this.vy = 0;
    this.speed = 300;
    this.distance = 0;
    this.obstacles = [];
    this.spawnIn = 1;
    this.groundOffset = 0;
  }

  get onGround() { return this.y >= GROUND - PLAYER.h; }

  onAction(action, repeat) {
    if ((action === 'action' || action === 'up') && !repeat && this.onGround) this.vy = JUMP_V;
  }

  update(dt) {
    // 버튼을 떼면 상승을 끊어서 짧은 점프 (가변 점프 높이)
    const holding = this.isDown('action') || this.isDown('up') || this.pointer.down;
    if (!holding && this.vy < -250) this.vy = -250;

    this.vy += GRAVITY * dt;
    this.y = Math.min(GROUND - PLAYER.h, this.y + this.vy * dt);
    if (this.onGround) this.vy = 0;

    this.speed += 8 * dt;
    this.distance += this.speed * dt;
    this.groundOffset = (this.groundOffset + this.speed * dt) % 40;
    this.setScore(Math.floor(this.distance / 10));

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const tall = Math.random() < 0.3;
      const w = 18 + Math.random() * 22;
      this.obstacles.push({ x: W + 10, w, h: tall ? 48 : 28 + Math.random() * 10 });
      this.spawnIn = 0.7 + Math.random() * 1.1 - Math.min(0.35, (this.speed - 300) / 1000);
    }
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -10);

    // 충돌 (약간 여유를 둔 박스)
    const px = PLAYER.x + 4, py = this.y + 4, pw = PLAYER.w - 8, ph = PLAYER.h - 6;
    for (const o of this.obstacles) {
      const oy = GROUND - o.h;
      if (px < o.x + o.w && px + pw > o.x && py < oy + o.h && py + ph > oy) return this.gameOver();
    }
  }

  draw(ctx) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = '#1e293b';
    for (let x = -this.groundOffset; x < W; x += 40) ctx.fillRect(x, GROUND + 12, 18, 2);

    ctx.fillStyle = '#f472b6';
    for (const o of this.obstacles) roundRect(ctx, o.x, GROUND - o.h, o.w, o.h, 4);

    ctx.fillStyle = '#a3e635';
    roundRect(ctx, PLAYER.x, this.y, PLAYER.w, PLAYER.h, 7);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(PLAYER.x + 18, this.y + 9, 4, 4);
  }
}
