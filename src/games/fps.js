// 스쿼드 슈터 - 1인칭 슈팅 (three.js). 팀 데스매치 · 개인전 · 좀비 서바이벌, 봇 AI, 멀티플레이
// 3D 장면은 아래쪽 WebGL 캔버스에, HUD(조준선·체력·탄약·킬 로그·레이더)는 위쪽 2D 캔버스에 그림
import * as THREE from '../vendor/three.module.min.js';
import { GameBase, injectStyle } from '../engine.js';
import { sfx } from '../sfx.js';
import { WEAPONS, PRIMARIES, MODES, DIFFS, BOT_NAMES, MAPS, ZOMBIES, rankOf } from './fps/data.js';
import { World } from './fps/world.js';
import { buildSoldier, setSoldierGun, animateSoldier, ViewModel, Effects, buildGrenadeMesh, buildPickup } from './fps/models.js';
import { newAI, updateBot, updateZombie, alertBots } from './fps/bots.js';

const W = 640, H = 360;
const EYE = 1.6, EYE_CROUCH = 1.05, BODY_H = 1.8, BODY_H_CROUCH = 1.25, RADIUS = 0.32;
const WALK = 4.7, SPRINT = 1.45, JUMP_V = 7.2;
const RESPAWN = 4, PROTECT = 2.5, REGEN_DELAY = 5, REGEN_RATE = 18;
const SEND_RATE = 1 / 15;
const TEAM_COL = [0x3b82f6, 0xef4444], TEAM_CSS = ['#60a5fa', '#f87171'], TEAM_NAME = ['블루', '레드'];
const FFA_COL = [0x3b82f6, 0xef4444, 0xf59e0b, 0x10b981, 0xa855f7, 0xec4899, 0x14b8a6, 0xf97316, 0x84cc16, 0x6366f1, 0xe11d48, 0x0ea5e9];
const XP_KEY = 'miniigame:fps:xp', SEL_KEY = 'miniigame:fps:sel';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const rnd = (a, b) => a + Math.random() * (b - a);
const fmtTime = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
const r2 = (v) => Math.round(v * 100) / 100;

// WebGL 컨텍스트는 하나를 계속 다시 씀 (게임을 여러 번 붙였다 떼어도 쌓이지 않게)
const pool = [];
function takeRenderer(owner) {
  const free = pool.find((r) => !r.owner && !r.getContext().isContextLost());
  if (free) { free.owner = owner; return free; }
  try { const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); r.owner = owner; pool.push(r); return r; } catch { return null; }
}

// ---------------- 소리 (잡음으로 만드는 총소리·폭발) ----------------
let noiseBuf = null;
function noiseHit({ vol = 0.3, pan = 0, freq = 1200, q = 0.7, dur = 0.12, type = 'bandpass', thump = 0, thumpF = 140 }) {
  const ac = sfx.context;
  if (sfx.muted || !ac || ac.state !== 'running' || vol < 0.004) return;
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const now = ac.currentTime, out = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
  if (out.pan) out.pan.value = clamp(pan, -1, 1);
  out.connect(ac.destination);
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f).connect(g).connect(out); src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.02);
  if (thump) { const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(thumpF, now); o.frequency.exponentialRampToValueAtTime(thumpF * 0.35, now + dur * 0.8); og.gain.setValueAtTime(thump, now); og.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.9); o.connect(og).connect(out); o.start(now); o.stop(now + dur); }
}
const GUN_SND = {
  ar: { vol: 0.3, freq: 1500, dur: 0.11, thump: 0.22 }, smg: { vol: 0.24, freq: 2200, dur: 0.08, thump: 0.14, thumpF: 180 }, shotgun: { vol: 0.45, freq: 700, dur: 0.26, thump: 0.4, thumpF: 110 },
  sniper: { vol: 0.5, freq: 900, dur: 0.38, thump: 0.45, thumpF: 100 }, lmg: { vol: 0.33, freq: 1100, dur: 0.13, thump: 0.28, thumpF: 120 }, pistol: { vol: 0.26, freq: 1900, dur: 0.1, thump: 0.18, thumpF: 170 },
};

const CSS = `
.fps-menu{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:3%;pointer-events:none;font-family:system-ui,sans-serif}
.fps-menu[hidden]{display:none}
.fps-panel{pointer-events:auto;background:rgba(13,17,26,.86);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px 14px;width:min(46%,330px);min-width:230px;color:#e5e7eb;backdrop-filter:blur(4px)}
.fps-panel h3{margin:0 0 2px;font-size:17px;color:#fde68a}
.fps-rank{font-size:11px;color:#9ca3af;margin-bottom:6px}
.fps-xp{height:4px;background:#1f2937;border-radius:2px;margin-top:3px;overflow:hidden}.fps-xp i{display:block;height:100%;background:#fbbf24}
.fps-row{display:grid;grid-template-columns:26px 1fr 26px;align-items:center;gap:4px;padding:4px 6px;border-radius:9px;border:1.5px solid transparent;margin-bottom:3px;background:rgba(255,255,255,.04)}
.fps-row.on{border-color:#60a5fa;background:rgba(59,130,246,.16)}
.fps-row small{display:block;font-size:10px;color:#9ca3af}.fps-row b{font-size:14px}.fps-row em{display:block;font-style:normal;font-size:10px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fps-row button{all:unset;cursor:pointer;text-align:center;font-size:15px;color:#e5e7eb;border-radius:6px;height:30px;line-height:30px}
.fps-row button:active{background:rgba(255,255,255,.15)}
.fps-go{all:unset;display:block;cursor:pointer;margin-top:6px;text-align:center;background:#3b82f6;color:#fff;font-weight:800;font-size:15px;border-radius:999px;padding:8px 0;width:100%}
.fps-hint{font-size:10px;color:#9ca3af;text-align:center;margin-top:5px}
.fps-touch{position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none}
.fps-touch[hidden]{display:none}
.fps-touch button{all:unset;position:absolute;width:11%;aspect-ratio:1;max-width:54px;border-radius:50%;background:rgba(20,24,34,.4);border:1.5px solid rgba(255,255,255,.32);color:#fff;font:700 clamp(8px,2.2vw,12px) system-ui,sans-serif;text-align:center;display:flex;align-items:center;justify-content:center;touch-action:none}
.fps-touch button.on{background:rgba(59,130,246,.6)}
.fps-touch .f-fire{right:3%;bottom:24%;width:15%;max-width:76px;background:rgba(220,60,60,.42)}
.fps-touch .f-ads{right:4.5%;bottom:60%}.fps-touch .f-jump{right:21%;bottom:10%}.fps-touch .f-reload{right:21%;bottom:40%}
.fps-touch .f-crouch{right:35%;bottom:10%}.fps-touch .f-switch{right:20%;top:20%}.fps-touch .f-nade{right:34%;top:20%}
.fps-stick{position:absolute;width:22%;max-width:120px;aspect-ratio:1;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(20,24,34,.25);transform:translate(-50%,-50%);pointer-events:none}
.fps-stick i{position:absolute;left:50%;top:50%;width:42%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.5);transform:translate(-50%,-50%)}
`;

export default class Fps extends GameBase {
  static meta = {
    id: 'fps',
    title: '스쿼드 슈터',
    description: '1인칭 슈팅! 팀 데스매치·개인전·좀비 서바이벌. 주무기 5종과 권총·칼·수류탄으로 봇 분대와 싸우세요. 헤드샷, 연속 킬, 계급 승급.',
    controls: 'WASD 이동 · 마우스 조준 · 좌클릭 사격 · 우클릭 정조준 · Space 점프 · Shift 달리기 · C 앉기 · R 재장전 · 1~4 무기 · G 수류탄 · F 칼 · Tab 점수판',
    touchControls: '왼쪽 화면 = 이동 스틱 · 오른쪽 화면 드래그 = 조준 · 사격/조준/점프/재장전 버튼 · 조준선이 적에 닿으면 자동 사격 · 📱 가로 화면 추천',
  };
  static bindings = {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], action: ['Space'],
    lookl: ['ArrowLeft'], lookr: ['ArrowRight'], looku: ['ArrowUp'], lookd: ['ArrowDown'], fire: ['Enter', 'KeyJ'], ads: ['KeyK'],
    sprint: ['ShiftLeft'], crouch: ['KeyC', 'ControlLeft'], reload: ['KeyR'], w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'], w4: ['Digit4'], w5: ['Digit5'],
    nade: ['KeyG'], melee: ['KeyF', 'KeyV'], last: ['KeyQ'], score: ['Tab'], restart: ['F2'],
  };
  static actionLabels = {
    up: '앞으로', down: '뒤로', left: '왼쪽', right: '오른쪽', action: '점프 / 결정', fire: '사격 (키보드)', ads: '정조준 (키보드)', lookl: '왼쪽 보기', lookr: '오른쪽 보기', looku: '위 보기', lookd: '아래 보기',
    sprint: '달리기', crouch: '앉기', reload: '재장전', w1: '주무기', w2: '권총', w3: '칼', w4: '수류탄', w5: '(부활 대기 중) 주무기 5', nade: '수류탄 바로 던지기', melee: '칼 바로 휘두르기', last: '이전 무기', score: '점수판',
  };
  static settings = [
    { id: 'difficulty', label: '봇 실력', type: 'select', default: 'normal', options: [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']] },
    { id: 'sens', label: '조준 감도', type: 'range', min: 1, max: 20, default: 8 },
    { id: 'fov', label: '시야각', type: 'range', min: 60, max: 100, step: 5, default: 75, unit: '°' },
    { id: 'autoFire', label: '자동 사격 (조준선이 적에 닿으면)', type: 'select', default: 'touch', options: [['touch', '모바일만'], ['always', '항상'], ['never', '끄기']] },
    { id: 'team', label: '팀 인원 (팀 데스매치)', type: 'range', min: 2, max: 6, default: 5, unit: '명' },
    { id: 'quality', label: '그래픽 품질', type: 'select', default: 'normal', options: [['low', '낮음 (그림자 끔)'], ['normal', '보통'], ['high', '높음']] },
  ];
  static pad = { left: null, buttons: [] };
  static gestures = { tap: null, left: null, right: null, up: null, down: null };
  static multiplayer = { min: 2, max: 8, label: '멀티 대전' };

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
    this.clearColor = null;
    this.DIFFS = DIFFS;
    this.sel = { mode: 0, map: 0, weapon: 0, row: 0, ...(() => { try { return JSON.parse(localStorage.getItem(SEL_KEY)) ?? {}; } catch { return {}; } })() };
    this.sel.mode = clamp(this.sel.mode | 0, 0, MODES.length - 1); this.sel.map = clamp(this.sel.map | 0, 0, MAPS.length - 1); this.sel.weapon = clamp(this.sel.weapon | 0, 0, PRIMARIES.length - 1); this.sel.row = 0;
    this.xp = (() => { try { return Number(localStorage.getItem(XP_KEY)) || 0; } catch { return 0; } })();
    this.actors = []; this.grenades = []; this.pickups = []; this.feed = []; this.dmgInd = [];
    this.look = { dx: 0, dy: 0 }; this.mouse = { fire: false, ads: false };
    this.touch = { mx: 0, mz: 0, fire: false, ads: false, crouch: false, stickId: null, lookId: null };
    injectStyle(this.styleHost, 'mg-fps-style', CSS);
    this.$pad.style.display = 'none';
    this.setup3D();
    this.buildDom();
    this.bindInput();
  }

  // ---------------- 3D 기본 구성 ----------------
  setup3D() {
    this.renderer = takeRenderer(this);
    if (!this.renderer) { this.noGL = true; return; }
    const cv = this.renderer.domElement;
    cv.className = 'mg-3d';
    this.$screen.insertBefore(cv, this.canvas);
    this._onLost = (e) => { e.preventDefault(); this.glLost = true; };
    this._onRestored = () => { this.glLost = false; };
    cv.addEventListener('webglcontextlost', this._onLost); cv.addEventListener('webglcontextrestored', this._onRestored);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(75, W / H, 0.08, 400);
    this.cam.rotation.order = 'YXZ';
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.15);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    const sh = this.sun.shadow; sh.camera.near = 10; sh.camera.far = 260; sh.bias = -0.0008; sh.normalBias = 0.05;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.effects = new Effects(this.scene);
    this.view = new ViewModel();
    const r = this.$screen.getBoundingClientRect();
    if (r.width) this.onResize(r.width, r.height);
  }
  onResize(w, h) {
    if (!this.renderer) return;
    const q = { low: 1, normal: 1.5, high: 2 }[this.cfg?.quality ?? 'normal'] ?? 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q));
    this.renderer.setSize(w, h, false);
    this.cam.aspect = this.view.camera.aspect = w / h;
    this.cam.updateProjectionMatrix(); this.view.camera.updateProjectionMatrix();
  }
  onSettingsChange(id) {
    if (id === 'quality') { const r = this.$screen.getBoundingClientRect(); this.onResize(r.width, r.height); this.applyShadows(); }
    if (id === 'difficulty') this.diff = DIFFS[this.cfg.difficulty] ?? DIFFS.normal;
  }
  applyShadows() {
    if (!this.renderer) return;
    const q = this.cfg.quality ?? 'normal';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
  }
  onDestroy() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('mouseup', this._onMouseUp);
    if (this.isLocked()) document.exitPointerLock?.();
    if (!this.renderer) return;
    this.leaveMulti();
    const cv = this.renderer.domElement;
    cv.removeEventListener('webglcontextlost', this._onLost); cv.removeEventListener('webglcontextrestored', this._onRestored);
    this.disposeGroup(this.scene);
    this.renderer.autoClear = true;
    this.renderer.renderLists.dispose();
    cv.remove();
    this.renderer.owner = null;
  }
  disposeGroup(g) { g.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); }); }

  loadMap(idx) {
    if (this.mapIdx === idx && this.world) return;
    if (this.mapGroup) { this.scene.remove(this.mapGroup); this.disposeGroup(this.mapGroup); }
    const def = MAPS[idx];
    this.world = new World(def);
    this.mapGroup = this.world.build();
    this.scene.add(this.mapGroup);
    this.mapIdx = idx;
    // 하늘 그라데이션 + 안개 + 해
    this.scene.background?.dispose?.();
    const sc = document.createElement('canvas'); sc.width = 2; sc.height = 128;
    const sx = sc.getContext('2d'), gr = sx.createLinearGradient(0, 0, 0, 128), css = (c) => '#' + new THREE.Color(c).getHexString();
    gr.addColorStop(0, css(new THREE.Color(def.sky).multiplyScalar(0.8))); gr.addColorStop(0.45, css(def.sky)); gr.addColorStop(0.62, css(def.fog)); gr.addColorStop(1, css(def.fog));
    sx.fillStyle = gr; sx.fillRect(0, 0, 2, 128);
    const bg = new THREE.CanvasTexture(sc); bg.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(def.fog, 25, def.fogFar);
    this.sun.color.setHex(def.sun);
    this.sun.position.set(45, 80, 30); this.sun.target.position.set(0, 0, 0);
    const R = Math.max(this.world.hx, this.world.hz) + 6, c = this.sun.shadow.camera;
    c.left = c.bottom = -R; c.right = c.top = R; c.updateProjectionMatrix();
    this.applyShadows();
    // 미니맵용 상자 목록 (사람 키 높이의 벽만)
    this.radarBoxes = this.world.solids.filter((o) => o.y0 < 1.2 && o.y1 > 1.0);
  }

  // ---------------- 메뉴 · 터치 버튼 (DOM) ----------------
  buildDom() {
    const menu = this.$menu = document.createElement('div');
    menu.className = 'fps-menu'; menu.hidden = true;
    this.$screen.insertBefore(menu, this.$overlay);
    menu.addEventListener('pointerdown', (e) => { if (e.target.closest('.fps-panel')) e.stopPropagation(); });
    menu.addEventListener('pointerup', (e) => { if (e.target.closest('.fps-panel')) e.stopPropagation(); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      sfx.unlock();
      if (b.dataset.m === 'go') return this.menuGo();
      this.sel.row = Number(b.dataset.row); this.menuChange(Number(b.dataset.m));
    });
    const t = this.$touch = document.createElement('div');
    t.className = 'fps-touch'; t.hidden = true;
    t.innerHTML = `<div class="fps-stick" hidden><i></i></div>
      <button class="f-fire" data-b="fire">사격</button><button class="f-ads" data-b="ads">조준</button><button class="f-jump" data-b="jump">점프</button>
      <button class="f-reload" data-b="reload">장전</button><button class="f-crouch" data-b="crouch">앉기</button><button class="f-switch" data-b="switch">무기</button><button class="f-nade" data-b="nade">수류탄</button>`;
    this.$screen.insertBefore(t, this.$overlay);
    this.$stick = t.querySelector('.fps-stick');
  }
  rows() {
    const m = MODES[this.sel.mode], mp = MAPS[this.sel.map], w = WEAPONS[PRIMARIES[this.sel.weapon]], d = DIFFS[this.cfg.difficulty] ?? DIFFS.normal;
    return [['모드', m.name, m.desc], ['전장', `${mp.emoji} ${mp.name}`, ''], ['주무기', w.name, w.desc], ['봇 실력', d.name, '']];
  }
  renderMenu() {
    const rk = rankOf(this.xp), pct = rk.next ? ((this.xp - rk.base) / (rk.next - rk.base)) * 100 : 100;
    this.$menu.innerHTML = `<div class="fps-panel"><h3>🎖️ 스쿼드 슈터</h3>
      <div class="fps-rank">계급 <b style="color:#fde68a">${rk.name}</b> · 경험치 ${this.xp}${rk.next ? ` / ${rk.next}` : ''}<div class="fps-xp"><i style="width:${pct}%"></i></div></div>
      ${this.rows().map(([label, val, sub], i) => `<div class="fps-row ${i === this.sel.row ? 'on' : ''}"><button data-m="-1" data-row="${i}">◀</button><div><small>${label}</small><b>${val}</b><em>${sub}</em></div><button data-m="1" data-row="${i}">▶</button></div>`).join('')}
      <button class="fps-go" data-m="go">출전!</button>
      <div class="fps-hint">${this.touchMode ? '◀ ▶ 를 눌러 바꾸기' : '↑↓ 항목 · ←→ 변경 · Space 출전'}</div></div>`;
  }
  menuChange(d) {
    const r = this.sel.row, cyc = (v, n) => (v + d + n) % n;
    if (r === 0) this.sel.mode = cyc(this.sel.mode, MODES.length);
    else if (r === 1) { this.sel.map = cyc(this.sel.map, MAPS.length); this.loadMap(this.sel.map); }
    else if (r === 2) this.sel.weapon = cyc(this.sel.weapon, PRIMARIES.length);
    else { const ks = Object.keys(DIFFS); this._setCfg('difficulty', ks[cyc(ks.indexOf(this.cfg.difficulty), ks.length)]); }
    this.sound('move'); this.renderMenu();
  }
  menuGo() {
    try { localStorage.setItem(SEL_KEY, JSON.stringify({ mode: this.sel.mode, map: this.sel.map, weapon: this.sel.weapon })); } catch { /* 저장 불가 무시 */ }
    this.startMatch();
    this.requestLock();
  }

  // ---------------- 입력 ----------------
  isLocked() { const root = this.$screen.getRootNode?.() ?? document; return (root.pointerLockElement ?? document.pointerLockElement) === this.$screen; }
  requestLock() {
    if (this.touchMode || this.isLocked()) return;
    try { const p = this.$screen.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* 지원 안 함 → 키보드 방향키로 조준 */ }
  }
  bindInput() {
    this._onMouseMove = (e) => { if (this.isLocked() && this.state === 'playing') { this.look.dx += e.movementX; this.look.dy += e.movementY; } };
    this._onLockChange = () => {
      const locked = this.isLocked();
      if (!locked && this.wasLocked && this.state === 'playing' && this.phase === 'play' && !this.multi) this.pause();
      this.wasLocked = locked;
      if (!locked) this.mouse.fire = this.mouse.ads = false;
    };
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.$screen.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || this.phase !== 'play' || this.touchMode) return;
      if (!this.isLocked()) { this.requestLock(); return; }
      if (e.button === 0) this.mouse.fire = true; else if (e.button === 2) this.mouse.ads = true;
    });
    window.addEventListener('mouseup', this._onMouseUp = (e) => { if (e.button === 0) this.mouse.fire = false; else if (e.button === 2) this.mouse.ads = false; });
    this.$screen.addEventListener('wheel', (e) => { if (this.state === 'playing' && this.phase === 'play' && this.player?.alive) { e.preventDefault(); this.cycleWeapon(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
    // 터치: 왼쪽 = 이동 스틱, 오른쪽 = 조준, 버튼
    const T = this.$touch, tc = this.touch;
    const btn = (name, down, up) => {
      const el = T.querySelector(`[data-b="${name}"]`);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); sfx.unlock(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); el._last = [e.clientX, e.clientY]; down?.(el); });
      el.addEventListener('pointermove', (e) => { if (!el._last) return; this.look.dx += (e.clientX - el._last[0]) * 2.2; this.look.dy += (e.clientY - el._last[1]) * 2.2; el._last = [e.clientX, e.clientY]; }); // 버튼을 누른 채 끌어도 조준
      const end = (e) => { e.stopPropagation(); el._last = null; if (!el._toggle) el.classList.remove('on'); up?.(el); };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      return el;
    };
    btn('fire', () => { tc.fire = true; }, () => { tc.fire = false; });
    btn('jump', () => { this.jumpQ = true; });
    btn('reload', () => { if (this.player?.alive) this.startReload(this.player); else this.nextPrimary(1); });
    btn('switch', () => { if (this.player?.alive) this.cycleWeapon(1); else this.nextPrimary(1); });
    btn('nade', () => this.quickNade());
    const tog = (name, key) => { const el = btn(name, (b) => { tc[key] = !tc[key]; b.classList.toggle('on', tc[key]); }); el._toggle = true; };
    tog('ads', 'ads'); tog('crouch', 'crouch');
    T.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); sfx.unlock(); this._setTouchMode(true);
      const r = T.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      T.setPointerCapture?.(e.pointerId);
      if (x < 0.42 && tc.stickId === null) {
        tc.stickId = e.pointerId; tc.sx = e.clientX; tc.sy = e.clientY;
        this.$stick.hidden = false; this.$stick.style.left = `${e.clientX - r.left}px`; this.$stick.style.top = `${e.clientY - r.top}px`;
        this.$stick.firstElementChild.style.transform = 'translate(-50%,-50%)';
      } else if (tc.lookId === null) { tc.lookId = e.pointerId; tc.lx = e.clientX; tc.ly = e.clientY; }
    });
    T.addEventListener('pointermove', (e) => {
      if (e.pointerId === tc.stickId) {
        const R = Math.max(30, T.clientWidth * 0.09), dx = clamp((e.clientX - tc.sx) / R, -1, 1), dy = clamp((e.clientY - tc.sy) / R, -1, 1);
        tc.mx = dx; tc.mz = dy;
        this.$stick.firstElementChild.style.transform = `translate(calc(-50% + ${dx * R * 0.6}px), calc(-50% + ${dy * R * 0.6}px))`;
      } else if (e.pointerId === tc.lookId) { this.look.dx += (e.clientX - tc.lx) * 2.2; this.look.dy += (e.clientY - tc.ly) * 2.2; tc.lx = e.clientX; tc.ly = e.clientY; }
    });
    const end = (e) => {
      if (e.pointerId === tc.stickId) { tc.stickId = null; tc.mx = tc.mz = 0; this.$stick.hidden = true; }
      if (e.pointerId === tc.lookId) tc.lookId = null;
    };
    T.addEventListener('pointerup', end); T.addEventListener('pointercancel', end);
  }
  pause() { super.pause(); if (this.isLocked()) document.exitPointerLock?.(); }
  resume() { super.resume(); if (this.state === 'playing' && this.phase === 'play') this.requestLock(); }
  restart() { if (this.multi) return; super.restart(); }

  onAction(action, repeat) {
    if (this.phase === 'menu') {
      if (repeat && action === 'action') return;
      if (action === 'up' || action === 'looku') { this.sel.row = (this.sel.row + 3) % 4; this.renderMenu(); }
      else if (action === 'down' || action === 'lookd') { this.sel.row = (this.sel.row + 1) % 4; this.renderMenu(); }
      else if (action === 'left' || action === 'lookl') this.menuChange(-1);
      else if (action === 'right' || action === 'lookr') this.menuChange(1);
      else if (action === 'action' || action === 'fire') this.menuGo();
      return;
    }
    if (this.phase !== 'play' || repeat) return;
    const p = this.player;
    if (!p.alive) { const k = ['w1', 'w2', 'w3', 'w4', 'w5'].indexOf(action); if (k >= 0) { this.sel.weapon = k; this.sound('move'); } return; }
    switch (action) {
      case 'action': this.jumpQ = true; break;
      case 'reload': this.startReload(p); break;
      case 'w1': this.switchWeapon(p, 0); break;
      case 'w2': this.switchWeapon(p, 1); break;
      case 'w3': this.switchWeapon(p, 2); break;
      case 'w4': this.switchWeapon(p, 3); break;
      case 'last': this.switchWeapon(p, p.lastCur ?? 1); break;
      case 'nade': this.quickNade(); break;
      case 'melee': this.quickMelee(); break;
    }
  }
  nextPrimary(d) { this.sel.weapon = (this.sel.weapon + d + PRIMARIES.length) % PRIMARIES.length; this.sound('move'); }
  cycleWeapon(d) {
    const p = this.player; let i = p.cur;
    for (let k = 0; k < 4; k++) { i = (i + d + p.weapons.length) % p.weapons.length; const w = p.weapons[i]; if (!w.def.throw || p.nades > 0) break; }
    this.switchWeapon(p, i);
  }
  quickNade() { const p = this.player; if (this.phase === 'play' && p?.alive && p.nades > 0 && p.fireCd <= 0) { this.throwGrenade(p, p.yaw, p.pitch + 0.12); p.fireCd = 0.7; this.view.fire(true); } }
  quickMelee() { const p = this.player; if (this.phase !== 'play' || !p?.alive || p.fireCd > 0) return; const back = p.cur; if (back !== 2) { p.cur = 2; this.view.setWeapon('knife'); p.meleeBack = back; p.meleeBackT = 0.45; } this.tryFire(p); }

  // ---------------- 시작 ----------------
  init() {
    if (this.noGL) return;
    this.diff = DIFFS[this.cfg.difficulty] ?? DIFFS.normal;
    if (this.multi && this.pendingMulti) { this.pendingMulti = false; this.startMatch(); return; }
    if (this.multi) this.leaveMulti();
    this.clearMatch();
    this.phase = 'menu';
    this.setMusic('fps');
    this.loadMap(this.sel.map);
    this.setInfo('');
    this.renderMenu();
  }
  clearMatch() {
    for (const a of this.actors) this.dyn.remove(a.model.root);
    for (const g of this.grenades) this.dyn.remove(g.mesh);
    for (const p of this.pickups) this.dyn.remove(p.mesh);
    this.actors = []; this.grenades = []; this.pickups = []; this.feed = []; this.dmgInd = []; this.player = null;
  }

  makeActor(o) {
    const zdef = o.ztype ? ZOMBIES[o.ztype] : null;
    const a = {
      id: o.id, name: o.name, team: o.team, color: o.color, isPlayer: !!o.isPlayer, human: !!o.human, remote: !!o.remote, zombie: !!zdef, zdef,
      scale: zdef?.scale ?? 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, grounded: true, r: RADIUS * (zdef?.scale ?? 1), h: BODY_H * (zdef?.scale ?? 1),
      hp: 100, maxHp: 100, alive: false, crouch: false, ads: false, weapons: [], cur: 0, fireCd: 0, reloadT: 0, reloadDur: 1, switchT: 0, bloom: 0, nades: 0,
      kills: 0, deaths: 0, score: 0, streak: 0, respawnT: 0, protectT: 0, lastHurtT: -99, flashT: 0, deadT: 0, seenT: -99,
      primary: o.primary ?? 'ar', ai: o.isPlayer || o.remote ? null : newAI(),
    };
    a.model = buildSoldier({ color: zdef ? zdef.tint : o.color, zombie: !!zdef, skin: zdef ? zdef.tint : [0xe2b48a, 0xc98f62, 0xf0c9a0, 0x8d5a3b][Math.floor(Math.random() * 4)], scale: a.scale });
    a.model.root.visible = false;
    this.dyn.add(a.model.root);
    this.actors.push(a);
    return a;
  }
  giveLoadout(a) {
    const mk = (id) => { const d = WEAPONS[id]; return { def: d, mag: d.mag ?? 0, reserve: d.reserve ?? 0 }; };
    if (a.zombie) { a.weapons = [{ def: { ...WEAPONS.claw, dmg: a.zdef.dmg, reach: 1.9 }, mag: 0, reserve: 0 }]; a.cur = 0; return; }
    a.weapons = [mk(a.primary), mk('pistol'), mk('knife'), mk('grenade')];
    a.nades = a.isPlayer ? 2 : 1; a.cur = 0; a.reloadT = 0; a.fireCd = 0.3; a.switchT = 0; a.bloom = 0;
    setSoldierGun(a.model, a.primary);
  }
  randomPrimary() { const r = Math.random(); return r < 0.36 ? 'ar' : r < 0.6 ? 'smg' : r < 0.72 ? 'shotgun' : r < 0.86 ? 'sniper' : 'lmg'; }

  startMatch() {
    const mp = this.multi;
    this.clearMatch();
    this.mode = mp ? MODES.find((m) => m.id === mp.settings.mode) ?? MODES[0] : MODES[this.sel.mode];
    this.loadMap(mp ? clamp(Number(mp.settings.map ?? 0), 0, MAPS.length - 1) : this.sel.map);
    if (mp?.settings.difficulty) this.diff = DIFFS[mp.settings.difficulty] ?? this.diff;
    this.goal = mp ? Number(mp.settings.goal ?? this.mode.goal) : this.mode.goal;
    this.timeLeft = this.mode.time ?? 0;
    this.teamScore = [0, 0];
    this.phase = 'play'; this.startT = 2.6; this.endT = 0; this.matchOver = false;
    this.recoil = 0; this.adsK = 0; this.hitT = 0; this.hitKill = false; this.hurtT = 0; this.msg = null; this.lastKillT = -99; this.multiKill = 0; this.shakeT = 0; this.eyeY = EYE; this.bobT = 0; this.stepT = 0;
    this.stats = { kills: 0, deaths: 0, head: 0, shots: 0, hits: 0, bestStreak: 0, xp: 0 };
    this.wave = 0; this.waveT = 3; this.zQueue = []; this.zAlive = 0; this.flow = null; this.flowT = 0;
    this.touch.ads = this.touch.crouch = false;
    for (const b of this.$touch.querySelectorAll('button')) b.classList.remove('on');
    this.setRecord(`fps-${this.mode.id}`);
    this.setMusic(this.mode.zombie ? 'fps-zombie' : 'fps');
    // 봇 이름 섞기 (멀티에서는 모든 화면이 같은 순서가 되도록 방의 시드를 씀)
    let seed = mp ? (mp.seed >>> 0) || 1 : (Math.random() * 2 ** 31) | 1;
    const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    const names = [...BOT_NAMES]; for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    const myPrimary = PRIMARIES[this.sel.weapon];
    if (mp) {
      // 사람은 방에 들어온 순서대로 팀을 번갈아 배정, 빈자리는 봇 (봇은 방장이 계산)
      const humans = mp.players, teams = this.mode.teams;
      const per = teams ? Math.max(Math.ceil(humans.length / 2), mp.settings.bots === false ? 0 : Number(mp.settings.team ?? 4)) : 0;
      const roster = humans.map((p, i) => ({ id: p.id, name: p.name, human: true, team: teams ? i % 2 : 100 + i, primary: PRIMARIES[clamp(p.info?.weapon | 0, 0, PRIMARIES.length - 1)] }));
      if (mp.settings.bots !== false) {
        if (teams) for (const t of [0, 1]) for (let k = roster.filter((r) => r.team === t).length; k < per; k++) roster.push({ id: `bot${roster.length}`, name: names.pop(), team: t });
        else for (let k = roster.length; k < 8; k++) roster.push({ id: `bot${k}`, name: names.pop(), team: 100 + k });
      }
      roster.forEach((ro, i) => {
        const isPlayer = ro.id === mp.me;
        const a = this.makeActor({ ...ro, isPlayer, remote: ro.human ? !isPlayer : !mp.isHost, color: teams ? TEAM_COL[ro.team] : FFA_COL[i % FFA_COL.length], primary: ro.primary ?? this.seededPrimary(i) });
        a.slot = i;
        if (isPlayer) this.player = a;
      });
    } else if (this.mode.zombie) {
      this.player = this.makeActor({ id: 'me', name: '나', team: 0, color: TEAM_COL[0], isPlayer: true, human: true, primary: myPrimary });
    } else if (this.mode.teams) {
      const n = clamp(this.cfg.team | 0, 2, 6);
      this.player = this.makeActor({ id: 'me', name: '나', team: 0, color: TEAM_COL[0], isPlayer: true, human: true, primary: myPrimary });
      for (let i = 1; i < n; i++) this.makeActor({ id: `a${i}`, name: names.pop(), team: 0, color: TEAM_COL[0], primary: this.randomPrimary() });
      for (let i = 0; i < n; i++) this.makeActor({ id: `b${i}`, name: names.pop(), team: 1, color: TEAM_COL[1], primary: this.randomPrimary() });
    } else {
      this.player = this.makeActor({ id: 'me', name: '나', team: 100, color: FFA_COL[0], isPlayer: true, human: true, primary: myPrimary });
      for (let i = 1; i < 8; i++) this.makeActor({ id: `f${i}`, name: names.pop(), team: 100 + i, color: FFA_COL[i], primary: this.randomPrimary() });
    }
    this.actors.forEach((a, i) => { a.slot ??= i; if (!a.remote) this.spawn(a); else this.giveLoadout(a); });
    // 보급 상자
    for (const [x, z, type, y = 0] of MAPS[this.mapIdx].pickups) {
      const mesh = buildPickup(type); mesh.position.set(x, y, z); this.dyn.add(mesh);
      this.pickups.push({ x, y, z, type, t: 0, mesh });
    }
    this.view.setWeapon(this.player.weapons[0].def.id);
  }
  seededPrimary(i) { const r = ((this.multi?.seed ?? 1) * (i + 3) * 2654435761 >>> 0) / 4294967296; return r < 0.36 ? 'ar' : r < 0.6 ? 'smg' : r < 0.72 ? 'shotgun' : r < 0.86 ? 'sniper' : 'lmg'; }

  /** 부활 위치: 팀 구역(개인전은 적에게서 가장 먼 곳) 중 비어 있는 자리 */
  spawnPoint(a) {
    const sp = MAPS[this.mapIdx].spawns;
    if (this.mode.zombie && a.isPlayer) return sp.player;
    let list = this.mode.teams && !this.mode.zombie ? sp.a.map(([x, z]) => (a.team === 0 ? [x, z] : [-x, -z])) : sp.ffa;
    if (a.zombie) list = sp.zombie;
    let best = list[0], bs = -Infinity;
    for (const p of list) {
      let near = Infinity;
      for (const e of this.actors) { if (!e.alive || e === a) continue; const d = Math.hypot(e.x - p[0], e.z - p[1]); near = Math.min(near, e.team === a.team && !a.zombie ? (d < 1.2 ? 0 : 30) : d); }
      const s = Math.min(near, 40) + Math.random() * (a.zombie ? 25 : 6);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  spawn(a) {
    const [x, z, y = 0] = this.spawnPoint(a);
    if (a.isPlayer) a.primary = PRIMARIES[this.sel.weapon]; // 부활 대기 중에 고른 주무기
    Object.assign(a, { x: x + rnd(-0.3, 0.3), y, z: z + rnd(-0.3, 0.3), vx: 0, vz: 0, vy: 0, grounded: true, hp: a.maxHp, alive: true, crouch: false, h: BODY_H * a.scale, protectT: a.zombie ? 0 : PROTECT, streak: 0, deadT: 0, pitch: 0, respawnT: 0 });
    a.yaw = Math.atan2(a.x, a.z); // 맵 가운데를 바라봄
    if (a.ai) Object.assign(a.ai, newAI());
    this.giveLoadout(a);
    if (a.isPlayer) { this.view.setWeapon(a.weapons[0].def.id); this.recoil = 0; this.eyeY = EYE; }
    if (this.multi && !a.remote) this.multi.net.relay({ k: 'sp', id: a.id, w: a.primary });
  }

  // ---------------- 이동 (플레이어·봇 공통) ----------------
  /** wx,wz = 가고 싶은 방향(세계 좌표, 길이 ≤ 1) */
  stepActor(a, wx, wz, dt, { sprint = false, jump = false } = {}) {
    const w = a.weapons[a.cur]?.def;
    const stand = BODY_H * a.scale, low = BODY_H_CROUCH * a.scale;
    if (a.crouch) a.h = low; else if (a.h < stand) { if (!this.world.blocked(a.x, a.y, a.z, a.r, stand)) a.h = stand; else a.crouch = true; }
    let max = (a.zombie ? a.zdef.speed * (a.spdMul ?? 1) : WALK * (w?.speed ?? 1)) * (a.crouch ? 0.5 : sprint ? SPRINT : 1) * (a.ads ? 0.6 : 1);
    if (a.ai && !a.zombie) max *= 0.92;
    const k = Math.min(1, dt * (a.grounded ? 11 : 2.5));
    a.vx += (wx * max - a.vx) * k; a.vz += (wz * max - a.vz) * k;
    if (jump && a.grounded && !a.crouch) { a.vy = JUMP_V; a.grounded = false; if (a.isPlayer) this.sound('jump'); }
    a.sprinting = sprint && (wx || wz) && a.grounded;
    this.world.move(a, a.vx * dt, a.vz * dt, dt);
    if (a.landed > 0) { if (a.isPlayer) { this.sound('land'); this.shakeT = Math.max(this.shakeT, 0.12); } a.landed = 0; }
  }

  updatePlayer(dt) {
    const p = this.player, tm = this.touchMode, tc = this.touch;
    // 조준
    const zoom = 1 + (this.curDef(p).zoom - 1 || 0) * this.adsK;
    const sens = (this.cfg.sens ?? 8) * 0.00028 / Math.pow(zoom, 0.85) * (tm && this.aimOnEnemy ? 0.55 : 1);
    const kx = (this.isDown('lookr') ? 1 : 0) - (this.isDown('lookl') ? 1 : 0), ky = (this.isDown('lookd') ? 1 : 0) - (this.isDown('looku') ? 1 : 0);
    const ldx = this.look.dx + kx * 900 * dt, ldy = this.look.dy + ky * 600 * dt;
    this.lookDX = ldx; this.lookDY = ldy; this.look.dx = this.look.dy = 0;
    if (!p.alive) return;
    p.yaw -= ldx * sens; p.pitch = clamp(p.pitch - ldy * sens, -1.45, 1.45);
    // 반동은 서서히 되돌아옴
    const rec = this.recoil * Math.min(1, dt * 5.5); p.pitch -= rec; this.recoil -= rec;
    if (this.startT > 0.6) return; // 시작 전 준비 시간
    // 이동
    let mx = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0) + tc.mx, mz = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0) + tc.mz;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const wx = mx * c + mz * s, wz = -mx * s + mz * c;
    p.crouch = this.isDown('crouch') || tc.crouch;
    const wantAds = (this.mouse.ads || this.isDown('ads') || tc.ads) && p.reloadT <= 0 && p.switchT <= 0 && !this.curDef(p).melee && !this.curDef(p).throw;
    const sprint = (this.isDown('sprint') || (tm && tc.mz < -0.92)) && mz < -0.3 && !wantAds && !p.crouch;
    p.ads = wantAds;
    this.adsK += ((wantAds ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);
    const jump = this.jumpQ; this.jumpQ = false;
    this.stepActor(p, wx, wz, dt, { sprint, jump });
    // 발소리
    const sp = Math.hypot(p.vx, p.vz);
    if (p.grounded && sp > 1.5 && (this.stepT -= dt * sp) <= 0) { this.stepT = 3.2; noiseHit({ vol: p.crouch ? 0.02 : 0.05, freq: 240, dur: 0.07, type: 'lowpass' }); }
    // 사격
    const auto = this.cfg.autoFire === 'always' || (this.cfg.autoFire === 'touch' && tm);
    this.aimOnEnemy = false;
    this.aimOnEnemy = !!this.aimRay(p);
    const def = this.curDef(p);
    const wantFire = this.mouse.fire || this.isDown('fire') || tc.fire || (auto && this.aimOnEnemy && !def.throw && (!def.melee || this.aimDist < def.reach));
    if (wantFire && !(p.sprinting && !def.melee)) {
      if (def.auto || def.melee || !this.fireHeld || (auto && this.aimOnEnemy)) this.tryFire(p);
      this.fireHeld = true;
    } else this.fireHeld = false;
    if (p.meleeBackT > 0 && (p.meleeBackT -= dt) <= 0) { p.cur = p.meleeBack; this.view.setWeapon(this.curDef(p).id); }
  }
  curDef(a) { return a.weapons[a.cur]?.def ?? WEAPONS.knife; }
  /** 조준선이 적에게 닿아 있는지 (자동 사격·감도 보정용) */
  aimRay(p) {
    const o = this.eyeOf(p), d = this.dirOf(p.yaw, p.pitch);
    const wall = this.world.ray(o[0], o[1], o[2], d[0], d[1], d[2], 120);
    const h = this.hitActor(p, o, d, wall ? wall.t : 120);
    this.aimDist = h ? h.t : Infinity; this.aimAt = h?.a ?? null;
    return h && h.a.team !== p.team ? h : null;
  }

  // ---------------- 무기 ----------------
  eyeOf(a) { return [a.x, a.y + (a.isPlayer ? this.eyeY : (a.crouch ? EYE_CROUCH : EYE) * a.scale), a.z]; }
  dirOf(yaw, pitch) { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }
  /** 광선이 맞는 가장 가까운 사람 (자기 자신 제외) → { a, t, head } */
  hitActor(self, o, d, maxT, anyTeam = true) {
    let best = null;
    for (const e of this.actors) {
      if (!e.alive || e === self || (!anyTeam && e.team === self.team)) continue;
      const s = e.scale, ox = o[0] - e.x, oz = o[2] - e.z, r = 0.36 * s;
      // 몸통: 세로 원기둥
      const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), C = ox * ox + oz * oz - r * r;
      let tb = Infinity;
      if (A > 1e-8) { const disc = B * B - 4 * A * C; if (disc >= 0) { let t = (-B - Math.sqrt(disc)) / (2 * A); if (t < 0 && C < 0) t = 0; const y = o[1] + d[1] * t; if (t >= 0 && y >= e.y && y <= e.y + (e.crouch ? 1.0 : 1.45) * s) tb = t; } }
      // 머리: 공
      const hy = e.y + (e.crouch ? 1.14 : 1.62) * s, hr = 0.21 * s, px = ox, py = o[1] - hy, pz = oz;
      const b2 = px * d[0] + py * d[1] + pz * d[2], c2 = px * px + py * py + pz * pz - hr * hr, dh = b2 * b2 - c2;
      let th = Infinity; if (dh >= 0) { const t = -b2 - Math.sqrt(dh); if (t >= 0) th = t; }
      const t = Math.min(tb, th);
      if (t < maxT && (!best || t < best.t)) best = { a: e, t, head: th <= tb };
    }
    return best;
  }
  startReload(a) {
    const w = a.weapons[a.cur];
    if (!a.alive || a.reloadT > 0 || w.def.melee || w.def.throw || w.mag >= w.def.mag || w.reserve <= 0 || a.switchT > 0) return;
    a.reloadT = a.reloadDur = w.def.reload * (a.ai ? 1.1 : 1);
    if (a.isPlayer) { this.sound('lock'); this.touch.ads = false; this.$touch.querySelector('.f-ads')?.classList.remove('on'); }
  }
  switchWeapon(a, i) {
    if (!a.alive || i === a.cur || !a.weapons[i]) return;
    if (a.weapons[i].def.throw && a.nades <= 0) return;
    a.lastCur = a.cur; a.cur = i; a.reloadT = 0; a.switchT = 0.3; a.bloom = 0; a.meleeBackT = 0;
    setSoldierGun(a.model, a.weapons[i].def.id);
    if (a.isPlayer) { this.view.setWeapon(a.weapons[i].def.id); this.sound('move'); }
    if (this.multi && !a.remote) this.multi.net.relay({ k: 'sw', id: a.id, w: a.weapons[i].def.id });
  }
  /** 쏠 수 있으면 쏨 → 쐈으면 true */
  tryFire(a) {
    if (!a.alive || a.fireCd > 0 || a.switchT > 0 || this.startT > 0.6 || this.matchOver) return false;
    const w = a.weapons[a.cur], def = w.def;
    if (def.throw) { if (a.nades <= 0) return false; this.throwGrenade(a, a.yaw, a.pitch + 0.12); a.fireCd = 0.8; if (a.isPlayer) { this.view.fire(true); if (a.nades <= 0) this.switchWeapon(a, a.lastCur ?? 0); } return true; }
    if (def.melee) { a.fireCd = 60 / def.rpm; this.melee(a, def); return true; }
    if (a.reloadT > 0) return false;
    if (w.mag <= 0) { if (a.isPlayer && !this.fireHeld) this.sound('tick'); this.startReload(a); return false; }
    w.mag--; a.fireCd = 60 / def.rpm; a.flashT = 0.05; a.protectT = 0;
    this.shoot(a, def);
    if (w.mag === 0 && a.isPlayer) this.startReload(a);
    return true;
  }
  shoot(a, def) {
    const P = a.isPlayer, o = this.eyeOf(a), ads = P ? this.adsK : (a.ads ? 1 : 0);
    const sp = Math.hypot(a.vx, a.vz) / WALK;
    const spread = def.spread[0] + (def.spread[1] - def.spread[0]) * ads + a.bloom + (1 - ads * 0.6) * sp * 0.018 + (a.grounded ? 0 : 0.03) - (a.crouch ? 0.003 : 0);
    const n = def.pellets ?? 1, ends = [];
    // 총구 위치 (예광탄 시작점)
    const f = this.dirOf(a.yaw, a.pitch), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw), side = P ? 0.14 * (1 - ads) : 0.16;
    const mx = o[0] + f[0] * 0.7 + rx * side, my = o[1] + f[1] * 0.7 - (P ? 0.1 : 0.22), mz = o[2] + f[2] * 0.7 + rz * side;
    let hitAny = false;
    for (let k = 0; k < n; k++) {
      const yaw = a.yaw + (Math.random() + Math.random() - 1) * Math.max(0.0002, spread), pitch = a.pitch + (Math.random() + Math.random() - 1) * Math.max(0.0002, spread);
      const d = this.dirOf(yaw, pitch);
      const wall = this.world.ray(o[0], o[1], o[2], d[0], d[1], d[2], 220), wt = wall ? wall.t : 220;
      const h = this.hitActor(a, o, d, wt);
      const t = h ? h.t : wt, ex = o[0] + d[0] * t, ey = o[1] + d[1] * t, ez = o[2] + d[2] * t;
      ends.push(r2(ex), r2(ey), r2(ez));
      if (k < 3) this.effects.tracer(mx, my, mz, ex, ey, ez);
      if (h) {
        this.effects.blood(ex, ey, ez, h.a.zombie);
        if (h.a.team !== a.team) {
          const fall = t <= def.range[0] ? 1 : t >= def.range[1] ? def.range[2] : 1 - (1 - def.range[2]) * (t - def.range[0]) / (def.range[1] - def.range[0]);
          this.damage(h.a, def.dmg * fall * (h.head ? def.head : 1) * (a.ai ? this.diff.dmg : 1), a, def.id, h.head);
          hitAny = true;
        }
      } else if (wall) this.effects.impact(ex, ey, ez, wall.nx, wall.ny, wall.nz, wall.box ? 0xd8d2c4 : 0xcbb994);
    }
    a.bloom = Math.min(def.bloomMax, a.bloom + def.bloom);
    this.gunSound(def.id, a);
    alertBots(this, a.x, a.z, a.team, def.id === 'sniper' ? 55 : 38);
    a.seenT = this.time;
    if (P) {
      this.stats.shots++; if (hitAny) this.stats.hits++;
      const k = ads ? 0.65 : 1;
      a.pitch += def.recoil[0] * k; this.recoil += def.recoil[0] * k * 0.85; a.yaw += (Math.random() - 0.5) * 2 * def.recoil[1] * k;
      this.view.fire(false); this.shakeT = Math.max(this.shakeT, def.pellets || def.id === 'sniper' ? 0.14 : 0.05);
      this.vibrate(def.pellets ? 40 : 14);
      if (def.id === 'sniper') { this.touch.ads = false; this.$touch.querySelector('.f-ads')?.classList.remove('on'); }
    }
    if (this.multi && !a.remote) this.multi.net.relay({ k: 'sh', id: a.id, w: def.id, o: [r2(mx), r2(my), r2(mz)], e: ends.slice(0, 9) });
  }
  gunSound(id, a) {
    const s = GUN_SND[id]; if (!s) return;
    const p = this.player;
    if (a === p) return noiseHit(s);
    const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz), k = 1 / (1 + d / 9);
    noiseHit({ ...s, vol: s.vol * k * 0.8, thump: s.thump * k * 0.6, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (d + 4), freq: s.freq * (0.6 + 0.4 * k) });
  }
  melee(a, def) {
    if (a.isPlayer) { this.view.fire(true); noiseHit({ vol: 0.08, freq: 2500, dur: 0.09 }); }
    a.flashT = 0; a.protectT = 0;
    const f = this.dirOf(a.yaw, 0), reach = def.reach * a.scale;
    let best = null, bd = reach;
    for (const e of this.actors) {
      if (!e.alive || e.team === a.team) continue;
      const dx = e.x - a.x, dz = e.z - a.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(e.y - a.y) > 2 || (dx * f[0] + dz * f[2]) / (d || 1) < 0.45) continue;
      if (!this.world.los(a.x, a.y + 1.2, a.z, e.x, e.y + 1.1 * e.scale, e.z)) continue;
      best = e; bd = d;
    }
    if (!best) return;
    // 등 뒤에서 찌르면 즉사 (칼)
    const ef = this.dirOf(best.yaw, 0), back = def.id === 'knife' && ef[0] * f[0] + ef[2] * f[2] > 0.45;
    this.effects.blood(best.x, best.y + 1.2 * best.scale, best.z, best.zombie);
    this.damage(best, back ? 250 : def.dmg * (a.zombie && this.wave ? 1 + (this.wave - 1) * 0.04 : 1), a, def.id, false);
    if (this.multi && !a.remote) this.multi.net.relay({ k: 'ml', id: a.id });
  }
  throwGrenade(a, yaw, pitch) {
    if (a.nades <= 0) return;
    a.nades--; a.protectT = 0;
    const o = this.eyeOf(a), d = this.dirOf(yaw, pitch), v = 17;
    const g = { x: o[0] + d[0] * 0.5, y: o[1] - 0.1, z: o[2] + d[2] * 0.5, vx: d[0] * v + a.vx * 0.5, vy: d[1] * v + 1.5, vz: d[2] * v + a.vz * 0.5, t: WEAPONS.grenade.fuse, owner: a, local: !a.remote };
    this.addGrenade(g);
    if (this.multi && !a.remote) this.multi.net.relay({ k: 'gr', id: a.id, p: [r2(g.x), r2(g.y), r2(g.z)], v: [r2(g.vx), r2(g.vy), r2(g.vz)] });
  }
  addGrenade(g) { g.mesh = buildGrenadeMesh(); g.mesh.position.set(g.x, g.y, g.z); this.dyn.add(g.mesh); this.grenades.push(g); }
  updateGrenades(dt) {
    for (const g of this.grenades) {
      g.t -= dt; g.vy -= 16 * dt;
      const len = Math.hypot(g.vx, g.vy, g.vz) * dt;
      if (len > 1e-4) {
        const dx = g.vx * dt / len, dy = g.vy * dt / len, dz = g.vz * dt / len;
        const hit = this.world.ray(g.x, g.y, g.z, dx || 1e-9, dy || 1e-9, dz || 1e-9, len + 0.12);
        if (hit) { // 튕김
          const vn = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
          g.vx = (g.vx - 2 * vn * hit.nx) * 0.45; g.vy = (g.vy - 2 * vn * hit.ny) * 0.4; g.vz = (g.vz - 2 * vn * hit.nz) * 0.45;
          g.x += dx * Math.max(0, hit.t - 0.12); g.y += dy * Math.max(0, hit.t - 0.12); g.z += dz * Math.max(0, hit.t - 0.12);
          if (Math.abs(vn) > 2) this.soundAt(g.x, g.z, { vol: 0.07, freq: 1800, dur: 0.04 });
        } else { g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; }
      }
      g.y = Math.max(0.1, g.y);
      g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 9; g.mesh.rotation.z += dt * 6;
      if (g.t <= 0) this.explode(g);
    }
    this.grenades = this.grenades.filter((g) => g.t > 0);
  }
  explode(g) {
    this.dyn.remove(g.mesh);
    const def = WEAPONS.grenade, p = this.player;
    this.effects.explosion(g.x, g.y, g.z, def.radius);
    this.soundAt(g.x, g.z, { vol: 0.7, freq: 350, dur: 0.7, type: 'lowpass', thump: 0.6, thumpF: 90 });
    const dp = Math.hypot(p.x - g.x, p.z - g.z);
    if (dp < 22) { this.shakeT = Math.max(this.shakeT, 0.5 * (1 - dp / 22)); this.vibrate(120); }
    alertBots(this, g.x, g.z, g.owner.team, 40);
    if (!g.local) return; // 피해는 던진 쪽 화면에서만 계산
    for (const e of this.actors) {
      if (!e.alive || (e.team === g.owner.team && e !== g.owner)) continue;
      const d = Math.hypot(e.x - g.x, e.y + 0.9 - g.y, e.z - g.z);
      if (d > def.radius) continue;
      if (!this.world.los(g.x, g.y + 0.25, g.z, e.x, e.y + 1.0 * e.scale, e.z) && !this.world.los(g.x, g.y + 0.25, g.z, e.x, e.y + 1.6 * e.scale, e.z)) continue;
      this.damage(e, def.dmg * Math.pow(1 - d / def.radius, 0.8) * (e === g.owner ? 0.6 : 1) * (g.owner.ai ? this.diff.dmg : 1), g.owner, 'grenade', false);
    }
  }
  soundAt(x, z, s) {
    const p = this.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), k = 1 / (1 + d / 12);
    noiseHit({ ...s, vol: s.vol * k, thump: (s.thump ?? 0) * k, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (d + 4) });
  }

  // ---------------- 피해 · 처치 ----------------
  damage(v, amount, by, wid, head) {
    if (!v.alive || v.protectT > 0 || this.matchOver) return;
    amount = Math.round(amount);
    if (by.isPlayer && v !== by) { this.hitT = 0.18; this.hitKill = false; sfx.tone(head ? 1900 : 1300, head ? 1900 : 1300, 0.035, 0.05, 'square'); }
    if (v.remote) { this.multi?.net.relay({ k: 'hit', to: v.id, by: by.id, d: amount, w: wid, h: head ? 1 : 0 }); return; }
    v.hp -= amount; v.lastHurtT = this.time; v.lastHurtBy = by;
    if (v.isPlayer) {
      this.hurtT = 0.5; this.shakeT = Math.max(this.shakeT, 0.18); this.vibrate(50); this.sound('brick');
      if (by !== v) this.dmgInd.push({ x: by.x, z: by.z, t: 1.2 });
    }
    if (by.ai) by.ai.engageT = 0;
    if (v.ai && !v.zombie) { v.ai.alertT = 3; if (!v.ai.target && by !== v) { v.ai.chase = [by.x, by.z]; v.ai.goal = null; } }
    if (v.hp <= 0) this.kill(v, by, wid, head);
  }
  kill(v, by, wid, head) {
    v.alive = false; v.hp = 0; v.deadT = 0; v.deaths++; v.vx = v.vz = 0;
    v.fallDir = Math.cos(wrap(Math.atan2(-(by.x - v.x), -(by.z - v.z)) - v.yaw)) > 0 ? 1 : -1; // 맞은 반대쪽으로 쓰러짐
    v.respawnT = RESPAWN; v.killer = by; v.killWeapon = wid;
    if (this.multi && !v.remote) this.multi.net.relay({ k: 'die', id: v.id, by: by.id, w: wid, h: head ? 1 : 0 });
    this.onDeath(v, by, wid, head);
  }
  /** 처치 기록 (내 화면에서 죽었든, 다른 사람 화면에서 죽어 알림을 받았든 공통) */
  onDeath(v, by, wid, head) {
    const self = by === v;
    if (!self) { by.kills++; by.streak++; by.score += 100 + (head ? 50 : 0); if (this.mode.teams && !this.mode.zombie && by.team < 2) this.teamScore[by.team]++; }
    v.streak = 0;
    if (!v.zombie || by.isPlayer) this.feed.unshift({ k: self ? '' : by.name, kc: this.cssOf(by), v: v.name, vc: this.cssOf(v), w: WEAPONS[wid]?.icon ?? '', head, t: 6, me: by.isPlayer || v.isPlayer });
    if (this.feed.length > 5) this.feed.length = 5;
    if (v.zombie) { this.zAlive--; this.soundAt(v.x, v.z, { vol: 0.2, freq: 300, dur: 0.25, type: 'lowpass' }); }
    if (by.isPlayer && !self) {
      const st = this.stats; st.kills++; if (head) st.head++; st.bestStreak = Math.max(st.bestStreak, by.streak);
      this.hitT = 0.3; this.hitKill = true;
      const pts = v.zombie ? v.zdef.score : 100 + (head ? 50 : 0) + (wid === 'knife' ? 50 : 0);
      this.addScore(pts); st.xp += Math.round(pts * 0.5);
      this.multiKill = this.time - this.lastKillT < 4 ? this.multiKill + 1 : 1; this.lastKillT = this.time;
      const txt = this.multiKill >= 4 ? '쿼드라 킬!!' : this.multiKill === 3 ? '트리플 킬!' : this.multiKill === 2 ? '더블 킬!' : by.streak === 5 ? '5연속 처치!' : by.streak === 10 ? '10연속! 전장의 지배자' : head ? '헤드샷!' : wid === 'knife' ? '칼 처치!' : null;
      if (txt) this.msg = { text: txt, t: 1.6, color: head && this.multiKill < 2 ? '#fde68a' : '#fb923c' };
      this.sound(this.multiKill >= 2 || by.streak === 5 ? 'levelup' : 'bonus');
    }
    if (v.isPlayer) {
      this.stats.deaths++; this.mouse.fire = false; this.touch.fire = false;
      if (this.mode.zombie) { this.endT = 2.2; this.matchOver = true; this.endTitle = '💀 전사'; }
      else this.sound('hit');
    }
    this.checkGoal();
  }
  cssOf(a) { return a.zombie ? '#86efac' : this.mode.teams ? TEAM_CSS[a.team] ?? '#fff' : a.isPlayer ? '#60a5fa' : '#fca5a5'; }
  checkGoal() {
    if (this.matchOver || this.mode.zombie) return;
    if (this.multi && !this.multi.isHost) return; // 멀티는 방장이 끝을 알림
    const top = this.mode.teams ? Math.max(...this.teamScore) : Math.max(...this.actors.map((a) => a.kills));
    if (top >= this.goal || this.timeLeft <= 0) this.finish();
  }
  finish() {
    if (this.matchOver) return;
    this.matchOver = true; this.endT = 3;
    if (this.multi?.isHost) this.multi.net.relay({ k: 'end', ts: this.teamScore });
  }

  // ---------------- 매 프레임 ----------------
  update(dt) {
    if (this.noGL) return;
    this.effects.update(dt);
    if (this.phase === 'menu') return;
    const p = this.player;
    if (this.startT > 0) { const b = Math.ceil(this.startT - 0.6); this.startT -= dt; if (Math.ceil(this.startT - 0.6) !== b) this.sound(this.startT <= 0.6 ? 'start' : 'tick'); }
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    this.hitT -= dt; this.hurtT -= dt; this.shakeT -= dt;
    for (const f of this.feed) f.t -= dt;
    for (const d of this.dmgInd) d.t -= dt;
    this.dmgInd = this.dmgInd.filter((d) => d.t > 0);

    this.updatePlayer(dt);
    // 좀비용 거리 지도
    if (this.mode.zombie && (this.flowT -= dt) <= 0 && p.alive) { this.flowT = 0.25; this.flow = this.world.flowField(p.x, p.z, this.flow); }
    for (const a of this.actors) {
      a.fireCd -= dt; a.switchT -= dt; a.flashT -= dt; a.protectT -= dt;
      a.bloom = Math.max(0, a.bloom - dt * 0.09);
      if (a.remote) { this.remoteStep(a, dt); continue; }
      if (!a.alive) {
        a.deadT += dt;
        if (!a.zombie && !this.mode.zombie && !this.matchOver && (a.respawnT -= dt) <= 0) this.spawn(a);
        continue;
      }
      if (a.reloadT > 0 && (a.reloadT -= dt) <= 0) { const w = a.weapons[a.cur], n = Math.min(w.def.mag - w.mag, w.reserve); w.mag += n; w.reserve -= n; if (a.isPlayer) this.sound('rotate'); }
      if (a.hp < a.maxHp && !a.zombie && this.time - a.lastHurtT > REGEN_DELAY) a.hp = Math.min(a.maxHp, a.hp + REGEN_RATE * dt);
      if (a.ai && !this.matchOver && this.startT <= 0.6) (a.zombie ? updateZombie : updateBot)(this, a, dt);
      else if (a.ai) this.stepActor(a, 0, 0, dt);
    }
    this.separate();
    this.updateGrenades(dt);
    this.updatePickups(dt);
    if (this.mode.zombie) this.updateWaves(dt);
    else if (!this.matchOver && this.startT <= 0 && (!this.multi || this.multi.isHost)) { this.timeLeft -= dt; if (this.timeLeft <= 0) this.checkGoal(); }
    else if (!this.matchOver && this.startT <= 0) this.timeLeft -= dt;
    // 좀비 시체 정리
    if (this.mode.zombie) { for (const a of this.actors) if (a.zombie && !a.alive && a.deadT > 4.2) this.dyn.remove(a.model.root); this.actors = this.actors.filter((a) => !(a.zombie && !a.alive && a.deadT > 4.2)); }
    for (const a of this.actors) animateSoldier(a.model, a, dt, this.time);
    if (this.multi) this.netTick(dt);
    if (this.matchOver && (this.endT -= dt) <= 0) this.endMatch();
    this.setInfo(this.mode.zombie ? `웨이브 ${this.wave}` : `${p.kills}킬 ${p.deaths}데스`);
  }
  /** 겹친 사람끼리 살짝 밀어냄 */
  separate() {
    const A = this.actors;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      if (!a.alive || !b.alive || Math.abs(a.y - b.y) > 1.5) continue;
      const dx = b.x - a.x, dz = b.z - a.z, min = a.r + b.r + 0.08, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (min - d) * 0.5, nx = dx / d, nz = dz / d;
      if (!a.remote && !this.world.blocked(a.x - nx * push, a.y, a.z - nz * push, a.r, a.h)) { a.x -= nx * push; a.z -= nz * push; }
      if (!b.remote && !this.world.blocked(b.x + nx * push, b.y, b.z + nz * push, b.r, b.h)) { b.x += nx * push; b.z += nz * push; }
    }
  }
  updatePickups(dt) {
    for (const pk of this.pickups) {
      if (pk.t > 0) { pk.t -= dt; pk.mesh.visible = pk.t <= 0; continue; }
      pk.mesh.rotation.y += dt * 1.5; pk.mesh.position.y = pk.y + 0.25 + Math.sin(this.time * 2.5 + pk.x) * 0.08;
      for (const a of this.actors) {
        if (!a.alive || a.remote || a.zombie || Math.abs(a.y - pk.y) > 1.2 || (a.x - pk.x) ** 2 + (a.z - pk.z) ** 2 > 1.3) continue;
        const w0 = a.weapons[0], w1 = a.weapons[1];
        if (pk.type === 'health') { if (a.hp >= a.maxHp - 1) continue; a.hp = Math.min(a.maxHp, a.hp + 60); }
        else { if (w0.reserve >= w0.def.reserve && w1.reserve >= w1.def.reserve && a.nades >= 2) continue; w0.reserve = w0.def.reserve; w1.reserve = w1.def.reserve; a.nades = Math.min(2, a.nades + 1); }
        pk.t = 22; pk.mesh.visible = false;
        if (a.isPlayer) { this.sound('eat'); this.msg = { text: pk.type === 'health' ? '+ 체력 회복' : '+ 탄약 보급', t: 1, color: '#86efac' }; }
        if (this.multi) this.multi.net.relay({ k: 'pk', i: this.pickups.indexOf(pk) });
        break;
      }
    }
  }

  // ---------------- 좀비 웨이브 ----------------
  updateWaves(dt) {
    if (this.matchOver) return;
    if (!this.zQueue.length && this.zAlive <= 0) {
      if (this.waveT === null) { // 웨이브 끝: 보너스 + 보급
        if (this.wave > 0) { const bonus = 150 * this.wave; this.addScore(bonus); this.stats.xp += Math.round(bonus * 0.4); this.msg = { text: `웨이브 ${this.wave} 클리어! +${bonus}`, t: 2.2, color: '#86efac' }; this.sound('levelup'); const p = this.player; p.hp = Math.min(p.maxHp, p.hp + 40); for (const w of p.weapons) if (w.def.reserve) w.reserve = Math.min(w.def.reserve, w.reserve + w.def.mag * 2); p.nades = Math.min(2, p.nades + 1); for (const pk of this.pickups) pk.t = Math.min(pk.t, 0.1); }
        this.waveT = this.wave ? 6 : 3;
      }
      if ((this.waveT -= dt) <= 0) {
        this.wave++; this.waveT = null;
        const n = this.wave, q = [];
        for (let i = 0; i < 5 + n * 3; i++) q.push(Math.random() < Math.min(0.4, 0.06 * (n - 1)) ? 'runner' : 'walker');
        for (let i = 0; i < Math.floor(n / 3); i++) q.push('brute');
        if (n % 5 === 0) q.push('boss');
        this.zQueue = q.sort(() => Math.random() - 0.5); this.zSpawnT = 1;
        this.msg = { text: n % 5 === 0 ? `웨이브 ${n} - 좀비 왕 등장!` : `웨이브 ${n}`, t: 2, color: '#fca5a5' };
        this.sound('power');
      }
      return;
    }
    if (this.zQueue.length && this.zAlive < 22 && (this.zSpawnT -= dt) <= 0) {
      this.zSpawnT = Math.max(0.25, 0.9 - this.wave * 0.04);
      const type = this.zQueue.pop(), zd = ZOMBIES[type];
      const a = this.makeActor({ id: `z${this.wave}_${this.zQueue.length}`, name: zd.name, team: 1, ztype: type });
      a.maxHp = Math.round(zd.hp * (1 + (this.wave - 1) * 0.07)); a.spdMul = (1 + Math.min(0.3, (this.wave - 1) * 0.015)) * rnd(0.9, 1.1);
      this.spawn(a); this.zAlive++;
    }
  }

  endMatch() {
    this.phase = 'end';
    if (this.isLocked()) document.exitPointerLock?.();
    this.$touch.hidden = true;
    const p = this.player, st = this.stats;
    let title, win = false;
    if (this.mode.zombie) title = this.endTitle ?? '💀 전사';
    else if (this.mode.teams) { const my = this.teamScore[p.team], op = this.teamScore[1 - p.team]; win = my > op; title = my === op ? '🤝 무승부' : win ? '🏆 승리!' : '패배'; }
    else { const rank = [...this.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).indexOf(p) + 1; win = rank === 1; title = win ? '🏆 1위!' : `${rank}위`; }
    if (win) { this.addScore(500); st.xp += 300; }
    st.xp += 50;
    const before = rankOf(this.xp);
    this.xp += st.xp; try { localStorage.setItem(XP_KEY, String(this.xp)); } catch { /* 저장 불가 무시 */ }
    const after = rankOf(this.xp);
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const info = `${this.mode.zombie ? `웨이브 ${this.wave} · ` : this.mode.teams ? `${TEAM_NAME[p.team]} ${this.teamScore[p.team]} : ${this.teamScore[1 - p.team]} · ` : ''}${st.kills}킬 ${st.deaths}데스 · 헤드샷 ${st.head} · 명중률 ${acc}% · 최고 연속 ${st.bestStreak} · 경험치 +${st.xp}${after.idx > before.idx ? ` · 🎖️ ${after.name} 진급!` : ` (${after.name})`}`;
    if (this.multi) { if (this.multi.isHost) this.multi.net.end(); this.gameOver(title, info, { multi: true }); } else this.gameOver(title, info);
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    if (this.noGL) {
      ctx.fillStyle = '#0e0f14'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = '700 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('이 브라우저는 3D(WebGL)를 지원하지 않아요', W / 2, H / 2); ctx.textAlign = 'start';
      return;
    }
    const cam = this.cam, p = this.player, t = performance.now() / 1000;
    const menu = this.phase === 'menu' || !this.phase || !p;
    if (menu) { // 맵을 천천히 도는 카메라
      const R = Math.max(this.world.hx, this.world.hz) * 0.75, a = t * 0.12;
      cam.position.set(Math.cos(a) * R, 16, Math.sin(a) * R); cam.rotation.set(0, 0, 0); cam.lookAt(0, 1, 0);
      cam.fov = 60;
    } else if (!p.alive && p.killer && p.killer !== p && !this.mode.zombie) { // 죽으면 나를 잡은 상대를 바라봄
      const k = p.killer, dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz) || 1;
      cam.position.set(p.x - dx / d * 2.2, p.y + 2.3, p.z - dz / d * 2.2); cam.rotation.set(0, 0, 0); cam.lookAt(k.x, k.y + 1.2, k.z);
      cam.fov = 70;
    } else {
      const dt = 1 / 60;
      this.eyeY += ((p.crouch ? EYE_CROUCH : EYE) - this.eyeY) * Math.min(1, dt * 12);
      this.camY = this.camY === undefined || Math.abs(p.y - this.camY) > 1.5 ? p.y : this.camY + (p.y - this.camY) * Math.min(1, dt * 16); // 계단을 오를 때 부드럽게
      const sp = Math.hypot(p.vx, p.vz), sh = this.shakeT > 0 && this.cfg.shake ? this.shakeT : 0;
      this.bobT += sp * dt * 1.9;
      cam.position.set(p.x, this.camY + this.eyeY + (p.grounded ? Math.abs(Math.sin(this.bobT)) * 0.035 * Math.min(1, sp / 4) : 0) - (p.alive ? 0 : Math.min(1.2, p.deadT * 3)), p.z);
      cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh * 0.08, p.yaw + (Math.random() - 0.5) * sh * 0.08, p.alive ? 0 : Math.min(0.6, p.deadT * 2));
      const zoom = 1 + ((this.curDef(p).zoom ?? 1) - 1) * this.adsK;
      cam.fov = (2 * Math.atan(Math.tan(((this.cfg.fov ?? 75) * Math.PI) / 360) / zoom) * 180) / Math.PI + (p.sprinting ? 4 : 0);
    }
    cam.updateProjectionMatrix();
    // 내 몸은 1인칭에서는 숨기고, 쓰러져서 상대를 바라보는 동안만 보임
    if (p) p.model.root.visible = !menu && !p.alive && !!p.killer && p.killer !== p && !this.mode.zombie && p.deadT < 4;
    const showMenu = this.phase === 'menu' && this.state === 'playing', showTouch = this.phase === 'play' && this.state === 'playing' && this.touchMode;
    if (this.$menu.hidden === showMenu) this.$menu.hidden = !showMenu;
    if (this.$touch.hidden === showTouch) this.$touch.hidden = !showTouch;
    this.idleSkip = ((this.idleSkip ?? 0) + 1) % 3;
    const idle = this.state !== 'playing';
    if ((!idle || this.idleSkip === 0) && !this.glLost) {
      const r = this.renderer;
      r.clear();
      r.render(this.scene, cam);
      const def = p ? this.curDef(p) : null;
      if (!menu && p.alive && !(def.scope && this.adsK > 0.8)) {
        this.view.update(1 / 60, { ads: this.adsK, moving: p.grounded ? Math.min(1, Math.hypot(p.vx, p.vz) / WALK) : 0, sprint: p.sprinting, reload: p.reloadT > 0 ? 1 - p.reloadT / p.reloadDur : -1, switching: Math.max(0, p.switchT / 0.3), lookDX: this.lookDX ?? 0, lookDY: this.lookDY ?? 0, air: !p.grounded });
        r.clearDepth();
        r.render(this.view.scene, this.view.camera);
      }
    }
    if (!menu) this.drawHud(ctx);
  }

  project(x, y, z) {
    const v = (this._v ??= new THREE.Vector3()).set(x, y, z).project(this.cam);
    return v.z > 1 || v.z < -1 ? null : [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }

  drawHud(ctx) {
    const p = this.player, def = this.curDef(p), w = p.weapons[p.cur];
    const text = (s, x, y, font, color = '#fff', align = 'left') => { ctx.font = font; ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.textAlign = 'left'; };
    const F = (n, wt = 800) => `${wt} ${n}px system-ui, sans-serif`;
    // 이름표: 같은 편은 항상, 적은 조준선이 닿았을 때
    for (const a of this.actors) {
      if (!a.alive || a === p || a.zombie) continue;
      const mate = a.team === p.team;
      if (!mate && a !== this.aimAt) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z); if (d > 60) continue;
      const s = this.project(a.x, a.y + 2.0, a.z); if (!s) continue;
      if (mate && !this.world.los(p.x, p.y + 1.6, p.z, a.x, a.y + 1.6, a.z) && d > 12) ctx.globalAlpha = 0.45;
      text(a.name, s[0], s[1], F(mate ? 9 : 10), this.cssOf(a), 'center');
      if (mate) { ctx.fillStyle = this.cssOf(a); ctx.beginPath(); ctx.moveTo(s[0] - 3, s[1] + 3); ctx.lineTo(s[0] + 3, s[1] + 3); ctx.lineTo(s[0], s[1] + 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // 저격 조준경
    const scoped = def.scope && this.adsK > 0.8 && p.alive;
    if (scoped) {
      const R = H * 0.42;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2 - R, H / 2); ctx.lineTo(W / 2 + R, H / 2); ctx.moveTo(W / 2, H / 2 - R); ctx.lineTo(W / 2, H / 2 + R); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.stroke();
    } else if (p.alive && this.phase === 'play') { // 조준선: 퍼짐이 클수록 벌어짐
      const sp = Math.hypot(p.vx, p.vz) / WALK;
      const spread = def.melee || def.throw ? 0.012 : def.spread[0] + (def.spread[1] - def.spread[0]) * this.adsK + p.bloom + (1 - this.adsK * 0.6) * sp * 0.018 + (p.grounded ? 0 : 0.03);
      const gap = 3 + spread * 330, len = 6, cx = W / 2, cy = H / 2;
      ctx.globalAlpha = 1 - this.adsK * (def.melee ? 0 : 0.7);
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      const cross = () => { ctx.beginPath(); ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy); ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len); ctx.stroke(); };
      cross(); ctx.strokeStyle = this.aimAt && this.aimAt.team !== p.team ? '#f87171' : '#f8fafc'; ctx.lineWidth = 1.5; cross();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(cx - 0.8, cy - 0.8, 1.6, 1.6);
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      if (p.reloadT > 0) { ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.reloadT / p.reloadDur)); ctx.stroke(); text('재장전', cx, cy + 32, F(9), '#fde68a', 'center'); }
    }
    // 명중 표시
    if (this.hitT > 0) {
      const k = this.hitT / (this.hitKill ? 0.3 : 0.18), g = 5 + (1 - k) * 4, l = this.hitKill ? 8 : 5;
      ctx.strokeStyle = this.hitKill ? '#f87171' : '#fff'; ctx.lineWidth = this.hitKill ? 2.4 : 1.8; ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(W / 2 + sx * g, H / 2 + sy * g); ctx.lineTo(W / 2 + sx * (g + l), H / 2 + sy * (g + l)); } ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 맞은 방향 표시
    for (const d of this.dmgInd) {
      const ang = wrap(Math.atan2(-(d.x - p.x), -(d.z - p.z)) - p.yaw); // 0 = 정면, + = 왼쪽
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-ang);
      ctx.globalAlpha = Math.min(1, d.t) * 0.8; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 70, -Math.PI / 2 - 0.28, -Math.PI / 2 + 0.28); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    // 피해·낮은 체력: 화면 가장자리 붉게
    const low = p.alive ? Math.max(0, 1 - p.hp / 45) : 0, red = Math.max(this.hurtT > 0 ? this.hurtT * 1.2 : 0, low * 0.6);
    if (red > 0.02) { const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${Math.min(0.7, red)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    this.drawRadar(ctx, text, F);
    // 위 가운데: 점수 · 시간
    const top = 16;
    if (this.mode.zombie) {
      text(`웨이브 ${this.wave}`, W / 2, top, F(14), '#fca5a5', 'center');
      text(this.waveT !== null && this.wave ? `다음 웨이브까지 ${Math.ceil(this.waveT)}초` : `남은 좀비 ${this.zAlive + this.zQueue.length}`, W / 2, top + 13, F(9, 700), '#e5e7eb', 'center');
    } else if (this.mode.teams) {
      const my = p.team, bw = 54;
      ctx.fillStyle = 'rgba(10,14,22,.55)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw - 26, 4, bw * 2 + 52, 20, 8); ctx.fill();
      text(`${TEAM_NAME[my]} ${this.teamScore[my]}`, W / 2 - 24, top + 3, F(12), TEAM_CSS[my], 'right');
      text(fmtTime(this.timeLeft), W / 2, top + 3, F(11, 700), '#e5e7eb', 'center');
      text(`${this.teamScore[1 - my]} ${TEAM_NAME[1 - my]}`, W / 2 + 24, top + 3, F(12), TEAM_CSS[1 - my], 'left');
      text(`목표 ${this.goal}킬`, W / 2, top + 16, F(8, 700), '#9ca3af', 'center');
    } else {
      const order = [...this.actors].sort((a, b) => b.kills - a.kills), rank = order.indexOf(p) + 1;
      ctx.fillStyle = 'rgba(10,14,22,.55)'; ctx.beginPath(); ctx.roundRect(W / 2 - 92, 4, 184, 20, 8); ctx.fill();
      text(`${rank}위 · ${p.kills}킬`, W / 2 - 14, top + 3, F(12), '#60a5fa', 'right');
      text(fmtTime(this.timeLeft), W / 2 + 12, top + 3, F(11, 700), '#e5e7eb', 'center');
      text(`1위 ${order[0].kills}/${this.goal}`, W / 2 + 34, top + 3, F(10, 700), '#fca5a5', 'left');
    }
    // 킬 로그
    this.feed.forEach((f, i) => {
      if (f.t <= 0) return;
      ctx.globalAlpha = Math.min(1, f.t);
      const y = 14 + i * 13, s = `${f.k} `, mid = `[${f.w}${f.head ? '·헤드' : ''}] `;
      ctx.font = F(9); const wv = ctx.measureText(f.v).width, wm = ctx.measureText(mid).width, wk = ctx.measureText(s).width;
      if (f.me) { ctx.fillStyle = 'rgba(250,204,21,.18)'; ctx.fillRect(W - 10 - wv - wm - wk - 4, y - 9, wv + wm + wk + 8, 12); }
      text(f.v, W - 8, y, F(9), f.vc, 'right'); text(mid, W - 8 - wv, y, F(9, 700), '#e5e7eb', 'right'); text(s, W - 8 - wv - wm, y, F(9), f.kc, 'right');
    });
    ctx.globalAlpha = 1;
    // 체력
    const hw = 110, hx = 12, hy = H - 22, hk = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(10,14,22,.6)'; ctx.beginPath(); ctx.roundRect(hx - 4, hy - 16, hw + 46, 30, 8); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.roundRect(hx + 36, hy - 5, hw, 9, 4); ctx.fill();
    ctx.fillStyle = hk > 0.5 ? '#4ade80' : hk > 0.25 ? '#facc15' : '#ef4444'; if (hk > 0) { ctx.beginPath(); ctx.roundRect(hx + 36, hy - 5, hw * hk, 9, 4); ctx.fill(); }
    text(String(Math.ceil(p.hp)), hx + 30, hy + 5, F(17), '#fff', 'right'); text('체력', hx, hy - 8, F(7, 700), '#9ca3af');
    if (p.protectT > 0 && p.alive) text('부활 보호', hx + 38, hy - 8, F(8), '#93c5fd');
    // 탄약 · 무기
    const ax = W - 12, ay = H - 14;
    ctx.fillStyle = 'rgba(10,14,22,.6)'; ctx.beginPath(); ctx.roundRect(ax - 162, ay - 34, 166, 44, 8); ctx.fill();
    if (def.melee) text('—', ax - 6, ay, F(20), '#fff', 'right');
    else if (def.throw) text(`× ${p.nades}`, ax - 6, ay, F(20), '#fff', 'right');
    else { text(`/ ${w.reserve}`, ax - 6, ay, F(11, 700), '#9ca3af', 'right'); ctx.font = F(11, 700); const rw = ctx.measureText(`/ ${w.reserve}`).width; text(String(w.mag), ax - 10 - rw, ay, F(22), w.mag <= def.mag * 0.25 ? '#f87171' : '#fff', 'right'); }
    text(def.name, ax - 156, ay - 20, F(11), '#fde68a');
    p.weapons.forEach((x, i) => { const on = i === p.cur, bx = ax - 156 + i * 19; ctx.fillStyle = on ? '#3b82f6' : 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.roundRect(bx, ay - 12, 17, 12, 3); ctx.fill(); text(x.def.throw ? `${p.nades}` : String(i + 1), bx + 8.5, ay - 3, F(8), x.def.throw && !p.nades ? '#6b7280' : '#fff', 'center'); });
    // 가운데 알림
    if (this.msg) { ctx.globalAlpha = Math.min(1, this.msg.t * 2); text(this.msg.text, W / 2, H * 0.3, F(18), this.msg.color ?? '#fff', 'center'); ctx.globalAlpha = 1; }
    if (this.startT > 0) text(this.startT > 0.6 ? String(Math.ceil(this.startT - 0.6)) : '전투 시작!', W / 2, H * 0.42, F(this.startT > 0.6 ? 44 : 26), '#fde68a', 'center');
    if (!p.alive && !this.matchOver) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H * 0.56, W, 62);
      text(p.killer && p.killer !== p ? `${p.killer.name} 에게 처치당함 (${WEAPONS[p.killWeapon]?.name ?? ''})` : '쓰러졌습니다', W / 2, H * 0.56 + 18, F(13), '#fca5a5', 'center');
      text(`${Math.max(0, p.respawnT).toFixed(1)}초 후 부활`, W / 2, H * 0.56 + 34, F(11, 700), '#fff', 'center');
      text(`다음 주무기: ${WEAPONS[PRIMARIES[this.sel.weapon]].name}  (${this.touchMode ? '무기 버튼으로 변경' : '1~5 키로 변경'})`, W / 2, H * 0.56 + 50, F(9, 700), '#fde68a', 'center');
    }
    if (this.matchOver && this.endT > 0) text(this.mode.zombie ? '전사...' : '경기 종료!', W / 2, H * 0.42, F(30), '#fde68a', 'center');
    if (!this.touchMode && !this.isLocked() && this.state === 'playing' && !this.matchOver) text('화면을 클릭하면 마우스로 조준합니다 (방향키로도 조준 가능)', W / 2, H - 46, F(10, 700), '#fde68a', 'center');
    if (this.isDown('score') || (this.matchOver && this.endT > 0 && !this.mode.zombie)) this.drawScoreboard(ctx, text, F);
  }

  drawRadar(ctx, text, F) {
    const p = this.player, R = 38, cx = 12 + R, cy = 12 + R, sc = R / 30; // 30m 까지 표시
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,14,22,.6)'; ctx.fill(); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(p.yaw); // 내가 보는 방향이 위
    ctx.fillStyle = 'rgba(148,163,184,.5)';
    for (const o of this.radarBoxes) {
      if (o.x1 < p.x - 34 || o.x0 > p.x + 34 || o.z1 < p.z - 34 || o.z0 > p.z + 34) continue;
      ctx.fillRect((o.x0 - p.x) * sc, (o.z0 - p.z) * sc, (o.x1 - o.x0) * sc, (o.z1 - o.z0) * sc);
    }
    for (const pk of this.pickups) { if (pk.t > 0) continue; ctx.fillStyle = pk.type === 'health' ? '#f87171' : '#fde047'; ctx.fillRect((pk.x - p.x) * sc - 1.5, (pk.z - p.z) * sc - 1.5, 3, 3); }
    for (const a of this.actors) {
      if (!a.alive || a === p) continue;
      const mate = a.team === p.team;
      // 적은 방금 총을 쐈거나 아주 가까울 때만 보임
      if (!mate && !(this.time - a.seenT < 2.5 || a.zombie || Math.hypot(a.x - p.x, a.z - p.z) < 8)) continue;
      ctx.fillStyle = mate ? '#60a5fa' : a.zombie ? '#86efac' : '#f87171';
      ctx.beginPath(); ctx.arc((a.x - p.x) * sc, (a.z - p.z) * sc, mate ? 2.2 : 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx - 3.5, cy + 3.5); ctx.lineTo(cx + 3.5, cy + 3.5); ctx.fill();
  }

  drawScoreboard(ctx, text, F) {
    const list = [...this.actors].filter((a) => !a.zombie).sort((a, b) => (this.mode.teams ? a.team - b.team : 0) || b.kills - a.kills || a.deaths - b.deaths);
    const rowH = 15, w = 300, h = 34 + list.length * rowH, x = (W - w) / 2, y = Math.max(30, (H - h) / 2);
    ctx.fillStyle = 'rgba(8,11,18,.86)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    text(`${this.mode.name} · ${MAPS[this.mapIdx].name}`, x + 12, y + 16, F(11), '#fde68a');
    text('킬', x + w - 70, y + 16, F(9, 700), '#9ca3af', 'right'); text('데스', x + w - 14, y + 16, F(9, 700), '#9ca3af', 'right');
    list.forEach((a, i) => {
      const ry = y + 34 + i * rowH;
      if (a.isPlayer) { ctx.fillStyle = 'rgba(250,204,21,.16)'; ctx.fillRect(x + 6, ry - 11, w - 12, rowH - 1); }
      ctx.fillStyle = this.cssOf(a); ctx.beginPath(); ctx.arc(x + 16, ry - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      text(`${a.name}${a.human && !a.isPlayer ? ' 👤' : ''}${a.alive ? '' : ' ✖'}`, x + 26, ry, F(10, a.isPlayer ? 800 : 600), a.isPlayer ? '#fde68a' : '#e5e7eb');
      text(String(a.kills), x + w - 70, ry, F(10), '#fff', 'right'); text(String(a.deaths), x + w - 14, ry, F(10, 600), '#cbd5e1', 'right');
    });
  }

  // ---------------- 멀티플레이 ----------------
  lobbyConfig() {
    return {
      settings: [
        { id: 'mode', label: '모드', type: 'select', default: 'tdm', options: [['tdm', '팀 데스매치'], ['ffa', '개인전']] },
        { id: 'map', label: '전장', type: 'select', default: 0, options: MAPS.map((m, i) => [i, `${m.emoji} ${m.name}`]) },
        { id: 'goal', label: '목표 킬', type: 'range', min: 10, max: 50, step: 5, default: 30 },
        { id: 'team', label: '팀 인원 (봇 포함)', type: 'range', min: 2, max: 6, default: 4 },
        { id: 'bots', label: '빈자리 봇으로 채우기', type: 'toggle', default: true },
        { id: 'difficulty', label: '봇 실력', type: 'select', default: 'normal', options: [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']] },
      ],
      info: [{ id: 'weapon', label: '주무기', type: 'select', default: 0, options: PRIMARIES.map((id, i) => [i, WEAPONS[id].name]) }],
    };
  }
  describeInfo(info) { return `${WEAPONS[PRIMARIES[info?.weapon ?? 0]]?.name ?? ''} `; }
  startMulti(net, start) {
    if (this.noGL) return;
    this.leaveMulti();
    this.multi = { net, me: net.id, isHost: net.isHost, seed: start.seed, settings: start.settings ?? {}, players: start.players, sendT: 0 };
    const mine = start.players.find((q) => q.id === net.id);
    if (mine?.info?.weapon !== undefined) this.sel.weapon = clamp(mine.info.weapon | 0, 0, PRIMARIES.length - 1);
    this.offNet = [
      net.on('msg', (from, d) => this.onNet(from, d)),
      net.on('left', (id) => this.playerLeft(id)),
      net.on('room', (room) => { // 방장이 나가면 내가 봇을 이어받음
        if (this.multi && room && room.host === this.multi.me && !this.multi.isHost) {
          this.multi.isHost = true;
          for (const a of this.actors) if (!a.human) { a.remote = false; a.ai = newAI(); if (!a.alive) a.respawnT = 1; }
        }
      }),
    ];
    this.noAutoPause = true;
    this.pendingMulti = true;
    this.start();
    this.requestLock();
  }
  leaveMulti() { this.offNet?.forEach((off) => off()); this.offNet = null; this.multi = null; this.noAutoPause = false; }
  onNetClosed() { if (this.multi && this.phase === 'play' && !this.matchOver) { this.matchOver = true; this.endT = 0.5; } }
  byId(id) { return this.actors.find((a) => a.id === id); }
  playerLeft(id) {
    const a = this.byId(id); if (!a || !this.multi) return;
    this.dyn.remove(a.model.root); this.actors = this.actors.filter((x) => x !== a);
    this.msg = { text: `${a.name} 님이 나갔어요`, t: 1.5 };
  }
  enc(a) { return [a.id, r2(a.x), r2(a.y), r2(a.z), r2(a.yaw), r2(a.pitch), (a.alive ? 1 : 0) | (a.crouch ? 2 : 0) | (a.protectT > 0 ? 4 : 0), Math.round(a.hp), r2(a.vx), r2(a.vz)]; }
  netTick(dt) {
    const m = this.multi;
    if ((m.sendT += dt) < SEND_RATE) return;
    m.sendT = 0;
    const msg = { k: 'st', a: this.actors.filter((a) => !a.remote).map((a) => this.enc(a)) };
    if (m.isHost) { msg.t = Math.round(this.timeLeft); msg.ts = this.teamScore; }
    m.net.relay(msg);
  }
  remoteStep(a, dt) {
    const n = a.net;
    if (!n) return;
    const k = Math.min(1, dt * 14);
    if (n.alive && !a.alive) { Object.assign(a, { alive: true, x: n.x, y: n.y, z: n.z, deadT: 0 }); }
    if (!a.alive) { a.deadT += dt; return; }
    const age = Math.min(0.2, (performance.now() - a.netAt) / 1000), px = n.x + n.vx * age, pz = n.z + n.vz * age;
    if (Math.hypot(px - a.x, pz - a.z) > 6) { a.x = px; a.z = pz; a.y = n.y; }
    a.x += (px - a.x) * k; a.y += (n.y - a.y) * k; a.z += (pz - a.z) * k;
    a.yaw += wrap(n.yaw - a.yaw) * k; a.pitch += (n.pitch - a.pitch) * k;
    a.vx = n.vx; a.vz = n.vz; a.crouch = n.crouch; a.hp = n.hp; a.protectT = n.prot ? 0.2 : 0;
  }
  onNet(from, d) {
    if (!this.multi || !d || this.phase !== 'play') return;
    switch (d.k) {
      case 'st':
        for (const s of d.a) {
          const a = this.byId(s[0]); if (!a || !a.remote) continue;
          a.net = { x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5], alive: !!(s[6] & 1), crouch: !!(s[6] & 2), prot: !!(s[6] & 4), hp: s[7], vx: s[8], vz: s[9] };
          a.netAt = performance.now();
        }
        if (d.t !== undefined && !this.multi.isHost) { this.timeLeft = d.t; }
        break;
      case 'sp': { const a = this.byId(d.id); if (a?.remote) { a.primary = d.w; a.alive = true; a.deadT = 0; a.hp = a.maxHp; this.giveLoadout(a); if (a.net) { a.net.alive = true; } } break; }
      case 'sw': { const a = this.byId(d.id); if (a?.remote) setSoldierGun(a.model, d.w); break; }
      case 'sh': {
        const a = this.byId(d.id); if (!a?.remote) break;
        a.flashT = 0.05; a.seenT = this.time;
        for (let i = 0; i < d.e.length; i += 3) this.effects.tracer(d.o[0], d.o[1], d.o[2], d.e[i], d.e[i + 1], d.e[i + 2]);
        this.gunSound(d.w, a);
        break;
      }
      case 'gr': { const a = this.byId(d.id); if (a) this.addGrenade({ x: d.p[0], y: d.p[1], z: d.p[2], vx: d.v[0], vy: d.v[1], vz: d.v[2], t: WEAPONS.grenade.fuse, owner: a, local: false }); break; }
      case 'hit': { // 다른 화면에서 내(또는 내가 맡은 봇)가 맞음
        const v = this.byId(d.to), by = this.byId(d.by);
        if (v && by && !v.remote) this.damage(v, d.d, by, d.w, !!d.h);
        break;
      }
      case 'die': {
        const v = this.byId(d.id), by = this.byId(d.by) ?? v;
        if (v?.remote && v.alive !== false) { v.alive = false; v.deadT = 0; v.deaths++; v.killer = by; if (v.net) v.net.alive = false; v.fallDir = 1; this.onDeath(v, by, d.w, !!d.h); }
        break;
      }
      case 'pk': { const pk = this.pickups[d.i]; if (pk) { pk.t = 22; pk.mesh.visible = false; } break; }
      case 'end': if (!this.matchOver) { if (d.ts) this.teamScore = d.ts; this.matchOver = true; this.endT = 3; } break;
    }
  }
}
