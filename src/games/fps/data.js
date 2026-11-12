// 스쿼드 슈터 - 무기 · 모드 · 맵 · 계급 데이터

/**
 * 무기. spread = [지향 사격, 조준 사격] 퍼짐(rad), bloom = 쏠 때마다 늘어나는 퍼짐, recoil = [위로 튐, 좌우 흔들림](rad)
 * range = [피해가 줄기 시작하는 거리, 최소가 되는 거리, 최소 배율], zoom = 조준 시 확대 배율
 */
export const WEAPONS = {
  ar: { id: 'ar', name: '돌격소총', icon: 'AR', slot: 0, dmg: 27, head: 1.8, rpm: 600, mag: 30, reserve: 120, reload: 2.1, auto: true, spread: [0.014, 0.0035], bloom: 0.005, bloomMax: 0.04, recoil: [0.013, 0.006], range: [28, 70, 0.6], speed: 1, zoom: 1.4, desc: '균형 잡힌 연사 소총' },
  smg: { id: 'smg', name: '기관단총', icon: 'SMG', slot: 0, dmg: 19, head: 1.6, rpm: 880, mag: 35, reserve: 140, reload: 1.7, auto: true, spread: [0.02, 0.009], bloom: 0.004, bloomMax: 0.045, recoil: [0.008, 0.007], range: [13, 38, 0.5], speed: 1.1, zoom: 1.25, desc: '가볍고 빠른 근거리 연사' },
  shotgun: { id: 'shotgun', name: '산탄총', icon: 'SG', slot: 0, dmg: 14, pellets: 8, head: 1.3, rpm: 78, mag: 6, reserve: 30, reload: 2.5, auto: false, spread: [0.075, 0.055], bloom: 0, bloomMax: 0.08, recoil: [0.06, 0.02], range: [7, 26, 0.2], speed: 1.02, zoom: 1.15, desc: '가까우면 한 방' },
  sniper: { id: 'sniper', name: '저격소총', icon: 'SR', slot: 0, dmg: 92, head: 2.5, rpm: 44, mag: 5, reserve: 25, reload: 2.8, auto: false, spread: [0.07, 0.0004], bloom: 0, bloomMax: 0.08, recoil: [0.07, 0.012], range: [90, 160, 0.9], speed: 0.92, zoom: 4.2, scope: true, desc: '조준경 · 몸통 한 방 직전, 머리는 즉사' },
  lmg: { id: 'lmg', name: '경기관총', icon: 'MG', slot: 0, dmg: 25, head: 1.6, rpm: 720, mag: 80, reserve: 160, reload: 3.6, auto: true, spread: [0.024, 0.008], bloom: 0.0035, bloomMax: 0.05, recoil: [0.011, 0.009], range: [30, 75, 0.6], speed: 0.86, zoom: 1.35, desc: '탄창 80발, 무겁고 재장전이 김' },
  pistol: { id: 'pistol', name: '권총', icon: 'HG', slot: 1, dmg: 30, head: 2, rpm: 330, mag: 12, reserve: 60, reload: 1.3, auto: false, spread: [0.012, 0.005], bloom: 0.008, bloomMax: 0.04, recoil: [0.022, 0.008], range: [16, 42, 0.5], speed: 1.12, zoom: 1.2, desc: '보조 무기' },
  knife: { id: 'knife', name: '칼', icon: '🔪', slot: 2, melee: true, dmg: 75, head: 1, rpm: 110, reach: 2.2, speed: 1.2, desc: '가장 빠르게 달림 · 뒤에서 찌르면 즉사' },
  grenade: { id: 'grenade', name: '수류탄', icon: '💣', slot: 3, throw: true, count: 2, dmg: 150, radius: 7.5, fuse: 2.2, speed: 1.05, desc: '2.2초 뒤 폭발' },
  // 좀비 (근접 공격만)
  claw: { id: 'claw', name: '할퀴기', slot: 0, melee: true, dmg: 14, head: 1, rpm: 70, reach: 1.9, speed: 1 },
};
export const PRIMARIES = ['ar', 'smg', 'shotgun', 'sniper', 'lmg'];

export const MODES = [
  { id: 'tdm', name: '팀 데스매치', desc: '5 대 5 · 먼저 30킬 또는 5분', goal: 30, time: 300, teams: true },
  { id: 'ffa', name: '개인전', desc: '모두가 적 · 먼저 20킬 또는 5분', goal: 20, time: 300, teams: false },
  { id: 'zombie', name: '좀비 서바이벌', desc: '몰려오는 좀비 웨이브를 버텨라', teams: false, zombie: true },
];

export const DIFFS = {
  easy: { name: '쉬움', react: 0.6, turn: 3.2, err: 0.05, dmg: 0.55, burst: [2, 4], see: 45 },
  normal: { name: '보통', react: 0.38, turn: 5, err: 0.028, dmg: 0.75, burst: [3, 6], see: 60 },
  hard: { name: '어려움', react: 0.22, turn: 7.5, err: 0.014, dmg: 1, burst: [4, 8], see: 80 },
};

export const BOT_NAMES = ['독수리', '늑대', '불곰', '매', '표범', '코브라', '상어', '호랑이', '여우', '들소', '까마귀', '전갈', '수달', '올빼미', '재규어', '바이퍼', '하이에나', '맹금', '도베르만', '살쾡이'];

// 누적 경험치 → 계급
export const RANKS = [
  [0, '훈련병'], [300, '이병'], [800, '일병'], [1600, '상병'], [2800, '병장'], [4500, '하사'], [7000, '중사'], [10000, '상사'],
  [14000, '소위'], [19000, '중위'], [25000, '대위'], [33000, '소령'], [43000, '중령'], [56000, '대령'], [72000, '준장'], [95000, '대장'],
];
export function rankOf(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return { idx: i, name: RANKS[i][1], next: next ? next[0] : null, base: RANKS[i][0] };
}

export const ZOMBIES = {
  walker: { name: '좀비', hp: 70, speed: 2.7, dmg: 14, score: 50, scale: 1, tint: 0x7fae5a },
  runner: { name: '달리는 좀비', hp: 45, speed: 5.4, dmg: 10, score: 70, scale: 0.92, tint: 0xa8c66c },
  brute: { name: '거대 좀비', hp: 380, speed: 2.2, dmg: 30, score: 200, scale: 1.45, tint: 0x4f7a43 },
  boss: { name: '좀비 왕', hp: 1500, speed: 3.1, dmg: 45, score: 1000, scale: 1.9, tint: 0x8a3fa0 },
};

// ---------------- 맵 ----------------
// build(b) 안에서 b.sym(() => {...}) 으로 서쪽 절반을 지으면 동쪽에 180° 돌린 모양이 똑같이 생김 (A팀 = 서쪽, B팀 = 동쪽)
const BLUE = 0x2f6fb3, RED = 0xb9433a, GREEN = 0x3f8f5a, YEL = 0xd1a12e, GRAY = 0x8a929c, WHITE = 0xe6e9ee;

export const MAPS = [
  {
    id: 'yard', name: '컨테이너 야드', emoji: '📦', size: [68, 46], ground: 'asphalt', wallMat: 'concrete',
    sky: 0x8fbfe8, fog: 0xc9dff0, fogFar: 150, sun: 0xfff4e0,
    build(b) {
      // 가운데: 높은 단 + 컨테이너 줄
      b.box(0, 0, 7, 7, 1.2, 'concrete');
      b.stairs(-3.5 - 0.38 * 4, 0, 'e', 1.2, 2.4); b.stairs(3.5 + 0.38 * 4, 0, 'w', 1.2, 2.4);
      b.crate(-1.6, -1.6, 1.3, 1); b.crate(1.6, 1.6, 1.3, 1); b.box(0, 0, 1.6, 1.6, 1.0, 'wood', { y: 1.2 });
      b.sym(() => {
        b.container(0, -11, 'z', RED); b.container(0, -11, 'z', YEL, 2.6);
        b.container(-2.6, -17.5, 'x', GREEN);
        // 서쪽 절반
        b.container(-10, -5, 'x', BLUE); b.container(-10, 7.5, 'z', GRAY); b.container(-10, 7.5, 'z', BLUE, 2.6);
        b.container(-18.5, -1, 'z', GREEN); b.container(-16, -13.5, 'x', YEL);
        b.container(-9, 17, 'x', RED); b.container(-9, 19.5, 'x', GRAY);
        b.crate(-13.2, 0.5, 1.3, 2); b.crate(-14.6, 0.5, 1.3, 1); b.crate(-6, -9, 1.3, 1); b.crate(-5.2, 12.5, 1.5, 1);
        b.crate(-21, 12, 1.3, 2); b.crate(-22.4, 12, 1.3, 1); b.crate(-21, 13.4, 1.3, 1);
        b.sandbags(-25, -5.5, 5, 'z'); b.sandbags(-25, 6, 5, 'z'); b.sandbags(-15, 12.5, 4, 'x');
        b.barrel(-12, -9.5); b.barrel(-11.1, -9.2, 0x2e86c1); b.barrel(-19, 6.5); b.barrel(-4, 5, 0x27ae60);
        // 창고 (북서쪽 구석)
        b.house(-25, -16, 12, 9, 3.4, { doors: [['e', 1.5, 2.2], ['s', -2.5, 2]], wins: [['s', 3, 2], ['e', -2.5, 1.6]], mat: 'brick', roof: 'dark', floor: 'concrete' });
        b.crate(-28.5, -18.5, 1.3, 2); b.crate(-27, -18.8, 1.3, 1);
        // 지게차 느낌의 짐 더미
        b.box(-29, 17, 3, 5, 1.4, 'planks'); b.box(-29, 17, 2.2, 3.6, 1.1, 'wood', { y: 1.4 });
      });
    },
    spawns: {
      a: [[-31, -3], [-31, 0], [-31, 3], [-29, -8], [-29, 8], [-27, 1.5], [-27, -1.5]],
      ffa: [[-31, 0], [31, 0], [-17, -21.5], [17, 21.5], [-3.5, 21.8], [3.5, -21.8], [-22, 20], [22, -20], [0, 5], [0, -5], [-14, -9], [14, 9]],
      zombie: [[-32, -21], [32, 21], [-32, 21], [32, -21], [0, -21.5], [0, 21.5], [-32, 0], [32, 0]],
      player: [0, 0, 1.2],
    },
    pickups: [[0, -6, 'ammo'], [0, 6, 'ammo'], [-14, 20.5, 'health'], [14, -20.5, 'health'], [-22, -5, 'ammo'], [22, 5, 'ammo']],
  },
  {
    id: 'town', name: '사막 마을', emoji: '🏜️', size: [72, 64], ground: 'sand', wallMat: 'plaster',
    sky: 0xf2c88a, fog: 0xf0d9b0, fogFar: 130, sun: 0xffe6b8,
    build(b) {
      // 가운데 광장: 우물 + 노점 (기둥 위 지붕)
      b.box(0, 0, 2.4, 2.4, 1.0, 'brick', { shape: 'cyl', tint: 0xcbb89a });
      for (const [x, z] of [[-6, -5], [6, 5]]) {
        for (const [ax, az] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) b.box(x + ax, z + az, 0.18, 0.18, 2.3, 'planks');
        b.box(x, z, 3.8, 2.8, 0.14, 'planks', { y: 2.3, tint: x < 0 ? 0xd9534f : 0x4f8ad9 });
        b.box(x, z + 0.6, 3.0, 0.9, 0.9, 'planks');
      }
      b.sym(() => {
        // 집 1 (북서): 문 2 + 창
        b.house(-20, -18, 11, 9, 3.4, { doors: [['e', -1.5, 1.7], ['s', 2, 1.7]], wins: [['e', 2.5, 1.6], ['s', -2.5, 1.6], ['n', 0, 1.8]], tint: 0xf1e2c4, floor: 'planks' });
        b.crate(-23.5, -20.5, 1.2, 1); b.box(-17.5, -20.6, 2.4, 1.0, 0.9, 'planks');
        // 집 2 (서쪽): 옥상으로 올라가는 계단
        b.house(-24, 5, 9, 11, 3.2, { doors: [['e', 2.5, 1.7], ['n', -1.5, 1.7]], wins: [['e', -2.5, 1.6], ['s', 0, 1.8]], tint: 0xe8d2a8, roof: 'plaster', floor: 'planks' });
        b.stairs(-18.5, 9.6 + 0.38 * 6.5, 'n', 3.45, 1.5, 'plaster');
        b.wall(-28.6, -0.6, -19.4, -0.6, 0.9, 'plaster', 0.3, { y: 3.45 }); b.wall(-28.6, -0.6, -28.6, 10.6, 0.9, 'plaster', 0.3, { y: 3.45 }); // 옥상 난간
        // 집 3 (남쪽 가운데)
        b.house(-7, 21, 10, 8, 3.2, { doors: [['n', 2, 1.7], ['w', 0, 1.7]], wins: [['n', -2.5, 1.6], ['e', 0, 1.6]], tint: 0xf4e6cc, floor: 'planks' });
        // 집 4 (북쪽 가운데, 작은 창고)
        b.house(-8, -26, 8, 6, 2.9, { doors: [['s', 0, 1.8]], wins: [['e', 0, 1.4]], mat: 'brick', roof: 'dark' });
        // 담장과 엄폐물
        b.wall(-13, -9, -13, -3, 1.15, 'plaster', 0.5); b.wall(-13, 4, -13, 9, 1.15, 'plaster', 0.5);
        b.wall(-16, 14, -11, 14, 2.6, 'brick', 0.5); b.wall(-31, -9, -26, -9, 2.6, 'brick', 0.5);
        b.crate(-9, -12, 1.3, 2); b.crate(-10.4, -12, 1.3, 1); b.crate(-3.5, 9.5, 1.3, 1); b.crate(-15, 0, 1.4, 1);
        b.barrel(-11.5, 11.5, 0x8e6b3a); b.barrel(-12.4, 11.9, 0x8e6b3a); b.barrel(-4, -14, 0x8e6b3a);
        b.sandbags(-31, -3, 4.5, 'z'); b.sandbags(-31, 16, 4.5, 'z');
        b.box(-2.5, -19, 4.6, 2.1, 1.5, 'metal', { tint: 0x6b7b52 }); b.box(-0.9, -19, 1.4, 1.9, 0.9, 'metal', { tint: 0x596846, y: 1.5 }); // 버려진 트럭
        b.tree(-30, 26, 'palm', 1.3); b.tree(-16, 27, 'palm', 1.1); b.tree(-32, -26, 'palm', 1.2); b.tree(-3, 14.5, 'palm', 1);
      });
    },
    spawns: {
      a: [[-33, -1], [-33, 2], [-33, -5], [-33, 13], [-33, -13], [-30, 12], [-30, -6]],
      ffa: [[-33, 0], [33, 0], [-20, -27], [20, 27], [-14, 27], [14, -27], [0, -12], [0, 12], [-30, 28], [30, -28], [-16, -5], [16, 5]],
      zombie: [[-34, -30], [34, 30], [-34, 30], [34, -30], [0, -30.5], [0, 30.5], [-34, 0], [34, 0]],
      player: [0, 4, 0],
    },
    pickups: [[0, -8, 'ammo'], [0, 8, 'ammo'], [-20, -18, 'health'], [20, 18, 'health'], [-24, 5, 'ammo'], [24, -5, 'ammo'], [-24.5, 4, 'health', 3.45], [24.5, -4, 'health', 3.45]],
  },
  {
    id: 'base', name: '설원 기지', emoji: '❄️', size: [80, 54], ground: 'snow', wallMat: 'concrete',
    sky: 0xc9d9ea, fog: 0xe6eef6, fogFar: 95, sun: 0xffffff, snow: true,
    build(b) {
      // 가운데 지휘소: 문 4개, 창 여럿
      b.house(0, 0, 12, 10, 3.3, { doors: [['w', 0, 2], ['e', 0, 2], ['n', -3, 1.7], ['s', 3, 1.7]], wins: [['n', 2.5, 2], ['s', -2.5, 2]], mat: 'concrete', roof: 'dark', floor: 'concrete' });
      b.crate(-2.5, -3, 1.3, 1); b.crate(2.5, 3, 1.3, 1); b.box(0, 0, 2.6, 1.2, 0.95, 'planks');
      b.sym(() => {
        // 벙커 (낮은 건물)
        b.house(-22, -14, 9, 7, 2.7, { doors: [['e', 0, 1.8], ['s', -2, 1.6]], wins: [['e', 2.4, 1.4], ['e', -2.4, 1.4], ['n', 0, 2.4]], mat: 'concrete', roof: 'concrete', tint: 0xb8c0c8, floor: 'concrete' });
        b.house(-20, 15, 8, 8, 2.7, { doors: [['n', 0, 1.8], ['e', 2, 1.6]], wins: [['e', -2, 1.6], ['s', 0, 2]], mat: 'brick', roof: 'dark', floor: 'planks' });
        // 망루
        b.tower(-12, 3, 3.2, 'w');
        // 참호 느낌의 모래주머니 줄
        b.sandbags(-30, -4, 6, 'z'); b.sandbags(-30, 6, 6, 'z'); b.sandbags(-13, -9, 6, 'x'); b.sandbags(-9, 12, 5, 'x'); b.sandbags(-6.5, -17, 5, 'z');
        // 트럭 · 연료통 · 보급 상자
        b.box(-16, -3.5, 2.3, 5.2, 1.7, 'metal', { tint: 0x56705a }); b.box(-16, -5.4, 2.1, 1.5, 0.8, 'metal', { tint: 0x46604a, y: 1.7 });
        b.barrel(-26, 2, 0x4a6fa5); b.barrel(-26.9, 2.5, 0x4a6fa5); b.barrel(-8, 7, 0xc0392b); b.barrel(-3, -11);
        b.crate(-18, 7.5, 1.4, 2); b.crate(-19.5, 7.5, 1.4, 1); b.crate(-4, 18, 1.3, 1); b.crate(-27, -22, 1.3, 2); b.crate(-10.5, -20, 1.5, 1);
        b.container(-4, 23.5, 'x', WHITE); b.container(-31, 19, 'z', GREEN);
        b.box(-9, -4, 3, 2.2, 1.3, 'ice', { tint: 0xdcefff }); b.box(-24, 8.5, 2.4, 3, 1.6, 'ice', { tint: 0xdcefff });
        for (const [x, z, s] of [[-36, -22, 1.3], [-33, -24, 1], [-37, 12, 1.2], [-14, 24, 1.1], [-26, 24.5, 1.3], [-37, -8, 1], [-15, -24.5, 1.2], [-6, 9, 0.9]]) b.tree(x, z, 'pine', s);
      });
    },
    spawns: {
      a: [[-37, -2], [-37, 1], [-37, 4], [-35, -6], [-35, 8], [-33, 1], [-34, -3]],
      ffa: [[-37, 0], [37, 0], [-28, -24], [28, 24], [-10, 25], [10, -25], [-37, 23], [37, -23], [0, -9], [0, 9], [-18, -8], [18, 8]],
      zombie: [[-38, -25], [38, 25], [-38, 25], [38, -25], [0, -25.5], [0, 25.5], [-38, 0], [38, 0]],
      player: [0, 0, 0],
    },
    pickups: [[0, -7.5, 'ammo'], [0, 7.5, 'ammo'], [-22, -14, 'health'], [22, 14, 'health'], [-20, 15, 'ammo'], [20, -15, 'ammo'], [-12, 3, 'ammo', 3.45], [12, -3, 'ammo', 3.45]],
  },
];
