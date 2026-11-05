import { GameBase, DIRS, randInt, roundRect } from '../engine.js';

const COLS = 20, ROWS = 20, CELL = 20;
const BONUS_TIME = 6;

export default class Snake extends GameBase {
  static meta = {
    id: 'snake',
    title: '스네이크',
    description: '먹이를 먹고 몸을 늘리세요. 벽이나 내 몸에 닿으면 끝! 가끔 나오는 황금 먹이는 보너스 점수.',
    controls: '방향키 / WASD',
    touchControls: '화면을 밀어서 방향 전환 (또는 아래 방향 버튼)',
  };
  static mouseClick = null;

  constructor(container, opts = {}) {
    super(container, { width: COLS * CELL, height: ROWS * CELL, ...opts });
  }

  init() {
    this.snake = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];
    this.dir = DIRS.right;
    this.queue = [];      // 빠른 연속 입력을 놓치지 않도록 방향 큐
    this.timer = 0;
    this.interval = 0.13; // 한 칸 이동 간격(초) — 먹을수록 빨라짐
    this.eaten = 0;
    this.bonus = null;
    this.food = this.freeCell();
    this.updateInfo();
  }

  freeCell() {
    const taken = (x, y) => this.snake.some((s) => s.x === x && s.y === y) ||
      (this.food && this.food.x === x && this.food.y === y) || (this.bonus && this.bonus.x === x && this.bonus.y === y);
    const free = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken(x, y)) free.push({ x, y });
    return free.length ? free[randInt(free.length)] : null;
  }

  updateInfo() { this.setInfo(`길이 ${this.snake.length}`); }

  onAction(action) {
    const d = DIRS[action];
    if (!d) return;
    const last = this.queue.at(-1) ?? this.dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return; // 역방향 금지
    if (this.queue.length < 3) this.queue.push(d);
  }

  update(dt) {
    if (this.bonus && (this.bonus.t -= dt) <= 0) this.bonus = null;
    this.timer += dt;
    while (this.timer >= this.interval && this.state === 'playing') {
      this.timer -= this.interval;
      this.step();
    }
  }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    const eatFood = head.x === this.food.x && head.y === this.food.y;
    const eatBonus = this.bonus && head.x === this.bonus.x && head.y === this.bonus.y;
    const body = eatFood ? this.snake : this.snake.slice(0, -1); // 꼬리는 이번 턴에 빠짐
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
        body.some((s) => s.x === head.x && s.y === head.y)) {
      this.shake(8);
      this.burst((this.snake[0].x + 0.5) * CELL, (this.snake[0].y + 0.5) * CELL, { color: '#4ade80', count: 24, speed: 180 });
      this.sound('hit');
      return this.gameOver();
    }
    this.snake.unshift(head);
    const cx = (head.x + 0.5) * CELL, cy = (head.y + 0.5) * CELL;
    if (eatFood) {
      this.eaten++;
      this.addScore(10);
      this.interval = Math.max(0.065, this.interval * 0.975);
      this.burst(cx, cy, { color: '#fb923c', count: 10, speed: 100, life: 0.4 });
      this.sound('eat');
      this.vibrate(15);
      this.food = this.freeCell();
      if (!this.food) return this.gameOver('완벽한 클리어!');
      if (this.eaten % 5 === 0 && !this.bonus) {
        const c = this.freeCell();
        if (c) this.bonus = { ...c, t: BONUS_TIME };
      }
    } else {
      this.snake.pop();
    }
    if (eatBonus) {
      const pts = 20 + Math.ceil(this.bonus.t) * 10;
      this.addScore(pts);
      this.floatText(cx, cy - 8, `+${pts}`);
      this.burst(cx, cy, { color: '#facc15', count: 16, speed: 140 });
      this.sound('bonus');
      this.bonus = null;
    }
    this.updateInfo();
  }

  draw(ctx) {
    ctx.fillStyle = '#121520';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#161a26';
    for (let y = 0; y < ROWS; y++)
      for (let x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    if (this.food) {
      ctx.fillStyle = '#fb923c';
      const r = (CELL / 2 - 3) * pulse;
      ctx.beginPath(); ctx.arc((this.food.x + 0.5) * CELL, (this.food.y + 0.5) * CELL, r, 0, Math.PI * 2); ctx.fill();
    }
    if (this.bonus) {
      const blink = this.bonus.t < 2 && Math.floor(this.bonus.t * 8) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = '#facc15';
        const bx = (this.bonus.x + 0.5) * CELL, by = (this.bonus.y + 0.5) * CELL, r = (CELL / 2 - 1) * pulse;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
          ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
      }
    }

    const n = this.snake.length;
    this.snake.forEach((s, i) => {
      const x = s.x * CELL, y = s.y * CELL;
      const shade = 1 - (i / Math.max(n, 1)) * 0.45;
      ctx.fillStyle = i === 0 ? '#86efac' : `rgba(34,197,94,${shade})`;
      roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, i === 0 ? 7 : 5);
      if (i === 0) {
        ctx.fillStyle = '#0f172a';
        const d = this.dir, ex = x + CELL / 2 + d.x * 4, ey = y + CELL / 2 + d.y * 4;
        ctx.beginPath();
        ctx.arc(ex + d.y * 4, ey + d.x * 4, 2.2, 0, Math.PI * 2);
        ctx.arc(ex - d.y * 4, ey - d.x * 4, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}
