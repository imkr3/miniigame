// 스쿼드 슈터 - 전장: 상자들로 맵을 만들고(그리기용 메시 + 충돌 상자), 충돌·광선·길찾기를 제공
// 좌표: x 동서, z 남북, y 위. 모든 충돌체는 축에 나란한 상자(AABB)
import * as THREE from '../../vendor/three.module.min.js';

export const STEP_H = 0.55;   // 이 높이까지는 계단처럼 그냥 올라감
export const GRAVITY = 22;
const CELL = 1;               // 길찾기 격자 한 칸(m)
const BUCKET = 4;             // 충돌 검색용 구역 크기(m)

// ---------------- 재질 (캔버스로 그린 무늬) ----------------
// tile = 무늬 한 장이 덮는 길이(m). 0 이면 면 하나에 한 장을 꽉 채움 (나무 상자 등)
const MATS = {
  concrete: { tile: 4, draw: (c, w, h) => { noise(c, w, h, '#9aa0a6', 0.1); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); } },
  plaster: { tile: 4, draw: (c, w, h) => { noise(c, w, h, '#e7d9bd', 0.07); c.fillStyle = 'rgba(120,90,50,.18)'; c.fillRect(0, h - 10, w, 10); crack(c, w, h); } },
  brick: { tile: 2, draw: (c, w, h) => { c.fillStyle = '#7a4a36'; c.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) { c.fillStyle = ['#b5654a', '#a85a42', '#c07358', '#9c5038'][(x * 3 + y * 5 + 8) % 4]; c.fillRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14); } } },
  metal: { tile: 2.4, draw: (c, w, h) => { c.fillStyle = '#d9d9d9'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { const g = c.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.28)'); c.fillStyle = g; c.fillRect(x, 0, 16, h); } c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); } },
  wood: { tile: 0, draw: (c, w, h) => { c.fillStyle = '#a9743a'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 21) { c.fillStyle = y % 42 ? '#b78245' : '#a06c34'; c.fillRect(0, y, w, 20); } c.strokeStyle = '#6d4520'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.lineWidth = 9; c.beginPath(); c.moveTo(8, 8); c.lineTo(w - 8, h - 8); c.moveTo(w - 8, 8); c.lineTo(8, h - 8); c.stroke(); } },
  planks: { tile: 2, draw: (c, w, h) => { for (let y = 0; y < h; y += 16) { c.fillStyle = ['#9a6b3a', '#8a5e30', '#a67642'][(y / 16) % 3]; c.fillRect(0, y, w, 15); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, y + 15, w, 1); } } },
  sandbag: { tile: 1.2, draw: (c, w, h) => { c.fillStyle = '#6b5b3e'; c.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) { c.fillStyle = (x + y) % 2 ? '#b9a26e' : '#a8915f'; c.beginPath(); c.roundRect(x * 64 + (y % 2) * 32 + 2, y * 32 + 2, 60, 28, 12); c.fill(); } } },
  roof: { tile: 3, draw: (c, w, h) => { noise(c, w, h, '#8a5a44', 0.1); c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 2); } },
  dark: { tile: 3, draw: (c, w, h) => { noise(c, w, h, '#3b4048', 0.12); } },
  asphalt: { tile: 8, draw: (c, w, h) => { noise(c, w, h, '#4c5057', 0.14); } },
  sand: { tile: 10, draw: (c, w, h) => { noise(c, w, h, '#d9b77a', 0.1); blotch(c, w, h, 14); } },
  snow: { tile: 10, draw: (c, w, h) => { noise(c, w, h, '#eef3f8', 0.05); blotch(c, w, h, 10); } },
  grass: { tile: 8, draw: (c, w, h) => { noise(c, w, h, '#6a9a4a', 0.12); blotch(c, w, h, 14); } },
  ice: { tile: 4, draw: (c, w, h) => { noise(c, w, h, '#b9dcf2', 0.06); crack(c, w, h); } },
  plain: { tile: 4, draw: (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); } },
};
function noise(c, w, h, base, amt) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * amt})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
}
function blotch(c, w, h, n) {
  for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 22, g = c.createRadialGradient(x, y, 0, x, y, r); const k = Math.random() < 0.5 ? '0,0,0' : '255,255,255'; g.addColorStop(0, `rgba(${k},.08)`); g.addColorStop(1, `rgba(${k},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
}
function crack(c, w, h) {
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1;
  for (let i = 0; i < 4; i++) { let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; c.lineTo(x, y); } c.stroke(); }
}
function makeTexture(name) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  MATS[name].draw(cv.getContext('2d'), 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------- 맵 짓기 도구 ----------------
/** 맵 정의(build 함수)가 쓰는 도구. 모든 좌표는 맵 가운데가 (0,0) */
export class MapBuilder {
  constructor(hx, hz) {
    this.hx = hx; this.hz = hz;
    this.boxes = []; this.props = [];
    this.T = { rot: false }; // 180° 돌려 놓기 (대칭 맵용)
  }
  /** fn 을 그대로 한 번, 맵 가운데 기준 180° 돌려서 한 번 실행 → 양 팀이 공평한 대칭 맵 */
  sym(fn) { fn(); this.T.rot = true; fn(); this.T.rot = false; }
  _x(x) { return this.T.rot ? -x : x; }
  /** 상자: 가운데 (x,z), 크기 w(동서)×d(남북)×h, 바닥 높이 y. opt: tint 색, solid=false 면 통과, nav=false 면 길찾기에서 무시 */
  box(x, z, w, d, h, mat = 'concrete', opt = {}) {
    const cx = this._x(x), cz = this._x(z), y = opt.y ?? 0;
    const b = { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h, z0: cz - d / 2, z1: cz + d / 2, mat, tint: opt.tint ?? 0xffffff, solid: opt.solid !== false, vis: opt.vis !== false, shape: opt.shape };
    this.boxes.push(b);
    return b;
  }
  /** 방향을 대칭에 맞춰 뒤집기: 'n'(z-) 's'(z+) 'w'(x-) 'e'(x+) */
  _dir(d) { return this.T.rot ? { n: 's', s: 'n', w: 'e', e: 'w' }[d] : d; }
  /** 나무 상자 (stack 개 쌓기) */
  crate(x, z, s = 1.3, stack = 1, tint) { for (let i = 0; i < stack; i++) this.box(x, z, s, s, s, 'wood', { y: i * s, tint }); }
  /** 컨테이너: along = 'x' 또는 'z' 방향으로 길게 */
  container(x, z, along = 'x', tint = 0x2f6fb3, y = 0) {
    const L = 6, W = 2.4, H = 2.6;
    this.box(x, z, along === 'x' ? L : W, along === 'x' ? W : L, H, 'metal', { tint, y });
  }
  /** 모래주머니 벽 (낮아서 앉으면 숨을 수 있음) */
  sandbags(x, z, len, along = 'x', h = 1.05) { this.box(x, z, along === 'x' ? len : 0.7, along === 'x' ? 0.7 : len, h, 'sandbag'); }
  /** 드럼통 */
  barrel(x, z, tint = 0xc0392b) { this.box(x, z, 0.8, 0.8, 1.15, 'metal', { tint, shape: 'cyl' }); }
  /** 낮은 담 / 높은 벽 (두 점을 잇는 축 방향 벽) */
  wall(x0, z0, x1, z1, h = 3, mat = 'concrete', t = 0.4, opt = {}) {
    const w = Math.abs(x1 - x0) + t, d = Math.abs(z1 - z0) + t;
    this.box((x0 + x1) / 2, (z0 + z1) / 2, w, d, h, mat, opt);
  }
  /** 계단: (x,z) 에서 dir 쪽으로 올라가 높이 top 에 닿음 */
  stairs(x, z, dir, top, width = 1.6, mat = 'concrete') {
    dir = this._dir(dir); const sx = this._x(x), sz = this._x(z);
    const rise = 0.27, run = 0.38, n = Math.round(top / rise), [dx, dz] = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[dir];
    const keep = this.T.rot; this.T.rot = false; // 이미 변환한 좌표로 직접 놓음
    for (let i = 0; i < n; i++) {
      const cx = sx + dx * (i + 0.5) * run, cz = sz + dz * (i + 0.5) * run;
      this.box(cx, cz, dx ? run : width, dz ? run : width, (i + 1) * (top / n), mat);
    }
    this.T.rot = keep;
  }
  /**
   * 집: 가운데 (x,z), 바깥 크기 w×d, 벽 높이 h. doors/wins = [[면, 가운데에서 떨어진 거리, 너비]]
   * 문 위에는 상인방, 창은 아래(1m)·위가 막혀 총알과 시야만 통과
   */
  house(x, z, w, d, h, { doors = [], wins = [], mat = 'plaster', roof = 'roof', tint, floor } = {}) {
    const t = 0.35;
    const side = (face) => {
      face = this._dir(face);
      const horiz = face === 'n' || face === 's', len = horiz ? w : d;
      const cx = this._x(x), cz = this._x(z);
      const fixed = face === 'n' ? cz - d / 2 + t / 2 : face === 's' ? cz + d / 2 - t / 2 : face === 'w' ? cx - w / 2 + t / 2 : cx + w / 2 - t / 2;
      const flip = this.T.rot ? -1 : 1;
      const holes = [...doors.filter((o) => this._dir(o[0]) === face).map((o) => ({ at: o[1] * flip, w: Math.max(1.9, o[2] ?? 1.9), lo: 0, hi: 2.25 })),
        ...wins.filter((o) => this._dir(o[0]) === face).map((o) => ({ at: o[1] * flip, w: o[2] ?? 1.6, lo: 1.0, hi: 2.0 }))].sort((a, b2) => a.at - b2.at);
      const put = (a, b2, y0, y1) => { // 벽 조각: 면을 따라 a~b2, 높이 y0~y1
        if (b2 - a < 0.02 || y1 - y0 < 0.02) return;
        const c = (a + b2) / 2, l = b2 - a;
        const keep = this.T.rot; this.T.rot = false;
        if (horiz) this.box(cx + c, fixed, l, t, y1 - y0, mat, { y: y0, tint }); else this.box(fixed, cz + c, t, l, y1 - y0, mat, { y: y0, tint });
        this.T.rot = keep;
      };
      let cur = -len / 2;
      for (const ho of holes) {
        put(cur, ho.at - ho.w / 2, 0, h);
        put(ho.at - ho.w / 2, ho.at + ho.w / 2, 0, ho.lo);
        put(ho.at - ho.w / 2, ho.at + ho.w / 2, ho.hi, h);
        cur = ho.at + ho.w / 2;
      }
      put(cur, len / 2, 0, h);
    };
    for (const f of ['n', 's', 'w', 'e']) side(f);
    if (roof) this.box(x, z, w + 0.5, d + 0.5, 0.25, roof, { y: h });
    if (floor) this.box(x, z, w - t, d - t, 0.04, floor, { solid: false });
  }
  /** 망루: 다리 4개 위 발판 + 난간 + 계단 */
  tower(x, z, h = 3.2, stairDir = 's') {
    const s = 3.2;
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(x + ax * (s / 2 - 0.15), z + az * (s / 2 - 0.15), 0.3, 0.3, h, 'planks');
    this.box(x, z, s, s, 0.25, 'planks', { y: h });
    for (const f of ['n', 's', 'w', 'e']) {
      if (f === stairDir) continue;
      const horiz = f === 'n' || f === 's', off = (f === 'n' || f === 'w' ? -1 : 1) * (s / 2 - 0.1);
      this.box(x + (horiz ? 0 : off), z + (horiz ? off : 0), horiz ? s : 0.2, horiz ? 0.2 : s, 0.9, 'planks', { y: h + 0.25 });
    }
    const [dx, dz] = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[stairDir];
    const n = Math.round((h + 0.25) / 0.27), run = n * 0.38;
    this.stairs(x + dx * (s / 2 + run), z + dz * (s / 2 + run), { n: 's', s: 'n', w: 'e', e: 'w' }[stairDir], h + 0.25, 1.4, 'planks');
  }
  /** 나무 (줄기만 충돌) */
  tree(x, z, kind = 'pine', s = 1) { this.box(x, z, 0.5, 0.5, 2.2 * s, 'planks', { vis: false }); this.props.push({ type: kind, x: this._x(x), z: this._x(z), s }); }
}

// ---------------- 전장 ----------------
export class World {
  /** def = { size:[w,d], ground, sky, fog, sun, build(b), spawns:{a:[[x,z]..], b:[..], ffa:[..], zombie:[..]}, pickups:[[x,z,type]] } */
  constructor(def) {
    this.def = def;
    const hx = def.size[0] / 2, hz = def.size[1] / 2;
    this.hx = hx; this.hz = hz;
    const b = new MapBuilder(hx, hz);
    // 바깥 벽
    const wm = def.wallMat ?? 'concrete', wh = 6;
    b.box(0, -hz - 0.5, hx * 2 + 2, 1, wh, wm); b.box(0, hz + 0.5, hx * 2 + 2, 1, wh, wm);
    b.box(-hx - 0.5, 0, 1, hz * 2, wh, wm); b.box(hx + 0.5, 0, 1, hz * 2, wh, wm);
    def.build(b);
    this.boxes = b.boxes; this.props = b.props;
    this.solids = this.boxes.filter((o) => o.solid);
    // 충돌 검색용 구역
    this.bw = Math.ceil((hx * 2 + 4) / BUCKET); this.bh = Math.ceil((hz * 2 + 4) / BUCKET);
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    for (const o of this.solids) {
      const [i0, i1, j0, j1] = this._range(o.x0, o.x1, o.z0, o.z1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.buckets[j * this.bw + i].push(o);
    }
    this._stamp = 0;
    this.buildNav();
  }
  _range(x0, x1, z0, z1) {
    const c = (v, n) => Math.max(0, Math.min(n - 1, v));
    return [c(Math.floor((x0 + this.hx + 2) / BUCKET), this.bw), c(Math.floor((x1 + this.hx + 2) / BUCKET), this.bw), c(Math.floor((z0 + this.hz + 2) / BUCKET), this.bh), c(Math.floor((z1 + this.hz + 2) / BUCKET), this.bh)];
  }
  /** 영역과 겹치는 충돌 상자마다 fn 호출 (fn 이 true 를 돌려주면 멈춤) */
  each(x0, x1, y0, y1, z0, z1, fn) {
    const [i0, i1, j0, j1] = this._range(x0, x1, z0, z1), st = ++this._stamp;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const o of this.buckets[j * this.bw + i]) {
      if (o._st === st) continue; o._st = st;
      if (o.x1 <= x0 || o.x0 >= x1 || o.z1 <= z0 || o.z0 >= z1 || o.y1 <= y0 || o.y0 >= y1) continue;
      if (fn(o)) return true;
    }
    return false;
  }
  blocked(x, y, z, r, h) { return this.each(x - r, x + r, y + 0.02, y + h, z - r, z + r, () => true); }

  /**
   * 사람(발 위치 x,y,z · 반지름 r · 키 h)을 dx,dz 만큼 옮기고 중력을 적용. 낮은 턱은 올라가고 벽은 미끄러짐
   * a = { x, y, z, vy, grounded, r, h }
   */
  move(a, dx, dz, dt) {
    for (const axis of [0, 1]) {
      const d = axis ? dz : dx;
      if (!d) continue;
      const nx = a.x + (axis ? 0 : d), nz = a.z + (axis ? d : 0);
      let top = -Infinity, edge = null;
      this.each(nx - a.r, nx + a.r, a.y + 0.02, a.y + a.h, nz - a.r, nz + a.r, (o) => {
        top = Math.max(top, o.y1);
        const e = axis ? (d > 0 ? o.z0 - a.r - 0.001 : o.z1 + a.r + 0.001) : (d > 0 ? o.x0 - a.r - 0.001 : o.x1 + a.r + 0.001);
        edge = edge === null ? e : (d > 0 ? Math.min(edge, e) : Math.max(edge, e));
      });
      if (edge === null) { a.x = nx; a.z = nz; continue; }
      // 턱 오르기: 발이 땅에 닿아 있고, 올라선 자리에 머리 공간이 있을 때
      if ((a.grounded || a.vy <= 0) && top - a.y <= STEP_H && top - a.y > 0 && !this.blocked(nx, top, nz, a.r, a.h)) { a.x = nx; a.z = nz; a.y = top; a.grounded = true; a.vy = 0; continue; }
      if (axis) { if ((d > 0 && edge > a.z) || (d < 0 && edge < a.z)) a.z = edge; } else if ((d > 0 && edge > a.x) || (d < 0 && edge < a.x)) a.x = edge;
      a.hitWall = true;
    }
    // 수직
    a.vy -= GRAVITY * dt;
    let ny = a.y + a.vy * dt;
    if (a.vy <= 0) {
      let ground = 0; // 바닥
      this.each(a.x - a.r, a.x + a.r, ny, a.y + 0.3, a.z - a.r, a.z + a.r, (o) => { if (o.y1 <= a.y + 0.3 && o.y1 > ground) ground = o.y1; });
      if (ny <= ground) { ny = ground; a.landed = !a.grounded && a.vy < -6 ? -a.vy : 0; a.vy = 0; a.grounded = true; } else a.grounded = false;
    } else {
      let ceil = Infinity;
      this.each(a.x - a.r, a.x + a.r, a.y + a.h, ny + a.h, a.z - a.r, a.z + a.r, (o) => { if (o.y0 >= a.y + a.h - 0.05 && o.y0 < ceil) ceil = o.y0; });
      if (ny + a.h >= ceil) { ny = ceil - a.h - 0.001; a.vy = 0; }
      a.grounded = false;
    }
    a.y = ny;
  }

  /** 광선: (ox,oy,oz) 에서 (dx,dy,dz)(단위 벡터) 로 max 까지. 맞으면 { t, nx, ny, nz, box } / 아니면 null. 땅(y=0)도 포함 */
  ray(ox, oy, oz, dx, dy, dz, max = 200) {
    let best = max, hit = null, bn = 0;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    for (const o of this.solids) {
      let t0 = (o.x0 - ox) * ix, t1 = (o.x1 - ox) * ix, axis = 0;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      let a = (o.y0 - oy) * iy, b = (o.y1 - oy) * iy;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) { t0 = a; axis = 1; }
      if (b < t1) t1 = b;
      if (t0 > t1) continue;
      a = (o.z0 - oz) * iz; b = (o.z1 - oz) * iz;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) { t0 = a; axis = 2; }
      if (b < t1) t1 = b;
      if (t0 > t1 || t1 < 0 || t0 >= best || t0 < 0) continue;
      best = t0; hit = o; bn = axis;
    }
    let res = hit ? { t: best, box: hit, nx: bn === 0 ? -Math.sign(dx) : 0, ny: bn === 1 ? -Math.sign(dy) : 0, nz: bn === 2 ? -Math.sign(dz) : 0 } : null;
    if (dy < 0) { const tg = -oy / dy; if (tg < (res ? res.t : max)) res = { t: tg, box: null, nx: 0, ny: 1, nz: 0 }; }
    return res;
  }
  /** 두 점 사이가 뚫려 있는지 (시야·폭발) */
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return !this.ray(ax, ay, az, dx / len || 1e-9, dy / len || 1e-9, dz / len || 1e-9, len - 0.05);
  }

  // ---------------- 길찾기 (1m 격자) ----------------
  buildNav() {
    const nw = this.nw = Math.round(this.hx * 2 / CELL), nh = this.nh = Math.round(this.hz * 2 / CELL);
    const g = this.nav = new Uint8Array(nw * nh);       // 1 = 막힘
    const fl = this.floor = new Float32Array(nw * nh);  // 그 칸의 바닥 높이 (계단·단상 위는 0 보다 높음)
    const R = 0.36; // 사람 반지름만큼 넓혀서 막음 (문 너비 1.9m 이상이면 반드시 한 칸은 열림)
    const near = [];
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const cx = (i + 0.5) * CELL - this.hx, cz = (j + 0.5) * CELL - this.hz, c = j * nw + i;
      near.length = 0;
      this.each(cx - R, cx + R, -1, 50, cz - R, cz + R, (o) => { near.push(o); });
      // 바닥 후보: 땅(0) 과 칸 가운데를 덮는 상자의 윗면. 낮은 것부터 '서 있을 수 있는' 첫 높이를 고름 (지붕 위는 고르지 않음)
      const cand = [0];
      for (const o of near) if (o.y1 <= 4 && cx > o.x0 && cx < o.x1 && cz > o.z0 && cz < o.z1) cand.push(o.y1);
      cand.sort((a, b) => a - b);
      let ok = false;
      for (const f of cand) {
        if (near.some((o) => o.y0 < f + 1.6 && o.y1 > f + STEP_H)) continue; // 몸이 들어갈 자리가 없음
        fl[c] = f; ok = true; break;
      }
      if (!ok) g[c] = 1;
    }
    // 출발 지점에서 걸어서 닿을 수 없는 칸은 막힌 것으로 (상자로 둘러싸인 틈에 목표를 잡지 않게)
    const start = this.cellOf(...(this.def.spawns.a[0]));
    const seen = new Uint8Array(nw * nh), q = [start]; seen[start] = 1;
    while (q.length) { const c = q.pop(), ci = c % nw, cj = (c - ci) / nw; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nw || j >= nh) continue; const n = j * nw + i; if (!seen[n] && this.canStep(c, n)) { seen[n] = 1; q.push(n); } } }
    this.free = []; this.ground = [];
    for (let k = 0; k < g.length; k++) { if (!seen[k]) g[k] = 1; else { this.free.push(k); if (fl[k] < 0.3) this.ground.push(k); } }
  }
  /** 칸 a 에서 이웃 칸 b 로 걸어갈 수 있는지: 오르막은 계단 한두 단(0.8m)까지, 내리막은 1.5m 까지 */
  canStep(a, b) { if (this.nav[b]) return false; const d = this.floor[b] - this.floor[a]; return d <= 0.8 && d >= -1.5; }
  cellOf(x, z) {
    const i = Math.max(0, Math.min(this.nw - 1, Math.floor((x + this.hx) / CELL))), j = Math.max(0, Math.min(this.nh - 1, Math.floor((z + this.hz) / CELL)));
    return j * this.nw + i;
  }
  cellPos(c) { const i = c % this.nw; return [(i + 0.5) * CELL - this.hx, ((c - i) / this.nw + 0.5) * CELL - this.hz]; }
  /** 가장 가까운 빈 칸 */
  nearFree(x, z) {
    const c = this.cellOf(x, z);
    if (!this.nav[c]) return c;
    const ci = c % this.nw, cj = (c - ci) / this.nw;
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < this.nw && j < this.nh && !this.nav[j * this.nw + i]) return j * this.nw + i;
    }
    return this.free[0];
  }
  randomFree() { return this.cellPos(this.ground[Math.floor(Math.random() * this.ground.length)]); }
  /** 격자 위 직선으로 걸어갈 수 있는지 */
  walkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
    let prev = this.cellOf(ax, az);
    for (let k = 1; k <= n; k++) { const t = k / n, c = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t); if (c !== prev) { if (!this.canStep(prev, c)) return false; prev = c; } }
    return true;
  }
  /** A* 길찾기 → [[x,z], ...] (출발 칸 제외). 못 찾으면 null */
  path(ax, az, bx, bz) {
    const nw = this.nw, nh = this.nh, g = this.nav, s = this.nearFree(ax, az), e = this.nearFree(bx, bz);
    if (s === e) return [[bx, bz]];
    const N = nw * nh;
    if (!this._g) { this._g = new Float32Array(N); this._from = new Int32Array(N); this._mark = new Uint32Array(N); this._gen = 0; }
    const G = this._g, from = this._from, mark = this._mark, gen = ++this._gen;
    const ei = e % nw, ej = (e - ei) / nw;
    const heap = [], hf = []; // 이진 힙 (f 값 기준)
    const push = (c, f) => { let k = heap.length; heap.push(c); hf.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; heap[k] = heap[p]; hf[k] = hf[p]; k = p; } heap[k] = c; hf[k] = f; };
    const pop = () => { const top = heap[0], c = heap.pop(), f = hf.pop(); const n = heap.length; if (n) { let k = 0; for (;;) { let l = k * 2 + 1; if (l >= n) break; if (l + 1 < n && hf[l + 1] < hf[l]) l++; if (hf[l] >= f) break; heap[k] = heap[l]; hf[k] = hf[l]; k = l; } heap[k] = c; hf[k] = f; } return top; };
    G[s] = 0; mark[s] = gen; from[s] = -1; push(s, 0);
    let found = false, iter = 0;
    while (heap.length && iter++ < 12000) {
      const c = pop();
      if (c === e) { found = true; break; }
      const ci = c % nw, cj = (c - ci) / nw;
      for (let k = 0; k < 8; k++) {
        const di = [1, -1, 0, 0, 1, 1, -1, -1][k], dj = [0, 0, 1, -1, 1, -1, 1, -1][k], i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nw || j >= nh) continue;
        const n = j * nw + i;
        if (!this.canStep(c, n)) continue;
        if (k > 3 && (!this.canStep(c, cj * nw + i) || !this.canStep(c, j * nw + ci))) continue; // 모서리를 비스듬히 지나가지 않음
        const ng = G[c] + (k > 3 ? 1.414 : 1);
        if (mark[n] === gen && ng >= G[n]) continue;
        G[n] = ng; mark[n] = gen; from[n] = c;
        const hx = Math.abs(i - ei), hz = Math.abs(j - ej);
        push(n, ng + Math.max(hx, hz) + 0.414 * Math.min(hx, hz));
      }
    }
    if (!found) return null;
    const out = [];
    for (let c = e; c !== s && c >= 0; c = from[c]) out.push(this.cellPos(c));
    out.reverse();
    return out;
  }
  /** 한 지점에서 모든 칸까지의 거리 지도 (좀비가 플레이어를 쫓을 때: 좀비마다 길찾기를 하지 않음) */
  flowField(x, z, out) {
    const nw = this.nw, nh = this.nh, g = this.nav, N = nw * nh;
    const dist = out ?? new Uint16Array(N); dist.fill(65535);
    const s = this.nearFree(x, z); dist[s] = 0;
    const q = this._q ?? (this._q = new Int32Array(N)); let qh = 0, qt = 0; q[qt++] = s;
    while (qh < qt) {
      const c = q[qh++], ci = c % nw, cj = (c - ci) / nw, d = dist[c] + 1;
      // (목표에서 거꾸로 퍼져 나가므로 '이웃 → 이 칸' 으로 걸을 수 있는지를 봄)
      if (ci + 1 < nw && dist[c + 1] > d && !g[c + 1] && this.canStep(c + 1, c)) { dist[c + 1] = d; q[qt++] = c + 1; }
      if (ci > 0 && dist[c - 1] > d && !g[c - 1] && this.canStep(c - 1, c)) { dist[c - 1] = d; q[qt++] = c - 1; }
      if (cj + 1 < nh && dist[c + nw] > d && !g[c + nw] && this.canStep(c + nw, c)) { dist[c + nw] = d; q[qt++] = c + nw; }
      if (cj > 0 && dist[c - nw] > d && !g[c - nw] && this.canStep(c - nw, c)) { dist[c - nw] = d; q[qt++] = c - nw; }
    }
    return dist;
  }

  // ---------------- 그리기용 메시 ----------------
  build() {
    const g = new THREE.Group(), def = this.def;
    const tex = {}, T = (n) => (tex[n] ??= makeTexture(n));
    // 땅
    const gt = T(def.ground); const gm = new THREE.MeshLambertMaterial({ map: gt });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.hx * 2 + 160, this.hz * 2 + 160), gm);
    const uv = ground.geometry.attributes.uv, tile = MATS[def.ground].tile;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (this.hx * 2 + 160) / tile, uv.getY(i) * (this.hz * 2 + 160) / tile);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    g.add(ground);
    // 상자: 재질별로 하나의 메시로 합침. 옆면 아래쪽을 살짝 어둡게 해서 땅에 붙어 보이게
    const byMat = new Map();
    const col = new THREE.Color();
    for (const o of this.boxes) {
      if (!o.vis || o.shape) continue;
      let m = byMat.get(o.mat); if (!m) byMat.set(o.mat, m = { p: [], n: [], u: [], c: [] });
      const tl = MATS[o.mat].tile;
      col.set(o.tint);
      const face = (pts, nx, ny, nz, uw, uh, side) => {
        const order = [0, 1, 2, 0, 2, 3];
        for (const k of order) {
          const [x, y, z, u, v] = pts[k];
          m.p.push(x, y, z); m.n.push(nx, ny, nz);
          m.u.push(tl ? u * uw / tl : u, tl ? v * uh / tl : v);
          const sh = side && v === 0 && o.y0 < 0.01 ? 0.72 : 1;
          m.c.push(col.r * sh, col.g * sh, col.b * sh);
        }
      };
      const { x0, x1, y0, y1, z0, z1 } = o, w = x1 - x0, h = y1 - y0, d = z1 - z0;
      face([[x0, y1, z1, 0, 0], [x1, y1, z1, 1, 0], [x1, y1, z0, 1, 1], [x0, y1, z0, 0, 1]], 0, 1, 0, w, d, false);
      if (y0 > 0.01) face([[x0, y0, z0, 0, 0], [x1, y0, z0, 1, 0], [x1, y0, z1, 1, 1], [x0, y0, z1, 0, 1]], 0, -1, 0, w, d, false);
      face([[x0, y0, z1, 0, 0], [x1, y0, z1, 1, 0], [x1, y1, z1, 1, 1], [x0, y1, z1, 0, 1]], 0, 0, 1, w, h, true);
      face([[x1, y0, z0, 0, 0], [x0, y0, z0, 1, 0], [x0, y1, z0, 1, 1], [x1, y1, z0, 0, 1]], 0, 0, -1, w, h, true);
      face([[x1, y0, z1, 0, 0], [x1, y0, z0, 1, 0], [x1, y1, z0, 1, 1], [x1, y1, z1, 0, 1]], 1, 0, 0, d, h, true);
      face([[x0, y0, z0, 0, 0], [x0, y0, z1, 1, 0], [x0, y1, z1, 1, 1], [x0, y1, z0, 0, 1]], -1, 0, 0, d, h, true);
    }
    for (const [name, m] of byMat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.u, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(m.c, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: T(name), vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    }
    // 원통 모양 (드럼통 등)
    const cyl = this.boxes.filter((o) => o.shape === 'cyl');
    if (cyl.length) {
      const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), new THREE.MeshLambertMaterial({ map: T('metal') }), cyl.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      cyl.forEach((o, i) => { m4.compose(new THREE.Vector3((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, (o.z0 + o.z1) / 2), q, new THREE.Vector3(o.x1 - o.x0, o.y1 - o.y0, o.z1 - o.z0)); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.set(o.tint)); });
      inst.castShadow = inst.receiveShadow = true;
      g.add(inst);
    }
    // 나무
    for (const kind of ['pine', 'palm', 'tree']) {
      const list = this.props.filter((p) => p.type === kind);
      if (!list.length) continue;
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), list.length);
      const leafGeo = kind === 'pine' ? new THREE.ConeGeometry(1.5, 3.6, 9) : kind === 'palm' ? new THREE.ConeGeometry(2.2, 0.9, 7) : new THREE.IcosahedronGeometry(1.6, 1);
      const leaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: kind === 'pine' ? 0x2f6b4f : kind === 'palm' ? 0x3f9d4a : 0x4f9d47 }), list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((p, i) => {
        m4.compose(new THREE.Vector3(p.x, 1.2 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); trunk.setMatrixAt(i, m4);
        m4.compose(new THREE.Vector3(p.x, (kind === 'pine' ? 3.6 : kind === 'palm' ? 2.7 : 3.3) * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); leaf.setMatrixAt(i, m4);
      });
      trunk.castShadow = leaf.castShadow = true;
      g.add(trunk, leaf);
    }
    return g;
  }
}
