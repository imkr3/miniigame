// WebAudio 신시사이저 효과음 (외부 음원 파일 없음)
const PRESETS = {
  move:    { type: 'square',   f: [220, 220], d: 0.03, v: 0.025 },
  rotate:  { type: 'square',   f: [440, 560], d: 0.05, v: 0.035 },
  drop:    { type: 'triangle', f: [220, 70],  d: 0.12, v: 0.15 },
  lock:    { type: 'triangle', f: [160, 90],  d: 0.06, v: 0.08 },
  clear:   { type: 'square',   notes: [523, 659, 784, 1047], d: 0.07, v: 0.05 },
  eat:     { type: 'square',   f: [520, 880], d: 0.07, v: 0.05 },
  dot:     { type: 'square',   f: [740, 740], d: 0.025, v: 0.02, gap: 0.06 },
  power:   { type: 'sawtooth', f: [180, 900], d: 0.3, v: 0.05 },
  bonus:   { type: 'square',   notes: [784, 988, 1175], d: 0.06, v: 0.05 },
  hit:     { type: 'sawtooth', f: [420, 50],  d: 0.45, v: 0.09 },
  bounce:  { type: 'sine',     f: [520, 520], d: 0.05, v: 0.1 },
  brick:   { type: 'square',   f: [900, 620], d: 0.05, v: 0.05 },
  jump:    { type: 'square',   f: [300, 640], d: 0.11, v: 0.04 },
  land:    { type: 'triangle', f: [120, 70],  d: 0.05, v: 0.06 },
  start:   { type: 'square',   notes: [392, 523, 659], d: 0.07, v: 0.045 },
  levelup: { type: 'square',   notes: [523, 659, 784, 1047, 1319], d: 0.06, v: 0.045 },
  over:    { type: 'triangle', notes: [392, 330, 262, 196], d: 0.14, v: 0.12 },
  tick:    { type: 'square',   f: [1200, 1200], d: 0.02, v: 0.02 },
};

const KEY = 'miniigame:muted';
let ctx = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const lastPlayed = {};

function tone(type, f0, f1, dur, vol, at) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
  },
  /** 브라우저 정책상 사용자 입력 이후에만 소리를 낼 수 있어서, 입력 시마다 호출 */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  },
  play(name) {
    const p = PRESETS[name];
    if (muted || !ctx || !p || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (lastPlayed[name] ?? -1) < (p.gap ?? 0.02)) return;
    lastPlayed[name] = now;
    if (p.notes) p.notes.forEach((f, i) => tone(p.type, f, f, p.d * 1.6, p.v, now + i * p.d));
    else tone(p.type, p.f[0], p.f[1], p.d, p.v, now);
  },
};
