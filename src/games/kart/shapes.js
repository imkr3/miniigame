// 카트 레이스 - 매끈한 3D 모양 도구
// 각진 상자 대신 둥근 상자·회전체·관·몽글한 덩어리를 만들고, 여러 조각을 색을 입혀 하나로 합침
import * as THREE from '../../vendor/three.module.min.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** 모서리가 둥근 상자 (r = 모서리 반지름, seg = 모서리 분할 수). UV 는 상자와 같음 */
export function roundedBox(w, h, d, r = 0.1, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const n = seg * 2 + 1; // 홀수 분할: 가운데 칸이 평평한 면이 됨
  const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = geo.attributes.position, nor = geo.attributes.normal, half = 0.5 / n;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    v.set(x - Math.sign(x) * half, y - Math.sign(y) * half, z - Math.sign(z) * half).normalize();
    pos.setXYZ(i, Math.sign(x) * bx + v.x * r, Math.sign(y) * by + v.y * r, Math.sign(z) * bz + v.z * r);
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  // UV 를 실제 위치 기준으로 다시 계산 (모서리 칸이 좁아져도 무늬가 늘어나지 않게)
  const uv = geo.attributes.uv, per = (n + 1) * (n + 1);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w, y = pos.getY(i) / h, z = pos.getZ(i) / d, f = Math.floor(i / per);
    if (f === 0) uv.setXY(i, 0.5 - z, 0.5 + y); else if (f === 1) uv.setXY(i, 0.5 + z, 0.5 + y);
    else if (f === 2) uv.setXY(i, 0.5 + x, 0.5 - z); else if (f === 3) uv.setXY(i, 0.5 + x, 0.5 + z);
    else if (f === 4) uv.setXY(i, 0.5 + x, 0.5 + y); else uv.setXY(i, 0.5 - x, 0.5 + y);
  }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

/** 회전체: pts = [[반지름, 높이], ...] 아래에서 위로 (Y 축 둘레로 돌림) */
export function lathe(pts, seg = 24) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
}

/** 점들을 부드럽게 잇는 관 */
export function tube(points, radius = 0.05, seg = 16, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(curve, seg, radius, radial, closed);
}

/** 타원체 */
export function ellipsoid(rx, ry, rz, ws = 14, hs = 9) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

/** 몽글몽글한 덩어리 (바위·나뭇잎·구름): 구를 부드럽게 울퉁불퉁하게, 법선은 매끈하게 */
export function blob(radius = 1, detail = 2, amp = 0.18, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  const f = (x, y, z) => Math.sin(x * 2.3 + seed) * Math.sin(y * 2.9 + seed * 1.7) * Math.sin(z * 2.1 + seed * 2.3) + 0.5 * Math.sin(x * 5.1 + y * 4.3 + z * 4.7 + seed * 3.1);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const k = radius * (1 + amp * f(v.x, v.y, v.z));
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  smoothNormals(geo);
  return geo;
}

/** 같은 자리에 있는 꼭짓점끼리 법선을 평균 → 면 경계가 보이지 않음 */
export function smoothNormals(geo) {
  if (geo.index) { geo.computeVertexNormals(); return geo; }
  const pos = geo.attributes.position, n = pos.count, acc = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  const key = (i) => `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
  const keys = new Array(n);
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    fn.subVectors(c, b).cross(a.clone().sub(b)); // 넓이 가중 면 법선
    for (let k = 0; k < 3; k++) {
      const id = keys[i + k] = key(i + k);
      const t = acc.get(id); if (t) t.add(fn); else acc.set(id, fn.clone());
    }
  }
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const t = acc.get(keys[i]); fn.copy(t).normalize(); nor[i * 3] = fn.x; nor[i * 3 + 1] = fn.y; nor[i * 3 + 2] = fn.z; }
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** 조각 하나: 모양 + 색 + 위치/회전/크기. merge() 에 넘김 */
export function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return { geo, color, pos: [x, y, z], rot: [rx, ry, rz], scl: [sx, sy, sz] };
}

/** 여러 조각을 꼭짓점 색을 입혀 하나의 모양으로 합침 (InstancedMesh·그리기 호출 절약용). 재질은 vertexColors: true */
export function merge(parts) {
  const P = [], N = [], C = [];
  for (const pt of parts) {
    let g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    _m.compose(_p.set(...pt.pos), _q.setFromEuler(_e.set(...pt.rot)), _s.set(...pt.scl));
    g.applyMatrix4(_m);
    const cnt = g.attributes.position.count;
    P.push(g.attributes.position.array); N.push(g.attributes.normal.array);
    const col = new Float32Array(cnt * 3);
    if (typeof pt.color === 'function') { // 색 함수(x, y, z) → 16진수 색: 높이별 색 띠 등
      const ps = g.attributes.position;
      for (let i = 0; i < cnt; i++) { _c.set(pt.color(ps.getX(i), ps.getY(i), ps.getZ(i))); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    } else { _c.set(pt.color ?? 0xffffff); for (let i = 0; i < cnt; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; } }
    C.push(col);
    g.dispose();
  }
  const cat = (arrs) => { const out = new Float32Array(arrs.reduce((a, x) => a + x.length, 0)); let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; } return out; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat(P), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cat(N), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cat(C), 3));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

/** 두 색 섞기 (16진수) */
export function mix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); }
