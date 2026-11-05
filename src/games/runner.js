import { GameBase, roundRect } from '../engine.js';

const W = 560, H = 300, GROUND = 250;
const PLAYER = { x: 70, w: 28, h: 36 };
const GRAVITY = 2300, JUMP_V = -760, CUT_V = -280;
const BIRD_FROM = 250; // 이 점수부터 공중 장애물 등장

export default class Runner extends GameBase {
  static meta = {
    id: 'runner',
    title: '점프 러너',
    description: '달려오는 장애물을 뛰어넘으세요. 공중 장애물은 점프하지 말고 아래로 지나가요!',
    controls: 'Space / ↑ / 클릭 점프 · 길게 누르면 높이 점프',
    touchControls: '화면 탭 점프 · 길게 누르면 높이 점프',
  };
  static pad = { left: null, buttons: [{ action: 'action', label: '점프', primary: true, wide: true }] };
  static gestures = { tap: null, up: null }; // 터치는 누르는 순간 바로 점프 (아래 onPointer)
  static mouseClick = null;

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
    // 탭은 손을 뗄 때가 아니라 누르는 순간 점프해야 반응이 좋다
    this.$screen.addEventListener('pointerdown', () => { if (this.state === 'playing') this.jump(); });
    this.stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 60), s: Math.random() * 1.5 + 0.5 }));
    this.hills = Array.from({ length: 8 }, (_, i) => ({ x: i * 110, h: 30 + Math.random() * 50 }));
  }

  init() {
    this.y = GROUND - PLAYER.h;
    this.vy = 0;
    this.speed = 320;
    this.distance = 0;
    this.obstacles = [];
    this.spawnIn = 1.2;
    this.groundOffset = 0;
    this.nextMilestone = 100;
    this.wasGround = true;
    this.runT = 0;
  }

  get onGround() { return this.y >= GROUND - PLAYER.h; }

  jump() {
    if (!this.onGround) return;
    this.vy = JUMP_V;
    this.sound('jump');
  }

  onAction(action, repeat) {
    if ((action === 'action' || action === 'up') && !repeat) this.jump();
  }

  spawn() {
    const score = this.score;
    const r = Math.random();
    if (score >= BIRD_FROM && r < 0.22) {
      // 공중 장애물: 서 있으면 머리 위로 지나감, 점프하면 부딪힘
      this.obstacles.push({ x: W + 10, w: 34, h: 18, y: GROUND - PLAYER.h - 34 - Math.random() * 22, bird: true });
    } else if (score >= 150 && r < 0.4) {
      // 두 개 붙은 장애물
      const h = 26 + Math.random() * 10;
      this.obstacles.push({ x: W + 10, w: 18, h, y: GROUND - h });
      this.obstacles.push({ x: W + 30, w: 18, h: h + 10, y: GROUND - h - 10 });
    } else {
      const tall = Math.random() < 0.3;
      const w = 18 + Math.random() * 18, h = tall ? 50 : 28 + Math.random() * 12;
      this.obstacles.push({ x: W + 10, w, h, y: GROUND - h });
    }
    const tight = Math.min(0.4, (this.speed - 320) / 900);
    this.spawnIn = 0.75 + Math.random() * 1.0 - tight;
  }

  update(dt) {
    // 버튼을 떼면 상승을 끊어서 짧은 점프 (가변 점프 높이)
    const holding = this.isDown('action') || this.isDown('up') || this.pointer.down;
    if (!holding && this.vy < CUT_V) this.vy = CUT_V;

    this.vy += GRAVITY * dt;
    this.y = Math.min(GROUND - PLAYER.h, this.y + this.vy * dt);
    if (this.onGround) {
      this.vy = 0;
      if (!this.wasGround) {
        this.sound('land');
        this.burst(PLAYER.x + PLAYER.w / 2, GROUND, { color: '#64748b', count: 6, speed: 60, life: 0.3 });
      }
    }
    this.wasGround = this.onGround;
    this.runT += dt * this.speed / 40;

    this.speed = Math.min(900, this.speed + 9 * dt);
    this.distance += this.speed * dt;
    this.groundOffset = (this.groundOffset + this.speed * dt) % 40;
    this.setScore(Math.floor(this.distance / 10));
    this.setInfo(`속도 ×${(this.speed / 320).toFixed(1)}`);
    if (this.score >= this.nextMilestone) {
      this.sound('tick');
      this.floatText(W / 2, 60, `${this.nextMilestone}!`, '#a3e635', 20);
      this.nextMilestone += 100;
    }
    for (const h of this.hills) { h.x -= this.speed * 0.15 * dt; if (h.x < -120) { h.x += 880; h.h = 30 + Math.random() * 50; } }
    for (const st of this.stars) { st.x -= this.speed * 0.03 * st.s * dt; if (st.x < 0) st.x += W; }

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) this.spawn();
    for (const o of this.obstacles) o.x -= this.speed * dt * (o.bird ? 1.15 : 1);
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -10);

    // 충돌 (약간 여유를 둔 박스)
    const px = PLAYER.x + 5, py = this.y + 5, pw = PLAYER.w - 10, ph = PLAYER.h - 7;
    for (const o of this.obstacles) {
      if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
        this.sound('hit');
        this.shake(8);
        this.burst(PLAYER.x + PLAYER.w / 2, this.y + PLAYER.h / 2, { color: '#a3e635', count: 20, speed: 170 });
        return this.gameOver();
      }
    }
  }

  draw(ctx) {
    // 배경: 하늘 그라데이션, 별, 언덕(시차 스크롤)
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#0b1023'); sky.addColorStop(1, '#1a1f3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);
    ctx.fillStyle = '#cbd5e1';
    for (const st of this.stars) { ctx.globalAlpha = 0.3 + st.s * 0.3; ctx.fillRect(st.x, st.y, st.s, st.s); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#232a4a';
    for (const h of this.hills) {
      ctx.beginPath(); ctx.moveTo(h.x - 20, GROUND); ctx.quadraticCurveTo(h.x + 50, GROUND - h.h * 2, h.x + 120, GROUND); ctx.fill();
    }

    ctx.fillStyle = '#111522';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = '#2b3448';
    for (let x = -(this.groundOffset ?? 0); x < W; x += 40) ctx.fillRect(x, GROUND + 14, 18, 2);

    for (const o of this.obstacles ?? []) {
      if (o.bird) {
        ctx.fillStyle = '#fb7185';
        const flap = Math.sin(performance.now() / 70) * 6;
        roundRect(ctx, o.x, o.y + 4, o.w, o.h - 8, 6);
        ctx.beginPath(); ctx.moveTo(o.x + 8, o.y + 8); ctx.lineTo(o.x + 17, o.y - 4 + flap); ctx.lineTo(o.x + 26, o.y + 8); ctx.fill();
      } else {
        ctx.fillStyle = '#f472b6';
        roundRect(ctx, o.x, o.y, o.w, o.h, 4);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(o.x + 3, o.y + 3, 3, o.h - 6);
      }
    }

    // 플레이어: 점프 중엔 늘어나고, 달릴 땐 다리 움직임
    const y = this.y ?? GROUND - PLAYER.h;
    const air = this.onGround === false;
    const stretch = air ? Math.min(0.12, Math.abs(this.vy) / 6000) : 0;
    const w = PLAYER.w * (1 - stretch), h = PLAYER.h * (1 + stretch);
    const x = PLAYER.x + (PLAYER.w - w) / 2, top = y + PLAYER.h - h;
    ctx.fillStyle = '#65a30d';
    if (!air && this.state === 'playing') {
      const leg = Math.sin(this.runT) * 4;
      ctx.fillRect(x + 6 + leg, y + PLAYER.h - 4, 6, 6);
      ctx.fillRect(x + w - 12 - leg, y + PLAYER.h - 4, 6, 6);
    }
    ctx.fillStyle = '#a3e635';
    roundRect(ctx, x, top, w, h - 3, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + w - 11, top + 9, 4, 5);
  }
}
