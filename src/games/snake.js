import { GameBase, DIRS, randInt, roundRect } from '../engine.js';

const COLS = 20, ROWS = 20, CELL = 20;

export default class Snake extends GameBase {
  static meta = {
    id: 'snake',
    title: '스네이크',
    description: '먹이를 먹고 몸을 늘리세요. 벽이나 몸에 닿으면 끝!',
    controls: '방향키 / WASD / 스와이프',
  };

  constructor(container, opts = {}) {
    super(container, { width: COLS * CELL, height: ROWS * CELL, ...opts });
  }

  init() {
    this.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    this.dir = DIRS.right;
    this.queue = [];      // 빠른 연속 입력을 놓치지 않도록 방향 큐
    this.timer = 0;
    this.interval = 0.13; // 한 칸 이동 간격(초) — 먹을수록 빨라짐
    this.placeFood();
  }

  placeFood() {
    if (this.snake.length >= COLS * ROWS) return this.gameOver('클리어!');
    let f;
    do { f = { x: randInt(COLS), y: randInt(ROWS) }; }
    while (this.snake.some((s) => s.x === f.x && s.y === f.y));
    this.food = f;
  }

  onAction(action) {
    const d = DIRS[action];
    if (!d) return;
    const last = this.queue.at(-1) ?? this.dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return; // 역방향 금지
    if (this.queue.length < 3) this.queue.push(d);
  }

  update(dt) {
    this.timer += dt;
    while (this.timer >= this.interval && this.state === 'playing') {
      this.timer -= this.interval;
      this.step();
    }
  }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    const eating = head.x === this.food.x && head.y === this.food.y;
    const body = eating ? this.snake : this.snake.slice(0, -1); // 꼬리는 이번 턴에 빠짐
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
        body.some((s) => s.x === head.x && s.y === head.y)) {
      return this.gameOver();
    }
    this.snake.unshift(head);
    if (eating) {
      this.addScore(10);
      this.interval = Math.max(0.06, this.interval * 0.97);
      this.placeFood();
    } else {
      this.snake.pop();
    }
    this.setInfo(`길이 ${this.snake.length}`);
  }

  draw(ctx) {
    ctx.fillStyle = '#151821';
    for (let y = 0; y < ROWS; y++)
      for (let x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

    ctx.fillStyle = '#f97316';
    roundRect(ctx, this.food.x * CELL + 3, this.food.y * CELL + 3, CELL - 6, CELL - 6, 6);

    this.snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#4ade80' : '#22c55e';
      roundRect(ctx, s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, 5);
    });
  }
}
