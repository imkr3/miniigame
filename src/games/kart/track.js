// 카트 레이스 - 트랙: 닫힌 곡선을 따라 도로·연석·벽·장식을 만들고, 위치 질의(가장 가까운 지점 등)를 제공
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

export class Track {
  constructor(def) {
    this.def = def;
    const pts = def.points.map(([x, z]) => new THREE.Vector3(x * def.scale, 0, z * def.scale));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    this.N = Math.round(this.length / SAMPLE_STEP);
    this.hw = def.width / 2;          // 도로 반폭
    this.curb = 1.3;                  // 연석 폭
    this.wall = this.hw + 4.2;        // 벽까지 거리 (사이는 풀밭/모래 = 감속)
    this.samples = [];
    for (let i = 0; i < this.N; i++) {
      const u = i / this.N;
      const p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      // n: 진행 방향의 오른쪽 (카메라 기준 오른쪽)
      this.samples.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, nx: -t.z, nz: t.x, d: u * this.length });
    }
    // 앞쪽 곡률 (급커브 판단용): i 지점에서 30m 앞까지 방향 변화량
    this.curv = this.samples.map((s, i) => {
      const j = (i + Math.round(30 / SAMPLE_STEP)) % this.N, b = this.samples[j];
      return Math.abs(Math.atan2(s.tx * b.tz - s.tz * b.tx, s.tx * b.tx + s.tz * b.tz));
    });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  /** 거리 d(m) 지점 (원형으로 감김) */
  at(d) {
    const L = this.length;
    d = ((d % L) + L) % L;
    const f = d / SAMPLE_STEP * (this.N * SAMPLE_STEP / L);
    const i = Math.floor(f) % this.N, j = (i + 1) % this.N, k = f - Math.floor(f);
    const a = this.samples[i], b = this.samples[j];
    const tx = a.tx + (b.tx - a.tx) * k, tz = a.tz + (b.tz - a.tz) * k, tl = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: tx / tl, tz: tz / tl, nx: -tz / tl, nz: tx / tl, i };
  }

  /** (x,z)에서 가장 가까운 트랙 지점. hint가 있으면 주변만 검색 */
  nearest(x, z, hint) {
    const N = this.N;
    let best = -1, bd = Infinity;
    const scan = (i) => { const s = this.samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } };
    if (hint === undefined || hint < 0) for (let i = 0; i < N; i++) scan(i);
    else for (let k = -25; k <= 25; k++) scan((hint + k + N) % N);
    // 이웃 구간에 투영해서 정확한 진행 거리 계산
    const s = this.samples[best];
    const along = (x - s.x) * s.tx + (z - s.z) * s.tz;
    const lat = (x - s.x) * s.nx + (z - s.z) * s.nz;
    let d = s.d + along;
    d = ((d % this.length) + this.length) % this.length;
    return { i: best, lat, d, s };
  }

  curvatureAt(i) { return this.curv[i]; }

  // ---------------- 메시 ----------------
  build(quality = 1) {
    const g = new THREE.Group();
    const th = this.def.theme;
    const N = this.N;

    // 바닥
    const b = this.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 600;
    const groundTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#' + th.ground.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
    });
    groundTex.repeat.set(size / 16, size / 16);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.02, cz);
    g.add(ground);

    // 띠 모양 메시 (트랙을 따라 a~b 거리, 높이 y)
    const ribbon = (a, bOff, y, mat, vScale) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % N], d = i === N ? this.length : s.d;
        pos.push(s.x + s.nx * a, y, s.z + s.nz * a, s.x + s.nx * bOff, y, s.z + s.nz * bOff);
        uv.push(0, d / vScale, 1, d / vScale);
        if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      return m;
    };
    const roadTex = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = th.night ? '#2a2d3a' : '#4b5059'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);       // 가운데 점선
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(4, 0, 3, h); ctx.fillRect(w - 7, 0, 3, h); // 가장자리 선
    });
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide });
    g.add(ribbon(-this.hw, this.hw, 0.02, roadMat, 12));

    const curbTex = canvasTexture(16, 64, (ctx, w, h) => {
      ctx.fillStyle = '#' + th.curbA.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#' + th.curbB.toString(16).padStart(6, '0'); ctx.fillRect(0, h / 2, w, h / 2);
    });
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex, side: THREE.DoubleSide });
    g.add(ribbon(this.hw, this.hw + this.curb, 0.03, curbMat, 4));
    g.add(ribbon(-this.hw - this.curb, -this.hw, 0.03, curbMat, 4));

    // 벽 (세로 띠) + 윗부분 띠
    const wall = (off) => {
      const pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % N];
        const x = s.x + s.nx * off, z = s.z + s.nz * off;
        pos.push(x, 0, z, x, 1.1, z);
        if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = th.night
        ? new THREE.MeshBasicMaterial({ color: th.wall, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
        : new THREE.MeshLambertMaterial({ color: th.wall, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(geo, mat));
      const top = ribbon(off - 0.25, off + 0.25, 1.12, new THREE.MeshBasicMaterial({ color: th.wallTop, side: THREE.DoubleSide }), 10);
      g.add(top);
    };
    wall(this.wall); wall(-this.wall);

    // 출발선 (체크무늬)
    const s0 = this.samples[0];
    const checker = canvasTexture(64, 16, (ctx) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(i * 4, j * 4, 4, 4); }
    }, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.hw * 2, 2), new THREE.MeshBasicMaterial({ map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(s0.tx, s0.tz) + Math.PI / 2;
    line.position.set(s0.x, 0.04, s0.z);
    g.add(line);
    // 출발 아치
    const archMat = new THREE.MeshLambertMaterial({ color: th.wallTop });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), archMat);
      post.position.set(s0.x + s0.nx * (this.hw + 1.5) * side, 3.5, s0.z + s0.nz * (this.hw + 1.5) * side);
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(this.hw * 2 + 3.8, 1.4, 0.5), new THREE.MeshBasicMaterial({ map: checker }));
    banner.position.set(s0.x, 7, s0.z);
    banner.rotation.y = Math.atan2(s0.tx, s0.tz) + Math.PI / 2;
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
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
      pad.position.set(p.x, 0.05, p.z);
      g.add(pad);
      return { d: f * this.length, x: p.x, z: p.z };
    });

    // 아이템 박스 위치 (줄마다 4개)
    this.boxSpots = [];
    for (const f of this.def.boxes) {
      const p = this.at(f * this.length);
      for (const k of [-0.6, -0.2, 0.2, 0.6]) this.boxSpots.push({ x: p.x + p.nx * this.hw * k, z: p.z + p.nz * this.hw * k });
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
      const n = this.nearest(x, z);
      if (Math.abs(n.lat) < this.wall + 4 + Math.random() * 6) continue;
      spots.push({ x, z, s: 0.7 + Math.random() * 0.8, r: Math.random() * Math.PI * 2 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const place = (geo, mat, list, yOff, sx = 1, sy = 1) => {
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.r);
        m4.compose(new THREE.Vector3(p.x, yOff * p.s * sy, p.z), q, new THREE.Vector3(p.s * sx, p.s * sy, p.s * sx));
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
        place(new THREE.ConeGeometry(1.6, 3, 7), new THREE.MeshLambertMaterial({ color: 0xf8fafc }), spots, 6.7); // 눈 덮인 끝
      } else {
        place(new THREE.IcosahedronGeometry(2.2, 0), leaf, spots, 3.8);
      }
      // 덤불
      place(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: kind === 'pines' ? 0xe2e8f0 : 0x3f9d4a }), spots.slice(0, spots.length / 2).map((p) => ({ ...p, x: p.x + 4, z: p.z - 3 })), 0.6);
    } else if (kind === 'cacti') {
      const mat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
      const half = spots.slice(0, spots.length / 2), rocks = spots.slice(spots.length / 2);
      place(new THREE.CylinderGeometry(0.5, 0.55, 4, 7), mat, half, 2);
      place(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 6), mat, half.map((p) => ({ ...p, x: p.x + Math.cos(p.r) * 0.9, z: p.z + Math.sin(p.r) * 0.9 })), 2.4);
      place(new THREE.DodecahedronGeometry(2.4, 0), new THREE.MeshLambertMaterial({ color: 0xb7793f }), rocks, 1);
      // 멀리 메사(절벽)
      const mesa = new THREE.MeshLambertMaterial({ color: 0xc0703a });
      const far = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; far.push({ x: (b.minX + b.maxX) / 2 + Math.cos(a) * 330, z: (b.minZ + b.maxZ) / 2 + Math.sin(a) * 330, s: 1 + Math.random(), r: a }); }
      place(new THREE.CylinderGeometry(30, 40, 40, 6), mesa, far, 20);
    } else if (kind === 'city') {
      const list = spots.slice(0, Math.round(spots.length * 0.7));
      const winTex = canvasTexture(32, 64, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
        for (let y = 2; y < h; y += 6) for (let x = 2; x < w; x += 6) { ctx.fillStyle = Math.random() < 0.55 ? ['#fde68a', '#67e8f9', '#f9a8d4'][Math.floor(Math.random() * 3)] : '#1e293b'; ctx.fillRect(x, y, 3, 3); }
      });
      const mat = new THREE.MeshBasicMaterial({ map: winTex });
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
      list.forEach((p, i) => {
        const hgt = 12 + Math.random() * 40;
        m4.compose(new THREE.Vector3(p.x, hgt / 2, p.z), q.setFromAxisAngle(up, p.r), new THREE.Vector3(8 + Math.random() * 6, hgt, 8 + Math.random() * 6));
        inst.setMatrixAt(i, m4);
      });
      g.add(inst);
      // 가로등 빛
      place(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfef08a }), this.samples.filter((_, i) => i % 12 === 0).map((s) => ({ x: s.x + s.nx * (this.wall + 1), z: s.z + s.nz * (this.wall + 1), s: 1, r: 0 })), 5);
      place(new THREE.CylinderGeometry(0.12, 0.12, 5, 5), new THREE.MeshLambertMaterial({ color: 0x64748b }), this.samples.filter((_, i) => i % 12 === 0).map((s) => ({ x: s.x + s.nx * (this.wall + 1), z: s.z + s.nz * (this.wall + 1), s: 1, r: 0 })), 2.5);
    }
  }
}
