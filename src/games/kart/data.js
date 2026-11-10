// 카트 레이스 - 캐릭터, 카트, 트랙, 아이템 데이터
// 능력치는 1~5 (캐릭터 + 카트 보정을 더해서 사용)

export const CHARACTERS = [
  { id: 'rabbit', name: '토토', animal: '토끼', emoji: '🐰', color: 0xf8fafc, accent: 0xf9a8d4, kartColor: 0xec4899, speed: 2, accel: 5, weight: 2, handling: 4 },
  { id: 'bear',   name: '뭉치', animal: '곰',   emoji: '🐻', color: 0x92400e, accent: 0xfcd34d, kartColor: 0xb45309, speed: 5, accel: 2, weight: 4, handling: 2 },
  { id: 'cat',    name: '냥냥', animal: '고양이', emoji: '🐱', color: 0xfb923c, accent: 0xfff7ed, kartColor: 0xf97316, speed: 3, accel: 4, weight: 2, handling: 4 },
  { id: 'robot',  name: '볼트', animal: '로봇', emoji: '🤖', color: 0x94a3b8, accent: 0x38bdf8, kartColor: 0x475569, speed: 4, accel: 3, weight: 4, handling: 2 },
  { id: 'frog',   name: '개굴', animal: '개구리', emoji: '🐸', color: 0x4ade80, accent: 0xfef9c3, kartColor: 0x16a34a, speed: 3, accel: 3, weight: 3, handling: 4 },
  { id: 'penguin', name: '펭구', animal: '펭귄', emoji: '🐧', color: 0x1e293b, accent: 0xf8fafc, kartColor: 0x2563eb, speed: 4, accel: 3, weight: 3, handling: 3 },
  { id: 'panda',  name: '죽순', animal: '판다', emoji: '🐼', color: 0xf8fafc, accent: 0x111827, kartColor: 0x111827, speed: 4, accel: 2, weight: 5, handling: 2 },
  { id: 'duck',   name: '꽥이', animal: '오리', emoji: '🐥', color: 0xfde047, accent: 0xfb923c, kartColor: 0xeab308, speed: 2, accel: 4, weight: 2, handling: 5 },
];

export const KARTS = [
  { id: 'classic', name: '클래식',    desc: '균형 잡힌 기본 카트', speed: 0, accel: 0, weight: 0, handling: 0 },
  { id: 'sport',   name: '스피드스터', desc: '최고 속도↑ 가속·핸들링↓', speed: 1, accel: -1, weight: 0, handling: -1 },
  { id: 'buggy',   name: '버기',      desc: '가속↑ 풀밭에서 덜 느려짐', speed: -1, accel: 2, weight: -1, handling: 1, offroad: true },
  { id: 'tank',    name: '탱크',      desc: '무게↑ 부딪혀도 안 밀림', speed: 1, accel: -1, weight: 2, handling: -1 },
];

import { fromCourse } from './courses.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 캐릭터 + 카트 → 실제 물리 수치 */
export function combineStats(ch, kart) {
  const s = (k) => clamp(ch[k] + kart[k], 1, 7);
  const raw = { speed: s('speed'), accel: s('accel'), weight: s('weight'), handling: s('handling') };
  return {
    raw,
    maxSpeed: 27.4 + raw.speed * 0.45,  // m/s (최고 속도 차이는 작게)
    accel: 6 + raw.accel * 2.4,         // m/s² (가속 차이는 크게 → 부딪히거나 맞은 뒤 회복이 빠름)
    turn: 1.12 + raw.handling * 0.1,    // rad/s
    weight: raw.weight,
    // 속도가 낮은 대신: 부스트(아이템·미니 터보)가 더 세고, 핸들링이 좋으면 드리프트 게이지가 빨리 참
    boostMul: 1.26 + (7 - raw.speed) * 0.022,
    driftRate: 0.8 + raw.handling * 0.07,
    offroad: kart.offroad ? 0.68 : 0.52, // 풀밭 최고 속도 배율
  };
}

// 트랙: 제어점 [x, z, 높이y]를 잇는 닫힌 곡선
// boosts = 가속 발판(트랙 길이 비율), boxes = 아이템 박스 줄
// ramps = 점프대가 있는 제어점 번호, gliders = [시작 제어점, 끝 제어점] 사이가 낭떠러지 → 글라이더로 활공
// bridges = [시작, 끝] 제어점 구간은 흙둑 대신 기둥으로 받침 (고가도로), floating = 공중에 떠 있는 트랙
// hazards = 트랙 장애물 (boulder 굴러오는 바위 · geyser 용암 분출 · ice 빙판, at = 트랙 길이 비율)
// surfaces = 노면 구간 (wood 나무 다리 · brick 벽돌 · neon 네온 격자 · glass 유리 · metal 철판)
// shortcuts 에 kind: 'branch' = 갈림길 (진짜 도로, 본선과 비슷한 길이, boosts/boxes 로 장점 부여, out = 본선에서 떨어진 거리)
// shortcuts = 지름길 (본선 비율 from → to, side = 오른쪽 1 / 왼쪽 -1 벽이 뚫림). 흙길이라 느리지만 짧음
export const TRACKS = [
  {
    id: 'sunny', name: '햇살 서킷', desc: '고속 직선·시케인·언덕 헤어핀, 점프로 내려와 출발선 위를 고가도로로 건너는 8자', emoji: '🌳',
    ...fromCourse('sunny'), width: 18,
    boosts: [0.04, 0.53], boxes: [0.16, 0.42, 0.82], shortcuts: [{ from: 0.78, to: 0.94, side: -1 }, { kind: 'branch', from: 0.14, to: 0.3, side: -1, out: 48, boosts: [0.3, 0.7], label: '가속 발판 길' }], surfaces: [{ from: 0.2, to: 0.29, kind: 'brick' }, { from: 0.66, to: 0.76, kind: 'wood' }],
    theme: { sky: 0x8ecbff, fog: 0xbfe3ff, ground: 0x5fa64a, dirt: 0x7a5a3a, wall: 0xf1f5f9, wallTop: 0xef4444, curbA: 0xef4444, curbB: 0xffffff, scenery: 'trees', sun: 0xffffff },
  },
  {
    id: 'canyon', name: '모래 협곡', desc: '협곡 벽을 지그재그로 오르는 3단 스위치백, 절벽 위에서 협곡 활공, 바닥 S자', emoji: '🏜️',
    ...fromCourse('canyon'), width: 18,
    boosts: [0.03, 0.47, 0.82], boxes: [0.09, 0.24, 0.62], shortcuts: [{ from: 0.46, to: 0.62, side: -1 }, { kind: 'branch', from: 0.66, to: 0.86, side: 1, out: 60, boosts: [0.5], label: '바위 없는 길' }], surfaces: [{ from: 0.17, to: 0.23, kind: 'wood' }], hazards: [{ type: 'boulder', at: 0.55 }, { type: 'boulder', at: 0.7, dir: -1 }, { type: 'boulder', at: 0.85 }],
    theme: { sky: 0xf6c38b, fog: 0xf3d2a6, ground: 0xd9a35f, dirt: 0xa0612e, wall: 0xb45309, wallTop: 0x78350f, curbA: 0xf97316, curbB: 0xfef3c7, scenery: 'cacti', sun: 0xfff1d6 },
  },
  {
    id: 'neon', name: '네온 시티', desc: '직각 시가지 코너 블록 → 나선 램프로 고가도로 위 → 도시 위를 가로질러 내려옴', emoji: '🌃',
    ...fromCourse('neon'), width: 18,
    boosts: [0.03, 0.4, 0.8], boxes: [0.09, 0.47, 0.7], shortcuts: [{ kind: 'branch', from: 0.08, to: 0.2, side: 1, out: 60, boosts: [0.4, 0.7], label: '가속 발판 길' }, { kind: 'branch', from: 0.8, to: 0.96, side: 1, out: 60, boxes: [0.5], label: '아이템 길' }], surfaces: [{ from: 0.26, to: 0.4, kind: 'neon' }],
    theme: { sky: 0x0b1026, fog: 0x14183a, ground: 0x1f2937, dirt: 0x334155, wall: 0x22d3ee, wallTop: 0xf472b6, curbA: 0xa855f7, curbB: 0x22d3ee, scenery: 'city', sun: 0x9fb4ff, night: true },
  },
  {
    id: 'snow', name: '눈꽃 산길', desc: '헤어핀 두 개로 산을 올라 능선에서 절벽 활공, 헤어핀 연속 내리막', emoji: '❄️',
    ...fromCourse('snow'), width: 18,
    boosts: [0.03, 0.42, 0.8], boxes: [0.07, 0.25, 0.6], shortcuts: [{ from: 0.84, to: 0.96, side: -1 }, { kind: 'branch', from: 0.58, to: 0.78, side: 1, out: 60, boxes: [0.5], label: '빙판 없는 길' }], surfaces: [{ from: 0.26, to: 0.3, kind: 'wood' }], hazards: [{ type: 'ice', at: 0.13, len: 36 }, { type: 'ice', at: 0.49, len: 30 }, { type: 'ice', at: 0.72, len: 40 }],
    theme: { sky: 0xc7d8ea, fog: 0xe2ecf6, ground: 0xf1f5f9, dirt: 0xcbd5e1, wall: 0x93c5fd, wallTop: 0x1d4ed8, curbA: 0x2563eb, curbB: 0xffffff, scenery: 'pines', sun: 0xffffff },
  },
  {
    id: 'skygarden', name: '구름 정원', desc: '떠 있는 섬을 활공 두 번으로 잇고, 하늘 S자와 나선 고리', emoji: '☁️',
    ...fromCourse('skygarden'), width: 18, floating: true,
    boosts: [0.03, 0.24, 0.57], boxes: [0.09, 0.66, 0.86], shortcuts: [{ kind: 'branch', from: 0.64, to: 0.89, side: -1, out: 60, boosts: [0.3, 0.7], label: '가속 발판 길' }], surfaces: [{ from: 0.7, to: 0.8, kind: 'glass' }],
    theme: { sky: 0x60a5fa, fog: 0xbfdbfe, ground: 0xf8fafc, dirt: 0xe9d5ff, wall: 0xfbcfe8, wallTop: 0xa855f7, curbA: 0xf472b6, curbB: 0xffffff, scenery: 'clouds', sun: 0xffffff },
  },
  {
    id: 'volcano', name: '용암 화산', desc: '화산을 나선으로 감아 올라 분화구 가장자리에서 활공, 용암 강 옆 고속 내리막', emoji: '🌋',
    ...fromCourse('volcano'), width: 18,
    boosts: [0.03, 0.42, 0.8], boxes: [0.27, 0.49, 0.66], shortcuts: [{ kind: 'branch', from: 0.6, to: 0.85, side: 1, out: 60, label: '용암 없는 길' }], surfaces: [{ from: 0.39, to: 0.47, kind: 'metal' }], hazards: [{ type: 'geyser', at: 0.62, lat: -0.45 }, { type: 'geyser', at: 0.7, lat: 0.45 }, { type: 'geyser', at: 0.78, lat: 0 }, { type: 'geyser', at: 0.86, lat: -0.4 }],
    theme: { sky: 0x7c2d12, fog: 0x9a3412, ground: 0x3f3a36, dirt: 0x57534e, wall: 0x44403c, wallTop: 0xf97316, curbA: 0xef4444, curbB: 0x1c1917, scenery: 'volcano', sun: 0xffc9a3 },
  },
  {
    id: 'beach', name: '해변 리조트', desc: '해안 S자 골목, 등대 언덕 헤어핀, 부두 끝에서 바다 위 활공', emoji: '🏖️',
    ...fromCourse('beach'), width: 18,
    boosts: [0.04, 0.48, 0.8], boxes: [0.11, 0.31, 0.62], shortcuts: [{ from: 0.78, to: 0.94, side: 1 }, { kind: 'branch', from: 0.06, to: 0.26, side: -1, out: 60, boosts: [0.3], boxes: [0.6], label: '아이템 길' }], surfaces: [{ from: 0.25, to: 0.33, kind: 'wood' }],
    theme: { sky: 0x67e8f9, fog: 0xbae6fd, ground: 0xfde68a, dirt: 0xd6a85c, wall: 0xffffff, wallTop: 0x06b6d4, curbA: 0xf43f5e, curbB: 0xffffff, scenery: 'beach', sun: 0xfffbeb },
  },
];

// 아이템 (원작 게임과 다른 오리지널 구성)
export const ITEMS = {
  nitro:   { name: '니트로', icon: '⚡', desc: '짧은 가속' },
  triple:  { name: '트리플 니트로', icon: '⚡', uses: 3, desc: '가속 3번' },
  oil:     { name: '오일', icon: '🛢️', desc: '뒤에 미끄러운 기름' },
  mine:    { name: '폭탄 지뢰', icon: '💣', desc: '뒤에 설치, 닿으면 폭발' },
  rocket:  { name: '로켓', icon: '🚀', desc: '앞으로 발사, 벽에 튕김' },
  homing:  { name: '추적 로켓', icon: '🎯', desc: '바로 앞 순위를 쫓아감' },
  shield:  { name: '방어막', icon: '🛡️', desc: '공격 1번 막음' },
  turbo:   { name: '슈퍼 터보', icon: '🌟', desc: '오래 가속 + 무적 돌진' },
};

/** 순위(0=1등 ~ 1=꼴등)에 따라 아이템 확률이 달라짐 */
export function rollItem(rankFrac) {
  const tables = [
    { oil: 30, mine: 20, rocket: 20, nitro: 15, shield: 15 },
    { rocket: 25, homing: 15, nitro: 20, oil: 10, mine: 10, shield: 10, triple: 10 },
    { triple: 25, homing: 25, turbo: 20, nitro: 15, rocket: 15 },
  ];
  const t = tables[rankFrac < 0.3 ? 0 : rankFrac < 0.7 ? 1 : 2];
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(t)) { if ((r -= w) < 0) return k; }
  return 'nitro';
}
