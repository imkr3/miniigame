// 카트 레이스 - 트랙: 높이가 있는 닫힌 곡선을 따라 도로·연석·갓길·벽·둑/기둥·점프대·글라이더 구간을 만들고,
// 위치 질의(가장 가까운 지점, 그 지점의 높이, 낭떠러지 여부 등)를 제공
import * as THREE from '../../vendor/three.module.min.js';

const SAMPLE_STEP = 2; // m

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const css = (n) => '#' + n.toString(16).padStart(6, '0');

export class Track {
  constructor(def) {
    this.def = def;
    const pts = def.points.map(([x, z, y = 0]) => new THREE.Vector3(x * def.scale, y, z * def.scale));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    this.N = Math.round(this.length / SAMPLE_STEP);
    this.hw = def.width / 2;          // 도로 반폭
    this.curb = 1.3;                  // 연석 폭
    this.wall = this.hw + 4.2;        // 벽까지 거리 (갓길은 감속)
    this.samples = [];
    for (let i = 0; i < this.N; i++) {
      const u = i / this.N;
      const p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      const fl = Math.hypot(t.x, t.z) || 1;
      // n: 진행 방향의 오른쪽 (카메라 기준 오른쪽), slope: 오르막 기울기
      this.samples.push({ x: p.x, y: p.y, z: p.z, tx: t.x / fl, tz: t.z / fl, nx: -t.z / fl, nz: t.x / fl, d: u * this.length, slope: t.y / fl });
    }
    // 앞쪽 곡률 (급커브 판단): i 지점에서 30m 앞까지 방향 변화량
    this.curv = this.samples.map((s, i) => {
      const b = this.samples[(i + Math.round(30 / SAMPLE_STEP)) % this.N];
      return Math.abs(Math.atan2(s.tx * b.tz - s.tz * b.tx, s.tx * b.tx + s.tz * b.tz));
    });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    this.bounds = { minX, maxX, minZ, maxZ };

    // 제어점 → 트랙 위 거리
    const pointD = (k) => {
      const p = pts[k % pts.length];
      let best = 0, bd = Infinity;
      this.samples.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = i; } });
      return this.samples[best].d;
    };
    // 글라이더 구간: 발사대(시작 제어점) 뒤로 낭떠러지, 끝 제어점 조금 앞에서 길이 다시 시작
    this.gaps = (def.gliders ?? []).map(([a, b]) => {
      const da = pointD(a), db = pointD(b);
      return { launch: da, from: da + 4, to: db - 6 };
    });
    this.ramps = (def.ramps ?? []).map((k) => ({ d: pointD(k), glide: false }));
    for (const g of this.gaps) this.ramps.push({ d: g.launch, glide: true });
    this.bridges = (def.bridges ?? []).map(([a, b]) => [pointD(a), pointD(b)]);
  }

  inRange(d, a, b) { return a <= b ? d >= a && d <= b : d >= a || d <= b; }
  /** d 지점이 낭떠러지(글라이더 구간)인지 */
  inGap(d) { return this.gaps.some((g) => this.inRange(d, g.from, g.to)); }
  onBridge(d) { return this.bridges.some(([a, b]) => this.inRange(d, a, b)); }

  /** 거리 d(m) 지점 (원형으로 감김), 높이 포함 */
  at(d) {
    const L = this.length;
    d = ((d % L) + L) % L;
    const f = d * this.N / L;
    const i = Math.floor(f) % this.N, j = (i + 1) % this.N, k = f - Math.floor(f);
    const a = this.samples[i], b = this.samples[j];
    const tx = a.tx + (b.tx - a.tx) * k, tz = a.tz + (b.tz - a.tz) * k, tl = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, tx: tx / tl, tz: tz / tl, nx: -tz / tl, nz: tx / tl, slope: a.slope, i, d };
  }

  /** (x,z)에서 가장 가까운 트랙 지점. hint(이전 위치)가 있으면 주변만 검색 → 고가도로 아래위를 헷갈리지 않음 */
  nearest(x, z, hint, y) {
    const N = this.N;
    let best = -1, bd = Infinity;
    const scan = (i) => {
      const s = this.samples[i];
      let d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (y !== undefined) d += ((s.y - y) * 3) ** 2;
      if (d < bd) { bd = d; best = i; }
    };
    if (hint === undefined || hint < 0) for (let i = 0; i < N; i++) scan(i);
    else for (let k = -25; k <= 25; k++) scan((hint + k + N) % N);
    const s = this.samples[best];
    const along = (x - s.x) * s.tx + (z - s.z) * s.tz;
    const lat = (x - s.x) * s.nx + (z - s.z) * s.nz;
    let d = s.d + along;
    d = ((d % this.length) + this.length) % this.length;
    return { i: best, lat, d, s, y: this.at(d).y };
  }

  curvatureAt(i) { return this.curv[i]; }

  // ---------------- 메시 ----------------
  build(quality = 1) {
    const g = new THREE.Group();
    const th = this.def.theme;
    const N = this.N;
    const S = this.samples;
    const gapAt = S.map((s) => this.inGap(s.d));
    const keep = (i) => !gapAt[i % N] && !gapAt[(i + 1) % N];

    // 바닥 (구름 정원은 저 아래 구름 바다)
    const b = this.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 700;
    const groundTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = css(th.ground); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * (this.def.floating ? 0.15 : 0.06)})`;
        const r = this.def.floating ? 6 + Math.random() * 10 : 3;
        ctx.fillRect(Math.random() * w, Math.random() * h, r, r);
      }
    });
    groundTex.repeat.set(size / 16, size / 16);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.02, cz);
    g.add(ground);

    // 트랙을 따라가는 띠 메시: 가로 a~b 위치, 높이 오프셋 y0/y1 (세로 띠도 가능)
    const strip = (a, bOff, y0, y1, mat, vScale, filter = keep, absY = false) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const s = S[i % N], d = i === N ? this.length : s.d;
        const ya = absY ? y0 : s.y + y0, yb = absY ? y1 : s.y + y1;
        pos.push(s.x + s.nx * a, ya, s.z + s.nz * a, s.x + s.nx * bOff, yb, s.z + s.nz * bOff);
        uv.push(0, d / vScale, 1, d / vScale);
        if (i < N && filter(i)) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      g.add(m);
      return m;
    };
    const roadTex = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = th.night ? '#2a2d3a' : '#4b5059'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(4, 0, 3, h); ctx.fillRect(w - 7, 0, 3, h);
    });
    strip(-this.hw, this.hw, 0.02, 0.02, new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide }), 12);
    const curbTex = canvasTexture(16, 64, (ctx, w, h) => {
      ctx.fillStyle = css(th.curbA); ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = css(th.curbB); ctx.fillRect(0, h / 2, w, h / 2);
    });
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex, side: THREE.DoubleSide });
    strip(this.hw, this.hw + this.curb, 0.03, 0.03, curbMat, 4);
    strip(-this.hw - this.curb, -this.hw, 0.03, 0.03, curbMat, 4);
    // 갓길 (감속 구간) - 도로와 같은 높이
    const shoulderMat = new THREE.MeshLambertMaterial({ map: groundTex, side: THREE.DoubleSide });
    strip(this.hw + this.curb, this.wall, 0.01, 0.01, shoulderMat, 16);
    strip(-this.wall, -this.hw - this.curb, 0.01, 0.01, shoulderMat, 16);

    // 벽 + 윗부분
    const wallMat = th.night
      ? new THREE.MeshBasicMaterial({ color: th.wall, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
      : new THREE.MeshLambertMaterial({ color: th.wall, side: THREE.DoubleSide });
    const topMat = new THREE.MeshBasicMaterial({ color: th.wallTop, side: THREE.DoubleSide });
    for (const off of [this.wall, -this.wall]) {
      strip(off, off, 0, 1.1, wallMat, 10);
      strip(off - 0.25, off + 0.25, 1.12, 1.12, topMat, 10);
    }

    // 높은 곳의 받침: 흙둑(옆면) 또는 기둥(고가도로), 떠 있는 트랙은 바닥판
    const dirtMat = new THREE.MeshLambertMaterial({ color: th.dirt ?? th.ground, side: THREE.DoubleSide });
    const raised = (i) => keep(i) && S[i].y > 0.3 && !this.onBridge(S[i].d);
    if (this.def.floating) {
      strip(-this.wall, this.wall, -1.6, -1.6, dirtMat, 10);
      for (const off of [this.wall, -this.wall]) strip(off, off, -1.6, 0, dirtMat, 10);
    } else {
      for (const off of [this.wall, -this.wall]) {
        const m = strip(off, off, 0, 0, dirtMat, 10, raised);
        const arr = m.geometry.attributes.position.array;
        for (let k = 1; k < arr.length; k += 6) arr[k] = -0.1; // 아래쪽 꼭짓점을 땅까지 내려 흙둑 옆면으로
        m.geometry.computeVertexNormals();
      }
      const pillarMat = new THREE.MeshLambertMaterial({ color: th.night ? 0x475569 : 0x9ca3af });
      for (let i = 0; i < N; i += 6) {
        const s = S[i];
        if (!this.onBridge(s.d) || s.y < 1 || gapAt[i]) continue;
        for (const side of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, s.y, 1.2), pillarMat);
          p.position.set(s.x + s.nx * (this.wall - 1) * side, s.y / 2, s.z + s.nz * (this.wall - 1) * side);
          g.add(p);
        }
        const slab = new THREE.Mesh(new THREE.BoxGeometry(this.wall * 2, 0.6, 12.5), pillarMat);
        slab.position.set(s.x, s.y - 0.35, s.z);
        slab.rotation.y = Math.atan2(s.tx, s.tz);
        g.add(slab);
      }
    }

    // 출발선 (체크무늬) - 도로를 가로지르도록
    const s0 = S[0], h0 = Math.atan2(s0.tx, s0.tz);
    const checker = canvasTexture(64, 16, (ctx) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(i * 4, j * 4, 4, 4); }
    }, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.hw * 2, 2), new THREE.MeshBasicMaterial({ map: checker }));
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, h0, 0);
    line.position.set(s0.x, s0.y + 0.04, s0.z);
    g.add(line);
    // 출발 아치: 기둥 2개 + 가로 현수막
    const archMat = new THREE.MeshLambertMaterial({ color: th.wallTop });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), archMat);
      post.position.set(s0.x + s0.nx * (this.hw + 1.5) * side, s0.y + 3.5, s0.z + s0.nz * (this.hw + 1.5) * side);
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(this.hw * 2 + 3.8, 1.4, 0.5), new THREE.MeshBasicMaterial({ map: checker }));
    banner.position.set(s0.x, s0.y + 7, s0.z);
    banner.rotation.y = h0; // 상자의 가로(X)축이 도로를 가로지름
    g.add(banner);

    // 가속 발판
    const arrowTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fef08a';
      for (const y of [8, 34]) { ctx.beginPath(); ctx.moveTo(8, y + 22); ctx.lineTo(32, y); ctx.lineTo(56, y + 22); ctx.lineTo(44, y + 22); ctx.lineTo(32, y + 12); ctx.lineTo(20, y + 22); ctx.fill(); }
    }, false);
    this.boostPads = this.def.boosts.map((f) => {
      const p = this.at(f * this.length);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: arrowTex }));
      pad.rotation.order = 'YXZ';
      pad.rotation.set(-Math.PI / 2, Math.atan2(p.tx, p.tz) + Math.PI, 0); // 화살표가 진행 방향을 가리키도록
      pad.position.set(p.x, p.y + 0.05, p.z);
      g.add(pad);
      return { d: f * this.length, x: p.x, y: p.y, z: p.z };
    });

    // 점프대 / 글라이더 발사대 (경사로)
    const stripeTex = (a, b2) => canvasTexture(32, 32, (ctx, w, h) => { ctx.fillStyle = a; ctx.fillRect(0, 0, w, h); ctx.fillStyle = b2; for (let i = -w; i < w; i += 12) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + 6, h); ctx.lineTo(i + 6 + h, 0); ctx.lineTo(i + h, 0); ctx.fill(); } });
    const rampTex = stripeTex('#facc15', '#1f2937'), glideTex = stripeTex('#38bdf8', '#ffffff');
    for (const r of this.ramps) {
      const p = this.at(r.d - 3);
      const len = 6, rise = r.glide ? 1.4 : 0.9;
      const geo = new THREE.BufferGeometry();
      const w = r.glide ? this.hw : this.hw * 0.55;
      // 쐐기: 뒤쪽 낮고 앞쪽 높음 (로컬 +Z = 진행 방향)
      const v = [-w, 0, -len / 2, w, 0, -len / 2, -w, rise, len / 2, w, rise, len / 2, -w, 0, len / 2, w, 0, len / 2];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1], 2));
      geo.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5]);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: r.glide ? glideTex : rampTex, side: THREE.DoubleSide }));
      m.position.set(p.x, p.y + 0.02, p.z);
      m.rotation.y = Math.atan2(p.tx, p.tz);
      g.add(m);
      if (r.glide) { // 글라이더 아치 표시
        const q = this.at(r.d - 6);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.hw + 1, 0.35, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        ring.position.set(q.x, q.y, q.z);
        ring.rotation.y = Math.atan2(q.tx, q.tz);
        g.add(ring);
      }
    }

    // 아이템 박스 위치 (줄마다 4개)
    this.boxSpots = [];
    for (const f of this.def.boxes) {
      const p = this.at(f * this.length);
      for (const k of [-0.6, -0.2, 0.2, 0.6]) this.boxSpots.push({ x: p.x + p.nx * this.hw * k, y: p.y, z: p.z + p.nz * this.hw * k });
    }

    this.addScenery(g, quality);
    return g;
  }

  /** 트랙 밖 장식 (InstancedMesh 로 가볍게) */
  addScenery(g, quality) {
    const th = this.def.theme, b = this.bounds;
    const count = Math.round(220 * quality);
    const spots = [];
    let tries = 0;
    while (spots.length < count && tries++ < count * 20) {
      const x = b.minX - 90 + Math.random() * (b.maxX - b.minX + 180);
      const z = b.minZ - 90 + Math.random() * (b.maxZ - b.minZ + 180);
      // 트랙(높이 무관)과 충분히 떨어진 곳만
      let ok = true;
      for (let i = 0; i < this.N; i += 3) { const s = this.samples[i]; if ((s.x - x) ** 2 + (s.z - z) ** 2 < (this.wall + 5) ** 2) { ok = false; break; } }
      if (!ok) continue;
      spots.push({ x, z, s: 0.7 + Math.random() * 0.8, r: Math.random() * Math.PI * 2 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const place = (geo, mat, list, yOff, sx = 1, sy = 1) => {
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.r);
        m4.compose(new THREE.Vector3(p.x, yOff * p.s * sy + (p.y0 ?? 0), p.z), q, new THREE.Vector3(p.s * sx, p.s * sy, p.s * sx));
        inst.setMatrixAt(i, m4);
      });
      g.add(inst);
    };
    const kind = th.scenery;
    if (kind === 'trees' || kind === 'pines') {
      const leaf = new THREE.MeshLambertMaterial({ color: kind === 'pines' ? 0x2f6b4f : 0x2f8f3a });
      const trunk = new THREE.MeshLambertMaterial({ color: 0x7c4a26 });
      place(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6), trunk, spots, 1.2);
      if (kind === 'pines') {
        place(new THREE.ConeGeometry(2.2, 5, 7), leaf, spots, 4.6);
        place(new THREE.ConeGeometry(1.6, 3, 7), new THREE.MeshLambertMaterial({ color: 0xf8fafc }), spots, 6.7);
      } else {
        place(new THREE.IcosahedronGeometry(2.2, 0), leaf, spots, 3.8);
      }
      place(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: kind === 'pines' ? 0xe2e8f0 : 0x3f9d4a }), spots.slice(0, spots.length / 2).map((p) => ({ ...p, x: p.x + 4, z: p.z - 3 })), 0.6);
    } else if (kind === 'cacti') {
      const mat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
      const half = spots.slice(0, spots.length / 2), rocks = spots.slice(spots.length / 2);
      place(new THREE.CylinderGeometry(0.5, 0.55, 4, 7), mat, half, 2);
      place(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 6), mat, half.map((p) => ({ ...p, x: p.x + Math.cos(p.r) * 0.9, z: p.z + Math.sin(p.r) * 0.9 })), 2.4);
      place(new THREE.DodecahedronGeometry(2.4, 0), new THREE.MeshLambertMaterial({ color: 0xb7793f }), rocks, 1);
      const far = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; far.push({ x: (b.minX + b.maxX) / 2 + Math.cos(a) * 330, z: (b.minZ + b.maxZ) / 2 + Math.sin(a) * 330, s: 1 + Math.random(), r: a }); }
      place(new THREE.CylinderGeometry(30, 40, 40, 6), new THREE.MeshLambertMaterial({ color: 0xc0703a }), far, 20);
    } else if (kind === 'city') {
      const list = spots.slice(0, Math.round(spots.length * 0.7));
      const winTex = canvasTexture(32, 64, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
        for (let y = 2; y < h; y += 6) for (let x = 2; x < w; x += 6) { ctx.fillStyle = Math.random() < 0.55 ? ['#fde68a', '#67e8f9', '#f9a8d4'][Math.floor(Math.random() * 3)] : '#1e293b'; ctx.fillRect(x, y, 3, 3); }
      });
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: winTex }), list.length);
      list.forEach((p, i) => {
        const hgt = 12 + Math.random() * 40;
        m4.compose(new THREE.Vector3(p.x, hgt / 2, p.z), q.setFromAxisAngle(up, p.r), new THREE.Vector3(8 + Math.random() * 6, hgt, 8 + Math.random() * 6));
        inst.setMatrixAt(i, m4);
      });
      g.add(inst);
      const lamps = this.samples.filter((_, i) => i % 12 === 0).map((s) => ({ x: s.x + s.nx * (this.wall + 1), z: s.z + s.nz * (this.wall + 1), s: 1, r: 0, y0: s.y }));
      place(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfef08a }), lamps, 5);
      place(new THREE.CylinderGeometry(0.12, 0.12, 5, 5), new THREE.MeshLambertMaterial({ color: 0x64748b }), lamps, 2.5);
    } else if (kind === 'clouds') {
      // 구름 덩어리 + 떠 있는 작은 섬
      const cl = spots.map((p) => ({ ...p, s: 2 + Math.random() * 3, y0: 6 + Math.random() * 30 }));
      place(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), cl, 0);
      const isl = spots.slice(0, Math.round(spots.length / 6)).map((p) => ({ ...p, s: 1.5 + Math.random() * 2, y0: 10 + Math.random() * 25 }));
      place(new THREE.ConeGeometry(4, 6, 7), new THREE.MeshLambertMaterial({ color: 0x8b5e3c }), isl.map((p) => ({ ...p, r: p.r + Math.PI })), -1.6);
      place(new THREE.CylinderGeometry(4, 4, 1, 7), new THREE.MeshLambertMaterial({ color: 0x86efac }), isl, 0.3);
    }
  }
}
