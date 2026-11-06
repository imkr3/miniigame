// 카트 레이스 - 캐릭터·카트·아이템 3D 모델 (기본 도형 조합, 앞쪽 = +Z)
import * as THREE from '../../vendor/three.module.min.js';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
// 반짝이는 재질 (카트 차체·헬멧처럼 광택 있는 부분)
const gloss = (color) => new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x555555 });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
/** parent.add() 는 parent 를 돌려주므로, 자식을 돌려주는 버전 */
const put = (parent, obj) => { parent.add(obj); return obj; };

function buildKart(kart, color) {
  const g = new THREE.Group();
  const body = gloss(color), dark = mat(0x1f2937), metal = gloss(0x9ca3af), seat = mat(0x111827);
  const wheels = [];
  let wheelR = 0.42, wheelW = 0.32, track = 0.78, base = 0.95;
  if (kart.id === 'buggy') { wheelR = 0.55; wheelW = 0.42; track = 0.9; }
  if (kart.id === 'tank') { wheelR = 0.48; wheelW = 0.5; track = 0.86; }
  if (kart.id === 'sport') { wheelR = 0.38; wheelW = 0.3; base = 1.05; }

  if (kart.id === 'sport') {
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.32, 2.5), body, 0, 0.42, 0));
    const nose = mesh(new THREE.ConeGeometry(0.62, 1.0, 4), body, 0, 0.42, 1.55); nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.scale.set(1, 1, 0.5); g.add(nose);
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), dark, 0, 0.95, -1.15));                     // 스포일러
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.4, 0.3), dark, s * 0.6, 0.75, -1.15));
  } else if (kart.id === 'buggy') {
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.35, 2.1), body, 0, 0.55, 0));
    const cage = new THREE.MeshLambertMaterial({ color: 0x374151 });
    for (const s of [-1, 1]) {
      const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), cage, s * 0.55, 1.15, -0.35); bar.rotation.x = 0.35; g.add(bar);
    }
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), cage, 0, 1.75, -0.1));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.2, 0.3), dark, 0, 0.45, 1.15));                     // 범퍼
  } else if (kart.id === 'tank') {
    g.add(mesh(new THREE.BoxGeometry(1.55, 0.5, 2.4), body, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 2.6), dark, 0, 0.35, 0));                       // 장갑 테두리
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5), metal, 0, 0.7, 1.15));
    for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), metal, s * 0.5, 0.9, -1.2));
  } else {
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.38, 2.2), body, 0, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.3, 0.6), body, 0, 0.55, 1.05));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.15, 0.3), dark, 0, 0.35, 1.3));                      // 범퍼
  }
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.15), seat, 0, 0.85, -0.55));                      // 등받이
  // 차체 위 흰 줄무늬 + 앞 전조등 + 번호판 느낌의 앞 패널
  const white = gloss(0xffffff), lamp = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  const topY = kart.id === 'tank' ? 0.81 : kart.id === 'buggy' ? 0.73 : kart.id === 'sport' ? 0.59 : 0.65;
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.02, kart.id === 'sport' ? 2.3 : 1.7), white, s * 0.18, topY, 0.15));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), lamp, s * 0.42, kart.id === 'tank' ? 0.62 : 0.5, base + (kart.id === 'sport' ? 0.35 : 0.42)));
  // 핸들
  const wheelSteer = mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), dark, 0, 0.95, 0.45); wheelSteer.rotation.x = -0.9; g.add(wheelSteer);
  // 바퀴
  const wgeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12);
  wgeo.rotateZ(Math.PI / 2);
  const hub = mat(0xd1d5db);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(wgeo, dark));
    const h = mesh(new THREE.BoxGeometry(wheelW + 0.02, wheelR * 0.5, wheelR * 0.5), hub); w.add(h); // 회전이 보이도록
    w.position.set(sx * track, wheelR, sz * base);
    g.add(w);
    wheels.push(w);
  }
  // 배기구 (부스트 불꽃 위치)
  const flames = [];
  for (const s of [-0.3, 0.3]) {
    put(g, mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 8), metal, s, 0.45, -1.2)).rotation.x = Math.PI / 2;
    const f = mesh(new THREE.ConeGeometry(0.18, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9 }), s, 0.45, -1.75);
    f.rotation.x = -Math.PI / 2;
    f.visible = false;
    g.add(f);
    flames.push(f);
  }
  return { group: g, wheels, flames, seatY: 0.75 };
}

function buildCharacter(ch) {
  const g = new THREE.Group();
  const c = mat(ch.color), a = mat(ch.accent), black = mat(0x111111), white = mat(0xffffff);
  const S = (r) => new THREE.SphereGeometry(r, 14, 10);
  // 몸통 + 팔
  g.add(mesh(new THREE.CapsuleGeometry(0.32, 0.35, 4, 10), ch.id === 'robot' ? mat(0x64748b) : c, 0, 0.45, -0.15));
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.4, 3, 6), c, s * 0.3, 0.55, 0.1);
    arm.rotation.x = -1.1; arm.rotation.z = s * -0.2;
    g.add(arm);
    g.add(mesh(S(0.085), ch.id === 'robot' ? mat(0x94a3b8) : white, s * 0.27, 0.42, 0.37)); // 장갑 낀 손
  }
  // 목도리 (캐릭터 강조색)
  put(g, mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 14), mat(ch.accent), 0, 0.82, -0.08)).rotation.x = Math.PI / 2;
  // 머리
  const head = new THREE.Group();
  head.position.set(0, 1.05, -0.05);
  g.add(head);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff }), blush = mat(0xfb7185, { transparent: true, opacity: 0.55 });
  const eyes = (y, z, spread = 0.13, r = 0.06) => {
    for (const s of [-1, 1]) {
      head.add(mesh(S(r * 1.6), white, s * spread, y, z));
      head.add(mesh(S(r), black, s * spread, y, z + r * 0.9));
      head.add(mesh(S(r * 0.35), shine, s * spread + r * 0.35, y + r * 0.4, z + r * 1.75)); // 눈 반짝
    }
  };
  const cheeks = (y, z, spread) => { for (const s of [-1, 1]) put(head, mesh(S(0.07), blush, s * spread, y, z)).scale.set(1.2, 0.7, 0.4); };
  switch (ch.id) {
    case 'robot':
      head.add(mesh(new THREE.BoxGeometry(0.6, 0.48, 0.5), c));
      head.add(mesh(new THREE.BoxGeometry(0.46, 0.14, 0.05), mat(0x0f172a), 0, 0.03, 0.26));
      for (const s of [-1, 1]) head.add(mesh(S(0.05), new THREE.MeshBasicMaterial({ color: ch.accent }), s * 0.12, 0.03, 0.29));
      head.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), black, 0, 0.38, 0));
      head.add(mesh(S(0.06), new THREE.MeshBasicMaterial({ color: 0xef4444 }), 0, 0.55, 0));
      break;
    case 'frog':
      put(head, mesh(S(0.34), c)).scale.set(1.2, 0.8, 1);
      for (const s of [-1, 1]) { head.add(mesh(S(0.13), c, s * 0.2, 0.25, 0.05)); head.add(mesh(S(0.08), white, s * 0.2, 0.28, 0.14)); head.add(mesh(S(0.045), black, s * 0.2, 0.28, 0.21)); }
      put(head, mesh(new THREE.TorusGeometry(0.15, 0.02, 4, 12, Math.PI), mat(0xb91c1c), 0, -0.05, 0.27)).rotation.z = Math.PI;
      break;
    case 'penguin': case 'duck':
      head.add(mesh(S(0.32), c));
      if (ch.id === 'penguin') put(head, mesh(S(0.25), a, 0, -0.04, 0.12)).scale.set(1, 1, 0.8);
      eyes(0.06, 0.28, 0.12, 0.045);
      cheeks(-0.06, 0.25, 0.2);
      put(head, mesh(new THREE.ConeGeometry(0.1, 0.28, 8), mat(0xf59e0b), 0, -0.05, 0.38)).rotation.x = Math.PI / 2;
      if (ch.id === 'duck') put(head, mesh(new THREE.SphereGeometry(0.06, 6, 5), c, 0, 0.33, 0.02)).scale.set(1, 2, 0.6);
      break;
    default: { // 동물 얼굴 (토끼·곰·고양이·판다)
      head.add(mesh(S(0.34), c));
      put(head, mesh(S(0.16), ch.id === 'panda' ? white : a, 0, -0.08, 0.27)).scale.set(1.2, 0.8, 0.7); // 주둥이
      head.add(mesh(S(0.05), black, 0, -0.03, 0.38));                                                    // 코
      if (ch.id === 'panda') for (const s of [-1, 1]) put(head, mesh(S(0.1), black, s * 0.13, 0.06, 0.26)).scale.set(1, 1.2, 0.5);
      eyes(0.07, 0.29, 0.13, 0.045);
      cheeks(-0.06, 0.26, 0.21);
      if (ch.id === 'rabbit') {
        for (const s of [-1, 1]) { const e = mesh(new THREE.CapsuleGeometry(0.07, 0.42, 3, 8), c, s * 0.13, 0.5, -0.03); e.rotation.z = s * -0.15; head.add(e); put(head, mesh(new THREE.CapsuleGeometry(0.035, 0.32, 3, 6), a, s * 0.13, 0.5, 0.02)).rotation.z = s * -0.15; }
      } else if (ch.id === 'cat') {
        for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.12, 0.24, 4), c, s * 0.2, 0.32, 0); e.rotation.z = s * -0.3; head.add(e); }
      } else {
        for (const s of [-1, 1]) head.add(mesh(S(0.11), ch.id === 'panda' ? black : c, s * 0.24, 0.26, -0.02));
      }
    }
  }
  // 헬멧 띠 (캐릭터 색 구분용)
  return { group: g, head };
}

/**
 * 최적화: 움직이지 않는 부품 중 같은 색끼리 하나의 메시로 합침 (그리기 호출 수 감소)
 * skip 에 든 객체(바퀴·불꽃 등 따로 움직이는 것)와 그 자식은 그대로 둠
 */
function mergeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skipped = (o) => { for (let p = o; p && p !== root; p = p.parent) if (skip.has(p)) return true; return false; };
  const buckets = new Map(), remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material.map || skipped(o)) return;
    const m = o.material;
    const key = `${m.type}|${m.color.getHex()}|${m.transparent}|${m.opacity}|${m.side}`;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    if (!buckets.has(key)) buckets.set(key, { mat: m, pos: [], nor: [] });
    const b = buckets.get(key);
    b.pos.push(geo.attributes.position.array);
    b.nor.push(geo.attributes.normal.array);
    remove.push(o);
  });
  for (const o of remove) { o.parent.remove(o); o.geometry.dispose(); }
  for (const { mat, pos, nor } of buckets.values()) {
    const cat = (arrs) => { const out = new Float32Array(arrs.reduce((a, x) => a + x.length, 0)); let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; } return out; };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
    root.add(new THREE.Mesh(geo, mat));
  }
}

/** 레이서 모델: root(위치·방향) > body(드리프트 기울기·스핀) > kart + 캐릭터 */
export function buildRacer(ch, kart) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const k = buildKart(kart, ch.kartColor);
  body.add(k.group);
  const c = buildCharacter(ch);
  c.group.position.set(0, k.seatY - 0.15, -0.35);
  body.add(c.group);
  // 그림자
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.9, 1.3, 1);
  shadow.position.y = 0.03;
  root.add(shadow);
  // 글라이더 날개 (활공 중에만 보임)
  const glider = new THREE.Group();
  const wingMat = new THREE.MeshLambertMaterial({ color: ch.kartColor, side: THREE.DoubleSide });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 1.4), wingMat);
  wing.position.y = 2.6;
  glider.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 1.2), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tip.position.set(s * 2.4, 2.62, 0.05);
    glider.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x374151 }));
    strut.position.set(s * 0.6, 1.85, -0.2);
    strut.rotation.z = s * 0.35;
    glider.add(strut);
  }
  glider.visible = false;
  body.add(glider);
  // 방어막
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25, depthWrite: false }));
  shield.position.y = 0.9;
  shield.visible = false;
  root.add(shield);
  mergeStatic(body, new Set([...k.wheels, ...k.flames, glider]));
  return { root, body, wheels: k.wheels, flames: k.flames, head: c.head, shadow, shield, glider };
}

// ---------------- 아이템 모델 ----------------
let boxTexture;
function questionTexture() {
  if (boxTexture) return boxTexture;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 64, 64);
  gr.addColorStop(0, '#f472b6'); gr.addColorStop(0.5, '#facc15'); gr.addColorStop(1, '#22d3ee');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 58, 58);
  ctx.fillStyle = '#fff'; ctx.font = '900 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', 32, 35);
  boxTexture = new THREE.CanvasTexture(cv);
  boxTexture.colorSpace = THREE.SRGBColorSpace;
  return boxTexture;
}

export function buildItemBox() {
  return new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ map: questionTexture(), transparent: true, opacity: 0.85 }));
}

export function buildItemMesh(type) {
  const g = new THREE.Group();
  if (type === 'oil') {
    const m = mesh(new THREE.CircleGeometry(1.6, 18), new THREE.MeshBasicMaterial({ color: 0x0b0b10, transparent: true, opacity: 0.85 }), 0, 0.06, 0);
    m.rotation.x = -Math.PI / 2; g.add(m);
    const sheen = mesh(new THREE.RingGeometry(0.5, 0.8, 16, 1, 0, 2), new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.5 }), 0.3, 0.07, 0.2);
    sheen.rotation.x = -Math.PI / 2; g.add(sheen);
  } else if (type === 'mine') {
    g.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(0xdc2626), 0, 0.5, 0));
    for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.12, 0.35, 6), mat(0x374151), 0, 0.5, 0); const a = (i / 6) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5); sp.lookAt(Math.cos(a) * 2, 0.5, Math.sin(a) * 2); sp.rotateX(Math.PI / 2); g.add(sp); }
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfde047 }), 0, 1.02, 0));
  } else if (type === 'rocket' || type === 'homing') {
    const color = type === 'rocket' ? 0xef4444 : 0x8b5cf6;
    const bodyM = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 10), mat(color), 0, 0.7, 0); bodyM.rotation.x = Math.PI / 2; g.add(bodyM);
    const nose = mesh(new THREE.ConeGeometry(0.22, 0.45, 10), mat(0xf8fafc), 0, 0.7, 0.82); nose.rotation.x = Math.PI / 2; g.add(nose);
    for (let i = 0; i < 3; i++) { const fin = mesh(new THREE.BoxGeometry(0.05, 0.35, 0.3), mat(0x1f2937), 0, 0.7, -0.5); fin.rotation.z = (i / 3) * Math.PI * 2; fin.position.x = Math.sin((i / 3) * Math.PI * 2) * 0.22; fin.position.y = 0.7 + Math.cos((i / 3) * Math.PI * 2) * 0.22; g.add(fin); }
    const fl = mesh(new THREE.ConeGeometry(0.18, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }), 0, 0.7, -0.95); fl.rotation.x = -Math.PI / 2; g.add(fl);
  }
  return g;
}

/** 드리프트 불꽃·먼지 입자 (Points 하나로 관리) */
export class Sparks {
  constructor(max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.n = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    // 동그란 입자 텍스처
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const c2 = cv.getContext('2d'), gr = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = gr; c2.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.tmp = new THREE.Color();
    this.cursor = 0;
  }
  emit(x, y, z, color, vx = 0, vy = 2, vz = 0, life = 0.4) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.tmp.set(color);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
