import { GameBase, roundRect } from '../engine.js';

// 점프 러너: 무기·증강으로 싸우며 나아가는 횡스크롤 플랫포머
// - 스테이지는 매번 무작위 생성 (절벽, 가시, 발판, 계단, 적, 보물상자)
// - 3스테이지마다 보스, 보물상자·보스 처치 시 증강 선택
const W = 640, H = 360, T = 24, ROWS = 15;
const EMPTY = 0, SOLID = 1, SPIKE = 2, PLAT = 3;

const GRAVITY = 1900, MAX_FALL = 900;
const WALK = 145, RUN = 235, DASH_SPEED = 560, DASH_TIME = 0.16, DASH_CD = 0.8;
const JUMP_V = 575, AIR_JUMP_V = 520, CUT_V = 300, MIN_JUMP_TIME = 0.07;
const COYOTE = 0.1, JUMP_BUFFER = 0.13;

const THEMES = [
  { name: '초원', sky: ['#0f2340', '#2b5a7e'], far: '#1c3b55', near: '#204a4a', ground: '#5b4636', dirt: '#4a382b', top: '#4ade80', plat: '#a16207' },
  { name: '동굴', sky: ['#07070d', '#1c1730'], far: '#1a1528', near: '#241d38', ground: '#3f3a52', dirt: '#332f44', top: '#a78bfa', plat: '#6b7280' },
  { name: '노을', sky: ['#2a1235', '#9a3b4f'], far: '#4a1f3a', near: '#3a1830', ground: '#5a3a2a', dirt: '#47301f', top: '#fb923c', plat: '#92400e' },
];

const WEAPONS = {
  sword:   { name: '검', icon: '🗡️', dmg: 2, cd: 0.3, kind: 'melee', reach: 34, height: 30, kb: 150, color: '#e2e8f0' },
  blaster: { name: '블래스터', icon: '🔫', dmg: 1, cd: 0.2, kind: 'shot', speed: 480, life: 0.75, kb: 60, color: '#67e8f9' },
  hammer:  { name: '망치', icon: '🔨', dmg: 4, cd: 0.62, kind: 'melee', reach: 50, height: 46, kb: 320, color: '#fbbf24', heavy: true },
};

const ENEMIES = {
  slime:   { name: '슬라임', w: 20, h: 16, hp: 3, speed: 40, score: 10, color: '#a855f7' },
  drone:   { name: '벌 드론', w: 20, h: 16, hp: 2, speed: 105, score: 15, color: '#facc15', fly: true },
  turret:  { name: '포탑', w: 22, h: 22, hp: 5, score: 20, color: '#94a3b8' },
  charger: { name: '멧돼지', w: 30, h: 22, hp: 6, speed: 45, score: 25, color: '#b45309' },
  golem:   { name: '골렘', w: 52, h: 60, hp: 70, score: 300, color: '#78716c', boss: true },
};

const has = (g, w) => g.weapons.includes(w);
const AUGMENTS = [
  { id: 'hp', icon: '❤️', name: '강철 심장', desc: '최대 체력 +1, 체력 1 회복', max: 5, apply: (g) => { g.p.maxHp++; g.p.hp++; } },
  { id: 'heal', icon: '🍖', name: '든든한 식사', desc: '체력을 모두 회복', max: 99, cond: (g) => g.p.hp < g.p.maxHp, apply: (g) => { g.p.hp = g.p.maxHp; } },
  { id: 'dmg', icon: '💪', name: '괴력', desc: '모든 공격 피해 +30%', max: 5, apply: (g) => { g.S.dmgMul += 0.3; } },
  { id: 'aspd', icon: '⚡', name: '신속한 손', desc: '공격 속도 +25%', max: 4, apply: (g) => { g.S.atkSpd += 0.25; } },
  { id: 'speed', icon: '👟', name: '바람의 신발', desc: '이동 속도 +12%', max: 3, apply: (g) => { g.S.moveMul += 0.12; } },
  { id: 'jump', icon: '🪶', name: '깃털 점프', desc: '공중 점프 +1회', max: 2, apply: (g) => { g.S.maxJumps++; } },
  { id: 'dashcd', icon: '💨', name: '순간 가속', desc: '대쉬 재사용 시간 -35%', max: 2, apply: (g) => { g.S.dashCdMul *= 0.65; } },
  { id: 'dashhit', icon: '☄️', name: '돌진 베기', desc: '대쉬로 적을 통과하면 피해 3', max: 1, apply: (g) => { g.S.dashHit = true; } },
  { id: 'crit', icon: '🎯', name: '급소 찌르기', desc: '20% 확률로 피해 2배', max: 3, apply: (g) => { g.S.crit += 0.2; } },
  { id: 'vamp', icon: '🩸', name: '흡혈', desc: '적을 처치할 때마다 모아서 체력 회복 (6마리 → 겹치면 3마리)', max: 2, apply: (g) => { g.S.vamp++; } },
  { id: 'shield', icon: '🛡️', name: '수호 방패', desc: '스테이지마다 피해를 1번 막아줌', max: 2, apply: (g) => { g.S.shieldMax++; g.p.shield++; } },
  { id: 'thorns', icon: '🌵', name: '가시 갑옷', desc: '피해를 받으면 주변 적에게 피해 3', max: 1, apply: (g) => { g.S.thorns = true; } },
  { id: 'magnet', icon: '🧲', name: '코인 자석', desc: '코인을 끌어당기고 코인 점수 +50%', max: 1, apply: (g) => { g.S.magnet = true; g.S.coinMul = 1.5; } },
  { id: 'stomp', icon: '🦶', name: '강철 장화', desc: '밟기 피해 3배 + 주변 충격파', max: 1, apply: (g) => { g.S.stomp = 3; } },
  { id: 'wave', icon: '🌙', name: '검기', desc: '근접 공격할 때 앞으로 검기가 날아감', max: 1, cond: (g) => has(g, 'sword') || has(g, 'hammer'), apply: (g) => { g.S.wave = true; } },
  { id: 'pierce', icon: '🔩', name: '관통탄', desc: '블래스터 탄이 적을 관통', max: 1, cond: (g) => has(g, 'blaster'), apply: (g) => { g.S.pierce = true; } },
  { id: 'spread', icon: '🔱', name: '삼연발', desc: '블래스터가 3갈래로 발사', max: 1, cond: (g) => has(g, 'blaster'), apply: (g) => { g.S.spread = true; } },
  { id: 'w_blaster', icon: '🔫', name: '무기: 블래스터', desc: '빠른 원거리 무기 획득 (무기 교체로 전환)', max: 1, weight: 2, cond: (g) => !has(g, 'blaster'), apply: (g) => { g.weapons.push('blaster'); g.weapon = 'blaster'; } },
  { id: 'w_hammer', icon: '🔨', name: '무기: 망치', desc: '느리지만 넓고 강한 공격 (무기 교체로 전환)', max: 1, weight: 2, cond: (g) => !has(g, 'hammer'), apply: (g) => { g.weapons.push('hammer'); g.weapon = 'hammer'; } },
];

const DIFFICULTY = {
  easy:   { hp: 7, enemyHp: 0.75, label: '쉬움' },
  normal: { hp: 5, enemyHp: 1, label: '보통' },
  hard:   { hp: 4, enemyHp: 1.35, label: '어려움' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (n) => Math.floor(Math.random() * n);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default class Runner extends GameBase {
  static meta = {
    id: 'runner',
    title: '점프 러너',
    description: '무기를 휘두르며 적을 물리치고 끝까지 달려가세요. 보물상자와 보스에서 증강을 골라 점점 강해져요!',
    controls: '←→/AD 이동 · Shift 달리기 · Space/Z 점프 · X/J 공격 · C/K 대쉬 · Q 무기 교체 · ↓+점프 발판 내려가기',
    touchControls: '◀▶ 이동 · 점프 · 공격 · 대쉬 · 달리기(켜고 끄기) · 무기 교체',
  };
  static bindings = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    action: ['Space', 'KeyZ'], attack: ['KeyX', 'KeyJ'], dash: ['KeyC', 'KeyK'], run: ['ShiftLeft', 'ShiftRight'],
    swap: ['KeyQ', 'KeyE'], pick1: ['Digit1'], pick2: ['Digit2'], pick3: ['Digit3'],
  };
  static actionLabels = {
    left: '왼쪽', right: '오른쪽', up: '점프 (보조)', down: '아래 (발판 내려가기)', action: '점프 / 시작',
    attack: '공격', dash: '대쉬', run: '달리기 (누르는 동안)', swap: '무기 교체',
    pick1: '증강 1번', pick2: '증강 2번', pick3: '증강 3번',
  };
  static settings = [
    { id: 'difficulty', label: '난이도', type: 'select', default: 'normal',
      options: Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), tip: '새 게임부터 적용' },
    { id: 'alwaysRun', label: '항상 달리기', type: 'toggle', default: false, tip: '켜면 달리기 키 없이 늘 빠르게 이동' },
    { id: 'numbers', label: '피해 숫자 표시', type: 'toggle', default: true },
  ];
  static pad = {
    left: 'lr',
    buttons: [
      { action: 'swap', label: '무기' }, { action: 'runToggle', label: '달리기' },
      { action: 'dash', label: '대쉬' }, { action: 'attack', label: '공격', primary: true },
      { action: 'action', label: '점프', primary: true, wide: true },
    ],
  };
  static gestures = { tap: 'attack' }; // 터치: 화면 탭 = 공격 (증강 카드 선택도 탭)
  static mouseClick = 'attack';

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
    this.$screen.addEventListener('pointerup', () => { this.pointerStamp = performance.now(); });
  }

  // ---------------- 게임 진행 ----------------
  init() {
    const diff = DIFFICULTY[this.cfg.difficulty] ?? DIFFICULTY.normal;
    this.diff = diff;
    this.S = {
      dmgMul: 1, atkSpd: 1, moveMul: 1, maxJumps: 1, dashCdMul: 1, dashHit: false, crit: 0, vamp: 0,
      shieldMax: 0, thorns: false, magnet: false, coinMul: 1, stomp: 1, wave: false, pierce: false, spread: false,
    };
    this.p = {
      x: 0, y: 0, w: 16, h: 24, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jumpBuf: 0, airJumps: 0,
      dashT: 0, dashCd: 0, airDash: false, inv: 0, atkCd: 0, hp: diff.hp, maxHp: diff.hp, shield: 0, dropT: 0,
      anim: 0, trail: [],
    };
    this.weapons = ['sword'];
    this.weapon = 'sword';
    this.augs = {};        // id → 획득 횟수
    this.augOrder = [];    // 획득 순서 (HUD 표시)
    this.kills = 0;
    this.vampCount = 0;
    this.coinCount = 0;
    this.runToggle = false;
    this.pendingAug = 0;
    this.$pad.querySelector('[data-action="runToggle"]')?.classList.remove('mg-primary');
    this.stage = 1;
    this.choosing = null;
    this.loadStage();
  }

  loadStage() {
    const lv = this.stage % 3 === 0 ? this.genBoss() : this.genLevel();
    Object.assign(this, lv);
    this.theme = THEMES[(this.stage - 1) % THEMES.length];
    this.levelW = this.cols * T;
    this.bullets = [];     // 플레이어 탄
    this.shots = [];       // 적 탄
    this.slash = null;
    const p = this.p;
    p.x = this.spawn.x; p.y = this.spawn.y; p.vx = 0; p.vy = 0; p.dashT = 0; p.trail = [];
    p.shield = this.S.shieldMax;
    this.safe = { ...this.spawn };
    this.camera.x = clamp(p.x - W * 0.35, 0, this.levelW - W);
    this.banner = { text: `스테이지 ${this.stage}`, sub: this.bossStage ? '⚠ 보스 등장!' : this.theme.name, t: 2 };
    this.updateInfo();
  }

  updateInfo() { this.setInfo(`스테이지 ${this.stage} · 🪙${this.coinCount} · 처치 ${this.kills}`); }

  // ---------------- 레벨 생성 ----------------
  makeGrid(cols) { return Array.from({ length: ROWS }, () => new Uint8Array(cols)); }

  genLevel() {
    const st = this.stage;
    const len = 110 + st * 18;
    const cols = len + 60; // 생성 중 길이가 조금 넘쳐도 안전하도록 여유
    const t = this.makeGrid(cols);
    const enemies = [], coins = [], chests = [];
    const fill = (c, h) => { for (let r = h; r < ROWS; r++) t[r][c] = SOLID; };
    let c = 0, h = 11;
    const flat = (n) => { for (let i = 0; i < n; i++) fill(c++, h); };
    const coinRow = (c0, n, row) => { for (let i = 0; i < n; i++) coins.push({ x: (c0 + i) * T + 12, y: row * T + 12 }); };
    const diff = Math.min(1, (st - 1) / 6);
    const chestAt = Math.floor(len * (0.45 + Math.random() * 0.15));

    flat(12);
    while (c < len) {
      // 중간 보물상자 구간
      if (!chests.length && c >= chestAt) {
        const s = c; flat(8);
        chests.push({ x: (s + 4) * T, y: h * T - 20, w: 24, h: 20, open: false });
        continue;
      }
      const r = Math.random();
      if (r < 0.3) { // 평지 + 적
        const n = 7 + randInt(7), s = c; flat(n);
        const count = 1 + (Math.random() < 0.25 + diff * 0.5 ? 1 : 0);
        for (let k = 0; k < count; k++) enemies.push(this.makeEnemy(this.pickEnemy(), s + 2 + randInt(n - 3), h));
        if (Math.random() < 0.5) coinRow(s + 1, 4, h - 1);
      } else if (r < 0.45) { // 계단
        h = clamp(h + (Math.random() < 0.5 ? -1 : 1) * (1 + randInt(2)), 7, 12);
        flat(4 + randInt(4));
      } else if (r < 0.6) { // 절벽 (구덩이)
        const gw = 2 + randInt(diff > 0.4 ? 3 : 2), s = c;
        c += gw;
        for (let i = 0; i < gw; i++) coins.push({ x: (s + i) * T + 12, y: (h - 3) * T + (i === 0 || i === gw - 1 ? 12 : -4) });
        flat(3 + randInt(3));
      } else if (r < 0.72) { // 가시
        flat(2);
        const s = c; flat(2 + randInt(2));
        for (let cc = s; cc < c; cc++) t[h - 1][cc] = SPIKE;
        coinRow(s, c - s, h - 4);
        flat(2);
      } else if (r < 0.87) { // 떠 있는 발판 (아래는 구덩이일 수도)
        const n = 9 + randInt(4), s = c, pit = Math.random() < 0.55;
        for (let i = 0; i < n; i++) { if (pit && i >= 2 && i < n - 2) c++; else fill(c++, h); }
        const pw = 3 + randInt(2), px = s + Math.floor((n - pw) / 2), ph = h - 3;
        for (let i = 0; i < pw; i++) t[ph][px + i] = PLAT;
        coinRow(px, pw, ph - 1);
        if (Math.random() < 0.35 + diff * 0.3) enemies.push(this.makeEnemy('drone', px + 1, ph - 2));
      } else { // 블록 장애물
        flat(2);
        const bh = 1 + randInt(2);
        for (let i = 0; i < 2; i++) fill(c++, h - bh);
        if (Math.random() < 0.4 && st >= 2) enemies.push(this.makeEnemy('turret', c - 1, h - bh));
        flat(2);
      }
    }
    flat(16);
    const goal = { x: (c - 8) * T, y: (h - 3) * T, w: 30, h: 3 * T };
    for (let r = 0; r < ROWS; r++) { t[r][c] = SOLID; t[r][c + 1] = SOLID; } // 끝 벽
    return {
      tiles: t, cols: c + 2, enemies, coins, chests, portal: goal, bossStage: false, boss: null,
      spawn: { x: 3 * T, y: 11 * T - 24 },
    };
  }

  genBoss() {
    const cols = 40, t = this.makeGrid(cols), h = 11;
    for (let c = 0; c < cols; c++) for (let r = h; r < ROWS; r++) t[r][c] = SOLID;
    for (let r = 0; r < ROWS; r++) for (const c of [0, 1, cols - 2, cols - 1]) t[r][c] = SOLID;
    // 양옆 발판 (충격파 피하기용)
    for (let i = 0; i < 4; i++) { t[h - 4][6 + i] = PLAT; t[h - 4][cols - 10 + i] = PLAT; }
    const boss = this.makeEnemy('golem', 30, h);
    const n = this.stage / 3;
    boss.hp = boss.maxHp = Math.round(70 * (1 + (n - 1) * 0.6) * this.diff.enemyHp);
    boss.state = 'intro'; boss.t = 1.6; boss.phase2 = false;
    return {
      tiles: t, cols, enemies: [boss], coins: [], chests: [], portal: null, bossStage: true, boss,
      spawn: { x: 5 * T, y: h * T - 24 },
    };
  }

  pickEnemy() {
    const pool = ['slime', 'slime', 'drone'];
    if (this.stage >= 2) pool.push('turret', 'charger');
    if (this.stage >= 4) pool.push('charger', 'drone');
    return pool[randInt(pool.length)];
  }

  makeEnemy(type, col, surfaceRow) {
    const d = ENEMIES[type];
    const hpMul = (1 + (this.stage - 1) * 0.15) * this.diff.enemyHp;
    const e = {
      type, ...d, hp: Math.max(1, Math.round(d.hp * hpMul)), x: col * T + (T - d.w) / 2, y: surfaceRow * T - d.h,
      vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1, flash: 0, kb: 0, t: rand(0, 2), state: 'patrol', onGround: false,
    };
    e.maxHp = e.hp;
    if (d.fly) { e.homeX = e.x; e.homeY = e.y; }
    return e;
  }

  // ---------------- 타일 충돌 ----------------
  tileAt(c, r) {
    if (c < 0 || c >= this.cols) return SOLID;
    if (r < 0 || r >= ROWS) return EMPTY;
    return this.tiles[r][c];
  }

  moveX(e, dx) {
    e.x += dx;
    const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - 0.01) / T);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w) / T);
      for (let r = r0; r <= r1; r++) if (this.tileAt(c, r) === SOLID) { e.x = c * T - e.w; return true; }
    } else if (dx < 0) {
      const c = Math.floor(e.x / T);
      for (let r = r0; r <= r1; r++) if (this.tileAt(c, r) === SOLID) { e.x = (c + 1) * T; return true; }
    }
    return false;
  }

  moveY(e, dy, platforms = true) {
    const prevBottom = e.y + e.h;
    e.y += dy;
    const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - 0.01) / T);
    e.onGround = false;
    if (dy > 0) {
      const r = Math.floor((e.y + e.h) / T);
      for (let c = c0; c <= c1; c++) {
        const tt = this.tileAt(c, r);
        if (tt === SOLID || (platforms && tt === PLAT && prevBottom <= r * T + 0.5)) {
          e.y = r * T - e.h; e.vy = 0; e.onGround = true; return true;
        }
      }
    } else if (dy < 0) {
      const r = Math.floor(e.y / T);
      for (let c = c0; c <= c1; c++) if (this.tileAt(c, r) === SOLID) { e.y = (r + 1) * T; e.vy = 0; return true; }
    }
    return false;
  }

  groundAhead(e, dir) {
    const c = Math.floor((dir > 0 ? e.x + e.w + 2 : e.x - 2) / T), r = Math.floor((e.y + e.h + 2) / T);
    const t = this.tileAt(c, r);
    return t === SOLID || t === PLAT;
  }

  // ---------------- 입력 ----------------
  onAction(action, repeat) {
    if (repeat) return;
    if (this.choosing) return this.chooseInput(action);
    const p = this.p;
    if (action === 'action' || action === 'up') {
      if (this.isDown('down') && this.standingOnPlatform()) { p.dropT = 0.25; p.onGround = false; return; }
      p.jumpBuf = JUMP_BUFFER;
    } else if (action === 'attack') this.attack();
    else if (action === 'dash') this.dash();
    else if (action === 'swap') this.swapWeapon();
    else if (action === 'runToggle') {
      this.runToggle = !this.runToggle;
      this.$pad.querySelector('[data-action="runToggle"]')?.classList.toggle('mg-primary', this.runToggle);
    }
  }

  standingOnPlatform() {
    const p = this.p;
    if (!p.onGround) return false;
    const r = Math.floor((p.y + p.h + 1) / T);
    return [Math.floor(p.x / T), Math.floor((p.x + p.w - 1) / T)].every((c) => this.tileAt(c, r) !== SOLID);
  }

  swapWeapon() {
    if (this.weapons.length < 2) { this.floatText(this.p.x + 8, this.p.y - 8, '무기가 하나뿐', '#94a3b8', 12); return; }
    const i = this.weapons.indexOf(this.weapon);
    this.weapon = this.weapons[(i + 1) % this.weapons.length];
    this.floatText(this.p.x + 8, this.p.y - 8, WEAPONS[this.weapon].name, '#e2e8f0', 13);
    this.sound('move');
  }

  dash() {
    const p = this.p;
    if (p.dashCd > 0 || (!p.onGround && p.airDash)) return;
    const dir = this.isDown('left') ? -1 : this.isDown('right') ? 1 : p.face;
    p.face = dir;
    p.dashT = DASH_TIME;
    p.dashCd = DASH_CD * this.S.dashCdMul;
    if (!p.onGround) p.airDash = true;
    p.dashHits = new Set();
    this.sound('jump');
    this.burst(p.x + p.w / 2, p.y + p.h, { color: '#cbd5e1', count: 6, speed: 80, life: 0.25 });
  }

  attack() {
    const p = this.p, wp = WEAPONS[this.weapon];
    if (p.atkCd > 0) return;
    p.atkCd = wp.cd / this.S.atkSpd;
    if (wp.kind === 'melee') {
      this.slash = { t: 0.12, max: 0.12, wp, face: p.face, hit: new Set() };
      this.sound(wp.heavy ? 'drop' : 'move');
      if (this.S.wave) {
        this.bullets.push({ x: p.x + p.w / 2, y: p.y + 6, vx: p.face * 420, vy: 0, life: 0.45, dmg: wp.dmg * 0.6, kind: 'wave', pierce: true, hit: new Set(), face: p.face });
      }
    } else {
      const angles = this.S.spread ? [-0.16, 0, 0.16] : [0];
      for (const a of angles) {
        this.bullets.push({
          x: p.x + p.w / 2 + p.face * 10, y: p.y + 10, vx: Math.cos(a) * wp.speed * p.face, vy: Math.sin(a) * wp.speed,
          life: wp.life, dmg: wp.dmg, kind: 'bolt', pierce: this.S.pierce, hit: new Set(),
        });
      }
      this.sound('tick');
    }
  }

  slashBox() {
    const p = this.p, s = this.slash, wp = s.wp;
    return { x: s.face > 0 ? p.x + p.w - 4 : p.x - wp.reach + 4, y: p.y + p.h / 2 - wp.height / 2 - 2, w: wp.reach, h: wp.height };
  }

  // ---------------- 전투 ----------------
  hitEnemy(e, dmg, dirX, kb = 120) {
    if (e.dead) return;
    let d = dmg * this.S.dmgMul;
    const crit = Math.random() < this.S.crit;
    if (crit) d *= 2;
    d = Math.round(d * 10) / 10;
    e.hp -= d;
    e.flash = 0.1;
    if (!e.boss && e.type !== 'turret') { e.kb = dirX * kb; if (!e.fly) e.vy = Math.min(e.vy, -120); }
    if (this.cfg.numbers) this.floatText(e.x + e.w / 2, e.y - 4, crit ? `${d}!` : `${d}`, crit ? '#facc15' : '#fff', crit ? 16 : 13);
    this.sound('brick');
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    this.addScore(e.score * (e.boss ? this.stage / 3 : 1));
    this.burst(e.x + e.w / 2, e.y + e.h / 2, { color: e.color, count: e.boss ? 60 : 16, speed: e.boss ? 260 : 160, life: 0.6, gravity: 300 });
    const n = e.boss ? 12 : 1 + randInt(2);
    for (let i = 0; i < n; i++) this.coins.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rand(-90, 90), vy: rand(-320, -160), loose: true });
    if (this.S.vamp) {
      this.vampCount++;
      if (this.vampCount >= (this.S.vamp >= 2 ? 3 : 6) && this.p.hp < this.p.maxHp) {
        this.vampCount = 0; this.p.hp++;
        this.floatText(this.p.x + 8, this.p.y - 10, '+❤', '#f87171', 14);
      }
    }
    if (e.boss) {
      this.shake(12, 0.6);
      this.sound('levelup');
      this.addScore(500);
      this.portal = { x: this.levelW / 2 - 15, y: 11 * T - 3 * T, w: 30, h: 3 * T };
      this.banner = { text: '보스 처치!', sub: '증강을 선택하세요', t: 1.6 };
      this.pendingAug = 0.9;
    } else this.sound('bonus');
    this.updateInfo();
  }

  hurtPlayer(dmg, fromX, force = false) {
    const p = this.p;
    if (!force && (p.inv > 0 || p.dashT > 0)) return;
    if (p.shield > 0) {
      p.shield--;
      p.inv = 0.7;
      this.floatText(p.x + 8, p.y - 8, '방패!', '#93c5fd', 14);
      this.sound('lock');
      return;
    }
    p.hp -= dmg;
    p.inv = 1.1;
    const dir = Math.sign(p.x + p.w / 2 - fromX) || -p.face;
    p.vx = dir * 230; p.vy = -320; p.dashT = 0;
    this.shake(7);
    this.vibrate(80);
    this.sound('hit');
    this.burst(p.x + p.w / 2, p.y + p.h / 2, { color: '#f87171', count: 12, speed: 150 });
    if (this.S.thorns) {
      for (const e of this.enemies) {
        if (!e.dead && Math.hypot(e.x + e.w / 2 - p.x, e.y + e.h / 2 - p.y) < 90) this.hitEnemy(e, 3, Math.sign(e.x - p.x), 200);
      }
    }
    if (p.hp <= 0) {
      p.hp = 0;
      this.gameOver('쓰러졌다!', `스테이지 ${this.stage} · 처치 ${this.kills} · 증강 ${this.augOrder.length}개 · ${fmtTime(this.time)}`);
    }
  }

  // ---------------- 증강 ----------------
  offerAugments(source) {
    const pool = AUGMENTS.filter((a) => (this.augs[a.id] ?? 0) < a.max && (!a.cond || a.cond(this)));
    const cards = [];
    while (cards.length < 3 && pool.length) {
      const total = pool.reduce((s, a) => s + (a.weight ?? 1), 0);
      let r = Math.random() * total, i = 0;
      while ((r -= pool[i].weight ?? 1) > 0) i++;
      cards.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    if (!cards.length) return;
    this.choosing = { cards, cursor: 1, source, t: 0 };
    this.keys.clear();
    this.sound('power');
  }

  chooseInput(action) {
    const ch = this.choosing;
    if (ch.t < 0.35) return; // 연타로 실수 선택 방지
    if (action === 'left') ch.cursor = (ch.cursor + ch.cards.length - 1) % ch.cards.length;
    else if (action === 'right') ch.cursor = (ch.cursor + 1) % ch.cards.length;
    else if (/^pick[123]$/.test(action)) { const i = Number(action.slice(4)) - 1; if (i < ch.cards.length) this.pickAugment(i); }
    else if (action === 'action' || action === 'attack') {
      // 탭/클릭이면 누른 카드, 키보드면 선택된 카드
      if (performance.now() - (this.pointerStamp ?? 0) < 300) {
        const i = this.cardAt(this.pointer.x, this.pointer.y);
        if (i >= 0) this.pickAugment(i);
      } else this.pickAugment(ch.cursor);
    }
    if (action === 'left' || action === 'right') this.sound('move');
  }

  cardRects() {
    const n = this.choosing.cards.length, cw = 170, ch = 196, gap = 18;
    const x0 = (W - (n * cw + (n - 1) * gap)) / 2;
    return this.choosing.cards.map((_, i) => ({ x: x0 + i * (cw + gap), y: 82, w: cw, h: ch }));
  }

  cardAt(x, y) { return this.cardRects().findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); }

  pickAugment(i) {
    const a = this.choosing.cards[i];
    const src = this.choosing.source;
    this.choosing = null;
    a.apply(this);
    this.augs[a.id] = (this.augs[a.id] ?? 0) + 1;
    this.augOrder.push(a.icon);
    this.sound('levelup');
    this.floatText(this.p.x + 8, this.p.y - 12, a.name, '#fde68a', 15);
    this.p.inv = Math.max(this.p.inv, 0.8);
    if (src === 'boss') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 1);
  }

  // ---------------- 업데이트 ----------------
  update(dt) {
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.pendingAug > 0 && (this.pendingAug -= dt) <= 0) this.offerAugments('boss');
    if (this.choosing) {
      this.choosing.t += dt;
      if (this.pointer.type === 'mouse' && this.pointer.moved) {
        const i = this.cardAt(this.pointer.x, this.pointer.y);
        if (i >= 0) this.choosing.cursor = i;
        this.pointer.moved = false;
      }
      return;
    }
    this.updatePlayer(dt);
    if (this.state !== 'playing') return;
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateCamera(dt);
  }

  updatePlayer(dt) {
    const p = this.p, S = this.S;
    p.inv = Math.max(0, p.inv - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.coyote = Math.max(0, p.coyote - dt);
    p.dropT = Math.max(0, p.dropT - dt);

    const dir = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const running = this.isDown('run') || this.cfg.alwaysRun || this.runToggle;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.face * DASH_SPEED * Math.min(1.2, S.moveMul);
      p.vy = 0;
      p.trail.push({ x: p.x, y: p.y, a: 0.5 });
    } else {
      if (dir) p.face = dir;
      const target = dir * (running ? RUN : WALK) * S.moveMul;
      const accel = p.onGround ? 1900 : 1300;
      if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
      else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    }
    p.trail.forEach((t) => { t.a -= dt * 3; });
    p.trail = p.trail.filter((t) => t.a > 0);

    // 점프 (코요테 타임 + 선입력 + 공중 점프)
    if (p.jumpBuf > 0) {
      if (p.onGround || p.coyote > 0) {
        p.vy = -JUMP_V; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.jumpT = 0;
        this.sound('jump');
      } else if (p.airJumps < S.maxJumps - 1) {
        p.vy = -AIR_JUMP_V; p.jumpBuf = 0; p.airJumps++; p.jumpT = 0;
        this.sound('jump');
        this.burst(p.x + p.w / 2, p.y + p.h, { color: '#e0f2fe', count: 8, speed: 90, life: 0.3 });
      }
    }
    // 가변 점프: 버튼을 일찍 떼면 낮게 (단, 짧게 탭해도 최소 높이는 보장)
    p.jumpT = (p.jumpT ?? 1) + dt;
    const holding = this.isDown('action') || this.isDown('up');
    if (!holding && p.jumpT > MIN_JUMP_TIME && p.vy < -CUT_V && p.dashT <= 0) p.vy = -CUT_V;

    const wasGround = p.onGround;
    this.moveX(p, p.vx * dt);
    this.moveY(p, p.vy * dt, p.dropT <= 0);
    if (p.onGround) {
      p.coyote = COYOTE; p.airJumps = 0; p.airDash = false;
      if (!wasGround) { this.sound('land'); this.burst(p.x + p.w / 2, p.y + p.h, { color: '#64748b', count: 5, speed: 50, life: 0.25 }); }
      // 안전 지점 기록 (구덩이에 빠지면 여기로 복귀)
      const r = Math.floor((p.y + p.h + 1) / T);
      if ([p.x, p.x + p.w - 1].every((x) => this.tileAt(Math.floor(x / T), r) === SOLID)) this.safe = { x: p.x, y: p.y };
    }
    p.anim += dt * (Math.abs(p.vx) / 18);

    // 가시
    const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 1) / T), rr = Math.floor((p.y + p.h - 4) / T);
    for (let c = c0; c <= c1; c++) {
      if (this.tileAt(c, rr) === SPIKE && p.inv <= 0) { this.hurtPlayer(1, c * T + T / 2); p.vy = -480; break; }
    }
    // 낙사
    if (p.y > H + 40) {
      this.hurtPlayer(1, p.x, true);
      if (this.state !== 'playing') return;
      Object.assign(p, { x: this.safe.x, y: this.safe.y - 2, vx: 0, vy: 0, inv: 1.2 });
    }
    // 근접 공격 판정
    if (this.slash) {
      this.slash.t -= dt;
      const box = this.slashBox();
      for (const e of this.enemies) {
        if (e.dead || this.slash.hit.has(e) || !overlap(box, e)) continue;
        this.slash.hit.add(e);
        this.hitEnemy(e, this.slash.wp.dmg, this.slash.face, this.slash.wp.kb);
        if (this.slash.wp.heavy) this.shake(4, 0.12);
      }
      if (this.slash.t <= 0) this.slash = null;
    }
    // 보물상자 / 포탈
    for (const ch of this.chests) {
      if (!ch.open && overlap(p, ch)) {
        ch.open = true;
        this.burst(ch.x + 12, ch.y, { color: '#fde68a', count: 24, speed: 160 });
        this.addScore(50);
        this.offerAugments('chest');
      }
    }
    if (this.portal && overlap(p, this.portal)) this.clearStage();
  }

  clearStage() {
    this.addScore(100 * this.stage);
    this.sound('levelup');
    this.stage++;
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + 1);
    this.loadStage();
  }

  updateEnemies(dt) {
    const p = this.p;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.t += dt;
      const dx = p.x + p.w / 2 - (e.x + e.w / 2), dy = p.y + p.h / 2 - (e.y + e.h / 2);

      if (e.type === 'slime') {
        if (e.onGround && (!this.groundAhead(e, e.dir))) e.dir *= -1;
        e.vx = e.dir * e.speed + e.kb;
      } else if (e.type === 'charger') {
        if (e.state === 'patrol') {
          if (e.onGround && !this.groundAhead(e, e.dir)) e.dir *= -1;
          e.vx = e.dir * e.speed;
          if (Math.abs(dx) < 230 && Math.abs(dy) < 40) { e.state = 'windup'; e.t = 0; e.dir = Math.sign(dx) || 1; }
        } else if (e.state === 'windup') {
          e.vx = 0;
          if (e.t > 0.45) { e.state = 'charge'; e.t = 0; this.sound('power'); }
        } else if (e.state === 'charge') {
          e.vx = e.dir * 310;
          if (e.t > 1.3 || (e.onGround && !this.groundAhead(e, e.dir))) { e.state = 'rest'; e.t = 0; }
        } else if (e.state === 'rest') { e.vx = 0; if (e.t > 0.8) { e.state = 'patrol'; e.t = 0; } }
        e.vx += e.kb;
      } else if (e.type === 'drone') {
        const dist = Math.hypot(dx, dy);
        let tx, ty;
        if (dist < 230) { tx = Math.sign(dx) * e.speed; ty = Math.sign(dy) * e.speed * 0.7; }
        else { tx = (e.homeX - e.x) * 1.5; ty = (e.homeY + Math.sin(e.t * 2) * 12 - e.y) * 2; }
        e.vx += (tx + e.kb - e.vx) * Math.min(1, dt * 3);
        e.vy += (ty - e.vy) * Math.min(1, dt * 3);
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.dir = Math.sign(dx) || 1;
      } else if (e.type === 'turret') {
        e.dir = Math.sign(dx) || 1;
        e.vx = 0;
        if (Math.abs(dx) < 340 && Math.abs(dy) < 160) {
          e.cool = (e.cool ?? 1.2) - dt;
          if (e.cool <= 0) {
            e.cool = 1.9;
            const d = Math.hypot(dx, dy) || 1;
            this.shots.push({ x: e.x + e.w / 2, y: e.y + 6, vx: (dx / d) * 190, vy: (dy / d) * 190, r: 4, life: 3, kind: 'bullet' });
            this.sound('tick');
          }
        }
      } else if (e.type === 'golem') this.updateBoss(e, dt, dx);

      // 걷는 적 물리
      if (!e.fly) {
        e.kb *= Math.pow(0.02, dt);
        if (Math.abs(e.kb) < 5) e.kb = 0;
        if (e.type !== 'golem') {
          e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
          if (this.moveX(e, e.vx * dt)) { e.dir *= -1; if (e.state === 'charge') { e.state = 'rest'; e.t = 0; } }
          this.moveY(e, e.vy * dt);
        }
        if (e.y > H + 60) { e.dead = true; continue; }
      } else e.kb *= Math.pow(0.05, dt);

      // 플레이어와 접촉: 밟기 / 대쉬 공격 / 피해
      if (!overlap(p, e)) continue;
      if (p.vy > 60 && p.y + p.h - e.y < 14 && e.type !== 'turret') {
        p.vy = -430; p.airJumps = 0; p.airDash = false;
        this.hitEnemy(e, 2 * this.S.stomp, 0);
        this.sound('bounce');
        if (this.S.stomp > 1) {
          this.burst(p.x + p.w / 2, p.y + p.h, { color: '#fde68a', count: 14, speed: 160 });
          for (const o of this.enemies) if (o !== e && !o.dead && Math.abs(o.x - e.x) < 70 && Math.abs(o.y - e.y) < 40) this.hitEnemy(o, 2, Math.sign(o.x - e.x), 200);
        }
      } else if (p.dashT > 0) {
        if (this.S.dashHit && !p.dashHits.has(e)) { p.dashHits.add(e); this.hitEnemy(e, 3, p.face, 200); }
      } else this.hurtPlayer(1, e.x + e.w / 2);
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.boss);
  }

  updateBoss(b, dt, dx) {
    if (b.dead) return;
    const p = this.p;
    b.phase2 = b.hp < b.maxHp / 2;
    const sp = b.phase2 ? 1.35 : 1;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const next = () => {
      const opts = ['slam', 'rocks', 'charge'];
      b.state = opts[randInt(opts.length)]; b.t = 0; b.did = false;
    };
    switch (b.state) {
      case 'intro': b.vx = 0; if (b.t > 1.6) { b.state = 'walk'; b.t = 0; } break;
      case 'walk':
        b.dir = Math.sign(dx) || 1;
        b.vx = b.dir * 70 * sp;
        if (b.t > 1.4 / sp) next();
        break;
      case 'slam':
        if (b.t < 0.45) b.vx = 0; // 웅크림 (예고)
        else if (!b.did) {
          b.did = true; b.vy = -720;
          b.vx = clamp((p.x - b.x) / 0.75, -320, 320);
        } else if (b.onGround && b.t > 0.6) {
          b.vx = 0;
          this.shake(9, 0.3); this.sound('drop');
          for (const d of [-1, 1]) this.shots.push({ x: b.x + b.w / 2, y: b.y + b.h - 18, vx: d * 230 * sp, vy: 0, r: 9, w: 14, h: 18, life: 2.2, kind: 'wave' });
          b.state = 'recover'; b.t = 0;
        }
        break;
      case 'rocks':
        b.vx = 0;
        if (b.t > 0.55 && !b.did) {
          b.did = true;
          const n = b.phase2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const tt = 0.9 + i * 0.12;
            this.shots.push({ x: b.x + b.w / 2, y: b.y + 8, vx: (p.x - b.x) / tt + rand(-60, 60), vy: -430 - i * 30, r: 7, life: 4, kind: 'rock', g: 900 });
          }
          this.sound('power');
        }
        if (b.t > 1.1) { b.state = 'recover'; b.t = 0; }
        break;
      case 'charge':
        if (b.t < 0.6) { b.vx = 0; b.dir = Math.sign(dx) || 1; }
        else b.vx = b.dir * 380 * sp;
        break;
      case 'stun': b.vx = 0; if (b.t > 1.1) { b.state = 'walk'; b.t = 0; } break;
      case 'recover': b.vx *= 0.9; if (b.t > 0.7 / sp) { b.state = 'walk'; b.t = 0; } break;
    }
    if (this.moveX(b, b.vx * dt) && b.state === 'charge') {
      b.state = 'stun'; b.t = 0; this.shake(8, 0.3); this.sound('hit');
      this.burst(b.dir > 0 ? b.x + b.w : b.x, b.y + b.h / 2, { color: '#a8a29e', count: 20, speed: 160 });
    }
    this.moveY(b, b.vy * dt, false);
  }

  updateProjectiles(dt) {
    const p = this.p;
    for (const b of this.bullets) {
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'bolt' && this.tileAt(Math.floor(b.x / T), Math.floor(b.y / T)) === SOLID) { b.life = 0; this.burst(b.x, b.y, { color: '#67e8f9', count: 4, speed: 60, life: 0.2 }); continue; }
      const box = b.kind === 'wave' ? { x: b.x - 10, y: b.y, w: 20, h: 26 } : { x: b.x - 4, y: b.y - 3, w: 8, h: 6 };
      for (const e of this.enemies) {
        if (e.dead || b.hit.has(e) || !overlap(box, e)) continue;
        b.hit.add(e);
        this.hitEnemy(e, b.dmg, Math.sign(b.vx), b.kind === 'wave' ? 120 : WEAPONS.blaster.kb);
        if (!b.pierce) { b.life = 0; break; }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    for (const s of this.shots) {
      s.life -= dt;
      if (s.g) s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const t = this.tileAt(Math.floor(s.x / T), Math.floor(s.y / T));
      if (s.kind !== 'wave' && t === SOLID) { s.life = 0; this.burst(s.x, s.y, { color: s.kind === 'rock' ? '#a8a29e' : '#f87171', count: 6, speed: 80, life: 0.3 }); continue; }
      if (s.kind === 'wave' && (s.x < 2 * T || s.x > this.levelW - 2 * T)) { s.life = 0; continue; }
      const box = s.kind === 'wave' ? { x: s.x - s.w / 2, y: s.y, w: s.w, h: s.h } : { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      if (overlap(p, box)) { this.hurtPlayer(1, s.x); if (s.kind !== 'wave') s.life = 0; }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  updatePickups(dt) {
    const p = this.p, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (const c of this.coins) {
      if (c.loose) {
        c.vy = Math.min(MAX_FALL, c.vy + GRAVITY * 0.6 * dt);
        c.vx *= Math.pow(0.3, dt);
        const box = { x: c.x - 5, y: c.y - 5, w: 10, h: 10, vy: c.vy };
        this.moveX(box, c.vx * dt); this.moveY(box, c.vy * dt);
        c.x = box.x + 5; c.y = box.y + 5; c.vy = box.vy;
        if (c.y > H + 30) c.got = true;
      }
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (this.S.magnet && d < 130) { c.x += (cx - c.x) * Math.min(1, dt * 8); c.y += (cy - c.y) * Math.min(1, dt * 8); }
      if (d < 16 && !c.got) {
        c.got = true;
        this.coinCount++;
        this.addScore(Math.round(5 * this.S.coinMul));
        this.sound('dot');
        this.updateInfo();
      }
    }
    this.coins = this.coins.filter((c) => !c.got);
  }

  updateCamera(dt) {
    const p = this.p;
    const target = clamp(p.x + p.w / 2 - W * 0.42 + p.face * 40, 0, Math.max(0, this.levelW - W));
    this.camera.x += (target - this.camera.x) * Math.min(1, dt * 6);
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    if (!this.tiles) return;
    const th = this.theme, cam = this.camera.x;
    // 배경 (시차 스크롤)
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (const [layer, speed, base, amp] of [[th.far, 0.2, 230, 60], [th.near, 0.45, 270, 40]]) {
      ctx.fillStyle = layer;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) {
        const wx = x + cam * speed;
        ctx.lineTo(x, base - Math.sin(wx / 90) * amp * 0.5 - Math.sin(wx / 37) * amp * 0.25);
      }
      ctx.lineTo(W, H); ctx.fill();
    }

    ctx.save();
    ctx.translate(-Math.round(cam), 0);
    this.drawTiles(ctx, cam);

    // 포탈
    if (this.portal) {
      const pt = this.portal, t = performance.now() / 1000;
      ctx.save();
      ctx.translate(pt.x + pt.w / 2, pt.y + pt.h / 2);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ['#a78bfa', '#67e8f9', '#f0abfc'][i];
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, 14 - i * 3, 34 - i * 6, Math.sin(t * 2 + i) * 0.2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#e9d5ff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GOAL', pt.x + pt.w / 2, pt.y - 6); ctx.textAlign = 'start';
    }
    // 보물상자
    for (const ch of this.chests) {
      ctx.fillStyle = ch.open ? '#78350f' : '#b45309';
      roundRect(ctx, ch.x, ch.y + (ch.open ? 6 : 0), ch.w, ch.h - (ch.open ? 6 : 0), 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(ch.x, ch.y + 8, ch.w, 3);
      ctx.fillRect(ch.x + ch.w / 2 - 2, ch.y + 6, 4, 7);
      if (!ch.open) {
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 200) * 0.3;
        ctx.fillStyle = '#fde68a'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('증강!', ch.x + ch.w / 2, ch.y - 8); ctx.textAlign = 'start'; ctx.globalAlpha = 1;
      }
    }
    // 코인
    const spin = Math.abs(Math.cos(performance.now() / 160));
    for (const c of this.coins) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 6 * Math.max(0.25, spin), 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of this.enemies) if (!e.dead) this.drawEnemy(ctx, e);
    this.drawPlayer(ctx);
    // 탄
    for (const b of this.bullets) {
      if (b.kind === 'wave') {
        ctx.strokeStyle = 'rgba(224,242,254,.85)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x - Math.sign(b.vx) * 8, b.y + 13, 14, -Math.PI / 2.4, Math.PI / 2.4, b.vx < 0); ctx.stroke();
      } else { ctx.fillStyle = '#67e8f9'; roundRect(ctx, b.x - 5, b.y - 2, 10, 4, 2); }
    }
    for (const s of this.shots) {
      if (s.kind === 'wave') {
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); ctx.moveTo(s.x - s.w / 2, s.y + s.h); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x + s.w / 2, s.y + s.h); ctx.fill();
      } else {
        ctx.fillStyle = s.kind === 'rock' ? '#a8a29e' : '#f87171';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    this.drawHud(ctx);
    if (this.choosing) this.drawCards(ctx);
  }

  drawTiles(ctx, cam) {
    const th = this.theme;
    const c0 = Math.max(0, Math.floor(cam / T) - 1), c1 = Math.min(this.cols - 1, Math.ceil((cam + W) / T) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tiles[r][c];
        if (!t) continue;
        const x = c * T, y = r * T;
        if (t === SOLID) {
          const top = this.tileAt(c, r - 1) !== SOLID;
          ctx.fillStyle = ((c * 7 + r * 13) % 5 === 0) ? th.dirt : th.ground;
          ctx.fillRect(x, y, T, T);
          if (top) { ctx.fillStyle = th.top; ctx.fillRect(x, y, T, 5); ctx.fillRect(x + 4, y + 5, 3, 2); ctx.fillRect(x + 15, y + 5, 3, 3); }
        } else if (t === PLAT) {
          ctx.fillStyle = th.plat;
          roundRect(ctx, x, y, T, 8, 2);
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          ctx.fillRect(x + T - 2, y, 2, 8);
        } else if (t === SPIKE) {
          ctx.fillStyle = '#cbd5e1';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(x + i * 8, y + T); ctx.lineTo(x + i * 8 + 4, y + 10); ctx.lineTo(x + i * 8 + 8, y + T); ctx.fill();
          }
        }
      }
    }
  }

  drawPlayer(ctx) {
    const p = this.p;
    for (const t of p.trail) { // 대쉬 잔상
      ctx.globalAlpha = t.a * 0.6; ctx.fillStyle = '#67e8f9';
      roundRect(ctx, t.x, t.y + 6, p.w, p.h - 6, 4);
    }
    ctx.globalAlpha = 1;
    if (p.inv > 0 && Math.floor(p.inv * 15) % 2 === 0 && p.dashT <= 0) return; // 무적 깜빡임
    const x = p.x, y = p.y, f = p.face;
    const moving = p.onGround && Math.abs(p.vx) > 20;
    const leg = moving ? Math.sin(p.anim) * 3 : 0;
    // 다리
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x + 3 + leg, y + p.h - 5, 4, 5);
    ctx.fillRect(x + p.w - 7 - leg, y + p.h - 5, 4, 5);
    // 몸통
    ctx.fillStyle = '#2563eb';
    roundRect(ctx, x + 1, y + 10, p.w - 2, p.h - 14, 4);
    // 스카프 (움직이면 휘날림)
    const flutter = Math.sin(performance.now() / 70) * 2;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(x + p.w / 2 - f * 3, y + 10);
    ctx.lineTo(x + p.w / 2 - f * (12 + Math.min(10, Math.abs(p.vx) / 25)), y + 9 + flutter);
    ctx.lineTo(x + p.w / 2 - f * 3, y + 14);
    ctx.fill();
    ctx.fillRect(x + 2, y + 9, p.w - 4, 3);
    // 머리
    ctx.fillStyle = '#fcd9b6';
    roundRect(ctx, x + 2, y, p.w - 4, 11, 4);
    ctx.fillStyle = '#7c2d12';
    roundRect(ctx, x + 1, y - 1, p.w - 2, 4, 2);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + p.w / 2 + f * 3 - 1, y + 4, 2, 3);
    // 무기 (공격 중이 아닐 때 손에 들고 있음)
    const wp = WEAPONS[this.weapon];
    const hx = f > 0 ? x + p.w - 1 : x + 1, hy = y + 15;
    if (!this.slash) {
      ctx.fillStyle = wp.color;
      if (this.weapon === 'sword') ctx.fillRect(hx - (f > 0 ? 0 : 2), hy - 11, 2, 12);
      else if (this.weapon === 'hammer') { ctx.fillStyle = '#92400e'; ctx.fillRect(hx - 1, hy - 12, 2, 13); ctx.fillStyle = wp.color; ctx.fillRect(hx - 5, hy - 16, 10, 6); }
      else { ctx.fillRect(f > 0 ? hx - 2 : hx - 8, hy - 3, 10, 4); }
    } else {
      // 휘두르기 궤적
      const box = this.slashBox(), k = 1 - this.slash.t / this.slash.max;
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - k * 0.5);
      ctx.strokeStyle = wp.color; ctx.lineWidth = wp.heavy ? 6 : 4;
      const cx = f > 0 ? box.x : box.x + box.w, cy = box.y + box.h / 2, rad = box.w * 0.9;
      const a0 = -Math.PI / 2 * 0.95, a1 = a0 + Math.PI * 0.95 * (0.4 + k * 0.6);
      ctx.beginPath();
      if (f > 0) ctx.arc(cx, cy, rad, a0, a1); else ctx.arc(cx, cy, rad, Math.PI - a0, Math.PI - a1, true);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEnemy(ctx, e) {
    const col = e.flash > 0 ? '#ffffff' : e.color;
    const x = e.x, y = e.y, t = e.t;
    ctx.save();
    if (e.type === 'slime') {
      const sq = Math.sin(t * 8) * 1.5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y + e.h);
      ctx.bezierCurveTo(x - 1, y - 4 + sq, x + e.w + 1, y - 4 + sq, x + e.w, y + e.h);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + e.w / 2 + e.dir * 3 - 5, y + 5, 3, 4); ctx.fillRect(x + e.w / 2 + e.dir * 3 + 2, y + 5, 3, 4);
    } else if (e.type === 'drone') {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      const wf = Math.sin(t * 40) * 3;
      ctx.beginPath(); ctx.ellipse(x + 6, y - 1 + wf * 0.3, 6, 3 + wf * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + e.w - 6, y - 1 - wf * 0.3, 6, 3 - wf * 0.3, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + e.h / 2 + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + e.w / 2 - 2, y + 3, 3, e.h - 4); ctx.fillRect(x + e.w / 2 + 4, y + 4, 2, e.h - 6);
      ctx.beginPath(); ctx.moveTo(x + (e.dir > 0 ? 0 : e.w), y + e.h / 2 + 2); ctx.lineTo(x + (e.dir > 0 ? -5 : e.w + 5), y + e.h / 2 + 4); ctx.lineTo(x + (e.dir > 0 ? 0 : e.w), y + e.h / 2 + 6); ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + e.w / 2 + e.dir * 6 - 1, y + 5, 3, 3);
    } else if (e.type === 'turret') {
      const warn = (e.cool ?? 1) < 0.35;
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#475569';
      roundRect(ctx, x - 1, y + e.h - 8, e.w + 2, 8, 2);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h - 8, e.w / 2, Math.PI, 0); ctx.fill();
      const ang = Math.atan2(this.p.y + 12 - (y + 8), this.p.x + 8 - (x + e.w / 2));
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x + e.w / 2, y + e.h - 10); ctx.lineTo(x + e.w / 2 + Math.cos(ang) * 14, y + e.h - 10 + Math.sin(ang) * 14); ctx.stroke();
      ctx.fillStyle = warn ? '#ef4444' : '#22d3ee';
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h - 12, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'charger') {
      const shakeX = e.state === 'windup' ? Math.sin(t * 60) * 1.5 : 0;
      const bx = x + shakeX;
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.state === 'windup' ? '#dc2626' : col);
      roundRect(ctx, bx, y + 2, e.w, e.h - 6, 8);
      ctx.fillStyle = '#78350f';
      const lg = e.state === 'charge' ? Math.sin(t * 30) * 2 : 0;
      ctx.fillRect(bx + 4 + lg, y + e.h - 5, 4, 5); ctx.fillRect(bx + e.w - 8 - lg, y + e.h - 5, 4, 5);
      const front = e.dir > 0 ? bx + e.w : bx;
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath(); ctx.moveTo(front - e.dir * 4, y + 12); ctx.lineTo(front + e.dir * 6, y + 6); ctx.lineTo(front - e.dir * 1, y + 15); ctx.fill();
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(front - e.dir * 9 - 1, y + 6, 3, 3);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(bx + e.w / 2 - e.dir * 10 - 1, y, 3, 5);
    } else if (e.type === 'golem') {
      const crouch = (e.state === 'slam' && e.t < 0.45) ? 6 : 0;
      const flashCharge = e.state === 'charge' && e.t < 0.6 && Math.floor(e.t * 12) % 2;
      ctx.fillStyle = e.flash > 0 || flashCharge ? '#fff' : (e.state === 'stun' ? '#57534e' : col);
      roundRect(ctx, x, y + 14 + crouch, e.w, e.h - 14 - crouch, 8);       // 몸
      roundRect(ctx, x + 10, y + crouch, e.w - 20, 22, 6);                  // 머리
      ctx.fillStyle = '#57534e';
      roundRect(ctx, x - 8, y + 22 + crouch, 12, 26, 5); roundRect(ctx, x + e.w - 4, y + 22 + crouch, 12, 26, 5); // 팔
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 30); ctx.lineTo(x + 20, y + 40); ctx.lineTo(x + 16, y + 50); ctx.stroke();
      const eye = e.phase2 ? '#ef4444' : '#fb923c';
      ctx.fillStyle = e.state === 'stun' ? '#a8a29e' : eye;
      ctx.fillRect(x + 16 + e.dir * 2, y + 8 + crouch, 6, 4); ctx.fillRect(x + e.w - 22 + e.dir * 2, y + 8 + crouch, 6, 4);
      if (e.state === 'stun') { ctx.fillStyle = '#fde68a'; ctx.font = '700 12px system-ui'; ctx.fillText('💫', x + e.w / 2 - 6, y - 4); }
    }
    ctx.restore();
    // 체력바 (잡몹은 맞았을 때만)
    if (!e.boss && e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x, e.y - 7, e.w, 3);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(e.x, e.y - 7, e.w * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  drawHud(ctx) {
    const p = this.p;
    if (!p) return;
    // 체력
    for (let i = 0; i < p.maxHp; i++) this.drawHeart(ctx, 12 + i * 18, 12, i < p.hp);
    for (let i = 0; i < p.shield; i++) {
      ctx.fillStyle = '#93c5fd';
      const sx = 12 + (p.maxHp + i) * 18;
      ctx.beginPath(); ctx.moveTo(sx, 6); ctx.lineTo(sx + 12, 6); ctx.lineTo(sx + 12, 13); ctx.lineTo(sx + 6, 19); ctx.lineTo(sx, 13); ctx.fill();
    }
    // 무기 + 대쉬 쿨타임
    const wp = WEAPONS[this.weapon];
    ctx.fillStyle = 'rgba(15,23,42,.65)';
    roundRect(ctx, 8, 26, 132, 22, 6);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(`${wp.icon} ${wp.name}${this.weapons.length > 1 ? ` (${this.weapons.length})` : ''}`, 14, 41);
    const dk = 1 - p.dashCd / (DASH_CD * this.S.dashCdMul);
    ctx.fillStyle = '#334155'; ctx.fillRect(96, 34, 38, 6);
    ctx.fillStyle = dk >= 1 ? '#67e8f9' : '#64748b'; ctx.fillRect(96, 34, 38 * clamp(dk, 0, 1), 6);
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 8px system-ui, sans-serif'; ctx.fillText('DASH', 96, 32);
    if (this.isDown('run') || this.cfg.alwaysRun || this.runToggle) {
      ctx.fillStyle = '#fde68a'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText('» 달리기', 12, 62);
    }
    // 획득한 증강
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.augOrder.slice(-10).join(''), W - 10, 22);
    ctx.textAlign = 'start';
    // 보스 체력
    const b = this.boss;
    if (b && !b.dead) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(ctx, W / 2 - 150, 36, 300, 12, 6);
      ctx.fillStyle = b.phase2 ? '#ef4444' : '#f97316';
      roundRect(ctx, W / 2 - 148, 38, 296 * Math.max(0, b.hp / b.maxHp), 8, 4);
      ctx.fillStyle = '#fef3c7'; ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`골렘${b.phase2 ? ' (분노)' : ''}`, W / 2, 30); ctx.textAlign = 'start';
    }
    // 스테이지 배너
    if (this.banner) {
      const a = Math.min(1, this.banner.t / 0.5);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#0b0c10';
      ctx.strokeText(this.banner.text, W / 2, 130); ctx.fillStyle = '#fff'; ctx.fillText(this.banner.text, W / 2, 130);
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.strokeText(this.banner.sub, W / 2, 156); ctx.fillStyle = '#fde68a'; ctx.fillText(this.banner.sub, W / 2, 156);
      ctx.textAlign = 'start'; ctx.globalAlpha = 1;
    }
  }

  drawHeart(ctx, x, y, full) {
    ctx.fillStyle = full ? '#f43f5e' : 'rgba(148,163,184,.35)';
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 13);
    ctx.bezierCurveTo(x - 4, y + 5, x + 1, y - 3, x + 7, y + 3);
    ctx.bezierCurveTo(x + 13, y - 3, x + 18, y + 5, x + 7, y + 13);
    ctx.fill();
  }

  drawCards(ctx) {
    const ch = this.choosing;
    ctx.fillStyle = 'rgba(5,6,10,.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.fillText(ch.source === 'boss' ? '보스 보상 - 증강 선택' : '보물상자 - 증강 선택', W / 2, 52);
    this.cardRects().forEach((r, i) => {
      const a = ch.cards[i], sel = i === ch.cursor;
      const lift = sel ? -6 : 0;
      ctx.fillStyle = sel ? '#1e293b' : '#151a26';
      roundRect(ctx, r.x, r.y + lift, r.w, r.h, 14);
      ctx.strokeStyle = sel ? '#facc15' : '#334155'; ctx.lineWidth = sel ? 3 : 1.5;
      ctx.beginPath(); ctx.roundRect?.(r.x, r.y + lift, r.w, r.h, 14); ctx.stroke();
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(a.icon, r.x + r.w / 2, r.y + 62 + lift);
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(a.name, r.x + r.w / 2, r.y + 98 + lift);
      ctx.font = '500 12.5px system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      this.wrapText(ctx, a.desc, r.w - 24).forEach((line, k) => ctx.fillText(line, r.x + r.w / 2, r.y + 124 + k * 17 + lift));
      const lv = this.augs[a.id] ?? 0;
      if (lv) { ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText(`보유 ${lv}`, r.x + r.w / 2, r.y + r.h - 12 + lift); }
      if (!this.touchMode) { ctx.fillStyle = '#64748b'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText(`[${i + 1}]`, r.x + 18, r.y + 20 + lift); }
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(this.touchMode ? '카드를 탭해서 선택' : '←→ 고르기 · Space/X 선택 · 숫자키 1~3 · 클릭', W / 2, 312);
    ctx.textAlign = 'start';
  }

  wrapText(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
}
