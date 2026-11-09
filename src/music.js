// 배경 음악: 게임마다 장르가 다른 오리지널 곡을 WebAudio 로 실시간 합성 (외부 음원 파일 없음)
//
// 곡마다 직접 정한 것:
//  - 장르별 드럼 그루브 · 베이스 패턴 · 반주 방식 (문자열 패턴, 한 글자 = 한 칸)
//  - 박자 격자: bar = 한 마디 칸 수, beat = 한 박 칸 수 (16/4 = 4/4박 16분음표, 12/3 = 셋잇단 셔플)
//  - 멜로디 테마(motif): 2마디짜리 [시작 칸, 길이, 음계 도수] → 곡 전체에서 반복·전조·변주
// 구성: A(테마 + 진행에 맞춘 반복) A'(끝맺음) B(테마 리듬으로 새 선율, 일부 곡은 드럼을 비우는 브레이크다운) A
import { sfx } from './sfx.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11],
};

// 패턴 글자: 드럼 x = 침, g = 약하게(고스트) / 베이스 R 근음 3 3도 5 5도 6 6도 7 7도 O 옥타브 L 아래 5도 a 다음 화음으로 이어지는 음 - 늘임 / 반주 x = 화음, - 늘임
export const SONGS = {
  // 블록 낙하: 신스팝 - 당김음 반주, 손뼉, 하이햇 엇박
  blocks: {
    bpm: 150, root: 57, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 4, 5, 4], gain: 0.9,
    drums: { k: 'x...x...x...x...', p: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
    bass: { type: 'square', pat: 'R.RR.RR.R.RR.R5.', vol: 0.16 },
    comp: { type: 'pluck', style: 'triad', pat: 'x..x..x...x..x..', vol: 0.06 },
    lead: { type: 'square', vol: 0.11, oct: 1 },
    motif: [[0, 2, 4], [2, 2, 2], [4, 3, 0], [7, 1, 2], [8, 2, 4], [10, 2, 5], [12, 4, 4], [16, 2, 7], [18, 1, 6], [19, 1, 5], [20, 4, 4], [24, 2, 2], [26, 2, 4], [28, 4, 0]],
    fill: true,
  },
  // 미로 추격: 칩튠 폴카 - 쿵짝 쿵짝, 짧게 끊는 음
  maze: {
    bpm: 132, root: 60, scale: 'major', prog: [0, 4, 0, 4], progB: [3, 0, 4, 0], gain: 1.1,
    drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: { type: 'triangle', pat: 'R.......5.......', vol: 0.32 },
    comp: { type: 'square', style: 'triad', pat: '....x.......x...', vol: 0.05, short: true },
    lead: { type: 'square', vol: 0.1, oct: 1, staccato: true },
    motif: [[0, 1, 7], [2, 1, 7], [4, 2, 4], [6, 2, 5], [8, 1, 6], [10, 1, 6], [12, 4, 4], [16, 1, 2], [18, 1, 3], [20, 2, 4], [22, 2, 2], [24, 4, 0], [28, 2, 1], [30, 2, 2]],
  },
  // 스네이크: 펑크 - 16분 스윙, 고스트 스네어, 클라비넷 반주, 튀는 베이스
  snake: {
    bpm: 104, root: 62, scale: 'dorian', prog: [0, 0, 3, 3], progB: [5, 6, 0, 4], gain: 1, swing: 0.28,
    drums: { k: 'x.....x.x.....x.', s: '....x..g.g..x..g', h: 'xxxxxxxxxxxxxxxx' },
    bass: { type: 'square', pat: 'R..O..R.5..R.O.a', vol: 0.15, cutoff: 900 },
    comp: { type: 'clav', style: 'seventh', pat: '..x.x..x..x.x..x', vol: 0.05 },
    lead: { type: 'triangle', vol: 0.3, oct: 1 },
    motif: [[0, 1, 0], [3, 1, 0], [4, 1, 2], [6, 2, 3], [10, 1, 4], [11, 1, 3], [12, 2, 0], [16, 1, 0], [19, 1, 0], [20, 1, 6], [22, 2, 7], [26, 1, 6], [27, 1, 4], [28, 3, 3]],
  },
  // 벽돌깨기: 신스웨이브 - 둥근 패드, 16분 아르페지오, 3박에 큰 스네어
  breakout: {
    bpm: 112, root: 52, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 5, 6, 4], gain: 1.1,
    drums: { k: 'x.....x...x.....', s: '........x.......', h: '..x...x...x...x.' },
    bass: { type: 'sawtooth', pat: 'R.R.R.R.R.R.R.R.', vol: 0.14, cutoff: 500 },
    comp: { type: 'pad', style: 'triad', pat: 'x---------------', vol: 0.05 },
    arp: { type: 'square', pat: 'xxxxxxxxxxxxxxxx', vol: 0.035 },
    lead: { type: 'sawtooth', vol: 0.11, oct: 1, vibrato: true },
    motif: [[0, 6, 4], [6, 2, 5], [8, 4, 4], [12, 4, 2], [16, 8, 0], [24, 4, 2], [28, 4, -1]],
  },
  // 카트 선택 화면: 스카 - 엇박 오르간 반주, 걸어가는 베이스
  kart: {
    bpm: 158, root: 55, scale: 'major', prog: [0, 3, 4, 0], progB: [5, 3, 1, 4], gain: 0.7,
    drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: { type: 'triangle', pat: 'R.3.5.O.R.3.5.a.', vol: 0.32 },
    comp: { type: 'organ', style: 'triad', pat: '..x...x...x...x.', vol: 0.05, short: true },
    lead: { type: 'square', vol: 0.1, oct: 1 },
    motif: [[2, 2, 4], [6, 2, 4], [8, 2, 5], [10, 2, 4], [12, 4, 2], [18, 2, 2], [22, 2, 3], [24, 2, 4], [26, 2, 2], [28, 4, 0]],
  },
  // 점프 러너: 모험 록 - 디스토션 파워 코드, 말발굽 베이스
  runner: {
    bpm: 144, root: 52, scale: 'mixo', prog: [0, 6, 3, 0], progB: [5, 6, 0, 4], gain: 0.8,
    drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: { type: 'sawtooth', pat: 'R.RRR.RRR.RRR.RR', vol: 0.12, cutoff: 600 },
    comp: { type: 'dist', style: 'power', pat: 'x.x.x.x.x.x.x.x.', vol: 0.035, short: true },
    lead: { type: 'square', vol: 0.11, oct: 1 },
    motif: [[0, 3, 0], [3, 1, 4], [4, 4, 7], [8, 2, 6], [10, 2, 4], [12, 4, 6], [16, 3, 4], [19, 1, 2], [20, 4, 4], [24, 2, 6], [26, 2, 4], [28, 4, 2]],
    fill: true,
  },
  // 러너 보스: 메탈 - 투베이스 16분 킥, 리프가 곧 멜로디
  'runner-boss': {
    bpm: 176, root: 52, scale: 'harm', prog: [0, 0, 5, 4], progB: [3, 3, 5, 4], gain: 0.6,
    drums: { k: 'xxxxxxxxxxxxxxxx', s: '....x.......x...', h: 'x...x...x...x...' },
    bass: { type: 'sawtooth', pat: 'RRRRRRRRRRRRRRRR', vol: 0.1, cutoff: 500 },
    comp: { type: 'dist', style: 'power', pat: 'x---x---x---x-x-', vol: 0.04 },
    lead: { type: 'dist', vol: 0.06, oct: 1 },
    motif: [[0, 1, 0], [1, 1, 0], [2, 1, 7], [3, 1, 0], [4, 1, 0], [5, 1, 6], [6, 1, 0], [7, 1, 5], [8, 2, 4], [10, 2, 5], [12, 4, 6], [16, 1, 0], [17, 1, 0], [18, 1, 7], [19, 1, 0], [20, 1, 0], [21, 1, 8], [22, 2, 7], [24, 2, 6], [26, 2, 5], [28, 4, 4]],
  },
  // 다리 잇기: 보사노바 - 림샷 클라베, 부드러운 기타 반주
  bridge: {
    bpm: 118, root: 60, scale: 'major', prog: [0, 1, 4, 0], progB: [3, 2, 1, 4], gain: 1,
    drums: { k: 'x..xx..xx..xx..x', r: 'x..x..x...x.x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: { type: 'sine', pat: 'R..5R..5R..5R..5', vol: 0.4 },
    comp: { type: 'pluck', style: 'seventh', pat: 'x..x..x...x..x..', vol: 0.05 },
    lead: { type: 'sine', vol: 0.28, oct: 1, vibrato: true },
    motif: [[0, 3, 4], [3, 3, 5], [6, 2, 4], [8, 6, 2], [16, 3, 3], [19, 3, 4], [22, 2, 3], [24, 6, 1]],
    soft: true,
  },

  // ---------------- 카트 트랙별 레이스 곡 (모두 장르가 다름) ----------------
  // 햇살 서킷: 디스코 펑크 - 사박 킥, 엇박 오픈 하이햇, 옥타브 베이스, 현악 패드
  'kart-sunny': {
    bpm: 132, root: 53, scale: 'major', prog: [0, 5, 1, 4], progB: [3, 2, 1, 4], gain: 0.95,
    drums: { k: 'x...x...x...x...', p: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
    bass: { type: 'sawtooth', pat: 'R.O.R.O.R.O.R.Oa', vol: 0.14, cutoff: 800 },
    comp: { type: 'pad', style: 'seventh', pat: 'x-------x-------', vol: 0.045 },
    lead: { type: 'square', vol: 0.1, oct: 1 },
    motif: [[0, 2, 7], [2, 1, 7], [3, 1, 6], [4, 2, 7], [6, 2, 9], [8, 4, 7], [12, 2, 4], [14, 2, 5], [16, 2, 6], [18, 1, 6], [19, 1, 5], [20, 2, 6], [22, 2, 7], [24, 6, 4], [30, 2, 2]],
    fill: true,
  },
  // 모래 협곡: 서부 질주 - 셋잇단 말발굽 리듬, 쿵-짝 반주, 튕기는 리드
  'kart-canyon': {
    bpm: 150, beat: 3, bar: 12, root: 52, scale: 'mixo', prog: [0, 6, 3, 0], progB: [3, 6, 4, 4], gain: 0.85,
    drums: { k: 'x..x..x..x..', s: '...x.....x..', h: 'x.xx.xx.xx.x' },
    bass: { type: 'triangle', pat: 'R..5..R..5..', vol: 0.34 },
    comp: { type: 'pluck', style: 'triad', pat: '...x.....x..', vol: 0.06 },
    lead: { type: 'pluck', vol: 0.16, oct: 1 },
    motif: [[0, 2, 0], [2, 1, 2], [3, 3, 4], [6, 2, 4], [8, 1, 5], [9, 3, 4], [12, 2, 2], [14, 1, 4], [15, 3, 7], [18, 6, 6]],
    fill: true,
  },
  // 네온 시티: 드럼앤베이스 - 브레이크비트, 길게 우는 리스 베이스, 패드, 브레이크다운
  'kart-neon': {
    bpm: 174, root: 49, scale: 'minor', prog: [0, 5, 2, 6], progB: [5, 6, 0, 4], gain: 0.95,
    drums: { k: 'x.........x.....', s: '....x..g.g..x...', h: 'x.xxx.xxx.xxx.xx' },
    bass: { type: 'reese', pat: 'R-------5---O---', vol: 0.12 },
    comp: { type: 'pad', style: 'triad', pat: 'x---------------', vol: 0.04 },
    lead: { type: 'sawtooth', vol: 0.1, oct: 1, vibrato: true },
    motif: [[0, 4, 0], [4, 2, 2], [6, 2, 3], [8, 8, 4], [16, 4, 6], [20, 2, 5], [22, 2, 4], [24, 8, 2]],
    breakdown: true,
  },
  // 눈꽃 산길: 스윙 재즈 - 라이드 심벌 '딩-딩가', 걸어가는 베이스, 7화음 오르간, 종소리
  'kart-snow': {
    bpm: 176, beat: 3, bar: 12, root: 50, scale: 'major', prog: [1, 4, 0, 5], progB: [3, 2, 1, 4], gain: 0.9,
    drums: { k: 'x.....x.....', g: '...g.....g..', y: 'x..x.xx..x.x' },
    bass: { type: 'triangle', pat: 'R..3..5..a..', vol: 0.36 },
    comp: { type: 'organ', style: 'seventh', pat: 'x.....x..x..', vol: 0.04, short: true },
    lead: { type: 'bell', vol: 0.16, oct: 1 },
    motif: [[0, 2, 4], [2, 1, 5], [3, 2, 6], [5, 1, 7], [6, 3, 9], [9, 3, 7], [12, 2, 6], [14, 1, 4], [15, 2, 2], [17, 1, 4], [18, 6, 5]],
  },
  // 구름 정원: 트랜스 - 사박 킥, 굴러가는 엇박 베이스, 슈퍼소 16분 아르페지오, 웅장한 테마
  'kart-skygarden': {
    bpm: 140, root: 57, scale: 'major', prog: [5, 3, 0, 4], progB: [1, 3, 4, 4], gain: 0.95,
    drums: { k: 'x...x...x...x...', p: '....x.......x...', h: 'g.g.g.g.g.g.g.g.', o: '..x...x...x...x.' },
    bass: { type: 'sawtooth', pat: '.RRR.RRR.RRR.RRR', vol: 0.11, cutoff: 700 },
    comp: { type: 'pad', style: 'triad', pat: 'x-------x-------', vol: 0.04 },
    arp: { type: 'supersaw', pat: 'xxxxxxxxxxxxxxxx', vol: 0.025 },
    lead: { type: 'supersaw', vol: 0.06, oct: 1 },
    motif: [[0, 3, 4], [3, 3, 4], [6, 2, 5], [8, 3, 7], [11, 3, 6], [14, 2, 4], [16, 3, 2], [19, 3, 4], [22, 2, 5], [24, 8, 4]],
    breakdown: true,
  },
  // 해변 리조트: 트로피컬 하우스 - 사박 킥, 엇박 오픈 하이햇, 마림바(종소리) 멜로디, 통통 튀는 베이스
  'kart-beach': {
    bpm: 124, root: 55, scale: 'major', prog: [0, 4, 5, 3], progB: [5, 3, 0, 4], gain: 0.95, swing: 0.12,
    drums: { k: 'x...x...x...x...', p: '....x.......x...', r: '..x..x....x..x..', o: '..x...x...x...x.' },
    bass: { type: 'sine', pat: 'R..R..O.R..R..5.', vol: 0.4 },
    comp: { type: 'pluck', style: 'triad', pat: '..x...x...x...x.', vol: 0.05 },
    lead: { type: 'bell', vol: 0.18, oct: 1 },
    motif: [[0, 1, 4], [2, 1, 4], [3, 2, 5], [6, 2, 4], [8, 1, 2], [10, 1, 4], [11, 3, 7], [16, 1, 6], [18, 1, 6], [19, 2, 5], [22, 2, 4], [24, 2, 2], [26, 2, 4], [28, 4, 0]],
    fill: true,
  },
  // 용암 화산: 스피드 메탈 - 말발굽 투베이스, 디스토션 리프, 화성 단음계
  'kart-volcano': {
    bpm: 186, root: 52, scale: 'harm', prog: [0, 5, 3, 4], progB: [0, 0, 5, 4], gain: 0.6,
    drums: { k: 'x.xxx.xxx.xxx.xx', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: { type: 'sawtooth', pat: 'R.RRR.RRR.RRR.RR', vol: 0.1, cutoff: 500 },
    comp: { type: 'dist', style: 'power', pat: 'x-x-x---x-x-x---', vol: 0.04 },
    lead: { type: 'dist', vol: 0.06, oct: 1 },
    motif: [[0, 1, 0], [1, 1, 0], [2, 2, 0], [4, 1, 0], [5, 1, 0], [6, 2, 1], [8, 1, 0], [9, 1, 0], [10, 2, -1], [12, 2, 0], [14, 2, 4], [16, 1, 5], [17, 1, 5], [18, 2, 5], [20, 1, 4], [21, 1, 4], [22, 2, 3], [24, 4, 4], [28, 4, 6]],
    fill: true,
  },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 곡 만들기 → 칸마다 연주할 음 목록 */
export function compose(def) {
  const bar = def.bar ?? 16, sc = SCALES[def.scale], R = rng(def.seed ?? strHash(JSON.stringify(def.motif)));
  const pitch = (deg, oct = 0) => { const o = Math.floor(deg / sc.length); return def.root + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * (o + oct); };
  const chords = [...def.prog, ...def.prog, ...def.progB, ...def.prog];
  const steps = Array.from({ length: chords.length * bar }, () => []);
  const at = (b, s) => steps[b * bar + s];

  // ---- 멜로디 ----
  const motif = def.motif;
  const move = (notes, barOff, dDeg = 0) => notes.map(([s, l, d]) => [s + barOff * bar, l, d + dDeg]);
  const seqShift = def.prog[2] - def.prog[0];
  const A = [...move(motif, 0), ...move(motif, 2, seqShift)];                       // 테마 + 진행 따라 옮긴 테마
  const lastRoot = def.prog[3];
  const A2 = [...move(motif, 0), ...move(motif.filter(([s]) => s < bar), 2), [3 * bar, bar, lastRoot + 7]]; // 끝맺음
  // B: 테마 리듬을 그대로 쓰고 음높이는 B 진행의 화음음으로 새로
  let deg = 4;
  const B = [];
  for (let rep = 0; rep < 2; rep++) for (const [s, l] of motif) {
    const b = Math.floor(s / bar) + rep * 2, ch = def.progB[b];
    const tones = [ch, ch + 2, ch + 4, ch + 7, ch + 9];
    if (s % (def.beat ?? 4) === 0) deg = tones.reduce((best, t) => (Math.abs(t - deg) < Math.abs(best - deg) ? t : best), tones[0]);
    else deg += [-1, 1, 1, -2, 2][Math.floor(R() * 5)];
    deg = Math.max(0, Math.min(11, deg));
    B.push([s + rep * 2 * bar, l, deg]);
  }
  const L = def.lead;
  [[A, 0], [A2, 4], [B, 8], [A, 12]].forEach(([notes, off]) => {
    for (const [s, l, d] of notes) {
      const b = off + Math.floor(s / bar), st = s % bar;
      if (b >= chords.length) continue;
      at(b, st).push({ i: 'lead', t: L.type, f: hz(pitch(d, L.oct ?? 1)), len: L.staccato ? Math.min(l, 1) * 0.6 : l, vol: L.vol, vib: L.vibrato && l >= 3 });
    }
  });

  chords.forEach((ch, b) => {
    const next = chords[(b + 1) % chords.length];
    // ---- 베이스 ----
    const bs = def.bass;
    let last = null;
    [...bs.pat].forEach((c, s) => {
      if (c === '.') { last = null; return; }
      if (c === '-') { if (last) last.len++; return; }
      const off = { R: 0, 3: 2, 5: 4, 6: 5, 7: 6, O: 7, L: -3 }[c];
      const m = c === 'a' ? pitch(next - 1, -1) : pitch(ch + (off ?? 0), -1);
      last = { i: 'bass', t: bs.type, f: hz(m), len: 1, vol: bs.vol, cutoff: bs.cutoff };
      at(b, s).push(last);
    });
    // ---- 반주 ----
    const cp = def.comp;
    if (cp) {
      const voicing = cp.style === 'power' ? [ch, ch + 4, ch + 7] : cp.style === 'seventh' ? [ch, ch + 2, ch + 4, ch + 6] : [ch, ch + 2, ch + 4];
      const oct = cp.style === 'power' ? -1 : 0;
      let lastC = null;
      [...cp.pat].forEach((c, s) => {
        if (c === '.') { lastC = null; return; }
        if (c === '-') { if (lastC) lastC.len++; return; }
        lastC = { i: 'chord', t: cp.type, fs: voicing.map((d) => hz(pitch(d, oct))), len: cp.short ? 0.7 : 1, vol: cp.vol };
        at(b, s).push(lastC);
      });
    }
    // ---- 아르페지오 ----
    if (def.arp) {
      const tones = [ch, ch + 2, ch + 4, ch + 7, ch + 9, ch + 7, ch + 4, ch + 2];
      [...def.arp.pat].forEach((c, s) => { if (c === 'x') at(b, s).push({ i: 'lead', t: def.arp.type, f: hz(pitch(tones[s % tones.length], 1)), len: 0.8, vol: def.arp.vol }); });
    }
    // ---- 드럼 ----
    const section = Math.floor(b / 4), inBar = b % 4;
    const breakdown = def.breakdown && section === 2 && inBar < 2;                     // B 앞 2마디는 킥·스네어 쉼
    const fill = def.fill && inBar === 3;                                             // 4마디째 끝에 스네어 필인
    const fillFrom = bar - (def.beat ?? 4);
    for (const [k, pat] of Object.entries(def.drums)) {
      [...pat].forEach((c, s) => {
        if (c === '.') return;
        if (breakdown && (k === 'k' || k === 's' || k === 'p')) return;
        if (fill && s >= fillFrom && (k === 'k' || k === 'o')) return;
        const kind = { k: 'kick', s: 'snare', g: 'snare', p: 'clap', h: 'hat', o: 'open', r: 'rim', y: 'ride' }[k];
        at(b, s).push({ i: kind, soft: c === 'g' || k === 'g' });
      });
    }
    if (fill) for (let s = fillFrom; s < bar; s++) at(b, s).push({ i: 'snare', soft: s < bar - 2 });
    if (inBar === 0 && !def.soft && !(def.breakdown && section === 2)) at(b, 0).push({ i: 'crash' });
  });
  return { steps, swing: def.swing ?? 0, beat: def.beat ?? 4 };
}

// ---------------- 소리 만들기 ----------------
let noiseBuf = null, distCurve = null;
const cache = {};

export const music = {
  id: null, owner: null, volume: 0.6, tempo: 1, out: null, timer: null,

  /** 곡 틀기 (같은 곡이 이미 나오면 그대로) */
  play(id, owner) {
    this.owner = owner ?? this.owner;
    if (this.id === id && this.timer) return;
    this.stop(0.15);
    this.id = id;
    this.start();
  },
  /** 소리를 낼 수 있게 되면(첫 입력) 기다리던 곡 시작 */
  start() {
    const ctx = sfx.context;
    if (!this.id || this.timer || !ctx || ctx.state !== 'running') return;
    const def = SONGS[this.id];
    if (!def) return;
    this.song = cache[this.id] ??= compose(def);
    this.def = def;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.applyVolume(0.6);
    this.step = 0;
    this.next = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.tick(), 25);
  },
  stop(fade = 0.3) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const out = this.out, ctx = sfx.context;
    if (out && ctx) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => out.disconnect(), fade * 1000 + 200);
    }
    this.out = null;
    this.id = null;
  },
  /** owner 가 틀어 둔 곡일 때만 멈춤 (다른 게임이 가져갔으면 그대로) */
  stopFor(owner, fade) { if (this.owner === owner) this.stop(fade); },
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyVolume(); },
  setTempo(t) { this.tempo = t; },
  applyVolume(time = 0.1) {
    const ctx = sfx.context;
    if (!this.out || !ctx) return;
    const v = sfx.muted ? 0 : this.volume * 0.32 * (this.def?.gain ?? 1);
    this.out.gain.setTargetAtTime(v, ctx.currentTime, time / 3);
  },

  stepDur() { return 60 / (this.def.bpm * this.tempo) / (this.song.beat ?? 4); },
  tick() {
    const ctx = sfx.context;
    if (!ctx || !this.out) return;
    const sd = this.stepDur();
    while (this.next < ctx.currentTime + 0.12) {
      const swing = this.song.swing && this.step % 2 ? sd * this.song.swing : 0;
      for (const n of this.song.steps[this.step]) this.voice(ctx, n, this.next + swing, sd);
      this.next += sd;
      this.step = (this.step + 1) % this.song.steps.length;
    }
  },

  /** 한 음/한 타 연주 */
  voice(ctx, n, t, sd) {
    const out = this.out;
    const env = (g, vol, dur, attack = 0.006, decay = 0.08, sustain = 0.6) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.setTargetAtTime(vol * sustain, t + attack, decay);
      g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur - 0.02), 0.025);
    };
    const noise = () => {
      noiseBuf ??= (() => { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; return src;
    };
    const perc = (len, vol, ftype, freq, q = 1) => {
      const src = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + len + 0.02);
    };
    switch (n.i) {
      case 'kick': {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(this.def.soft ? 0.5 : 0.85, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
        return;
      }
      case 'snare': perc(n.soft ? 0.06 : 0.14, n.soft ? 0.1 : 0.33, 'bandpass', 1900, 0.8); return;
      case 'clap': for (const d of [0, 0.012, 0.024]) { const tt = t + d; const src = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1300; g.gain.setValueAtTime(0.25, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (d === 0.024 ? 0.12 : 0.02)); src.connect(f).connect(g).connect(out); src.start(tt); src.stop(tt + 0.15); } return;
      case 'hat': perc(0.03, n.soft ? 0.05 : 0.1, 'highpass', 7500); return;
      case 'open': perc(0.13, 0.08, 'highpass', 6500); return;
      case 'ride': perc(0.22, 0.06, 'bandpass', 5200, 2.5); return;
      case 'crash': perc(1.1, 0.12, 'highpass', 4200); return;
      case 'rim': {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1750;
        g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.04); return;
      }
    }
    const dur = Math.max(0.05, n.len * sd * 0.95);
    const fs = n.fs ?? [n.f];
    const vol = n.vol / Math.sqrt(fs.length);
    for (const f of fs) this.tone(ctx, n.t, f, t, dur, vol, n, env, out);
  },

  /** 악기별 음색 */
  tone(ctx, type, f, t, dur, vol, n, env, out) {
    const g = ctx.createGain();
    const osc = (wave, freq, detune = 0) => { const o = ctx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(freq, t); o.detune.value = detune; o.start(t); o.stop(t + dur + 0.3); return o; };
    let dest = g;
    const lowpass = (freq, q = 0.7) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = q; g.connect(lp); return lp; };
    switch (type) {
      case 'pluck': // 기타처럼 튕기는 소리
        osc('triangle', f).connect(g); osc('square', f, 4).connect(g);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + Math.min(0.5, dur + 0.15));
        dest = lowpass(2600);
        break;
      case 'clav': // 펑크 클라비넷: 짧고 콧소리
        osc('square', f).connect(g);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.14);
        { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.5; g.connect(bp); dest = bp; }
        break;
      case 'organ': // 오르간: 배음 3개
        for (const [m, a] of [[1, 1], [2, 0.5], [3, 0.25]]) { const gg = ctx.createGain(); gg.gain.value = a; osc('sine', f * m).connect(gg).connect(g); }
        env(g, vol, dur, 0.004, 0.2, 0.8);
        break;
      case 'bell': // 종소리: 비정수 배음, 길게 울림
        osc('sine', f).connect(g);
        { const gg = ctx.createGain(); gg.gain.value = 0.35; osc('sine', f * 2.76).connect(gg).connect(g); }
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + Math.max(0.6, dur + 0.4));
        break;
      case 'pad': // 패드: 살짝 어긋난 톱니 두 개, 천천히 커짐
        osc('sawtooth', f, -8).connect(g); osc('sawtooth', f, 8).connect(g);
        env(g, vol, dur, 0.12, 0.3, 0.85);
        dest = lowpass(1300);
        break;
      case 'supersaw': // 트랜스 슈퍼소: 톱니 세 개
        for (const d of [-14, 0, 14]) osc('sawtooth', f, d).connect(g);
        env(g, vol, dur, 0.008, 0.1, 0.7);
        dest = lowpass(3800);
        break;
      case 'reese': // 드럼앤베이스 리스 베이스: 어긋난 톱니가 꿈틀
        osc('sawtooth', f, -18).connect(g); osc('sawtooth', f, 18).connect(g);
        env(g, vol, dur, 0.01, 0.2, 0.9);
        dest = lowpass(520, 3);
        break;
      case 'dist': { // 디스토션 기타
        osc('sawtooth', f).connect(g); osc('sawtooth', f, 7).connect(g);
        env(g, vol, dur, 0.004, 0.15, 0.8);
        distCurve ??= (() => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 6); } return c; })();
        const ws = ctx.createWaveShaper(); ws.curve = distCurve;
        const pre = ctx.createGain(); pre.gain.value = 8;
        g.connect(pre).connect(ws);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; ws.connect(lp);
        const post = ctx.createGain(); post.gain.value = 0.18; lp.connect(post);
        dest = post;
        break;
      }
      default: { // square · sawtooth · triangle · sine
        const o = osc(type, f);
        o.connect(g);
        if (n.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f * 0.007; lfo.connect(lg).connect(o.frequency); lfo.start(t + 0.12); lfo.stop(t + dur); }
        env(g, vol, dur);
        if (n.cutoff) dest = lowpass(n.cutoff, 2);
        else if (type === 'sawtooth') dest = lowpass(2600);
      }
    }
    dest.connect(out);
  },
};

// 첫 입력으로 오디오가 켜지면 기다리던 곡 시작
sfx.onUnlock = () => music.start();
