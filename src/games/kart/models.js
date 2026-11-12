// 카트 레이스 - 캐릭터·카트·아이템 3D 모델 (앞쪽 = +Z)
// 모든 부품은 둥근 상자·회전체·관·타원체로 만들어 각진 곳이 없고, 재질별로 하나의 메시로 합쳐 그리기 호출을 줄임
import * as THREE from '../../vendor/three.module.min.js';
import { roundedBox, lathe, tube, ellipsoid, part, merge, mix } from './shapes.js';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
/** parent.add() 는 parent 를 돌려주므로, 자식을 돌려주는 버전 */
const put = (parent, obj) => { parent.add(obj); return obj; };

// 재질 4가지를 모든 레이서가 같이 씀 (색은 꼭짓점 색): 광택 도장 · 무광(털·고무) · 바퀴 · 빛나는 부분
const MATS = {
  paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.18, envMapIntensity: 1.1 }),
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.55 }),
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25, envMapIntensity: 0.8 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
const HALF = Math.PI / 2;
const sphere = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 14);
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);
const CHROME = 0xd5dae2, DARK = 0x1b1f27, RUBBER = 0x16181d, WHITE = 0xffffff;

/** 바퀴 하나 (축 = X): 둥근 타이어 + 림 + 바큇살 5개(돌아가는 게 보이도록) + 가운데 캡 */
function wheelGeo(R, W, capColor) {
  const P = [];
  P.push(part(lathe([[R * 0.56, -W / 2], [R * 0.82, -W / 2], [R * 0.95, -W * 0.41], [R, -W * 0.24], [R, W * 0.24], [R * 0.95, W * 0.41], [R * 0.82, W / 2], [R * 0.56, W / 2]], 20), RUBBER, 0, 0, 0, 0, 0, HALF));
  P.push(part(lathe([[0, -W * 0.3], [R * 0.52, -W * 0.3], [R * 0.6, -W * 0.44], [R * 0.6, W * 0.44], [R * 0.52, W * 0.3], [0, W * 0.3]], 16), 0x2a2e36, 0, 0, 0, 0, 0, HALF));
  // 바큇살은 바퀴를 가로질러 양쪽 면에 다 보임
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; P.push(part(new THREE.CylinderGeometry(R * 0.075, R * 0.075, R * 0.5, 6), 0xe8ebf0, 0, Math.cos(a) * R * 0.27, Math.sin(a) * R * 0.27, a, 0, 0, W * 0.84 / (R * 0.15), 1, 1)); }
  P.push(part(ellipsoid(W * 0.46, R * 0.16, R * 0.16, 8, 6), capColor));
  return merge(P);
}

/** 카트 차체 부품 목록을 만듦 → { paint, matte, glow, 바퀴 치수, 좌석 높이, 배기구 위치 } */
function kartParts(kart, color) {
  const paint = [], matte = [], glow = [];
  const light = mix(color, WHITE, 0.35), LAMP = 0xfff7d6;
  let wheelR = 0.42, wheelW = 0.34, track = 0.8, base = 0.95, seatY = 0.75, exY = 0.5, exZ = -1.42, exX = 0.3;
  const sym = (fn) => { for (const s of [-1, 1]) fn(s); };
  const headlight = (x, y, z, r = 0.09) => sym((s) => { glow.push(part(ellipsoid(r, r, r * 0.6, 10, 8), LAMP, s * x, y, z)); paint.push(part(new THREE.TorusGeometry(r, r * 0.22, 6, 14), CHROME, s * x, y, z - r * 0.15)); });
  const taillight = (x, y, z) => sym((s) => glow.push(part(ellipsoid(0.07, 0.05, 0.03, 12, 8), 0xff3b3b, s * x, y, z)));
  const steering = (y, z) => {
    matte.push(part(new THREE.TorusGeometry(0.19, 0.036, 8, 20), DARK, 0, y, z, -0.95));
    matte.push(part(cyl(0.028, 0.028, 0.42, 10), 0x30353f, 0, y - 0.13, z + 0.16, -0.95 + HALF));
    paint.push(part(ellipsoid(0.05, 0.05, 0.03, 12, 8), color, 0, y - 0.01, z + 0.015, -0.95));
  };
  const seat = (y, z) => {
    matte.push(part(roundedBox(0.76, 0.66, 0.22, 0.1, 2), 0x14171d, 0, y + 0.14, z - 0.26, -0.16));
    matte.push(part(roundedBox(0.72, 0.16, 0.62, 0.07, 2), 0x14171d, 0, y - 0.14, z + 0.05));
    paint.push(part(roundedBox(0.3, 0.2, 0.06, 0.03, 2), color, 0, y + 0.38, z - 0.345, -0.16)); // 머리 받침 로고
  };
  const exhaust = () => sym((s) => {
    paint.push(part(cyl(0.085, 0.1, 0.42, 20), CHROME, s * exX, exY, exZ + 0.12, HALF));
    matte.push(part(ellipsoid(0.07, 0.07, 0.02, 14, 8), 0x0b0c0f, s * exX, exY, exZ - 0.095));
  });
  const axles = () => { for (const z of [base, -base]) matte.push(part(cyl(0.05, 0.05, track * 2, 10), 0x30353f, 0, wheelR, z, 0, 0, HALF)); };

  if (kart.id === 'sport') { // 스피드스터: 낮고 긴 어뢰 모양 차체 + 앞뒤 날개
    wheelR = 0.38; wheelW = 0.32; base = 1.08; track = 0.82; seatY = 0.68; exY = 0.46; exZ = -1.5; exX = 0.2;
    paint.push(part(lathe([[0.02, -1.42], [0.3, -1.3], [0.44, -0.75], [0.44, 0.05], [0.3, 0.95], [0.13, 1.62], [0.01, 1.82]], 20), color, 0, 0.46, 0, HALF, 0, 0, 1.38, 1, 0.74));
    paint.push(part(ellipsoid(0.11, 0.333, 0.95), WHITE, 0, 0.46, -0.3));                                  // 가운데 흰 줄
    sym((s) => paint.push(part(ellipsoid(0.27, 0.2, 0.66), color, s * 0.6, 0.42, -0.28)));                   // 옆 흡기구
    sym((s) => matte.push(part(ellipsoid(0.12, 0.11, 0.05, 14, 10), 0x0b0c0f, s * 0.6, 0.44, 0.33)));
    paint.push(part(roundedBox(1.96, 0.07, 0.44, 0.03, 2), color, 0, 0.24, 1.62));                           // 앞 날개
    sym((s) => paint.push(part(roundedBox(0.07, 0.26, 0.5, 0.03, 2), WHITE, s * 0.98, 0.32, 1.6)));
    paint.push(part(roundedBox(1.56, 0.07, 0.46, 0.03, 2), color, 0, 1.14, -1.3, 0.12));                     // 뒷날개
    paint.push(part(roundedBox(1.5, 0.05, 0.3, 0.02, 2), WHITE, 0, 0.98, -1.22, 0.2));
    sym((s) => paint.push(part(roundedBox(0.07, 0.46, 0.56, 0.03, 2), light, s * 0.78, 1.02, -1.28)));
    sym((s) => matte.push(part(roundedBox(0.07, 0.56, 0.24, 0.03, 2), DARK, s * 0.3, 0.8, -1.24)));
    paint.push(part(ellipsoid(0.07, 0.3, 0.5), color, 0, 0.82, -0.98));                                      // 등지느러미
    headlight(0.2, 0.5, 1.2, 0.07); taillight(0.26, 0.56, -1.36);
  } else if (kart.id === 'buggy') { // 버기: 통통한 차체 + 큰 바퀴 + 흙받이 + 롤바
    wheelR = 0.56; wheelW = 0.44; track = 0.92; base = 0.98; seatY = 0.95; exY = 0.72; exZ = -1.3; exX = 0.32;
    paint.push(part(roundedBox(1.26, 0.54, 2.2, 0.24, 3), color, 0, 0.78, 0));
    paint.push(part(ellipsoid(0.5, 0.2, 0.52), mix(color, 0x000000, 0.3), 0, 1.0, 0.72));                    // 보닛
    matte.push(part(roundedBox(1.12, 0.14, 2.34, 0.07, 2), DARK, 0, 0.5, 0));
    for (const z of [base, -base]) sym((s) => { // 흙받이: 바퀴 위를 덮는 아치
      const pts = []; for (let a = 0.2; a <= Math.PI - 0.2 + 1e-6; a += (Math.PI - 0.4) / 8) pts.push([0, Math.sin(a) * (wheelR + 0.09), Math.cos(a) * (wheelR + 0.09)]);
      paint.push(part(tube(pts, 0.085, 10, 6), color, s * track, wheelR, z, 0, 0, 0, 2.3, 1, 1));
    });
    matte.push(part(tube([[-0.52, 0.95, -0.82], [-0.5, 1.45, -0.9], [-0.3, 1.74, -0.92], [0.3, 1.74, -0.92], [0.5, 1.45, -0.9], [0.52, 0.95, -0.82]], 0.055, 15, 7), 0x30353f)); // 롤바
    sym((s) => matte.push(part(tube([[s * 0.42, 1.62, -0.92], [s * 0.45, 1.25, -1.1], [s * 0.48, 0.9, -1.16]], 0.04, 10, 8), 0x30353f)));
    for (const x of [-0.3, 0, 0.3]) { glow.push(part(sphere(0.085, 10, 8), 0xfff7d6, x, 1.84, -0.9)); matte.push(part(ellipsoid(0.1, 0.1, 0.09, 12, 8), DARK, x, 1.84, -0.95)); }
    paint.push(part(tube([[-0.62, 0.62, 1.05], [-0.5, 0.86, 1.3], [0.5, 0.86, 1.3], [0.62, 0.62, 1.05]], 0.055, 10, 7), CHROME)); // 앞 범퍼 바
    paint.push(part(tube([[-0.5, 0.58, 1.26], [0.5, 0.58, 1.26]], 0.05, 4, 7), CHROME));
    headlight(0.4, 0.86, 1.1, 0.13); taillight(0.42, 0.84, -1.11);
  } else if (kart.id === 'tank') { // 탱크: 두툼한 장갑 차체 + 굴뚝 배기관 + 앞 가드
    wheelR = 0.48; wheelW = 0.52; track = 0.9; base = 0.96; seatY = 1.0; exY = 0.6; exZ = -1.42; exX = 0.36;
    paint.push(part(roundedBox(1.62, 0.62, 2.5, 0.2, 3), color, 0, 0.82, 0));
    matte.push(part(roundedBox(1.84, 0.26, 2.72, 0.12, 2), DARK, 0, 0.52, 0));                               // 장갑 테두리
    paint.push(part(roundedBox(1.54, 0.42, 0.26, 0.12, 2), CHROME, 0, 0.6, 1.42, 0.4));                      // 앞 가드
    paint.push(part(ellipsoid(0.48, 0.17, 0.4), mix(color, 0x000000, 0.3), 0, 1.14, 0.7));
    paint.push(part(cyl(0.075, 0.085, 0.72, 18), CHROME, 0, 1.16, 1.12, HALF));                              // 포신
    paint.push(part(new THREE.TorusGeometry(0.085, 0.03, 6, 14), DARK, 0, 1.16, 1.48));
    sym((s) => { paint.push(part(cyl(0.08, 0.09, 0.56, 18), CHROME, s * 0.64, 1.36, -1.02)); paint.push(part(new THREE.TorusGeometry(0.085, 0.03, 6, 14), DARK, s * 0.64, 1.64, -1.02, HALF)); }); // 굴뚝
    for (const z of [-0.9, -0.3, 0.3, 0.9]) sym((s) => paint.push(part(sphere(0.045, 6, 5), CHROME, s * 0.815, 0.86, z)));                                   // 리벳
    sym((s) => paint.push(part(roundedBox(0.06, 0.12, 1.7, 0.03, 2), WHITE, s * 0.3, 1.105, -0.05, 0, 0, HALF)));
    headlight(0.56, 0.9, 1.25, 0.1); taillight(0.56, 0.9, -1.26);
  } else { // 클래식: 둥근 코 + 옆 포드 + 뒤 엔진 덮개
    paint.push(part(ellipsoid(0.47, 0.25, 0.8), color, 0, 0.5, 0.78));
    paint.push(part(ellipsoid(0.125, 0.257, 0.81), WHITE, 0, 0.5, 0.78));                                    // 코 위 흰 줄
    paint.push(part(roundedBox(1.02, 0.36, 1.36, 0.16, 3), color, 0, 0.5, -0.24));
    sym((s) => paint.push(part(capsule(0.19, 0.92), light, s * 0.62, 0.44, -0.12, HALF)));
    paint.push(part(ellipsoid(0.5, 0.3, 0.46), color, 0, 0.66, -0.98));
    paint.push(part(ellipsoid(0.13, 0.305, 0.465), WHITE, 0, 0.665, -0.98));
    matte.push(part(roundedBox(1.16, 0.14, 2.5, 0.07, 2), DARK, 0, 0.31, 0));
    paint.push(part(tube([[-0.74, 0.34, 1.16], [-0.5, 0.34, 1.5], [0.5, 0.34, 1.5], [0.74, 0.34, 1.16]], 0.065, 10, 7), CHROME)); // 앞 범퍼
    paint.push(part(tube([[-0.7, 0.36, -1.18], [-0.5, 0.36, -1.42], [0.5, 0.36, -1.42], [0.7, 0.36, -1.18]], 0.055, 10, 7), CHROME));
    paint.push(part(ellipsoid(0.17, 0.17, 0.03, 18, 10), WHITE, 0, 0.66, 1.2, -0.5));                        // 번호판
    headlight(0.27, 0.53, 1.37); taillight(0.3, 0.7, -1.38);
  }
  seat(seatY, -0.36); steering(seatY + 0.2, 0.14); exhaust(); axles();
  return { paint, matte, glow, wheelR, wheelW, track, base, seatY, exY, exZ, exX };
}

/** 캐릭터 부품 (원점 = 좌석). hand = 핸들을 잡는 손 위치 */
function characterParts(ch, paint, matte, glow, ox, oy, oz) {
  const robot = ch.id === 'robot';
  const fur = robot ? paint : matte;
  const c = ch.color, a = ch.accent, BLACK = 0x15161a, PINK = 0xfb8fa5;
  const add = (list, geo, color, x = 0, y = 0, z = 0, ...r) => list.push(part(geo, color, ox + x, oy + y, oz + z, ...r));
  const sym = (fn) => { for (const s of [-1, 1]) fn(s); };
  // 몸통 · 배 · 팔 · 장갑
  const belly = { penguin: a, panda: c, frog: a, duck: mix(c, WHITE, 0.5), robot: 0x64748b }[ch.id] ?? mix(c, WHITE, 0.45);
  if (robot) {
    add(paint, roundedBox(0.58, 0.64, 0.44, 0.13, 2), 0x64748b, 0, 0.45, -0.15);
    add(glow, ellipsoid(0.08, 0.08, 0.03, 14, 8), a, 0, 0.52, 0.075);
    add(paint, new THREE.TorusGeometry(0.085, 0.02, 6, 14), CHROME, 0, 0.52, 0.07);
  } else {
    add(fur, capsule(0.3, 0.34), ch.id === 'panda' ? 0x1c1d22 : c, 0, 0.45, -0.15);
    add(fur, ellipsoid(0.21, 0.26, 0.12, 12, 8), belly, 0, 0.42, 0.075);
  }
  const armC = ch.id === 'panda' ? 0x1c1d22 : robot ? 0x8a97a8 : c;
  sym((s) => {
    add(fur, tube([[s * 0.27, 0.64, -0.12], [s * 0.37, 0.5, 0.14], [s * 0.21, 0.38, 0.43]], 0.078, 6, 7), armC);
    add(fur, sphere(0.085, 6, 7), armC, s * 0.27, 0.64, -0.12);
    add(robot ? paint : matte, sphere(0.095, 10, 8), robot ? 0xcbd5e1 : WHITE, s * 0.2, 0.37, 0.46);
  });
  // 목도리 + 펄럭이는 끝
  add(matte, new THREE.TorusGeometry(0.235, 0.068, 7, 16), robot ? 0x334155 : ch.id === 'panda' ? 0xef4444 : a === 0xf8fafc || a === 0xfff7ed || a === 0xfef9c3 ? ch.kartColor : a, 0, 0.8, -0.08, HALF);
  if (!robot) add(matte, roundedBox(0.13, 0.05, 0.36, 0.025, 2), ch.id === 'panda' ? 0xef4444 : a === 0xf8fafc || a === 0xfff7ed || a === 0xfef9c3 ? ch.kartColor : a, 0.13, 0.76, -0.44, 0.25, 0.3, 0);

  // 머리
  const hy = 1.08, hz = -0.03, R = 0.36;
  const H = (list, geo, color, x = 0, y = 0, z = 0, ...r) => add(list, geo, color, x, hy + y, hz + z, ...r);
  const eyes = (y, z, spread = 0.135, k = 1) => sym((s) => {
    H(paint, ellipsoid(0.05 * k, 0.07 * k, 0.035 * k, 10, 8), BLACK, s * spread, y, z);
    H(glow, sphere(0.02 * k, 6, 4), WHITE, s * spread + 0.02 * k, y + 0.03 * k, z + 0.03 * k);
    H(glow, sphere(0.01 * k, 5, 3), WHITE, s * spread - 0.018 * k, y - 0.025 * k, z + 0.032 * k);
  });
  const cheeks = (y, z, spread) => sym((s) => H(matte, ellipsoid(0.068, 0.042, 0.02, 8, 6), PINK, s * spread, y, z, 0, s * 0.55, 0));
  const smile = (y, z, w = 0.045) => H(matte, new THREE.TorusGeometry(w, 0.011, 6, 14, Math.PI), 0x4a2a2a, 0, y, z, 0, 0, Math.PI);
  const roundCone = (r, h) => lathe([[r, 0], [r * 0.82, h * 0.34], [r * 0.42, h * 0.78], [r * 0.12, h * 0.97], [0, h]], 12);
  switch (ch.id) {
    case 'robot': {
      H(paint, roundedBox(0.68, 0.54, 0.58, 0.17, 3), c);
      H(paint, roundedBox(0.54, 0.22, 0.1, 0.05, 2), 0x0b1220, 0, 0.04, 0.262);                 // 화면
      sym((s) => H(glow, ellipsoid(0.058, 0.062, 0.02, 14, 8), a, s * 0.125, 0.045, 0.312));     // 빛나는 눈
      for (const x of [-0.09, 0, 0.09]) H(matte, roundedBox(0.05, 0.05, 0.03, 0.012, 1), 0x334155, x, -0.15, 0.285);
      sym((s) => { H(paint, cyl(0.075, 0.075, 0.09, 18), CHROME, s * 0.37, 0, 0, 0, 0, HALF); H(glow, sphere(0.03, 8, 6), a, s * 0.42, 0, 0); });
      H(paint, cyl(0.016, 0.016, 0.26, 8), CHROME, 0, 0.39, 0);
      H(glow, sphere(0.055, 12, 10), 0xff4d4d, 0, 0.55, 0);
      break;
    }
    case 'frog': {
      H(fur, ellipsoid(0.43, 0.3, 0.37, 22, 16), c);
      sym((s) => {
        H(fur, sphere(0.135, 16, 12), c, s * 0.2, 0.25, 0.06);
        H(paint, sphere(0.1, 16, 12), WHITE, s * 0.2, 0.285, 0.13);
        H(paint, ellipsoid(0.052, 0.062, 0.03, 12, 10), BLACK, s * 0.2, 0.295, 0.218);
        H(glow, sphere(0.018, 8, 6), WHITE, s * 0.2 + 0.02, 0.32, 0.24);
        H(matte, sphere(0.012, 6, 5), 0x1f5c30, s * 0.05, 0.05, 0.36);                              // 콧구멍
      });
      const pts = []; for (let x = -0.24; x <= 0.2401; x += 0.04) { const y = -0.1 + 0.07 * (x / 0.24) ** 2; pts.push([x, y, 0.37 * Math.sqrt(Math.max(0.05, 1 - (x / 0.43) ** 2 - (y / 0.3) ** 2)) + 0.004]); }
      H(matte, tube(pts, 0.012, 20, 6), 0x7f1d1d);
      cheeks(-0.02, 0.3, 0.29);
      break;
    }
    case 'penguin': case 'duck': {
      H(fur, sphere(R, 22, 16), c, 0, 0, 0, 0, 0, 0, 1.04, 0.97, 1);
      if (ch.id === 'penguin') {
        sym((s) => H(fur, ellipsoid(0.15, 0.175, 0.09), a, s * 0.085, 0.03, 0.262));              // 흰 얼굴 (하트 모양)
        H(fur, ellipsoid(0.17, 0.12, 0.09), a, 0, -0.07, 0.27);
        H(paint, roundCone(0.085, 0.2), 0xf59e0b, 0, -0.06, 0.33, HALF);
        eyes(0.07, 0.338, 0.115, 0.85);
        cheeks(-0.06, 0.335, 0.2);
      } else {
        H(paint, ellipsoid(0.16, 0.045, 0.14, 18, 10), a, 0, -0.065, 0.4);                         // 납작한 부리
        H(paint, ellipsoid(0.13, 0.035, 0.11, 18, 10), mix(a, 0x7c2d12, 0.25), 0, -0.1, 0.375);
        eyes(0.07, 0.318, 0.14);
        cheeks(-0.04, 0.292, 0.24);
        for (const [x, rz] of [[-0.05, 0.5], [0, 0], [0.05, -0.5]]) H(fur, capsule(0.028, 0.12), c, x, 0.38, -0.02, -0.2, 0, rz);
      }
      break;
    }
    default: { // 토끼 · 곰 · 고양이 · 판다
      H(fur, sphere(R, 22, 16), c, 0, 0, 0, 0, 0, 0, 1.06, 0.96, 1);
      const muzzle = ch.id === 'panda' || ch.id === 'rabbit' ? WHITE : ch.id === 'cat' ? a : mix(c, a, 0.75);
      H(fur, ellipsoid(0.155, 0.11, 0.1, 12, 8), muzzle, 0, -0.075, 0.29);
      H(paint, ellipsoid(0.046, 0.032, 0.03, 12, 8), ch.id === 'rabbit' || ch.id === 'cat' ? 0xf472b6 : BLACK, 0, -0.03, 0.385);
      smile(-0.085, 0.385);
      if (ch.id === 'panda') {
        sym((s) => {
          H(fur, ellipsoid(0.088, 0.11, 0.04), 0x1c1d22, s * 0.145, 0.065, 0.305, 0, 0, s * 0.45);
          H(paint, ellipsoid(0.04, 0.046, 0.025, 12, 8), WHITE, s * 0.14, 0.075, 0.332);
          H(paint, sphere(0.024, 10, 8), BLACK, s * 0.138, 0.075, 0.35);
          H(glow, sphere(0.009, 6, 5), WHITE, s * 0.138 + 0.01, 0.086, 0.37);
        });
      } else eyes(0.07, 0.318);
      cheeks(-0.055, 0.275, 0.235);
      if (ch.id === 'rabbit') {
        sym((s) => { H(fur, capsule(0.078, 0.42), c, s * 0.13, 0.56, -0.03, 0, 0, s * -0.16); H(fur, ellipsoid(0.042, 0.2, 0.025, 8, 6), a, s * 0.132, 0.57, 0.04, 0, 0, s * -0.16); });
        H(paint, roundedBox(0.062, 0.05, 0.02, 0.012, 1), WHITE, 0, -0.14, 0.375);                 // 앞니
      } else if (ch.id === 'cat') {
        sym((s) => {
          H(fur, roundCone(0.135, 0.27), c, s * 0.2, 0.22, -0.02, 0, 0, s * -0.32);
          H(fur, roundCone(0.08, 0.17), 0xf9a8d4, s * 0.203, 0.25, 0.035, 0, 0, s * -0.32);
          for (const rz of [-0.18, 0, 0.18]) H(matte, cyl(0.006, 0.006, 0.2, 5), WHITE, s * 0.27, -0.07 + rz * 0.12, 0.27, 0, s * -0.5, HALF + s * rz);
        });
        for (const x of [-0.07, 0, 0.07]) H(fur, ellipsoid(0.02, 0.06, 0.02, 8, 8), 0xc2410c, x, 0.3 - Math.abs(x) * 0.35, 0.17 + (x ? -0.035 : 0), -0.75, 0, 0); // 이마 줄무늬
      } else {
        const earC = ch.id === 'panda' ? 0x1c1d22 : c;
        sym((s) => { H(fur, sphere(0.12, 16, 12), earC, s * 0.26, 0.27, -0.02); if (ch.id !== 'panda') H(fur, ellipsoid(0.07, 0.07, 0.03, 12, 8), a, s * 0.26, 0.27, 0.075); });
      }
    }
  }
}

const geoCache = new Map(); // 캐릭터+카트 조합마다 합친 모양을 한 번만 만듦
function racerGeo(ch, kart) {
  const key = `${ch.id}|${kart.id}`;
  let g = geoCache.get(key);
  if (!g) {
    const k = kartParts(kart, ch.kartColor);
    characterParts(ch, k.paint, k.matte, k.glow, 0, k.seatY - 0.17, -0.36);
    g = { k, paint: merge(k.paint), matte: merge(k.matte), glow: merge(k.glow), wheel: wheelGeo(k.wheelR, k.wheelW, ch.kartColor),
      glider: merge([
        part(ellipsoid(2.75, 0.1, 0.8, 20, 8), ch.kartColor, 0, 2.62, 0),
        part(ellipsoid(0.62, 0.11, 0.66, 16, 8), WHITE, -2.25, 2.63, 0.02), part(ellipsoid(0.62, 0.11, 0.66, 16, 8), WHITE, 2.25, 2.63, 0.02),
        part(ellipsoid(0.2, 0.105, 0.81, 12, 8), WHITE, 0, 2.63, 0),
        part(tube([[-0.5, 1.2, -0.3], [-0.8, 2.0, -0.15], [-1.2, 2.58, 0]], 0.035, 10, 8), 0x30353f), part(tube([[0.5, 1.2, -0.3], [0.8, 2.0, -0.15], [1.2, 2.58, 0]], 0.035, 10, 8), 0x30353f),
      ]) };
    geoCache.set(key, g);
  }
  return g;
}

/** 레이서 모델: root(위치·방향) > body(드리프트 기울기·스핀) > 차체 + 캐릭터 + 바퀴 */
export function buildRacer(ch, kart) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const G = racerGeo(ch, kart), k = G.k;
  for (const key of ['paint', 'matte', 'glow']) { const m = new THREE.Mesh(G[key], MATS[key]); m.castShadow = key !== 'glow'; body.add(m); }
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(G.wheel, MATS.wheel);
    w.position.set(sx * k.track, k.wheelR, sz * k.base);
    w.castShadow = true;
    body.add(w); wheels.push(w);
  }
  // 부스트 불꽃 (배기구 뒤): 겉불꽃 + 속불꽃
  const flames = [];
  for (const s of [-1, 1]) {
    const f = mesh(lathe([[0, 0], [0.13, 0.12], [0.17, 0.3], [0.1, 0.62], [0, 0.95]], 14), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88, depthWrite: false }), s * k.exX, k.exY, k.exZ - 0.1);
    f.rotation.x = -HALF;
    f.add(mesh(lathe([[0, 0.02], [0.07, 0.12], [0.08, 0.26], [0.03, 0.5], [0, 0.6]], 10), new THREE.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.9, depthWrite: false })));
    f.visible = false;
    body.add(f); flames.push(f);
  }
  // 바닥 그림자 (부드러운 가장자리)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
  shadow.rotation.x = -HALF;
  shadow.position.y = 0.035;
  root.add(shadow);
  // 글라이더 날개 (활공 중에만 보임)
  const glider = new THREE.Mesh(G.glider, MATS.matte);
  glider.visible = false;
  body.add(glider);
  // 방어막
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.95, 22, 14), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25, depthWrite: false }));
  shield.position.y = 0.95;
  shield.visible = false;
  root.add(shield);
  const casters = body.children.filter((o) => o.castShadow);
  return { root, body, wheels, flames, head: body, shadow, shield, glider, casters };
}

let shadowTex;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 6, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  return (shadowTex = new THREE.CanvasTexture(cv));
}

// ---------------- 아이템 모델 ----------------
let boxTexture;
function questionTexture() {
  if (boxTexture) return boxTexture;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#f472b6'); gr.addColorStop(0.5, '#facc15'); gr.addColorStop(1, '#22d3ee');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.roundRect(12, 12, 104, 104, 22); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 84px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 6; ctx.fillText('?', 64, 70);
  boxTexture = new THREE.CanvasTexture(cv);
  boxTexture.colorSpace = THREE.SRGBColorSpace;
  return boxTexture;
}

let boxGeo;
export function buildItemBox() {
  return new THREE.Mesh(boxGeo ??= roundedBox(1.45, 1.45, 1.45, 0.3, 4), new THREE.MeshBasicMaterial({ map: questionTexture(), transparent: true, opacity: 0.88 }));
}

export function buildItemMesh(type) {
  const g = new THREE.Group();
  if (type === 'oil') {
    const m = mesh(new THREE.CircleGeometry(1.6, 36), new THREE.MeshBasicMaterial({ color: 0x0b0b10, transparent: true, opacity: 0.85 }), 0, 0.06, 0);
    m.rotation.x = -Math.PI / 2; g.add(m);
    const sheen = mesh(new THREE.RingGeometry(0.5, 0.8, 28, 1, 0, 2), new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.5 }), 0.3, 0.07, 0.2);
    sheen.rotation.x = -Math.PI / 2; g.add(sheen);
  } else if (type === 'mine') {
    g.add(mesh(new THREE.SphereGeometry(0.5, 22, 16), new THREE.MeshPhongMaterial({ color: 0xdc2626, shininess: 80 }), 0, 0.5, 0));
    for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.12, 0.35, 14), mat(0x374151), 0, 0.5, 0); const a = (i / 6) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5); sp.lookAt(Math.cos(a) * 2, 0.5, Math.sin(a) * 2); sp.rotateX(Math.PI / 2); g.add(sp); }
    g.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfde047 }), 0, 1.02, 0));
  } else if (type === 'freeze') { // 냉동탄: 빛나는 얼음 결정
    const c = mesh(new THREE.SphereGeometry(0.5, 18, 14), new THREE.MeshBasicMaterial({ color: 0xbae6fd }), 0, 0.8, 0); c.scale.set(0.75, 1.05, 0.75); g.add(c);
    g.add(mesh(new THREE.SphereGeometry(0.8, 20, 14), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0.8, 0));
  } else if (type === 'smoke') { // 연막: 회색 구름 덩어리
    const sm = new THREE.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75, depthWrite: false });
    for (const [x, y, z, r] of [[0, 1.6, 0, 2.2], [1.6, 1.2, 0.6, 1.6], [-1.5, 1.3, -0.4, 1.7], [0.4, 2.6, -0.8, 1.4], [-0.6, 0.9, 1.4, 1.3]]) g.add(mesh(new THREE.SphereGeometry(r, 18, 14), sm, x, y, z));
  } else if (type === 'cone') { // 고깔
    g.add(mesh(roundedBox(1.1, 0.14, 1.1, 0.07, 2), mat(0x1f2937), 0, 0.07, 0));
    g.add(mesh(lathe([[0.45, -0.65], [0.36, -0.3], [0.12, 0.5], [0.07, 0.62], [0, 0.65]], 22), mat(0xf97316), 0, 0.75, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.275, 0.335, 0.22, 22), mat(0xffffff), 0, 0.85, 0));
  } else if (type === 'glue') { // 끈끈이 웅덩이
    const m = mesh(new THREE.CircleGeometry(2.2, 36), new THREE.MeshLambertMaterial({ color: 0xd97706, transparent: true, opacity: 0.85 }), 0, 0.06, 0); m.rotation.x = -Math.PI / 2; g.add(m);
    for (const [x, z, r] of [[0.6, 0.4, 0.35], [-0.8, -0.3, 0.28], [0.1, -0.9, 0.22]]) g.add(mesh(new THREE.SphereGeometry(r, 14, 10), mat(0xfbbf24), x, 0.08, z));
  } else if (type === 'tornado') { // 회오리: 위로 갈수록 넓어지는 반투명 고리
    const tm = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) put(g, mesh(new THREE.TorusGeometry(0.5 + i * 0.32, 0.12, 8, 32), tm, Math.sin(i) * 0.2, 0.4 + i * 0.6, 0)).rotation.x = Math.PI / 2;
  } else if (type === 'rocket' || type === 'homing') {
    const color = type === 'rocket' ? 0xef4444 : 0x8b5cf6;
    const bodyM = mesh(new THREE.CapsuleGeometry(0.22, 0.9, 6, 16), new THREE.MeshPhongMaterial({ color, shininess: 80 }), 0, 0.7, 0); bodyM.rotation.x = Math.PI / 2; g.add(bodyM);
    const nose = mesh(lathe([[0.22, -0.22], [0.17, 0], [0.07, 0.18], [0, 0.24]], 16), mat(0xf8fafc), 0, 0.7, 0.82); nose.rotation.x = Math.PI / 2; g.add(nose);
    for (let i = 0; i < 3; i++) { const fin = mesh(roundedBox(0.06, 0.35, 0.3, 0.028, 1), mat(0x1f2937), 0, 0.7, -0.5); fin.rotation.z = (i / 3) * Math.PI * 2; fin.position.x = Math.sin((i / 3) * Math.PI * 2) * 0.22; fin.position.y = 0.7 + Math.cos((i / 3) * Math.PI * 2) * 0.22; g.add(fin); }
    const fl = mesh(new THREE.ConeGeometry(0.18, 0.7, 16), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }), 0, 0.7, -0.95); fl.rotation.x = -Math.PI / 2; g.add(fl);
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
