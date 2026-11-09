import * as THREE from '../vendor/three.module.min.js';
import { GameBase, roundRect } from '../engine.js';
import { sfx } from '../sfx.js';
import { CHARACTERS, KARTS, TRACKS, ITEMS, combineStats, rollItem } from './kart/data.js';
import { Track } from './kart/track.js';
import { buildRacer, buildItemBox, buildItemMesh, Sparks } from './kart/models.js';
import { buildFeatures, animateFeatures, updateHazards, onIce } from './kart/features.js';

// 카트 레이스 (3D, three.js)
// - 캐릭터 8 · 카트 4 · 트랙 5, 모드: 레이스 / 그랑프리(5경기) / 타임 어택(고스트)
// - 드리프트(점프 후 방향키) → 불꽃 색(파랑→주황→보라)에 따라 미니 터보
// - 아이템 박스: 순위가 낮을수록 강한 아이템, 출발 직전 가속 = 로켓 스타트
const W = 640, H = 360;
const HOP_V = 4.4, GRAV = 18;
const DRIFT_LV = [0.6, 1.2, 1.9];             // 드리프트 단계 시간
const DRIFT_BOOST = [0, 0.7, 1.1, 1.6];       // 단계별 미니 터보 시간
const TURBO_NAMES = ['', '미니 터보!', '슈퍼 터보!', '울트라 터보!'];
const SPARK_COLORS = [0xffffff, 0x60a5fa, 0xfb923c, 0xc084fc];
const RANK_POINTS = [1000, 800, 650, 520, 420, 320, 220, 120];
const DIFF = { easy: { skill: 0.9, rubber: 0.8, items: 0.7 }, normal: { skill: 0.985, rubber: 1.2, items: 1.2 }, hard: { skill: 1.04, rubber: 1.5, items: 1.6 } };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r2 = (v) => Math.round(v * 100) / 100;
const SEND_RATE = 1 / 15; // 멀티플레이 위치 전송 주기
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const MODES = [
  { id: 'race', name: '🏁 레이스', desc: '8명이 겨루는 한 판' },
  { id: 'gp', name: '🏆 그랑프리', desc: `${TRACKS.length}개 트랙 연속 · 순위 점수 합계로 우승` },
  { id: 'tt', name: '⏱ 타임 어택', desc: '혼자 달리며 기록 도전 · 내 최고 기록 고스트' },
];
const SEL_Y = 50, SEL_STEP = 58, SEL_H = 52; // 선택 화면 항목 배치
const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
const GHOST_HZ = 10; // 고스트 기록 간격 (초당)
const ghostKey = (track, laps) => `miniigame:kart-ghost:${track}:${laps}`;
function loadGhost(track, laps) { try { return JSON.parse(localStorage.getItem(ghostKey(track, laps))); } catch { return null; } }
function saveGhost(track, laps, g) { try { localStorage.setItem(ghostKey(track, laps), JSON.stringify(g)); } catch { /* 저장 공간 부족 등 */ } }

// ---- WebGL 렌더러 하나를 돌려 씀 ----
const rendererPool = [];
function takeRenderer(owner) {
  const free = rendererPool.find((r) => !r.owner && !r.getContext().isContextLost());
  if (free) { free.owner = owner; return free; }
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.owner = owner;
    rendererPool.push(r);
    return r;
  } catch { return null; }
}
function releaseRenderer(r, owner) {
  if (r.owner !== owner) return;
  r.owner = null;
  r.renderLists.dispose();
  if (r.getContext().isContextLost()) { rendererPool.splice(rendererPool.indexOf(r), 1); r.dispose(); }
}

export default class Kart extends GameBase {
  static meta = {
    id: 'kart',
    title: '카트 레이스',
    description: '캐릭터와 카트를 골라 8명이 겨루는 3D 레이스! 그랑프리·타임 어택(고스트) 모드. 드리프트 미니 터보, 점프대 트릭, 글라이더, 지름길, 아이템으로 역전을 노리세요.',
    controls: '↑ 가속 · ↓ 브레이크 · ←→ 조향 · Space/Shift 드리프트(누른 채 꺾기, 떼면 미니 터보) · 점프대에서 Space = 트릭 · X/E 아이템',
    touchControls: '자동 가속 · ◀▶ 조향 · 드리프트 버튼(누른 채 꺾기) · 아이템 · 브레이크 · 📱 가로 화면 추천',
  };
  static bindings = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    action: ['Space', 'ShiftLeft'], item: ['KeyX', 'KeyE'],
  };
  static actionLabels = { up: '가속', down: '브레이크 / 후진', left: '왼쪽', right: '오른쪽', action: '점프·드리프트 / 결정', item: '아이템 사용' };
  static settings = [
    { id: 'difficulty', label: '난이도 (상대 실력)', type: 'select', default: 'normal', options: [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']] },
    { id: 'laps', label: '랩 수', type: 'range', min: 1, max: 5, default: 3, unit: '랩' },
    { id: 'autoAccel', label: '자동 가속', type: 'select', default: 'touch', options: [['touch', '모바일만'], ['always', '항상'], ['never', '끄기']] },
    { id: 'camera', label: '카메라 거리', type: 'select', default: 'normal', options: [['near', '가깝게'], ['normal', '보통'], ['far', '멀게']] },
    { id: 'quality', label: '그래픽 품질', type: 'select', default: 'normal', options: [['low', '낮음 (빠름)'], ['normal', '보통'], ['high', '높음']], tip: '느리면 낮음으로. 다음 트랙 로드부터 장식 개수 적용' },
  ];
  static pad = {
    left: 'lr',
    buttons: [{ action: 'down', label: '브레이크' }, { action: 'item', label: '아이템' }, { action: 'action', label: '드리프트', primary: true, wide: true }],
  };
  static gestures = { tap: 'tap' };
  static mouseClick = 'tap';

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
    this.clearColor = null; // 2D 캔버스는 투명 (HUD만), 아래에 3D 캔버스
    this.$screen.addEventListener('pointerdown', () => { this.pointerStamp = performance.now(); }); // 엔진의 탭 처리(pointerup)보다 먼저 기록
    this.sel = { mode: 0, char: 0, kart: 0, track: 0, row: 1 };
    this.setup3D();
  }

  // ---------------- 3D 기본 구성 ----------------
  setup3D() {
    // 렌더러(WebGL 컨텍스트)는 하나를 계속 다시 씀: 다른 사이트에서 게임을 여러 번 붙였다 떼어도
    // 컨텍스트가 쌓이지 않음 (브라우저는 보통 16개가 넘으면 오래된 것부터 꺼서 화면이 깨짐)
    this.renderer = takeRenderer(this);
    if (!this.renderer) { this.noGL = true; return; }
    const cv = this.renderer.domElement;
    cv.className = 'mg-3d';
    this.$screen.insertBefore(cv, this.canvas);
    // 그래픽 장치가 잠깐 끊기면(모바일 탭 전환·드라이버 재시작) 다시 연결될 때까지 기다렸다 복구
    this._onLost = (e) => { e.preventDefault(); this.glLost = performance.now(); };
    this._onRestored = () => { this.glLost = 0; this.ratio = undefined; const r = this.$screen.getBoundingClientRect(); if (r.width) this.onResize(r.width, r.height); };
    cv.addEventListener('webglcontextlost', this._onLost);
    cv.addEventListener('webglcontextrestored', this._onRestored);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    // near 를 너무 작게 하면 먼 곳의 깊이 정밀도가 떨어져 도로·연석이 깜빡이며 깨져 보임 → 0.5
    this.camera3 = new THREE.PerspectiveCamera(68, W / H, 0.5, 1500);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(80, 140, 40);
    this.scene.add(this.hemi, this.sun);
    this.sparks = new Sparks(500);
    this.scene.add(this.sparks.points);
    this.dyn = new THREE.Group(); // 레이서·아이템
    this.scene.add(this.dyn);
    const r = this.$screen.getBoundingClientRect();
    if (r.width) this.onResize(r.width, r.height);
  }

  onResize(w, h) {
    if (!this.renderer) return;
    const q = { low: 1, normal: 1.5, high: 2 }[this.cfg?.quality ?? 'normal'] ?? 1.5;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, q);
    this.ratio = Math.min(this.ratio ?? this.maxRatio, this.maxRatio);
    this.viewW = w; this.viewH = h;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
  }

  onSettingsChange(id) { if (id === 'quality') { const r = this.$screen.getBoundingClientRect(); this.onResize(r.width, r.height); } }

  onDestroy() {
    if (!this.renderer) return;
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    if (this.scene.background?.dispose) this.scene.background.dispose();
    const cv = this.renderer.domElement;
    cv.removeEventListener('webglcontextlost', this._onLost);
    cv.removeEventListener('webglcontextrestored', this._onRestored);
    cv.remove();
    releaseRenderer(this.renderer, this); // 지우지 않고 다음 카트 게임이 다시 씀
    this.renderer = null;
  }

  loadTrack(idx) {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    }
    const def = TRACKS[idx];
    this.track = new Track(def);
    const q = { low: 0.45, normal: 1, high: 1.6 }[this.cfg.quality] ?? 1;
    this.trackGroup = this.track.build(q);
    this.features = buildFeatures(this.track, this.trackGroup, q); // 랜드마크·장애물·날씨
    this.scene.add(this.trackGroup);
    this.trackIdx = idx;
    const th = def.theme;
    // 하늘: 위는 진하고 지평선은 안개색으로 (화면 기준 세로 그라데이션)
    this.scene.background?.dispose?.();
    const sc = document.createElement('canvas'); sc.width = 2; sc.height = 256;
    const sx = sc.getContext('2d'), gr = sx.createLinearGradient(0, 0, 0, 256);
    const top = new THREE.Color(th.sky).multiplyScalar(th.night ? 0.6 : 0.82), mid = new THREE.Color(th.sky), hor = new THREE.Color(th.fog);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(0.35, '#' + mid.getHexString()); gr.addColorStop(0.62, '#' + hor.getHexString()); gr.addColorStop(1, '#' + hor.getHexString());
    sx.fillStyle = gr; sx.fillRect(0, 0, 2, 256);
    const bg = new THREE.CanvasTexture(sc); bg.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(th.fog, 60, th.night ? 260 : 380);
    this.hemi.intensity = th.night ? 0.55 : 1.1;
    this.sun.intensity = th.night ? 0.5 : 1.6;
    this.sun.color.setHex(th.sun);
    // 미니맵 경로 (2D)
    const b = this.track.bounds, s = Math.min(104 / (b.maxX - b.minX), 104 / (b.maxZ - b.minZ));
    this.mini = { s, ox: (b.minX + b.maxX) / 2, oz: (b.minZ + b.maxZ) / 2 };
  }

  clearDyn() {
    for (const o of [...this.dyn.children]) this.dyn.remove(o);
  }

  // ---------------- 멀티플레이 ----------------
  static multiplayer = { min: 2, max: 8, label: '멀티 레이스' };

  lobbyConfig() {
    return {
      settings: [
        { id: 'track', label: '트랙', type: 'select', default: 0, options: TRACKS.map((t, i) => [i, `${t.emoji} ${t.name}`]) },
        { id: 'laps', label: '랩 수', type: 'range', min: 1, max: 5, default: 3 },
        { id: 'ai', label: '빈자리 AI로 채우기', type: 'toggle', default: true },
      ],
      info: [
        { id: 'char', label: '캐릭터', type: 'select', default: 0, options: CHARACTERS.map((c, i) => [i, `${c.emoji} ${c.name}`]) },
        { id: 'kart', label: '카트', type: 'select', default: 0, options: KARTS.map((k, i) => [i, k.name]) },
      ],
    };
  }

  describeInfo(info) {
    const c = CHARACTERS[info?.char ?? 0], k = KARTS[info?.kart ?? 0];
    return c && k ? `${c.emoji} ${k.name} ` : '';
  }

  startMulti(net, start) {
    if (this.noGL) return;
    this.leaveMulti();
    this.multi = { net, me: net.id, isHost: net.isHost, seed: start.seed, settings: start.settings ?? {}, players: start.players, seq: 0, bumpAt: {} };
    this.offNet = [
      net.on('msg', (from, d) => this.onNet(from, d)),
      net.on('left', (id) => this.playerLeft(id)),
      net.on('room', (room) => { // 방장이 나가면 내가 AI를 이어받음
        if (this.multi && room && room.host === this.multi.me && !this.multi.isHost) {
          this.multi.isHost = true;
          for (const r of this.racers) if (!r.human) r.remote = false;
        }
      }),
    ];
    this.noAutoPause = true;
    this.sel.track = clamp(Number(this.multi.settings.track ?? 0), 0, TRACKS.length - 1);
    this.pendingMulti = true;
    this.start();
  }

  leaveMulti() {
    this.offNet?.forEach((off) => off());
    this.offNet = null;
    this.multi = null;
    this.noAutoPause = false;
  }

  onNetClosed() { if (this.multi && this.phase !== 'done') this.endRace(); }
  restart() { if (this.multi) return; super.restart(); }

  byId(id) { return this.racers.find((r) => r.id === id); }

  onNet(from, d) {
    if (!this.multi || !d) return;
    switch (d.k) {
      case 'st':
        for (const a of d.r) {
          const r = this.byId(a[0]);
          if (!r || !r.remote) continue;
          r.net = { x: a[1], y: a[2], z: a[3], h: a[4], speed: a[5], slip: a[6], dl: a[7], gl: a[8], b: a[9], sp: a[10], sh: a[11], tr: a[15], dd: a[16] };
          r.netAt = performance.now();
          r.progress = a[12]; r.lap = a[13];
          if (a[14] && !r.finished) { r.finished = true; r.finishTime = a[14]; }
        }
        break;
      case 'obj': this.spawnNetObj(d.o); break;
      case 'hit': {
        const o = this.objs.find((x) => x.id === d.id);
        if (o) { o.life = 0; if (o.type !== 'oil') this.explode(o); }
        break;
      }
      case 'bump': { const r = this.byId(d.to); if (r && !r.remote) this.hitRacer(r, 'turbo'); break; }
      case 'box': { const b = this.boxes[d.i]; if (b) { b.respawn = 2.2; b.mesh.visible = false; } break; }
    }
  }

  playerLeft(id) {
    const r = this.byId(id);
    if (!r || !this.multi) return;
    this.dyn.remove(r.model.root);
    this.racers = this.racers.filter((x) => x !== r);
    this.msg = { text: `${r.name} 님이 나갔어요`, t: 1.5 };
  }

  encodeRacer(r) {
    return [r.id, r2(r.x), r2(r.y), r2(r.z), r2(r.h), Math.round(r.speed * 10) / 10, r2(r.slip), r.drifting ? this.driftLevel(r) + 1 : 0,
      r.gliding ? 1 : 0, r.boostT > 0 ? 1 : 0, r.spinT > 0 ? 1 : 0, (r.shieldT > 0 ? 1 : 0) | (r.invT > 0 ? 2 : 0),
      Math.round(r.progress * 10) / 10, r.lap, r.finished ? r2(r.finishTime) : 0, r.trick ? 1 : 0, r.driftDir];
  }

  netTick(dt) {
    const m = this.multi;
    m.sendT = (m.sendT ?? 0) + dt;
    if (m.sendT >= SEND_RATE) this.sendState();
  }

  sendState() {
    const m = this.multi;
    if (!m) return;
    m.sendT = 0;
    m.net.relay({ k: 'st', r: this.racers.filter((r) => !r.remote).map((r) => this.encodeRacer(r)) });
  }

  /** 다른 사람 카트: 받은 위치로 부드럽게 따라가기 (받은 뒤 지난 시간만큼 앞으로 예측) */
  remoteStep(r, dt) {
    const n = r.net;
    if (n) {
      const age = Math.min(0.25, (performance.now() - r.netAt) / 1000);
      const px = n.x + Math.sin(n.h + n.slip) * n.speed * age, pz = n.z + Math.cos(n.h + n.slip) * n.speed * age;
      if (Math.hypot(px - r.x, pz - r.z) > 15) { r.x = px; r.z = pz; r.y = n.y; r.h = n.h; } // 복귀 등 순간이동
      const k = Math.min(1, dt * 12);
      r.x += (px - r.x) * k; r.y += (n.y - r.y) * k; r.z += (pz - r.z) * k;
      r.h += wrapAngle(n.h - r.h) * k;
      r.speed = n.speed; r.slip = n.slip; r.driftDir = n.dd;
      r.drifting = n.dl > 0; r.driftT = n.dl > 1 ? DRIFT_LV[n.dl - 2] + 0.01 : 0;
      r.gliding = !!n.gl; r.grounded = !n.gl;
      r.boostT = n.b ? 0.3 : 0;
      if (n.sp) { r.spinT = 0.2; r.spinA += dt * 14; } else r.spinT = 0;
      r.shieldT = n.sh & 1 ? 1 : 0; r.invT = n.sh & 2 ? 1 : 0;
      r.trick = !!n.tr; r.trickA = r.trick ? r.trickA + dt * 16 : 0;
      r.idx = this.track.nearest(r.x, r.z, r.idx).i;
    }
    this.syncModel(r, this.driftLevel(r), dt);
  }

  spawnNetObj(d) {
    if (!d || this.objs.some((o) => o.id === d.id)) return;
    const mesh = buildItemMesh(d.type);
    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.y = d.h ?? 0;
    this.dyn.add(mesh);
    const owner = this.byId(d.owner) ?? { id: d.owner };
    this.objs.push({ ...d, owner, target: d.target ? this.byId(d.target) : null, mesh, idx: this.track.nearest(d.x, d.z).i, bounces: 0 });
  }

  explode(o) {
    for (let i = 0; i < 26; i++) this.sparks.emit(o.x, o.y + 0.8, o.z, i % 2 ? 0xf97316 : 0xfde047, (Math.random() - 0.5) * 12, Math.random() * 7, (Math.random() - 0.5) * 12, 0.6);
  }

  // ---------------- 진행 단계 ----------------
  init() {
    if (this.noGL) return;
    if (this.multi && this.pendingMulti) {
      this.pendingMulti = false;
      this.objs = []; this.boxes = []; this.msg = null;
      this.clearDyn();
      if (this.trackIdx !== this.sel.track || !this.track) this.loadTrack(this.sel.track);
      this.startRace();
      return;
    }
    if (this.multi) this.leaveMulti();
    this.phase = 'select';
    this.setMusic('kart');
    this.gp = null;
    this.mode = 'race';
    this.setRecord('kart');
    this.racers = [];
    this.objs = [];
    this.boxes = [];
    this.msg = null;
    this.clearDyn();
    if (this.trackIdx !== this.sel.track || !this.track) this.loadTrack(this.sel.track);
    this.buildPreview();
  }

  buildPreview() {
    if (this.preview) this.dyn.remove(this.preview.root);
    this.preview = buildRacer(CHARACTERS[this.sel.char], KARTS[this.sel.kart]);
    const s = this.track.samples[0];
    this.preview.root.position.set(s.x, s.y, s.z);
    this.dyn.add(this.preview.root);
  }

  startRace() {
    this.setMusic(`kart-${this.track.def.id}`); // 트랙마다 전용 곡
    this.setMusicTempo(1);
    this.sound('start');
    this.clearDyn();
    this.preview = null;
    const tr = this.track, mp = this.multi;
    const laps = mp ? clamp(Number(mp.settings.laps ?? 3), 1, 5) : this.cfg.laps;
    const mode = mp ? 'race' : this.mode;
    const diff = DIFF[mp ? 'normal' : this.cfg.difficulty] ?? DIFF.normal;
    this.diff = diff;
    let roster;
    if (mp) {
      // 멀티: 사람(로비에서 고른 캐릭터·카트) 먼저, 빈자리는 AI (모든 사람이 같은 AI 구성을 보도록 시드 사용)
      const rnd = seededRandom(mp.seed);
      const idx = (v, n) => clamp(Math.floor(Number(v) || 0), 0, n - 1);
      roster = mp.players.map((p) => ({ id: p.id, name: p.name, ci: idx(p.info?.char, CHARACTERS.length), ki: idx(p.info?.kart, KARTS.length), human: true }));
      if (mp.settings.ai !== false) {
        const used = new Set(roster.map((x) => x.ci));
        const free = CHARACTERS.map((_, i) => i).filter((i) => !used.has(i));
        for (let k = 0; roster.length < 8; k++) {
          const ci = free.length ? free.shift() : k % CHARACTERS.length;
          roster.push({ id: `ai${k}`, name: CHARACTERS[ci].name, ci, ki: Math.floor(rnd() * KARTS.length), human: false });
        }
      }
    } else if (mode === 'tt') {
      roster = [{ id: 'me', name: CHARACTERS[this.sel.char].name, ci: this.sel.char, ki: this.sel.kart, human: true }];
    } else if (mode === 'gp') {
      // 그랑프리: 같은 상대로 5경기, 점수가 높을수록 뒤에서 출발
      roster = [...this.gp.roster].sort((a, b) => a.pts - b.pts || a.start - b.start);
    } else {
      // 혼자: 상대는 나머지 캐릭터, 카트는 무작위, 플레이어는 6번째 출발
      const others = CHARACTERS.map((_, i) => i).filter((i) => i !== this.sel.char);
      roster = [...others.slice(0, 5), this.sel.char, ...others.slice(5)].map((ci, k) => (ci === this.sel.char
        ? { id: 'me', name: CHARACTERS[ci].name, ci, ki: this.sel.kart, human: true }
        : { id: `ai${k}`, name: CHARACTERS[ci].name, ci, ki: Math.floor(Math.random() * KARTS.length), human: false }));
    }
    this.racers = roster.map((ro, slot) => {
      const ci = ro.ci;
      const isPlayer = mp ? ro.id === mp.me : ro.id === 'me';
      const remote = !!mp && (ro.human ? !isPlayer : !mp.isHost);
      const ch = CHARACTERS[ci], kart = KARTS[ro.ki];
      const back = 7 + slot * 4.2, p = tr.at(tr.length - back);
      const y0 = p.y;
      const side = slot % 2 ? -1 : 1;
      const model = buildRacer(ch, kart);
      this.dyn.add(model.root);
      return {
        id: ro.id, name: ro.name, human: ro.human, remote, ch, kart, isPlayer, model, stats: combineStats(ch, kart),
        x: p.x + p.nx * tr.hw * 0.42 * side, z: p.z + p.nz * tr.hw * 0.42 * side, h: Math.atan2(p.tx, p.tz),
        speed: 0, y: y0, vy: 0, slip: 0, drifting: false, driftDir: 0, driftT: 0, boostT: 0, spinT: 0, spinA: 0, shieldT: 0, invT: 0,
        item: null, uses: 0, roll: 0, idx: p.i, lastD: tr.length - back, progress: -back, finished: false, finishTime: 0,
        lap: 1, lapStart: 0, lapTimes: [], rank: slot + 1, padCd: 0, startCharge: null,
        lane: (Math.random() - 0.5) * 1.2, laneT: 0, aiItemT: 2 + Math.random() * 3, aiDriftT: 0, skill: diff.skill * (0.97 + Math.random() * 0.06),
        stall: 0, wrongT: 0, hopReq: false, grounded: true, gliding: false, airT: 0, canTrick: false, trick: false, trickA: 0,
        steerS: 0, surface: 1, zone: 'main', offT: 0, scIdx: [], scPlan: -1, camH: Math.atan2(p.tx, p.tz), safeD: tr.length - back, respawnT: 0, pitch: 0,
      };
    });
    this.player = this.racers.find((r) => r.isPlayer);
    // 타임 어택: 니트로 3개로 출발, 아이템 박스 없음, 내 최고 기록 고스트와 경쟁
    this.ghost = null; this.ghostRec = null; this.split = null;
    if (mode === 'tt') {
      this.player.item = 'triple'; this.player.uses = 3;
      this.ghostRec = { ci: this.sel.char, ki: this.sel.kart, splits: [], d: [] };
      const g = loadGhost(this.trackIdx, laps);
      if (g?.d?.length) {
        const model = buildRacer(CHARACTERS[g.ci] ?? CHARACTERS[0], KARTS[g.ki] ?? KARTS[0]);
        model.root.traverse((o) => {
          if (!o.material) return;
          o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.4; c.depthWrite = false; return c; });
          if (o.material.length === 1) o.material = o.material[0];
        });
        model.shield.visible = false; model.glider.visible = false;
        for (const f of model.flames) f.visible = false;
        this.dyn.add(model.root);
        this.ghost = { ...g, model };
        this.placeGhost(0);
      }
    }
    for (const r of this.racers) this.syncModel(r, 0);
    // 아이템 박스
    this.boxes = mode === 'tt' ? [] : tr.boxSpots.map((s) => { const m = buildItemBox(); m.position.set(s.x, s.y + 1.1, s.z); this.dyn.add(m); return { ...s, mesh: m, respawn: 0 }; });
    this.objs = [];
    this.laps = laps;
    this.phase = 'countdown';
    this.countT = 3.6;
    this.raceT = 0;
    this.lastCount = 4;
    this.camPos = null;
    this.results = null;
  }

  // ---------------- 입력 ----------------
  onAction(action, repeat) {
    if (this.noGL) return;
    if (this.phase === 'select') return this.selectInput(action, repeat);
    if (repeat) return;
    if (this.phase === 'gpwait') {
      if ((action === 'action' || action === 'tap') && performance.now() - this.gpWaitAt > 600) this.nextGpRace();
      return;
    }
    const p = this.player;
    if (!p) return;
    if (action === 'action') p.hopReq = true;
    else if (action === 'item') this.useItem(p);
  }

  selectInput(action, repeat) {
    const s = this.sel;
    const counts = [MODES.length, CHARACTERS.length, KARTS.length, TRACKS.length];
    const change = (d) => {
      if (s.row > 3) return;
      if (s.row === 3 && MODES[s.mode].id === 'gp') return; // 그랑프리는 트랙 순서 고정
      const key = ['mode', 'char', 'kart', 'track'][s.row];
      s[key] = (s[key] + d + counts[s.row]) % counts[s.row];
      this.sound('move');
      if (s.row === 3) this.loadTrack(s.track);
      this.buildPreview();
    };
    if (action === 'tap') {
      if (performance.now() - (this.pointerStamp ?? 0) > 700) return;
      const x = this.pointer.x, y = this.pointer.y;
      if (x >= 24 && x <= 292 && y >= 286 && y <= 334) return this.beginMode();
      for (let r = 0; r < 4; r++) {
        const ry = SEL_Y + r * SEL_STEP;
        if (y < ry || y > ry + SEL_H) continue;
        s.row = r;
        if (x >= 18 && x <= 62) change(-1);
        else if (x >= 254 && x <= 298) change(1);
        return;
      }
      return;
    }
    if (repeat && action !== 'left' && action !== 'right') return;
    if (action === 'up') s.row = (s.row + 4) % 5;
    else if (action === 'down' || action === 'item') s.row = (s.row + 1) % 5;
    else if (action === 'left') change(-1);
    else if (action === 'right') change(1);
    else if (action === 'action') this.beginMode();
  }

  /** 선택 화면에서 출발: 모드별 준비 */
  beginMode() {
    const s = this.sel;
    this.mode = MODES[s.mode].id;
    if (this.mode === 'gp') {
      // 상대 7명(나머지 캐릭터, 카트 무작위)을 5경기 동안 유지
      const others = CHARACTERS.map((_, i) => i).filter((i) => i !== s.char);
      const roster = [...others.slice(0, 5), s.char, ...others.slice(5)].map((ci, k) => (ci === s.char
        ? { id: 'me', name: CHARACTERS[ci].name, ci, ki: s.kart, human: true }
        : { id: `ai${k}`, name: CHARACTERS[ci].name, ci, ki: Math.floor(Math.random() * KARTS.length), human: false }));
      roster.forEach((e, i) => { e.pts = 0; e.start = i; });
      this.gp = { race: 0, roster, history: [], last: null };
      this.setRecord('kart-gp');
      if (this.trackIdx !== 0) this.loadTrack(0);
    } else {
      this.gp = null;
      if (this.mode === 'tt') this.setRecord(`kart-tt-${this.trackIdx}-${this.cfg.laps}`, { lower: true, fmt: (v) => fmt(v / 100) });
      else this.setRecord('kart');
    }
    this.startRace();
  }

  nextGpRace() {
    const gp = this.gp;
    gp.race++;
    this.objs = []; this.boxes = []; this.msg = null;
    this.loadTrack(gp.race);
    this.startRace();
  }

  /** 고스트를 기록된 시각 t 의 위치로 (기록 사이는 보간) */
  placeGhost(t) {
    const g = this.ghost, d = g.d, n = d.length / 4;
    const f = clamp(t * GHOST_HZ, 0, n - 1), i = Math.min(Math.floor(f), n - 2), u = f - i;
    const m = g.model.root;
    if (i < 0) { m.position.set(d[0], d[1], d[2]); m.rotation.y = d[3]; return; }
    const a = i * 4, b = a + 4;
    m.position.set(d[a] + (d[b] - d[a]) * u, d[a + 1] + (d[b + 1] - d[a + 1]) * u, d[a + 2] + (d[b + 2] - d[a + 2]) * u);
    m.rotation.y = d[a + 3] + wrapAngle(d[b + 3] - d[a + 3]) * u;
    for (const w of g.model.wheels) w.rotation.x += 0.4;
  }

  /** 엔진 소리: 속도에 따라 음높이, 드리프트·부스트에 따라 음색 */
  engineSound() {
    const p = this.player;
    if (!p || this.phase === 'select' || this.phase === 'done' || this.phase === 'gpwait') return;
    const top = p.stats.maxSpeed ?? 30;
    const sp = clamp(Math.abs(p.speed) / top, 0, 1.4);
    const rev = this.phase === 'countdown' && this.isDown('up') ? 0.5 + Math.sin(performance.now() / 90) * 0.1 : 0;
    sfx.engine(48 + (sp + rev) * 95 + (p.boostT > 0 ? 18 : 0), p.finished ? 0.015 : 0.03, p.drifting || p.boostT > 0 ? 1400 : 700);
  }

  /** 그랑프리 중간 순위표 */
  drawGpTable(ctx) {
    const gp = this.gp, table = [...gp.roster].sort((a, b) => b.pts - a.pts);
    const lastPts = new Map(gp.last.map((x) => [x.e, x.pts]));
    const x0 = W / 2 - 170, y0 = 46;
    ctx.fillStyle = 'rgba(10,12,20,.82)'; roundRect(ctx, x0, y0, 340, 72 + table.length * 26, 14);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillText(`🏆 그랑프리 ${gp.race + 1}/${TRACKS.length} 결과`, W / 2, y0 + 28);
    table.forEach((e, i) => {
      const y = y0 + 56 + i * 26, me = e.id === 'me';
      if (me) { ctx.fillStyle = 'rgba(250,204,21,.22)'; ctx.fillRect(x0 + 10, y - 17, 320, 24); }
      ctx.textAlign = 'start'; ctx.fillStyle = me ? '#fde047' : '#e2e8f0'; ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(`${i + 1}. ${CHARACTERS[e.ci].emoji} ${e.name}`, x0 + 20, y);
      ctx.textAlign = 'right'; ctx.fillStyle = '#4ade80'; ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillText(`+${lastPts.get(e) ?? 0}`, x0 + 260, y);
      ctx.fillStyle = '#fff'; ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillText(`${e.pts}점`, x0 + 322, y);
    });
    const next = TRACKS[gp.race + 1];
    ctx.textAlign = 'center'; ctx.fillStyle = '#93c5fd'; ctx.font = '800 13px system-ui, sans-serif';
    if (Math.floor(performance.now() / 500) % 2 === 0 || performance.now() - this.gpWaitAt < 600)
      ctx.fillText(`다음: ${next.emoji} ${next.name} — ${this.touchMode ? '탭' : 'Space'}해서 출발`, W / 2, y0 + 62 + table.length * 26);
    ctx.textAlign = 'start';
  }

  playerInput() {
    const p = this.player;
    const auto = this.cfg.autoAccel === 'always' || (this.cfg.autoAccel === 'touch' && this.touchMode);
    return {
      accel: auto ? !this.isDown('down') : this.isDown('up'),
      brake: this.isDown('down'),
      steer: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      drift: this.isDown('action'),
      hop: p.hopReq,
    };
  }

  // ---------------- 업데이트 ----------------
  update(dt) {
    if (this.noGL) return;
    this.sparks.update(dt);
    animateFeatures(this.features, dt, performance.now() / 1000, this.camera3);
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    if (this.phase === 'select') { if (this.preview) this.preview.root.rotation.y += dt * 0.6; return; }
    for (const b of this.boxes) {
      b.mesh.rotation.y += dt * 1.6; b.mesh.rotation.x += dt * 0.7;
      b.mesh.position.y = b.y + 1.1 + Math.sin(performance.now() / 300 + b.x) * 0.15;
      if (b.respawn > 0) { b.respawn -= dt; b.mesh.visible = b.respawn <= 0; }
    }

    this.engineSound();
    if (this.phase === 'gpwait') { this.updateCamera(dt, false); return; }
    if (this.phase === 'countdown') {
      this.countT -= dt;
      const n = Math.ceil(this.countT - 0.6);
      if (n < this.lastCount && n >= 1 && n <= 3) { this.sound('tick'); this.lastCount = n; }
      // 로켓 스타트: 가속을 누르기 시작한 시점 기록
      const inp = this.playerInput();
      const p = this.player;
      if (inp.accel && this.isDown('up')) { if (p.startCharge === null) p.startCharge = this.countT; } else p.startCharge = null;
      if (this.countT <= 0.6) this.go();
      this.updateCamera(dt, true);
      return;
    }

    this.raceT += dt;
    if (this.ghostRec && !this.player.finished) {
      const g = this.ghostRec, p = this.player;
      while (g.d.length / 4 <= this.raceT * GHOST_HZ) g.d.push(r2(p.x), r2(p.y), r2(p.z), r2(p.h));
    }
    if (this.ghost) this.placeGhost(this.raceT);
    if (this.split && (this.split.t -= dt) <= 0) this.split = null;
    for (const r of this.racers) {
      if (r.remote) { this.remoteStep(r, dt); continue; }
      const inp = r.isPlayer && !r.finished ? this.playerInput() : this.aiInput(r, dt);
      this.physics(r, inp, dt);
      r.hopReq = false;
    }
    if (this.phase === 'race' || this.phase === 'finish') updateHazards(this, this.features, this.raceT);
    this.collideRacers();
    this.updateObjects(dt);
    this.updateRanks();
    if (this.multi) this.netTick(dt);
    this.updateCamera(dt, false);

    if (this.phase === 'race' && this.player.finished) {
      this.sendState(); // 골인 사실을 바로 알림
      this.phase = 'finish';
      this.finishWait = this.multi ? 30 : 4; // 멀티는 다른 사람들 골인을 기다림
      this.sound('levelup');
      this.msg = { text: this.ghostRec ? `골인! ${fmt(this.player.finishTime)}` : `골인! ${this.player.rank}위`, t: 3 };
    }
    if (this.phase === 'finish') {
      this.finishWait -= dt;
      const waitFor = this.multi ? this.racers.filter((r) => r.human) : this.racers;
      if (this.finishWait <= 0 || waitFor.every((r) => r.finished)) this.endRace();
    }
  }

  go() {
    this.phase = 'race';
    this.sound('levelup');
    this.msg = { text: 'GO!', t: 0.8, big: true };
    for (const r of this.racers) {
      if (r.isPlayer) {
        // 출발 0.6초 전 이내에 누르기 시작하면 로켓 스타트, 너무 일찍이면 헛바퀴
        if (r.startCharge !== null && r.startCharge <= 1.25) { r.boostT = 1.3; this.msg = { text: '로켓 스타트!', t: 1 }; this.sound('bonus'); }
        else if (r.startCharge !== null && r.startCharge > 2.6) { r.stall = 0.8; this.msg = { text: '헛바퀴…', t: 1 }; }
      } else if (Math.random() < this.diff.skill - 0.6) r.boostT = 1.0;
    }
  }

  // ---------------- 물리 ----------------
  physics(r, inp, dt) {
    const st = r.stats, tr = this.track;
    const spinning = r.spinT > 0;
    if (spinning) { r.spinT -= dt; r.spinA += dt * 14; r.speed *= Math.pow(0.12, dt); inp = { accel: false, brake: false, steer: 0, drift: false, hop: false }; }
    else r.spinA = 0;
    if (r.stall > 0) { r.stall -= dt; inp = { ...inp, accel: false }; }
    r.boostT = Math.max(0, r.boostT - dt);
    r.shieldT = Math.max(0, r.shieldT - dt);
    r.invT = Math.max(0, r.invT - dt);
    r.padCd = Math.max(0, r.padCd - dt);
    r.respawnT = Math.max(0, r.respawnT - dt);
    // 조향 입력을 부드럽게 (키보드도 확 꺾이지 않도록)
    r.steerS += (inp.steer - r.steerS) * Math.min(1, dt * (r.isPlayer ? 7 : 10));
    const steer = r.steerS;

    const boosting = r.boostT > 0;
    let maxS = st.maxSpeed * (r.rubber ?? 1);
    if (r.surface < 1 && !boosting && r.grounded) maxS *= r.surface; // 갓길·흙길·풀밭은 느림
    if (boosting) maxS *= st.boostMul ?? 1.3;
    if (r.gliding) {
      r.speed += (Math.max(24, Math.min(r.speed, maxS)) - r.speed) * dt * 0.5; // 활공 중엔 속도 유지
    } else if (inp.accel) {
      if (r.speed < maxS) r.speed += st.accel * (boosting ? 2.2 : 1) * (1 - Math.max(0, r.speed) / maxS * 0.55) * dt;
      else r.speed = Math.max(maxS, r.speed - 12 * dt);
    } else if (inp.brake) {
      r.speed -= (r.speed > 0 ? 24 : 9) * dt;
      r.speed = Math.max(r.speed, -9);
    } else {
      r.speed -= Math.sign(r.speed) * Math.min(Math.abs(r.speed), 7 * dt);
      if (r.speed > maxS) r.speed = Math.max(maxS, r.speed - 12 * dt);
    }

    // 점프(홉) → 드리프트 / 점프대 공중에서는 트릭
    if (inp.hop && !spinning) {
      if (r.grounded) {
        r.vy = HOP_V; r.grounded = false; r.airT = 0; r.canTrick = false;
        if (Math.abs(inp.steer) > 0.2 && r.speed > 11) { r.drifting = true; r.driftDir = Math.sign(inp.steer); r.driftT = 0; }
        if (r.isPlayer) this.sound('jump');
      } else if (r.canTrick && r.airT < 0.9) {
        r.trick = true; r.canTrick = false;
        if (r.isPlayer) this.sound('tick');
      }
    }
    if (!r.drifting && inp.drift && !r.grounded && !r.gliding && !r.canTrick && Math.abs(inp.steer) > 0.2 && r.speed > 11 && r.vy > 0) {
      r.drifting = true; r.driftDir = Math.sign(inp.steer); r.driftT = 0;
    }
    if (r.drifting) {
      if (!inp.drift || r.speed < 8 || spinning || r.gliding) this.endDrift(r);
      else if (r.grounded) r.driftT += dt * (st.driftRate ?? 1) * (1 + 0.6 * Math.max(0, steer * r.driftDir));
    }

    // 조향 (오른쪽 = 각도 감소). 빠를수록 덜 꺾임
    // 드리프트: 기본은 완만한 호, 안쪽 키 = 더 꺾임, 반대쪽 키 = 회전이 멈추고 그쪽으로 미끄러지듯 끌려감
    const spF = clamp(Math.abs(r.speed) / 9, 0, 1) * (1 - 0.3 * clamp(Math.abs(r.speed) / st.maxSpeed, 0, 1));
    const inward = r.drifting ? steer * r.driftDir : 0; // +1 안쪽, -1 바깥쪽
    let turn;
    if (r.gliding) turn = steer * st.turn * 0.85;
    // 드리프트 중엔 항상 드리프트 방향으로만 돎: 안쪽 키 = 빠르게, 반대쪽 키 = 천천히 (반대로 돌거나 반대쪽으로 끌려가지 않음)
    else if (r.drifting) turn = r.driftDir * (0.4 + 0.3 * inward) * st.turn * 1.2;
    else turn = steer * st.turn * spF * (r.speed >= 0 ? 1 : -1) * (boosting ? 0.9 : 1);
    if (!r.grounded && !r.drifting && !r.gliding) turn *= 0.5;
    if (r.onIce && r.grounded) turn *= 0.7; // 빙판: 덜 꺾이고
    r.h -= turn * dt;
    // 미끄러짐 각 (드리프트 중 일정)
    const slipT = r.drifting ? r.driftDir * 0.2 : 0;
    r.slip += (slipT - r.slip) * Math.min(1, dt * 4);
    let mv = r.h + r.slip;
    // 빙판: 가는 방향이 차 방향을 천천히 따라옴 (미끄러짐)
    if (r.onIce && r.grounded) { r.iceMv = (r.iceMv ?? mv) + wrapAngle(mv - (r.iceMv ?? mv)) * Math.min(1, dt * 2.2); mv = r.iceMv; } else r.iceMv = mv;
    r.x += Math.sin(mv) * r.speed * dt;
    r.z += Math.cos(mv) * r.speed * dt;

    // ---- 지금 어디에 있는지: 본선 / 지름길 / 코스 밖 ----
    const prevD = r.lastD;
    const n = tr.nearest(r.x, r.z, r.idx);
    r.idx = n.i;
    const inGap = tr.inGap(n.d);
    r.onIce = onIce(this.features, n.d);
    const inMain = Math.abs(n.lat) <= tr.wall + 0.3 && !inGap;
    let zone = inMain ? 'main' : 'off', sc = null, scn = null;
    if (!inMain) {
      r.scIdx = r.scIdx ?? [];
      for (let k = 0; k < tr.shortcuts.length; k++) {
        const q = tr.nearestShortcut(k, r.x, r.z, r.scIdx[k]);
        r.scIdx[k] = q.i;
        if (Math.abs(q.lat) <= tr.shortcuts[k].half + 1.2 && Math.abs(r.y - q.y) < 6) { zone = k; sc = tr.shortcuts[k]; scn = q; break; }
      }
    }
    if (zone === 'off' && inGap) zone = 'gap';
    const groundY = zone === 'main' ? n.y : sc ? scn.y : (tr.def.floating || zone === 'gap' ? -Infinity : 0);
    const groundS = zone === 'main' ? n.s : sc ? scn.s : n.s;
    r.surface = zone === 'main' ? (Math.abs(n.lat) > tr.hw + tr.curb * 0.6 ? st.offroad : 1) : sc ? sc.surface : 0.45;
    r.offroad = r.surface < 1;

    // 낭떠러지(글라이더 구간)에 들어서면 발사대를 못 밟았어도 자동으로 글라이더 펼침
    if (zone === 'gap' && !r.gliding && r.y > n.y - 4) {
      r.gliding = true; r.grounded = false; r.vy = Math.max(r.vy, 2.5); r.speed = Math.max(r.speed, 26);
      if (r.drifting) this.endDrift(r);
      if (r.isPlayer) { this.msg = { text: '🪂 글라이더!', t: 1 }; this.sound('power'); }
    }

    // 높이: 땅에 붙어 경사를 따라가거나, 공중이면 중력 (글라이더는 천천히)
    if (r.grounded && groundY > -Infinity && r.y - groundY < 0.7) {
      r.y = groundY; r.vy = 0;
      const fwd = Math.sin(r.h) * groundS.tx + Math.cos(r.h) * groundS.tz;
      r.speed -= groundS.slope * fwd * 4 * dt; // 오르막 감속 · 내리막 가속
      r.pitch = -Math.atan(groundS.slope * fwd);
    } else {
      r.grounded = false;
      r.airT += dt;
      const g = r.gliding ? (r.vy > 0 ? 9 : 4.5) : GRAV;
      r.vy -= g * dt;
      if (r.gliding) {
        r.vy = Math.max(r.vy, -3.6);
        // 활공 보정: 코스 가운데 쪽으로 당기고, 진행 방향도 코스를 향해 서서히
        if (Math.abs(n.lat) > tr.hw * 0.35) { const k = Math.sign(n.lat) * Math.min(Math.abs(n.lat), 6 * dt); r.x -= n.s.nx * k; r.z -= n.s.nz * k; }
        r.h += wrapAngle(Math.atan2(n.s.tx, n.s.tz) - r.h) * Math.min(1, dt * 1.5);
      }
      const prevY = r.y;
      r.y += r.vy * dt;
      r.pitch += ((r.gliding ? 0.05 : -r.vy * 0.015) - r.pitch) * Math.min(1, dt * 4);
      if (r.trick) r.trickA += dt * 16;
      if (r.y <= groundY) {
        // 낭떠러지 끝에 너무 낮게 도착 = 절벽에 부딪힘 → 추락 처리
        if (groundY - prevY > 2.5) { this.respawn(r); this.syncModel(r, 0, dt); return; }
        this.land(r, groundY);
      }
    }

    // 본선 벽 (뚫린 곳 제외). 안에서 밖으로 / 밖(지름길)에서 안으로 둘 다 막음
    const side = Math.sign(n.lat) || 1;
    const open = tr.isOpen(n.d, side);
    const wasInside = r.zone === 'main' || r.zone === undefined;
    // 본선 안에 있던 카트는 점프 중이어도 벽 밖으로 못 나감 (높이 날아 벽을 넘어 코스 밖으로 빠지던 문제)
    if (!open && !inGap && (r.y < n.y + 1.0 || (wasInside && !r.gliding))) {
      const lim = tr.wall - 1.0;
      if (wasInside && Math.abs(n.lat) > lim) {
        const push = Math.abs(n.lat) - lim;
        r.x -= n.s.nx * side * push; r.z -= n.s.nz * side * push;
        this.wallBump(r, n);
        zone = 'main';
      } else if (!wasInside && Math.abs(n.lat) < tr.wall + 1.0 && Math.abs(n.lat) > tr.wall - 3) {
        const push = tr.wall + 1.0 - Math.abs(n.lat);
        r.x += n.s.nx * side * push; r.z += n.s.nz * side * push;
        this.wallBump(r, n);
      }
    }
    r.zone = zone;

    // 코스 밖 (풀밭)에서 오래 머물거나 떨어지면 → 코스로 복귀
    r.offT = zone === 'off' && r.grounded ? (r.offT ?? 0) + dt : 0;
    if (r.y < Math.min(n.y, groundY > -Infinity ? groundY : n.y) - 10 || r.offT > 2) { this.respawn(r); this.syncModel(r, 0, dt); return; }
    if (r.grounded && zone === 'main' && Math.abs(n.lat) < tr.hw) r.safeD = n.d;
    else if (r.grounded && sc && Math.abs(scn.lat) < sc.half * 0.7) r.safeD = scn.mainD; // 지름길에서 떨어지면 그만큼 진행한 본선 위치로

    // 진행 거리: 지름길 위에서는 지름길 진행률을 본선 거리로 환산
    const curD = sc ? scn.mainD : n.d;
    if (sc) r.idx = tr.nearest(this.track.at(curD).x, this.track.at(curD).z, r.idx).i;
    let dd = curD - prevD;
    if (dd < -tr.length / 2) dd += tr.length;
    if (dd > tr.length / 2) dd -= tr.length;

    // 점프대 / 글라이더 발사대 (살짝 떠 있어도 인정)
    if (zone === 'main' && dd > 0 && Math.abs(n.lat) < tr.hw + 1.5 && r.y - n.y < 1.2) {
      for (const ramp of tr.ramps) {
        if (!tr.inRange(ramp.d, prevD, n.d)) continue;
        r.grounded = false; r.airT = 0; r.canTrick = true; r.trick = false; r.trickA = 0;
        if (ramp.glide) {
          r.vy = 6.5; r.gliding = true; r.speed = Math.max(r.speed, 27);
          if (r.drifting) this.endDrift(r);
          if (r.isPlayer) { this.msg = { text: '🪂 글라이더!', t: 1 }; this.sound('power'); }
        } else {
          r.vy = 7.5;
          if (r.isPlayer) { this.sound('jump'); this.msg = { text: '점프! Space로 트릭', t: 0.9 }; }
        }
        if (!r.isPlayer && Math.random() < r.skill - 0.45) r.trick = true;
      }
    }

    // 진행 거리 (랩 계산)
    r.progress += dd;
    r.lastD = curD;
    const lap = Math.floor(r.progress / tr.length) + 1;
    if (lap > r.lap && !r.finished) {
      r.lapTimes.push(this.raceT - r.lapStart);
      r.lapStart = this.raceT;
      if (lap > this.laps) {
        r.finished = true; r.finishTime = this.raceT;
      } else if (r.isPlayer) {
        this.msg = { text: lap === this.laps ? '마지막 랩!' : `랩 ${lap}`, t: 1.5 };
        if (lap === this.laps) this.setMusicTempo(1.1); // 마지막 랩은 음악이 빨라짐
        this.sound('bonus');
      }
      if (r.isPlayer && this.ghostRec) {
        this.ghostRec.splits.push(this.raceT);
        const ref = this.ghost?.splits?.[this.ghostRec.splits.length - 1];
        if (ref) {
          const dl = this.raceT - ref;
          this.split = { text: `${dl < 0 ? '−' : '+'}${Math.abs(dl).toFixed(2)}`, color: dl < 0 ? '#4ade80' : '#f87171', t: 3 };
        }
      }
    }
    r.lap = Math.max(r.lap, Math.min(lap, this.laps));

    // 역주행 표시
    const fwd = Math.sin(r.h) * n.s.tx + Math.cos(r.h) * n.s.tz;
    r.wrongT = fwd < -0.4 && Math.abs(r.speed) > 3 ? r.wrongT + dt : 0;

    // 가속 발판
    for (const pad of tr.boostPads) {
      if (r.padCd <= 0 && r.grounded && (r.x - pad.x) ** 2 + (r.z - pad.z) ** 2 < 9 && Math.abs(r.y - pad.y) < 2) {
        r.boostT = Math.max(r.boostT, 1.1); r.padCd = 1;
        if (r.isPlayer) this.sound('power');
      }
    }
    // 아이템 박스
    for (const b of this.boxes) {
      if (b.respawn > 0 || (r.x - b.x) ** 2 + (r.z - b.z) ** 2 > 3.2 || Math.abs(r.y - b.y) > 2.5) continue;
      b.respawn = 2.2; b.mesh.visible = false;
      this.sparks.emit(b.x, b.y + 1.2, b.z, 0xfde047, 0, 4, 0, 0.5);
      if (this.multi) this.multi.net.relay({ k: 'box', i: this.boxes.indexOf(b) });
      if (!r.item && r.roll <= 0) { r.roll = 1.1; if (r.isPlayer) this.sound('power'); }
    }
    if (r.roll > 0) {
      r.roll -= dt;
      if (r.roll <= 0) {
        r.item = rollItem((r.rank - 1) / (this.racers.length - 1));
        r.uses = ITEMS[r.item].uses ?? 1;
        if (r.isPlayer) this.sound('bonus');
      }
    }

    // 효과: 드리프트 불꽃, 풀밭 먼지
    const lvl = this.driftLevel(r);
    if (r.drifting && r.grounded && Math.random() < 0.9) {
      for (const sd of [-1, 1]) {
        const lx = sd * 0.75, lz = -1.0;
        const wx = r.x + Math.cos(r.h) * lx + Math.sin(r.h) * lz, wz = r.z - Math.sin(r.h) * lx + Math.cos(r.h) * lz;
        this.sparks.emit(wx, r.y + 0.2, wz, SPARK_COLORS[lvl], (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.25);
      }
    }
    if (r.offroad && r.grounded && Math.abs(r.speed) > 6 && Math.random() < 0.5) {
      this.sparks.emit(r.x - Math.sin(r.h) * 1.2, r.y + 0.3, r.z - Math.cos(r.h) * 1.2, this.track.def.theme.ground, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.4);
    }
    this.syncModel(r, lvl, dt);
  }

  land(r, groundY) {
    r.y = groundY; r.vy = 0; r.grounded = true;
    const wasGliding = r.gliding;
    r.gliding = false; r.canTrick = false;
    if (r.trick) {
      r.trick = false; r.trickA = 0;
      r.boostT = Math.max(r.boostT, 0.9);
      r.speed = Math.max(r.speed, r.stats.maxSpeed * 1.05);
      if (r.isPlayer) { this.msg = { text: '트릭 성공! 부스트', t: 0.9 }; this.sound('bonus'); }
    } else if (r.isPlayer && (wasGliding || r.airT > 0.5)) this.sound('land');
    r.airT = 0;
  }

  wallBump(r, n) {
    if (r.speed > 6) {
      r.speed *= 0.7;
      if (r.isPlayer) { this.sound('lock'); this.shake(2, 0.12); }
    }
    // 벽을 따라 미끄러지도록 방향을 트랙 쪽으로 살짝
    const ta = Math.atan2(n.s.tx, n.s.tz);
    const fwdA = Math.cos(wrapAngle(r.h - ta)) >= 0 ? ta : ta + Math.PI;
    r.h += wrapAngle(fwdA - r.h) * 0.2;
  }

  respawn(r) {
    const tr = this.track;
    const p = tr.at(r.safeD - 4);
    Object.assign(r, {
      x: p.x, z: p.z, y: p.y + 2.5, vy: 0, h: Math.atan2(p.tx, p.tz), speed: 0, grounded: false, gliding: false,
      drifting: false, spinT: 0, trick: false, canTrick: false, idx: p.i, respawnT: 1.6, camH: Math.atan2(p.tx, p.tz), zone: 'main', offT: 0, scIdx: [],
    });
    if (r.isPlayer) { this.msg = { text: '코스로 복귀!', t: 1.2 }; this.sound('hit'); }
  }

  driftLevel(r) { return !r.drifting ? 0 : r.driftT >= DRIFT_LV[2] ? 3 : r.driftT >= DRIFT_LV[1] ? 2 : r.driftT >= DRIFT_LV[0] ? 1 : 0; }

  endDrift(r) {
    const lvl = this.driftLevel(r);
    r.drifting = false;
    if (lvl > 0) {
      // 미니 터보: 즉시 속도가 확 붙고 일정 시간 부스트
      r.boostT = Math.max(r.boostT, DRIFT_BOOST[lvl]);
      r.speed = Math.max(r.speed, r.stats.maxSpeed * (1.06 + lvl * 0.06));
      r.turboFlash = 0.35;
      if (r.isPlayer) {
        this.sound(lvl >= 2 ? 'levelup' : 'bonus');
        this.msg = { text: TURBO_NAMES[lvl], t: 0.8, color: hex(SPARK_COLORS[lvl]) };
        for (let i = 0; i < 18; i++) this.sparks.emit(r.x - Math.sin(r.h) * 1.4, r.y + 0.5, r.z - Math.cos(r.h) * 1.4, SPARK_COLORS[lvl], (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.45);
      }
    }
  }

  syncModel(r, lvl, dt = 1 / 60) {
    const m = r.model;
    m.root.position.set(r.x, r.y, r.z);
    m.root.rotation.order = 'YXZ';
    m.root.rotation.y = r.h;
    m.root.rotation.x = r.pitch;
    m.root.visible = r.respawnT <= 0 || Math.floor(r.respawnT * 10) % 2 === 0;
    // 드리프트 땐 차체를 바깥쪽으로 틀고 기울임, 스핀은 빙글빙글, 트릭은 공중제비
    const yaw = r.spinT > 0 ? r.spinA : r.slip * 1.1;
    m.body.rotation.y += (yaw - m.body.rotation.y) * (r.spinT > 0 ? 1 : 0.3);
    m.body.rotation.z = r.trick ? r.trickA : -r.slip * 0.45 - (r.gliding ? r.steerS * 0.3 : 0);
    m.glider.visible = r.gliding;
    if (r.gliding) m.glider.rotation.z = Math.sin(performance.now() / 300) * 0.05;
    m.shadow.visible = r.grounded || r.y - (r.lastGroundY ?? r.y) < 6;
    for (const w of m.wheels) w.rotation.x += r.speed * 0.04;
    r.turboFlash = Math.max(0, (r.turboFlash ?? 0) - dt);
    const boost = r.boostT > 0;
    for (const f of m.flames) {
      f.visible = boost;
      if (boost) {
        const s = (0.8 + Math.random() * 0.6) * (r.turboFlash > 0 ? 1.8 : 1);
        f.scale.set(s, s * (r.invT > 0 ? 1.6 : 1.2), s);
        f.material.color.setHex(r.invT > 0 ? 0xfde047 : r.boostT > 1.2 ? 0xc084fc : r.boostT > 0.8 ? 0xfb923c : 0x60a5fa);
      }
    }
    m.shield.visible = r.shieldT > 0 || r.invT > 0;
    if (m.shield.visible) { m.shield.material.color.setHex(r.invT > 0 ? 0xfde047 : 0x60a5fa); m.shield.material.opacity = 0.18 + Math.sin(performance.now() / 120) * 0.06; }
    if (r.grounded) r.lastGroundY = r.y;
  }

  // ---------------- AI ----------------
  aiInput(r, dt) {
    const tr = this.track;
    // 고무줄 효과: 플레이어보다 많이 뒤처지면 살짝 빠르게, 많이 앞서면 살짝 느리게
    const gap = this.player.progress - r.progress;
    r.rubber = r.skill * (1 + clamp(gap / 200, -0.05, 0.11) * this.diff.rubber);
    if (r.finished && !r.isPlayer) r.rubber *= 0.85;
    // 차선 바꾸기 (위험물 피하기)
    r.laneT -= dt;
    if (r.laneT <= 0) { r.lane = (Math.random() - 0.5) * 1.3; r.laneT = 2 + Math.random() * 3; }
    const look = 9 + Math.max(0, r.speed) * 0.55;
    const obstacles = [...this.objs.filter((o) => o.type === 'oil' || o.type === 'mine')];
    for (const h of this.features?.hazards ?? []) { // 트랙 장애물도 피함
      if (h.type === 'geyser' && h.danger) obstacles.push({ x: h.x, z: h.z, wide: true });
      else if (h.type === 'boulder' && h.pos) obstacles.push({ ...h.pos, wide: true });
    }
    for (const o of obstacles) {
      const dx = o.x - r.x, dz = o.z - r.z;
      const ahead = dx * Math.sin(r.h) + dz * Math.cos(r.h);
      if (ahead > 0 && ahead < 22 && Math.abs(dx * Math.cos(r.h) - dz * Math.sin(r.h)) < (o.wide ? 4.5 : 3) && Math.random() < r.skill) { r.lane = -Math.sign(r.lane || 1) * 0.9; r.laneT = 1.5; }
    }
    // 지름길: 입구에 다가가면 탈지 말지 결정 (실력·부스트 여부)
    for (let k = 0; k < tr.shortcuts.length; k++) {
      const sc = tr.shortcuts[k];
      let dist = sc.dFrom - r.lastD; if (dist < 0) dist += tr.length;
      if (dist > 15 && dist < 70 && r.scDecide !== `${r.lap}-${k}`) {
        r.scDecide = `${r.lap}-${k}`;
        r.scPlan = Math.random() < 0.2 + r.skill * 0.25 + (r.boostT > 0 || r.item === 'nitro' || r.item === 'triple' ? 0.25 : 0) ? k : -1;
      }
    }
    let tx, tz;
    if (typeof r.zone === 'number') { // 지름길 위: 지름길을 따라감
      const S = tr.shortcuts[r.zone].samples, q = S[Math.min(S.length - 1, (r.scIdx[r.zone] ?? 0) + Math.max(3, Math.round(look / 4)))]; // 좁은 길: 가까운 곳을 보고 따라감 (멀리 보면 모서리를 잘라 떨어짐)
      tx = q.x; tz = q.z;
    } else if (r.scPlan >= 0) {
      const sc = tr.shortcuts[r.scPlan];
      let dist = sc.dFrom - r.lastD; if (dist > tr.length / 2) dist -= tr.length;
      if (dist < -35) r.scPlan = -1; // 이미 지나침
      else if (dist < 28) { const q = sc.samples[Math.min(sc.samples.length - 1, 9 + Math.max(0, Math.round(-dist / 2)))]; tx = q.x; tz = q.z; }
    }
    if (tx === undefined) {
      const t = tr.at(r.lastD + look);
      tx = t.x + t.nx * tr.hw * 0.55 * r.lane; tz = t.z + t.nz * tr.hw * 0.55 * r.lane;
    }
    const want = Math.atan2(tx - r.x, tz - r.z);
    const diff = wrapAngle(want - r.h);
    let steer = clamp(-diff * 2.4, -1, 1);
    const curv = tr.curvatureAt(r.idx);
    // 앞 커브를 돌려면 필요한 회전 속도 vs 이 카트가 낼 수 있는 회전 속도
    const need = Math.max(0, r.speed) * curv / 30, cap = r.stats.turn * 0.72;
    const slow = need > cap * 1.15 && !(r.boostT > 0) && r.grounded;
    // 급커브에서는 드리프트 (드리프트가 더 많이 돌 수 있음)
    let drift = r.drifting, hop = false;
    const onSc = typeof r.zone === 'number';
    if (!r.drifting && !onSc && r.grounded && need > cap * 0.85 && r.speed > 16 && r.aiDriftT <= 0 && Math.random() < r.skill * 0.22) {
      hop = true; drift = true; r.aiDriftT = 1.5;
      steer = Math.sign(-diff) || 1;
    }
    if (r.drifting && onSc) drift = false; // 좁은 지름길에서는 드리프트 안 함
    else if (r.drifting) { drift = curv > 0.24 || r.driftT < DRIFT_LV[r.skill > 0.97 ? 1 : 0]; steer = clamp(-diff * 2.4, -1, 1); }
    r.aiDriftT -= dt;
    // 아이템
    if (r.item && r.roll <= 0) {
      r.aiItemT -= dt * this.diff.items;
      if (r.aiItemT <= 0) this.aiUseItem(r);
    }
    // 역주행/스핀 후 방향 복구
    if (Math.abs(diff) > 2.2 && r.speed < 4) return { accel: false, brake: true, steer: -steer, drift: false, hop: false };
    return { accel: !slow, brake: false, steer, drift, hop };
  }

  aiUseItem(r) {
    const type = r.item;
    const behind = this.racers.some((o) => o !== r && o.progress < r.progress && r.progress - o.progress < 18);
    const front = this.racers.find((o) => o !== r && o.progress > r.progress && o.progress - r.progress < 45);
    let use = false;
    if (type === 'oil' || type === 'mine') use = behind || Math.random() < 0.15;
    else if (type === 'rocket') use = !!front && Math.random() < 0.5;
    else if (type === 'homing') use = r.rank > 1;
    else if (type === 'nitro' || type === 'triple') use = this.track.curvatureAt(r.idx) < 0.4;
    else use = true;
    if (use) this.useItem(r);
    r.aiItemT = 0.6 + Math.random() * 2.5;
  }

  // ---------------- 아이템 ----------------
  useItem(r) {
    if (!r.item || r.roll > 0 || r.spinT > 0 || this.phase === 'countdown') return;
    const type = r.item;
    const fx = Math.sin(r.h), fz = Math.cos(r.h);
    const spawn = (kind, dist, extra = {}) => {
      const mesh = buildItemMesh(kind);
      const o = { type: kind, x: r.x + fx * dist, z: r.z + fz * dist, y: this.track.nearest(r.x + fx * dist, r.z + fz * dist, r.idx).y, owner: r, life: 40, arm: 0.4, mesh, idx: r.idx, ...extra };
      mesh.position.set(o.x, o.y, o.z);
      mesh.rotation.y = r.h;
      this.dyn.add(mesh);
      this.objs.push(o);
      if (this.multi) {
        o.id = `${this.multi.me}:${this.multi.seq++}`;
        this.multi.net.relay({ k: 'obj', o: { id: o.id, type: kind, x: r2(o.x), y: r2(o.y), z: r2(o.z), h: r2(r.h), vx: o.vx, vz: o.vz, life: o.life, arm: o.arm, owner: r.id, target: o.target?.id } });
      }
      return o;
    };
    switch (type) {
      case 'nitro': case 'triple': r.boostT = Math.max(r.boostT, 1.5); this.sound(r.isPlayer ? 'bonus' : 'tick'); break;
      case 'oil': spawn('oil', -2.6); break;
      case 'mine': spawn('mine', -2.6, { arm: 0.7 }); break;
      case 'rocket': spawn('rocket', 2.6, { vx: fx * 50, vz: fz * 50, life: 3.5, arm: 0.15, bounces: 0 }); this.sound('power'); break;
      case 'homing': {
        const target = this.racers.find((o) => o.rank === r.rank - 1) ?? null;
        spawn('homing', 2.6, { vx: fx * 40, vz: fz * 40, life: 7, arm: 0.15, target });
        this.sound('power');
        break;
      }
      case 'shield': r.shieldT = 12; break;
      case 'turbo': r.boostT = Math.max(r.boostT, 3.2); r.invT = 3.2; this.sound('levelup'); break;
    }
    r.uses--;
    if (r.uses <= 0) r.item = null;
  }

  hitRacer(r, kind) {
    if (r.invT > 0 || r.spinT > 0 || r.respawnT > 0) return false;
    if (r.shieldT > 0) {
      r.shieldT = 0;
      for (let i = 0; i < 16; i++) this.sparks.emit(r.x, r.y + 1, r.z, 0x93c5fd, (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, 0.5);
      if (r.isPlayer) { this.msg = { text: '방어막으로 막았다!', t: 1 }; this.sound('lock'); }
      return true;
    }
    r.spinT = kind === 'oil' ? 0.9 : 1.2;
    r.drifting = false;
    r.speed *= kind === 'oil' ? 0.45 : 0.25;
    if (kind !== 'oil') r.vy = 6.5;
    if (r.isPlayer) { this.shake(8, 0.35); this.vibrate(150); this.sound('hit'); this.msg = { text: '앗!', t: 0.8 }; }
    return true;
  }

  updateObjects(dt) {
    const tr = this.track;
    for (const o of this.objs) {
      o.life -= dt; o.arm -= dt;
      if (o.type === 'rocket' || o.type === 'homing') {
        if (o.type === 'homing' && o.target && !o.target.finished) {
          const want = Math.atan2(o.target.x - o.x, o.target.z - o.z), cur = Math.atan2(o.vx, o.vz);
          const na = cur + clamp(wrapAngle(want - cur), -3.5 * dt, 3.5 * dt), sp = 42;
          o.vx = Math.sin(na) * sp; o.vz = Math.cos(na) * sp;
        }
        o.x += o.vx * dt; o.z += o.vz * dt;
        const n = tr.nearest(o.x, o.z, o.idx);
        o.idx = n.i;
        o.y = n.y;
        if (o.type === 'rocket' && Math.abs(n.lat) > tr.wall - 0.5) { // 벽에 튕김
          const sgn = Math.sign(n.lat), vn = o.vx * n.s.nx + o.vz * n.s.nz;
          if (vn * sgn > 0) { o.vx -= 2 * vn * n.s.nx; o.vz -= 2 * vn * n.s.nz; o.bounces++; }
          if (o.bounces > 3) o.life = 0;
        }
        o.mesh.position.set(o.x, o.y + 0.3, o.z);
        o.mesh.rotation.y = Math.atan2(o.vx, o.vz);
        if (Math.random() < 0.7) this.sparks.emit(o.x - o.vx * 0.03, o.y + 0.9, o.z - o.vz * 0.03, 0xfbbf24, 0, 1, 0, 0.25);
      } else if (o.type === 'mine') {
        o.mesh.children[o.mesh.children.length - 1].visible = Math.floor(performance.now() / 200) % 2 === 0;
      }
      for (const r of this.racers) {
        if (o.life <= 0) break;
        if (r.remote) continue; // 다른 사람 카트의 충돌은 그 사람 화면에서 판정
        if (r === o.owner && o.arm > 0) continue;
        const rad = o.type === 'oil' ? 1.9 : o.type === 'mine' ? 1.6 : 1.7;
        if ((r.x - o.x) ** 2 + (r.z - o.z) ** 2 > rad * rad || Math.abs(r.y - o.y) > 1.5 || r.respawnT > 0) continue;
        if (o.type !== 'oil' || r.invT <= 0) this.hitRacer(r, o.type);
        if (o.type === 'mine' || o.type === 'rocket' || o.type === 'homing') {
          this.explode(o);
          for (const q of this.racers) if (q !== r && !q.remote && o.type === 'mine' && (q.x - o.x) ** 2 + (q.z - o.z) ** 2 < 12) this.hitRacer(q, 'mine');
          if (r.isPlayer || o.owner.isPlayer) this.sound('drop');
        }
        o.life = 0;
        if (this.multi && o.id) this.multi.net.relay({ k: 'hit', id: o.id });
      }
    }
    for (const o of this.objs) if (o.life <= 0) this.dyn.remove(o.mesh);
    this.objs = this.objs.filter((o) => o.life > 0);
  }

  collideRacers() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.remote && b.remote) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 > 4.4 || Math.abs(a.y - b.y) > 1.2) continue;
      const d = Math.sqrt(d2) || 0.01, ov = 2.1 - d, nx = dx / d, nz = dz / d;
      if (ov <= 0) continue;
      if (a.remote || b.remote) { // 다른 사람 카트와 부딪힘: 내 카트만 밀려남, 슈퍼 터보는 상대에게 알림
        const loc = a.remote ? b : a, rem = a.remote ? a : b, sg = loc === a ? -1 : 1;
        if (loc.invT > 0 && rem.invT <= 0) {
          const key = rem.id, now = performance.now();
          if (!(this.multi.bumpAt[key] > now - 1000)) { this.multi.bumpAt[key] = now; this.multi.net.relay({ k: 'bump', to: rem.id }); }
          continue;
        }
        if (rem.invT > 0 && loc.invT <= 0) { this.hitRacer(loc, 'turbo'); continue; }
        loc.x += nx * ov * sg; loc.z += nz * ov * sg;
        if (loc.isPlayer) this.sound('bounce');
        continue;
      }
      // 슈퍼 터보는 부딪힌 상대를 날려버림
      if (a.invT > 0 && b.invT <= 0) { this.hitRacer(b, 'turbo'); continue; }
      if (b.invT > 0 && a.invT <= 0) { this.hitRacer(a, 'turbo'); continue; }
      const wa = a.stats.weight, wb = b.stats.weight, sum = wa + wb;
      a.x -= nx * ov * (wb / sum); a.z -= nz * ov * (wb / sum);
      b.x += nx * ov * (wa / sum); b.z += nz * ov * (wa / sum);
      if (a.isPlayer || b.isPlayer) this.sound('bounce');
    }
  }

  updateRanks() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    sorted.forEach((r, i) => { r.rank = i + 1; });
    this.order = sorted;
  }

  endRace() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const p = this.player;
    this.results = this.order.map((r) => ({ name: `${r.ch.emoji} ${r.ch.name}`, time: r.finished ? fmt(r.finishTime) : '--:--', me: r.isPlayer }));
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : 0;
    this.setScore(RANK_POINTS[p.rank - 1] + Math.max(0, Math.round(300 - this.raceT)));
    const stats = `${this.track.def.name} · 기록 ${p.finished ? fmt(p.finishTime) : '--'} · 베스트 랩 ${best ? fmt(best) : '--'}`;
    if (!this.multi && this.mode === 'tt') {
      this.setRecord(`kart-tt-${this.trackIdx}-${this.laps}`, { lower: true, fmt: (v) => fmt(v / 100) });
      const cs = p.finished ? Math.round(p.finishTime * 100) : 0;
      this.recordValue = cs;
      if (cs && (!this.best || cs < this.best)) {
        const g = this.ghostRec;
        saveGhost(this.trackIdx, this.laps, { ci: g.ci, ki: g.ki, t: p.finishTime, splits: g.splits, d: g.d });
      }
      const prev = this.ghost?.t;
      const vs = prev && cs ? ` · 이전 최고와 ${p.finishTime - prev < 0 ? '−' : '+'}${Math.abs(p.finishTime - prev).toFixed(2)}초` : '';
      return this.gameOver(cs && (!this.best || cs < this.best) ? '⏱ 새 기록!' : '⏱ 타임 어택', `${stats}${vs}`);
    }
    if (!this.multi && this.mode === 'gp') {
      const gp = this.gp;
      gp.last = this.order.map((r, i) => {
        const e = gp.roster.find((x) => x.id === r.id);
        const pts = GP_POINTS[i] ?? 0;
        e.pts += pts;
        return { e, pts };
      });
      gp.history.push(p.rank);
      if (gp.race < TRACKS.length - 1) {
        this.phase = 'gpwait';
        this.gpWaitAt = performance.now();
        this.msg = null;
        this.setScore(gp.roster.find((e) => e.id === 'me').pts * 100);
        return;
      }
      const table = [...gp.roster].sort((a, b) => b.pts - a.pts);
      const me = table.findIndex((e) => e.id === 'me') + 1, mine = table[me - 1].pts;
      this.setRecord('kart-gp');
      this.setScore(mine * 100 + Math.max(0, 6 - me) * 200);
      return this.gameOver(me === 1 ? '🏆 그랑프리 우승!' : me <= 3 ? `🏅 그랑프리 ${me}위` : `그랑프리 ${me}위`,
        `총 ${mine}점 · 경기별 순위 ${gp.history.join(' · ')} · 1위 ${CHARACTERS[table[0].ci].emoji} ${table[0].pts}점`);
    }
    if (this.multi) {
      const humans = this.order.filter((r) => r.human);
      const myPlace = humans.indexOf(p) + 1;
      this.sendState(); // 마지막 상태 전송 (다른 사람이 내 골인을 기다리지 않게)
      if (this.multi.net.isHost) this.multi.net.end();
      this.leaveMulti();
      return this.gameOver(myPlace === 1 ? '🏆 우승!' : `${p.rank}위 골인`, `${stats} · 사람 중 ${myPlace}/${humans.length}등`, { multi: true });
    }
    this.gameOver(p.rank === 1 ? '🏆 우승!' : `${p.rank}위 골인`, stats);
  }

  // ---------------- 카메라 ----------------
  updateCamera(dt, intro) {
    const p = this.player, cam = this.camera3;
    const dist = { near: 5.2, normal: 6.6, far: 8.4 }[this.cfg.camera] ?? 6.6;
    let tx, ty, tz, lx, ly, lz;
    if (intro && this.countT > 1.6) { // 출발 전 카메라가 빙 돌며 다가옴
      const a = p.h + Math.PI * 0.9 * ((this.countT - 1.6) / 2);
      tx = p.x - Math.sin(a) * (dist + 6); tz = p.z - Math.cos(a) * (dist + 6); ty = p.y + 4.5;
      lx = p.x; ly = p.y + 1; lz = p.z;
    } else if (this.phase === 'finish' || this.phase === 'done') {
      const a = this.raceT * 0.5;
      tx = p.x + Math.sin(a) * 9; tz = p.z + Math.cos(a) * 9; ty = p.y + 4;
      lx = p.x; ly = p.y + 1; lz = p.z;
    } else {
      // 카메라는 진행 방향을 부드럽게 따라감 (드리프트로 차체가 틀어져도 흔들리지 않게)
      p.camH += wrapAngle(p.h + p.slip * 0.6 - p.camH) * Math.min(1, dt * 4.5);
      const ch = p.camH;
      tx = p.x - Math.sin(ch) * dist; tz = p.z - Math.cos(ch) * dist; ty = p.y + (p.gliding ? 4.2 : 2.9);
      lx = p.x + Math.sin(ch) * 5; ly = p.y + 1.2; lz = p.z + Math.cos(ch) * 5;
    }
    if (!this.camPos) this.camPos = new THREE.Vector3(tx, ty, tz);
    const k = Math.min(1, dt * 7);
    this.camPos.x += (tx - this.camPos.x) * k; this.camPos.y += (ty - this.camPos.y) * k; this.camPos.z += (tz - this.camPos.z) * k;
    cam.position.copy(this.camPos);
    cam.lookAt(lx, ly, lz);
    const fov = 68 + (p.boostT > 0 ? 9 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    if (this.noGL) {
      ctx.fillStyle = '#0e0f14'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = '700 16px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('이 브라우저는 3D(WebGL)를 지원하지 않아요', W / 2, H / 2); ctx.textAlign = 'start';
      return;
    }
    if (this.phase === 'select' || !this.phase) {
      // 선택 화면: 카트를 돌려 보여주는 카메라
      const s = this.track.samples[0], t = performance.now() / 1000;
      this.camera3.position.set(s.x + Math.sin(t * 0.2) * 2 - 3, s.y + 2.6, s.z + 6.5);
      this.camera3.lookAt(s.x - 2.4, s.y + 0.9, s.z);
      this.camera3.fov = 50; this.camera3.updateProjectionMatrix();
    }
    // 시작·일시정지·결과 화면에서는 3D를 3프레임에 한 번만 그림 (배터리·발열 절약)
    this.idleSkip = ((this.idleSkip ?? 0) + 1) % 3;
    const idle = this.state !== 'playing';
    if (!idle || this.idleSkip === 0) {
      if (this.glLost) {
        // 3초 넘게 복구가 안 되면 직접 다시 연결 요청
        if (performance.now() - this.glLost > 3000) { this.glLost = performance.now(); this.renderer.forceContextRestore?.(); }
      } else this.renderer.render(this.scene, this.camera3);
      if (!idle) this.adaptResolution();
    }
    if (this.phase === 'select') return this.drawSelect(ctx);
    this.drawHud(ctx);
  }

  /** 프레임이 계속 느리면 3D 해상도를 낮추고, 여유가 생기면 다시 올림 */
  adaptResolution() {
    const now = performance.now();
    const dt = now - (this.lastRender ?? now);
    this.lastRender = now;
    if (!dt || dt > 250) return; // 탭 전환 등 큰 공백은 무시
    this.frameAvg = (this.frameAvg ?? 16) * 0.95 + dt * 0.05;
    this.adaptT = (this.adaptT ?? 0) + dt;
    if (this.adaptT < 2000) return;
    this.adaptT = 0;
    let r = this.ratio;
    if (this.frameAvg > 24 && r > 0.6) r = Math.max(0.6, r - 0.2);
    else if (this.frameAvg < 15 && r < this.maxRatio) r = Math.min(this.maxRatio, r + 0.1);
    if (r !== this.ratio) { this.ratio = r; this.renderer.setPixelRatio(r); this.renderer.setSize(this.viewW, this.viewH, false); }
  }

  drawSelect(ctx) {
    const s = this.sel;
    ctx.fillStyle = 'rgba(10,12,20,.72)';
    roundRect(ctx, 12, 12, 292, 336, 14);
    ctx.fillStyle = '#fde68a'; ctx.font = '900 20px system-ui, sans-serif';
    ctx.fillText('🏁 레이스 준비', 28, 42);
    const ch = CHARACTERS[s.char], kt = KARTS[s.kart], tr = TRACKS[s.track], md = MODES[s.mode];
    const gp = md.id === 'gp';
    let trackSub = tr.desc;
    if (md.id === 'tt') {
      const g = loadGhost(s.track, this.cfg.laps);
      trackSub = g ? `내 최고 ${fmt(g.t)} (${this.cfg.laps}랩) · 고스트 있음` : `${this.cfg.laps}랩 기록 없음 - 첫 기록에 도전!`;
    }
    const rows = [
      { label: '모드', value: md.name, sub: md.desc },
      { label: '캐릭터', value: `${ch.emoji} ${ch.name} (${ch.animal})` },
      { label: '카트', value: kt.name, sub: kt.desc },
      gp ? { label: '트랙', value: TRACKS.map((t) => t.emoji).join(' '), sub: `${TRACKS.length}개 트랙을 순서대로`, fixed: true }
        : { label: '트랙', value: `${tr.emoji} ${tr.name}`, sub: trackSub },
    ];
    rows.forEach((row, i) => {
      const y = SEL_Y + i * SEL_STEP, on = s.row === i;
      ctx.fillStyle = on ? 'rgba(59,130,246,.28)' : 'rgba(255,255,255,.05)';
      roundRect(ctx, 20, y, 276, SEL_H, 10);
      if (on) { ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect?.(20, y, 276, SEL_H, 10); ctx.stroke(); }
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 10px system-ui, sans-serif'; ctx.fillText(row.label, 70, y + 13);
      ctx.fillStyle = '#f8fafc'; ctx.font = '800 15px system-ui, sans-serif'; ctx.fillText(row.value, 70, y + 31);
      if (row.sub) { ctx.fillStyle = '#cbd5e1'; ctx.font = '500 10px system-ui, sans-serif'; ctx.fillText(row.sub, 70, y + 46); }
      if (row.fixed) return;
      ctx.fillStyle = on ? '#fff' : '#64748b'; ctx.font = '900 20px system-ui, sans-serif';
      ctx.fillText('◀', 32, y + 34); ctx.fillText('▶', 266, y + 34);
    });
    // 능력치 막대 (캐릭터 + 카트)
    const st = combineStats(ch, kt).raw;
    const bars = [['속도', st.speed], ['가속', st.accel], ['무게', st.weight], ['핸들', st.handling]];
    ctx.font = '700 10px system-ui, sans-serif';
    bars.forEach(([name, v], i) => {
      const x = 330 + i * 76;
      ctx.fillStyle = 'rgba(10,12,20,.7)'; roundRect(ctx, x - 4, 300, 70, 44, 8);
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(name, x + 2, 316);
      for (let k = 0; k < 7; k++) { ctx.fillStyle = k < v ? '#facc15' : 'rgba(148,163,184,.3)'; ctx.fillRect(x + 2 + k * 8.5, 324, 7, 10); }
    });
    // 출발 버튼
    const go = s.row === 4;
    ctx.fillStyle = go ? '#2563eb' : '#3b82f6';
    roundRect(ctx, 24, 286, 268, 48, 24);
    if (go) { ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect?.(24, 286, 268, 48, 24); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(MODES[s.mode].id === 'gp' ? '그랑프리 시작!' : MODES[s.mode].id === 'tt' ? '기록 도전!' : '출발!', 158, 316);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.touchMode ? '◀▶ 를 탭해서 바꾸기' : '↑↓ 항목 · ←→ 변경 · Space 출발', 158, 352);
    ctx.textAlign = 'start';
  }

  drawHud(ctx) {
    const p = this.player;
    if (!p) return;
    ctx.save();
    const shadowText = (txt, x, y, font, color, align = 'start') => {
      ctx.font = font; ctx.textAlign = align;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(txt, x, y);
      ctx.fillStyle = color; ctx.fillText(txt, x, y);
    };
    // 순위 (타임 어택은 최고 기록·고스트 차이)
    if (this.ghostRec) {
      shadowText('⏱ 타임 어택', 18, 34, '900 18px system-ui, sans-serif', '#fde68a');
      shadowText(this.ghost ? `최고 ${fmt(this.ghost.t)} · 👻 고스트` : '첫 기록 도전!', 18, 54, '700 12px system-ui, sans-serif', '#e2e8f0');
      if (this.split) shadowText(this.split.text, W / 2, 128, '900 26px system-ui, sans-serif', this.split.color, 'center');
    } else {
      const rc = p.rank === 1 ? '#facc15' : p.rank <= 3 ? '#e2e8f0' : '#fca5a5';
      shadowText(`${p.rank}`, 18, 58, '900 50px system-ui, sans-serif', rc);
      shadowText(`위 / ${this.racers.length}`, 18 + (p.rank >= 10 ? 56 : 30), 56, '800 16px system-ui, sans-serif', '#fff');
      if (this.gp) shadowText(`그랑프리 ${this.gp.race + 1}/${TRACKS.length}`, 18, 76, '700 11px system-ui, sans-serif', '#fde68a');
    }
    // 랩·시간
    shadowText(`랩 ${Math.min(p.lap, this.laps)}/${this.laps}`, W - 16, 32, '800 18px system-ui, sans-serif', '#fff', 'right');
    shadowText(fmt(this.raceT ?? 0), W - 16, 54, '700 14px system-ui, sans-serif', '#e2e8f0', 'right');
    // 아이템 슬롯
    const ix = W / 2 - 30, iy = 10;
    ctx.fillStyle = 'rgba(15,23,42,.65)'; roundRect(ctx, ix, iy, 60, 60, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect?.(ix, iy, 60, 60, 12); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.roll > 0) {
      const keys = Object.keys(ITEMS), k = keys[Math.floor(performance.now() / 70) % keys.length];
      ctx.font = '32px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(ITEMS[k].icon, W / 2, iy + 32);
    } else if (p.item) {
      ctx.font = '34px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(ITEMS[p.item].icon, W / 2, iy + 32);
      if (p.uses > 1) { ctx.font = '800 13px system-ui'; ctx.fillStyle = '#fde047'; ctx.fillText(`×${p.uses}`, ix + 50, iy + 50); }
      ctx.textBaseline = 'alphabetic';
      shadowText(ITEMS[p.item].name, W / 2, iy + 76, '700 11px system-ui, sans-serif', '#fff', 'center');
    }
    ctx.textBaseline = 'alphabetic';
    // 속도
    shadowText(`${Math.round(Math.max(0, p.speed) * 3.6 * 1.6)}`, W - 16, H - 30, '900 28px system-ui, sans-serif', p.boostT > 0 ? '#fdba74' : '#fff', 'right');
    shadowText('km/h', W - 16, H - 14, '700 11px system-ui, sans-serif', '#cbd5e1', 'right');
    // 드리프트 게이지: 파랑 → 주황 → 보라
    if (p.drifting) {
      const lvl = this.driftLevel(p);
      const gx = W - 150, gy = H - 74;
      ctx.fillStyle = 'rgba(15,23,42,.6)'; roundRect(ctx, gx - 4, gy - 4, 142, 16, 8);
      const segs = [DRIFT_LV[0], DRIFT_LV[1] - DRIFT_LV[0], DRIFT_LV[2] - DRIFT_LV[1]];
      let x = gx, t = p.driftT;
      segs.forEach((len, i) => {
        const w = 134 * (len / DRIFT_LV[2]);
        ctx.fillStyle = 'rgba(148,163,184,.25)'; ctx.fillRect(x, gy, w - 2, 8);
        ctx.fillStyle = hex(SPARK_COLORS[i + 1]); ctx.fillRect(x, gy, (w - 2) * clamp(t / len, 0, 1), 8);
        t -= len; x += w;
      });
      shadowText(lvl ? TURBO_NAMES[lvl].replace('!', ' 준비') : '드리프트 중…', W - 16, gy - 8, '800 12px system-ui, sans-serif', lvl ? hex(SPARK_COLORS[lvl]) : '#fff', 'right');
    }
    if (p.gliding) shadowText('🪂 활공 중 - ←→로 방향 조절', W / 2, H - 20, '800 13px system-ui, sans-serif', '#bae6fd', 'center');
    this.drawNameTags(ctx);
    this.drawMinimap(ctx);
    // 중앙 메시지 / 카운트다운
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.countT - 0.6);
      if (n >= 1 && n <= 3) shadowText(String(n), W / 2, H / 2 + 20, '900 72px system-ui, sans-serif', ['#4ade80', '#facc15', '#f87171'][n - 1], 'center');
      if (!this.touchMode && this.cfg.autoAccel !== 'always') shadowText('출발 직전에 ↑ 를 누르면 로켓 스타트!', W / 2, H / 2 + 60, '700 13px system-ui, sans-serif', '#e2e8f0', 'center');
    }
    if (this.msg) {
      ctx.globalAlpha = Math.min(1, this.msg.t / 0.3);
      shadowText(this.msg.text, W / 2, H / 2 - 30, this.msg.big ? '900 60px system-ui, sans-serif' : '900 28px system-ui, sans-serif', this.msg.color ?? '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    if (p.wrongT > 0.8 && this.phase === 'race') shadowText('⚠ 역주행!', W / 2, 110, '900 26px system-ui, sans-serif', '#f87171', 'center');
    if (this.phase === 'gpwait') this.drawGpTable(ctx);
    // 결과표
    else if ((this.phase === 'finish' || this.phase === 'done') && !this.ghostRec) {
      const list = this.order.map((r) => ({ name: `${r.ch.emoji} ${r.human ? r.name : r.ch.name}`, time: r.finished ? fmt(r.finishTime) : '주행 중', me: r.isPlayer }));
      ctx.fillStyle = 'rgba(10,12,20,.75)'; roundRect(ctx, W - 210, 70, 196, 30 + list.length * 22, 12);
      list.forEach((r, i) => {
        const y = 94 + i * 22;
        if (r.me) { ctx.fillStyle = 'rgba(250,204,21,.25)'; ctx.fillRect(W - 206, y - 15, 188, 21); }
        ctx.textAlign = 'start'; ctx.fillStyle = r.me ? '#fde047' : '#e2e8f0'; ctx.font = '700 12px system-ui, sans-serif';
        ctx.fillText(`${i + 1}. ${r.name}`, W - 200, y);
        ctx.textAlign = 'right'; ctx.fillText(r.time, W - 22, y);
      });
    }
    ctx.restore();
  }

  /** 다른 사람(멀티) 카트 위에 이름표 */
  drawNameTags(ctx) {
    const v = this.tagVec ??= new THREE.Vector3();
    for (const r of this.racers) {
      if (!r.human || r.isPlayer || r.id === 'me') continue;
      v.set(r.x, r.y + 3.1, r.z).project(this.camera3);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      const dist = Math.hypot(r.x - this.player.x, r.z - this.player.z);
      if (dist > 120) continue;
      ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(r.name).width + 12;
      ctx.fillStyle = 'rgba(15,23,42,.7)'; roundRect(ctx, x - tw / 2, y - 16, tw, 18, 9);
      ctx.fillStyle = hex(r.ch.kartColor === 0x111827 ? 0xe5e7eb : r.ch.kartColor); ctx.fillText(r.name, x, y - 3);
      ctx.textAlign = 'start';
    }
    // 미니맵에서도 사람은 크게
  }

  drawMinimap(ctx) {
    const m = this.mini, tr = this.track, cx = 70, cy = H - 70;
    ctx.fillStyle = 'rgba(15,23,42,.45)'; ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    tr.samples.forEach((s, i) => { const x = cx + (s.x - m.ox) * m.s, y = cy + (s.z - m.oz) * m.s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    // 지름길 (점선)
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(253,224,71,.85)'; ctx.lineWidth = 2;
    for (const sc of tr.shortcuts) {
      ctx.beginPath();
      sc.samples.forEach((s, i) => { const x = cx + (s.x - m.ox) * m.s, y = cy + (s.z - m.oz) * m.s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const r of [...this.racers].reverse()) {
      const x = cx + (r.x - m.ox) * m.s, y = cy + (r.z - m.oz) * m.s;
      ctx.fillStyle = hex(r.ch.kartColor);
      ctx.beginPath(); ctx.arc(x, y, r.isPlayer ? 5 : r.human ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
      if (r.isPlayer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }
}
