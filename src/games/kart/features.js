// 카트 레이스 - 트랙 꾸미기와 트랙 기믹
// - 공통: 급커브 화살표 표지판, 출발선 관중석·깃발
// - 트랙별 랜드마크: 풍차·열기구(햇살) / 바위 아치(협곡) / 네온 게이트·전광판(네온) / 눈사람(설산) / 무지개·폭포(구름) / 용암 폭포(화산)
// - 트랙별 장애물(hazards): 굴러오는 바위(협곡) / 용암 분출(화산) / 빙판(설산) — 시간으로 정해져서 멀티플레이에서도 모두 같게 보임
// - 날씨 입자: 눈(설산) · 불씨(화산) · 꽃잎(햇살·구름)
import * as THREE from '../../vendor/three.module.min.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

/** 트랙 장식 + 기믹 만들기 → { hazards, anims, weather } */
export function buildFeatures(track, g, quality = 1) {
  const S = track.samples, N = track.N, def = track.def, th = def.theme;
  const anims = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  // 다른 도로 구간과 겹치지 않는지 (자기 구간 ±skipD m 는 무시)
  const clear = (x, z, r, selfD = -1, skipD = 40) => {
    for (const s of S) {
      if (selfD >= 0) { const dd = Math.abs(s.d - selfD); if (Math.min(dd, track.length - dd) < skipD) continue; }
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < (track.wall + r) ** 2) return false;
    }
    for (const sc of track.shortcuts) for (const s of sc.samples) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (sc.half + r + 1) ** 2) return false;
    return true;
  };
  const okD = (d) => !track.inGap(d) && !track.inGap(d + 8) && !track.inGap(d - 8);

  // ---------- 급커브 화살표 표지판 ----------
  const chevTex = (dir) => canvasTex(64, 32, (c, w, h) => {
    c.fillStyle = '#facc15'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#111827';
    for (const x0 of [6, 26, 46]) {
      c.beginPath();
      if (dir > 0) { c.moveTo(x0, 4); c.lineTo(x0 + 12, 16); c.lineTo(x0, 28); c.lineTo(x0 + 6, 28); c.lineTo(x0 + 18, 16); c.lineTo(x0 + 6, 4); }
      else { c.moveTo(x0 + 18, 4); c.lineTo(x0 + 6, 16); c.lineTo(x0 + 18, 28); c.lineTo(x0 + 12, 28); c.lineTo(x0, 16); c.lineTo(x0 + 12, 4); }
      c.fill();
    }
  });
  const signs = { 1: [], [-1]: [] };
  const look = 8; // 16m 앞 방향과 비교
  let lastSign = -999;
  for (let i = 0; i < N; i += 3) {
    const a = S[i], b = S[(i + look) % N];
    const cross = a.tx * b.tz - a.tz * b.tx; // >0: 오른쪽으로 꺾임
    if (Math.abs(cross) < 0.32 || a.d - lastSign < 14 || !okD(a.d) || track.onBridge(a.d)) continue;
    const dir = cross > 0 ? 1 : -1, outer = -dir; // 바깥쪽 벽에 세움
    const x = a.x + a.nx * (track.wall + 1.9) * outer, z = a.z + a.nz * (track.wall + 1.9) * outer; // 판 폭(3.2m)만큼 벽에서 떨어뜨림
    if (!track.roadClear(x, z, 1.7, a.y, a.y + 3)) continue;
    if (!clear(x, z, 0.5, a.d, 30)) continue;
    signs[dir].push({ x, y: a.y + (track.wall + 1.9) * outer * (a.bank ?? 0), z, h: Math.atan2(a.tx, a.tz) + Math.PI }); // 다가오는 운전자를 향함
    lastSign = a.d;
  }
  for (const dir of [1, -1]) {
    const list = signs[dir];
    if (!list.length) continue;
    const board = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: chevTex(dir), side: THREE.DoubleSide }), list.length);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x374151 }), list.length * 2);
    list.forEach((p, k) => {
      q.setFromAxisAngle(up, p.h);
      board.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, p.y + 2.2, p.z), q, one));
      for (const s of [-1, 1]) pole.setMatrixAt(k * 2 + (s > 0), m4.compose(new THREE.Vector3(p.x + Math.cos(p.h) * 1.3 * s, p.y + 0.8, p.z - Math.sin(p.h) * 1.3 * s), q, one));
    });
    g.add(board, pole);
  }

  // ---------- 출발선 관중석 + 깃발 ----------
  if (!def.floating) {
    const s0 = S[2];
    for (const side of [-1, 1]) {
      const cx = s0.x + s0.nx * (track.wall + 7) * side, cz = s0.z + s0.nz * (track.wall + 7) * side;
      if (!clear(cx, cz, 6, s0.d, 60)) continue;
      const crowd = canvasTex(128, 64, (c, w, h) => {
        c.fillStyle = '#334155'; c.fillRect(0, 0, w, h);
        for (let y = 4; y < h; y += 8) for (let x = 2; x < w; x += 5) {
          c.fillStyle = ['#f87171', '#fbbf24', '#60a5fa', '#34d399', '#f472b6', '#e2e8f0', '#a78bfa'][Math.floor(Math.random() * 7)];
          c.beginPath(); c.arc(x + Math.random() * 2, y + Math.random() * 2, 2, 0, Math.PI * 2); c.fill();
        }
      });
      const stand = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 7), [
        new THREE.MeshLambertMaterial({ color: 0x475569 }), new THREE.MeshLambertMaterial({ color: 0x475569 }),
        new THREE.MeshLambertMaterial({ color: 0x64748b }), new THREE.MeshLambertMaterial({ color: 0x475569 }),
        new THREE.MeshLambertMaterial({ map: crowd }), new THREE.MeshLambertMaterial({ map: crowd }),
      ]);
      stand.position.set(cx, s0.y + 2.5, cz);
      stand.rotation.y = Math.atan2(s0.tx, s0.tz) + Math.PI / 2;
      stand.rotation.x = side * 0.12;
      g.add(stand);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.4, 8), new THREE.MeshLambertMaterial({ color: th.wallTop }));
      roof.position.set(cx, s0.y + 7.5, cz); roof.rotation.y = stand.rotation.y;
      g.add(roof);
    }
    // 깃발 줄 (출발선 앞뒤 60m)
    const flagCols = [0xef4444, 0xfacc15, 0x3b82f6, 0x22c55e, 0xf472b6];
    const flags = [];
    for (let i = 0; i < N; i++) {
      const s = S[i], dd = Math.min(s.d, track.length - s.d);
      if (dd > 60 || i % 4) continue;
      for (const side of [-1, 1]) flags.push({ x: s.x + s.nx * (track.wall + 1) * side, y: s.y, z: s.z + s.nz * (track.wall + 1) * side, c: flagCols[(i / 4 + (side > 0 ? 2 : 0)) % flagCols.length], h: Math.atan2(s.tx, s.tz) });
    }
    const fl = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.2, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }), flags.length);
    const pl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 4), new THREE.MeshLambertMaterial({ color: 0xe5e7eb }), flags.length);
    const col = new THREE.Color();
    flags.forEach((f, k) => {
      q.setFromAxisAngle(up, f.h);
      pl.setMatrixAt(k, m4.compose(new THREE.Vector3(f.x, f.y + 1.5, f.z), q, one));
      const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.h, Math.PI / 2));
      fl.setMatrixAt(k, m4.compose(new THREE.Vector3(f.x, f.y + 2.6, f.z), qq, one));
      fl.setColorAt(k, col.setHex(f.c));
    });
    g.add(fl, pl);
  }

  // ---------- 트랙별 랜드마크 ----------
  const b = track.bounds, cxm = (b.minX + b.maxX) / 2, czm = (b.minZ + b.maxZ) / 2;
  const farSpot = (minR, maxR, r) => {
    for (let k = 0; k < 80; k++) {
      const a = Math.random() * Math.PI * 2, R = rnd(minR, maxR);
      const x = cxm + Math.cos(a) * R, z = czm + Math.sin(a) * R;
      if (clear(x, z, r)) return { x, z };
    }
    return null;
  };
  const archOver = (d, build) => { // 도로를 가로지르는 구조물 (양쪽 기둥이 다른 도로와 안 겹칠 때만)
    const s = track.at(d);
    for (const side of [-1, 1]) if (!clear(s.x + s.nx * (track.wall + 1.5) * side, s.z + s.nz * (track.wall + 1.5) * side, 1.5, d, 30)) return false;
    const o = build(s);
    o.position.set(s.x, s.y, s.z);
    o.rotation.y = Math.atan2(s.tx, s.tz);
    g.add(o);
    return true;
  };
  const kind = th.scenery;
  if (kind === 'trees') { // 햇살: 풍차 + 열기구
    for (let k = 0; k < 4; k++) {
      const p = farSpot(80, 260, 8); if (!p) continue;
      const mill = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 14, 8), new THREE.MeshLambertMaterial({ color: 0xf5f5f4 }));
      tower.position.y = 7; mill.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 3, 8), new THREE.MeshLambertMaterial({ color: 0xb91c1c }));
      cap.position.y = 15.5; mill.add(cap);
      const blades = new THREE.Group(); blades.position.set(0, 13, 2.6);
      for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 0.2), new THREE.MeshLambertMaterial({ color: 0xfef3c7 })); bl.position.y = 4.5; const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2; arm.add(bl); blades.add(arm); }
      mill.add(blades);
      mill.position.set(p.x, 0, p.z); mill.rotation.y = Math.atan2(cxm - p.x, czm - p.z);
      g.add(mill);
      anims.push({ kind: 'spin', obj: blades, axis: 'z', speed: 0.8 + k * 0.15 });
    }
    addBalloons(g, anims, farSpot, 6);
  } else if (kind === 'cacti') { // 협곡: 바위 아치
    let made = 0;
    for (const f of [0.06, 0.3, 0.62, 0.9]) {
      const d = f * track.length;
      if (!okD(d) || made >= 3) continue;
      if (archOver(d, () => {
        const a = new THREE.Group(), rock = new THREE.MeshLambertMaterial({ color: 0xb45309, flatShading: true });
        const R = track.wall + 2.5;
        const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 2.2, 6, 14, Math.PI), rock);
        arc.scale.set(1, 0.75, 1); a.add(arc);
        return a;
      })) made++;
    }
  } else if (kind === 'city') { // 네온: 빛나는 게이트 + 전광판
    const cols = [0xf472b6, 0x22d3ee, 0xa855f7, 0xfacc15];
    let k = 0;
    for (let d = 40; d < track.length - 30; d += 110) {
      if (!okD(d)) continue;
      archOver(d, () => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(track.wall + 0.8, 0.35, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: cols[k++ % cols.length] }));
        anims.push({ kind: 'pulse', obj: ring, phase: k });
        return ring;
      });
    }
    const words = ['TURBO', 'DRIFT', 'GO!', '★ 1st ★', 'SPEED'];
    for (let i = 0; i < 7; i++) {
      const p = farSpot(30, 140, 6); if (!p) continue;
      const tex = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#0f172a'; c.fillRect(0, 0, w, h);
        c.strokeStyle = ['#f472b6', '#22d3ee', '#facc15'][i % 3]; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = c.strokeStyle; c.font = '900 48px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(words[i % words.length], w / 2, h / 2 + 2);
      });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      bb.position.set(p.x, 14, p.z); bb.rotation.y = Math.atan2(cxm - p.x, czm - p.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 6), new THREE.MeshLambertMaterial({ color: 0x334155 }));
      post.position.set(p.x, 6, p.z);
      g.add(bb, post);
    }
  } else if (kind === 'pines') { // 설산: 눈사람
    const list = [];
    for (let k = 0; k < 14; k++) { const p = farSpot(20, 200, 2); if (p) list.push(p); }
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const body = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 10, 8), white, list.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(1.05, 10, 8), white, list.length);
    const hat = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.7, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x1f2937 }), list.length);
    const nose = new THREE.InstancedMesh(new THREE.ConeGeometry(0.18, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0xf97316 }), list.length);
    list.forEach((p, k) => {
      const rq = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(cxm - p.x, czm - p.z));
      body.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, 1.4, p.z), rq, one));
      head.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, 3.6, p.z), rq, one));
      hat.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, 4.8, p.z), rq, one));
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);
      const nq = rq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      nose.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x + fwd.x * 1.2, 3.6, p.z + fwd.z * 1.2), nq, one));
    });
    g.add(body, head, hat, nose);
  } else if (kind === 'clouds') { // 구름 정원: 무지개 아치 + 떠 있는 섬의 폭포 + 열기구
    for (const f of [0.12, 0.5]) {
      const d = f * track.length;
      if (!okD(d)) continue;
      const s = track.at(d), rainbow = new THREE.Group();
      [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x3b82f6, 0x8b5cf6].forEach((c, i) => {
        rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(track.wall + 4 - i * 0.7, 0.36, 6, 40, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })));
      });
      rainbow.position.set(s.x, s.y - 1, s.z); rainbow.rotation.y = Math.atan2(s.tx, s.tz);
      g.add(rainbow);
    }
    const fallTex = canvasTex(32, 128, (c, w, h) => {
      for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${200 + Math.random() * 55},${230 + Math.random() * 25},255,${0.5 + Math.random() * 0.4})`; c.fillRect(Math.random() * 4, y, w - Math.random() * 8, 2); }
    });
    fallTex.wrapT = THREE.RepeatWrapping;
    for (let k = 0; k < 5; k++) {
      const p = farSpot(60, 220, 10); if (!p) continue;
      const y0 = rnd(20, 40);
      const isl = new THREE.Mesh(new THREE.CylinderGeometry(9, 2, 7, 8), new THREE.MeshLambertMaterial({ color: 0x8b5e3c }));
      isl.position.set(p.x, y0, p.z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.2, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0x86efac }));
      top.position.set(p.x, y0 + 3.8, p.z);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(4, 60), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      fall.position.set(p.x + 8.5, y0 - 27, p.z); fall.rotation.y = Math.PI / 2;
      g.add(isl, top, fall);
      anims.push({ kind: 'flow', tex: fallTex });
    }
    addBalloons(g, anims, farSpot, 5);
  } else if (kind === 'beach') { // 해변: 바다(활공 구간 아래) + 등대 + 열기구
    const gp = track.gaps[0];
    if (gp) {
      const mid = track.at((gp.from + gp.to) / 2);
      // 바다 크기: 활공 구간이 아닌 도로와 겹치지 않을 만큼
      let rad = 90;
      for (const s of S) if (!track.inGap(s.d) && s.y < 3) rad = Math.min(rad, Math.hypot(s.x - mid.x, s.z - mid.z) - track.wall - 2);
      if (rad > 15) {
        const seaTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#0ea5e9'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 10; i++) { const y = Math.random() * h, x = Math.random() * w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 3, x + 12, y); c.stroke(); } });
        seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(rad / 8, rad / 8);
        const sea = new THREE.Mesh(new THREE.CircleGeometry(rad, 40), new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.92 }));
        sea.rotation.x = -Math.PI / 2; sea.position.set(mid.x, 0.06, mid.z);
        const foam = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 2.5, 40), new THREE.MeshBasicMaterial({ color: 0xf0f9ff }));
        foam.rotation.x = -Math.PI / 2; foam.position.set(mid.x, 0.07, mid.z);
        g.add(sea, foam);
        anims.push({ kind: 'drift', tex: seaTex });
      }
    }
    const p = farSpot(40, 160, 5);
    if (p) {
      const lh = new THREE.Group();
      for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.4 - i * 0.2, 2.6 - i * 0.2, 4, 12), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xef4444 })); seg.position.y = 2 + i * 4; lh.add(seg); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      lamp.position.y = 25.5; lh.add(lamp);
      lh.position.set(p.x, 0, p.z); g.add(lh);
      anims.push({ kind: 'pulse2', obj: lamp });
    }
    addBalloons(g, anims, farSpot, 3);
  } else if (kind === 'volcano') { // 화산: 용암 폭포 (멀리 절벽에서 흘러내림)
    const lavaTex = canvasTex(32, 128, (c, w, h) => {
      for (let y = 0; y < h; y += 2) { c.fillStyle = Math.random() < 0.3 ? '#fde047' : Math.random() < 0.6 ? '#f97316' : '#dc2626'; c.fillRect(0, y, w, 2); }
    });
    lavaTex.wrapT = THREE.RepeatWrapping;
    for (let k = 0; k < 4; k++) {
      const p = farSpot(70, 220, 10); if (!p) continue;
      const cliff = new THREE.Mesh(new THREE.BoxGeometry(18, 26, 10), new THREE.MeshLambertMaterial({ color: 0x292524, flatShading: true }));
      cliff.position.set(p.x, 13, p.z); cliff.rotation.y = Math.atan2(cxm - p.x, czm - p.z);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(4, 26), new THREE.MeshBasicMaterial({ map: lavaTex, side: THREE.DoubleSide }));
      const fwd = new THREE.Vector3(Math.sin(cliff.rotation.y), 0, Math.cos(cliff.rotation.y));
      fall.position.set(p.x + fwd.x * 5.1, 13, p.z + fwd.z * 5.1); fall.rotation.y = cliff.rotation.y;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 14), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x + fwd.x * 8, 0.15, p.z + fwd.z * 8);
      g.add(cliff, fall, pool);
      anims.push({ kind: 'flow', tex: lavaTex, speed: 0.6 });
    }
  }

  // ---------- 활공 부스트 링: 글라이더 구간 하늘에 3개, 통과하면 가속 ----------
  const rings = [];
  const ringCols = [0x38bdf8, 0xfacc15, 0xf472b6];
  for (const gp of track.gaps) {
    [0.3, 0.55, 0.8].forEach((f, k) => {
      const d = gp.from + (gp.to - gp.from) * f, p = track.at(d);
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.4, 8, 28), new THREE.MeshBasicMaterial({ color: ringCols[k] }));
      const y = p.y + 2.5;
      mesh.position.set(p.x, y, p.z); mesh.rotation.y = Math.atan2(p.tx, p.tz);
      g.add(mesh);
      rings.push({ x: p.x, y, z: p.z, r: 4.6, mesh, id: rings.length });
      anims.push({ kind: 'spin', obj: mesh, axis: 'z', speed: 1.2 });
    });
  }

  // ---------- 장애물 ----------
  const hazards = [];
  for (const hz of def.hazards ?? []) {
    const d = hz.at * track.length, s = track.at(d);
    if (hz.type === 'boulder') { // 길을 가로질러 굴러가는 바위 (주기 7초, 1초 전에 그림자 경고)
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 0), new THREE.MeshLambertMaterial({ color: 0x92400e, flatShading: true }));
      const warn = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 20), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      warn.rotation.x = -Math.PI / 2;
      rock.userData.keep = warn.userData.keep = true; // 장애물은 도로 위에 있어야 함
      rock.visible = false; warn.visible = false;
      g.add(rock, warn);
      hazards.push({ type: 'boulder', d, s, rock, warn, period: 7, offset: hz.at * 13, dir: hz.dir ?? 1 });
    } else if (hz.type === 'geyser') { // 용암 분출: 3초 쉬고, 1초 빛나며 경고, 1.2초 분출
      const x = s.x + s.nx * track.hw * (hz.lat ?? 0), z = s.z + s.nz * track.hw * (hz.lat ?? 0);
      const vent = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), new THREE.MeshBasicMaterial({ color: 0x7c2d12 }));
      vent.rotation.x = -Math.PI / 2; vent.position.set(x, s.y + track.hw * (hz.lat ?? 0) * s.bank + 0.06, z);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.6, 20), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, s.y + track.hw * (hz.lat ?? 0) * s.bank + 0.08, z);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.85 }));
      col.position.set(x, s.y + 6, z); col.visible = false;
      vent.userData.keep = glow.userData.keep = col.userData.keep = true;
      g.add(vent, glow, col);
      hazards.push({ type: 'geyser', d, x, z, y: s.y + track.hw * (hz.lat ?? 0) * s.bank, glow, col, period: 5.2, offset: hz.at * 7 });
    } else if (hz.type === 'ice') { // 빙판: 이 구간은 미끄러움
      const iceTex = canvasTex(64, 64, (c, w, h) => {
        c.fillStyle = 'rgba(186,230,253,.75)'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) { const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rnd(-14, 14), y + rnd(-14, 14)); c.stroke(); }
      });
      iceTex.wrapS = iceTex.wrapT = THREE.RepeatWrapping;
      const len = hz.len ?? 36, mat = new THREE.MeshBasicMaterial({ map: iceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const uv = [];
      const pos = [], idx = [];
      const n = Math.round(len / 2);
      for (let i = 0; i <= n; i++) {
        const p = track.at(d + i * 2);
        pos.push(p.x - p.nx * track.hw, p.y - track.hw * p.bank + 0.045, p.z - p.nz * track.hw, p.x + p.nx * track.hw, p.y + track.hw * p.bank + 0.045, p.z + p.nz * track.hw);
        uv.push(0, i / 3, 3, i / 3);
        if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat); g.add(mesh);
      // 빙판 앞 경고 표지 (눈 결정)
      const p0 = track.at(d - 6), sign = new THREE.Mesh(new THREE.CircleGeometry(1.1, 6), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
      for (const side of [-1, 1]) { const sg = sign.clone(); sg.position.set(p0.x + p0.nx * (track.wall + 0.6) * side, p0.y + 2.4, p0.z + p0.nz * (track.wall + 0.6) * side); sg.rotation.y = Math.atan2(p0.tx, p0.tz) + Math.PI; g.add(sg); }
      hazards.push({ type: 'ice', from: d, to: d + len });
    }
  }

  // ---------- 날씨 입자 ----------
  const wx = { pines: { c: 0xffffff, n: 700, vy: -4, size: 0.35 }, volcano: { c: 0xfb923c, n: 400, vy: 3, size: 0.3 }, trees: { c: 0xfbcfe8, n: 160, vy: -1.2, size: 0.3 }, beach: { c: 0xffffff, n: 120, vy: 0.6, size: 0.25 }, clouds: { c: 0xffffff, n: 160, vy: -1, size: 0.3 } }[kind];
  let weather = null;
  if (wx) {
    const n = Math.round(wx.n * Math.max(0.4, quality)), pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i += 3) { pos[i] = rnd(-60, 60); pos[i + 1] = rnd(0, 40); pos[i + 2] = rnd(-60, 60); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: wx.c, size: wx.size, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false;
    g.add(pts);
    weather = { pts, vy: wx.vy, n };
  }
  return { hazards, anims, weather, rings };
}

function addBalloons(g, anims, farSpot, n) {
  const cols = [0xef4444, 0xfacc15, 0x3b82f6, 0xa855f7, 0x22c55e];
  for (let k = 0; k < n; k++) {
    const p = farSpot(60, 260, 6); if (!p) continue;
    const bal = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 10), new THREE.MeshLambertMaterial({ color: cols[k % cols.length] }));
    env.scale.y = 1.2; bal.add(env);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(4.05, 12, 4, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.scale.y = 1.2; bal.add(stripe);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: 0x92400e }));
    basket.position.y = -6.4; bal.add(basket);
    const y0 = rnd(28, 55);
    bal.position.set(p.x, y0, p.z);
    g.add(bal);
    anims.push({ kind: 'bob', obj: bal, y0, phase: k * 1.7 });
  }
}

/** 매 프레임: 장식 움직이기 + 날씨 입자를 카메라 주변에 */
export function animateFeatures(F, dt, time, cam) {
  if (!F) return;
  for (const a of F.anims) {
    if (a.kind === 'spin') a.obj.rotation[a.axis] += a.speed * dt;
    else if (a.kind === 'bob') a.obj.position.y = a.y0 + Math.sin(time * 0.5 + a.phase) * 2;
    else if (a.kind === 'flow') a.tex.offset.y -= dt * (a.speed ?? 0.8);
    else if (a.kind === 'pulse') a.obj.material.color.offsetHSL(dt * 0.05, 0, 0);
    else if (a.kind === 'drift') { a.tex.offset.x += dt * 0.02; a.tex.offset.y += dt * 0.012; }
    else if (a.kind === 'pulse2') a.obj.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
  }
  const w = F.weather;
  if (w && cam) {
    const arr = w.pts.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += w.vy * dt;
      arr[i] += Math.sin(time + i) * dt * 0.6;
      if (arr[i + 1] < 0) arr[i + 1] += 40; else if (arr[i + 1] > 40) arr[i + 1] -= 40;
    }
    w.pts.geometry.attributes.position.needsUpdate = true;
    w.pts.position.set(Math.round(cam.position.x / 10) * 10, cam.position.y - 18, Math.round(cam.position.z / 10) * 10);
  }
}

/** 장애물 상태 (raceT 기준이라 모두에게 같음): 화면 갱신 + 카트와 부딪힘 판정 */
export function updateHazards(game, F, t) {
  if (!F) return;
  const tr = game.track;
  for (const h of F.hazards) {
    if (h.type === 'boulder') {
      const ph = ((t + h.offset) % h.period);
      const s = h.s, roll = 2.4, span = tr.wall + 6;
      const active = ph < roll;
      const lat = (-span + (ph / roll) * span * 2) * h.dir;
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
      h.rock.visible = active;
      if (active) { h.rock.position.set(x, s.y + 2.1, z); h.rock.rotation.x += 0.15; h.rock.rotation.z += 0.1; }
      // 굴러오기 1초 전부터 길 가운데에 빨간 경고
      const warnT = h.period - ph;
      h.warn.visible = warnT < 1.1 || active;
      h.warn.position.set(active ? x : s.x - s.nx * span * h.dir * 0.6, s.y + 0.06, active ? z : s.z - s.nz * span * h.dir * 0.6);
      h.warn.material.opacity = 0.4 + Math.sin(t * 20) * 0.3;
      if (active) for (const r of game.racers) if (!r.remote && (r.x - x) ** 2 + (r.z - z) ** 2 < 2.9 ** 2 && Math.abs(r.y - s.y) < 3) game.hitRacer(r, 'rock');
      h.pos = active ? { x, z } : null;
    } else if (h.type === 'geyser') {
      const ph = ((t + h.offset) % h.period);
      const warn = ph > 3 && ph < 4, erupt = ph >= 4;
      h.glow.material.opacity = warn ? 0.5 + Math.sin(t * 25) * 0.4 : erupt ? 0.9 : 0;
      h.col.visible = erupt;
      if (erupt) { const k = Math.min(1, (ph - 4) * 5); h.col.scale.set(1, k, 1); h.col.position.y = h.y + 6 * k; }
      if (erupt) for (const r of game.racers) if (!r.remote && (r.x - h.x) ** 2 + (r.z - h.z) ** 2 < 2.6 ** 2 && r.y - h.y < 10) game.hitRacer(r, 'lava');
      h.danger = warn || erupt;
    }
  }
}

/** 활공 링 통과 → 가속 (한 바퀴에 링마다 한 번) */
export function updateRings(game, F) {
  if (!F?.rings?.length) return;
  for (const r of game.racers) {
    if (r.remote || !r.gliding) continue;
    r.ringHit ??= new Set();
    for (const ring of F.rings) {
      const key = `${r.lap}:${ring.id}`;
      if (r.ringHit.has(key) || (r.x - ring.x) ** 2 + (r.y + 1 - ring.y) ** 2 + (r.z - ring.z) ** 2 > ring.r ** 2) continue;
      r.ringHit.add(key);
      r.boostT = Math.max(r.boostT, 1.0);
      r.speed = Math.max(r.speed, r.stats.maxSpeed * 1.1);
      for (let i = 0; i < 12; i++) game.sparks.emit(ring.x, ring.y, ring.z, ring.mesh.material.color.getHex(), (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0.5);
      if (r.isPlayer) { game.sound('bonus'); game.msg = { text: '링 부스트!', t: 0.7 }; }
    }
  }
}

/** 빙판 위인지 (거리 d 기준) */
export function onIce(F, d) {
  if (!F) return false;
  for (const h of F.hazards) if (h.type === 'ice' && d >= h.from && d <= h.to) return true;
  return false;
}
