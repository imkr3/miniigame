import { GameBase, roundRect } from '../engine.js';
import { sfx } from '../sfx.js';

// 벽돌깨기
// - 스테이지 디자인 8종 + 이후 무작위 대칭 생성, 5레벨마다 보스 벽돌
// - 특수 벽돌: 단단한(2~3번), 철벽(안 깨짐), 폭탄(주변 연쇄 폭발), 아이템(아이템 확정)
// - 아이템 8종: 확장·멀티볼·슬로우·목숨·레이저·불공·캐치·축소(나쁨)
const W = 480, H = 540;
const COLS = 10, GAP = 4, BRICK_H = 16, TOP = 64;
const BRICK_W = (W - GAP * (COLS + 1)) / COLS;
const PADDLE_W = 84, PADDLE_H = 12, PADDLE_Y = H - 40, BALL_R = 6;
const MAX_SPEED = 600;

const ROW_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#c084fc', '#f472b6'];

// . 빈칸 · 1 일반 · 2/3 단단함 · M 철벽 · X 폭탄 · ? 아이템
const LAYOUTS = [
  { name: '기본', rows: ['1111111111', '1111111111', '1111111111', '1111111111', '1111111111'] },
  { name: '피라미드', rows: ['....22....', '...1111...', '..111111..', '.11?11?11.', '1111111111', '2222222222'] },
  { name: '체크무늬', rows: ['2.2.2.2.2.', '.1.1.1.1.1', '2.2.?.2.2.', '.1.1.1.1.1', '1111111111'] },
  { name: '폭탄 공장', rows: ['1111111111', '11X1111X11', '1111111111', '2222X22222', '1111111111', '.?......?.'] },
  { name: '다이아몬드', rows: ['....33....', '...2222...', '..11?111..', '.111XX111.', '..111111..', '...2222...', '....33....'] },
  { name: '요새', rows: ['M22222222M', 'M2.1111.2M', 'M2.1XX1.2M', 'M2.1??1.2M', 'M22....22M'] },
  { name: '하트', rows: ['.22....22.', '2112..2112', '2111111112', '.11111111.', '..11?111..', '...1111...', '....11....'] },
  { name: '미로', rows: ['3333333333', 'M........M', 'M.XX11XX.M', 'M.11??11.M', 'MMMM..MMMM', '1111111111'] },
  { name: '줄무늬', rows: ['X1X1X1X1X1', '2222222222', '1111?11111', '3333333333', '1111111111', 'MM..MM..MM'] },
  { name: '스마일', rows: ['..222222..', '.21111112.', '21X1111X12', '2111??1112', '2131111312', '.21333312.', '..222222..'] },
  { name: '물결', rows: ['2......2..', '12....121.', '.12..12.12', '..1221...1', '...?X?....', '1111111111'] },
  { name: '탑', rows: ['....MM....', '...2XX2...', '...1??1...', '..311113..', '..111111..', '.22222222.', 'M11111111M'] },
];

const POWERS = {
  wide:   { label: 'W', color: '#22d3ee', text: '패들 확장!', weight: 3, time: 12 },
  multi:  { label: 'M', color: '#f472b6', text: '멀티볼!', weight: 3 },
  slow:   { label: 'S', color: '#a3e635', text: '슬로우!', weight: 2, time: 8 },
  laser:  { label: 'L', color: '#fb923c', text: '레이저! (발사 버튼)', weight: 2.5, time: 9 },
  fire:   { label: 'F', color: '#ef4444', text: '불공! 벽돌 관통', weight: 2, time: 7 },
  catch:  { label: 'C', color: '#a78bfa', text: '캐치! 공을 잡아요', weight: 2, time: 12 },
  homing: { label: 'G', color: '#4ade80', text: '유도 공! 벽돌로 휘어 감', weight: 1.8, time: 9 },
  barrier:{ label: 'B', color: '#38bdf8', text: '바닥 방어막! (3번)', weight: 1.5 },
  life:   { label: '♥', color: '#f87171', text: '목숨 +1', weight: 1 },
  shrink: { label: '−', color: '#64748b', text: '패들 축소…', weight: 1.5, time: 8, bad: true },
};
const DROP_CHANCE = 0.12;
const SPEEDS = { slow: 0.82, normal: 1, fast: 1.2 };

function pickPower() {
  const entries = Object.entries(POWERS);
  let r = Math.random() * entries.reduce((a, [, p]) => a + p.weight, 0);
  for (const [k, p] of entries) { if ((r -= p.weight) < 0) return k; }
  return 'wide';
}

/** 레벨 9 이후: 좌우 대칭 무작위 배치 (레벨이 오를수록 단단한·특수 벽돌 증가) */
function randomLayout(level) {
  const rows = [], n = 5 + Math.min(3, Math.floor(level / 6));
  const hard = Math.min(0.5, 0.1 + level * 0.02);
  for (let r = 0; r < n; r++) {
    let half = '';
    for (let c = 0; c < 5; c++) {
      const x = Math.random();
      half += x < 0.12 ? '.' : x < 0.12 + hard ? (Math.random() < 0.4 ? '3' : '2') : x < 0.2 + hard ? 'X' : x < 0.24 + hard ? '?' : x < 0.28 + hard && r > 1 ? 'M' : '1';
    }
    rows.push(half + [...half].reverse().join(''));
  }
  return { name: '무작위', rows };
}

export default class Breakout extends GameBase {
  static meta = {
    id: 'breakout',
    title: '벽돌깨기',
    description: '공을 튕겨 벽돌을 모두 깨세요. 폭탄 벽돌은 주변까지 터지고, 회색 철벽은 깨지지 않아요. 5레벨마다 보스! ⚙에서 시작 레벨 선택 가능',
    controls: '마우스 이동 또는 ←→ · 클릭/Space 발사 (레이저·캐치 때도 발사)',
    touchControls: '화면 아무 곳이나 좌우로 끌어 패들 이동 · 탭해서 발사',
  };
  static pad = { left: 'lr', buttons: [{ action: 'action', label: '발사', primary: true, wide: true }] };
  static gestures = { tap: 'action' }; // 스와이프는 패들 드래그에 사용
  static mouseClick = 'action';
  static settings = [
    { id: 'startLevel', label: '시작 레벨', type: 'range', min: 1, max: 20, default: 1, tip: '5, 10, 15, 20 레벨은 보스. 새 게임부터 적용' },
    { id: 'ballSpeed', label: '공 속도', type: 'select', default: 'normal', options: [['slow', '느림'], ['normal', '보통'], ['fast', '빠름']] },
    { id: 'touchSens', label: '터치 감도', type: 'range', min: 0.8, max: 2.2, step: 0.1, default: 1.3, format: (v) => `×${Number(v).toFixed(1)}` },
  ];

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
  }

  init() {
    this.lives = 3;
    this.barrier = 0;
    this.level = this.cfg.startLevel;
    this.paddle = { x: W / 2 - PADDLE_W / 2, w: PADDLE_W, stun: 0 };
    this.dragX = null;
    this.loadLevel();
  }

  loadLevel() {
    const bossLevel = this.level % 5 === 0;
    const normalIdx = this.level - 1 - Math.floor(this.level / 5);
    const layout = normalIdx < LAYOUTS.length ? LAYOUTS[normalIdx] : randomLayout(this.level);
    this.bricks = [];
    const top = bossLevel ? TOP + 70 : TOP;
    const rows = bossLevel ? ['M11111111M', '2222222222', '1111??1111'] : layout.rows;
    const bonusHp = Math.floor((this.level - 1) / 10); // 10레벨마다 모든 벽돌 +1
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const x = GAP + c * (BRICK_W + GAP), y = top + r * (BRICK_H + GAP);
      const b = { x, y, w: BRICK_W, h: BRICK_H, row: r, col: c, color: ROW_COLORS[r % ROW_COLORS.length], kind: 'normal', hp: 1 };
      if (ch === '2' || ch === '3') { b.kind = 'tough'; b.hp = Number(ch); }
      else if (ch === 'M') { b.kind = 'metal'; b.hp = Infinity; b.color = '#94a3b8'; }
      else if (ch === 'X') { b.kind = 'bomb'; b.color = '#dc2626'; }
      else if (ch === '?') { b.kind = 'item'; b.color = '#fde047'; }
      if (b.kind !== 'metal') b.hp += bonusHp;
      b.maxHp = b.hp;
      b.points = (rows.length - r) * 10 + (b.kind === 'tough' ? 10 : 0);
      this.bricks.push(b);
    }));
    // 보스는 번갈아 등장: 5·15·25 레벨 = 거대 벽돌, 10·20·30 레벨 = UFO 함장
    const ufo = bossLevel && (this.level / 5) % 2 === 0;
    this.boss = bossLevel ? {
      type: ufo ? 'ufo' : 'brick', name: ufo ? 'UFO 함장' : '거대 벽돌',
      x: W / 2 - (ufo ? 55 : 60), y: TOP - 6, w: ufo ? 110 : 120, h: ufo ? 36 : 40, hp: 20 + this.level * 3, maxHp: 20 + this.level * 3,
      dir: 1, speed: 70 + this.level * 3, bombT: 2, flash: 0, t: 0, beamT: 2.5, beams: [],
    } : null;
    // 7레벨부터: 빈칸이 있는 줄 중 1~2줄이 좌우로 움직임
    this.movers = [];
    if (!bossLevel && this.level >= 7) {
      const rowsWithRoom = [...new Set(this.bricks.map((b) => b.row))].filter((r) => this.bricks.filter((b) => b.row === r).length <= 7 && !this.bricks.some((b) => b.row === r && b.kind === 'metal'));
      for (const r of rowsWithRoom.sort(() => Math.random() - 0.5).slice(0, this.level >= 12 ? 2 : 1)) {
        this.movers.push({ row: r, vx: (Math.random() < 0.5 ? -1 : 1) * (40 + this.level * 2) });
      }
    }
    this.levelName = bossLevel ? `보스: ${this.boss.name}` : layout.name;
    this.banner = { text: `레벨 ${this.level}`, sub: this.levelName, t: 1.8 };
    this.clearT = 0;
    this.resetBall();
  }

  get baseSpeed() { return Math.min(460, (290 + (this.level - 1) * 12) * (SPEEDS[this.cfg.ballSpeed] ?? 1)); }

  resetBall() {
    const p = this.paddle;
    this.balls = [{ x: p.x + p.w / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, off: p.w / 2, trail: [], aimed: true }];
    this.aimT = Math.random() * 6;
    this.drops = [];
    this.lasers = [];
    this.bombs = [];
    this.effects = {};
    this.combo = 0;
    this.idleT = 0;
    this.speed = this.baseSpeed;
    this.updateInfo();
  }

  updateInfo() {
    const fx = Object.entries(this.effects ?? {}).filter(([, v]) => v > 0).map(([k]) => POWERS[k].label).join('');
    this.setInfo(`${fx ? `[${fx}] ` : ''}목숨 ${'●'.repeat(this.lives)} · 레벨 ${this.level}`);
  }

  active(name) { return (this.effects?.[name] ?? 0) > 0; }
  get ballSpeed() { return this.speed * (this.active('slow') ? 0.68 : 1); }

  setVelocity(b, angle) {
    b.vx = Math.cos(angle) * this.ballSpeed;
    b.vy = Math.sin(angle) * this.ballSpeed;
  }

  rescale(b) {
    const v = Math.hypot(b.vx, b.vy);
    if (v > 0) { b.vx *= this.ballSpeed / v; b.vy *= this.ballSpeed / v; }
  }

  // 발사 버튼: 붙어 있는 공 발사 → 없으면 레이저
  onAction(action) {
    if (action !== 'action' && action !== 'up') return;
    if (this.clearT > 0) return;
    const stuck = this.balls.filter((b) => b.stuck);
    if (stuck.length) { for (const b of stuck) this.release(b); return; }
    if (this.active('laser') && (this.laserCd ?? 0) <= 0) {
      this.laserCd = 0.22;
      const p = this.paddle;
      for (const x of [p.x + 6, p.x + p.w - 6]) this.lasers.push({ x, y: PADDLE_Y - 4 });
      this.sound('tick');
    }
  }

  release(b) {
    const p = this.paddle;
    const hit = clamp((b.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
    // 처음 발사는 좌우로 흔들리는 조준선 방향, 캐치로 잡은 공은 패들 위치에 따라
    const a = b.aimed ? this.aimAngle : -Math.PI / 2 + (Math.abs(hit) < 0.1 ? (Math.random() - 0.5) * 0.6 : hit * 0.9);
    b.aimed = false;
    this.setVelocity(b, a);
    b.stuck = false;
    b.catchT = 0;
    this.sound('bounce');
  }

  movePaddle(dt) {
    const p = this.paddle, ptr = this.pointer;
    // 확장·축소 아이템: 중심을 유지한 채 부드럽게 폭 변경
    const targetW = this.active('wide') ? 132 : this.active('shrink') ? 56 : PADDLE_W;
    const nw = p.w + (targetW - p.w) * Math.min(1, dt * 10);
    p.x -= (nw - p.w) / 2; p.w = nw;
    if (p.stun > 0) { p.stun -= dt; ptr.moved = false; this.dragX = ptr.down ? ptr.x : null; return; }

    if (this.isDown('left')) p.x -= 480 * dt;
    if (this.isDown('right')) p.x += 480 * dt;
    if (ptr.type === 'mouse') {
      if (ptr.moved) { p.x = ptr.x - p.w / 2; ptr.moved = false; }
    } else if (ptr.down) {
      // 터치는 상대 이동: 손가락이 패들을 가리지 않도록 화면 어디서나 끌기
      if (this.dragX !== null) p.x += (ptr.x - this.dragX) * this.cfg.touchSens;
      this.dragX = ptr.x;
    } else this.dragX = null;
    p.x = clamp(p.x, 0, W - p.w);
  }

  update(dt) {
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.clearT > 0) {
      this.clearT -= dt;
      if (this.clearT <= 0) { this.level++; this.loadLevel(); }
      return;
    }
    let changed = false;
    for (const k of Object.keys(this.effects)) {
      if (this.effects[k] > 0 && (this.effects[k] -= dt) <= 0) {
        this.effects[k] = 0; changed = true;
        if (k === 'slow') for (const b of this.balls) this.rescale(b);
        if (k === 'catch') for (const b of this.balls) if (b.stuck && this.balls.length) this.release(b);
      }
    }
    if (changed) this.updateInfo();
    this.laserCd = Math.max(0, (this.laserCd ?? 0) - dt);
    this.movePaddle(dt);
    const p = this.paddle;

    this.aimT = (this.aimT ?? 0) + dt;
    this.updateMovers(dt);
    this.updateBoss(dt);
    this.updateDrops(dt);
    this.updateLasers(dt);

    for (const b of this.balls) {
      if (b.stuck) {
        b.x = p.x + clamp(b.off, BALL_R, p.w - BALL_R); b.y = PADDLE_Y - BALL_R - 1;
        if (b.catchT > 0 && (b.catchT -= dt) <= 0) this.release(b); // 캐치는 2.5초 뒤 자동 발사
        continue;
      }
      // 빠른 공이 벽돌을 뚫지 않도록 잘게 나눠 이동
      const steps = Math.ceil((this.ballSpeed * dt) / 4);
      for (let i = 0; i < steps && !b.lost && !b.stuck; i++) this.step(b, dt / steps);
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 9) b.trail.shift();
    }
    if (this.state !== 'playing') return;

    // 오래 아무것도 못 맞히고 맴돌면 각도를 살짝 틀어줌
    this.idleT += dt;
    if (this.idleT > 9) {
      this.idleT = 0;
      for (const b of this.balls) if (!b.stuck) { const a = Math.atan2(b.vy, b.vx) + (Math.random() < 0.5 ? -0.35 : 0.35); this.setVelocity(b, a); }
    }

    this.balls = this.balls.filter((b) => !b.lost);
    if (!this.balls.length) return this.loseLife();

    if (!this.bricks.some((k) => k.kind !== 'metal') && !this.boss) this.levelClear();
  }

  get aimAngle() { return -Math.PI / 2 + Math.sin(this.aimT * 1.7) * 0.55; }

  updateMovers(dt) {
    for (const m of this.movers ?? []) {
      const row = this.bricks.filter((b) => b.row === m.row);
      if (!row.length) continue;
      for (const b of row) b.x += m.vx * dt;
      const minX = Math.min(...row.map((b) => b.x)), maxX = Math.max(...row.map((b) => b.x + b.w));
      if (minX < GAP) { for (const b of row) b.x += GAP - minX; m.vx = Math.abs(m.vx); }
      if (maxX > W - GAP) { for (const b of row) b.x -= maxX - (W - GAP); m.vx = -Math.abs(m.vx); }
    }
  }

  loseLife() {
    this.lives--;
    this.combo = 0;
    this.sound('hit');
    this.shake(6);
    this.vibrate(120);
    this.updateInfo();
    if (this.lives <= 0) return this.gameOver('게임 오버', `레벨 ${this.level} (${this.levelName})까지 도달`);
    this.paddle.w = PADDLE_W;
    this.resetBall();
  }

  levelClear() {
    const bonus = 200 + this.lives * 50 + (this.boss === null && this.level % 5 === 0 ? 500 : 0);
    this.addScore(bonus);
    this.sound('levelup');
    this.banner = { text: '레벨 클리어!', sub: `보너스 +${bonus}`, t: 1.6 };
    this.clearT = 1.6;
    this.balls.forEach((b) => { b.vx = 0; b.vy = 0; });
  }

  // ---------------- 보스 ----------------
  updateBoss(dt) {
    const bs = this.boss;
    if (!bs) return;
    bs.flash = Math.max(0, bs.flash - dt);
    const sp = bs.hp < bs.maxHp / 2 ? 1.4 : 1;
    if (bs.type === 'ufo') return this.updateUfo(bs, dt, sp);
    bs.x += bs.dir * bs.speed * sp * dt;
    if (bs.x < GAP) { bs.x = GAP; bs.dir = 1; }
    if (bs.x + bs.w > W - GAP) { bs.x = W - GAP - bs.w; bs.dir = -1; }
    bs.bombT -= dt;
    if (bs.bombT <= 0) {
      bs.bombT = (sp > 1 ? 1.4 : 2.1) + Math.random() * 0.6;
      this.bombs.push({ x: bs.x + bs.w / 2, y: bs.y + bs.h, vy: 140 });
      this.sound('tick');
    }
    const p = this.paddle;
    for (const bm of this.bombs) {
      bm.vy += 120 * dt; bm.y += bm.vy * dt;
      if (bm.y + 7 >= PADDLE_Y && bm.y - 7 <= PADDLE_Y + PADDLE_H && bm.x > p.x - 6 && bm.x < p.x + p.w + 6) {
        bm.dead = true;
        p.stun = 1.1;
        this.shake(6); this.sound('hit'); this.vibrate(80);
        this.burst(bm.x, PADDLE_Y, { color: '#fb923c', count: 18, speed: 160 });
        this.floatText(p.x + p.w / 2, PADDLE_Y - 16, '패들 멈춤!', '#fca5a5', 14);
      }
      if (bm.y > H + 10) bm.dead = true;
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
  }

  /** UFO 함장: 좌우로 흔들흔들 날며, 패들 위치를 조준해 경고선 → 광선 발사 (맞으면 패들 멈춤) */
  updateUfo(bs, dt, sp) {
    bs.t += dt * sp;
    const range = (W - GAP * 2 - bs.w) / 2;
    bs.x = GAP + range + Math.sin(bs.t * 0.9) * range;
    bs.y = TOP - 6 + Math.sin(bs.t * 2.2) * 6;
    bs.beamT -= dt;
    const p = this.paddle;
    if (bs.beamT <= 0) {
      bs.beamT = (sp > 1 ? 2 : 2.8) + Math.random() * 0.8;
      const aim = p.x + p.w / 2;
      bs.beams.push({ x: aim, warn: 0.85, fire: 0.35, hit: false });
      if (sp > 1) bs.beams.push({ x: clamp(aim + (Math.random() < 0.5 ? -90 : 90), 20, W - 20), warn: 1.05, fire: 0.35, hit: false }); // 분노: 2줄
      this.sound('tick');
    }
    for (const b of bs.beams) {
      if (b.warn > 0) { b.warn -= dt; if (b.warn <= 0) this.sound('power'); continue; }
      b.fire -= dt;
      if (!b.hit && b.x > p.x - 6 && b.x < p.x + p.w + 6) {
        b.hit = true; p.stun = 1.1;
        this.shake(6); this.sound('hit'); this.vibrate(80);
        this.burst(b.x, PADDLE_Y, { color: '#f472b6', count: 18, speed: 160 });
        this.floatText(p.x + p.w / 2, PADDLE_Y - 16, '패들 멈춤!', '#fca5a5', 14);
      }
    }
    bs.beams = bs.beams.filter((b) => b.warn > 0 || b.fire > 0);
  }

  damageBoss(dmg, x, y) {
    const bs = this.boss;
    bs.hp -= dmg;
    bs.flash = 0.1;
    this.sound('lock');
    this.burst(x, y, { color: '#fde047', count: 5, speed: 90, life: 0.3 });
    if (bs.hp <= 0) {
      this.addScore(1000 + this.level * 50);
      this.floatText(bs.x + bs.w / 2, bs.y + bs.h / 2, '보스 격파! +' + (1000 + this.level * 50), '#fde047', 20);
      this.burst(bs.x + bs.w / 2, bs.y + bs.h / 2, { color: '#f97316', count: 60, speed: 260, life: 0.8, gravity: 300 });
      this.shake(12, 0.5);
      this.sound('levelup');
      this.boss = null;
      this.bombs = [];
    }
  }

  // ---------------- 아이템 ----------------
  updateDrops(dt) {
    const p = this.paddle;
    for (const d of this.drops) {
      d.y += 150 * dt;
      if (d.y + 9 >= PADDLE_Y && d.y - 9 <= PADDLE_Y + PADDLE_H && d.x >= p.x - 8 && d.x <= p.x + p.w + 8) {
        d.taken = true;
        this.applyPower(d.type, d.x);
      }
    }
    this.drops = this.drops.filter((d) => !d.taken && d.y < H + 20);
  }

  applyPower(type, x) {
    const pw = POWERS[type];
    // 연달아 먹으면 글자가 겹치지 않게 위로 쌓기
    const now = performance.now();
    this.powerStack = now - (this.lastPowerAt ?? 0) < 700 ? (this.powerStack ?? 0) + 1 : 0;
    this.lastPowerAt = now;
    this.floatText(x, PADDLE_Y - 14 - this.powerStack * 18, pw.text, pw.color, 15);
    this.burst(x, PADDLE_Y, { color: pw.color, count: 14, speed: 120 });
    this.sound(pw.bad ? 'hit' : 'bonus');
    this.vibrate(20);
    if (pw.time) this.effects[type] = pw.time;
    if (type === 'wide') this.effects.shrink = 0;
    if (type === 'shrink') this.effects.wide = 0;
    if (type === 'slow') for (const b of this.balls) this.rescale(b);
    if (type === 'life') this.lives = Math.min(6, this.lives + 1);
    if (type === 'barrier') this.barrier = 3;
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
      if (!extra.length) for (const b of this.balls) if (b.stuck) this.release(b);
      this.balls.push(...extra);
    }
    this.updateInfo();
  }

  updateLasers(dt) {
    for (const l of this.lasers) {
      l.y -= 620 * dt;
      if (l.y < 0) { l.dead = true; continue; }
      const bs = this.boss;
      if (bs && l.x > bs.x && l.x < bs.x + bs.w && l.y < bs.y + bs.h && l.y > bs.y) { l.dead = true; this.damageBoss(1, l.x, l.y); continue; }
      const k = this.bricks.find((k) => l.x > k.x && l.x < k.x + k.w && l.y < k.y + k.h && l.y > k.y);
      if (k) { l.dead = true; this.hitBrick(k, false); }
    }
    this.lasers = this.lasers.filter((l) => !l.dead);
  }

  // ---------------- 공 ----------------
  step(b, dt) {
    const p = this.paddle;
    // 유도 공: 위로 날아갈 때 가장 가까운 벽돌 쪽으로 조금씩 휨 (속력은 그대로)
    if (this.active('homing') && b.vy < 0) {
      let best = null, bd = Infinity;
      for (const k of this.bricks) {
        if (k.kind === 'metal') continue;
        const d = (k.x + k.w / 2 - b.x) ** 2 + (k.y + k.h / 2 - b.y) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      const tgt = best ?? (this.boss ? { x: this.boss.x, y: this.boss.y, w: this.boss.w, h: this.boss.h } : null);
      if (tgt) {
        const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(tgt.y + tgt.h / 2 - b.y, tgt.x + tgt.w / 2 - b.x);
        let d = Math.atan2(Math.sin(want - a), Math.cos(want - a));
        d = clamp(d, -2.2 * dt, 2.2 * dt);
        const na = clamp(a + d, -Math.PI + 0.25, -0.25); // 너무 눕지 않게
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt;
    if (b.x < BALL_R || b.x > W - BALL_R) {
      b.vx *= -1; b.x = clamp(b.x, BALL_R, W - BALL_R); this.sound('bounce');
    }
    if (this.collide(b)) b.vx *= -1;

    b.y += b.vy * dt;
    if (b.y < BALL_R) { b.vy = Math.abs(b.vy); b.y = BALL_R; this.sound('bounce'); }
    if (this.collide(b)) b.vy *= -1;

    // 패들: 맞은 위치에 따라 반사각 변경 (최대 60°)
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
        b.x >= p.x - BALL_R && b.x <= p.x + p.w + BALL_R) {
      this.combo = 0;
      this.idleT = 0;
      if (this.active('catch')) { // 캐치: 공을 패들에 붙임
        b.stuck = true; b.off = b.x - p.x; b.catchT = 2.5; b.vx = 0; b.vy = 0;
        this.sound('lock');
        return;
      }
      let hit = clamp((b.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
      if (Math.abs(hit) < 0.1) hit = (hit < 0 ? -1 : 1) * (0.1 + Math.random() * 0.1); // 수직 무한 반복 방지
      this.speed = Math.min(MAX_SPEED, this.speed + 3);
      this.setVelocity(b, -Math.PI / 2 + hit * 1.05);
      b.y = PADDLE_Y - BALL_R;
      this.sound('bounce');
    }
    // 바닥 방어막: 떨어지는 공을 튕겨 올림 (횟수 제한)
    if (this.barrier > 0 && b.vy > 0 && b.y + BALL_R >= H - 6) {
      b.y = H - 6 - BALL_R; b.vy = -Math.abs(b.vy);
      this.barrier--;
      this.burst(b.x, H - 6, { color: '#38bdf8', count: 10, speed: 120, life: 0.4 });
      this.sound('bounce');
      this.updateInfo();
    }
    if (b.y > H + BALL_R * 2) b.lost = true;
  }

  /** 공이 벽돌/보스에 닿으면 처리하고 튕겨야 하면 true */
  collide(b) {
    const bs = this.boss;
    if (bs && b.x + BALL_R > bs.x && b.x - BALL_R < bs.x + bs.w && b.y + BALL_R > bs.y && b.y - BALL_R < bs.y + bs.h) {
      this.idleT = 0;
      this.damageBoss(this.active('fire') ? 2 : 1, b.x, b.y);
      return true;
    }
    const k = this.bricks.find((k) => b.x + BALL_R > k.x && b.x - BALL_R < k.x + k.w && b.y + BALL_R > k.y && b.y - BALL_R < k.y + k.h);
    if (!k) return false;
    this.idleT = 0;
    if (k.kind === 'metal') { this.sound('lock'); k.flash = 0.1; return true; }
    const fire = this.active('fire');
    this.hitBrick(k, fire);
    return !fire; // 불공은 관통
  }

  hitBrick(k, instant) {
    if (k.kind === 'metal' || k.dead) { if (k.kind === 'metal') this.sound('lock'); return; }
    k.hp = instant ? 0 : k.hp - 1;
    k.flash = 0.08;
    if (k.hp > 0) { this.sound('lock'); return; }
    this.destroyBrick(k);
  }

  destroyBrick(k) {
    if (k.dead) return;
    k.dead = true;
    this.bricks.splice(this.bricks.indexOf(k), 1);
    this.combo++;
    const pts = k.points + Math.max(0, this.combo - 1) * 5;
    this.addScore(pts);
    if (this.combo >= 5 && this.combo % 5 === 0) this.floatText(k.x + k.w / 2, k.y, `${this.combo} 콤보!`, '#fde047', 15);
    this.burst(k.x + k.w / 2, k.y + k.h / 2, { color: k.color, count: 12, speed: 150, life: 0.5, gravity: 400 });
    { const f = 620 * Math.pow(1.045, Math.min(this.combo, 16)); sfx.tone(f * 1.4, f, 0.05, 0.045); } // 콤보 음계
    if (k.kind === 'item' || (Math.random() < DROP_CHANCE && this.bricks.length > 0)) {
      this.drops.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, type: k.kind === 'item' ? pickPower() : pickPower() });
    }
    if (k.kind === 'bomb') { // 주변 8칸 연쇄 폭발
      this.shake(5, 0.2);
      this.sound('drop');
      this.blasts = this.blasts ?? [];
      this.blasts.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, t: 0.3 });
      const near = this.bricks.filter((o) => Math.abs(o.col - k.col) <= 1 && Math.abs(o.row - k.row) <= 1 && o.y > k.y - 30 && o.y < k.y + 30);
      for (const o of near) if (o.kind !== 'metal') this.destroyBrick(o);
    }
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    // 배경 (한 번 그려 두고 재사용)
    this.drawCached(ctx, 'breakout-bg', 0, 0, W, H, (c) => {
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0f1222'); bg.addColorStop(1, '#0a0b12');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(148,163,184,.05)'; c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= W; x += 24) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += 24) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
      c.stroke();
      // 은하수 빛 + 작은 별
      for (const [x, y, r, col] of [[W * 0.2, H * 0.3, 220, '99,102,241'], [W * 0.85, H * 0.6, 200, '236,72,153']]) {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${col},.13)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4})`; c.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2); }
    });

    const now = performance.now() / 1000;
    for (const k of this.bricks ?? []) this.drawBrick(ctx, k, now);
    // 마지막 남은 벽돌 3개 이하: 테두리가 깜빡여 어디 남았는지 알려줌
    const left = (this.bricks ?? []).filter((k) => k.kind !== 'metal');
    if (left.length && left.length <= 3 && !this.boss) {
      ctx.strokeStyle = `rgba(253,230,138,${0.45 + Math.sin(now * 8) * 0.4})`; ctx.lineWidth = 2;
      for (const k of left) { ctx.beginPath(); ctx.roundRect(k.x - 3, k.y - 3, k.w + 6, k.h + 6, 5); ctx.stroke(); }
    }
    // 움직이는 줄 표시
    for (const m of this.movers ?? []) {
      const any = this.bricks.find((b) => b.row === m.row);
      if (!any) continue;
      ctx.fillStyle = 'rgba(253,224,71,.6)'; ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillText(m.vx > 0 ? '▶' : '◀', m.vx > 0 ? W - 11 : 2, any.y + 12);
    }
    for (const k of this.bricks ?? []) k.flash = Math.max(0, (k.flash ?? 0) - 1 / 60);

    // 폭발 효과
    for (const bl of this.blasts ?? []) {
      bl.t -= 1 / 60;
      ctx.globalAlpha = Math.max(0, bl.t / 0.3) * 0.6;
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.arc(bl.x, bl.y, 70 * (1 - bl.t / 0.3) + 10, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.blasts = (this.blasts ?? []).filter((b) => b.t > 0);

    if (this.boss) this.drawBoss(ctx, now);
    for (const bm of this.bombs ?? []) {
      ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(bm.x, bm.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = Math.floor(now * 10) % 2 ? '#ef4444' : '#fde047'; ctx.fillRect(bm.x - 1, bm.y - 11, 2, 4);
    }

    // 아이템 캡슐
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of this.drops ?? []) {
      const pw = POWERS[d.type];
      ctx.fillStyle = pw.color;
      roundRect(ctx, d.x - 16, d.y - 9, 32, 18, 9);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(d.x - 10, d.y - 6, 20, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(pw.label, d.x, d.y + 4);
    }
    ctx.textAlign = 'start';

    // 레이저
    ctx.fillStyle = '#fdba74';
    for (const l of this.lasers ?? []) ctx.fillRect(l.x - 1.5, l.y - 10, 3, 12);

    if (this.barrier > 0) {
      ctx.fillStyle = `rgba(56,189,248,${0.55 + Math.sin(now / 150) * 0.2})`;
      ctx.fillRect(0, H - 6, W, 4);
      ctx.fillStyle = '#e0f2fe'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`🛡 ${this.barrier}`, W - 6, H - 10); ctx.textAlign = 'start';
    }
    this.drawPaddle(ctx, now);
    this.drawBalls(ctx);
    this.drawOverlayText(ctx);
  }

  drawBrick(ctx, k, now) {
    const flash = (k.flash ?? 0) > 0;
    // 그라데이션은 벽돌마다 한 번만 만들어 둠 (세로 방향이라 좌우로 움직여도 그대로 사용 가능)
    if (!k.grad) {
      k.grad = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
      k.grad.addColorStop(0, k.kind === 'metal' ? '#cbd5e1' : k.color); k.grad.addColorStop(1, k.kind === 'metal' ? '#64748b' : shade(k.color));
    }
    if (k.kind === 'metal') {
      ctx.fillStyle = flash ? '#fff' : k.grad; roundRect(ctx, k.x, k.y, k.w, k.h, 3);
      ctx.fillStyle = '#475569';
      for (const x of [k.x + 4, k.x + k.w - 6]) { ctx.beginPath(); ctx.arc(x + 1, k.y + k.h / 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    ctx.fillStyle = flash ? '#fff' : k.grad;
    roundRect(ctx, k.x, k.y, k.w, k.h, 4);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(k.x + 3, k.y + 2, k.w - 6, 3);
    if (k.kind === 'tough') { // 남은 체력만큼 테두리 + 금 간 표시
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(k.x + 1.5, k.y + 1.5, k.w - 3, k.h - 3);
      if (k.hp < k.maxHp) {
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(k.x + k.w * 0.3, k.y); ctx.lineTo(k.x + k.w * 0.45, k.y + k.h * 0.6); ctx.lineTo(k.x + k.w * 0.4, k.y + k.h);
        if (k.hp < k.maxHp - 1) { ctx.moveTo(k.x + k.w * 0.7, k.y); ctx.lineTo(k.x + k.w * 0.6, k.y + k.h * 0.5); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(15,23,42,.65)'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(k.hp, k.x + k.w / 2, k.y + k.h - 4); ctx.textAlign = 'start';
    } else if (k.kind === 'bomb') {
      ctx.fillStyle = '#fde047'; ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✸', k.x + k.w / 2, k.y + k.h - 3); ctx.textAlign = 'start';
    } else if (k.kind === 'item') {
      ctx.globalAlpha = 0.5 + Math.sin(now * 6 + k.col) * 0.3;
      ctx.fillStyle = '#fff'; ctx.fillRect(k.x + 2, k.y + 2, k.w - 4, k.h - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#854d0e'; ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('?', k.x + k.w / 2, k.y + k.h - 3); ctx.textAlign = 'start';
    }
  }

  drawUfo(ctx, bs, now, angry) {
    // 광선 (경고선 → 굵은 빛줄기)
    for (const b of bs.beams) {
      if (b.warn > 0) {
        ctx.strokeStyle = `rgba(244,114,182,${0.3 + (Math.floor(now * 14) % 2) * 0.4})`; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x, bs.y + bs.h); ctx.lineTo(b.x, H); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const gw = 10 + Math.sin(now * 40) * 2;
        const g = ctx.createLinearGradient(b.x - gw, 0, b.x + gw, 0);
        g.addColorStop(0, 'rgba(244,114,182,0)'); g.addColorStop(0.5, 'rgba(253,242,248,.95)'); g.addColorStop(1, 'rgba(244,114,182,0)');
        ctx.fillStyle = g; ctx.fillRect(b.x - gw, bs.y + bs.h, gw * 2, H);
      }
    }
    const cx = bs.x + bs.w / 2, cy = bs.y + bs.h * 0.62;
    // 유리 돔 + 외계인
    ctx.fillStyle = 'rgba(165,243,252,.45)'; ctx.beginPath(); ctx.ellipse(cx, cy - 8, 26, 22, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = bs.flash > 0 ? '#fff' : angry ? '#f87171' : '#86efac';
    ctx.beginPath(); ctx.ellipse(cx, cy - 14, 11, 12, 0, 0, Math.PI * 2); ctx.fill();
    const look = clamp((this.paddle.x + this.paddle.w / 2 - cx) / 80, -1, 1) * 2;
    ctx.fillStyle = '#111827';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 4.5 + look, cy - 15, 3, 4.2, s * 0.4, 0, Math.PI * 2); ctx.fill(); }
    // 접시
    const g = ctx.createLinearGradient(0, cy - 6, 0, cy + 10);
    g.addColorStop(0, bs.flash > 0 ? '#fff' : '#cbd5e1'); g.addColorStop(1, angry ? '#7f1d1d' : '#475569');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, bs.w / 2, 11, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const lx = bs.x + 12 + i * ((bs.w - 24) / 6), on = (Math.floor(now * 6) + i) % 3 === 0;
      ctx.fillStyle = on ? '#fde047' : angry ? '#f87171' : '#38bdf8';
      ctx.beginPath(); ctx.arc(lx, cy + 2, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBoss(ctx, now) {
    const bs = this.boss;
    const angry = bs.hp < bs.maxHp / 2;
    if (bs.type === 'ufo') { this.drawUfo(ctx, bs, now, angry); this.drawBossBar(ctx, bs, angry); return; }
    const g = ctx.createLinearGradient(0, bs.y, 0, bs.y + bs.h);
    g.addColorStop(0, bs.flash > 0 ? '#fff' : angry ? '#f87171' : '#a78bfa');
    g.addColorStop(1, angry ? '#7f1d1d' : '#4c1d95');
    ctx.fillStyle = g;
    roundRect(ctx, bs.x, bs.y, bs.w, bs.h, 8);
    ctx.fillStyle = '#fef3c7';
    const ey = bs.y + 15, look = clamp((this.paddle.x + this.paddle.w / 2 - (bs.x + bs.w / 2)) / 80, -1, 1) * 3;
    for (const ex of [bs.x + 36, bs.x + bs.w - 36]) {
      ctx.beginPath(); ctx.ellipse(ex, ey, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(ex + look, ey + 2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fef3c7';
    }
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bs.x + 24, ey - 10); ctx.lineTo(bs.x + 44, ey - 6); ctx.moveTo(bs.x + bs.w - 24, ey - 10); ctx.lineTo(bs.x + bs.w - 44, ey - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bs.x + 44, bs.y + 31); for (let i = 0; i <= 8; i++) ctx.lineTo(bs.x + 44 + i * 4, bs.y + 31 + (i % 2 ? -3 : 0)); ctx.stroke();
    this.drawBossBar(ctx, bs, angry);
  }

  drawBossBar(ctx, bs, angry) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(ctx, W / 2 - 110, 14, 220, 10, 5);
    ctx.fillStyle = angry ? '#ef4444' : '#a78bfa'; roundRect(ctx, W / 2 - 108, 16, 216 * Math.max(0, bs.hp / bs.maxHp), 6, 3);
    ctx.fillStyle = '#e9d5ff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${bs.name}${angry ? ' (분노)' : ''}`, W / 2, 10); ctx.textAlign = 'start';
  }

  drawPaddle(ctx, now) {
    const p = this.paddle;
    if (!p) return;
    const stun = p.stun > 0;
    const col = stun ? (Math.floor(now * 12) % 2 ? '#fca5a5' : '#64748b') : this.active('wide') ? '#22d3ee' : this.active('shrink') ? '#94a3b8' : '#e2e8f0';
    if (this.active('catch')) { ctx.fillStyle = 'rgba(167,139,250,.35)'; roundRect(ctx, p.x - 3, PADDLE_Y - 3, p.w + 6, PADDLE_H + 6, 8); }
    const g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    g.addColorStop(0, '#fff'); g.addColorStop(1, col);
    ctx.fillStyle = g;
    roundRect(ctx, p.x, PADDLE_Y, p.w, PADDLE_H, 6);
    ctx.fillStyle = 'rgba(15,23,42,.35)'; ctx.fillRect(p.x + p.w / 2 - 6, PADDLE_Y + 4, 12, 3);
    if (this.active('laser')) {
      ctx.fillStyle = '#fb923c';
      for (const x of [p.x + 3, p.x + p.w - 9]) roundRect(ctx, x, PADDLE_Y - 6, 6, 8, 2);
    }
  }

  drawBalls(ctx) {
    const fire = this.active('fire'), slow = this.active('slow');
    const tc = fire ? '#fb923c' : this.active('homing') ? '#4ade80' : slow ? '#bef264' : '#93c5fd';
    for (const b of this.balls ?? []) {
      b.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / b.trail.length) * (fire ? 0.6 : 0.3);
        ctx.fillStyle = tc;
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (i / b.trail.length) * (fire ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R + 2);
      g.addColorStop(0, '#fff'); g.addColorStop(1, fire ? '#f97316' : slow ? '#a3e635' : '#cbd5e1');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawOverlayText(ctx) {
    ctx.textAlign = 'center';
    if (this.state === 'playing' && this.balls?.some((b) => b.stuck) && this.clearT <= 0) {
      ctx.fillStyle = 'rgba(229,231,235,.7)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(this.touchMode ? '탭해서 발사' : '클릭 / Space로 발사', W / 2, PADDLE_Y - 70);
      const b = this.balls.find((x) => x.stuck && x.aimed);
      if (b) { // 조준선 (좌우로 흔들림 → 원하는 순간에 발사)
        const a = this.aimAngle;
        ctx.fillStyle = 'rgba(147,197,253,.75)';
        for (let i = 1; i <= 7; i++) { ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * i * 11, b.y + Math.sin(a) * i * 11, 2.2 - i * 0.18, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    if (this.combo >= 3) {
      ctx.fillStyle = '#fde047'; ctx.font = '800 13px system-ui, sans-serif';
      ctx.fillText(`콤보 ${this.combo}`, W - 40, H - 12);
    }
    const bn = this.banner;
    if (bn && this.state === 'playing') {
      ctx.globalAlpha = Math.min(1, bn.t / 0.4);
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#0a0b12';
      ctx.strokeText(bn.text, W / 2, H / 2 + 20); ctx.fillStyle = '#fff'; ctx.fillText(bn.text, W / 2, H / 2 + 20);
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.strokeText(bn.sub, W / 2, H / 2 + 46); ctx.fillStyle = '#fde68a'; ctx.fillText(bn.sub, W / 2, H / 2 + 46);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'start';
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** 색을 조금 어둡게 (벽돌 그라데이션 아래쪽) */
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.62), g = Math.round(((n >> 8) & 255) * 0.62), b = Math.round((n & 255) * 0.62);
  return `rgb(${r},${g},${b})`;
}
