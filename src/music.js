// 배경 음악: 게임마다 오리지널 곡을 WebAudio 로 실시간 합성 (외부 음원 파일 없음)
// - 곡은 '작곡 규칙'(조성·화음 진행·리듬 스타일·씨앗값)으로 만들어서 매번 같은 곡이 나옴
// - 구성: A(4마디) A'(4마디) B(4마디, 다른 진행) A''(4마디) = 16마디 반복
// - 악기: 멜로디 · 아르페지오 · 베이스 · 드럼(킥·스네어·하이햇)
import { sfx } from './sfx.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11],
};

// 곡 설정: root = 으뜸음(MIDI), prog/progB = 마디별 화음(음계 도수), drums = 리듬 스타일
export const SONGS = {
  blocks:  { bpm: 148, root: 57, scale: 'minor', prog: [0, 5, 3, 4], progB: [3, 4, 2, 5], lead: 'square', drums: 'drive', seed: 11, gain: 0.9 },
  maze:    { bpm: 128, root: 60, scale: 'major', prog: [0, 5, 3, 4], progB: [3, 0, 1, 4], lead: 'square', drums: 'bounce', seed: 23, gain: 0.85 },
  snake:   { bpm: 116, root: 62, scale: 'dorian', prog: [0, 3, 0, 6], progB: [5, 6, 3, 4], lead: 'triangle', drums: 'groove', seed: 37, gain: 1 },
  breakout:{ bpm: 136, root: 52, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 5, 6, 4], lead: 'sawtooth', drums: 'synth', seed: 41, gain: 0.8 },
  kart:    { bpm: 162, root: 53, scale: 'major', prog: [0, 4, 5, 3], progB: [1, 4, 0, 5], lead: 'sawtooth', drums: 'drive', seed: 53, gain: 0.6 },
  runner:  { bpm: 142, root: 55, scale: 'mixo', prog: [0, 6, 3, 0], progB: [5, 6, 0, 4], lead: 'square', drums: 'drive', seed: 67, gain: 0.85 },
  'runner-boss': { bpm: 166, root: 52, scale: 'harm', prog: [0, 0, 5, 4], progB: [3, 3, 5, 4], lead: 'sawtooth', drums: 'boss', seed: 71, gain: 0.8 },
  // 카트: 트랙마다 전용 곡 (hype = 빠른 16분 베이스 · 화음 멜로디 · 드럼 필인 · 심벌)
  'kart-sunny':     { bpm: 170, root: 53, scale: 'major', prog: [0, 4, 5, 3], progB: [3, 4, 2, 5], lead: 'square', drums: 'race', seed: 101, gain: 0.8, hype: true },
  'kart-canyon':    { bpm: 172, root: 52, scale: 'mixo', prog: [0, 6, 3, 0], progB: [3, 6, 4, 4], lead: 'sawtooth', drums: 'race', seed: 113, gain: 0.8, hype: true },
  'kart-neon':      { bpm: 176, root: 49, scale: 'minor', prog: [0, 5, 2, 6], progB: [5, 6, 0, 4], lead: 'sawtooth', drums: 'club', seed: 127, gain: 0.8, hype: true },
  'kart-snow':      { bpm: 168, root: 50, scale: 'major', prog: [0, 5, 3, 4], progB: [1, 4, 5, 4], lead: 'triangle', drums: 'race', seed: 131, gain: 0.85, hype: true, bell: true },
  'kart-skygarden': { bpm: 174, root: 57, scale: 'major', prog: [3, 4, 2, 5], progB: [0, 4, 5, 3], lead: 'square', drums: 'club', seed: 149, gain: 0.8, hype: true },
  'kart-volcano':   { bpm: 182, root: 52, scale: 'harm', prog: [0, 5, 3, 4], progB: [0, 0, 5, 4], lead: 'sawtooth', drums: 'boss', seed: 157, gain: 0.8, hype: true },
  bridge:  { bpm: 92, root: 60, scale: 'major', prog: [0, 4, 5, 3], progB: [3, 4, 2, 5], lead: 'sine', drums: 'soft', seed: 83, gain: 1, penta: true },
};

// 드럼 패턴 (16칸): k 킥 · s 스네어 · h 하이햇
const DRUMS = {
  drive:  { k: [0, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
  bounce: { k: [0, 6, 8], s: [4, 12], h: [2, 6, 10, 14] },
  groove: { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: true },
  synth:  { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] },
  boss:   { k: [0, 3, 8, 11], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  soft:   { k: [0], s: [], h: [4, 12] },
  race:   { k: [0, 6, 8, 14], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  club:   { k: [0, 4, 8, 12], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
};
// 멜로디 리듬 틀: [시작 칸, 길이(칸)]
const RHYTHMS = [
  [[0, 2], [2, 2], [4, 3], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 3]],
  [[0, 4], [4, 2], [6, 1], [7, 1], [8, 4], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
];

// 신나는 곡용 리듬: 16분음표가 많고 당김음
const HYPE_RHYTHMS = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]],
  [[0, 2], [2, 1], [3, 2], [5, 1], [6, 2], [8, 2], [10, 1], [11, 2], [13, 1], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 1], [9, 1], [10, 1], [11, 1], [12, 4]],
  [[0, 1], [2, 1], [3, 1], [4, 1], [6, 2], [8, 1], [10, 1], [11, 1], [12, 1], [14, 2]],
  [[0, 2], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 3], [11, 1], [12, 2], [14, 2]],
];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 곡 만들기 → 칸(16분음표)마다 연주할 음 목록 */
export function compose(def) {
  const R = rng(def.seed), sc = SCALES[def.scale];
  const pitch = (deg, oct = 0) => { const o = Math.floor(deg / sc.length); return def.root + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * (o + oct); };
  const penta = new Set([0, 1, 2, 4, 5]); // 장음계에서 4·7음을 뺀 5음
  const bars = [...def.prog, ...def.prog, ...def.progB, ...def.prog];
  const steps = Array.from({ length: bars.length * 16 }, () => []);
  // 멜로디: 앞 4마디를 만들고 반복하되 일부 변주
  let deg = 4 + Math.floor(R() * 3);
  const phrase = (chords) => chords.map((ch, bi) => {
    const RS = def.hype ? HYPE_RHYTHMS : RHYTHMS;
    const rh = RS[Math.floor(R() * RS.length)], notes = [];
    for (const [st, len] of rh) {
      const tones = [ch, ch + 2, ch + 4, ch + 7]; // 화음 구성음 (7 = 한 옥타브 위 근음)
      if (st % 4 === 0) deg = tones.reduce((b, t) => (Math.abs(t + 7 - deg) < Math.abs(b - deg) ? t + 7 : b), tones[0] + 7);
      else deg += [-2, -1, -1, 1, 1, 2][Math.floor(R() * 6)];
      deg = Math.max(2, Math.min(13, deg));
      if (def.penta) while (!penta.has(((deg % 7) + 7) % 7)) deg += 1;
      if (R() < 0.12 && st % 4) continue; // 가끔 쉼표
      notes.push({ st, len, deg });
    }
    if (bi === chords.length - 1) notes.push({ st: 12, len: 4, deg: ch + 7 }); // 프레이즈 끝은 화음 근음으로
    return notes.filter((n, i, a) => a.findIndex((m) => m.st === n.st) === i);
  });
  const A = phrase(def.prog), B = phrase(def.progB);
  const A2 = A.map((b, i) => (i === 3 ? phrase([def.prog[3]])[0] : b));
  const melody = [...A, ...A2, ...B, ...A];
  bars.forEach((ch, b) => {
    const base = b * 16, dr = DRUMS[def.drums];
    for (const n of melody[b]) {
      steps[base + n.st].push({ i: 'lead', f: hz(pitch(n.deg, 1)), len: n.len });
      if (def.hype) steps[base + n.st].push({ i: 'harm', f: hz(pitch(n.deg - 2, 1)), len: n.len }); // 3도 아래 화음
      if (def.bell && n.len >= 2) steps[base + n.st].push({ i: 'bell', f: hz(pitch(n.deg, 2)), len: 2 }); // 종소리 (눈꽃)
    }
    // 베이스: 신나는 곡은 16분음표로 근음·옥타브를 쿵쿵 / 보통 곡은 8분음표 / 부드러운 곡은 2분음표
    if (def.hype) for (let s = 0; s < 16; s++) steps[base + s].push({ i: 'bass', f: hz(pitch(ch, -1) + (s % 4 === 2 ? 12 : 0)), len: 1, soft: s % 2 === 1 });
    else if (def.drums === 'soft') { steps[base].push({ i: 'bass', f: hz(pitch(ch, -1)), len: 8 }); steps[base + 8].push({ i: 'bass', f: hz(pitch(ch + 4, -1)), len: 8 }); }
    else for (let s = 0; s < 16; s += 2) steps[base + s].push({ i: 'bass', f: hz(pitch(ch, -1) + (s % 4 === 2 ? 12 : 0)), len: 2 });
    // 아르페지오: 화음 구성음을 위아래로
    const arp = [ch, ch + 2, ch + 4, ch + 2];
    for (let s = 0; s < 16; s += def.drums === 'soft' ? 4 : 2) steps[base + s].push({ i: 'arp', f: hz(pitch(arp[(s / 2) % 4], 0)), len: 1 });
    const fill = def.hype && b % 4 === 3; // 4마디마다 스네어 필인
    for (const s of dr.k) if (!(fill && s > 8)) steps[base + s].push({ i: 'kick' });
    for (const s of dr.s) steps[base + s].push({ i: 'snare' });
    if (fill) for (const s of [10, 11, 13, 14, 15]) steps[base + s].push({ i: 'snare', soft: s < 13 });
    for (const s of dr.h) if (!(fill && s > 12)) steps[base + s].push({ i: 'hat', open: s % 8 === 6, soft: def.hype && s % 2 === 1 });
    if (def.hype && b % 4 === 0) steps[base].push({ i: 'crash' }); // 4마디마다 심벌
  });
  return { steps, swing: !!DRUMS[def.drums].swing };
}

let noiseBuf = null;
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

  tick() {
    const ctx = sfx.context;
    if (!ctx || !this.out) return;
    const stepDur = 60 / (this.def.bpm * this.tempo) / 4;
    while (this.next < ctx.currentTime + 0.12) {
      const swing = this.song.swing && this.step % 2 ? stepDur * 0.33 : 0;
      for (const n of this.song.steps[this.step]) this.voice(ctx, n, this.next + swing, stepDur);
      this.next += stepDur;
      this.step = (this.step + 1) % this.song.steps.length;
    }
  },

  voice(ctx, n, t, sd) {
    const out = this.out;
    if (n.i === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      return;
    }
    if (n.i === 'snare' || n.i === 'hat' || n.i === 'crash') {
      noiseBuf ??= (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf;
      f.type = n.i === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = n.i === 'hat' ? 7000 : n.i === 'crash' ? 4500 : 1800;
      const len = n.i === 'crash' ? 0.9 : n.i === 'hat' ? (n.open ? 0.09 : 0.035) : 0.13;
      const vol = (n.i === 'crash' ? 0.16 : n.i === 'hat' ? 0.12 : 0.35) * (n.soft ? 0.5 : 1);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + len + 0.02);
      return;
    }
    const type = n.i === 'lead' ? this.def.lead : n.i === 'harm' ? 'square' : n.i === 'bell' ? 'sine' : n.i === 'bass' ? (this.def.hype ? 'sawtooth' : 'triangle') : 'square';
    let vol = n.i === 'lead' ? (type === 'sine' ? 0.32 : type === 'triangle' ? 0.3 : 0.13) : n.i === 'bass' ? (this.def.hype ? 0.16 : 0.34) : n.i === 'harm' ? 0.05 : n.i === 'bell' ? 0.12 : 0.045;
    if (n.soft) vol *= 0.6;
    const dur = n.len * sd * (n.i === 'arp' ? 0.9 : 0.92);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(n.f, t);
    if (n.i === 'lead' && n.len >= 3) { // 긴 음에는 살짝 비브라토
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = n.f * 0.006;
      lfo.connect(lg).connect(o.frequency); lfo.start(t + 0.1); lfo.stop(t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.03, 0.08);
    g.gain.setTargetAtTime(0.0001, t + dur - 0.02, 0.025);
    let node = o.connect(g);
    if (type === 'sawtooth') { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = n.i === 'bass' ? 650 : 2200; node = g.connect(lp); }
    node.connect(out);
    o.start(t); o.stop(t + dur + 0.12);
  },
};

// 첫 입력으로 오디오가 켜지면 기다리던 곡 시작
sfx.onUnlock = () => music.start();
