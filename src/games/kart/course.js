// 카트 레이스 - 코스 설계 도구
// 트랙을 '구간 명령'으로 적으면 제어점 목록으로 바꿔 줌 (좌표를 직접 찍지 않아도 복잡한 코스를 만들 수 있게)
//
//   ['S', 길이, 높이변화]            직진
//   ['R', 각도, 반지름, 높이변화]     오른쪽으로 꺾기 (각도는 도 단위)
//   ['L', 각도, 반지름, 높이변화]     왼쪽으로 꺾기
//   ['mark', '이름']                  지금 위치의 제어점 번호를 이름으로 기억 (점프대·글라이더·고가도로 지정용)
//   ['close', 반지름, 직선]           지금 위치에서 출발점으로 '커브-직진-커브' 최단 경로로 자동 연결 (높이도 출발 높이로), 출발선 앞은 '직선'm 곧게
//
// 출발점 (0, 0, 높이 h0) 에서 +x 방향으로 시작. 마지막 점은 출발점으로 이어지는 닫힌 곡선이 됨
// 반환: { points: [[x, z, y], ...], marks: { 이름: 제어점 번호 }, end: { x, z, y, a } }

const STEP = 18; // 제어점 간격(m)

/** 지금 자세(x,z,a) → (0,0,방향 0) 으로 가는 '커브-직진-커브' 최단 경로 (반지름 r) */
function closePath(x, z, a, r) {
  const rot = (ux, uz, s) => [-uz * s, ux * s]; // s=+1: 오른쪽으로 90°
  const norm = (v) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let best = null;
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const [p1x, p1z] = rot(Math.cos(a), Math.sin(a), s1), c1 = [x + p1x * r, z + p1z * r];
    const [p2x, p2z] = rot(1, 0, s2), c2 = [p2x * r, p2z * r];
    const Dx = c2[0] - c1[0], Dz = c2[1] - c1[1], d = Math.hypot(Dx, Dz), th = Math.atan2(Dz, Dx);
    const cands = [];
    if (s1 === s2) cands.push(th);
    else if (d >= 2 * r) { const k = Math.acos(-2 * r / d); for (const sg of [1, -1]) cands.push(th - s1 * Math.PI / 2 - sg * k); }
    for (const al of cands) {
      const ux = Math.cos(al), uz = Math.sin(al);
      const [w1x, w1z] = rot(ux, uz, s1), [w2x, w2z] = rot(ux, uz, s2);
      const t1 = [c1[0] - w1x * r, c1[1] - w1z * r], t2 = [c2[0] - w2x * r, c2[1] - w2z * r];
      const L = (t2[0] - t1[0]) * ux + (t2[1] - t1[1]) * uz;
      if (L < -0.5 || Math.hypot(t2[0] - t1[0] - ux * L, t2[1] - t1[1] - uz * L) > 1) continue;
      const g1 = norm(s1 * (al - a)), g2 = norm(s2 * (0 - al));
      const total = (g1 + g2) * r + L;
      if (!best || total < best.total) best = { total, s1, s2, g1, g2, L: Math.max(0, L) };
    }
  }
  return best;
}

export function course(cmds, h0 = 0) {
  let x = 0, z = 0, y = h0, a = 0;
  const points = [[0, 0, h0]];
  const marks = {};
  const push = () => points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(y * 10) / 10]);
  for (const c of cmds) {
    const [op] = c;
    if (op === 'mark') { marks[c[1]] = points.length - 1; continue; }
    if (op === 'close') { // 출발점으로 자동 연결 → 커브·직진·커브 명령으로 풀어서 이어 그림
      const r = c[1] ?? 40, T = c[2] ?? 70; // T = 출발선 앞 직선 길이 (출발 대기 줄이 직선에 서도록)
      const P = closePath(x + T, z, a, r); // 목표를 (-T,0) 로: 좌표를 T 만큼 옮겨서 계산
      if (!P) continue;
      const total = P.total || 1, dy = h0 - y, deg = (g) => (g * 180) / Math.PI;
      const sub = [];
      if (P.g1 > 0.01) sub.push([P.s1 > 0 ? 'R' : 'L', deg(P.g1), r, dy * (P.g1 * r) / total]);
      if (P.L > 1) sub.push(['S', P.L, dy * P.L / total]);
      if (P.g2 > 0.01) sub.push([P.s2 > 0 ? 'R' : 'L', deg(P.g2), r, dy * (P.g2 * r) / total]);
      if (T > 0) sub.push(['S', T, 0]);
      const r2 = course.__run(sub, x, z, y, a, points);
      x = r2.x; z = r2.z; y = r2.y; a = r2.a;
      continue;
    }
    if (op === 'S') {
      const [, len, dy = 0] = c, n = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i < n; i++) { x += Math.cos(a) * len / n; z += Math.sin(a) * len / n; y += dy / n; push(); }
    } else if (op === 'L' || op === 'R') {
      const [, deg, r, dy = 0] = c, sgn = op === 'R' ? 1 : -1;
      const ang = (deg * Math.PI) / 180, arc = ang * r, n = Math.max(2, Math.round(arc / STEP));
      // 원의 중심: 오른쪽 = 진행 방향에서 +90°
      const cx = x + Math.cos(a + sgn * Math.PI / 2) * r, cz = z + Math.sin(a + sgn * Math.PI / 2) * r;
      const a0 = a - sgn * Math.PI / 2; // 중심에서 본 현재 위치 각도
      for (let i = 1; i <= n; i++) {
        const t = a0 + sgn * ang * (i / n);
        x = cx + Math.cos(t) * r; z = cz + Math.sin(t) * r; y += dy / n;
        push();
      }
      a += sgn * ang;
    }
  }
  // 마지막 점이 출발점과 거의 같으면 빼기 (같은 점이 여러 개 겹치면 곡선이 꼬임)
  while (points.length > 2) { const l = points[points.length - 1]; if (Math.hypot(l[0], l[1]) < STEP * 0.6) points.pop(); else break; }
  return { points, marks, end: { x, z, y, a: ((a * 180 / Math.PI) % 360 + 360) % 360 } };
}

/** close 용: 명령 몇 개를 이어서 실행 */
course.__run = (cmds, x, z, y, a, points) => {
  for (const c of cmds) {
    const [op] = c;
    if (op === 'S') {
      const [, len, dy = 0] = c, n = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i < n; i++) { x += Math.cos(a) * len / n; z += Math.sin(a) * len / n; y += dy / n; points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(y * 10) / 10]); }
    } else {
      const [, deg, r, dy = 0] = c, sgn = op === 'R' ? 1 : -1;
      const ang = (deg * Math.PI) / 180, n = Math.max(2, Math.round((ang * r) / STEP));
      const cx = x + Math.cos(a + sgn * Math.PI / 2) * r, cz = z + Math.sin(a + sgn * Math.PI / 2) * r, a0 = a - sgn * Math.PI / 2;
      for (let i = 1; i <= n; i++) { const t = a0 + sgn * ang * (i / n); x = cx + Math.cos(t) * r; z = cz + Math.sin(t) * r; y += dy / n; points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(y * 10) / 10]); }
      a += sgn * ang;
    }
  }
  return { x, z, y, a };
};
