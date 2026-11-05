// 점프 러너 - 바이옴(맵 컨셉), 지형 생성, 지형 오브젝트(점프대·움직이는 발판·톱날·고드름·불덩이), 배경
import { roundRect } from '../../engine.js';

export const T = 24, ROWS = 15, W = 640, H = 360;
export const GRAVITY = 1900, MAX_FALL = 900;
export const EMPTY = 0, SOLID = 1, SPIKE = 2, PLAT = 3, ICE = 4, LAVA = 5, CONV_L = 6, CONV_R = 7, CRUMBLE = 8;
export const isSolid = (t) => t === SOLID || t === ICE || t === CONV_L || t === CONV_R;
export const isOneWay = (t) => t === PLAT || t === CRUMBLE;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (n) => Math.floor(Math.random() * n);
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------- 바이옴 ----------------
// seg: 지형 구간 가중치, pool: 등장 적 (hard 는 4스테이지부터 추가)
export const BIOMES = {
  grass: {
    name: '초원', sub: '모험의 시작',
    sky: ['#0f2340', '#2b5a7e'], far: '#1c3b55', near: '#204a4a', ground: '#5b4636', dirt: '#4a382b', top: '#4ade80', plat: '#a16207',
    seg: { flatEnemy: 3, step: 1.5, gap: 1.5, spikes: 1, platPit: 1.5, block: 1 },
    pool: ['slime', 'slime', 'drone', 'charger'], hard: ['turret', 'charger'],
  },
  cave: {
    name: '어둠의 동굴', sub: '천장에서 무언가 떨어진다',
    sky: ['#07070d', '#1c1730'], far: '#15111f', near: '#1e1830', ground: '#3f3a52', dirt: '#332f44', top: '#a78bfa', plat: '#6b7280',
    dark: 0.8, ceiling: true, crumble: true,
    seg: { flatEnemy: 3, step: 1, gap: 1.2, spikes: 0.8, platPit: 1.5, icicles: 1.6, block: 0.8 },
    pool: ['bat', 'bat', 'slime', 'charger'], hard: ['bat', 'turret'],
  },
  desert: {
    name: '모래바람 사막', sub: '강풍 주의!',
    sky: ['#3b2a1a', '#c2853b'], far: '#8a5a2b', near: '#a86b32', ground: '#c9a063', dirt: '#b48a50', top: '#f2d49b', plat: '#9a6b3a',
    wind: 120, crumble: true, sun: '#fde68a',
    seg: { flatEnemy: 3, step: 2, gap: 1.2, spikes: 0.6, platPit: 1, crumbleBridge: 1.3, block: 0.8 },
    pool: ['scorpion', 'scorpion', 'cactus', 'drone'], hard: ['cactus', 'charger'],
  },
  snow: {
    name: '얼어붙은 설원', sub: '얼음 위에선 미끄러진다',
    sky: ['#1e293b', '#64748b'], far: '#94a3b8', near: '#cbd5e1', ground: '#7dd3fc', dirt: '#5fb8e0', top: '#f8fafc', plat: '#94a3b8',
    ice: true, snowfall: true,
    seg: { flatEnemy: 3, step: 1.5, gap: 1.4, icicles: 1.3, platPit: 1, spikes: 0.6, block: 0.8 },
    pool: ['snowman', 'penguin', 'penguin', 'slime'], hard: ['snowman', 'drone'],
  },
  volcano: {
    name: '불타는 화산', sub: '용암에 빠지지 마세요',
    sky: ['#1a0505', '#5c1a0b'], far: '#3a0d0d', near: '#2a0a0a', ground: '#3b2a2a', dirt: '#2e1f1f', top: '#f97316', plat: '#57534e',
    lava: true, crumble: true, embers: true,
    seg: { flatEnemy: 2.5, gap: 2, crumbleBridge: 1.4, platPit: 1.2, step: 1, spikes: 0.5, fireRiver: 1 },
    pool: ['fireSpirit', 'magmaSlime', 'magmaSlime', 'charger'], hard: ['fireSpirit', 'turret'],
  },
  sky: {
    name: '하늘섬', sub: '점프대와 움직이는 발판',
    sky: ['#0c4a6e', '#7dd3fc'], far: '#e0f2fe', near: '#bae6fd', ground: '#78716c', dirt: '#57534e', top: '#86efac', plat: '#e2e8f0',
    wind: 90, islands: true, clouds: true,
    pool: ['eagle', 'cloud', 'drone', 'eagle'], hard: ['cloud', 'slime'],
  },
  castle: {
    name: '유령의 성', sub: '방패를 든 기사는 뒤에서 노려라',
    sky: ['#0b0618', '#2a1b3d'], far: '#1c1230', near: '#251a3a', ground: '#4b4558', dirt: '#3d3849', top: '#8b80a6', plat: '#6b5b45',
    dark: 0.55, crumble: true, bricks: true, moon: true,
    seg: { flatEnemy: 3, spikes: 1.2, platPit: 1.2, elevator: 1, moverGap: 1, step: 0.8, block: 0.8, springWall: 0.6 },
    pool: ['skeleton', 'skeleton', 'ghost', 'bat'], hard: ['ghost', 'skeleton'],
  },
  factory: {
    name: '기계 공장', sub: '벨트와 톱날을 조심!',
    sky: ['#111827', '#334155'], far: '#1f2937', near: '#273244', ground: '#4b5563', dirt: '#374151', top: '#facc15', plat: '#6b7280',
    gears: true,
    seg: { flatEnemy: 2.5, conveyor: 1.5, saw: 1.3, springWall: 0.8, moverGap: 1, elevator: 0.7, block: 1, gap: 1 },
    pool: ['robot', 'robot', 'turret', 'drone'], hard: ['robot', 'charger'],
  },
};
export const BIOME_ORDER = ['grass', 'cave', 'desert', 'snow', 'volcano', 'sky', 'castle', 'factory'];
export const BOSS_ORDER = ['golem', 'slimeKing', 'mech'];

/** 한 판의 바이옴 순서: 초원으로 시작하고 나머지는 무작위 */
export function makeBiomeOrder() {
  const rest = BIOME_ORDER.slice(1);
  for (let i = rest.length - 1; i > 0; i--) { const j = randInt(i + 1); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return ['grass', ...rest];
}

/** 스테이지 → 바이옴 (보스 스테이지는 직전 바이옴 분위기) */
export function biomeForStage(stage, order) {
  const normalIdx = stage - 1 - Math.floor((stage - 1) / 3);
  const idx = stage % 3 === 0 ? normalIdx - 1 : normalIdx;
  return order[((idx % order.length) + order.length) % order.length];
}

// ---------------- 지형 생성 ----------------
const grid = (cols) => Array.from({ length: ROWS }, () => new Uint8Array(cols));

export function generateLevel(g, stage, biomeId) {
  const B = BIOMES[biomeId];
  const len = Math.min(250, 105 + stage * 13);
  const t = grid(len + 80);
  const L = { tiles: t, enemies: [], coins: [], chests: [], props: [] };
  const diff = Math.min(1, (stage - 1) / 8);
  const ground = B.ice ? ICE : SOLID;
  let c = 0, h = 11, cd = B.ceiling ? 2 : 0;
  const minH = () => (B.ceiling ? cd + 6 : 6);

  const ceil = () => { for (let r = 0; r < cd; r++) t[r][c] = SOLID; };
  const col = (hh = h) => { for (let r = hh; r < ROWS; r++) t[r][c] = ground; ceil(); c++; };
  const pitCol = () => { if (B.lava) { t[13][c] = LAVA; t[14][c] = LAVA; } ceil(); c++; };
  const flat = (n) => { for (let i = 0; i < n; i++) col(); };
  const coinRow = (c0, n, row) => { for (let i = 0; i < n; i++) L.coins.push({ x: (c0 + i) * T + 12, y: row * T + 12 }); };
  const pool = stage >= 4 ? [...B.pool, ...B.hard] : B.pool;
  const pick = () => pool[randInt(pool.length)];
  const enemy = (type, cc, row) => L.enemies.push(g.makeEnemy(type, cc, row));
  const placeEnemy = (cc) => {
    const type = pick();
    // 날아다니는 적은 공중에 배치
    const air = { bat: B.ceiling ? cd + 1 : 3, eagle: 3, cloud: Math.max(5, h - 6), ghost: h - 3, fireSpirit: h - 4, drone: h - 3 };
    enemy(type, cc, air[type] ?? h);
  };

  const S = {
    flatEnemy() {
      const n = 7 + randInt(7), s = c; flat(n);
      const count = 1 + (Math.random() < 0.25 + diff * 0.5 ? 1 : 0);
      for (let k = 0; k < count; k++) placeEnemy(s + 2 + randInt(n - 3));
      if (Math.random() < 0.5) coinRow(s + 1, 4, h - 1);
    },
    step() {
      h = clamp(h + (Math.random() < 0.5 ? -1 : 1) * (1 + randInt(2)), minH(), 12);
      flat(4 + randInt(4));
    },
    gap() {
      const gw = 2 + randInt(diff > 0.4 ? 3 : 2), s = c;
      for (let i = 0; i < gw; i++) pitCol();
      for (let i = 0; i < gw; i++) L.coins.push({ x: (s + i) * T + 12, y: (h - 3) * T + (i === 0 || i === gw - 1 ? 12 : -4) });
      if (B.lava && Math.random() < 0.6) L.props.push({ type: 'fire', x: (s + gw / 2) * T, base: 13 * T, t: rand(0, 2.4), r: 9 });
      flat(3 + randInt(3));
    },
    spikes() {
      flat(2);
      const s = c; flat(2 + randInt(2));
      for (let cc = s; cc < c; cc++) t[h - 1][cc] = SPIKE;
      coinRow(s, c - s, h - 4);
      flat(2);
    },
    platPit() {
      const n = 9 + randInt(4), s = c, pit = Math.random() < 0.6;
      for (let i = 0; i < n; i++) { if (pit && i >= 2 && i < n - 2) pitCol(); else col(); }
      const pw = 3 + randInt(2), px = s + Math.floor((n - pw) / 2), ph = h - 3;
      const type = B.crumble && pit && Math.random() < 0.6 ? CRUMBLE : PLAT;
      for (let i = 0; i < pw; i++) t[ph][px + i] = type;
      coinRow(px, pw, ph - 1);
      if (Math.random() < 0.3 + diff * 0.3) placeEnemy(px + 1);
    },
    block() {
      flat(2);
      const bh = 1 + randInt(2);
      for (let i = 0; i < 2; i++) col(h - bh);
      if (Math.random() < 0.4 && pool.includes('turret')) enemy('turret', c - 1, h - bh);
      flat(2);
    },
    // 무너지는 다리: 밟으면 잠시 뒤 무너짐 → 멈추지 말고 건너기
    crumbleBridge() {
      flat(2);
      const gw = 4 + randInt(3), s = c;
      for (let i = 0; i < gw; i++) pitCol();
      for (let i = 0; i < gw; i++) t[h][s + i] = CRUMBLE;
      coinRow(s, gw, h - 1);
      flat(3);
    },
    // 용암 강: 징검다리 발판 + 불덩이
    fireRiver() {
      flat(2);
      const gw = 7 + randInt(3), s = c;
      for (let i = 0; i < gw; i++) pitCol();
      for (let i = 2; i < gw - 1; i += 3) { t[h][s + i] = PLAT; if (i + 1 < gw - 1) t[h][s + i + 1] = PLAT; } // 2칸짜리 징검다리
      L.props.push({ type: 'fire', x: (s + 1.5) * T, base: 13 * T, t: rand(0, 2.4), r: 9 });
      L.props.push({ type: 'fire', x: (s + gw - 1.5) * T, base: 13 * T, t: rand(0, 2.4), r: 9 });
      flat(3);
    },
    icicles() {
      const n = 9 + randInt(4), s = c; flat(n);
      if (!B.ceiling) { // 천장이 없으면 얼음 처마를 만들어서 매달기
        for (let i = 2; i < n - 2; i++) t[h - 5][s + i] = SOLID;
      }
      const top = B.ceiling ? cd * T : (h - 4) * T;
      for (let i = 3; i < n - 2; i += 3) L.props.push({ type: 'icicle', x: (s + i) * T + 7, y: top, y0: top, w: 10, h: 22, state: 'hang' });
      coinRow(s + 2, n - 4, h - 1);
    },
    conveyor() {
      const n = 7 + randInt(5), s = c; flat(n);
      const dir = Math.random() < 0.5 ? CONV_L : CONV_R;
      for (let cc = s + 1; cc < c - 1; cc++) t[h][cc] = dir;
      if (Math.random() < 0.5) placeEnemy(s + 3);
      coinRow(s + 2, n - 4, h - 2);
    },
    saw() {
      const n = 10 + randInt(4), s = c; flat(n);
      const high = Math.random() < 0.35;
      L.props.push({ type: 'saw', x0: (s + n / 2) * T, x: (s + n / 2) * T, y: high ? (h - 3) * T : h * T - 10, range: (n / 2 - 2) * T, speed: rand(1.1, 1.8), r: high ? 13 : 15, t: rand(0, 6) });
      coinRow(s + 2, n - 4, high ? h - 1 : h - 4);
    },
    // 점프로 못 넘는 높은 벽 + 점프대
    springWall() {
      flat(3);
      L.props.push({ type: 'spring', x: (c - 1) * T + 2, y: h * T - 10, w: 20, h: 10 });
      const wallH = Math.min(5, h - 5);
      h -= wallH;
      flat(5);
    },
    // 넓은 구덩이 + 좌우로 움직이는 발판
    moverGap() {
      flat(1);
      const gw = 6 + randInt(3), s = c;
      for (let i = 0; i < gw; i++) pitCol();
      L.props.push({ type: 'mover', w: 72, h: 10, cx: (s + gw / 2) * T, cy: h * T, ax: (gw * T - 72) / 2 - 2, ay: 0, speed: rand(0.9, 1.3), t: rand(0, 6) });
      flat(3);
    },
    // 엘리베이터: 위아래로 움직이는 발판을 타고 높은 벽 위로
    elevator() {
      flat(2);
      const wallH = Math.min(6, h - 5), s = c;
      flat(2); // 엘리베이터 칸
      L.props.push({ type: 'mover', w: 44, h: 10, cx: (s + 1) * T, cy: (h - (wallH + 1) / 2) * T, ax: 0, ay: ((wallH + 1) / 2) * T, speed: rand(0.9, 1.2), t: Math.PI / 2 });
      h -= wallH;
      flat(5);
    },
  };

  const chestAt = Math.floor(len * (0.45 + Math.random() * 0.15));
  flat(12);

  if (B.islands) {
    // 하늘섬: 섬과 섬 사이를 점프·발판·점프대로 이동
    while (c < len) {
      if (!L.chests.length && c >= chestAt) { const s = c; flat(8); L.chests.push(chest(s + 4, h)); continue; }
      const r = Math.random();
      if (r < 0.45) { // 작은 틈
        const gw = 2 + randInt(2);
        for (let i = 0; i < gw; i++) pitCol();
        h = clamp(h + randInt(5) - 2, 6, 12);
      } else if (r < 0.7) { // 움직이는 발판
        const gw = 6 + randInt(3), s = c;
        for (let i = 0; i < gw; i++) pitCol();
        L.props.push({ type: 'mover', w: 72, h: 10, cx: (s + gw / 2) * T, cy: h * T, ax: (gw * T - 72) / 2 - 2, ay: 0, speed: rand(0.9, 1.3), t: rand(0, 6) });
      } else { // 점프대로 높은 섬
        L.props.push({ type: 'spring', x: (c - 1) * T + 2, y: h * T - 10, w: 20, h: 10 });
        for (let i = 0; i < 2; i++) pitCol();
        h = Math.max(5, h - 4);
      }
      const n = 5 + randInt(5), s = c; flat(n);
      if (Math.random() < 0.6 + diff * 0.3) placeEnemy(s + 1 + randInt(n - 2));
      if (Math.random() < 0.5) coinRow(s + 1, Math.min(4, n - 2), h - 1);
      if (h < 9 && Math.random() < 0.5) { const nh = Math.min(11, h + 2); h = nh; flat(3); } // 다시 내려오기
    }
  } else {
    const entries = Object.entries(B.seg);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    while (c < len) {
      if (!L.chests.length && c >= chestAt) { const s = c; flat(8); L.chests.push(chest(s + 4, h)); continue; }
      let r = Math.random() * total, name = entries[0][0];
      for (const [k, w] of entries) { if ((r -= w) < 0) { name = k; break; } }
      S[name]();
      if (B.ceiling) cd = clamp(cd + randInt(3) - 1, 1, Math.max(1, h - 6));
    }
  }
  flat(16);
  const goal = { x: (c - 8) * T, y: (h - 3) * T, w: 30, h: 3 * T };
  for (let r = 0; r < ROWS; r++) { t[r][c] = SOLID; t[r][c + 1] = SOLID; }
  return { ...L, cols: c + 2, portal: goal, bossStage: false, boss: null, spawn: { x: 3 * T, y: 11 * T - 24 } };
}

const chest = (col, h) => ({ x: col * T, y: h * T - 20, w: 24, h: 20, open: false });

export function generateBossArena(g, stage, biomeId, bossType) {
  const B = BIOMES[biomeId];
  const cols = 40, t = grid(cols), h = 11;
  const ground = B.ice ? ICE : SOLID;
  for (let c = 0; c < cols; c++) for (let r = h; r < ROWS; r++) t[r][c] = ground;
  for (let r = 0; r < ROWS; r++) for (const c of [0, 1, cols - 2, cols - 1]) t[r][c] = SOLID;
  for (let i = 0; i < 4; i++) { t[h - 4][6 + i] = PLAT; t[h - 4][cols - 10 + i] = PLAT; }
  if (bossType === 'mech') for (let i = 0; i < 4; i++) t[h - 6][18 + i] = PLAT; // 공중 보스용 가운데 발판
  const boss = g.makeEnemy(bossType, 30, h);
  const n = stage / 3;
  boss.hp = boss.maxHp = Math.round(boss.hp * (1 + (n - 1) * 0.5) * g.diff.enemyHp);
  boss.state = 'intro'; boss.t = 0; boss.phase2 = false; boss.dir = -1;
  return {
    tiles: t, cols, enemies: [boss], coins: [], chests: [], props: [], portal: null, bossStage: true, boss,
    spawn: { x: 5 * T, y: h * T - 24 },
  };
}

// ---------------- 지형 오브젝트 ----------------
export function updateProps(g, dt) {
  const p = g.p;
  for (const o of g.props) {
    o.t = (o.t ?? 0) + dt;
    switch (o.type) {
      case 'mover': {
        const nx = o.cx + Math.sin(o.t * o.speed) * o.ax - o.w / 2;
        const ny = o.cy + Math.sin(o.t * o.speed) * o.ay;
        o.dx = o.x === undefined ? 0 : nx - o.x;
        o.dy = o.y === undefined ? 0 : ny - o.y;
        o.x = nx; o.y = ny;
        if (p.riding === o) { g.moveX(p, o.dx); p.y = o.y - p.h; }
        break;
      }
      case 'saw': {
        o.x = o.x0 + Math.sin(o.t * o.speed) * o.range;
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        if (Math.hypot(cx - o.x, cy - o.y) < o.r + 9) g.hurtPlayer(1, o.x);
        break;
      }
      case 'spring': o.anim = Math.max(0, (o.anim ?? 0) - dt); break;
      case 'icicle': {
        if (o.state === 'hang') {
          if (Math.abs(p.x + p.w / 2 - (o.x + o.w / 2)) < 36 && p.y > o.y) { o.state = 'shake'; o.st = 0; g.sound('tick'); }
        } else if (o.state === 'shake') {
          o.st += dt;
          if (o.st > 0.4) { o.state = 'fall'; o.vy = 0; }
        } else if (o.state === 'fall') {
          o.vy += GRAVITY * dt; o.y += o.vy * dt;
          if (overlap(p, o)) { g.hurtPlayer(1, o.x); o.state = 'gone'; }
          for (const e of g.enemies) if (!e.dead && !e.boss && overlap(e, o)) { g.hitEnemy(e, 3, 0, 0, { env: true }); o.state = 'gone'; }
          if (isSolid(g.tileAt(Math.floor((o.x + o.w / 2) / T), Math.floor((o.y + o.h) / T))) || o.y > H) o.state = 'gone';
          if (o.state === 'gone') { g.burst(o.x + o.w / 2, o.y + o.h, { color: '#e0f2fe', count: 10, speed: 120, life: 0.4 }); g.sound('brick'); o.respawn = 4; }
        } else if (o.state === 'gone') {
          o.respawn -= dt;
          if (o.respawn <= 0) { o.y = o.y0; o.state = 'hang'; }
        }
        break;
      }
      case 'fire': { // 용암에서 주기적으로 튀어오르는 불덩이
        const ph = o.t % 2.6;
        if (ph < 1.1) { o.y = o.base + 40; o.vis = false; }
        else { const k = (ph - 1.1) / 1.5; o.y = o.base - Math.sin(k * Math.PI) * 5.5 * T; o.vis = true; }
        if (o.vis && Math.hypot(p.x + p.w / 2 - o.x, p.y + p.h / 2 - o.y) < o.r + 9) g.hurtPlayer(1, o.x);
        break;
      }
    }
  }
}

/** 플레이어가 점프대·움직이는 발판에 닿았는지 (이동 후 호출) */
export function propCollisions(g, prevBottom) {
  const p = g.p;
  p.riding = null;
  for (const o of g.props) {
    if (o.type === 'mover' && p.vy >= 0 && o.x !== undefined) {
      const within = p.x + p.w > o.x + 2 && p.x < o.x + o.w - 2;
      if (within && prevBottom <= o.y + Math.max(2, o.dy ?? 0) + 1 && p.y + p.h >= o.y - 0.5) {
        p.y = o.y - p.h; p.vy = 0; p.onGround = true; p.riding = o;
      }
    } else if (o.type === 'spring' && p.vy >= 0 && overlap(p, o) && p.y + p.h <= o.y + o.h + 2) {
      p.vy = -980; p.onGround = false; p.airJumps = 0; p.airDash = false; p.jumpT = 0; p.springT = 0.35;
      o.anim = 0.2;
      g.sound('jump');
      g.burst(o.x + o.w / 2, o.y, { color: '#facc15', count: 8, speed: 90, life: 0.3 });
    }
  }
}

export function drawProps(g, ctx) {
  const now = performance.now() / 1000;
  for (const o of g.props) {
    if (o.type === 'mover' && o.x !== undefined) {
      ctx.fillStyle = '#94a3b8';
      roundRect(ctx, o.x, o.y, o.w, o.h, 3);
      ctx.fillStyle = '#facc15';
      for (let x = o.x + 4; x < o.x + o.w - 6; x += 12) ctx.fillRect(x, o.y + 2, 6, 3);
    } else if (o.type === 'spring') {
      const sq = o.anim > 0 ? 4 : 0;
      ctx.fillStyle = '#9ca3af';
      for (let i = 0; i < 3; i++) ctx.fillRect(o.x + 4, o.y + 3 + i * 2 + sq / 2, o.w - 8, 1.5);
      ctx.fillStyle = '#ef4444';
      roundRect(ctx, o.x, o.y + sq, o.w, 4, 2);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(o.x + 2, o.y + o.h - 2, o.w - 4, 2);
    } else if (o.type === 'saw') {
      ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x0 - o.range, o.y); ctx.lineTo(o.x0 + o.range, o.y); ctx.stroke();
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(now * 14);
      ctx.fillStyle = '#d1d5db';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? o.r * 0.72 : o.r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (o.type === 'icicle' && o.state !== 'gone') {
      const sx = o.state === 'shake' ? Math.sin(now * 80) * 1.5 : 0;
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath(); ctx.moveTo(o.x + sx, o.y); ctx.lineTo(o.x + o.w + sx, o.y); ctx.lineTo(o.x + o.w / 2 + sx, o.y + o.h); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(o.x + 2 + sx, o.y + 1, 2, o.h * 0.5);
    } else if (o.type === 'fire' && o.vis) {
      const gr = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r + 6);
      gr.addColorStop(0, '#fef08a'); gr.addColorStop(0.5, '#f97316'); gr.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------------- 타일 그리기 ----------------
const STATIC_TILES = new Set([SOLID, ICE, PLAT, SPIKE]);
const CHUNK = 16; // 타일 16칸씩 묶어서 미리 그려 둠

/** 지형 그리기: 움직이지 않는 타일은 구역별로 캐시, 용암·벨트·무너지는 발판만 매 프레임 */
export function drawTiles(g, ctx, cam) {
  const now = performance.now() / 1000;
  const CW = CHUNK * T;
  const ch0 = Math.max(0, Math.floor(cam / CW)), ch1 = Math.floor((cam + W) / CW);
  g._chunks ??= new Set();
  for (let ch = ch0; ch <= ch1; ch++) {
    const key = `runner-tiles-${g.stageSerial}-${ch}|`;
    g._chunks.add(key);
    g.drawCached(ctx, key, ch * CW, 0, CW, ROWS * T, (cx) => {
      cx.translate(-ch * CW, 0);
      for (let r = 0; r < ROWS; r++) for (let c = ch * CHUNK; c < Math.min(g.cols, (ch + 1) * CHUNK); c++) {
        const t = g.tiles[r][c];
        if (STATIC_TILES.has(t)) drawTile(g, cx, c, r, t, 0);
      }
    });
  }
  // 화면에서 먼 구역 캐시는 버림 (메모리 절약)
  for (const key of g._chunks) {
    const idx = Number(key.slice(key.lastIndexOf('-') + 1, -1));
    if (!key.startsWith(`runner-tiles-${g.stageSerial}-`) || idx < ch0 - 1 || idx > ch1 + 1) { g.clearCache(key); g._chunks.delete(key); }
  }
  const c0 = Math.max(0, Math.floor(cam / T) - 1), c1 = Math.min(g.cols - 1, Math.ceil((cam + W) / T) + 1);
  for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) {
    const t = g.tileAt(c, r);
    if (t && !STATIC_TILES.has(t)) drawTile(g, ctx, c, r, t, now);
  }
}

function drawTile(g, ctx, c, r, t, now) {
  const B = g.B;
  const x = c * T, y = r * T;
  if (t === SOLID || t === ICE) {
    const top = !isSolid(g.tileAt(c, r - 1));
    if (B.bricks && !top) { // 성: 벽돌 무늬
      ctx.fillStyle = B.ground; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = B.dirt; ctx.fillRect(x, y + 11, T, 2); ctx.fillRect(x + ((r % 2) ? 4 : 16), y, 2, 11); ctx.fillRect(x + ((r % 2) ? 16 : 4), y + 13, 2, 11);
    } else {
      ctx.fillStyle = ((c * 7 + r * 13) % 5 === 0) ? B.dirt : B.ground;
      ctx.fillRect(x, y, T, T);
    }
    if (t === ICE) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 3, y + 7, 9, 2); }
    if (top) {
      ctx.fillStyle = B.top; ctx.fillRect(x, y, T, 5);
      if (!B.bricks && t !== ICE) { ctx.fillRect(x + 4, y + 5, 3, 2); ctx.fillRect(x + 15, y + 5, 3, 3); }
    }
  } else if (t === PLAT) {
    ctx.fillStyle = B.plat;
    roundRect(ctx, x, y, T, 8, 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + T - 2, y, 2, 8);
  } else if (t === CRUMBLE) {
    const st = g.crumbles.get(`${c},${r}`);
    const sx = st && st.st > 0 ? Math.sin(now * 70) * 1.2 : 0;
    ctx.fillStyle = '#a8a29e';
    roundRect(ctx, x + 1 + sx, y, T - 2, 9, 2);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 6 + sx, y); ctx.lineTo(x + 10 + sx, y + 5); ctx.lineTo(x + 8 + sx, y + 9); ctx.moveTo(x + 17 + sx, y); ctx.lineTo(x + 14 + sx, y + 6); ctx.stroke();
  } else if (t === SPIKE) {
    ctx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * 8, y + T); ctx.lineTo(x + i * 8 + 4, y + 10); ctx.lineTo(x + i * 8 + 8, y + T); ctx.fill(); }
  } else if (t === LAVA) {
    const top = g.tileAt(c, r - 1) !== LAVA;
    ctx.fillStyle = '#dc2626'; ctx.fillRect(x, y, T, T);
    if (top) {
      ctx.fillStyle = '#f97316';
      const wv = Math.sin(now * 3 + c) * 2;
      ctx.fillRect(x, y + 2 + wv, T, 5);
      ctx.fillStyle = '#fde047'; ctx.fillRect(x + ((c * 5) % 14), y + 3 + wv, 4, 2);
    }
  } else if (t === CONV_L || t === CONV_R) {
    ctx.fillStyle = '#374151'; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#1f2937'; roundRect(ctx, x, y, T, 8, 2);
    const off = ((now * 60 * (t === CONV_L ? -1 : 1)) % 8 + 8) % 8;
    ctx.fillStyle = '#facc15';
    for (let k = -8; k < T; k += 8) { const xx = x + k + off; if (xx >= x && xx + 3 <= x + T) ctx.fillRect(xx, y + 2, 3, 4); }
  }
}

// ---------------- 배경 ----------------
export function drawBackground(g, ctx, cam) {
  const B = g.B, now = performance.now() / 1000;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, B.sky[0]); sky.addColorStop(1, B.sky[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  if (B.sun) { ctx.fillStyle = B.sun; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(W * 0.78, 70, 34, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  if (B.moon) {
    ctx.fillStyle = '#f5f3ff'; ctx.beginPath(); ctx.arc(W * 0.8, 64, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = B.sky[0]; ctx.beginPath(); ctx.arc(W * 0.8 + 10, 58, 22, 0, Math.PI * 2); ctx.fill();
  }
  if (B.clouds) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 173 - cam * 0.15 - now * 8) % (W + 200) + W + 200) % (W + 200) - 100, y = 50 + (i * 47) % 160;
      ctx.beginPath(); ctx.ellipse(x, y, 50, 14, 0, 0, Math.PI * 2); ctx.ellipse(x + 26, y - 8, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 먼 산 / 가까운 언덕 (시차 스크롤)
  const layers = [[B.far, 0.2, 230, 60], [B.near, 0.45, 275, 40]];
  for (const [color, speed, base, amp] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      const wx = x + cam * speed;
      let yy;
      if (B.gears || B.bricks) yy = base - (Math.floor(wx / 80) % 3) * amp * 0.4; // 공장·성: 각진 실루엣
      else if (B.ceiling) yy = base + Math.sin(wx / 40) * 10;
      else yy = base - Math.sin(wx / 90) * amp * 0.5 - Math.sin(wx / 37) * amp * 0.25;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(W, H); ctx.fill();
  }
  if (B.ceiling) { // 동굴 종유석 실루엣
    ctx.fillStyle = B.far;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 61 - cam * 0.3) % (W + 60) + W + 60) % (W + 60) - 30;
      ctx.beginPath(); ctx.moveTo(x - 12, 0); ctx.lineTo(x, 40 + (i * 23) % 50); ctx.lineTo(x + 12, 0); ctx.fill();
    }
  }
  if (B.gears) { // 공장 톱니바퀴
    for (let i = 0; i < 4; i++) {
      const x = ((i * 190 - cam * 0.25) % (W + 160) + W + 160) % (W + 160) - 80, y = 120 + (i % 2) * 60;
      ctx.save(); ctx.translate(x, y); ctx.rotate(now * (i % 2 ? 0.4 : -0.4));
      ctx.fillStyle = '#1e293b';
      for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -40, 12, 14); }
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = B.sky[1]; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // 날씨 입자
  if (B.snowfall || B.embers) {
    ctx.fillStyle = B.snowfall ? 'rgba(255,255,255,.8)' : 'rgba(251,146,60,.8)';
    for (let i = 0; i < 50; i++) {
      const sp = 20 + (i % 5) * 8;
      const x = (((i * 97 + Math.sin(now + i) * 20 - cam * 0.5) % W) + W) % W;
      const y = B.snowfall ? (i * 53 + now * sp) % H : H - ((i * 53 + now * sp * 1.5) % H);
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

/** 어두운 맵: 플레이어 주변만 밝게 */
export function drawDarkness(g, ctx, sx, sy) {
  const a = g.B.dark;
  if (!a) return;
  const gr = ctx.createRadialGradient(sx, sy, 50, sx, sy, 210);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
}
