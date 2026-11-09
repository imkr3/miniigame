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
// shortcuts = 지름길 (본선 비율 from → to, side = 오른쪽 1 / 왼쪽 -1 벽이 뚫림). 흙길이라 느리지만 짧음
export const TRACKS = [
  {
    id: 'sunny', name: '햇살 서킷', desc: '완만한 언덕과 점프대, 입문용', emoji: '🌳',
    scale: 1.89, width: 18,
    points: [[0, 0, 0], [60, 0, 0], [110, -5, 2], [150, 20, 5], [160, 65, 7], [135, 100, 6], [90, 105, 3], [60, 80, 0], [30, 90, 0], [10, 130, 2], [-40, 140, 4], [-90, 115, 2], [-105, 60, 0], [-80, 20, 0], [-40, 5, 0]],
    boosts: [0.05, 0.62], boxes: [0.15, 0.5, 0.78], ramps: [8, 12],
    shortcuts: [{ from: 0.187, to: 0.447, side: 1 }],
    theme: { sky: 0x8ecbff, fog: 0xbfe3ff, ground: 0x5fa64a, dirt: 0x7a5a3a, wall: 0xf1f5f9, wallTop: 0xef4444, curbA: 0xef4444, curbB: 0xffffff, scenery: 'trees', sun: 0xffffff },
  },
  {
    id: 'canyon', name: '모래 협곡', desc: '절벽 위로 올라가 협곡을 글라이더로 건너기', emoji: '🏜️',
    scale: 1.69, width: 18,
    points: [[0, 0, 0], [90, 0, 0], [140, 25, 2], [145, 70, 5], [110, 92, 8], [60, 78, 11], [32, 98, 14], [45, 140, 16], [100, 150, 17], [150, 160, 17], [205, 170, 12], [225, 205, 8], [170, 230, 5], [60, 228, 4], [-20, 212, 2], [-62, 172, 2], [-50, 122, 1], [-82, 80, 0], [-72, 30, 0], [-40, 5, 0]],
    boosts: [0.1, 0.8], boxes: [0.16, 0.42, 0.72], ramps: [17], gliders: [[9, 10]],
    shortcuts: [{ from: 0.041, to: 0.224, side: 1 }],
    hazards: [{ type: 'boulder', at: 0.36 }, { type: 'boulder', at: 0.65, dir: -1 }, { type: 'boulder', at: 0.85 }],
    theme: { sky: 0xf6c38b, fog: 0xf3d2a6, ground: 0xd9a35f, dirt: 0xa0612e, wall: 0xb45309, wallTop: 0x78350f, curbA: 0xf97316, curbB: 0xfef3c7, scenery: 'cacti', sun: 0xfff1d6 },
  },
  {
    id: 'neon', name: '네온 시티', desc: '8자 고가도로를 넘나드는 야경 코스', emoji: '🌃',
    scale: 1.69, width: 18,
    points: [[-20, -75, 0], [60, -70, 0], [100, -30, 0], [90, 30, 1], [40, 70, 6], [0, 95, 11], [-50, 125, 11], [-90, 170, 8], [-60, 230, 5], [10, 250, 3], [80, 230, 1], [100, 180, 0], [60, 125, 0], [0, 95, 0], [-50, 65, 0], [-90, 20, 0], [-80, -45, 0]],
    boosts: [0.04, 0.33, 0.7], boxes: [0.15, 0.5, 0.82], ramps: [9], bridges: [[4, 7]],
    shortcuts: [{ from: 0.52, to: 0.709, side: -1 }],
    theme: { sky: 0x0b1026, fog: 0x14183a, ground: 0x1f2937, dirt: 0x334155, wall: 0x22d3ee, wallTop: 0xf472b6, curbA: 0xa855f7, curbB: 0x22d3ee, scenery: 'city', sun: 0x9fb4ff, night: true },
  },
  {
    id: 'snow', name: '눈꽃 산길', desc: '설산 정상까지 오른 뒤 글라이더로 하강', emoji: '❄️',
    scale: 1.76, width: 18,
    points: [[0, 0, 0], [70, -6, 0], [120, 10, 2], [140, 50, 5], [115, 80, 8], [80, 70, 11], [55, 95, 14], [70, 135, 17], [40, 170, 20], [-10, 172, 20], [-65, 172, 14], [-100, 150, 10], [-110, 100, 6], [-90, 45, 2], [-50, 12, 0]],
    boosts: [0.04, 0.5], boxes: [0.2, 0.5, 0.82], ramps: [12], gliders: [[9, 10]],
    shortcuts: [{ from: 0.092, to: 0.292, side: 1 }],
    hazards: [{ type: 'ice', at: 0.12, len: 40 }, { type: 'ice', at: 0.46, len: 36 }, { type: 'ice', at: 0.86, len: 40 }],
    theme: { sky: 0xc7d8ea, fog: 0xe2ecf6, ground: 0xf1f5f9, dirt: 0xcbd5e1, wall: 0x93c5fd, wallTop: 0x1d4ed8, curbA: 0x2563eb, curbB: 0xffffff, scenery: 'pines', sun: 0xffffff },
  },
  {
    id: 'skygarden', name: '구름 정원', desc: '하늘에 떠 있는 길, 활공 구간 두 곳', emoji: '☁️',
    scale: 1.82, width: 18,
    points: [[0, 0, 24], [70, 0, 24], [120, 30, 26], [135, 85, 29], [110, 125, 31], [80, 128, 31], [20, 128, 24], [-20, 100, 24], [-60, 75, 23], [-100, 80, 25], [-130, 45, 27], [-130, 5, 28], [-120, -45, 23], [-70, -40, 22], [-30, -25, 23]],
    boosts: [0.08, 0.6], boxes: [0.18, 0.45, 0.75], ramps: [1], gliders: [[5, 6], [11, 12]], floating: true,
    shortcuts: [{ from: 0.646, to: 0.906, side: 1, width: 9 }],
    theme: { sky: 0x60a5fa, fog: 0xbfdbfe, ground: 0xf8fafc, dirt: 0xe9d5ff, wall: 0xfbcfe8, wallTop: 0xa855f7, curbA: 0xf472b6, curbB: 0xffffff, scenery: 'clouds', sun: 0xffffff },
  },
  {
    id: 'volcano', name: '용암 화산', desc: '화산을 감아 오른 뒤 분화구 위를 활공, 용암 협곡 점프', emoji: '🌋',
    scale: 1.75, width: 18,
    points: [[0, 0, 0], [80, 0, 0], [130, 20, 3], [150, 65, 7], [125, 105, 11], [75, 115, 14], [35, 92, 16], [-5, 96, 16], [-60, 122, 10], [-95, 150, 6], [-135, 132, 3], [-155, 85, 1], [-130, 40, 0], [-90, 15, 0], [-45, 0, 0]],
    boosts: [0.06, 0.66], boxes: [0.17, 0.48, 0.8], ramps: [11], gliders: [[7, 8]],
    shortcuts: [{ from: 0.13, to: 0.3, side: 1 }],
    hazards: [{ type: 'geyser', at: 0.2, lat: -0.45 }, { type: 'geyser', at: 0.33, lat: 0.45 }, { type: 'geyser', at: 0.7, lat: 0 }, { type: 'geyser', at: 0.86, lat: -0.4 }],
    theme: { sky: 0x7c2d12, fog: 0x9a3412, ground: 0x3f3a36, dirt: 0x57534e, wall: 0x44403c, wallTop: 0xf97316, curbA: 0xef4444, curbB: 0x1c1917, scenery: 'volcano', sun: 0xffc9a3 },
  },
  {
    id: 'beach', name: '해변 리조트', desc: '야자수 해변, 언덕 위 전망대에서 바다 위로 활공', emoji: '🏖️',
    scale: 1.8, width: 18,
    points: [[0, 0, 0], [70, 0, 0], [120, 15, 1], [150, 55, 3], [140, 100, 6], [100, 125, 9], [55, 118, 10], [15, 140, 5], [-25, 162, 2], [-75, 152, 1], [-108, 115, 0], [-112, 65, 0], [-88, 28, 0], [-45, 6, 0]],
    boosts: [0.04, 0.58], boxes: [0.16, 0.47, 0.8], ramps: [2, 11], gliders: [[6, 7]],
    shortcuts: [{ from: 0.7, to: 0.88, side: 1 }],
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
