// 스쿼드 슈터 - 병사 · 총 · 1인칭 손 모델과 이펙트 (모서리를 살짝 굴린 단순한 상자 조합)
import * as THREE from '../../vendor/three.module.min.js';
import { roundedBox, part, merge, mix } from '../kart/shapes.js';
import { Sparks } from '../kart/models.js';

const VC = new THREE.MeshLambertMaterial({ vertexColors: true });
const HALF = Math.PI / 2;
const GUN_DARK = 0x2a2e35, GUN_MID = 0x4a505a, WOOD = 0x8a5a33, STEEL = 0xb8c0c8;
/** [가로, 세로, 길이, x, y, z, 색, x축 회전] 목록 → 합친 모양 (총구 = -Z) */
const boxes = (list) => merge(list.map(([w, h, d, x, y, z, c, rx = 0, ry = 0]) => part(roundedBox(w, h, d, Math.min(w, h, d) * 0.28, 1), c, x, y, z, rx, ry)));

// 총 모양: 원점 = 오른손이 잡는 손잡이 위. muzzle = 총구 위치(z)
const GUN_SHAPES = {
  ar: { muzzle: -0.82, parts: [[0.06, 0.1, 0.46, 0, 0.04, -0.18, GUN_DARK], [0.07, 0.075, 0.26, 0, 0.035, -0.5, GUN_MID], [0.028, 0.028, 0.22, 0, 0.045, -0.72, GUN_DARK], [0.05, 0.11, 0.24, 0, 0.015, 0.16, GUN_MID], [0.045, 0.13, 0.055, 0, -0.07, 0, GUN_DARK, 0.25], [0.04, 0.17, 0.075, 0, -0.1, -0.2, GUN_DARK, -0.18], [0.02, 0.05, 0.03, 0, 0.11, -0.05, GUN_DARK], [0.02, 0.05, 0.02, 0, 0.1, -0.6, GUN_DARK]] },
  smg: { muzzle: -0.56, parts: [[0.06, 0.11, 0.36, 0, 0.04, -0.14, GUN_DARK], [0.03, 0.03, 0.14, 0, 0.05, -0.38, GUN_MID], [0.045, 0.045, 0.1, 0, 0.05, -0.5, GUN_DARK], [0.03, 0.05, 0.2, 0, 0.05, 0.14, GUN_MID], [0.045, 0.12, 0.055, 0, -0.07, 0, GUN_DARK, 0.2], [0.035, 0.22, 0.06, 0, -0.13, -0.16, GUN_DARK], [0.02, 0.035, 0.03, 0, 0.11, -0.2, GUN_DARK]] },
  shotgun: { muzzle: -0.84, parts: [[0.065, 0.09, 0.36, 0, 0.04, -0.12, GUN_DARK], [0.04, 0.04, 0.5, 0, 0.06, -0.58, GUN_DARK], [0.045, 0.045, 0.38, 0, 0.005, -0.52, GUN_MID], [0.065, 0.065, 0.2, 0, 0.005, -0.44, WOOD], [0.05, 0.1, 0.3, 0, -0.005, 0.18, WOOD, 0.12], [0.045, 0.1, 0.05, 0, -0.06, 0.02, WOOD, 0.35]] },
  sniper: { muzzle: -1.08, parts: [[0.06, 0.09, 0.5, 0, 0.04, -0.16, 0x3f4a3a], [0.026, 0.026, 0.56, 0, 0.05, -0.68, GUN_DARK], [0.05, 0.05, 0.1, 0, 0.05, -1.02, GUN_DARK], [0.055, 0.12, 0.32, 0, 0.005, 0.2, 0x3f4a3a], [0.045, 0.12, 0.055, 0, -0.07, 0.02, GUN_DARK, 0.25], [0.04, 0.1, 0.07, 0, -0.07, -0.18, GUN_DARK], [0.055, 0.055, 0.3, 0, 0.13, -0.16, GUN_DARK], [0.07, 0.07, 0.06, 0, 0.13, -0.33, GUN_MID], [0.065, 0.065, 0.05, 0, 0.13, 0, GUN_MID], [0.02, 0.05, 0.03, 0, 0.09, -0.08, GUN_DARK], [0.02, 0.05, 0.03, 0, 0.09, -0.24, GUN_DARK]] },
  lmg: { muzzle: -0.92, parts: [[0.075, 0.12, 0.5, 0, 0.04, -0.18, GUN_DARK], [0.035, 0.035, 0.42, 0, 0.055, -0.66, GUN_DARK], [0.075, 0.07, 0.22, 0, 0.035, -0.5, GUN_MID], [0.055, 0.12, 0.26, 0, 0.015, 0.18, GUN_MID], [0.045, 0.13, 0.055, 0, -0.075, 0.02, GUN_DARK, 0.25], [0.13, 0.13, 0.15, -0.03, -0.1, -0.22, 0x55603c], [0.02, 0.2, 0.02, 0.05, -0.1, -0.62, GUN_MID, 0.3], [0.02, 0.2, 0.02, -0.05, -0.1, -0.62, GUN_MID, 0.3]] },
  pistol: { muzzle: -0.24, parts: [[0.04, 0.055, 0.22, 0, 0.045, -0.1, GUN_MID], [0.035, 0.03, 0.2, 0, 0.01, -0.1, GUN_DARK], [0.04, 0.13, 0.055, 0, -0.06, 0, GUN_DARK, 0.2], [0.012, 0.02, 0.02, 0, 0.08, -0.19, GUN_DARK], [0.02, 0.02, 0.02, 0, 0.08, 0, GUN_DARK]] },
  knife: { muzzle: -0.3, parts: [[0.012, 0.045, 0.24, 0, 0.02, -0.2, STEEL], [0.012, 0.03, 0.06, 0, 0.012, -0.33, STEEL, 0.3], [0.05, 0.02, 0.025, 0, 0.02, -0.07, GUN_DARK], [0.03, 0.04, 0.12, 0, 0.02, 0, 0x3a2a1e]] },
  grenade: { muzzle: -0.1, parts: [[0.085, 0.1, 0.085, 0, 0.03, -0.06, 0x4c5f3a], [0.03, 0.035, 0.03, 0, 0.095, -0.06, STEEL], [0.012, 0.06, 0.05, 0.03, 0.08, -0.06, STEEL]] },
};
const gunCache = {};
export function gunGeo(id) { return (gunCache[id] ??= boxes(GUN_SHAPES[id].parts)); }
export const muzzleZ = (id) => GUN_SHAPES[id]?.muzzle ?? -0.5;

let flashTex;
function flashTexture() {
  if (flashTex) return flashTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,140,.95)'); g.addColorStop(0.6, 'rgba(255,150,40,.5)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,240,180,.9)'; c.lineWidth = 5; c.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(32 - Math.cos(a) * 28, 32 - Math.sin(a) * 28); c.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); c.stroke(); }
  return (flashTex = new THREE.CanvasTexture(cv));
}
const flashMat = () => new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

// ---------------- 병사 ----------------
const soldierCache = new Map();
function soldierGeo(color, zombie, skin) {
  const key = `${color}|${zombie}|${skin}`;
  let g = soldierCache.get(key);
  if (g) return g;
  const dark = mix(color, 0x000000, 0.45), camo = zombie ? mix(color, 0x3a2f2a, 0.55) : mix(color, 0x5a6048, 0.62), boot = 0x23262b, glove = zombie ? skin : 0x2b2f36;
  const B = (w, h, d, c, x, y, z, rx = 0, rz = 0) => part(roundedBox(w, h, d, Math.min(w, h, d) * 0.25, 1), c, x, y, z, rx, 0, rz);
  // 다리: 원점 = 엉덩이 관절
  const leg = merge([B(0.2, 0.5, 0.22, camo, 0, -0.25, 0), B(0.19, 0.36, 0.2, zombie ? camo : dark, 0, -0.6, 0), B(0.21, 0.12, 0.3, boot, 0, -0.8, -0.04)]);
  // 윗몸: 원점 = 허리 (y 0.9)
  const up = [B(0.5, 0.56, 0.27, camo, 0, 0.3, 0), B(0.2, 0.1, 0.18, skin, 0, 0.61, 0), B(0.27, 0.27, 0.27, skin, 0, 0.78, 0)];
  if (zombie) {
    up.push(B(0.07, 0.05, 0.02, 0xf3e96b, -0.065, 0.8, -0.137), B(0.07, 0.05, 0.02, 0xf3e96b, 0.065, 0.8, -0.137), B(0.14, 0.03, 0.02, 0x3b1d1d, 0, 0.71, -0.137));
    up.push(B(0.5, 0.1, 0.28, 0x3a2f2a, 0, 0.07, 0), B(0.3, 0.06, 0.29, mix(skin, 0x000000, 0.3), 0.05, 0.36, 0.0));
    for (const s of [-1, 1]) up.push(B(0.13, 0.5, 0.14, skin, s * 0.32, 0.42, -0.24, -1.45, s * 0.08), B(0.12, 0.1, 0.12, mix(skin, 0x000000, 0.25), s * 0.3, 0.45, -0.52));
  } else {
    up.push(B(0.52, 0.34, 0.31, color, 0, 0.34, 0), B(0.3, 0.3, 0.14, dark, 0, 0.34, 0.19));        // 조끼 · 배낭
    up.push(B(0.31, 0.15, 0.31, dark, 0, 0.9, 0), B(0.32, 0.05, 0.36, dark, 0, 0.84, -0.01));        // 헬멧
    up.push(B(0.24, 0.07, 0.03, 0x1b2430, 0, 0.8, -0.137), B(0.5, 0.07, 0.2, dark, 0, 0.06, 0));      // 고글 · 벨트
    for (const s of [-1, 1]) up.push(B(0.11, 0.1, 0.14, color, s * 0.3, 0.53, 0));                    // 어깨 패드
  }
  const upper = merge(up);
  // 팔 (총을 든 자세): 원점 = 허리
  const arms = zombie ? null : merge([
    B(0.12, 0.42, 0.13, camo, 0.26, 0.38, -0.14, -1.05, -0.25), B(0.1, 0.1, 0.1, glove, 0.2, 0.3, -0.36),
    B(0.12, 0.5, 0.13, camo, -0.2, 0.36, -0.24, -1.3, 0.5), B(0.1, 0.1, 0.1, glove, -0.02, 0.33, -0.56),
  ]);
  soldierCache.set(key, g = { leg, upper, arms });
  return g;
}

/** 병사 모델. color = 팀 색, zombie = 좀비 모양, scale = 크기 */
export function buildSoldier({ color = 0x3b82f6, zombie = false, skin = 0xe2b48a, scale = 1 } = {}) {
  const G = soldierGeo(color, zombie, skin);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); root.scale.setScalar(scale);
  const mk = (geo, x, y, z) => { const m = new THREE.Mesh(geo, VC); m.position.set(x, y, z); m.castShadow = true; return m; };
  const legL = mk(G.leg, -0.12, 0.9, 0), legR = mk(G.leg, 0.12, 0.9, 0);
  const upper = new THREE.Group(); upper.position.y = 0.9;
  upper.add(mk(G.upper, 0, 0, 0));
  if (G.arms) upper.add(mk(G.arms, 0, 0, 0));
  const gun = new THREE.Mesh(gunGeo('ar'), VC); gun.position.set(0.16, 0.34, -0.3); gun.castShadow = true;
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat()); flash.visible = false;
  if (!zombie) { upper.add(gun); gun.add(flash); }
  body.add(legL, legR, upper);
  const m = { root, body, legL, legR, upper, gun, flash, phase: Math.random() * 6, gunId: 'ar', zombie, crouchK: 0 };
  return m;
}
export function setSoldierGun(m, id) {
  if (m.zombie || m.gunId === id) return;
  m.gunId = id; m.gun.geometry = gunGeo(id); m.flash.position.set(0, 0.05, muzzleZ(id) - 0.12);
}
/** 매 프레임: 위치·방향·걷기·앉기·쓰러짐 */
export function animateSoldier(m, a, dt, time) {
  m.root.position.set(a.x, a.y, a.z);
  m.root.rotation.y = a.yaw;
  if (!a.alive) {
    const t = Math.min(1, (a.deadT ?? 0) / 0.4);
    m.body.rotation.x = t * HALF * (a.fallDir ?? 1); m.body.position.y = t * 0.14; m.body.position.z = 0;
    m.root.visible = (a.deadT ?? 0) < 4;
    if (a.deadT > 3) m.root.position.y = a.y - (a.deadT - 3) * 0.4; // 천천히 가라앉아 사라짐
    return;
  }
  m.root.visible = true;
  m.body.rotation.x = 0;
  const sp = Math.hypot(a.vx ?? 0, a.vz ?? 0), k = Math.min(1, sp / 4);
  m.phase += sp * dt * 2.4;
  m.crouchK += ((a.crouch ? 1 : 0) - m.crouchK) * Math.min(1, dt * 12);
  const c = m.crouchK, sw = Math.sin(m.phase) * 0.8 * k;
  m.body.position.y = -0.42 * c + Math.abs(Math.sin(m.phase)) * 0.04 * k;
  m.legL.rotation.x = sw - c * 1.1; m.legR.rotation.x = -sw + c * 0.5;
  m.legL.scale.y = m.legR.scale.y = 1 - c * 0.42;
  m.legR.position.z = c * 0.12;
  m.upper.rotation.x = (a.pitch ?? 0) * 0.75 + (m.zombie ? Math.sin(time * 3 + m.phase) * 0.08 - 0.12 : 0);
  m.upper.rotation.z = m.zombie ? Math.sin(time * 2 + m.phase) * 0.1 : 0;
  if (!m.zombie) { m.flash.visible = (a.flashT ?? 0) > 0; if (m.flash.visible) m.flash.rotation.z = Math.random() * 6; }
}

// ---------------- 1인칭 손·총 ----------------
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.02, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.25));
    const d = new THREE.DirectionalLight(0xffffff, 1.3); d.position.set(1, 2, 1.5); this.scene.add(d);
    this.root = new THREE.Group(); this.root.scale.setScalar(0.62); this.scene.add(this.root);
    this.gun = new THREE.Mesh(gunGeo('ar'), VC); this.root.add(this.gun);
    const sleeve = 0x4c5a44, glove = 0x2b2f36;
    this.armR = new THREE.Mesh(boxes([[0.085, 0.085, 0.36, 0.03, -0.09, 0.2, sleeve, -0.3], [0.075, 0.09, 0.09, 0, -0.045, 0.02, glove]]), VC);
    this.armL = new THREE.Mesh(boxes([[0.085, 0.085, 0.42, -0.13, -0.1, -0.2, sleeve, -0.25, -0.5], [0.08, 0.075, 0.1, -0.015, -0.03, -0.4, glove]]), VC);
    this.root.add(this.armR, this.armL);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat()); this.flash.visible = false; this.root.add(this.flash);
    this.id = 'ar'; this.kick = 0; this.bob = 0; this.swayX = 0; this.swayY = 0; this.flashT = 0; this.swing = 0;
    this.pos = new THREE.Vector3(0.15, -0.15, -0.42);
  }
  setWeapon(id) {
    if (this.id === id) return;
    this.id = id; this.gun.geometry = gunGeo(id);
    this.armL.visible = !['pistol', 'knife', 'grenade'].includes(id);
    this.flash.position.set(0, 0.05, muzzleZ(id) - 0.1);
  }
  fire(melee) { if (melee) this.swing = 1; else { this.kick = 1; this.flashT = 0.045; this.flash.rotation.z = Math.random() * 6; this.flash.scale.setScalar(0.8 + Math.random() * 0.6); } }
  /** s = { ads(0~1), moving(0~1), sprint, reload(0~1 진행, 없으면 -1), switching(0~1), lookDX, lookDY, air } */
  update(dt, s) {
    this.kick = Math.max(0, this.kick - dt * 9); this.swing = Math.max(0, this.swing - dt * 4.5);
    this.flashT -= dt; this.flash.visible = this.flashT > 0;
    this.bob += dt * (s.sprint ? 13 : 9) * s.moving;
    this.swayX += (-s.lookDX * 0.0025 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (s.lookDY * 0.0025 - this.swayY) * Math.min(1, dt * 8);
    const ads = s.ads, hipX = this.id === 'knife' ? 0.19 : 0.15, K = 0.62; // K = 모델 축소 비율 (조준 시 가늠쇠가 화면 가운데 오도록)
    const adsY = -(this.id === 'pistol' ? 0.085 : 0.115) * K;
    const tx = hipX * (1 - ads), ty = -0.15 + (0.15 + adsY) * ads, tz = -0.42 + 0.12 * ads;
    const bobA = (1 - ads * 0.85) * s.moving;
    let x = tx + Math.cos(this.bob) * 0.012 * bobA + this.swayX, y = ty + Math.abs(Math.sin(this.bob)) * 0.014 * bobA + this.swayY - (s.air ? 0.01 : 0), z = tz + this.kick * 0.055;
    let rx = this.kick * 0.09, ry = 0, rz = 0;
    if (s.sprint) { x -= 0.05; y -= 0.04; ry = 0.5; rx -= 0.25; }
    if (s.reload >= 0) { const k = Math.sin(Math.min(1, s.reload) * Math.PI); y -= 0.16 * k; rx -= 0.7 * k; rz = 0.35 * k; }
    if (s.switching > 0) { y -= 0.3 * s.switching; rx -= 0.6 * s.switching; }
    if (this.swing > 0) { const k = Math.sin((1 - this.swing) * Math.PI); x -= 0.2 * k; z -= 0.22 * k; ry += 0.9 * k; rx -= 0.3 * k; }
    this.pos.lerp(new THREE.Vector3(x, y, z), Math.min(1, dt * 22));
    this.root.position.copy(this.pos);
    this.root.rotation.set(rx, ry, rz);
  }
}

// ---------------- 이펙트 ----------------
const MAX_TRACER = 48, MAX_DECAL = 90;
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new Sparks(700); scene.add(this.sparks.points);
    // 예광탄: 가는 막대를 총구→맞은 곳으로 늘여 잠깐 보여 줌
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }), MAX_TRACER);
    this.tracers.frustumCulled = false; this.tracerLife = new Float32Array(MAX_TRACER); this.tracerI = 0;
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_TRACER; i++) this.tracers.setMatrixAt(i, this._zero);
    scene.add(this.tracers);
    // 총알 자국
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d');
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 15); g.addColorStop(0, 'rgba(10,10,10,.95)'); g.addColorStop(0.45, 'rgba(25,25,25,.7)'); g.addColorStop(1, 'rgba(40,40,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_DECAL);
    this.decals.frustumCulled = false; this.decalI = 0;
    for (let i = 0; i < MAX_DECAL; i++) this.decals.setMatrixAt(i, this._zero);
    scene.add(this.decals);
    this.booms = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._s = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }
  tracer(ax, ay, az, bx, by, bz) {
    const a = this._a.set(ax, ay, az), b = this._b.set(bx, by, bz), len = a.distanceTo(b);
    if (len < 1.5) return;
    const i = this.tracerI = (this.tracerI + 1) % MAX_TRACER;
    this._q.setFromUnitVectors(this._z, b.clone().sub(a).normalize());
    this._m.compose(a.clone().add(b).multiplyScalar(0.5), this._q, this._s.set(1, 1, len));
    this.tracers.setMatrixAt(i, this._m); this.tracers.instanceMatrix.needsUpdate = true;
    this.tracerLife[i] = 0.07;
  }
  /** 벽·땅에 맞음: 먼지 + 자국 */
  impact(x, y, z, nx, ny, nz, color = 0xd8d2c4) {
    for (let k = 0; k < 6; k++) this.sparks.emit(x, y, z, k < 2 ? 0xffd27a : color, nx * 2.5 + (Math.random() - 0.5) * 3, ny * 2.5 + Math.random() * 2.5, nz * 2.5 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.25);
    const i = this.decalI = (this.decalI + 1) % MAX_DECAL;
    this._q.setFromUnitVectors(this._z, this._a.set(nx, ny, nz));
    this._m.compose(this._b.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012), this._q, this._s.set(1, 1, 1));
    this.decals.setMatrixAt(i, this._m); this.decals.instanceMatrix.needsUpdate = true;
  }
  /** 사람이 맞음 */
  blood(x, y, z, zombie) { for (let k = 0; k < 9; k++) this.sparks.emit(x, y, z, zombie ? 0x7bd16a : 0xd13b3b, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.3 + Math.random() * 0.2); }
  explosion(x, y, z, r = 7) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9, depthWrite: false }));
    ball.position.set(x, y, z); this.scene.add(ball);
    this.booms.push({ ball, t: 0, r });
    for (let k = 0; k < 70; k++) { const a = Math.random() * 6.283, e = Math.random() * 1.4, sp = 6 + Math.random() * 12; this.sparks.emit(x, y + 0.2, z, [0xffb347, 0xff7a2f, 0x55504a, 0xfff1b8][k % 4], Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 0.4 + Math.random() * 0.7); }
  }
  update(dt) {
    this.sparks.update(dt);
    let dirty = false;
    for (let i = 0; i < MAX_TRACER; i++) if (this.tracerLife[i] > 0 && (this.tracerLife[i] -= dt) <= 0) { this.tracers.setMatrixAt(i, this._zero); dirty = true; }
    if (dirty) this.tracers.instanceMatrix.needsUpdate = true;
    for (const b of this.booms) {
      b.t += dt; const k = b.t / 0.45;
      b.ball.scale.setScalar(0.5 + k * b.r * 0.55); b.ball.material.opacity = Math.max(0, 0.9 * (1 - k)); b.ball.material.color.setHex(k < 0.3 ? 0xfff1b8 : k < 0.6 ? 0xff9a3c : 0x5a534c);
      if (k >= 1) { this.scene.remove(b.ball); b.ball.geometry.dispose(); b.ball.material.dispose(); }
    }
    this.booms = this.booms.filter((b) => b.t < 0.45);
  }
}

/** 수류탄 · 보급 상자 모양 */
export function buildGrenadeMesh() { const m = new THREE.Mesh(gunGeo('grenade'), VC); m.scale.setScalar(1.6); m.castShadow = true; return m; }
const pickupGeo = {};
export function buildPickup(type) {
  const geo = pickupGeo[type] ??= type === 'health'
    ? boxes([[0.6, 0.42, 0.42, 0, 0.21, 0, 0xf4f6f8], [0.3, 0.1, 0.44, 0, 0.24, 0, 0xe23b3b], [0.1, 0.3, 0.44, 0, 0.24, 0, 0xe23b3b], [0.2, 0.05, 0.1, 0, 0.45, 0, 0x9aa3ad]])
    : boxes([[0.62, 0.36, 0.4, 0, 0.18, 0, 0x55603c], [0.64, 0.06, 0.42, 0, 0.3, 0, 0x3d4630], [0.2, 0.05, 0.1, 0, 0.39, 0, 0x9aa3ad], [0.22, 0.12, 0.42, 0, 0.14, 0, 0xd9b23c]]);
  const m = new THREE.Mesh(geo, VC); m.castShadow = true;
  return m;
}
