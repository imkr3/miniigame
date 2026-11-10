import { GameBase, roundRect } from '../engine.js';
import { sfx } from '../sfx.js';

// 낙하 블록 퍼즐
// - 회전: SRS 방식 벽차기(킥) + 180° 회전 → T/J/L/S/Z/I 스핀이 자연스럽게 들어감
// - 스핀 판정: T는 3코너 규칙(미니 구분), 나머지는 "회전 직후 좌/우/위로 못 움직임"(올스핀)
// - 점수: 스핀·쿼드 연속 시 Back-to-Back ×1.5, 콤보, 퍼펙트 클리어
const COLS = 10, ROWS = 20, CELL = 24, SIDE = 112;
const BW = COLS * CELL;

// 순서: I O T S Z J L  (회전 상태 0 = 생성 방향)
const SHAPES = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
];
const NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const T = 2, O = 1, I = 0;
const COLORS = ['#38bdf8', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#6b7280']; // 마지막 = 쓰레기 줄
const GARBAGE = 7;
const shadeHex = (hex, d) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + d)).toString(16).padStart(2, '0')).join('');
/** 블록 스킨 그리기 (0,0 ~ s,s) */
function paintCell(c, skin, s, color) {
  switch (skin) {
    case 'jewel': { // 보석: 네 방향 면 + 가운데 평면
      const q = s * 0.25;
      const face = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.fill(); };
      face([[0, 0], [s, 0], [s - q, q], [q, q]], shadeHex(color, 60));
      face([[0, 0], [q, q], [q, s - q], [0, s]], shadeHex(color, 25));
      face([[s, 0], [s, s], [s - q, s - q], [s - q, q]], shadeHex(color, -35));
      face([[0, s], [q, s - q], [s - q, s - q], [s, s]], shadeHex(color, -65));
      c.fillStyle = color; c.fillRect(q, q, s - q * 2, s - q * 2);
      c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(q + 1, q + 1, Math.max(2, s * 0.12), Math.max(2, s * 0.12));
      break;
    }
    case 'pixel': { // 8비트: 각진 칸 + 밝은 왼위 / 어두운 오른아래 테두리
      const b = Math.max(2, Math.round(s / 8));
      c.fillStyle = color; c.fillRect(0, 0, s, s);
      c.fillStyle = shadeHex(color, 70); c.fillRect(0, 0, s, b); c.fillRect(0, 0, b, s);
      c.fillStyle = shadeHex(color, -70); c.fillRect(0, s - b, s, b); c.fillRect(s - b, 0, b, s);
      c.fillStyle = '#fff'; c.fillRect(b, b, b, b);
      break;
    }
    case 'candy': { // 사탕: 둥글고 반짝
      const g = c.createRadialGradient(s * 0.35, s * 0.3, 1, s / 2, s / 2, s * 0.7);
      g.addColorStop(0, shadeHex(color, 90)); g.addColorStop(0.5, color); g.addColorStop(1, shadeHex(color, -50));
      c.fillStyle = g; roundRect(c, 1, 1, s - 2, s - 2, s / 2.6);
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(s * 0.34, s * 0.28, s * 0.14, s * 0.08, -0.5, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'neon': { // 네온: 어두운 속 + 빛나는 테두리
      c.fillStyle = shadeHex(color, -150); roundRect(c, 2, 2, s - 4, s - 4, s / 6);
      c.shadowColor = color; c.shadowBlur = s / 4;
      c.strokeStyle = color; c.lineWidth = Math.max(1.5, s / 12);
      c.beginPath(); c.roundRect?.(3, 3, s - 6, s - 6, s / 6); c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = color; c.globalAlpha = 0.35; c.fillRect(s * 0.3, s * 0.3, s * 0.4, s * 0.4); c.globalAlpha = 1;
      break;
    }
    default: // 기본: 둥근 칸 + 윗면 하이라이트
      c.fillStyle = color;
      roundRect(c, 1, 1, s - 2, s - 2, s / 6);
      c.globalAlpha = 0.25; c.fillStyle = '#fff';
      c.fillRect(3, 3, s - 6, Math.max(2, s / 8));
      c.globalAlpha = 1;
  }
}
// ---- 멀티플레이(배틀) ----
const OPP_W = 156;                                     // 상대 보드 패널 폭
// ---- 대전 공격 규칙 (TETR.IO 테트라 리그 방식) ----
// 기본 공격: 싱글 0 · 더블 1 · 트리플 2 · 쿼드 4 / T-스핀 싱글 2 · 더블 4 · 트리플 6 / T-스핀 미니 싱글 0 · 더블 1
// T 이외 블록 스핀은 '미니' 취급 → 일반 줄 공격량이지만 B2B 는 이어짐
const LINE_ATK = [0, 0, 1, 2, 4];
const TSPIN_ATK = [0, 2, 4, 6, 6];
const MINI_ATK = [0, 0, 1, 2, 4];
const PC_ATK = 5;          // 퍼펙트 클리어(올 클리어) 추가 공격
const SURGE_START = 4;     // B2B 가 이만큼 이어진 뒤 끊기면 서지 발동
const GARBAGE_CAP = 8;     // 한 번 블록을 놓을 때 올라오는 쓰레기 줄 최대 수
const GARBAGE_DELAY = 0.5; // 공격이 도착한 뒤 올라오기까지 시간(초)
/**
 * 공격량 계산
 * - B2B(스핀·쿼드를 연속): 1단계 이상이면 +1
 * - 콤보 배율: 기본 × (1 + 0.25 × 콤보), 기본이 0이면 ln(1 + 1.25 × 콤보) → 소수점 버림
 * - 퍼펙트 클리어 +5
 * @returns {number}
 */
export function attackFor({ n, spin, b2b, combo, perfect }) {
  if (n <= 0) return 0;
  let base = spin ? (spin.name === 'T' ? (spin.mini ? MINI_ATK[n] : TSPIN_ATK[n]) : MINI_ATK[n]) : LINE_ATK[n];
  if (b2b >= 1) base += 1;
  const c = Math.max(0, combo);
  let atk = base > 0 ? base * (1 + 0.25 * c) : Math.log1p(1.25 * c);
  atk = Math.floor(atk + 1e-9);
  if (perfect) atk += PC_ATK;
  return atk;
}
/** 같은 시드면 같은 블록 순서 (모두 공평하게) */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// SRS 킥 테이블 (x 오른쪽 +, y 위쪽 +). 키 = "회전 전 상태 → 회전 후 상태"
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
// I 블록은 TETR.IO 와 같은 SRS+ 킥 (좌우 대칭이라 I 스핀·벽 옆 회전이 더 자연스러움)
const KICKS_I = {
  '01': [[0, 0], [1, 0], [-2, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [2, -1], [-1, 2]],
};
// 180° 회전 킥 (회전 전 상태 기준) - TETR.IO 와 같음
const KICKS_180 = {
  0: [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  1: [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  2: [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  3: [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};
const KICKS_I180 = { 0: [[0, 0], [0, 1]], 1: [[0, 0], [1, 0]], 2: [[0, 0], [0, -1]], 3: [[0, 0], [-1, 0]] }; // I 블록 180°

const NORMAL_SCORE = [0, 100, 300, 500, 800];
const SPIN_SCORE = [400, 800, 1200, 1600, 2000];
const MINI_SCORE = [100, 200, 400, 400, 400];
const CLEAR_NAME = ['', '싱글', '더블', '트리플', '쿼드'];
const LOCK_RESETS = 15;

const rotateCW = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
const rotateCCW = (m) => m[0].map((_, i) => m.map((row) => row[row.length - 1 - i]));
// 마라톤 미션: 하나씩 주어지고, 해내면 보너스 (레벨 × 500)
const MISSIONS = [
  { text: '2줄 한 번에', test: (c) => c.n === 2 },
  { text: '3줄 한 번에', test: (c) => c.n === 3 },
  { text: '4줄 한 번에', test: (c) => c.n === 4 },
  { text: 'T-스핀으로 줄 지우기', test: (c) => c.spin?.name === 'T' && c.n > 0 },
  { text: 'T 말고 다른 블록 스핀', test: (c) => c.spin && c.spin.name !== 'T' && c.n > 0, cond: (g) => g.cfg.spin === 'all' },
  { text: '3콤보 이상', test: (c) => c.combo >= 3 },
  { text: 'B2B 이어가기', test: (c) => c.b2b >= 1 },
];
const BAG_OPTIONS = [['7bag', '7-가방 (기본)'], ['14bag', '14-가방'], ['7+1', '7+1 가방'], ['7+2', '7+2 가방'], ['pairs', '페어 (2종씩)'], ['classic', '클래식 (무작위·연속 방지)'], ['mayhem', '난장판 (완전 무작위)']];
const SPRINT_LINES = 40, ULTRA_TIME = 120, DIG_ROWS = 10;
const fmtCs = (cs) => `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default class Blocks extends GameBase {
  static meta = {
    id: 'blocks',
    title: '블록 낙하',
    description: '가로줄을 채워 없애세요. 회전으로 틈에 끼워 넣는 "스핀"과 연속 쿼드는 점수가 크게 올라요. ⚙ 설정에서 모드(마라톤·40줄 스프린트·2분 울트라)와 시작 레벨을 고를 수 있어요.',
    controls: '←→ 이동 · ↓ 소프트드롭 · Space 하드드롭 · ↑/X 회전 · Z 반대 회전 · A 180° · C/Shift 보관 (⚙에서 변경)',
    touchControls: '탭 회전 · 좌우로 끌기 이동 · 아래로 끌기 빠르게 · 위로 밀기 보관',
  };
  static bindings = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    down: ['ArrowDown'],
    action: ['Space'],
    up: ['ArrowUp', 'KeyX'],
    rotl: ['KeyZ', 'ControlLeft'],
    rot180: ['KeyA'],
    hold: ['KeyC', 'ShiftLeft'],
  };
  static actionLabels = {
    left: '왼쪽 이동', right: '오른쪽 이동', down: '소프트 드롭', action: '하드 드롭 / 시작',
    up: '시계 방향 회전', rotl: '반시계 회전', rot180: '180° 회전', hold: '보관',
  };
  static settings = [
    { id: 'mode', label: '모드', type: 'select', default: 'marathon',
      options: [['marathon', '마라톤 (끝까지)'], ['sprint', '스프린트 (40줄 최단 시간)'], ['ultra', '울트라 (2분 최고 점수)'], ['dig', '땅파기 (쓰레기 10줄 최단 시간)']], tip: '모드마다 기록이 따로 저장돼요. 새 게임부터 적용' },
    { id: 'bag', label: '블록 순서 (가방)', type: 'select', default: '7bag', options: BAG_OPTIONS, tip: '7-가방: 7종이 한 번씩 섞여 나옴 (TETR.IO 기본). 기본이 아니면 기록이 따로 저장돼요. 새 게임부터 적용' },
    { id: 'skin', label: '블록 모양', type: 'select', default: 'classic', options: [['classic', '기본'], ['jewel', '보석'], ['pixel', '8비트'], ['candy', '사탕'], ['neon', '네온']] },
    { id: 'startLevel', label: '시작 레벨', type: 'range', min: 1, max: 20, default: 1, unit: '',
      tip: '높을수록 처음부터 빠르게 떨어짐 (점수도 레벨만큼 곱해짐). 새 게임부터 적용' },
    { id: 'linesPerLevel', label: '레벨업 줄 수', type: 'range', min: 4, max: 15, default: 8, unit: '줄', tip: '이만큼 줄을 지울 때마다 레벨 +1' },
    { id: 'das', label: 'DAS (연속 이동 시작)', type: 'range', min: 0, max: 300, step: 5, default: 160, unit: 'ms',
      tip: '좌우 키를 누르고 있을 때 연속 이동이 시작되기까지의 시간' },
    { id: 'arr', label: 'ARR (연속 이동 간격)', type: 'range', min: 0, max: 100, step: 5, default: 40, unit: 'ms',
      format: (v) => (v === 0 ? '즉시' : `${v}ms`), tip: '0이면 벽까지 바로 이동' },
    { id: 'sdf', label: '소프트 드롭 간격', type: 'range', min: 0, max: 100, step: 5, default: 35, unit: 'ms',
      format: (v) => (v === 0 ? '즉시' : `${v}ms`), tip: '0이면 누르는 순간 바닥까지 (고정은 안 됨)' },
    { id: 'lockDelay', label: '고정 대기 시간', type: 'range', min: 200, max: 1500, step: 50, default: 500, unit: 'ms',
      tip: '바닥에 닿은 뒤 고정될 때까지 여유. 길수록 스핀 넣기 쉬움' },
    { id: 'spin', label: '스핀 판정', type: 'select', default: 'all',
      options: [['all', '모든 블록 (올스핀)'], ['t', 'T 블록만'], ['off', '끄기']] },
    { id: 'previews', label: '미리보기 개수', type: 'range', min: 1, max: 5, default: 5, unit: '개' },
    { id: 'ghost', label: '착지 위치 표시', type: 'toggle', default: true },
  ];
  static pad = {
    left: 'dpad', labels: { up: '회전' },
    buttons: [
      { action: 'rotl', label: '역회전' }, { action: 'rot180', label: '180°' },
      { action: 'hold', label: '보관' }, { action: 'action', label: '낙하', primary: true },
    ],
  };
  static gestures = { tap: 'up', left: 'left', right: 'right', down: 'down', up: 'hold' };

  static multiplayer = { min: 2, max: 8, label: '블록 배틀' };

  constructor(container, opts = {}) {
    super(container, { width: BW + SIDE, height: ROWS * CELL, ...opts });
  }

  // ---------------- 멀티플레이 (배틀) ----------------
  lobbyConfig() {
    return {
      settings: [
        { id: 'startLevel', label: '시작 레벨 (낙하 속도)', type: 'range', min: 1, max: 15, default: 3 },
        { id: 'bag', label: '블록 순서 (가방)', type: 'select', default: '7bag', options: BAG_OPTIONS },
      ],
      info: [],
    };
  }

  startMulti(net, start) {
    this.leaveMulti();
    const me = net.id;
    this.multi = {
      net, me, seed: start.seed, settings: start.settings ?? {}, dead: false, place: 0, over: false,
      players: start.players,
      opp: new Map(start.players.filter((p) => p.id !== me).map((p) => [p.id, { name: p.name, board: '', alive: true, place: 0, lines: 0 }])),
      alive: new Set(start.players.map((p) => p.id)),
    };
    this.mpView = this.multi;
    this.offNet = [net.on('msg', (from, d) => this.onNet(from, d)), net.on('left', (id) => this.playerDied(id))];
    this.noAutoPause = true;
    if (this.width !== BW + SIDE + OPP_W) { this.width = BW + SIDE + OPP_W; this._layout(); }
    this.start();
  }

  leaveMulti() {
    this.offNet?.forEach((off) => off());
    this.offNet = null;
    this.multi = null;
    this.noAutoPause = false;
  }

  onNetClosed() { if (this.multi && !this.multi.over) this.endMulti(); }

  onNet(from, d) {
    const m = this.multi;
    if (!m || !d) return;
    const o = m.opp.get(from);
    if (d.k === 'board' && o) { o.board = d.b; o.lines = d.l; o.incoming = d.g; }
    else if (d.k === 'atk' && !m.dead && !m.over) {
      this.incoming.push({ n: d.n, t: GARBAGE_DELAY, from });
      this.sound('hit');
      this.floatText(BW / 2, 40, `${o?.name ?? '?'} 님의 공격 ${d.n}줄!`, '#fca5a5', 14);
    } else if (d.k === 'dead') this.playerDied(from);
  }

  /** 줄 공격 보내기: 살아 있는 상대 중 무작위 한 명 */
  sendAttack(n) {
    const m = this.multi;
    const targets = [...m.opp.entries()].filter(([, o]) => o.alive);
    if (!targets.length) return;
    const [id, o] = targets[Math.floor(Math.random() * targets.length)];
    m.net.relay({ k: 'atk', n, to: id });
    this.stats.sent = (this.stats.sent ?? 0) + n;
    this.floatText(BW / 2, 70, `→ ${o.name} 에게 ${n}줄 공격!`, '#86efac', 14);
  }

  /** 받은 쓰레기 줄을 아래에서 밀어 올림 (구멍은 묶음마다 한 칸) */
  applyGarbage() {
    let budget = GARBAGE_CAP;
    while (this.incoming.length && this.incoming[0].t <= 0 && budget > 0) {
      const g = this.incoming[0];
      const k = Math.min(g.n, budget);
      const hole = Math.floor(Math.random() * COLS);
      for (let i = 0; i < k; i++) {
        const top = this.board.shift();
        if (top.some((c) => c >= 0)) this.overflow = true;
        const row = Array(COLS).fill(GARBAGE); row[hole] = -1;
        this.board.push(row);
      }
      g.n -= k; budget -= k;
      if (g.n <= 0) this.incoming.shift();
      this.shake(3, 0.15);
    }
  }

  encodeBoard() {
    const b = this.board.map((r) => r.map((c) => (c < 0 ? '.' : c)).join(''));
    const p = this.piece;
    if (p) p.shape.forEach((row, y) => row.forEach((v, x) => {
      const yy = p.y + y; if (v && yy >= 0 && yy < ROWS) b[yy] = b[yy].slice(0, p.x + x) + p.type + b[yy].slice(p.x + x + 1);
    }));
    return b.join('');
  }

  netTick(dt) {
    const m = this.multi;
    for (const g of this.incoming) g.t -= dt;
    this.sendT = (this.sendT ?? 0) + dt;
    if (this.sendT >= 0.25 && !m.dead) {
      this.sendT = 0;
      m.net.relay({ k: 'board', b: this.encodeBoard(), l: this.lines, g: this.incoming.reduce((a, g) => a + g.n, 0) });
    }
  }

  /** 꼭대기까지 쌓임 */
  topOut() {
    if (!this.multi) { if (this.mode === 'sprint' || this.mode === 'dig') this.recordValue = 0; return this.gameOver('게임 오버', this.statsText()); }
    const m = this.multi;
    if (m.dead) return;
    m.dead = true;
    m.place = m.alive.size;
    m.alive.delete(m.me);
    this.piece = null;
    m.net.relay({ k: 'dead' });
    this.sound('over');
    this.shake(8);
    this.checkEnd();
  }

  playerDied(id) {
    const m = this.multi;
    if (!m || !m.alive.has(id)) return;
    const o = m.opp.get(id);
    if (o) { o.alive = false; o.place = m.alive.size; }
    m.alive.delete(id);
    if (o && !m.over) this.floatText(BW / 2, 100, `${o.name} 탈락!`, '#fde68a', 16);
    this.checkEnd();
  }

  checkEnd() {
    const m = this.multi;
    if (m.over || m.alive.size > 1) return;
    if (m.alive.has(m.me)) m.place = 1;
    else for (const [id, o] of m.opp) if (m.alive.has(id)) o.place = 1;
    this.endMulti();
  }

  endMulti() {
    const m = this.multi;
    m.over = true;
    if (!m.place) m.place = m.alive.size || 1;
    if (m.net.isHost) m.net.end();
    const total = m.players.length;
    this.setScore(Math.round((total - m.place + 1) / total * 1000) + (this.stats.sent ?? 0) * 10);
    this.leaveMulti();
    this.mpView = m;
    this.gameOver(m.place === 1 ? '🏆 승리!' : `${m.place}위`, `${total}명 배틀 · 보낸 공격 ${this.stats.sent ?? 0}줄 · ${this.lines}줄 · ${fmtTime(this.time)}`, { multi: true });
  }

  restart() { if (this.multi) return; super.restart(); }

  init() {
    if (!this.multi) {
      this.mpView = null;
      if (this.width !== BW + SIDE) { this.width = BW + SIDE; this._layout(); }
    }
    this.rand = this.multi ? seededRandom(this.multi.seed) : Math.random;
    this.incoming = [];
    this.surgeReady = 0;
    this.overflow = false;
    this.sprintDone = false;
    this.countdown = this.multi ? 3 : 0;
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.bag = [];
    this.lastPulled = -1;
    this.bagKind = this.multi ? (this.multi.settings.bag ?? '7bag') : this.cfg.bag;
    this.queue = Array.from({ length: 5 }, () => this.pull());
    this.holdType = -1;
    this.canHold = true;
    this.lines = 0;
    this.mode = this.multi ? 'battle' : this.cfg.mode;
    const bs = this.bagKind && this.bagKind !== '7bag' ? `-${this.bagKind}` : ''; // 가방 방식이 다르면 기록 따로
    if (this.mode === 'sprint') this.setRecord(`blocks-sprint${bs}`, { lower: true, fmt: fmtCs });
    else if (this.mode === 'ultra') this.setRecord(`blocks-ultra${bs}`);
    else if (this.mode === 'dig') this.setRecord(`blocks-dig${bs}`, { lower: true, fmt: fmtCs });
    else this.setRecord(`blocks${bs}`);
    this.digDone = false;
    this.mission = null; this.missionsDone = 0;
    if (this.mode === 'marathon') this.newMission();
    if (this.mode === 'dig') { // 바닥에 구멍 하나씩 뚫린 쓰레기 줄 (구멍 위치가 계속 바뀜)
      let hole = -1;
      for (let i = 0; i < DIG_ROWS; i++) {
        let h; do h = Math.floor(Math.random() * COLS); while (h === hole);
        hole = h;
        const row = Array(COLS).fill(GARBAGE); row[hole] = -1;
        this.board[ROWS - 1 - i] = row;
      }
    }
    this.startLevel = this.multi ? (this.multi.settings.startLevel ?? 3) : this.cfg.startLevel;
    this.level = this.startLevel;
    this.gravityT = 0;
    this.shift = null;     // 좌우 연속 이동 상태
    this.softT = 0;
    this.combo = -1;       // 연속으로 줄을 지운 횟수
    this.b2b = -1;         // 어려운 클리어(스핀·쿼드) 연속 횟수
    this.clearing = null;  // 줄 삭제 연출 중
    this.callout = null;   // 화면 중앙 큰 글씨 (T-스핀 더블 등)
    this.stats = { pieces: 0, spins: 0, maxCombo: 0 };
    this.spawn();
    this.updateInfo();
  }

  /**
   * 다음 블록 뽑기 (TETR.IO 의 가방 방식들)
   * - 7bag: 7종을 한 번씩 섞어서 순서대로 (기본, 같은 블록 가뭄 최대 12개)
   * - 14bag: 7종을 두 번씩 넣어 섞음
   * - 7+1 / 7+2: 7-가방에 무작위 블록 1·2개를 더 넣어 섞음
   * - pairs: 서로 다른 블록 2종을 3개씩(총 6개) 섞음
   * - classic: 완전 무작위, 바로 전과 같으면 한 번 다시 뽑음
   * - mayhem: 완전 무작위 (난장판)
   */
  pull() {
    const rnd = (n) => Math.floor(this.rand() * n);
    const kind = this.bagKind ?? '7bag';
    if (kind === 'classic' || kind === 'mayhem') {
      let t = rnd(7);
      if (kind === 'classic' && t === this.lastPulled) t = rnd(7);
      this.lastPulled = t;
      return t;
    }
    if (!this.bag.length) {
      const all = [0, 1, 2, 3, 4, 5, 6];
      if (kind === '14bag') this.bag = [...all, ...all];
      else if (kind === '7+1') this.bag = [...all, rnd(7)];
      else if (kind === '7+2') this.bag = [...all, rnd(7), rnd(7)];
      else if (kind === 'pairs') {
        const a = rnd(7); let b = rnd(6); if (b >= a) b++;
        this.bag = [a, a, a, b, b, b];
      } else this.bag = all;
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawn(type) {
    if (type === undefined) { type = this.queue.shift(); this.queue.push(this.pull()); }
    const shape = SHAPES[type];
    this.piece = { type, shape, r: 0, x: Math.floor((COLS - shape[0].length) / 2), y: type === I ? -1 : 0 };
    this.lockT = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    this.lastMove = null;
    if (this.collides(shape, this.piece.x, this.piece.y) || this.overflow) this.topOut();
  }

  collides(shape, px, py) {
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const bx = px + x, by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.board[by][bx] >= 0) return true;
      }
    return false;
  }

  get grounded() { const p = this.piece; return this.collides(p.shape, p.x, p.y + 1); }

  // 바닥에 닿은 상태에서 움직이면 고정 대기 시간 리셋 (횟수 제한)
  touched() {
    if (this.lockT > 0 && this.lockResets < LOCK_RESETS) { this.lockT = 0; this.lockResets++; }
  }

  tryMove(dx, dy) {
    const p = this.piece;
    if (this.collides(p.shape, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    this.lastMove = null; // 이동하면 스핀 조건 해제
    if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; } // 더 내려가면 리셋 횟수 회복
    if (dx) this.touched();
    return true;
  }

  /** dir: 1 시계, -1 반시계, 2 = 180° */
  rotate(dir) {
    const p = this.piece;
    if (p.type === O) return;
    const to = (p.r + dir + 4) % 4;
    const shape = dir === 1 ? rotateCW(p.shape) : dir === -1 ? rotateCCW(p.shape) : rotateCW(rotateCW(p.shape));
    const kicks = dir === 2 ? (p.type === I ? KICKS_I180 : KICKS_180)[p.r] : (p.type === I ? KICKS_I : KICKS_JLSTZ)[`${p.r}${to}`];
    for (let k = 0; k < kicks.length; k++) {
      const nx = p.x + kicks[k][0], ny = p.y - kicks[k][1];
      if (this.collides(shape, nx, ny)) continue;
      Object.assign(p, { shape, r: to, x: nx, y: ny });
      this.lastMove = { rotate: true, kick: k, dir };
      this.touched();
      // 스핀 조건이 만들어지면 소리로 알려줌
      this.sound(this.detectSpin() ? 'spin' : 'rotate');
      return;
    }
  }

  /** 현재 위치에서 고정하면 스핀인지 판정 → { name, mini } | null */
  detectSpin() {
    const p = this.piece, mode = this.cfg.spin;
    if (!this.lastMove?.rotate || mode === 'off') return null;
    if (p.type === T) {
      const occ = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y][x] >= 0);
      const cx = p.x + 1, cy = p.y + 1;
      const c = [occ(cx - 1, cy - 1), occ(cx + 1, cy - 1), occ(cx + 1, cy + 1), occ(cx - 1, cy + 1)]; // ↖ ↗ ↘ ↙
      if (c.filter(Boolean).length >= 3) {
        const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r]; // T가 향한 쪽 두 모서리
        // TST·핀 킥(옆으로 1, 아래로 2 칸 들어가는 마지막 킥)은 앞 모서리가 비어도 정식 T-스핀
        const tstKick = this.lastMove.dir !== 2 && this.lastMove.kick === 4 && (p.r === 1 || p.r === 3);
        return { name: 'T', mini: !((c[front[0]] && c[front[1]]) || tstKick) };
      }
      // 모서리 3개는 안 되지만 꼼짝 못 하는 T = T-스핀 미니 (TETR.IO 와 같음)
      return mode === 'all' && this.immobile() ? { name: 'T', mini: true } : null;
    }
    if (mode !== 'all') return null;
    // 올스핀: 상하좌우 어느 쪽으로도 못 움직이면 스핀 (T 말고는 미니 - TETR.IO 기본 규칙)
    return this.immobile() ? { name: NAMES[p.type], mini: true } : null;
  }

  immobile() {
    const p = this.piece;
    return this.collides(p.shape, p.x - 1, p.y) && this.collides(p.shape, p.x + 1, p.y) && this.collides(p.shape, p.x, p.y - 1) && this.collides(p.shape, p.x, p.y + 1);
  }

  hold() {
    if (!this.canHold) return;
    const cur = this.piece.type;
    if (this.holdType < 0) { this.holdType = cur; this.spawn(); }
    else { const t = this.holdType; this.holdType = cur; this.spawn(t); }
    this.canHold = false;
    this.sound('move');
  }

  lock() {
    const p = this.piece;
    const spin = this.detectSpin();
    p.shape.forEach((row, y) => row.forEach((v, x) => {
      if (v && p.y + y >= 0) this.board[p.y + y][p.x + x] = p.type;
    }));
    this.stats.pieces++;
    if (p.shape.some((row, y) => row.some((v) => v && p.y + y < 0))) return this.topOut();

    const full = [];
    this.board.forEach((row, y) => { if (row.every((c) => c >= 0)) full.push(y); });
    const n = full.length;
    this.canHold = true;
    if (spin) this.stats.spins++;

    // 점수 계산
    let base = spin ? (spin.mini ? MINI_SCORE[n] : SPIN_SCORE[n]) : NORMAL_SCORE[n];
    let b2bText = '';
    if (n > 0) {
      const hard = n >= 4 || !!spin;
      if (hard) {
        this.b2b++;
        if (this.b2b > 0) { base *= 1.5; b2bText = `B2B ×${this.b2b}`; }
      } else {
        if (this.b2b >= SURGE_START) this.surgeReady = this.b2b; // 서지: 이번 클리어와 함께 발사
        this.b2b = -1;
      }
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    } else {
      this.combo = -1;
    }
    let gained = Math.round(base * this.level) + Math.max(0, this.combo) * 50 * this.level;
    if (this.mission && this.mission.test({ n, spin, combo: this.combo, b2b: this.b2b })) {
      const bonus = 500 * this.level;
      gained += bonus;
      this.missionsDone++;
      this.floatText(BW / 2, ROWS * CELL / 2 - 40, `🎯 미션 성공! +${bonus}`, '#86efac', 18);
      this.sound('levelup');
      this.newMission();
    }

    const spinText = spin ? `${spin.name}-스핀${spin.mini ? ' 미니' : ''}` : '';
    const title = [spinText, CLEAR_NAME[n]].filter(Boolean).join(' ');
    if (spin || n >= 4) {
      this.callout = { text: title, sub: [b2bText, this.combo > 0 ? `${this.combo} 콤보` : ''].filter(Boolean).join(' · '),
        color: spin ? COLORS[p.type] : '#fde68a', t: 1.4 };
    }

    if (n === 0) {
      if (gained) this.addScore(gained);
      this.sound(spin ? 'spin' : 'lock');
      if (spin) this.floatText((p.x + p.shape[0].length / 2) * CELL, p.y * CELL, `+${gained}`, COLORS[p.type]);
      if (this.multi) this.applyGarbage(); // 줄을 못 지우면 쌓여 있던 쓰레기 줄이 올라옴
      this.spawn();
      return;
    }

    for (const y of full)
      for (let x = 0; x < COLS; x++)
        this.burst((x + 0.5) * CELL, (y + 0.5) * CELL, { color: COLORS[this.board[y][x]], count: spin ? 5 : 3, speed: 160, life: 0.5 });
    const after = this.board.filter((_, y) => !full.includes(y));
    const perfect = after.every((row) => row.every((c) => c < 0));
    if (perfect) { // 판을 완전히 비우면 보너스
      gained += 2000 * this.level;
      this.callout = { text: '퍼펙트 클리어!', sub: title, color: '#f0abfc', t: 1.8 };
    }
    if (this.multi) {
      // 공격량 = 줄 수 기본값 (스핀·B2B·콤보·퍼펙트 클리어 보너스), 받을 공격부터 상쇄
      // 공격량 (TETR.IO 방식) + 서지: B2B 4단계 이상이 끊기면 모아 둔 만큼 3번에 나눠 발사
      const packets = [attackFor({ n, spin, b2b: this.b2b, combo: this.combo, perfect })];
      if (this.surgeReady) {
        const surge = this.surgeReady;
        this.surgeReady = 0;
        const a = Math.ceil(surge / 3), b2 = Math.ceil((surge - a) / 2);
        packets.push(a, b2, surge - a - b2);
        this.callout = { text: `서지! ${surge}줄`, sub: 'B2B 연쇄 해방', color: '#fb923c', t: 1.6 };
      }
      for (let atk of packets) {
        // 받을 공격부터 상쇄
        while (atk > 0 && this.incoming.length) {
          const g = this.incoming[0], c = Math.min(g.n, atk);
          g.n -= c; atk -= c;
          if (g.n <= 0) this.incoming.shift();
        }
        if (atk > 0) this.sendAttack(atk);
      }
    }
    this.addScore(gained);
    const comboText = this.combo > 0 ? ` ${this.combo}콤보` : '';
    this.floatText(BW / 2, full[0] * CELL, `${spin || n >= 4 ? '' : `${title}${comboText} `}+${gained}`, '#fde68a', 16);
    if (n >= 4 || spin) this.shake(spin ? 5 : 7);
    this.vibrate(spin ? 60 : 40);

    // 줄이 잠깐 번쩍인 뒤 사라지도록 삭제는 update에서
    this.clearing = { rows: full, t: 0.18 };
    this.piece = null;
    this.lines += n;
    if (this.mode === 'sprint' && this.lines >= SPRINT_LINES) this.sprintDone = true;
    const newLevel = this.startLevel + Math.floor(this.lines / this.cfg.linesPerLevel);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.setMusicTempo(1 + Math.min(this.level - 1, 12) * 0.025); // 레벨이 오를수록 음악도 빨라짐
      this.sound('levelup');
      this.floatText(BW / 2, ROWS * CELL / 2 + 40, `레벨 ${this.level}`, '#93c5fd', 22);
    } else if (spin || n >= 4) this.sound('bonus');
    else { const k = Math.pow(1.06, Math.min(Math.max(0, this.combo), 10)); [523, 659, 784].forEach((f, i) => setTimeout(() => sfx.tone(f * k, f * k, 0.09, 0.045), i * 55)); } // 콤보가 이어질수록 높아짐
    this.updateInfo();
  }

  /** 스프린트 완주 / 울트라 시간 종료 */
  checkModeEnd() {
    if (this.sprintDone) {
      this.recordValue = Math.round(this.time * 100);
      this.gameOver(`${SPRINT_LINES}줄 완료!`, `블록 ${this.stats.pieces}개 · 초당 ${(this.stats.pieces / this.time).toFixed(2)}개 · 스핀 ${this.stats.spins}회`);
      return true;
    }
    if (this.digDone) {
      this.recordValue = Math.round(this.time * 100);
      this.gameOver('땅파기 완료!', `블록 ${this.stats.pieces}개 · 초당 ${(this.stats.pieces / this.time).toFixed(2)}개 · 스핀 ${this.stats.spins}회`);
      return true;
    }
    if (this.mode === 'ultra' && this.time >= ULTRA_TIME) {
      this.gameOver('타임 업!', `${this.lines}줄 · 블록 ${this.stats.pieces}개 · 스핀 ${this.stats.spins}회 · 최대 콤보 ${Math.max(0, this.stats.maxCombo)}`);
      return true;
    }
    return false;
  }

  finishClear() {
    const rows = this.clearing.rows;
    this.board = this.board.filter((_, y) => !rows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(-1));
    this.clearing = null;
    if (this.mode === 'dig' && !this.board.some((r) => r.includes(GARBAGE))) { this.digDone = true; return; }
    this.spawn();
  }

  newMission() {
    const pool = MISSIONS.filter((m) => m !== this.mission && (!m.cond || m.cond(this)));
    this.mission = pool[Math.floor(Math.random() * pool.length)];
    this.updateInfo?.();
  }

  statsText() {
    const s = this.stats;
    return `블록 ${s.pieces}개 · ${this.lines}줄 · 스핀 ${s.spins}회 · 최대 콤보 ${Math.max(0, s.maxCombo)} · ${fmtTime(this.time)} · 초당 ${(s.pieces / Math.max(1, this.time)).toFixed(2)}블록${this.missionsDone ? ` · 미션 ${this.missionsDone}개` : ''}`;
  }

  updateInfo() {
    if (this.mode === 'sprint') this.setInfo(`남은 ${Math.max(0, SPRINT_LINES - this.lines)}줄 · ${fmtCs(Math.round(this.time * 100))}`);
    else if (this.mode === 'dig') this.setInfo(`남은 쓰레기 ${this.board.filter((r) => r.includes(GARBAGE)).length}줄 · ${fmtCs(Math.round(this.time * 100))}`);
    else if (this.mode === 'ultra') this.setInfo(`남은 시간 ${fmtTime(Math.max(0, ULTRA_TIME - this.time))} · 레벨 ${this.level}`);
    else this.setInfo(`레벨 ${this.level} · ${this.lines}줄${this.mission ? ` · 🎯 ${this.mission.text}` : ''}`);
  }

  /** 한 칸 떨어지는 데 걸리는 시간(초). 레벨이 오를수록 가파르게 빨라지고 15레벨 무렵엔 거의 즉시 낙하 */
  get gravity() {
    const L = Math.min(this.level, 20);
    return Math.max(0.0008, Math.pow(0.8 - (L - 1) * 0.007, L - 1) * 0.75);
  }

  onAction(action, repeat) {
    if (repeat || !this.piece) return;
    if (this.multi && (this.countdown > 0 || this.multi.dead)) return; // 키 반복은 OS 대신 update의 DAS/ARR로 처리
    const das = this.cfg.das / 1000;
    if (action === 'left' || action === 'right') {
      const dx = action === 'left' ? -1 : 1;
      if (this.tryMove(dx, 0)) this.sound('move');
      this.shift = { dir: action, dx, t: -das };
    } else if (action === 'up') this.rotate(1);
    else if (action === 'rotl') this.rotate(-1);
    else if (action === 'rot180') this.rotate(2);
    else if (action === 'hold') this.hold();
    else if (action === 'down') {
      if (this.tryMove(0, 1)) { this.addScore(1); this.gravityT = 0; }
      this.softT = 0;
    } else if (action === 'action') this.hardDrop();
  }

  hardDrop() {
    const p = this.piece;
    const startY = p.y;
    let d = 0;
    while (!this.collides(p.shape, p.x, p.y + 1)) { p.y++; d++; }
    if (d) this.lastMove = null; // 실제로 떨어졌으면 스핀 아님
    this.addScore(d * 2);
    // 떨어진 궤적 잔상
    this.dropTrail = { x: p.x, from: startY, to: p.y, shape: p.shape, type: p.type, t: 0.15 };
    this.burst((p.x + p.shape[0].length / 2) * CELL, (p.y + p.shape.length) * CELL, { color: COLORS[p.type], count: 10, speed: 90, life: 0.35 });
    this.shake(3, 0.12);
    this.sound('drop');
    this.lock();
  }

  update(dt) {
    if (this.multi) {
      this.netTick(dt);
      if (this.countdown > 0) {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        if (Math.ceil(this.countdown) < before) this.sound(this.countdown <= 0 ? 'start' : 'tick');
        return;
      }
      if (this.multi.dead) return;
    }
    if (this.mode === 'sprint' || this.mode === 'ultra' || this.mode === 'dig') {
      this.infoT = (this.infoT ?? 0) + dt;
      if (this.infoT > 0.05) { this.infoT = 0; this.updateInfo(); }
      if (this.checkModeEnd()) return;
    }
    if (this.callout && (this.callout.t -= dt) <= 0) this.callout = null;
    if (this.dropTrail && (this.dropTrail.t -= dt) <= 0) this.dropTrail = null;
    if (this.clearing) {
      if ((this.clearing.t -= dt) <= 0) this.finishClear();
      return;
    }
    const { das, arr, sdf } = this.cfg;

    // 좌우 길게 누르기 (DAS → ARR)
    if (this.shift && !this.isDown(this.shift.dir)) {
      const other = this.shift.dir === 'left' ? 'right' : 'left';
      this.shift = this.isDown(other) ? { dir: other, dx: -this.shift.dx, t: -das / 1000 } : null;
    }
    if (this.shift) {
      this.shift.t += dt;
      if (this.shift.t >= 0) {
        if (arr <= 0) { while (this.tryMove(this.shift.dx, 0)); }
        else {
          while (this.shift.t >= 0) { this.shift.t -= arr / 1000; if (!this.tryMove(this.shift.dx, 0)) { this.shift.t = 0; break; } }
        }
      }
    }
    // 아래 길게 누르기
    if (this.isDown('down')) {
      if (sdf <= 0) { while (this.tryMove(0, 1)) this.addScore(1); this.gravityT = 0; }
      else {
        this.softT += dt;
        while (this.softT >= sdf / 1000) { this.softT -= sdf / 1000; if (this.tryMove(0, 1)) { this.addScore(1); this.gravityT = 0; } }
      }
    }

    if (this.state !== 'playing') return;
    if (this.grounded) {
      this.lockT += dt;
      if (this.lockT >= this.cfg.lockDelay / 1000) this.lock();
    } else {
      this.lockT = 0;
      this.gravityT += dt;
      while (this.gravityT >= this.gravity) {
        this.gravityT -= this.gravity;
        if (!this.tryMove(0, 1)) { this.gravityT = 0; break; }
      }
    }
  }

  ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this.collides(p.shape, p.x, y + 1)) y++;
    return y;
  }

  /** 블록 한 칸: 스킨별 모양을 (스킨·색·크기)마다 한 번 그려 두고 이미지로 붙임 */
  drawCell(ctx, px, py, size, color, alpha = 1) {
    const skin = this.cfg.skin ?? 'classic';
    ctx.globalAlpha = alpha;
    this.drawCached(ctx, `cell|${skin}|${color}|${size}|`, px, py, size, size, (c) => paintCell(c, skin, size, color));
    ctx.globalAlpha = 1;
  }

  drawMini(ctx, type, cx, cy, size, dim = false) {
    const s = SHAPES[type];
    const rows = s.filter((r) => r.some(Boolean));
    const cols = s[0].map((_, i) => s.some((r) => r[i]));
    const firstCol = cols.indexOf(true), w = cols.filter(Boolean).length;
    const firstRow = s.findIndex((r) => r.some(Boolean));
    s.forEach((row, y) => row.forEach((v, x) => {
      if (v) this.drawCell(ctx, cx - (w * size) / 2 + (x - firstCol) * size, cy - (rows.length * size) / 2 + (y - firstRow) * size, size, COLORS[type], dim ? 0.35 : 1);
    }));
  }

  draw(ctx) {
    // 보드 배경 + 격자 (한 번 그려 두고 재사용)
    this.drawCached(ctx, `blocks-grid2-${this.mode === 'sprint' ? 's' : 'n'}`, 0, 0, BW, ROWS * CELL, (c) => {
      const bg = c.createLinearGradient(0, 0, 0, ROWS * CELL);
      bg.addColorStop(0, '#161a2b'); bg.addColorStop(1, '#0e1018');
      c.fillStyle = bg;
      c.fillRect(0, 0, BW, ROWS * CELL);
      c.strokeStyle = '#1b1f2c';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 1; x < COLS; x++) { c.moveTo(x * CELL + 0.5, 0); c.lineTo(x * CELL + 0.5, ROWS * CELL); }
      for (let y = 1; y < ROWS; y++) { c.moveTo(0, y * CELL + 0.5); c.lineTo(BW, y * CELL + 0.5); }
      c.stroke();
      if (this.mode === 'sprint') { c.fillStyle = 'rgba(250,204,21,.06)'; c.fillRect(0, 0, BW, ROWS * CELL); }
      // 보드 테두리 (은은하게 빛나는 선)
      c.strokeStyle = 'rgba(129,140,248,.55)'; c.lineWidth = 2;
      c.shadowColor = '#6366f1'; c.shadowBlur = 8;
      c.strokeRect(1, 1, BW - 2, ROWS * CELL - 2);
      c.shadowBlur = 0;
    });

    this.board.forEach((row, y) => row.forEach((c, x) => { if (c >= 0) this.drawCell(ctx, x * CELL, y * CELL, CELL, COLORS[c]); }));

    if (this.clearing) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.clearing.t * 30));
      ctx.fillStyle = '#fff';
      for (const y of this.clearing.rows) ctx.fillRect(0, y * CELL, BW, CELL);
      ctx.globalAlpha = 1;
    }

    // 하드드롭 잔상
    const tr = this.dropTrail;
    if (tr) {
      const g = ctx.createLinearGradient(0, tr.from * CELL, 0, tr.to * CELL);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, COLORS[tr.type]);
      ctx.globalAlpha = (tr.t / 0.15) * 0.35;
      ctx.fillStyle = g;
      const cols = tr.shape[0].map((_, i) => tr.shape.some((r) => r[i]));
      cols.forEach((on, i) => { if (on) ctx.fillRect((tr.x + i) * CELL + 2, tr.from * CELL, CELL - 4, (tr.to - tr.from + 1) * CELL); });
      ctx.globalAlpha = 1;
    }

    const p = this.piece;
    if (p && this.state !== 'ready') {
      const gy = this.ghostY();
      // 고정 직전이면 살짝 깜빡임
      const lockFade = this.grounded ? 0.65 + 0.35 * Math.cos(this.lockT * 20) : 1;
      p.shape.forEach((row, y) => row.forEach((v, x) => {
        if (!v) return;
        if (this.cfg.ghost && gy + y >= 0) this.drawCell(ctx, (p.x + x) * CELL, (gy + y) * CELL, CELL, COLORS[p.type], 0.18);
        if (p.y + y >= 0) this.drawCell(ctx, (p.x + x) * CELL, (p.y + y) * CELL, CELL, COLORS[p.type], lockFade === 1 ? 1 : lockFade);
      }));
    }

    // 스핀/쿼드 큰 글씨
    const co = this.callout;
    if (co) {
      const a = Math.min(1, co.t / 0.4);
      const pop = 1 + Math.max(0, co.t - 1.2) * 1.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.translate(BW / 2, 150);
      ctx.scale(pop, pop);
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0b0c10';
      ctx.strokeText(co.text, 0, 0);
      ctx.fillStyle = co.color;
      ctx.fillText(co.text, 0, 0);
      if (co.sub) {
        ctx.font = '800 15px system-ui, sans-serif';
        ctx.strokeText(co.sub, 0, 24);
        ctx.fillStyle = '#fde68a';
        ctx.fillText(co.sub, 0, 24);
      }
      ctx.restore();
    }

    // 사이드 패널
    const cx = BW + SIDE / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('NEXT', cx, 20);
    this.queue.slice(0, this.cfg.previews).forEach((t, i) => this.drawMini(ctx, t, cx, 50 + i * 44, i === 0 ? 16 : 12));
    ctx.fillStyle = '#6b7280';
    ctx.fillText('HOLD', cx, 268);
    if (this.holdType >= 0) this.drawMini(ctx, this.holdType, cx, 300, 15, !this.canHold);
    ctx.fillStyle = '#6b7280';
    ctx.fillText('LEVEL', cx, 352);
    ctx.fillText('LINES', cx, 404);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText(this.level, cx, 376);
    ctx.fillText(this.lines, cx, 428);
    ctx.font = '800 12px system-ui, sans-serif';
    if (this.b2b > 0) { ctx.fillStyle = '#facc15'; ctx.fillText(`B2B ×${this.b2b}`, cx, 452); }
    if (this.combo > 0) { ctx.fillStyle = '#4ade80'; ctx.fillText(`${this.combo} 콤보`, cx, 470); }
    ctx.textAlign = 'start';
    if (this.mpView) this.drawBattle(ctx);
  }

  drawBattle(ctx) {
    const m = this.mpView;
    // 받을 공격 게이지 (보드 오른쪽 가장자리, 빨강 = 곧 올라옴)
    const pending = (this.incoming ?? []).reduce((a, g) => a + g.n, 0);
    if (pending > 0) {
      const h = Math.min(ROWS, pending) * CELL;
      const ready = this.incoming.some((g) => g.t <= 0);
      ctx.fillStyle = ready && Math.floor(performance.now() / 150) % 2 ? '#fecaca' : '#ef4444';
      ctx.fillRect(BW + 1, ROWS * CELL - h, 6, h);
    }
    // 카운트다운 / 탈락 표시
    ctx.textAlign = 'center';
    if (this.countdown > 0 && this.state === 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, BW, ROWS * CELL);
      ctx.fillStyle = '#fde68a'; ctx.font = '900 72px system-ui, sans-serif';
      ctx.fillText(Math.ceil(this.countdown), BW / 2, ROWS * CELL / 2 + 24);
      ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(`${m.players.length}명 배틀!`, BW / 2, ROWS * CELL / 2 + 60);
    } else if (m.dead) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, BW, ROWS * CELL);
      ctx.fillStyle = '#fca5a5'; ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillText(`탈락 · ${m.place}위`, BW / 2, ROWS * CELL / 2);
      if (!m.over) { ctx.fillStyle = '#e5e7eb'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('다른 사람들 관전 중…', BW / 2, ROWS * CELL / 2 + 28); }
    }
    // 상대 보드 (2열)
    const x0 = BW + SIDE + 6, mc = 5, bw = COLS * mc, bh = ROWS * mc;
    ctx.fillStyle = '#0f1119'; ctx.fillRect(BW + SIDE, 0, OPP_W, ROWS * CELL);
    let i = 0;
    for (const [, o] of m.opp) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = x0 + col * (bw + 22), y = 6 + row * (bh + 20);
      if (y + bh > ROWS * CELL) break;
      ctx.fillStyle = '#e5e7eb'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(o.name.slice(0, 7), x, y + 8);
      ctx.fillStyle = '#151924'; ctx.fillRect(x, y + 12, bw, bh);
      const b = o.board;
      for (let k = 0; k < b.length; k++) {
        const c = b[k];
        if (c === '.') continue;
        ctx.fillStyle = COLORS[Number(c)] ?? '#888';
        ctx.fillRect(x + (k % COLS) * mc, y + 12 + Math.floor(k / COLS) * mc, mc - 0.5, mc - 0.5);
      }
      if (o.incoming > 0) { ctx.fillStyle = '#ef4444'; const gh = Math.min(ROWS, o.incoming) * mc; ctx.fillRect(x + bw + 1, y + 12 + bh - gh, 3, gh); }
      if (!o.alive) {
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, y + 12, bw, bh);
        ctx.fillStyle = '#fca5a5'; ctx.font = '900 14px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(o.place === 1 ? '🏆' : `${o.place}위`, x + bw / 2, y + 12 + bh / 2 + 5);
      }
      i++;
    }
    ctx.textAlign = 'start';
  }
}
