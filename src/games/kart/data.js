// 카트 레이스 - 캐릭터, 카트, 트랙, 아이템 데이터
// 능력치는 1~5 (캐릭터 + 카트 보정을 더해서 사용)

export const CHARACTERS = [
  { id: 'rabbit', name: '토토', animal: '토끼', emoji: '🐰', color: 0xf8fafc, accent: 0xf9a8d4, kartColor: 0xec4899, speed: 2, accel: 5, weight: 1, handling: 4 },
  { id: 'bear',   name: '뭉치', animal: '곰',   emoji: '🐻', color: 0x92400e, accent: 0xfcd34d, kartColor: 0xb45309, speed: 5, accel: 2, weight: 5, handling: 2 },
  { id: 'cat',    name: '냥냥', animal: '고양이', emoji: '🐱', color: 0xfb923c, accent: 0xfff7ed, kartColor: 0xf97316, speed: 3, accel: 4, weight: 2, handling: 5 },
  { id: 'robot',  name: '볼트', animal: '로봇', emoji: '🤖', color: 0x94a3b8, accent: 0x38bdf8, kartColor: 0x475569, speed: 5, accel: 3, weight: 4, handling: 2 },
  { id: 'frog',   name: '개굴', animal: '개구리', emoji: '🐸', color: 0x4ade80, accent: 0xfef9c3, kartColor: 0x16a34a, speed: 3, accel: 3, weight: 3, handling: 3 },
  { id: 'penguin', name: '펭구', animal: '펭귄', emoji: '🐧', color: 0x1e293b, accent: 0xf8fafc, kartColor: 0x2563eb, speed: 4, accel: 3, weight: 3, handling: 3 },
  { id: 'panda',  name: '죽순', animal: '판다', emoji: '🐼', color: 0xf8fafc, accent: 0x111827, kartColor: 0x111827, speed: 4, accel: 2, weight: 4, handling: 3 },
  { id: 'duck',   name: '꽥이', animal: '오리', emoji: '🐥', color: 0xfde047, accent: 0xfb923c, kartColor: 0xeab308, speed: 2, accel: 5, weight: 1, handling: 5 },
];

export const KARTS = [
  { id: 'classic', name: '클래식',    desc: '균형 잡힌 기본 카트', speed: 0, accel: 0, weight: 0, handling: 0 },
  { id: 'sport',   name: '스피드스터', desc: '최고 속도↑ 가속·핸들링↓', speed: 2, accel: -1, weight: 0, handling: -1 },
  { id: 'buggy',   name: '버기',      desc: '가속↑ 풀밭에서 덜 느려짐', speed: -1, accel: 2, weight: -1, handling: 1, offroad: true },
  { id: 'tank',    name: '탱크',      desc: '무게↑ 부딪혀도 안 밀림', speed: 1, accel: -2, weight: 2, handling: -1 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 캐릭터 + 카트 → 실제 물리 수치 */
export function combineStats(ch, kart) {
  const s = (k) => clamp(ch[k] + kart[k], 1, 7);
  const raw = { speed: s('speed'), accel: s('accel'), weight: s('weight'), handling: s('handling') };
  return {
    raw,
    maxSpeed: 26 + raw.speed * 0.8,     // m/s (최고 속도 차이는 작게)
    accel: 6 + raw.accel * 2.1,         // m/s² (가속 차이는 크게 → 부딪히거나 맞은 뒤 회복이 빠름)
    turn: 1.5 + raw.handling * 0.12,    // rad/s
    weight: raw.weight,
    offroad: kart.offroad ? 0.68 : 0.52, // 풀밭 최고 속도 배율
  };
}

// 트랙: 제어점(x, z)을 잇는 닫힌 곡선. boosts = 가속 발판 위치(트랙 길이 비율), boxes = 아이템 박스 줄 위치
export const TRACKS = [
  {
    id: 'sunny', name: '햇살 서킷', desc: '완만한 코너, 입문용', emoji: '🌳',
    scale: 1.45, width: 16,
    points: [[0, 0], [60, 0], [110, -5], [150, 20], [160, 65], [135, 100], [90, 105], [60, 80], [30, 90], [10, 130], [-40, 140], [-90, 115], [-105, 60], [-80, 20], [-40, 5]],
    boosts: [0.05, 0.62], boxes: [0.2, 0.47, 0.78],
    theme: { sky: 0x8ecbff, fog: 0xbfe3ff, ground: 0x5fa64a, wall: 0xf1f5f9, wallTop: 0xef4444, curbA: 0xef4444, curbB: 0xffffff, scenery: 'trees', sun: 0xffffff },
  },
  {
    id: 'canyon', name: '모래 협곡', desc: '급커브와 헤어핀, 드리프트 필수', emoji: '🏜️',
    scale: 1.3, width: 15,
    points: [[0, 0], [90, 0], [140, 25], [145, 70], [110, 92], [60, 78], [32, 98], [45, 140], [100, 150], [150, 178], [130, 222], [60, 228], [-20, 212], [-62, 172], [-50, 122], [-82, 80], [-72, 30], [-40, 5]],
    boosts: [0.1, 0.55, 0.8], boxes: [0.16, 0.42, 0.7],
    theme: { sky: 0xf6c38b, fog: 0xf3d2a6, ground: 0xd9a35f, wall: 0xb45309, wallTop: 0x78350f, curbA: 0xf97316, curbB: 0xfef3c7, scenery: 'cacti', sun: 0xfff1d6 },
  },
  {
    id: 'neon', name: '네온 시티', desc: '야경 속 직선 질주와 직각 코너', emoji: '🌃',
    scale: 1.35, width: 16,
    points: [[0, 0], [120, 0], [160, 15], [175, 55], [172, 140], [150, 176], [110, 180], [90, 150], [82, 112], [52, 96], [12, 110], [-8, 150], [-40, 175], [-90, 170], [-112, 130], [-106, 40], [-80, 10], [-40, 0]],
    boosts: [0.08, 0.35, 0.68], boxes: [0.18, 0.5, 0.83],
    theme: { sky: 0x0b1026, fog: 0x14183a, ground: 0x1f2937, wall: 0x22d3ee, wallTop: 0xf472b6, curbA: 0xa855f7, curbB: 0x22d3ee, scenery: 'city', sun: 0x9fb4ff, night: true },
  },
  {
    id: 'snow', name: '눈꽃 산길', desc: 'S자 연속 코너가 이어지는 설산', emoji: '❄️',
    scale: 1.35, width: 15,
    points: [[0, 0], [70, -6], [120, 10], [140, 50], [115, 80], [80, 70], [55, 95], [70, 135], [40, 170], [-10, 165], [-30, 128], [-70, 120], [-100, 85], [-90, 40], [-50, 12]],
    boosts: [0.04, 0.5], boxes: [0.22, 0.52, 0.8],
    theme: { sky: 0xc7d8ea, fog: 0xe2ecf6, ground: 0xf1f5f9, wall: 0x93c5fd, wallTop: 0x1d4ed8, curbA: 0x2563eb, curbB: 0xffffff, scenery: 'pines', sun: 0xffffff },
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
