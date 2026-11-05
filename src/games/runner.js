import { GameBase, roundRect } from '../engine.js';
import {
  T, ROWS, W, H, GRAVITY, MAX_FALL, EMPTY, SOLID, SPIKE, LAVA, CONV_L, CONV_R, CRUMBLE, ICE, isSolid, isOneWay,
  clamp, rand, randInt, overlap, BIOMES, BOSS_ORDER, makeBiomeOrder, biomeForStage, generateLevel, generateBossArena,
  updateProps, propCollisions, drawProps, drawTiles, drawBackground, drawDarkness,
} from './runner/world.js';
import { ENEMIES, AI, drawEnemy } from './runner/enemies.js';

// 점프 러너: 무기·증강으로 싸우며 나아가는 횡스크롤 플랫포머
// - 바이옴 8종(초원·동굴·사막·설원·화산·하늘섬·유령 성·공장), 각자 고유 지형 기믹과 적
// - 스테이지는 매번 무작위 생성, 3스테이지마다 보스(골렘·슬라임 왕·강철 비행선)
// - 보물상자·보스 처치 시 증강 선택
const WALK = 145, RUN = 235, DASH_SPEED = 560, DASH_TIME = 0.16, DASH_CD = 0.8;
const JUMP_V = 575, AIR_JUMP_V = 520, CUT_V = 300, MIN_JUMP_TIME = 0.07;
const COYOTE = 0.1, JUMP_BUFFER = 0.13;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const WEAPONS = {
  sword:   { name: '검', icon: '🗡️', dmg: 2, cd: 0.3, kind: 'melee', reach: 34, height: 30, kb: 150, color: '#e2e8f0' },
  blaster: { name: '블래스터', icon: '🔫', dmg: 1, cd: 0.2, kind: 'shot', speed: 480, life: 0.75, kb: 60, color: '#67e8f9' },
  hammer:  { name: '망치', icon: '🔨', dmg: 4, cd: 0.62, kind: 'melee', reach: 50, height: 46, kb: 320, color: '#fbbf24', heavy: true },
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

export default class Runner extends GameBase {
  static meta = {
    id: 'runner',
    title: '점프 러너',
    description: '8가지 세계를 무기로 헤쳐 나가세요. 보물상자와 보스에서 증강을 골라 점점 강해져요!',
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
    this.biomeOrder = makeBiomeOrder();
    this.loadStage();
  }

  loadStage() {
    const biome = biomeForStage(this.stage, this.biomeOrder);
    this.B = BIOMES[biome];
    const boss = this.stage % 3 === 0;
    const bossType = BOSS_ORDER[(this.stage / 3 - 1) % BOSS_ORDER.length];
    this.crumbles = new Map();
    const lv = boss ? generateBossArena(this, this.stage, biome, bossType) : generateLevel(this, this.stage, biome);
    Object.assign(this, lv);
    this.levelW = this.cols * T;
    this.bullets = [];     // 플레이어 탄
    this.shots = [];       // 적 탄·위험 요소
    this.slash = null;
    this.wind = this.B.wind && !boss ? { phase: 'calm', t: rand(2, 4), force: 0 } : null;
    const p = this.p;
    Object.assign(p, { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, dashT: 0, trail: [], riding: null });
    p.shield = this.S.shieldMax;
    this.safe = { ...this.spawn };
    this.camera.x = clamp(p.x - W * 0.35, 0, Math.max(0, this.levelW - W));
    this.banner = boss
      ? { text: `스테이지 ${this.stage}`, sub: `⚠ ${ENEMIES[bossType].name} 등장!`, t: 2.2 }
      : { text: `스테이지 ${this.stage} - ${this.B.name}`, sub: this.B.sub, t: 2.4 };
    this.updateInfo();
  }

  updateInfo() { this.setInfo(`스테이지 ${this.stage} · 🪙${this.coinCount} · 처치 ${this.kills}`); }

  makeEnemy(type, col, row) {
    const d = ENEMIES[type];
    return this.createEnemy(type, col * T + (T - d.w) / 2, row * T - d.h);
  }

  spawnEnemyAt(type, x, y) {
    const e = this.createEnemy(type, x - ENEMIES[type].w / 2, y - ENEMIES[type].h);
    this.enemies.push(e);
    return e;
  }

  createEnemy(type, x, y) {
    const d = ENEMIES[type];
    const hpMul = d.boss ? 1 : (1 + (this.stage - 1) * 0.15) * this.diff.enemyHp;
    const e = {
      type, ...d, hp: Math.max(1, Math.round(d.hp * hpMul)), x, y, vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1,
      flash: 0, kb: 0, t: rand(0, 2), state: 'patrol', onGround: false,
    };
    e.maxHp = e.hp;
    e.homeX = x; e.homeY = y;
    if (type === 'mech') { e.y = -60; }
    return e;
  }

  // ---------------- 타일 충돌 ----------------
  tileAt(c, r) {
    if (c < 0 || c >= this.cols) return SOLID;
    if (r < 0 || r >= ROWS) return EMPTY;
    const t = this.tiles[r][c];
    if (t === CRUMBLE && this.crumbles.get(`${c},${r}`)?.down > 0) return EMPTY; // 무너진 발판
    return t;
  }

  moveX(e, dx) {
    e.x += dx;
    const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - 0.01) / T);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w) / T);
      for (let r = r0; r <= r1; r++) if (isSolid(this.tileAt(c, r))) { e.x = c * T - e.w; return true; }
    } else if (dx < 0) {
      const c = Math.floor(e.x / T);
      for (let r = r0; r <= r1; r++) if (isSolid(this.tileAt(c, r))) { e.x = (c + 1) * T; return true; }
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
        if (isSolid(tt) || (platforms && isOneWay(tt) && prevBottom <= r * T + 0.5)) {
          e.y = r * T - e.h; e.vy = 0; e.onGround = true; return true;
        }
      }
    } else if (dy < 0) {
      const r = Math.floor(e.y / T);
      for (let c = c0; c <= c1; c++) if (isSolid(this.tileAt(c, r))) { e.y = (r + 1) * T; e.vy = 0; return true; }
    }
    return false;
  }

  groundAhead(e, dir) {
    const c = Math.floor((dir > 0 ? e.x + e.w + 2 : e.x - 2) / T), r = Math.floor((e.y + e.h + 2) / T);
    const t = this.tileAt(c, r);
    return isSolid(t) || isOneWay(t);
  }

  /** 발밑 타일 (가운데 기준) */
  groundTile(e) { return this.tileAt(Math.floor((e.x + e.w / 2) / T), Math.floor((e.y + e.h + 1) / T)); }

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
    return [Math.floor(p.x / T), Math.floor((p.x + p.w - 1) / T)].every((c) => !isSolid(this.tileAt(c, r))) && !p.riding;
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
  /** opts: { heavy, stomp, env } */
  hitEnemy(e, dmg, dirX, kb = 120, opts = {}) {
    if (e.dead) return;
    if (e.hidden) return; // 투명한 유령은 무적
    // 해골 기사: 정면 공격은 방패로 막음 (망치·밟기·뒤에서 공격은 통함)
    if (e.type === 'skeleton' && !opts.heavy && !opts.stomp && !opts.env && dirX === -e.dir) {
      if (!e.blockT || e.blockT < this.time) {
        e.blockT = this.time + 0.15;
        this.floatText(e.x + e.w / 2, e.y - 4, '막힘!', '#94a3b8', 12);
        this.sound('lock');
        this.burst(e.x + (e.dir > 0 ? e.w : 0), e.y + 14, { color: '#facc15', count: 5, speed: 90, life: 0.25 });
      }
      return;
    }
    let d = dmg * (opts.env ? 1 : this.S.dmgMul);
    const crit = !opts.env && Math.random() < this.S.crit;
    if (crit) d *= 2;
    d = Math.round(d * 10) / 10;
    e.hp -= d;
    e.flash = 0.1;
    if (!e.boss && !e.static) { e.kb = dirX * kb; if (!e.fly) e.vy = Math.min(e.vy, -120); }
    if (this.cfg.numbers) this.floatText(e.x + e.w / 2, e.y - 4, crit ? `${d}!` : `${d}`, crit ? '#facc15' : '#fff', crit ? 16 : 13);
    this.sound('brick');
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    this.addScore(e.score * (e.boss ? this.stage / 3 : 1));
    this.burst(e.x + e.w / 2, e.y + e.h / 2, { color: e.color, count: e.boss ? 60 : 16, speed: e.boss ? 260 : 160, life: 0.6, gravity: 300 });
    if (e.split) { // 마그마 슬라임: 둘로 분열
      for (const d of [-1, 1]) { const m = this.spawnEnemyAt('minislime', e.x + e.w / 2 + d * 6, e.y + e.h); m.kb = d * 150; m.vy = -260; m.dir = d; }
    }
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
      for (const o of this.enemies) if (!o.boss && !o.dead) this.killEnemy(o); // 남은 부하 정리
      this.shots = [];
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
    this.updateWorld(dt);
    this.updatePlayer(dt);
    if (this.state !== 'playing') return;
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateCamera(dt);
  }

  updateWorld(dt) {
    updateProps(this, dt);
    // 무너지는 발판
    for (const [key, st] of this.crumbles) {
      if (st.down > 0) {
        st.down -= dt;
        if (st.down <= 0) {
          const [c, r] = key.split(',').map(Number);
          if (overlap(this.p, { x: c * T, y: r * T, w: T, h: T })) st.down = 0.5; else this.crumbles.delete(key);
        }
      } else if (st.st > 0) {
        st.st += dt;
        if (st.st > 0.5) {
          st.down = 3; st.st = 0;
          const [c, r] = key.split(',').map(Number);
          this.burst(c * T + 12, r * T + 4, { color: '#a8a29e', count: 6, speed: 80, life: 0.35, gravity: 400 });
          this.sound('brick');
        }
      }
    }
    // 바람 (사막·하늘섬): 예고 → 돌풍 → 잠잠
    const w = this.wind;
    if (w) {
      w.t -= dt;
      if (w.t <= 0) {
        if (w.phase === 'calm') { w.phase = 'warn'; w.t = 0.9; w.dir = Math.random() < 0.5 ? -1 : 1; }
        else if (w.phase === 'warn') { w.phase = 'gust'; w.t = rand(2, 3); w.force = w.dir * this.B.wind; }
        else { w.phase = 'calm'; w.t = rand(3, 5); w.force = 0; }
      }
    }
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
      const icy = p.onGround && this.groundTile(p) === ICE;
      const accel = icy ? (dir ? 520 : 260) : p.onGround ? 1900 : 1300; // 얼음 위에선 미끄러짐
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
    if (p.vy >= 0) p.springT = 0;
    if (!holding && !p.springT && p.jumpT > MIN_JUMP_TIME && p.vy < -CUT_V && p.dashT <= 0) p.vy = -CUT_V; // 점프대 반동은 끊지 않음

    const wasGround = p.onGround;
    // 컨베이어 벨트·바람에 밀림
    if (p.onGround) {
      const gt = this.groundTile(p);
      if (gt === CONV_L || gt === CONV_R) this.moveX(p, (gt === CONV_L ? -80 : 80) * dt);
      if (gt === CRUMBLE) {
        const key = `${Math.floor((p.x + p.w / 2) / T)},${Math.floor((p.y + p.h + 1) / T)}`;
        const st = this.crumbles.get(key);
        if (!st) this.crumbles.set(key, { st: 0.001, down: 0 });
      }
    }
    if (this.wind?.force && p.dashT <= 0) this.moveX(p, this.wind.force * (p.onGround ? 0.8 : 1) * dt);
    this.moveX(p, p.vx * dt);
    const prevBottom = p.y + p.h;
    this.moveY(p, p.vy * dt, p.dropT <= 0);
    propCollisions(this, prevBottom);
    if (p.onGround) {
      p.coyote = COYOTE; p.airJumps = 0; p.airDash = false;
      if (!wasGround) { this.sound('land'); this.burst(p.x + p.w / 2, p.y + p.h, { color: '#64748b', count: 5, speed: 50, life: 0.25 }); }
      // 안전 지점 기록 (구덩이에 빠지면 여기로 복귀)
      const r = Math.floor((p.y + p.h + 1) / T);
      if (!p.riding && [p.x, p.x + p.w - 1].every((x) => { const tt = this.tileAt(Math.floor(x / T), r); return tt === SOLID || tt === ICE; })) this.safe = { x: p.x, y: p.y };
    }
    p.anim += dt * (Math.abs(p.vx) / 18);

    // 가시
    const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 1) / T), rr = Math.floor((p.y + p.h - 4) / T);
    for (let c = c0; c <= c1; c++) {
      if (this.tileAt(c, rr) === SPIKE && p.inv <= 0) { this.hurtPlayer(1, c * T + T / 2); p.vy = -480; break; }
    }
    // 용암·낙사
    const inLava = [p.x + 2, p.x + p.w - 2].some((x) => this.tileAt(Math.floor(x / T), Math.floor((p.y + p.h - 2) / T)) === LAVA);
    if (inLava) this.burst(p.x + p.w / 2, p.y + p.h, { color: '#f97316', count: 16, speed: 160 });
    if (p.y > H + 40 || inLava) {
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
        this.hitEnemy(e, this.slash.wp.dmg, this.slash.face, this.slash.wp.kb, { heavy: this.slash.wp.heavy });
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
      if (e.boss) e.phase2 = e.hp < e.maxHp / 2;
      AI[e.type]?.(this, e, dt, dx, dy);

      if (!e.fly && !e.boss) {
        e.kb *= Math.pow(0.02, dt);
        if (Math.abs(e.kb) < 5) e.kb = 0;
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        if (this.moveX(e, (e.vx + e.kb) * dt)) { e.dir *= -1; if (e.state === 'charge') { e.state = 'rest'; e.t = 0; } }
        this.moveY(e, e.vy * dt);
        const lava = this.tileAt(Math.floor((e.x + e.w / 2) / T), Math.floor((e.y + e.h - 2) / T)) === LAVA;
        if (e.y > H + 60 || lava) { e.dead = true; continue; }
      } else if (!e.boss) e.kb *= Math.pow(0.05, dt);

      // 플레이어와 접촉: 밟기 / 대쉬 공격 / 피해
      if (e.hidden || !overlap(p, e)) continue;
      const stompable = !e.noStomp && !e.spiky && !(e.type === 'mech' && e.state !== 'grounded');
      if (stompable && p.vy > 60 && p.y + p.h - e.y < 14) {
        p.vy = -430; p.airJumps = 0; p.airDash = false;
        this.hitEnemy(e, 2 * this.S.stomp, 0, 0, { stomp: true });
        this.sound('bounce');
        if (this.S.stomp > 1) {
          this.burst(p.x + p.w / 2, p.y + p.h, { color: '#fde68a', count: 14, speed: 160 });
          for (const o of this.enemies) if (o !== e && !o.dead && Math.abs(o.x - e.x) < 70 && Math.abs(o.y - e.y) < 40) this.hitEnemy(o, 2, Math.sign(o.x - e.x), 200, { stomp: true });
        }
      } else if (p.dashT > 0) {
        if (this.S.dashHit && !p.dashHits.has(e)) { p.dashHits.add(e); this.hitEnemy(e, 3, p.face, 200, { heavy: true }); }
      } else this.hurtPlayer(1, e.x + e.w / 2);
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.boss);
  }

  updateProjectiles(dt) {
    const p = this.p;
    for (const b of this.bullets) {
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'bolt' && isSolid(this.tileAt(Math.floor(b.x / T), Math.floor(b.y / T)))) { b.life = 0; this.burst(b.x, b.y, { color: '#67e8f9', count: 4, speed: 60, life: 0.2 }); continue; }
      const box = b.kind === 'wave' ? { x: b.x - 10, y: b.y, w: 20, h: 26 } : { x: b.x - 4, y: b.y - 3, w: 8, h: 6 };
      for (const e of this.enemies) {
        if (e.dead || e.hidden || b.hit.has(e) || !overlap(box, e)) continue;
        b.hit.add(e);
        this.hitEnemy(e, b.dmg, Math.sign(b.vx), b.kind === 'wave' ? 120 : WEAPONS.blaster.kb);
        if (!b.pierce) { b.life = 0; break; }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // 적 탄 종류: bullet(직선) arc(포물선) wave(바닥 충격파) bomb(폭탄→폭발) blast(폭발) beam(예고 후 광선)
    const spawned = [];
    for (const s of this.shots) {
      s.life -= dt;
      if (s.kind === 'beam') {
        s.warn -= dt;
        if (s.warn <= 0 && overlap(p, s)) this.hurtPlayer(1, s.x + s.w / 2);
        continue;
      }
      if (s.kind === 'blast') {
        if (!s.hitDone && Math.hypot(p.x + p.w / 2 - s.x, p.y + p.h / 2 - s.y) < s.r + 8) { s.hitDone = true; this.hurtPlayer(1, s.x); }
        continue;
      }
      if (s.g) s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const t = this.tileAt(Math.floor(s.x / T), Math.floor(s.y / T));
      if (s.kind !== 'wave' && isSolid(t)) {
        s.life = 0;
        if (s.kind === 'bomb') {
          spawned.push({ kind: 'blast', x: s.x, y: s.y - 6, r: 34, life: 0.3, max: 0.3 });
          this.sound('drop'); this.shake(4, 0.15);
          this.burst(s.x, s.y, { color: '#fb923c', count: 18, speed: 180, life: 0.4 });
        } else this.burst(s.x, s.y, { color: s.color ?? '#f87171', count: 5, speed: 80, life: 0.25 });
        continue;
      }
      if (s.kind === 'wave' && (s.x < 2 * T || s.x > this.levelW - 2 * T)) { s.life = 0; continue; }
      const box = s.kind === 'wave' ? { x: s.x - s.w / 2, y: s.y, w: s.w, h: s.h } : { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      if (overlap(p, box)) { this.hurtPlayer(1, s.x); if (s.kind !== 'wave') s.life = 0; }
    }
    this.shots = this.shots.filter((s) => s.life > 0).concat(spawned);
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
    const cam = this.camera.x;
    drawBackground(this, ctx, cam);

    ctx.save();
    ctx.translate(-Math.round(cam), 0);
    drawTiles(this, ctx, cam);
    drawProps(this, ctx);

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
    for (const e of this.enemies) if (!e.dead) drawEnemy(this, ctx, e);
    this.drawPlayer(ctx);
    this.drawShots(ctx);
    ctx.restore();

    drawDarkness(this, ctx, this.p.x + this.p.w / 2 - cam, this.p.y + this.p.h / 2);
    this.drawWind(ctx);
    this.drawHud(ctx);
    if (this.choosing) this.drawCards(ctx);
  }

  drawShots(ctx) {
    for (const b of this.bullets) {
      if (b.kind === 'wave') {
        ctx.strokeStyle = 'rgba(224,242,254,.85)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x - Math.sign(b.vx) * 8, b.y + 13, 14, -Math.PI / 2.4, Math.PI / 2.4, b.vx < 0); ctx.stroke();
      } else { ctx.fillStyle = '#67e8f9'; roundRect(ctx, b.x - 5, b.y - 2, 10, 4, 2); }
    }
    const now = performance.now() / 1000;
    for (const s of this.shots) {
      if (s.kind === 'wave') {
        ctx.fillStyle = s.color ?? '#fb923c';
        ctx.beginPath(); ctx.moveTo(s.x - s.w / 2, s.y + s.h); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x + s.w / 2, s.y + s.h); ctx.fill();
      } else if (s.kind === 'beam') {
        if (s.warn > 0) { // 예고선
          ctx.globalAlpha = 0.35 + Math.sin(now * 30) * 0.15;
          ctx.fillStyle = s.color;
          if (s.w < s.h) ctx.fillRect(s.x + s.w / 2 - 1, s.y, 2, s.h); else ctx.fillRect(s.x, s.y + s.h / 2 - 1, s.w, 2);
        } else {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = '#fff';
          if (s.w < s.h) ctx.fillRect(s.x + s.w / 2 - 2, s.y, 4, s.h); else ctx.fillRect(s.x, s.y + s.h / 2 - 1, s.w, 2);
        }
        ctx.globalAlpha = 1;
      } else if (s.kind === 'blast') {
        ctx.globalAlpha = Math.max(0, s.life / s.max);
        ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1.2 - s.life / s.max * 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (s.kind === 'bomb') {
        ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.floor(now * 10) % 2 ? '#ef4444' : '#fde047'; ctx.fillRect(s.x - 1, s.y - s.r - 4, 2, 4);
      } else {
        ctx.fillStyle = s.color ?? '#f87171';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        if (s.fire) { ctx.fillStyle = 'rgba(253,224,71,.6)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }

  drawWind(ctx) {
    const w = this.wind;
    if (!w || w.phase === 'calm') return;
    const now = performance.now() / 1000;
    if (w.phase === 'warn') {
      ctx.globalAlpha = 0.5 + Math.sin(now * 20) * 0.3;
      ctx.fillStyle = '#fde68a'; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(w.dir > 0 ? '바람이 분다 ▶▶' : '◀◀ 바람이 분다', W / 2, 84); ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
      return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const y = (i * 37) % H, len = 30 + (i % 4) * 12;
      const x = (((i * 131 + now * 500 * w.dir) % (W + 100)) + W + 100) % (W + 100) - 50;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - w.dir * len, y); ctx.stroke();
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
      ctx.fillText(`${b.name}${b.phase2 ? ' (분노)' : ''}`, W / 2, 30); ctx.textAlign = 'start';
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
