// 카트 레이스 - 트랙: 높이가 있는 닫힌 곡선을 따라 도로·연석·갓길·벽·둑/기둥·점프대·글라이더 구간을 만들고,
// 위치 질의(가장 가까운 지점, 그 지점의 높이, 낭떠러지 여부 등)를 제공
import * as THREE from '../../vendor/three.module.min.js';

const SAMPLE_STEP = 2; // m

/** 노면 무늬 */
function surfaceTexture(kind) {
  return canvasTexture(64, 64, (c, w, h) => {
    if (kind === 'wood') { // 나무 다리: 가로 널빤지
      for (let y = 0; y < h; y += 8) { c.fillStyle = ['#a16207', '#92400e', '#b45309'][(y / 8) % 3]; c.fillRect(0, y, w, 7); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 7, w, 1); }
      c.fillStyle = 'rgba(0,0,0,.4)'; for (let y = 2; y < h; y += 8) { c.fillRect(4, y, 2, 2); c.fillRect(w - 6, y, 2, 2); }
    } else if (kind === 'brick') { // 벽돌길
      c.fillStyle = '#9a3412'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c2410c';
      for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) c.fillRect(x + 1, y + 1, 14, 6);
    } else if (kind === 'neon') { // 네온 격자
      c.fillStyle = '#0b1026'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#22d3ee'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
      c.strokeStyle = 'rgba(244,114,182,.8)'; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
    } else if (kind === 'glass') { // 유리 다리: 푸른 판 + 반짝임
      c.fillStyle = '#bae6fd'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e0f2fe'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.moveTo(10, 50); c.lineTo(30, 30); c.stroke();
    } else if (kind === 'metal') { // 철판 격자
      c.fillStyle = '#52525b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#71717a'; for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) c.fillRect(x, y, 6, 2);
      c.fillStyle = 'rgba(249,115,22,.5)'; c.fillRect(0, 0, w, 3);
    } else if (kind === 'ice') {
      c.fillStyle = '#e0f2fe'; c.fillRect(0, 0, w, h);
    } else { c.fillStyle = '#4b5059'; c.fillRect(0, 0, w, h); }
  });
}

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
    // 높이도 함께 키워서 경사 비율 유지
    const pts = def.points.map(([x, z, y = 0]) => new THREE.Vector3(x * def.scale, y * def.scale, z * def.scale));
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
    this.ramps = (def.ramps ?? []).map((k) => ({ d: pointD(k), glide: false, len: 9, rise: 1.2 }));
    for (const g of this.gaps) this.ramps.push({ d: g.launch, glide: true, len: 12, rise: 1.7 });
    this.bridges = (def.bridges ?? []).map(([a, b]) => [pointD(a), pointD(b)]);
    if (def.autoRamps !== false) this.addCrestRamps(); // 언덕 꼭대기 점프대 (곡률·고가도로 정보가 생긴 뒤)
    for (const s of this.samples) s.bank = 0;
    this.buildShortcuts();
    // 갈림길·지름길까지 포함한 범위 (미니맵·바닥·먼 산 배치용)
    for (const sc of this.shortcuts) for (const q of sc.samples) {
      const b = this.bounds;
      b.minX = Math.min(b.minX, q.x); b.maxX = Math.max(b.maxX, q.x); b.minZ = Math.min(b.minZ, q.z); b.maxZ = Math.max(b.maxZ, q.z);
    }
    this.computeBanks();
  }

  /**
   * 기울어진 커브(뱅크): 급커브에서 도로 안쪽이 낮아짐 → 바깥으로 덜 밀리고 보기에도 시원함
   * bank = 오른쪽으로 1m 갈 때 높이 변화. 출발선·점프대·글라이더·갈림길 입구 근처는 평평하게
   */
  computeBanks() {
    const S = this.samples, N = this.N, L = this.length, maxB = this.def.bank ?? 0.16;
    const raw = S.map((s, i) => {
      const a = S[(i - 5 + N) % N], b = S[(i + 5) % N];
      const cross = a.tx * b.tz - a.tz * b.tx; // >0: 오른쪽으로 꺾임 → 오른쪽(안쪽)이 낮게
      return Math.max(-maxB, Math.min(maxB, -cross * 1.1));
    });
    const flatNear = [0];
    for (const r of this.ramps) flatNear.push(r.d);
    for (const g of this.gaps) flatNear.push(g.launch, g.to);
    for (const o of this.openings) flatNear.push(o.a, o.b);
    S.forEach((s, i) => {
      let sum = 0;
      for (let k = -8; k <= 8; k++) sum += raw[(i + k + N) % N];
      let b = sum / 17;
      for (const d of flatNear) { const dd = Math.min(Math.abs(s.d - d), L - Math.abs(s.d - d)); if (dd < 40) b *= Math.max(0, (dd - 15) / 25); }
      if (this.inGap(s.d)) b = 0;
      s.bank = b;
    });
  }

  /** 지름길: 본선에서 벽이 뚫린 곳으로 나가 바깥 흙길을 지나 다시 본선으로 합류 */
  buildShortcuts() {
    const L = this.length;
    this.openings = [];
    this.shortcuts = (this.def.shortcuts ?? []).map((sc) => {
      const dFrom = sc.from * L, dTo = sc.to * L, side = sc.side;
      const branch = sc.kind === 'branch'; // 갈림길: 진짜 포장도로 (본선과 비슷한 길이, 벽 있음)
      const out = this.wall + (sc.out ?? (branch ? 20 : 7));
      const pt = (d, lat) => { const p = this.at(d); return new THREE.Vector3(p.x + p.nx * lat * side, p.y, p.z + p.nz * lat * side); };
      // 갈림길은 옆으로 많이 벌어지므로 그만큼 길게 빠져나가게 (급하게 꺾이지 않도록)
      const span0 = ((dTo - dFrom) % L + L) % L;
      const lead = branch ? Math.min(span0 * 0.38, Math.max(24, out * 0.9)) : 20;
      const A = pt(dFrom, this.hw * 0.3), A2 = pt(dFrom + lead, out), B2 = pt(dTo - lead, out), B = pt(dTo, this.hw * 0.3);
      const mid = A2.clone().add(B2).multiplyScalar(0.5);
      let curve = new THREE.CatmullRomCurve3([A, A2, mid, B2, B], false, 'centripetal');
      // 지름길 가운데 부분이 본선 벽에 붙지 않도록 바깥으로 밀어냄 (몇 번 반복)
      const half = (sc.width ?? (branch ? 15 : 10)) / 2, clear = this.wall + half + 3;
      for (let iter = 0; iter < 3; iter++) {
        const pts2 = curve.getSpacedPoints(24);
        pts2.forEach((p, i) => {
          if (i < 3 || i > pts2.length - 4) return;
          const q = this.nearest(p.x, p.z);
          if (Math.abs(q.lat) < clear) {
            const sg = Math.sign(q.lat) || side, k = clear - Math.abs(q.lat);
            p.x += q.s.nx * sg * k; p.z += q.s.nz * sg * k;
          }
        });
        curve = new THREE.CatmullRomCurve3(pts2, false, 'centripetal');
      }
      const length = curve.getLength(), n = Math.round(length / SAMPLE_STEP);
      const samples = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u), fl = Math.hypot(t.x, t.z) || 1;
        samples.push({ x: p.x, y: p.y, z: p.z, tx: t.x / fl, tz: t.z / fl, nx: -t.z / fl, nz: t.x / fl, d: u * length, slope: t.y / fl });
      }
      const span = ((dTo - dFrom) % L + L) % L;
      // 벽은 '옆에 그 길이 실제로 붙어 있는 구간'만 엶 (너무 길게 열면 높은 곳에서 그 틈으로 떨어짐)
      const near = (d) => { const m = this.at(d); let best = Infinity; for (const q of samples) best = Math.min(best, (q.x - m.x) ** 2 + (q.z - m.z) ** 2); return Math.sqrt(best) < this.wall + half + 1.5; };
      const maxOp = branch ? Math.min(lead, 40) + 6 : 26;
      let opA = 4; while (opA < maxOp && near(dFrom + opA + 2)) opA += 2;
      let opB = 4; while (opB < maxOp && near(dTo - opB - 2)) opB += 2;
      this.openings.push({ side, a: dFrom - 4, b: dFrom + opA }, { side, a: dTo - opB, b: dTo + 4 });
      const ratio = length / span;
      // 짧을수록 흙길을 더 느리게 (지름길 이득을 구간 기준 20% 정도로)
      if (branch) return { ...sc, branch, samples, length, dFrom, dTo, span, half, surface: 1 };
      return { ...sc, samples, length, dFrom, dTo, span, half, surface: Math.max(0.6, Math.min(0.85, ratio * 1.25)) };
    });
  }

  /** 점프대 단면: 처음엔 완만하다가 끝에서 가팔라지는 곡선 (u: 0 시작 ~ 1 끝) */
  rampProfile(r, u) { return r.rise * Math.pow(Math.max(0, Math.min(1, u)), 1.8); }
  /** 거리 d 에서 점프대 때문에 올라간 높이 */
  rampHeight(d) {
    for (const r of this.ramps) {
      let k = d - (r.d - r.len);
      if (k < 0) k += this.length;
      if (k >= 0 && k <= r.len) return this.rampProfile(r, k / r.len);
    }
    return 0;
  }
  /** 언덕 꼭대기(오르막 → 내리막)인 곧은 길에 점프대를 자연스럽게 추가 (트랙당 최대 2개) */
  addCrestRamps() {
    const S = this.samples, N = this.N, L = this.length;
    const busy = (d) => d < 80 || d > L - 80 || this.ramps.some((r) => Math.abs(r.d - d) < 120) || this.gaps.some((g) => this.inRange(d, g.launch - 60, g.to + 40)) || this.onBridge(d)
      || (this.def.shortcuts ?? []).some((sc) => Math.abs(sc.from * L - d) < 60 || Math.abs(sc.to * L - d) < 60);
    let added = 0;
    for (let i = 8; i < N - 8 && added < 2; i++) {
      const a = S[i - 6].slope, b = S[i + 4].slope, d = S[i].d;
      const straight = this.curv[i] < 0.2 && this.curv[(i - 10 + N) % N] < 0.25;
      if (a > 0.04 && b < 0.012 && straight && !busy(d)) { this.ramps.push({ d, glide: false, len: 9, rise: 1.1, crest: true }); added++; } // 오르막이 끝나는 꼭대기
    }
  }

  /**
   * (x,z) 반경 r 짜리 물체가 도로(본선 벽 안쪽·지름길·갈림길)와 겹치지 않는지
   * y0~y1: 물체 높이 범위 (도로 면에서 4m 위까지만 겹침으로 봄 → 위로 지나가는 다리·아치는 괜찮음)
   */
  roadClear(x, z, r, y0 = -Infinity, y1 = Infinity) {
    const hit = (s, w) => (s.x - x) ** 2 + (s.z - z) ** 2 < (w + r) ** 2 && y1 > s.y - 1 && y0 < s.y + 4;
    for (const s of this.samples) if (!this.inGap(s.d) && hit(s, this.wall - 0.3)) return false;
    for (const sc of this.shortcuts ?? []) for (const s of sc.samples) if (hit(s, sc.half + 1.3)) return false;
    return true;
  }

  /** 상자(Box3)가 도로 위 공간(도로 면 ~ 4m 위)과 겹치는지 — 아래에서 받치는 기둥(도로 면보다 안 튀어나옴)은 괜찮음 */
  boxHitsRoad(bb) {
    const hit = (s, w) => {
      const dx = Math.max(bb.min.x - s.x, 0, s.x - bb.max.x), dz = Math.max(bb.min.z - s.z, 0, s.z - bb.max.z);
      if (dx * dx + dz * dz > w * w) return false;
      const lo = s.y - Math.abs(w * (s.bank ?? 0)) - 0.3, hi = s.y + Math.abs(w * (s.bank ?? 0)) + 4;
      return bb.max.y > Math.max(lo, s.y + 0.6) && bb.min.y < hi;
    };
    for (const s of this.samples) if (!this.inGap(s.d) && hit(s, this.wall - 0.3)) return true;
    for (const sc of this.shortcuts ?? []) for (const s of sc.samples) if (hit(s, sc.half + 1.3)) return true;
    return false;
  }

  /** 다 만든 뒤 정리: 도로를 침범하는 장식(나무·바위·구름·건물·기둥 등)을 숨김 → 맵과 트랙이 겹치는 버그 방지 */
  sanitize(g, skip) {
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3(), m = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let removed = 0;
    g.traverse((o) => {
      if (!o.isMesh || skip.has(o) || o.userData.keep) return;
      const t = o.geometry.type;
      if (t === 'BufferGeometry' || t === 'TorusGeometry' || (t === 'PlaneGeometry' && (o.geometry.parameters.width > 500 || o.userData.decal))) return;
      o.geometry.computeBoundingBox();
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          bb.copy(o.geometry.boundingBox).applyMatrix4(m).applyMatrix4(o.matrixWorld);
          if (bb.max.y - bb.min.y > 0.35 && this.boxHitsRoad(bb)) { o.setMatrixAt(i, zero); removed++; }
        }
        o.instanceMatrix.needsUpdate = true;
      } else {
        bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (bb.max.y - bb.min.y > 0.35 && this.boxHitsRoad(bb)) { o.visible = false; removed++; }
      }
    });
    this.sanitized = removed;
  }

  /** 벽이 뚫린 곳인지 (side: 1 오른쪽, -1 왼쪽) */
  isOpen(d, side) { return this.openings.some((o) => o.side === side && this.inRange(d, o.a, o.b)); }

  /** 지름길 k 에서 가장 가까운 지점 */
  nearestShortcut(k, x, z, hint) {
    const sc = this.shortcuts[k], S = sc.samples;
    let best = 0, bd = Infinity;
    const from = hint === undefined || hint < 0 ? 0 : Math.max(0, hint - 25), to = hint === undefined || hint < 0 ? S.length - 1 : Math.min(S.length - 1, hint + 25);
    for (let i = from; i <= to; i++) { const s = S[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (hint !== undefined && hint >= 0 && bd > (sc.half + 6) ** 2) return this.nearestShortcut(k, x, z); // 예전 위치 근처에 없으면 전체에서 다시 찾기
    const s = S[best];
    const lat = (x - s.x) * s.nx + (z - s.z) * s.nz;
    const along = Math.max(0, Math.min(sc.length, s.d + (x - s.x) * s.tx + (z - s.z) * s.tz));
    const t = along / sc.length;
    // 지름길 위 진행도를 본선 거리로 환산 (순위·랩 계산용)
    return { i: best, lat, t, s, y: s.y, dist2: bd, mainD: (sc.dFrom + t * sc.span) % this.length };
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
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, tx: tx / tl, tz: tz / tl, nx: -tz / tl, nz: tx / tl, slope: a.slope, bank: (a.bank ?? 0) + ((b.bank ?? 0) - (a.bank ?? 0)) * k, i, d };
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
    const p = this.at(d);
    return { i: best, lat, d, s, y: p.y + lat * p.bank, bank: p.bank };
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
    // 겹친 면이 멀리서 깜빡이지 않도록 깊이 보정(polygonOffset): 바닥은 뒤로, 연석·발판 등은 앞으로
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: groundTex, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.02, cz);
    g.add(ground);

    // 트랙을 따라가는 띠 메시: 가로 a~b 위치, 높이 오프셋 y0/y1 (세로 띠도 가능)
    const strip = (a, bOff, y0, y1, mat, vScale, filter = keep, absY = false) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const s = S[i % N], d = i === N ? this.length : s.d;
        const bk = s.bank ?? 0;
        const ya = absY ? y0 : s.y + y0 + a * bk, yb = absY ? y1 : s.y + y1 + bOff * bk;
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
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide });
    strip(-this.hw, this.hw, 0.02, 0.02, roadMat, 12);
    // 노면 구간 (나무 다리·벽돌길·네온 격자·유리·철판): 도로 위에 덮어 그림
    for (const sf of this.def.surfaces ?? []) {
      const a0 = sf.from * this.length, a1 = sf.to * this.length;
      const tex = surfaceTexture(sf.kind);
      const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: sf.kind === 'glass', opacity: sf.kind === 'glass' ? 0.85 : 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      strip(-this.hw, this.hw, 0.025, 0.025, mat, sf.kind === 'wood' ? 4 : 8, (i) => keep(i) && this.inRange(S[i].d, a0, a1) && this.inRange(S[(i + 1) % N].d, a0, a1));
    }
    const curbTex = canvasTexture(16, 64, (ctx, w, h) => {
      ctx.fillStyle = css(th.curbA); ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = css(th.curbB); ctx.fillRect(0, h / 2, w, h / 2);
    });
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    strip(this.hw, this.hw + this.curb, 0.03, 0.03, curbMat, 4);
    strip(-this.hw - this.curb, -this.hw, 0.03, 0.03, curbMat, 4);
    // 갓길 (감속 구간) - 도로와 같은 높이
    const shoulderMat = new THREE.MeshLambertMaterial({ map: groundTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    strip(this.hw + this.curb, this.wall, 0.01, 0.01, shoulderMat, 16);
    strip(-this.wall, -this.hw - this.curb, 0.01, 0.01, shoulderMat, 16);

    // 벽 + 윗부분
    // 벽 무늬: 칸막이 패널 + 아래 어두운 띠 + 가끔 화살표 표지 (세로 = 높이, 가로 = 진행 방향)
    const wallTex = canvasTexture(32, 128, (ctx, w, h) => {
      ctx.fillStyle = css(th.wall); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(w * 0.55, 0, w * 0.3, h);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, 0, w * 0.18, h);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = css(th.wallTop); ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(w * 0.3, 70); ctx.lineTo(w * 0.75, 80); ctx.lineTo(w * 0.3, 90); ctx.fill(); ctx.globalAlpha = 1;
    });
    const wallMat = th.night
      ? new THREE.MeshBasicMaterial({ color: th.wall, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
      : new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
    const topMat = new THREE.MeshBasicMaterial({ color: th.wallTop, side: THREE.DoubleSide });
    this._mats = { roadMat, curbMat, wallMat, topMat, arrowTex: null };
    for (const off of [this.wall, -this.wall]) {
      const side = Math.sign(off);
      const wallKeep = (i) => keep(i) && !this.isOpen(S[i].d, side) && !this.isOpen(S[(i + 1) % N].d, side);
      strip(off, off, 0, 1.1, wallMat, 10, wallKeep);
      strip(off - 0.25, off + 0.25, 1.12, 1.12, topMat, 10, wallKeep);
    }

    // 높은 곳의 받침: 흙둑(옆면) 또는 기둥(고가도로), 떠 있는 트랙은 바닥판
    const dirtMat = new THREE.MeshLambertMaterial({ color: th.dirt ?? th.ground, side: THREE.DoubleSide });
    const raised = (i) => keep(i) && S[i].y > 0.3 && !this.onBridge(S[i].d);
    if (this.def.floating) {
      strip(-this.wall, this.wall, -1.6, -1.6, dirtMat, 10);
      for (const off of [this.wall, -this.wall]) strip(off, off, -1.6, 0, dirtMat, 10, (i) => keep(i) && !this.isOpen(S[i].d, Math.sign(off)));
    } else {
      for (const off of [this.wall, -this.wall]) {
        const m = strip(off, off, 0, 0, dirtMat, 10, (i) => raised(i) && !this.isOpen(S[i].d, Math.sign(off)));
        const arr = m.geometry.attributes.position.array;
        for (let k = 1; k < arr.length; k += 6) arr[k] = -0.1; // 아래쪽 꼭짓점을 땅까지 내려 흙둑 옆면으로
        m.geometry.computeVertexNormals();
      }
      // 고가도로 기둥·상판: 같은 모양을 반복하므로 InstancedMesh 하나로 (그리기 호출 1번)
      const pillarMat = new THREE.MeshLambertMaterial({ color: th.night ? 0x475569 : 0x9ca3af });
      const pillars = [], slabs = [];
      for (let i = 0; i < N; i += 6) {
        const s = S[i];
        if (!this.onBridge(s.d) || s.y < 1 || gapAt[i]) continue;
        for (const side of [-1, 1]) {
          const px = s.x + s.nx * (this.wall - 1) * side, pz = s.z + s.nz * (this.wall - 1) * side;
          // 아래로 다른 도로가 지나가면 그 자리에는 기둥을 세우지 않음 (도로 위에 기둥이 서서 뚫고 지나가던 문제)
          const blocks = S.some((o) => s.y - o.y > 2 && (o.x - px) ** 2 + (o.z - pz) ** 2 < (this.wall + 1.5) ** 2);
          if (!blocks) pillars.push({ x: px, z: pz, h: s.y });
        }
        for (const k of [0, 3]) {
          const t = S[(i + k) % N];
          if (!this.onBridge(t.d) || gapAt[(i + k) % N]) continue;
          // 바로 아래(5m 이내)로 다른 길이 지나가면 상판을 붙이지 않음 (아래 길 위로 튀어나오지 않게)
          const low = S.some((o) => { const dd = Math.abs(o.d - t.d); return Math.min(dd, this.length - dd) > 40 && t.y - o.y > 0 && t.y - o.y < 5.5 && (o.x - t.x) ** 2 + (o.z - t.z) ** 2 < (this.wall * 2 + 2) ** 2; });
          if (!low) slabs.push({ x: t.x, y: t.y - 0.45, z: t.z, r: Math.atan2(t.tx, t.tz), roll: -Math.atan(t.bank ?? 0) });
        }
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      if (pillars.length) {
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1, 1.2), pillarMat, pillars.length);
        pillars.forEach((p, i) => { m4.compose(new THREE.Vector3(p.x, p.h / 2, p.z), q.identity(), new THREE.Vector3(1, p.h, 1)); inst.setMatrixAt(i, m4); });
        g.add(inst);
      }
      if (slabs.length) {
        // 상판: 짧게(6.4m) 촘촘히, 기울어진 커브(뱅크)에 맞춰 같이 기울임 → 도로를 뚫고 튀어나오지 않음
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(this.wall * 2, 0.6, 6.4), pillarMat, slabs.length);
        inst.userData.keep = true; // 고가도로 상판 (아래 길과 간격이 좁아도 숨기면 안 됨)
        const eu = new THREE.Euler(0, 0, 0, 'YXZ');
        slabs.forEach((p, i) => { eu.set(0, p.r, p.roll); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromEuler(eu), new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, m4); });
        g.add(inst);
      }
    }

    // 출발선 (체크무늬) - 도로를 가로지르도록
    const s0 = S[0], h0 = Math.atan2(s0.tx, s0.tz);
    const checker = canvasTexture(64, 16, (ctx) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(i * 4, j * 4, 4, 4); }
    }, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.hw * 2, 2), new THREE.MeshBasicMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, h0, 0);
    line.position.set(s0.x, s0.y + 0.04, s0.z);
    g.add(line);
    // 출발 아치: 기둥 2개 + 가로 현수막
    const archMat = new THREE.MeshLambertMaterial({ color: th.wallTop });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), archMat);
      post.position.set(s0.x + s0.nx * (this.wall + 0.8) * side, s0.y + 3.5, s0.z + s0.nz * (this.wall + 0.8) * side); // 벽 바깥에 세움
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(this.wall * 2 + 2.4, 1.4, 0.5), new THREE.MeshBasicMaterial({ map: checker }));
    banner.position.set(s0.x, s0.y + 7, s0.z);
    banner.rotation.y = h0; // 상자의 가로(X)축이 도로를 가로지름
    g.add(banner);

    // 가속 발판
    const arrowTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fef08a';
      for (const y of [8, 34]) { ctx.beginPath(); ctx.moveTo(8, y + 22); ctx.lineTo(32, y); ctx.lineTo(56, y + 22); ctx.lineTo(44, y + 22); ctx.lineTo(32, y + 12); ctx.lineTo(20, y + 22); ctx.fill(); }
    }, false);
    this._mats.arrowTex = arrowTex;
    this.boostPads = this.def.boosts.map((f) => {
      const p = this.at(f * this.length);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: arrowTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pad.rotation.order = 'YXZ';
      pad.rotation.set(-Math.PI / 2, Math.atan2(p.tx, p.tz) + Math.PI, 0); // 화살표가 진행 방향을 가리키도록
      pad.position.set(p.x, p.y + 0.05, p.z);
      g.add(pad);
      return { d: f * this.length, x: p.x, y: p.y, z: p.z };
    });

    // 점프대 / 글라이더 발사대 (경사로)
    const stripeTex = (a, b2) => canvasTexture(32, 32, (ctx, w, h) => { ctx.fillStyle = a; ctx.fillRect(0, 0, w, h); ctx.fillStyle = b2; for (let i = -w; i < w; i += 12) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + 6, h); ctx.lineTo(i + 6 + h, 0); ctx.lineTo(i + h, 0); ctx.fill(); } });
    const rampTex = stripeTex('#facc15', '#1f2937'), glideTex = stripeTex('#38bdf8', '#ffffff');
    const rampMat = new THREE.MeshLambertMaterial({ map: this._mats.roadMat.map, side: THREE.DoubleSide });
    for (const r of this.ramps) {
      // 도로 폭 전체가 곡선으로 솟아오르는 발판: 윗면은 도로 무늬, 끝(립)은 줄무늬, 옆면은 막아서 속이 안 보이게
      const L = r.len, seg = 10, hw = this.hw + this.curb, pos = [], uv = [], idx = [];
      const lipPos = [], lipIdx = [], sidePos = [], sideIdx = [];
      for (let k = 0; k <= seg; k++) {
        const u = k / seg, p = this.at(r.d - L + u * L), h = this.rampProfile(r, u) + 0.03, bk = p.bank ?? 0;
        for (const sd of [-1, 1]) pos.push(p.x + p.nx * hw * sd, p.y + hw * sd * bk + h, p.z + p.nz * hw * sd);
        uv.push(0, (u * L) / 12, 1, (u * L) / 12);
        if (k < seg) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        for (const sd of [-1, 1]) sidePos.push(p.x + p.nx * hw * sd, p.y + hw * sd * bk, p.z + p.nz * hw * sd, p.x + p.nx * hw * sd, p.y + hw * sd * bk + h, p.z + p.nz * hw * sd);
      }
      for (let k = 0; k < seg; k++) for (const sd of [0, 1]) { const a = (k * 2 + sd) * 2, b = ((k + 1) * 2 + sd) * 2; sideIdx.push(a, b, a + 1, a + 1, b, b + 1); }
      const top = new THREE.BufferGeometry();
      top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); top.setIndex(idx); top.computeVertexNormals();
      g.add(new THREE.Mesh(top, rampMat));
      const side = new THREE.BufferGeometry();
      side.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3)); side.setIndex(sideIdx); side.computeVertexNormals();
      g.add(new THREE.Mesh(side, this._mats.wallMat));
      // 끝부분 줄무늬 (노랑·검정 = 점프, 하늘·흰 = 글라이더)
      const pe = this.at(r.d), hEnd = this.rampProfile(r, 1) + 0.035, pb = this.at(r.d - 1.2), hB = this.rampProfile(r, 1 - 1.2 / L) + 0.035;
      for (const [p, h] of [[pb, hB], [pe, hEnd]]) for (const sd of [-1, 1]) lipPos.push(p.x + p.nx * hw * sd, p.y + hw * sd * (p.bank ?? 0) + h, p.z + p.nz * hw * sd);
      lipIdx.push(0, 2, 1, 1, 2, 3);
      const lip = new THREE.BufferGeometry();
      lip.setAttribute('position', new THREE.Float32BufferAttribute(lipPos, 3)); lip.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 4, 0, 0, 1, 4, 1], 2)); lip.setIndex(lipIdx); lip.computeVertexNormals();
      g.add(new THREE.Mesh(lip, new THREE.MeshBasicMaterial({ map: r.glide ? glideTex : rampTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      if (r.glide) { // 글라이더 아치 표시
        const q = this.at(r.d - 6);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.wall + 0.8, 0.35, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x38bdf8 })); // 다리가 벽 바깥
        ring.position.set(q.x, q.y, q.z);
        ring.rotation.y = Math.atan2(q.tx, q.tz);
        g.add(ring);
      }
    }

    this.buildShortcutMeshes(g, dirtMat);

    // 아이템 박스 위치 (줄마다 4개)
    this.boxSpots = [];
    for (const f of this.def.boxes) {
      const p = this.at(f * this.length);
      for (const k of [-0.72, -0.36, 0, 0.36, 0.72]) this.boxSpots.push({ x: p.x + p.nx * this.hw * k, y: p.y + this.hw * k * p.bank, z: p.z + p.nz * this.hw * k }); // 한 줄에 5개
    }
    // 갈림길 위 아이템 박스
    for (const sc of this.shortcuts) for (const f of sc.boxes ?? []) {
      const S2 = sc.samples, q = S2[Math.round(f * (S2.length - 1))];
      for (const k of [-0.45, 0, 0.45]) this.boxSpots.push({ x: q.x + q.nx * sc.half * k, y: q.y, z: q.z + q.nz * sc.half * k });
    }

    this.addScenery(g, quality);
    this.addSky(g);
    return g;
  }

  buildShortcutMeshes(g, dirtMat) {
    const th = this.def.theme;
    const dirtTex = canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = this.def.floating ? '#b08968' : '#8a6a45'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(w * 0.25, 0, 5, h); ctx.fillRect(w * 0.7, 0, 5, h); // 바퀴 자국
      if (this.def.floating) { ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2); } // 널빤지
    });
    const mat = new THREE.MeshLambertMaterial({ map: dirtTex, side: THREE.DoubleSide });
    const postMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    for (const sc of this.shortcuts) {
      const S = sc.samples;
      const ribbon = (a, b, y0, y1, material, from = 0, to = S.length - 1) => {
        const p = [], u = [], ix = [];
        S.forEach((s, i) => {
          p.push(s.x + s.nx * a, s.y + y0, s.z + s.nz * a, s.x + s.nx * b, s.y + y1, s.z + s.nz * b);
          u.push(0, s.d / 8, 1, s.d / 8);
          if (i < S.length - 1 && i >= from && i < to) { const k = i * 2; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
        geo.setIndex(ix);
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, material));
      };
      if (sc.branch) {
        // 갈림길: 포장도로 + 연석 + 양쪽 벽 (들어가고 나오는 곳은 벽 없이 본선과 이어짐) + 가속 발판
        const M = this._mats;
        ribbon(-sc.half, sc.half, 0.02, 0.02, M.roadMat);
        ribbon(sc.half, sc.half + 1, 0.03, 0.03, M.curbMat); ribbon(-sc.half - 1, -sc.half, 0.03, 0.03, M.curbMat);
        const w0 = 12, w1 = S.length - 13;
        for (const sd of [-1, 1]) { ribbon(sd * (sc.half + 1.2), sd * (sc.half + 1.2), 0, 1.1, M.wallMat, w0, w1); ribbon(sd * (sc.half + 1.2) - 0.25, sd * (sc.half + 1.2) + 0.25, 1.12, 1.12, M.topMat, w0, w1); }
        if (this.def.floating) { ribbon(-sc.half - 1.2, sc.half + 1.2, -1.6, -1.6, dirtMat); }
        else if (S.some((q) => q.y > 0.5)) for (const sd of [-1, 1]) ribbon(sd * (sc.half + 1.2), sd * (sc.half + 1.2), 0, 0, dirtMat);
        for (const f of sc.boosts ?? []) {
          const q = S[Math.round(f * (S.length - 1))];
          const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: M.arrowTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
          pad.rotation.order = 'YXZ'; pad.rotation.set(-Math.PI / 2, Math.atan2(q.tx, q.tz) + Math.PI, 0);
          pad.position.set(q.x, q.y + 0.05, q.z);
          g.add(pad);
          this.boostPads.push({ d: -1, x: q.x, y: q.y, z: q.z });
        }
        const s0 = this.at(sc.dFrom - 12);
        const signTex = canvasTexture(160, 64, (ctx, w, h) => {
          ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(sc.side > 0 ? '갈림길 ▶' : '◀ 갈림길', w / 2, 30);
          ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText(sc.label ?? '', w / 2, 52);
        }, false);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 0.2), new THREE.MeshBasicMaterial({ map: signTex }));
        sign.position.set(s0.x + s0.nx * (this.wall + 1.5) * sc.side, s0.y + 3.2, s0.z + s0.nz * (this.wall + 1.5) * sc.side);
        if (!this.roadClear(sign.position.x, sign.position.z, 2.6, s0.y + 2, s0.y + 4.5)) sign.position.y += 5; // 다른 길 위면 높이 올려서 위로 지나가게
        sign.rotation.y = Math.atan2(s0.tx, s0.tz) + Math.PI;
        g.add(sign);
        continue;
      }
      ribbon(-sc.half, sc.half, 0.015, 0.015, mat);
      if (this.def.floating) { ribbon(-sc.half, sc.half, -0.8, -0.8, dirtMat); for (const s of [-1, 1]) ribbon(s * sc.half, s * sc.half, -0.8, 0, dirtMat); }
      else if (S.some((s) => s.y > 0.5)) for (const s of [-1, 1]) ribbon(s * sc.half, s * sc.half, 0, 0, dirtMat); // (높은 지름길은 아래 흙둑으로 대충 메움)
      // 가장자리 노란 말뚝 (InstancedMesh)
      const postPos = [];
      for (let i = 4; i < S.length - 4; i += 5) for (const sd of [-1, 1]) {
        const s = S[i], px = s.x + s.nx * (sc.half + 0.4) * sd, pz = s.z + s.nz * (sc.half + 0.4) * sd;
        const q = this.nearest(px, pz);
        if (Math.abs(q.lat) < this.wall + 0.5 && Math.abs(q.y - s.y) < 4) continue; // 본선과 합쳐지는 곳에선 말뚝 없음
        postPos.push([px, s.y + 0.5, pz]);
      }
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 5), postMat, postPos.length);
      const pm = new THREE.Matrix4();
      postPos.forEach(([x, y, z], i) => { pm.makeTranslation(x, y, z); posts.setMatrixAt(i, pm); });
      g.add(posts);
      // 입구 표지판
      const s0 = this.at(sc.dFrom - 10);
      const signTex = canvasTexture(128, 64, (ctx, w, h) => {
        ctx.fillStyle = '#fde047'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#111'; ctx.font = '900 24px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(sc.side > 0 ? '지름길 ▶' : '◀ 지름길', w / 2, 40);
      }, false);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.2), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(s0.x + s0.nx * (this.wall + 1.5) * sc.side, s0.y + 3, s0.z + s0.nz * (this.wall + 1.5) * sc.side);
      if (!this.roadClear(sign.position.x, sign.position.z, 2.2, s0.y + 2, s0.y + 4)) sign.position.y += 5;
      sign.rotation.y = Math.atan2(s0.tx, s0.tz) + Math.PI;
      g.add(sign);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 5), new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
      pole.position.set(sign.position.x, s0.y + 1.5, sign.position.z);
      g.add(pole);
      // 지름길 가운데 가속 발판
      const m = S[Math.floor(S.length / 2)];
      this.boostPads.push({ d: -1, x: m.x, y: m.y, z: m.z });
      const arrowTex = canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fef08a';
        for (const y of [8, 34]) { ctx.beginPath(); ctx.moveTo(8, y + 22); ctx.lineTo(32, y); ctx.lineTo(56, y + 22); ctx.lineTo(44, y + 22); ctx.lineTo(32, y + 12); ctx.lineTo(20, y + 22); ctx.fill(); }
      }, false);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: arrowTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pad.rotation.order = 'YXZ';
      pad.rotation.set(-Math.PI / 2, Math.atan2(m.tx, m.tz) + Math.PI, 0);
      pad.position.set(m.x, m.y + 0.05, m.z);
      g.add(pad);
    }
  }

  /** 하늘 장식: 낮에는 구름, 밤에는 별 (안개 영향 없이 멀리) */
  addSky(g) {
    const th = this.def.theme, b = this.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (th.night) {
      const pos = [];
      for (let i = 0; i < 500; i++) {
        const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.2;
        pos.push(cx + Math.cos(a) * Math.cos(e) * 900, Math.sin(e) * 900, cz + Math.sin(a) * Math.cos(e) * 900);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
      return;
    }
    const smoke = th.scenery === 'volcano';
    const tex = canvasTexture(128, 64, (ctx, w, h) => {
      for (let i = 0; i < 9; i++) {
        const x = 20 + Math.random() * (w - 40), y = 26 + Math.random() * 16, r = 12 + Math.random() * 14;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = smoke ? '60,40,36' : '255,255,255';
        gr.addColorStop(0, `rgba(${c},.95)`); gr.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      }
    }, false);
    const mat = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false, opacity: smoke ? 0.7 : 0.9 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, R = 500 + Math.random() * 250;
      const sp = new THREE.Sprite(mat);
      sp.position.set(cx + Math.cos(a) * R, 90 + Math.random() * 110, cz + Math.sin(a) * R);
      const s = 140 + Math.random() * 120;
      sp.scale.set(s, s * 0.45, 1);
      g.add(sp);
    }
  }

  /** 트랙 밖 장식 (InstancedMesh 로 가볍게) */
  addScenery(g, quality) {
    const th = this.def.theme, b = this.bounds;
    const count = Math.round(320 * quality);
    const spots = [];
    let tries = 0;
    while (spots.length < count && tries++ < count * 20) {
      const x = b.minX - 90 + Math.random() * (b.maxX - b.minX + 180);
      const z = b.minZ - 90 + Math.random() * (b.maxZ - b.minZ + 180);
      // 트랙(높이 무관)과 충분히 떨어진 곳만
      let ok = true;
      for (let i = 0; i < this.N; i += 3) { const s = this.samples[i]; if ((s.x - x) ** 2 + (s.z - z) ** 2 < (this.wall + 5) ** 2) { ok = false; break; } }
      for (const sc of this.shortcuts) for (const s of sc.samples) if (ok && (s.x - x) ** 2 + (s.z - z) ** 2 < (sc.half + 6) ** 2) ok = false;
      if (!ok) continue;
      spots.push({ x, z, s: 0.7 + Math.random() * 0.8, r: Math.random() * Math.PI * 2 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    // 장식이 트랙(벽 포함)·지름길과 겹치지 않는지: 실제 크기(가로 반경)로 검사
    const clearOf = (x, z, r) => {
      const lim = (this.wall + r + 1.5) ** 2;
      for (const s of this.samples) if ((s.x - x) ** 2 + (s.z - z) ** 2 < lim) return false;
      for (const sc of this.shortcuts) for (const s of sc.samples) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (sc.half + r + 2) ** 2) return false;
      return true;
    };
    const footprint = (geo) => {
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      return Math.hypot(Math.max(-bb.min.x, bb.max.x), Math.max(-bb.min.z, bb.max.z));
    };
    // 먼 배경 산: 트랙에서 가장 먼 곳보다 바깥 고리에 (반경 radius 인 물체가 트랙을 덮지 않도록)
    const ring = (n, radius, scaleMax, phase = 0) => {
      let far = 0;
      for (const s of [...this.samples, ...this.shortcuts.flatMap((sc) => sc.samples)]) far = Math.max(far, Math.hypot(s.x - (b.minX + b.maxX) / 2, s.z - (b.minZ + b.maxZ) / 2));
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + phase, sc = 1 + Math.random() * (scaleMax - 1);
        const R0 = far + radius * sc + 30 + Math.random() * 40;
        out.push({ x: (b.minX + b.maxX) / 2 + Math.cos(a) * R0, z: (b.minZ + b.maxZ) / 2 + Math.sin(a) * R0, s: sc, r: a, free: true });
      }
      return out;
    };
    const place = (geo, mat, list, yOff, sx = 1, sy = 1) => {
      const fr = footprint(geo) * sx;
      list = list.filter((p) => p.free || clearOf(p.x, p.z, fr * p.s));
      if (!list.length) return;
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
      const far = ring(14, 40, 2);
      place(new THREE.CylinderGeometry(30, 40, 40, 6), new THREE.MeshLambertMaterial({ color: 0xc0703a }), far, 20);
    } else if (kind === 'city') {
      const list = spots.slice(0, Math.round(spots.length * 0.7)).filter((p) => clearOf(p.x, p.z, 10.5));
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
      const lamps = this.samples.filter((_, i) => i % 12 === 0).map((s) => ({ x: s.x + s.nx * (this.wall + 1), z: s.z + s.nz * (this.wall + 1), s: 1, r: 0, y0: s.y, free: true }))
        .filter((p) => this.roadClear(p.x, p.z, 0.3, p.y0, p.y0 + 5))
        .filter((p) => !this.samples.some((s) => Math.abs(s.y - p.y0) > 2 && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < (this.wall + 1) ** 2));
      place(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfef08a }), lamps, 5);
      place(new THREE.CylinderGeometry(0.12, 0.12, 5, 5), new THREE.MeshLambertMaterial({ color: 0x64748b }), lamps, 2.5);
    } else if (kind === 'volcano') {
      // 검은 바위 + 빛나는 용암 웅덩이 + 멀리 연기 나는 화산들
      const half = spots.slice(0, Math.round(spots.length * 0.6)), pools = spots.slice(Math.round(spots.length * 0.6));
      place(new THREE.DodecahedronGeometry(2, 0), new THREE.MeshLambertMaterial({ color: 0x292524 }), half, 0.9);
      place(new THREE.CylinderGeometry(3.2, 3.2, 0.2, 10), new THREE.MeshBasicMaterial({ color: 0xf97316 }), pools.map((p) => ({ ...p, s: 0.8 + p.s })), 0.12, 1, 0.5);
      place(new THREE.CylinderGeometry(2.2, 2.2, 0.25, 10), new THREE.MeshBasicMaterial({ color: 0xfde047 }), pools.map((p) => ({ ...p, s: 0.8 + p.s })), 0.2, 1, 0.5);
      const far = ring(9, 55, 1.8, 0.3);
      place(new THREE.CylinderGeometry(12, 55, 60, 8), new THREE.MeshLambertMaterial({ color: 0x3f2a22 }), far, 30);
      place(new THREE.CylinderGeometry(11, 11, 2, 8), new THREE.MeshBasicMaterial({ color: 0xfb923c }), far, 60);
    } else if (kind === 'beach') {
      // 야자수 + 파라솔 (색 3가지) + 모래 언덕
      const palms = spots.slice(0, Math.round(spots.length * 0.45)), rest = spots.slice(palms.length);
      place(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), new THREE.MeshLambertMaterial({ color: 0x92400e }), palms, 3.5);
      place(new THREE.ConeGeometry(3.6, 1.6, 7), new THREE.MeshLambertMaterial({ color: 0x16a34a }), palms, 7.4);
      place(new THREE.ConeGeometry(2.6, 1.4, 7), new THREE.MeshLambertMaterial({ color: 0x22c55e }), palms.map((p) => ({ ...p, r: p.r + 0.5 })), 8.3);
      place(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshLambertMaterial({ color: 0x78350f }), palms.map((p) => ({ ...p, x: p.x + 0.5 })), 6.7);
      const umb = rest.slice(0, Math.round(rest.length * 0.5));
      [0xef4444, 0x3b82f6, 0xfacc15].forEach((c, k) => {
        const list = umb.filter((_, i) => i % 3 === k);
        place(new THREE.ConeGeometry(1.8, 0.8, 8), new THREE.MeshLambertMaterial({ color: c }), list, 2.6);
        place(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), list, 1.3);
      });
      place(new THREE.SphereGeometry(3, 8, 5), new THREE.MeshLambertMaterial({ color: 0xfcd34d }), rest.slice(umb.length), -1.6, 1.6, 0.5);
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
