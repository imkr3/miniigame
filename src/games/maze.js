import { GameBase, DIRS, roundRect } from '../engine.js';

// 미로 추격: 점을 모두 먹으면 라운드 클리어. 파워 점을 먹으면 잠시 추격자를 잡을 수 있다.
// # 벽 · . 점 · o 파워 점 · C 추격자 시작 위치 · P 플레이어 시작 위치
const MAPS = [[
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
], [
  '###################',
  '#o..#.........#..o#',
  '#.#.#.###.###.#.#.#',
  '#.#.....#.#.....#.#',
  '#.###.#.#.#.#.###.#',
  '#.....#.....#.....#',
  '###.#.###.###.#.###',
  '#...#...CCC...#...#',
  '#.#.###.###.###.#.#',
  '#.#.............#.#',
  '#.#.##.##.##.##.#.#',
  '#.......#.#.......#',
  '#.#####.#.#.#####.#',
  '#o.......P.......o#',
  '###################',
]];
const ROWS = MAPS[0].length, COLS = MAPS[0][0].length, CELL = 28;
const DIR_LIST = Object.values(DIRS);
const CHASER_COLORS = ['#f43f5e', '#a855f7', '#f59e0b'];
const FRIGHT_TIME = 6;

const SPEEDS = { slow: 0.8, normal: 1, fast: 1.2 };
const isZero = (d) => d.x === 0 && d.y === 0;
const STOP = { x: 0, y: 0 };

export default class Maze extends GameBase {
  static meta = {
    id: 'maze',
    title: '미로 추격',
    description: '슬라임을 움직여 점을 모두 모으세요. 큰 점을 먹으면 잠시 박쥐를 잡을 수 있어요.',
    controls: '방향키 / WASD (미리 눌러두면 갈림길에서 꺾어요)',
    touchControls: '화면을 밀어서 방향 전환 (또는 아래 방향 버튼)',
  };

  static settings = [
    { id: 'speed', label: '게임 속도', type: 'select', default: 'normal',
      options: [['slow', '느림'], ['normal', '보통'], ['fast', '빠름']], tip: '다음 판(또는 목숨을 잃은 뒤)부터 적용' },
  ];

  constructor(container, opts = {}) {
    super(container, { width: COLS * CELL, height: ROWS * CELL, ...opts });
  }

  init() {
    this.lives = 3;
    this.round = 1;
    this.setupRound();
  }

  setupRound() {
    this.map = MAPS[(this.round - 1) % MAPS.length];
    this.eatenCount = 0;
    this.bonus = null;
    this.dots = new Map(); // "x,y" -> 'dot' | 'power'
    this.map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') this.dots.set(`${x},${y}`, 'dot');
      if (ch === 'o') this.dots.set(`${x},${y}`, 'power');
    }));
    this.resetPositions();
  }

  resetPositions() {
    const find = (ch) => {
      const out = [];
      this.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) out.push({ x, y }); }));
      return out;
    };
    const [p] = find('P');
    const speedUp = Math.min(1.3, 1 + (this.round - 1) * 0.05);
    const k = SPEEDS[this.cfg.speed] ?? 1;
    this.player = { ...p, dir: STOP, want: STOP, t: 0, speed: 4.3 * k };
    this.chasers = find('C').map((c, i) => ({
      ...c, home: c, dir: STOP, t: 0, speed: 3.5 * speedUp * k,
      color: CHASER_COLORS[i % CHASER_COLORS.length],
      wait: 1 + i * 2.5,           // 순차적으로 출발
      randomness: 0.15 + i * 0.15, // 추격자마다 성격(무작위성) 다르게
    }));
    this.fright = 0;
    this.combo = 0;
    this.freeze = 1.2; // 시작 전 "준비" 시간
    this.dying = 0;
    this.updateInfo();
  }

  updateInfo() { this.setInfo(`목숨 ${'●'.repeat(this.lives)} · 라운드 ${this.round}`); }

  open(x, y) { return y >= 0 && y < ROWS && x >= 0 && x < COLS && this.map[y][x] !== '#'; }

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
    this.eatenCount++;
    if (this.eatenCount === 50 || this.eatenCount === 100) {
      // 보너스 별: 플레이어 시작 위치에 잠시 나타남
      this.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'P') this.bonus = { x, y, t: 9 }; }));
    }
    if (kind === 'dot') { this.addScore(10); this.sound('dot'); }
    else {
      this.addScore(50);
      this.fright = FRIGHT_TIME;
      this.combo = 0;
      this.sound('power');
      this.burst((p.x + 0.5) * CELL, (p.y + 0.5) * CELL, { color: '#fde68a', count: 14, speed: 120 });
    }
  }

  pos(e) { return { x: e.x + e.dir.x * e.t, y: e.y + e.dir.y * e.t }; }

  update(dt) {
    if (this.freeze > 0) { this.freeze -= dt; return; }
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) {
        this.lives--;
        this.updateInfo();
        if (this.lives <= 0) return this.gameOver();
        this.resetPositions();
      }
      return;
    }
    if (this.fright > 0) this.fright = Math.max(0, this.fright - dt);

    this.move(this.player, dt, (p) => this.choosePlayerDir(p), (p) => this.eatAt(p));
    if (this.bonus) {
      this.bonus.t -= dt;
      const pl = this.player;
      if (pl.x === this.bonus.x && pl.y === this.bonus.y) {
        const pts = 300 * this.round;
        this.addScore(pts);
        this.floatText((pl.x + 0.5) * CELL, pl.y * CELL, `+${pts}`, '#f0abfc', 18);
        this.burst((pl.x + 0.5) * CELL, (pl.y + 0.5) * CELL, { color: '#f0abfc', count: 16, speed: 140 });
        this.sound('bonus');
        this.bonus = null;
      } else if (this.bonus.t <= 0) this.bonus = null;
    }

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
        const pts = 100 * 2 ** (this.combo - 1);
        this.addScore(pts);
        const cx = (cp.x + 0.5) * CELL, cy = (cp.y + 0.5) * CELL;
        this.floatText(cx, cy, `+${pts}`);
        this.burst(cx, cy, { color: c.color, count: 18, speed: 150 });
        this.sound('bonus');
        this.vibrate(25);
        Object.assign(c, { x: c.home.x, y: c.home.y, dir: STOP, t: 0, wait: 2 });
      } else {
        this.dying = 1.1;
        this.sound('hit');
        this.shake(8);
        this.vibrate(150);
        this.burst((pp.x + 0.5) * CELL, (pp.y + 0.5) * CELL, { color: '#2dd4bf', count: 26, speed: 170 });
        return;
      }
    }

    if (this.dots.size === 0) {
      this.round++;
      this.addScore(500);
      this.sound('levelup');
      this.setupRound();
      this.floatText(this.width / 2, this.height / 2 + 30, '라운드 클리어! +500', '#fde68a', 20);
    }
  }

  draw(ctx) {
    // 벽: 이웃한 벽끼리 이어서 그림
    const wall = (x, y) => this.map[y]?.[x] === '#';
    const I = 5;
    ctx.fillStyle = '#1d3557';
    this.map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      roundRect(ctx, x * CELL + I, y * CELL + I, CELL - I * 2, CELL - I * 2, 5);
      if (wall(x + 1, y)) ctx.fillRect(x * CELL + CELL / 2, y * CELL + I, CELL, CELL - I * 2);
      if (wall(x, y + 1)) ctx.fillRect(x * CELL + I, y * CELL + CELL / 2, CELL - I * 2, CELL);
    }));

    // 점
    for (const [key, kind] of this.dots) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = kind === 'power' ? '#fde68a' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, kind === 'power' ? 7 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 보너스 별
    if (this.bonus && !(this.bonus.t < 2 && Math.floor(this.bonus.t * 8) % 2)) {
      const bx = (this.bonus.x + 0.5) * CELL, by = (this.bonus.y + 0.5) * CELL;
      const r = CELL * 0.42 * (1 + Math.sin(performance.now() / 150) * 0.08);
      ctx.fillStyle = '#f0abfc';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }

    const now = performance.now() / 1000;

    // 플레이어: 말랑한 젤리 슬라임 (움직이면 통통 튐)
    const pl = this.player;
    const pp = this.pos(pl);
    const moving = !isZero(pl.dir) && this.state === 'playing' && this.freeze <= 0;
    const life = this.dying > 0 ? Math.max(0, this.dying - 0.3) / 0.8 : 1;
    this.drawSlime(ctx, (pp.x + 0.5) * CELL, (pp.y + 0.5) * CELL, isZero(pl.dir) ? DIRS.down : pl.dir, moving ? now * 12 : now * 3, life);

    // 추격자: 박쥐
    const blink = this.fright > 0 && this.fright < 1.5 && Math.floor(this.fright * 6) % 2 === 0;
    this.chasers.forEach((c, i) => {
      const cp = this.pos(c);
      this.drawBat(ctx, (cp.x + 0.5) * CELL, (cp.y + 0.5) * CELL, c, now + i * 0.7, blink);
    });

    if (this.state === 'playing' && this.freeze > 0) {
      ctx.fillStyle = '#fde68a';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('준비!', this.width / 2, (9 + 0.5) * CELL + 8);
      ctx.textAlign = 'start';
    }
  }

  drawSlime(ctx, x, y, look, phase, scale) {
    if (scale <= 0) return;
    const R = CELL * 0.42 * scale;
    const squash = Math.sin(phase) * 0.08;      // 위아래로 말랑
    const w = R * (1 + squash), h = R * (1 - squash);
    const bottom = y + R * 0.75;
    ctx.save();
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(x, bottom + 1, w * 0.85, R * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    // 몸통: 둥근 윗부분 + 납작한 아랫부분
    const g = ctx.createLinearGradient(0, bottom - h * 1.6, 0, bottom);
    g.addColorStop(0, '#6ee7b7'); g.addColorStop(1, '#10b981');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, bottom);
    ctx.bezierCurveTo(x - w * 1.05, bottom - h * 1.9, x + w * 1.05, bottom - h * 1.9, x + w, bottom);
    ctx.quadraticCurveTo(x, bottom + R * 0.12, x - w, bottom);
    ctx.fill();
    // 광택
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(x - w * 0.45, bottom - h * 1.2, R * 0.16, R * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
    // 눈: 진행 방향을 바라봄
    const ey = bottom - h * 0.85 + look.y * R * 0.12, ex = look.x * R * 0.22;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(x + side * R * 0.3 + ex, ey, R * 0.17, R * 0.21, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(x + side * R * 0.3 + ex + look.x * R * 0.07, ey + look.y * R * 0.08, R * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    // 볼터치
    ctx.fillStyle = 'rgba(251,113,133,.45)';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + side * R * 0.55 + ex, ey + R * 0.25, R * 0.1, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawBat(ctx, x, y, c, t, blink) {
    const scared = this.fright > 0;
    const R = CELL * 0.26;
    const body = scared ? (blink ? '#e2e8f0' : '#3b82f6') : c.color;
    const bob = Math.sin(t * 5) * 1.5;      // 둥실둥실
    const flap = scared ? 0.25 + Math.sin(t * 9) * 0.1 : Math.sin(t * 16) * 0.55; // 겁먹으면 날개 처짐
    y += bob;
    ctx.save();
    ctx.fillStyle = body;
    // 날개 (좌우 대칭, 끝이 뾰족한 박쥐 날개)
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x + side * R * 0.7, y - R * 0.1);
      ctx.rotate(side * flap);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.35);
      ctx.lineTo(side * R * 1.5, -R * 0.75);
      ctx.lineTo(side * R * 1.25, R * 0.05);
      ctx.lineTo(side * R * 0.95, -R * 0.1);
      ctx.lineTo(side * R * 0.7, R * 0.4);
      ctx.lineTo(side * R * 0.4, R * 0.1);
      ctx.lineTo(0, R * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 귀
    ctx.beginPath();
    ctx.moveTo(x - R * 0.75, y - R * 0.5); ctx.lineTo(x - R * 0.55, y - R * 1.35); ctx.lineTo(x - R * 0.15, y - R * 0.8);
    ctx.moveTo(x + R * 0.75, y - R * 0.5); ctx.lineTo(x + R * 0.55, y - R * 1.35); ctx.lineTo(x + R * 0.15, y - R * 0.8);
    ctx.fill();
    // 몸통
    ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.95, 0, 0, Math.PI * 2); ctx.fill();

    const look = isZero(c.dir) ? DIRS.down : c.dir;
    const lx = look.x * R * 0.15, ly = look.y * R * 0.12;
    if (scared) {
      // 겁먹은 얼굴: 작은 눈 + 물결 입
      ctx.fillStyle = blink ? '#1e293b' : '#e0f2fe';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + side * R * 0.35, y - R * 0.15, R * 0.14, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) ctx.lineTo(x - R * 0.45 + i * R * 0.225, y + R * 0.38 + (i % 2 ? -R * 0.12 : 0));
      ctx.stroke();
    } else {
      // 화난 얼굴: 노란 눈 + 찌푸린 눈썹 + 송곳니
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.ellipse(x + side * R * 0.38 + lx, y - R * 0.1 + ly, R * 0.24, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111827';
        ctx.beginPath(); ctx.arc(x + side * R * 0.38 + lx * 1.6, y - R * 0.08 + ly * 1.6, R * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x + side * R * 0.65, y - R * 0.48); ctx.lineTo(x + side * R * 0.12, y - R * 0.3); ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x + side * R * 0.12, y + R * 0.38); ctx.lineTo(x + side * R * 0.28, y + R * 0.38); ctx.lineTo(x + side * R * 0.2, y + R * 0.62); ctx.fill();
      }
    }
    ctx.restore();
  }
}
