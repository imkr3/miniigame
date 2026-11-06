import { GameBase, roundRect } from '../engine.js';

// 다리 잇기: 누르고 있는 동안 막대가 자라고, 손을 떼면 막대가 앞으로 쓰러져 다리가 된다.
// - 다리 끝이 다음 기둥 위에 닿으면 성공, 짧거나 길면 추락
// - 기둥 가운데 빨간 칸에 딱 맞추면 퍼펙트 (연속일수록 보너스)
// - 걷는 동안 탭 = 깡충 → 공중의 보석 획득
// - 기둥 위 📏 아이템 = 3번 동안 착지 지점 미리보기
// - 점수가 오를수록 기둥이 좁아지고, 움직이는 기둥이 나옴
const W = 400, H = 600;
const TOP = H - 190;             // 기둥 윗면 높이
const HERO_X = 96;               // 화면에서 서 있는 기둥 오른쪽 끝 위치
const WALK = 270, GRAV = 1500, HOP_V = 430;
const DIFF = {
  easy: { grow: 330, minW: 34, maxW: 96, gap: [40, 200] },
  normal: { grow: 400, minW: 22, maxW: 86, gap: [44, 230] },
  hard: { grow: 480, minW: 14, maxW: 70, gap: [52, 250] },
};
// 하늘 색 (점수 구간마다 바뀜): 위 · 아래 · 언덕 먼 · 언덕 가까운 · 기둥
const SKIES = [
  ['#7dd3fc', '#e0f2fe', '#93c5fd', '#60a5fa', '#1e293b'],
  ['#fb923c', '#fde68a', '#f59e0b', '#c2410c', '#292524'],
  ['#a78bfa', '#fbcfe8', '#c084fc', '#7c3aed', '#1e1b4b'],
  ['#0f172a', '#312e81', '#3730a3', '#1e1b4b', '#020617'],
  ['#14532d', '#bbf7d0', '#4ade80', '#15803d', '#052e16'],
];
const rand = (a, b) => a + Math.random() * (b - a);
/** #rrggbb 색을 밝게(+)/어둡게(-) */
const shade = (hex, d) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + d)).toString(16).padStart(2, '0')).join('');

export default class Bridge extends GameBase {
  static meta = {
    id: 'bridge',
    title: '다리 잇기',
    description: '누르고 있으면 막대가 자라요. 손을 떼면 막대가 쓰러져 다리가 됩니다. 다음 기둥에 딱 맞게! 가운데 빨간 칸 = 퍼펙트. 걷는 중 탭하면 깡충 뛰어 보석을 먹어요.',
    controls: 'Space / 마우스를 누르고 있기 → 떼기 · 걷는 중 누르기 = 깡충',
    touchControls: '화면을 누르고 있기 → 떼기 · 걷는 중 탭 = 깡충',
  };
  static pad = { left: null, buttons: [] };
  static gestures = { tap: null };
  static mouseClick = null;
  static actionLabels = { action: '누르기 (막대 늘리기) / 깡충' };
  static settings = [
    { id: 'difficulty', label: '난이도', type: 'select', default: 'normal', options: [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']] },
    { id: 'guide', label: '착지 지점 항상 보기 (연습용, 기록 따로)', type: 'toggle', default: false },
  ];

  constructor(container, opts = {}) {
    super(container, { width: W, height: H, ...opts });
    this.stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * TOP * 0.8, r: Math.random() * 1.4 + 0.4 }));
  }

  init() {
    this.d = DIFF[this.cfg.difficulty] ?? DIFF.normal;
    this.setRecord(`bridge${this.cfg.guide ? '-guide' : ''}${this.cfg.difficulty !== 'normal' ? '-' + this.cfg.difficulty : ''}`);
    this.cam = 0; this.camTo = 0;
    this.pillars = [{ x: 0, w: HERO_X, start: true }];
    this.cur = 0;
    this.count = 0;
    this.addPillar();
    this.addPillar();
    this.hero = { x: HERO_X - 14, y: TOP, vy: 0, air: false, face: 1, walkT: 0 };
    this.stick = null;
    this.phase = 'idle';
    this.prevHeld = true; // 시작 버튼을 누른 채라면 한 번 떼야 막대가 자람
    this.perfects = 0;
    this.gems = 0;
    this.ruler = 0;
    this.bestPerfect = 0;
    this.skyIdx = 0; this.skyFade = 1; this.prevSky = 0;
    this.newStick();
    this.updateInfo();
  }

  updateInfo() {
    const bits = [`💎 ${this.gems}`];
    if (this.perfects > 1) bits.push(`퍼펙트 ×${this.perfects}`);
    if (this.ruler) bits.push(`📏 ${this.ruler}`);
    this.setInfo(bits.join(' · '));
  }

  /** 다음 기둥 만들기 (점수가 오를수록 좁고 멀게, 가끔 움직이는 기둥) */
  addPillar() {
    const last = this.pillars.at(-1), n = this.pillars.length, d = this.d;
    const lv = Math.min(1, this.count / 40);
    const maxW = d.maxW - (d.maxW - d.minW - 12) * lv;
    const w = rand(d.minW, Math.max(d.minW + 8, maxW));
    const gap = rand(d.gap[0], d.gap[1] - (lv < 0.3 ? 30 : 0));
    const p = { x: last.x + last.w + gap, w, base: 0, move: 0, phase: Math.random() * 6 };
    // 움직이는 기둥: 12점부터 가끔 (막대를 놓는 순간 멈춤)
    if (n > 3 && this.count >= 12 && Math.random() < 0.18 + lv * 0.2) p.move = rand(18, 34);
    p.base = p.x;
    // 공중 보석: 깡충 뛰어야 먹을 수 있는 높이
    if (n > 2 && Math.random() < 0.45) p.gem = { x: last.x + last.w + gap * rand(0.35, 0.65), y: TOP - rand(34, 50), got: false };
    // 자 아이템 (기둥 위)
    if (n > 4 && Math.random() < 0.08) p.ruler = true;
    this.pillars.push(p);
  }

  newStick() {
    const p = this.pillars[this.cur];
    this.stick = { x: p.x + p.w, len: 0, ang: -Math.PI / 2, av: 0 };
    this.growTick = 0;
  }

  held() { return this.pointer.down || this.isDown('action'); }

  update(dt) {
    const held = this.held(), press = held && !this.prevHeld, release = !held && this.prevHeld;
    this.prevHeld = held;
    const st = this.stick, h = this.hero, next = this.pillars[this.cur + 1];
    // 카메라는 부드럽게 따라감
    this.cam += (this.camTo - this.cam) * Math.min(1, dt * 7);
    if (this.skyFade < 1) this.skyFade = Math.min(1, this.skyFade + dt * 0.8);
    // 움직이는 기둥: 막대가 쓰러지기 전까지만
    if (next.move && (this.phase === 'idle' || this.phase === 'grow')) {
      next.phase += dt * 1.8;
      next.x = next.base + Math.sin(next.phase) * next.move;
    }

    switch (this.phase) {
      case 'idle':
        if (press) { this.phase = 'grow'; }
        break;
      case 'grow': {
        const speed = this.d.grow * (1 + Math.min(0.35, this.count * 0.006));
        st.len = Math.min(H, st.len + speed * dt);
        this.growTick += speed * dt;
        if (this.growTick > 28) { this.growTick = 0; this.sound('tick'); }
        if (release || st.len >= H) { this.phase = 'fall'; st.av = 0; }
        break;
      }
      case 'fall':
        st.av += 14 * dt;
        st.ang += st.av * dt * 2.2;
        if (st.ang >= 0) { st.ang = 0; this.landStick(); }
        break;
      case 'walk': {
        h.face = 1;
        h.x = Math.min(this.walkTo, h.x + WALK * dt);
        h.walkT += dt;
        if (press && !h.air) { h.air = true; h.vy = -HOP_V; this.sound('jump'); }
        this.heroAir(dt);
        // 보석
        const g = next.gem;
        if (g && !g.got && Math.abs(h.x - g.x) < 16 && Math.abs((h.y - 13) - g.y) < 20) {
          g.got = true; this.gems++; this.addScore(2);
          this.burst(g.x - this.cam, g.y, { color: '#67e8f9', count: 14, speed: 120, life: 0.5 });
          this.floatText(g.x - this.cam, g.y - 10, '+2 💎', '#a5f3fc', 14);
          this.sound('dot'); this.updateInfo();
        }
        if (h.x >= this.walkTo && !h.air) {
          if (this.success) this.arrive(); else { this.phase = 'drop'; this.dropT = 0; this.sound('hit'); this.shake(6); this.vibrate(80); }
        }
        break;
      }
      case 'shift':
        if (Math.abs(this.camTo - this.cam) < 1) { this.cam = this.camTo; this.newStick(); this.phase = 'idle'; }
        break;
      case 'drop':
        this.dropT += dt;
        h.vy += GRAV * dt; h.y += h.vy * dt;
        if (!this.success) st.ang = Math.min(Math.PI / 2, st.ang + dt * 5);
        if (this.dropT > 0.9) this.gameOver('떨어졌어요!', `건넌 기둥 ${this.count}개 · 퍼펙트 최대 ${this.bestPerfect ?? 0}연속 · 보석 ${this.gems}개`);
        break;
    }
  }

  heroAir(dt) {
    const h = this.hero;
    if (!h.air) return;
    h.vy += GRAV * dt; h.y += h.vy * dt;
    if (h.y >= TOP) { h.y = TOP; h.vy = 0; h.air = false; }
  }

  landStick() {
    const st = this.stick, next = this.pillars[this.cur + 1], end = st.x + st.len;
    this.sound('land');
    this.success = end >= next.x && end <= next.x + next.w;
    const mid = next.x + next.w / 2;
    this.perfect = this.success && Math.abs(end - mid) <= 5;
    // 성공 = 다음 기둥 오른쪽 끝까지, 실패 = 막대 끝까지 걸어감
    this.walkTo = this.success ? next.x + next.w - 14 : end < next.x ? Math.min(end + 4, next.x - 8) : end + 4;
    this.phase = 'walk';
  }

  arrive() {
    const next = this.pillars[this.cur + 1];
    this.cur++;
    this.count++;
    let pts = 1;
    if (this.perfect) {
      this.perfects++;
      this.bestPerfect = Math.max(this.bestPerfect ?? 0, this.perfects);
      pts += Math.min(this.perfects, 5);
      this.floatText(next.x + next.w / 2 - this.cam, TOP - 40, this.perfects > 1 ? `퍼펙트 ×${this.perfects}! +${pts}` : `퍼펙트! +${pts}`, '#fca5a5', 16);
      this.burst(next.x + next.w / 2 - this.cam, TOP, { color: '#f87171', count: 18, speed: 150, life: 0.5 });
      this.sound('bonus');
      this.vibrate(25);
    } else {
      this.perfects = 0;
      this.sound('eat');
    }
    if (this.ruler > 0) this.ruler--;
    if (next.ruler) { next.ruler = false; this.ruler = 3; this.floatText(next.x + next.w / 2 - this.cam, TOP - 30, '📏 착지 지점 보기 ×3', '#fde68a', 14); this.sound('power'); }
    this.addScore(pts);
    this.updateInfo();
    // 하늘색은 10개마다 바뀜
    const sky = Math.floor(this.count / 10) % SKIES.length;
    if (sky !== this.skyIdx) { this.prevSky = this.skyIdx; this.skyIdx = sky; this.skyFade = 0; }
    next.base = next.x; next.move = 0; // 도착한 기둥은 멈춤
    this.addPillar();
    // 지나간 기둥 정리
    if (this.cur > 3) { this.pillars.splice(0, 1); this.cur--; }
    this.camTo = next.x + next.w - HERO_X;
    this.phase = 'shift';
  }

  // ---------------- 그리기 ----------------
  draw(ctx) {
    const sky = SKIES[this.skyIdx], cam = this.cam;
    if (this.skyFade < 1) {
      this.drawSky(ctx, this.prevSky);
      ctx.globalAlpha = this.skyFade; this.drawSky(ctx, this.skyIdx); ctx.globalAlpha = 1;
    } else this.drawSky(ctx, this.skyIdx);
    // 구름 (아주 천천히 흐름)
    const tt = performance.now() / 1000;
    ctx.fillStyle = this.skyIdx === 3 ? 'rgba(148,163,184,.18)' : 'rgba(255,255,255,.7)';
    for (let i = 0; i < 5; i++) {
      const span = W + 220, cx0 = ((i * 157 + tt * (6 + i * 2) - cam * 0.06) % span + span) % span - 110, cy = 150 + (i * 53) % 120;
      ctx.beginPath();
      ctx.ellipse(cx0, cy, 38, 13, 0, 0, Math.PI * 2); ctx.ellipse(cx0 - 22, cy + 3, 22, 10, 0, 0, Math.PI * 2); ctx.ellipse(cx0 + 20, cy - 6, 24, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 먼 언덕·가까운 언덕 (시차 스크롤)
    this.hills(ctx, cam * 0.15, TOP - 70, 34, 0.012, sky[2]);
    this.hills(ctx, cam * 0.4, TOP - 20, 26, 0.02, sky[3]);
    // 기둥
    const now = performance.now();
    for (const p of this.pillars) {
      const x = p.x - cam;
      if (x > W || x + p.w < 0) continue;
      // 돌기둥: 세로 그라데이션 + 벽돌 줄눈 + 풀 덮인 윗면
      const pg = ctx.createLinearGradient(x, 0, x + p.w, 0);
      pg.addColorStop(0, sky[4]); pg.addColorStop(0.5, shade(sky[4], 18)); pg.addColorStop(1, shade(sky[4], -10));
      ctx.fillStyle = pg; ctx.fillRect(x, TOP, p.w, H - TOP);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = TOP + 16, row = 0; yy < H; yy += 16, row++) {
        ctx.moveTo(x, yy); ctx.lineTo(x + p.w, yy);
        for (let bx = x + (row % 2 ? 12 : 0) + 24; bx < x + p.w; bx += 24) { ctx.moveTo(bx, yy - 16); ctx.lineTo(bx, yy); }
      }
      ctx.stroke();
      ctx.fillStyle = sky[3]; ctx.fillRect(x - 2, TOP, p.w + 4, 6);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - 2, TOP, p.w + 4, 2);
      if (!p.start) {
        ctx.fillStyle = '#ef4444'; ctx.fillRect(x + p.w / 2 - 5, TOP, 10, 5); // 퍼펙트 칸
      }
      if (p.move) {
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('◀ ▶', x + p.w / 2, TOP + 22); ctx.textAlign = 'start';
      }
      if (p.ruler) {
        ctx.font = `${16 + Math.sin(now / 200) * 1.5}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText('📏', x + p.w / 2, TOP - 8); ctx.textAlign = 'start';
      }
      if (p.gem && !p.gem.got) this.drawGem(ctx, p.gem.x - cam, p.gem.y + Math.sin(now / 250 + p.gem.x) * 3);
    }
    // 착지 지점 미리보기 (자 아이템 / 연습 설정)
    const st = this.stick;
    if ((this.ruler > 0 || this.cfg.guide) && (this.phase === 'grow' || this.phase === 'idle')) {
      const ex = st.x + st.len - cam;
      ctx.strokeStyle = 'rgba(253,224,71,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex, TOP - 30); ctx.lineTo(ex, TOP + 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(ex, TOP + 2); ctx.lineTo(ex - 5, TOP - 6); ctx.lineTo(ex + 5, TOP - 6); ctx.fill();
    }
    // 막대
    if (st && st.len > 0) {
      ctx.save();
      ctx.translate(st.x - cam, TOP);
      ctx.rotate(st.ang);
      ctx.fillStyle = '#a16207'; ctx.fillRect(0, -2, st.len, 4);
      ctx.fillStyle = '#facc15'; ctx.fillRect(0, -2, st.len, 1.5);
      ctx.restore();
    }
    this.drawHero(ctx);
    // 점수
    ctx.textAlign = 'center';
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.strokeText(String(this.score), W / 2, 80);
    ctx.fillStyle = '#fff'; ctx.fillText(String(this.score), W / 2, 80);
    if (this.state === 'playing' && this.count === 0 && this.phase === 'idle') {
      ctx.font = '700 15px system-ui, sans-serif'; ctx.fillStyle = 'rgba(15,23,42,.75)';
      ctx.fillText(this.touchMode ? '화면을 누르고 있다가 떼세요' : 'Space 를 누르고 있다가 떼세요', W / 2, 130);
    }
    ctx.textAlign = 'start';
  }

  drawSky(ctx, idx) {
    this.drawCached(ctx, `bridge-sky-${idx}`, 0, 0, W, H, (c) => {
      const s = SKIES[idx];
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, s[0]); g.addColorStop(0.75, s[1]); g.addColorStop(1, s[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (idx === 3) { // 밤하늘 별
        c.fillStyle = '#fff';
        for (const st of this.stars) { c.globalAlpha = 0.4 + st.r / 3; c.beginPath(); c.arc(st.x, st.y, st.r, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = 1;
        c.fillStyle = '#fef9c3'; c.beginPath(); c.arc(W - 70, 90, 22, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(W - 80, 110, 30, 0, Math.PI * 2); c.fill();
      }
    });
  }

  hills(ctx, off, y, amp, freq, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
      const wx = x + off;
      ctx.lineTo(x, y - Math.sin(wx * freq) * amp - Math.sin(wx * freq * 2.3 + 1) * amp * 0.4);
    }
    ctx.lineTo(W, H); ctx.fill();
  }

  drawGem(ctx, x, y) {
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x, y + 8); ctx.lineTo(x - 7, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x - 3, y - 2); ctx.closePath(); ctx.fill();
  }

  /** 주인공: 목도리를 두른 동글이 (걸을 때 통통, 막대 늘릴 때 힘주기) */
  drawHero(ctx) {
    const h = this.hero, x = h.x - this.cam;
    const walking = this.phase === 'walk' && !h.air;
    const bob = walking ? Math.abs(Math.sin(h.walkT * 16)) * 3 : 0;
    const squash = this.phase === 'grow' ? 1 + Math.sin(performance.now() / 50) * 0.04 : 1;
    const y = h.y - bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / squash, squash);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    if (!h.air && this.phase !== 'drop') { ctx.beginPath(); ctx.ellipse(0, bob, 11, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    // 발
    ctx.fillStyle = '#1f2937';
    const step = walking ? Math.sin(h.walkT * 16) * 3 : 0;
    ctx.fillRect(-7 + step, -4, 5, 4); ctx.fillRect(2 - step, -4, 5, 4);
    // 몸
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(0, -15, 12, 0, Math.PI * 2); ctx.fill();
    // 목도리
    ctx.fillStyle = '#ef4444';
    roundRect(ctx, -11, -12, 22, 5, 2);
    const flap = Math.sin(performance.now() / 120) * 2;
    ctx.fillRect(-14, -11 + flap, 5, 3);
    // 눈
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(4, -18, 2, 0, Math.PI * 2); ctx.arc(9, -18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fda4af'; ctx.beginPath(); ctx.arc(9, -13.5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
