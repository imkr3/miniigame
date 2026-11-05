import { GameBase, DIRS, roundRect } from '../engine.js';

// 미로 추격: 점을 모두 먹으면 라운드 클리어. 파워 점을 먹으면 잠시 추격자를 잡을 수 있다.
// # 벽 · . 점 · o 파워 점 · C 추격자 시작 위치 · P 플레이어 시작 위치
const MAP = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '#.......CCC.......#',
  '####.#.#####.#.####',
  '#....#.......#....#',
  '#.##.#.#####.#.##.#',
  '#.................#',
  '#.##.###.#.###.##.#',
  '#o.......P.......o#',
  '###################',
];
const ROWS = MAP.length, COLS = MAP[0].length, CELL = 28;
const DIR_LIST = Object.values(DIRS);
const CHASER_COLORS = ['#f43f5e', '#a855f7', '#f59e0b'];
const FRIGHT_TIME = 6;

const isZero = (d) => d.x === 0 && d.y === 0;
const STOP = { x: 0, y: 0 };

export default class Maze extends GameBase {
  static meta = {
    id: 'maze',
    title: '미로 추격',
    description: '점을 모두 모으세요. 큰 점을 먹으면 잠시 추격자를 잡을 수 있어요.',
    controls: '방향키 / WASD / 스와이프',
  };

  constructor(container, opts = {}) {
    super(container, { width: COLS * CELL, height: ROWS * CELL, ...opts });
  }

  init() {
    this.lives = 3;
    this.round = 1;
    this.setupRound();
  }

  setupRound() {
    this.dots = new Map(); // "x,y" -> 'dot' | 'power'
    MAP.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') this.dots.set(`${x},${y}`, 'dot');
      if (ch === 'o') this.dots.set(`${x},${y}`, 'power');
    }));
    this.resetPositions();
  }

  resetPositions() {
    const find = (ch) => {
      const out = [];
      MAP.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) out.push({ x, y }); }));
      return out;
    };
    const [p] = find('P');
    const speedUp = 1 + (this.round - 1) * 0.08;
    this.player = { ...p, dir: STOP, want: STOP, t: 0, speed: 6 };
    this.chasers = find('C').map((c, i) => ({
      ...c, home: c, dir: STOP, t: 0, speed: 4.6 * speedUp,
      color: CHASER_COLORS[i % CHASER_COLORS.length],
      wait: 1 + i * 2.5,           // 순차적으로 출발
      randomness: 0.15 + i * 0.15, // 추격자마다 성격(무작위성) 다르게
    }));
    this.fright = 0;
    this.combo = 0;
    this.updateInfo();
  }

  updateInfo() { this.setInfo(`목숨 ${'●'.repeat(this.lives)} · 라운드 ${this.round}`); }

  open(x, y) { return y >= 0 && y < ROWS && x >= 0 && x < COLS && MAP[y][x] !== '#'; }

  onAction(action) {
    const d = DIRS[action];
    if (!d) return;
    const p = this.player;
    p.want = d;
    // 이동 중 즉시 뒤로 돌기
    if (!isZero(p.dir) && d.x === -p.dir.x && d.y === -p.dir.y && p.t > 0) {
      p.x += p.dir.x; p.y += p.dir.y; p.t = 1 - p.t; p.dir = d;
    }
  }

  choosePlayerDir(p) {
    if (this.open(p.x + p.want.x, p.y + p.want.y)) p.dir = p.want;
    else if (!this.open(p.x + p.dir.x, p.y + p.dir.y)) p.dir = STOP;
  }

  chooseChaserDir(c) {
    let options = DIR_LIST.filter((d) => this.open(c.x + d.x, c.y + d.y));
    const back = options.filter((d) => !(d.x === -c.dir.x && d.y === -c.dir.y));
    if (back.length) options = back; // 막다른 길이 아니면 되돌아가지 않음
    if (!options.length) { c.dir = STOP; return; }
    if (Math.random() < c.randomness) { c.dir = options[Math.floor(Math.random() * options.length)]; return; }
    const p = this.player;
    const dist = (d) => (c.x + d.x - p.x) ** 2 + (c.y + d.y - p.y) ** 2;
    const sign = this.fright > 0 ? -1 : 1; // 겁먹으면 도망
    c.dir = options.reduce((best, d) => (sign * dist(d) < sign * dist(best) ? d : best));
  }

  // 타일 단위 이동 + 타일 사이 보간(t)
  move(e, dt, choose, onArrive) {
    if (isZero(e.dir)) { choose(e); if (isZero(e.dir)) return; }
    e.t += e.speed * dt;
    while (e.t >= 1) {
      e.t -= 1;
      e.x += e.dir.x; e.y += e.dir.y;
      onArrive?.(e);
      choose(e);
      if (isZero(e.dir)) { e.t = 0; break; }
    }
  }

  eatAt(p) {
    const key = `${p.x},${p.y}`;
    const kind = this.dots.get(key);
    if (!kind) return;
    this.dots.delete(key);
    if (kind === 'dot') this.addScore(10);
    else { this.addScore(50); this.fright = FRIGHT_TIME; this.combo = 0; }
  }

  pos(e) { return { x: e.x + e.dir.x * e.t, y: e.y + e.dir.y * e.t }; }

  update(dt) {
    if (this.fright > 0) this.fright = Math.max(0, this.fright - dt);

    this.move(this.player, dt, (p) => this.choosePlayerDir(p), (p) => this.eatAt(p));

    for (const c of this.chasers) {
      if (c.wait > 0) { c.wait -= dt; continue; }
      const slow = this.fright > 0 ? 0.55 : 1;
      this.move(c, dt * slow, (e) => this.chooseChaserDir(e));
    }

    // 충돌 판정
    const pp = this.pos(this.player);
    for (const c of this.chasers) {
      const cp = this.pos(c);
      if (Math.hypot(cp.x - pp.x, cp.y - pp.y) > 0.6) continue;
      if (this.fright > 0) {
        this.combo++;
        this.addScore(100 * 2 ** (this.combo - 1));
        Object.assign(c, { x: c.home.x, y: c.home.y, dir: STOP, t: 0, wait: 2 });
      } else {
        this.lives--;
        if (this.lives <= 0) { this.updateInfo(); return this.gameOver(); }
        return this.resetPositions();
      }
    }

    if (this.dots.size === 0) {
      this.round++;
      this.addScore(500);
      this.setupRound();
    }
  }

  draw(ctx) {
    // 벽
    ctx.fillStyle = '#1e3a5f';
    MAP.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') roundRect(ctx, x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 6);
    }));

    // 점
    for (const [key, kind] of this.dots) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = kind === 'power' ? '#fde68a' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, kind === 'power' ? 7 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 플레이어: 민트색 원 + 진행 방향 눈
    const pp = this.pos(this.player);
    const px = (pp.x + 0.5) * CELL, py = (pp.y + 0.5) * CELL;
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath(); ctx.arc(px, py, CELL * 0.4, 0, Math.PI * 2); ctx.fill();
    const look = isZero(this.player.dir) ? DIRS.right : this.player.dir;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(px + look.x * 5, py + look.y * 5, 3, 0, Math.PI * 2); ctx.fill();

    // 추격자: 마름모
    const blink = this.fright > 0 && this.fright < 1.5 && Math.floor(this.fright * 6) % 2 === 0;
    for (const c of this.chasers) {
      const cp = this.pos(c);
      const cx = (cp.x + 0.5) * CELL, cy = (cp.y + 0.5) * CELL, r = CELL * 0.42;
      ctx.fillStyle = this.fright > 0 ? (blink ? '#e2e8f0' : '#3b82f6') : c.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath(); ctx.fill();
    }
  }
}
