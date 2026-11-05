import { GameBase, roundRect } from '../engine.js';

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
const COLORS = ['#38bdf8', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c'];

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
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
// 180° 회전 킥 (회전 전 상태 기준)
const KICKS_180 = {
  0: [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  1: [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  2: [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  3: [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

const NORMAL_SCORE = [0, 100, 300, 500, 800];
const SPIN_SCORE = [400, 800, 1200, 1600, 2000];
const MINI_SCORE = [100, 200, 400, 400, 400];
const CLEAR_NAME = ['', '싱글', '더블', '트리플', '쿼드'];
const LOCK_RESETS = 15;

const rotateCW = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
const rotateCCW = (m) => m[0].map((_, i) => m.map((row) => row[row.length - 1 - i]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default class Blocks extends GameBase {
  static meta = {
    id: 'blocks',
    title: '블록 낙하',
    description: '가로줄을 채워 없애세요. 회전으로 틈에 끼워 넣는 "스핀"과 연속 쿼드는 점수가 크게 올라요. ⚙ 설정에서 시작 레벨을 고를 수 있어요.',
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

  constructor(container, opts = {}) {
    super(container, { width: BW + SIDE, height: ROWS * CELL, ...opts });
  }

  init() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.bag = [];
    this.queue = Array.from({ length: 5 }, () => this.pull());
    this.holdType = -1;
    this.canHold = true;
    this.lines = 0;
    this.level = this.cfg.startLevel;
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

  // 7개를 섞어서 순서대로 꺼내는 방식 (같은 블록 편중 방지)
  pull() {
    if (!this.bag.length) {
      this.bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
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
    if (this.collides(shape, this.piece.x, this.piece.y)) this.gameOver('게임 오버', this.statsText());
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
    const kicks = dir === 2 ? KICKS_180[p.r] : (p.type === I ? KICKS_I : KICKS_JLSTZ)[`${p.r}${to}`];
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
      if (c.filter(Boolean).length < 3) return null;
      const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r]; // T가 향한 쪽 두 모서리
      const full = (c[front[0]] && c[front[1]]) || (this.lastMove.dir !== 2 && this.lastMove.kick === 4);
      return { name: 'T', mini: !full };
    }
    if (mode !== 'all') return null;
    // 올스핀: 회전 직후 좌·우·위 어느 쪽으로도 못 움직이면 스핀
    const stuck = this.collides(p.shape, p.x - 1, p.y) && this.collides(p.shape, p.x + 1, p.y) && this.collides(p.shape, p.x, p.y - 1);
    return stuck ? { name: NAMES[p.type], mini: false } : null;
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
    if (p.shape.some((row, y) => row.some((v) => v && p.y + y < 0))) return this.gameOver('게임 오버', this.statsText());

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
      } else this.b2b = -1;
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    } else {
      this.combo = -1;
    }
    let gained = Math.round(base * this.level) + Math.max(0, this.combo) * 50 * this.level;

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
      this.spawn();
      return;
    }

    for (const y of full)
      for (let x = 0; x < COLS; x++)
        this.burst((x + 0.5) * CELL, (y + 0.5) * CELL, { color: COLORS[this.board[y][x]], count: spin ? 5 : 3, speed: 160, life: 0.5 });
    const after = this.board.filter((_, y) => !full.includes(y));
    if (after.every((row) => row.every((c) => c < 0))) { // 판을 완전히 비우면 보너스
      gained += 2000 * this.level;
      this.callout = { text: '퍼펙트 클리어!', sub: title, color: '#f0abfc', t: 1.8 };
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
    const newLevel = this.cfg.startLevel + Math.floor(this.lines / this.cfg.linesPerLevel);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.sound('levelup');
      this.floatText(BW / 2, ROWS * CELL / 2 + 40, `레벨 ${this.level}`, '#93c5fd', 22);
    } else this.sound(spin || n >= 4 ? 'bonus' : 'clear');
    this.updateInfo();
  }

  finishClear() {
    const rows = this.clearing.rows;
    this.board = this.board.filter((_, y) => !rows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(-1));
    this.clearing = null;
    this.spawn();
  }

  statsText() {
    const s = this.stats;
    return `블록 ${s.pieces}개 · ${this.lines}줄 · 스핀 ${s.spins}회 · 최대 콤보 ${Math.max(0, s.maxCombo)} · ${fmtTime(this.time)}`;
  }

  updateInfo() { this.setInfo(`레벨 ${this.level} · ${this.lines}줄`); }

  /** 한 칸 떨어지는 데 걸리는 시간(초). 레벨이 오를수록 가파르게 빨라지고 15레벨 무렵엔 거의 즉시 낙하 */
  get gravity() {
    const L = Math.min(this.level, 20);
    return Math.max(0.0008, Math.pow(0.8 - (L - 1) * 0.007, L - 1) * 0.75);
  }

  onAction(action, repeat) {
    if (repeat || !this.piece) return; // 키 반복은 OS 대신 update의 DAS/ARR로 처리
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

  drawCell(ctx, px, py, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    roundRect(ctx, px + 1, py + 1, size - 2, size - 2, size / 6);
    if (alpha === 1) { // 윗면 하이라이트
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + 3, py + 3, size - 6, Math.max(2, size / 8));
    }
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
    // 보드 배경 + 격자
    ctx.fillStyle = '#131620';
    ctx.fillRect(0, 0, BW, ROWS * CELL);
    ctx.strokeStyle = '#1b1f2c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(BW, y * CELL + 0.5); }
    ctx.stroke();

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
  }
}
