// 점프 러너 - 적과 보스: 능력치, 행동(AI), 그리기
import { roundRect } from '../../engine.js';
import { T, GRAVITY, MAX_FALL, clamp, rand, randInt, isSolid } from './world.js';

// fly: 공중(중력 없음) · static: 제자리 · spiky: 밟으면 내가 다침 · boss: 보스
export const ENEMIES = {
  slime:      { name: '슬라임', w: 20, h: 16, hp: 3, speed: 40, score: 10, color: '#a855f7' },
  minislime:  { name: '꼬마 슬라임', w: 14, h: 11, hp: 1, speed: 75, score: 5, color: '#f87171' },
  drone:      { name: '벌 드론', w: 20, h: 16, hp: 2, speed: 105, score: 15, color: '#facc15', fly: true },
  turret:     { name: '포탑', w: 22, h: 22, hp: 5, score: 20, color: '#94a3b8', static: true, noStomp: true },
  charger:    { name: '멧돼지', w: 30, h: 22, hp: 6, speed: 45, score: 25, color: '#b45309' },
  bat:        { name: '박쥐', w: 20, h: 14, hp: 2, speed: 170, score: 15, color: '#7c3aed', fly: true },
  skeleton:   { name: '해골 기사', w: 20, h: 28, hp: 6, speed: 42, score: 30, color: '#e7e5e4' },
  ghost:      { name: '유령', w: 22, h: 24, hp: 4, speed: 42, score: 25, color: '#c4b5fd', fly: true },
  scorpion:   { name: '전갈', w: 28, h: 16, hp: 4, speed: 50, score: 20, color: '#d97706' },
  cactus:     { name: '선인장', w: 20, h: 30, hp: 6, score: 20, color: '#16a34a', static: true, spiky: true },
  snowman:    { name: '눈사람', w: 22, h: 30, hp: 5, score: 20, color: '#f1f5f9', static: true },
  penguin:    { name: '펭귄', w: 20, h: 20, hp: 4, speed: 28, score: 20, color: '#1e293b' },
  fireSpirit: { name: '불꽃 정령', w: 20, h: 22, hp: 3, score: 25, color: '#f97316', fly: true },
  magmaSlime: { name: '마그마 슬라임', w: 26, h: 20, hp: 5, speed: 35, score: 25, color: '#dc2626', split: true },
  eagle:      { name: '독수리', w: 28, h: 16, hp: 3, speed: 90, score: 25, color: '#a16207', fly: true },
  cloud:      { name: '번개 구름', w: 40, h: 20, hp: 4, score: 30, color: '#64748b', fly: true },
  frog:       { name: '독개구리', w: 22, h: 16, hp: 4, speed: 0, score: 20, color: '#65a30d' },
  crystalBug: { name: '수정 벌레', w: 24, h: 14, hp: 4, speed: 34, score: 25, color: '#22d3ee' },
  robot:      { name: '경비 로봇', w: 22, h: 28, hp: 6, speed: 40, score: 30, color: '#64748b' },
  // 보스
  golem:      { name: '바위 골렘', w: 52, h: 60, hp: 70, score: 300, color: '#78716c', boss: true },
  slimeKing:  { name: '슬라임 왕', w: 64, h: 50, hp: 80, score: 300, color: '#22c55e', boss: true },
  mech:       { name: '강철 비행선', w: 84, h: 40, hp: 85, score: 300, color: '#475569', boss: true, fly: true },
};

const patrol = (g, e) => {
  if (e.onGround && !g.groundAhead(e, e.dir)) e.dir *= -1;
  e.vx = e.dir * e.speed;
};
const shoot = (g, e, vx, vy, extra = {}) => g.shots.push({ x: e.x + e.w / 2, y: e.y + 8, vx, vy, r: 4, life: 3.5, kind: 'bullet', ...extra });
/** 목표 지점까지 포물선으로 던지는 속도 */
const lob = (dx, time, up) => ({ vx: dx / time, vy: -up });

// ---------------- 행동 ----------------
export const AI = {
  slime: patrol,
  minislime: patrol,
  magmaSlime: patrol,

  charger(g, e, dt, dx, dy) {
    if (e.state === 'patrol') {
      patrol(g, e);
      if (Math.abs(dx) < 230 && Math.abs(dy) < 40) { e.state = 'windup'; e.t = 0; e.dir = Math.sign(dx) || 1; }
    } else if (e.state === 'windup') {
      e.vx = 0;
      if (e.t > 0.45) { e.state = 'charge'; e.t = 0; g.sound('power'); }
    } else if (e.state === 'charge') {
      e.vx = e.dir * 310;
      if (e.t > 1.3 || (e.onGround && !g.groundAhead(e, e.dir))) { e.state = 'rest'; e.t = 0; }
    } else { e.vx = 0; if (e.t > 0.8) { e.state = 'patrol'; e.t = 0; } }
  },

  drone(g, e, dt, dx, dy) {
    const dist = Math.hypot(dx, dy);
    let tx, ty;
    if (dist < 230) { tx = Math.sign(dx) * e.speed; ty = Math.sign(dy) * e.speed * 0.7; }
    else { tx = (e.homeX - e.x) * 1.5; ty = (e.homeY + Math.sin(e.t * 2) * 12 - e.y) * 2; }
    e.vx += (tx + e.kb - e.vx) * Math.min(1, dt * 3);
    e.vy += (ty - e.vy) * Math.min(1, dt * 3);
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.dir = Math.sign(dx) || 1;
  },

  turret(g, e, dt, dx, dy) {
    e.dir = Math.sign(dx) || 1;
    e.vx = 0;
    if (Math.abs(dx) < 340 && Math.abs(dy) < 160) {
      e.cool = (e.cool ?? 1.2) - dt;
      if (e.cool <= 0) {
        e.cool = 1.9;
        const d = Math.hypot(dx, dy) || 1;
        shoot(g, e, (dx / d) * 190, (dy / d) * 190, { y: e.y + 6 });
        g.sound('tick');
      }
    }
  },

  // 천장에 매달려 있다가 아래로 급강하 → 다시 올라감
  bat(g, e, dt, dx, dy) {
    const p = g.p;
    if (e.state === 'patrol') e.state = 'hang';
    if (e.state === 'hang') {
      e.x += (e.homeX - e.x) * Math.min(1, dt * 4); e.y += (e.homeY - e.y) * Math.min(1, dt * 4);
      if (Math.abs(dx) < 140 && dy > 10 && e.t > 0.8) { e.state = 'swoop'; e.t = 0; e.tx = p.x + p.w / 2; e.ty = p.y + p.h / 2; g.sound('tick'); }
    } else if (e.state === 'swoop') {
      const vx = e.tx - (e.x + e.w / 2), vy = e.ty - (e.y + e.h / 2), d = Math.hypot(vx, vy) || 1;
      e.x += (vx / d) * e.speed * dt + e.kb * dt; e.y += (vy / d) * e.speed * dt;
      if (d < 10 || e.t > 1.4) { e.state = 'rise'; e.t = 0; }
    } else {
      const vx = e.homeX - e.x, vy = e.homeY - e.y, d = Math.hypot(vx, vy) || 1;
      e.x += (vx / d) * 110 * dt; e.y += (vy / d) * 110 * dt;
      if (d < 6) { e.state = 'hang'; e.t = 0; }
    }
    e.dir = Math.sign(dx) || 1;
  },

  // 앞쪽은 방패로 막음, 가끔 뼈다귀를 던짐
  skeleton(g, e, dt, dx, dy) {
    if (Math.abs(dx) < 260 && Math.abs(dy) < 60) {
      e.dir = Math.sign(dx) || 1;
      e.vx = e.onGround && g.groundAhead(e, e.dir) && Math.abs(dx) > 20 ? e.dir * e.speed : 0;
      e.cool = (e.cool ?? 2) - dt;
      if (e.cool <= 0 && Math.abs(dx) > 50) {
        e.cool = 2.6;
        const v = lob(dx, 0.9, 380);
        shoot(g, e, v.vx, v.vy, { kind: 'arc', g: 900, r: 5, color: '#e7e5e4', spin: true });
      }
    } else patrol(g, e);
  },

  // 벽을 통과해 천천히 다가옴, 주기적으로 투명(무적)해짐
  ghost(g, e, dt, dx, dy) {
    const cyc = e.t % 4.2;
    e.hidden = cyc > 2.8;
    const d = Math.hypot(dx, dy) || 1;
    const sp = e.hidden ? e.speed * 1.6 : e.speed;
    e.x += (dx / d) * sp * dt + e.kb * dt;
    e.y += (dy / d) * sp * dt + Math.sin(e.t * 3) * 10 * dt;
    e.dir = Math.sign(dx) || 1;
  },

  // 독개구리: 플레이어 쪽으로 펄쩍펄쩍 뛰어오고, 가끔 독침을 뱉음
  frog(g, e, dt, dx, dy) {
    e.dir = Math.sign(dx) || 1;
    if (e.onGround) {
      e.vx = 0;
      e.cool = (e.cool ?? 1) - dt;
      if (e.cool <= 0 && Math.abs(dx) < 300 && Math.abs(dy) < 120) {
        if (Math.random() < 0.3) { shoot(g, e, e.dir * 210, -40, { color: '#a3e635', r: 3.5 }); g.sound('tick'); }
        else if (g.groundAhead(e, e.dir)) { e.vy = -470; e.vx = e.dir * 150; g.sound('jump'); }
        e.cool = 1.1 + Math.random() * 0.6;
      }
    }
  },

  // 수정 벌레: 기어다니다가 가까이 오면 등에서 수정 조각 3개를 부채꼴로 발사
  crystalBug(g, e, dt, dx, dy) {
    e.cool = (e.cool ?? 2) - dt;
    if (e.state === 'charge') {
      e.vx = 0;
      if (e.t > 0.5) {
        for (const a of [-0.5, 0, 0.5]) shoot(g, e, Math.sin(a) * 170 + Math.sign(dx) * 40, -Math.cos(a) * 260, { kind: 'arc', g: 600, r: 4, color: '#67e8f9', y: e.y });
        g.sound('tick');
        e.state = 'patrol'; e.cool = 2.6;
      }
    } else {
      patrol(g, e);
      if (e.cool <= 0 && Math.abs(dx) < 200 && Math.abs(dy) < 90) { e.state = 'charge'; e.t = 0; }
    }
  },

  scorpion(g, e, dt, dx, dy) {
    e.cool = (e.cool ?? 1.5) - dt;
    if (e.state === 'aim') {
      e.vx = 0;
      if (e.t > 0.45) {
        const v = lob(dx, 0.8, 340);
        shoot(g, e, v.vx, v.vy, { kind: 'arc', g: 820, r: 5, color: '#a3e635' });
        g.sound('tick');
        e.state = 'patrol'; e.cool = 2.4;
      }
    } else {
      patrol(g, e);
      if (e.cool <= 0 && Math.abs(dx) < 220 && Math.abs(dy) < 70) { e.state = 'aim'; e.t = 0; e.dir = Math.sign(dx) || 1; }
    }
  },

  // 주기적으로 사방에 가시 발사
  cactus(g, e, dt, dx) {
    e.vx = 0;
    e.cool = (e.cool ?? rand(1, 2.5)) - dt;
    e.swell = e.cool < 0.45;
    if (e.cool <= 0 && Math.abs(dx) < 380) {
      e.cool = 2.7;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI; // 위쪽 반원
        g.shots.push({ x: e.x + e.w / 2, y: e.y + 10, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 3, life: 2, kind: 'bullet', color: '#bbf7d0' });
      }
      g.sound('tick');
    }
  },

  snowman(g, e, dt, dx, dy) {
    e.vx = 0;
    e.dir = Math.sign(dx) || 1;
    e.cool = (e.cool ?? rand(0.8, 2)) - dt;
    if (e.cool <= 0 && Math.abs(dx) < 330 && Math.abs(dy) < 150) {
      e.cool = 2.2;
      const v = lob(dx + rand(-20, 20), 1.0, 420);
      shoot(g, e, v.vx, v.vy, { kind: 'arc', g: 840, r: 6, color: '#f8fafc', y: e.y + 4 });
      e.throwT = 0.25;
    }
    e.throwT = Math.max(0, (e.throwT ?? 0) - dt);
  },

  // 플레이어를 보면 배로 미끄러지며 돌진, 벽에 부딪히면 반대로
  penguin(g, e, dt, dx, dy) {
    if (e.state === 'slide') {
      e.vx = e.dir * 330;
      if (e.t > 2) { e.state = 'patrol'; e.t = 0; }
    } else {
      patrol(g, e);
      if (e.t > 1 && Math.abs(dx) < 230 && Math.abs(dy) < 40) { e.state = 'slide'; e.t = 0; e.dir = Math.sign(dx) || 1; g.sound('jump'); }
    }
  },

  // 일정 거리를 유지하며 불덩이를 쏨
  fireSpirit(g, e, dt, dx, dy) {
    const p = g.p;
    const side = dx > 0 ? -1 : 1;
    const tx = p.x + side * 150, ty = p.y - 50 + Math.sin(e.t * 2) * 20;
    e.x += clamp(tx - e.x, -80, 80) * dt + e.kb * dt;
    e.y += clamp(ty - e.y, -60, 60) * dt;
    e.dir = Math.sign(dx) || 1;
    e.cool = (e.cool ?? rand(1, 2)) - dt;
    if (e.cool <= 0 && Math.hypot(dx, dy) < 320) {
      e.cool = 2.2;
      const d = Math.hypot(dx, dy) || 1;
      shoot(g, e, (dx / d) * 200, (dy / d) * 200, { r: 5, color: '#fb923c', fire: true });
      g.sound('tick');
    }
  },

  // 높이 날다가 플레이어에게 대각선 급강하
  eagle(g, e, dt, dx, dy) {
    const p = g.p;
    if (e.state === 'patrol' || e.state === 'circle') {
      e.state = 'circle';
      e.x += clamp(p.x - 60 * e.dir - e.x, -e.speed, e.speed) * dt;
      e.y += (e.homeY + Math.sin(e.t * 2) * 8 - e.y) * Math.min(1, dt * 3);
      if (e.t > 2.2 && Math.abs(dx) < 220 && dy > 0) { e.state = 'dive'; e.t = 0; const d = Math.hypot(dx, dy) || 1; e.dvx = (dx / d) * 270; e.dvy = (dy / d) * 270; g.sound('power'); }
    } else if (e.state === 'dive') {
      e.x += e.dvx * dt; e.y += e.dvy * dt;
      if (e.t > 1.1 || e.y > p.y + 20) { e.state = 'climb'; e.t = 0; }
    } else {
      e.y -= 160 * dt; e.x += e.dir * 60 * dt;
      if (e.y <= e.homeY) { e.state = 'circle'; e.t = 0; }
    }
    if (e.state !== 'dive') e.dir = Math.sign(dx) || 1;
  },

  // 플레이어 머리 위를 따라다니다 예고 후 낙뢰
  cloud(g, e, dt, dx) {
    e.x += clamp(dx, -60, 60) * dt;
    e.y = e.homeY + Math.sin(e.t * 1.5) * 4;
    e.cool = (e.cool ?? rand(1.5, 3)) - dt;
    e.charging = e.cool < 0.75;
    if (e.cool <= 0) {
      e.cool = 3.2;
      const cx = e.x + e.w / 2;
      let r = Math.floor((e.y + e.h) / T);
      while (r < 15 && !isSolid(g.tileAt(Math.floor(cx / T), r))) r++;
      const top = e.y + e.h;
      g.shots.push({ kind: 'beam', x: cx - 9, y: top, w: 18, h: r * T - top, warn: 0, life: 0.3, color: '#fde047' });
      g.sound('hit');
      g.shake(3, 0.12);
    }
  },

  // 예고(눈이 빨개짐) 후 수평 레이저
  robot(g, e, dt, dx, dy) {
    if (e.state === 'charge') {
      e.vx = 0;
      if (e.t > 0.7) {
        const y = e.y + 9, x0 = e.dir > 0 ? e.x + e.w : e.x;
        let x1 = x0;
        while (Math.abs(x1 - x0) < 420 && !isSolid(g.tileAt(Math.floor(x1 / T), Math.floor(y / T)))) x1 += e.dir * 6;
        g.shots.push({ kind: 'beam', x: Math.min(x0, x1), y: y - 3, w: Math.abs(x1 - x0), h: 6, warn: 0, life: 0.35, color: '#f43f5e' });
        g.sound('power');
        e.state = 'patrol'; e.t = 0; e.cool = 2.8;
      }
    } else {
      patrol(g, e);
      e.cool = (e.cool ?? 1) - dt;
      if (e.cool <= 0 && Math.abs(dy) < 30 && Math.abs(dx) < 320) { e.state = 'charge'; e.t = 0; e.dir = Math.sign(dx) || 1; }
    }
  },

  // ---------------- 보스 ----------------
  golem(g, b, dt, dx) {
    const p = g.p;
    const sp = b.phase2 ? 1.35 : 1;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const next = () => { b.state = ['slam', 'rocks', 'charge'][randInt(3)]; b.t = 0; b.did = false; };
    switch (b.state) {
      case 'intro': b.vx = 0; if (b.t > 1.6) { b.state = 'walk'; b.t = 0; } break;
      case 'walk': b.dir = Math.sign(dx) || 1; b.vx = b.dir * 70 * sp; if (b.t > 1.4 / sp) next(); break;
      case 'slam':
        if (b.t < 0.45) b.vx = 0;
        else if (!b.did) { b.did = true; b.vy = -720; b.vx = clamp((p.x - b.x) / 0.75, -320, 320); }
        else if (b.onGround && b.t > 0.6) {
          b.vx = 0; g.shake(9, 0.3); g.sound('drop');
          for (const d of [-1, 1]) g.shots.push({ x: b.x + b.w / 2, y: b.y + b.h - 18, vx: d * 230 * sp, vy: 0, w: 14, h: 18, life: 2.2, kind: 'wave' });
          b.state = 'recover'; b.t = 0;
        }
        break;
      case 'rocks':
        b.vx = 0;
        if (b.t > 0.55 && !b.did) {
          b.did = true;
          const n = b.phase2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const tt = 0.9 + i * 0.12;
            g.shots.push({ x: b.x + b.w / 2, y: b.y + 8, vx: (p.x - b.x) / tt + rand(-60, 60), vy: -430 - i * 30, r: 7, life: 4, kind: 'arc', g: 900, color: '#a8a29e' });
          }
          g.sound('power');
        }
        if (b.t > 1.1) { b.state = 'recover'; b.t = 0; }
        break;
      case 'charge': if (b.t < 0.6) { b.vx = 0; b.dir = Math.sign(dx) || 1; } else b.vx = b.dir * 380 * sp; break;
      case 'stun': b.vx = 0; if (b.t > 1.1) { b.state = 'walk'; b.t = 0; } break;
      default: b.vx *= 0.9; if (b.t > 0.7 / sp) { b.state = 'walk'; b.t = 0; }
    }
    if (g.moveX(b, b.vx * dt) && b.state === 'charge') {
      b.state = 'stun'; b.t = 0; g.shake(8, 0.3); g.sound('hit');
      g.burst(b.dir > 0 ? b.x + b.w : b.x, b.y + b.h / 2, { color: '#a8a29e', count: 20, speed: 160 });
    }
    g.moveY(b, b.vy * dt, false);
  },

  // 통통 뛰고, 크게 점프해서 내려찍고, 부하를 부름
  slimeKing(g, b, dt, dx) {
    const p = g.p;
    const sp = b.phase2 ? 1.3 : 1;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const wasGround = b.onGround;
    const minions = () => g.enemies.filter((e) => !e.dead && !e.boss).length;
    const next = () => {
      const opts = ['hop', 'leap', 'leap', minions() < 4 ? 'summon' : 'hop'];
      b.state = opts[randInt(opts.length)]; b.t = 0; b.did = false; b.n = 3;
    };
    switch (b.state) {
      case 'intro': b.vx = 0; if (b.t > 1.6) { b.state = 'hop'; b.t = 0; b.n = 3; } break;
      case 'hop':
        if (b.onGround) {
          b.vx = 0;
          if (b.t > 0.3 / sp) {
            if (b.n-- > 0) { b.vy = -440; b.vx = (Math.sign(dx) || 1) * 160 * sp; b.t = 0; }
            else next();
          }
        }
        break;
      case 'leap':
        if (b.t < 0.55) b.vx = 0; // 웅크림 예고
        else if (!b.did) { b.did = true; b.vy = -820; b.vx = clamp((p.x - b.x - b.w / 2) / 0.85, -340, 340); g.sound('jump'); }
        else if (b.onGround && b.t > 0.65) {
          b.vx = 0; g.shake(10, 0.35); g.sound('drop');
          for (const d of [-1, 1]) g.shots.push({ x: b.x + b.w / 2, y: b.y + b.h - 16, vx: d * 210 * sp, vy: 0, w: 14, h: 16, life: 2.2, kind: 'wave', color: '#4ade80' });
          if (minions() < 5) g.spawnEnemyAt('slime', b.x + b.w / 2 + rand(-30, 30), b.y);
          b.state = 'recover'; b.t = 0;
        }
        break;
      case 'summon':
        b.vx = 0;
        if (b.t > 0.6 && !b.did) {
          b.did = true;
          const n = b.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) g.spawnEnemyAt(b.phase2 && i === 0 ? 'magmaSlime' : 'slime', rand(3 * T, g.levelW - 4 * T), 30);
          g.sound('power');
        }
        if (b.t > 1.2) { b.state = 'recover'; b.t = 0; }
        break;
      default: b.vx *= 0.85; if (b.t > 0.7 / sp) next();
    }
    if (g.moveX(b, b.vx * dt)) b.vx = 0;
    g.moveY(b, b.vy * dt, false);
    if (!wasGround && b.onGround) b.squash = 0.25;
    b.squash = Math.max(0, (b.squash ?? 0) - dt);
  },

  // 하늘을 날며 폭탄·레이저, 패턴 두 번 뒤엔 지쳐서 내려옴 (공격 기회)
  mech(g, b, dt, dx) {
    const p = g.p;
    const sp = b.phase2 ? 1.3 : 1;
    const hoverY = 64, groundY = 11 * T - b.h;
    const L = 2 * T + 4, R = g.levelW - 2 * T - b.w - 4;
    const fly = (spd) => { b.x += b.dir * spd * dt; if (b.x < L) { b.x = L; b.dir = 1; } if (b.x > R) { b.x = R; b.dir = -1; } };
    b.cycles = b.cycles ?? 0;
    switch (b.state) {
      case 'intro': b.y += (hoverY - b.y) * Math.min(1, dt * 2); if (b.t > 1.6) { b.state = 'patrol'; b.t = 0; } break;
      case 'patrol':
        fly(120 * sp);
        b.y = hoverY + Math.sin(b.t * 2) * 8;
        if (b.t > 2.2) {
          if (b.cycles >= 2) { b.state = 'descend'; b.cycles = 0; }
          else { b.state = Math.random() < 0.5 ? 'bombs' : 'laser'; b.cycles++; }
          b.t = 0; b.n = 0;
        }
        break;
      case 'bombs':
        fly(140 * sp);
        b.drop = (b.drop ?? 0) - dt;
        if (b.drop <= 0 && b.n < (b.phase2 ? 7 : 5)) {
          b.drop = 0.4; b.n++;
          g.shots.push({ x: b.x + b.w / 2, y: b.y + b.h, vx: b.dir * 30, vy: 40, r: 7, life: 4, kind: 'bomb', g: 700 });
          g.sound('tick');
        }
        if (b.n >= (b.phase2 ? 7 : 5) && b.t > 2.4) { b.state = 'patrol'; b.t = 0; }
        break;
      case 'laser':
        if (b.t < 1) { b.x += clamp(p.x + p.w / 2 - (b.x + b.w / 2), -220, 220) * dt * 2; }
        else if (!b.did) {
          b.did = true;
          const top = b.y + b.h;
          g.shots.push({ kind: 'beam', x: b.x + b.w / 2 - 12, y: top, w: 24, h: 11 * T - top, warn: 0.8, life: 1.25, color: '#f43f5e' });
          if (b.phase2) for (const off of [-110, 110]) g.shots.push({ kind: 'beam', x: b.x + b.w / 2 - 8 + off, y: top, w: 16, h: 11 * T - top, warn: 1.1, life: 1.5, color: '#f43f5e' });
        }
        if (b.t > 2.4) { b.state = 'patrol'; b.t = 0; }
        break;
      case 'descend':
        b.y = Math.min(groundY, b.y + 150 * dt);
        if (b.y >= groundY) { b.state = 'grounded'; b.t = 0; g.shake(6, 0.25); g.sound('drop'); }
        break;
      case 'grounded': if (b.t > (b.phase2 ? 1.9 : 2.5)) { b.state = 'ascend'; b.t = 0; } break;
      case 'ascend': b.y = Math.max(hoverY, b.y - 120 * dt); if (b.y <= hoverY) { b.state = 'patrol'; b.t = 0; } break;
    }
    b.vx = 0;
  },
};

// ---------------- 그리기 ----------------
export function drawEnemy(g, ctx, e) {
  const col = e.flash > 0 ? '#ffffff' : e.color;
  const x = e.x, y = e.y, t = e.t, dir = e.dir || 1;
  ctx.save();
  if (e.hidden) ctx.globalAlpha = 0.15;
  const eyes = (ex, ey, color = '#fff', r = 1.6) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill(); };
  switch (e.type) {
    case 'slime': case 'minislime': case 'magmaSlime': {
      const sq = Math.sin(t * 8) * 1.5;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x, y + e.h); ctx.bezierCurveTo(x - 1, y - 4 + sq, x + e.w + 1, y - 4 + sq, x + e.w, y + e.h); ctx.fill();
      if (e.type === 'magmaSlime') { ctx.fillStyle = '#fde047'; ctx.fillRect(x + 5, y + e.h - 6, 3, 2); ctx.fillRect(x + e.w - 9, y + e.h - 9, 3, 2); }
      ctx.fillStyle = '#fff';
      const ey = y + e.h * 0.35;
      ctx.fillRect(x + e.w / 2 + dir * 3 - 5, ey, 3, 4); ctx.fillRect(x + e.w / 2 + dir * 3 + 2, ey, 3, 4);
      break;
    }
    case 'drone': {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      const wf = Math.sin(t * 40) * 3;
      ctx.beginPath(); ctx.ellipse(x + 6, y - 1, 6, 3 + wf * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + e.w - 6, y - 1, 6, 3 - wf * 0.3, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + e.h / 2 + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + e.w / 2 - 2, y + 3, 3, e.h - 4); ctx.fillRect(x + e.w / 2 + 4, y + 4, 2, e.h - 6);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(x + e.w / 2 + dir * 6 - 1, y + 5, 3, 3);
      break;
    }
    case 'turret': {
      const warn = (e.cool ?? 1) < 0.35;
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#475569'; roundRect(ctx, x - 1, y + e.h - 8, e.w + 2, 8, 2);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h - 8, e.w / 2, Math.PI, 0); ctx.fill();
      const ang = Math.atan2(g.p.y + 12 - (y + 8), g.p.x + 8 - (x + e.w / 2));
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x + e.w / 2, y + e.h - 10); ctx.lineTo(x + e.w / 2 + Math.cos(ang) * 14, y + e.h - 10 + Math.sin(ang) * 14); ctx.stroke();
      eyes(x + e.w / 2, y + e.h - 12, warn ? '#ef4444' : '#22d3ee', 3);
      break;
    }
    case 'frog': {
      const air = !e.onGround, cx = x + e.w / 2;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(cx, y + e.h - 6, e.w / 2, air ? 8 : 7, 0, 0, Math.PI * 2); ctx.fill();
      // 뒷다리
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#4d7c0f';
      if (air) { ctx.fillRect(cx - dir * 12 - 3, y + e.h - 4, 6, 3); ctx.fillRect(cx - dir * 6 - 3, y + e.h - 1, 6, 3); }
      else { ctx.beginPath(); ctx.ellipse(cx - dir * 7, y + e.h - 3, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
      // 배 · 눈
      ctx.fillStyle = '#d9f99d'; ctx.beginPath(); ctx.ellipse(cx + dir * 3, y + e.h - 4, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      for (const k of [-4, 4]) { eyes(cx + k + dir * 3, y + e.h - 13, '#fef08a', 3.2); eyes(cx + k + dir * 4, y + e.h - 13, '#111', 1.4); }
      ctx.fillStyle = '#f97316'; ctx.fillRect(cx - 6, y + e.h - 9, 2, 2); ctx.fillRect(cx + 1, y + e.h - 11, 2, 2); // 독 반점
      break;
    }
    case 'crystalBug': {
      const cx = x + e.w / 2, glow = e.state === 'charge' ? 0.5 + Math.sin(t * 30) * 0.5 : 0;
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#334155';
      ctx.beginPath(); ctx.ellipse(cx, y + e.h - 5, e.w / 2, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) { const lg = Math.sin(t * 14 + k) * 2; ctx.beginPath(); ctx.moveTo(cx + k * 6, y + e.h - 2); ctx.lineTo(cx + k * 6 + lg, y + e.h + 1); ctx.stroke(); }
      // 등의 수정 3개
      for (const [ox, hh] of [[-6, 9], [0, 13], [6, 9]]) {
        ctx.fillStyle = glow > 0.5 ? '#ecfeff' : col;
        ctx.beginPath(); ctx.moveTo(cx + ox - 3, y + e.h - 8); ctx.lineTo(cx + ox, y + e.h - 8 - hh); ctx.lineTo(cx + ox + 3, y + e.h - 8); ctx.fill();
      }
      eyes(cx + dir * 9, y + e.h - 6, '#f0abfc', 1.6);
      break;
    }
    case 'charger': {
      const bx = x + (e.state === 'windup' ? Math.sin(t * 60) * 1.5 : 0);
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.state === 'windup' ? '#dc2626' : col);
      roundRect(ctx, bx, y + 2, e.w, e.h - 6, 8);
      ctx.fillStyle = '#78350f';
      const lg = e.state === 'charge' ? Math.sin(t * 30) * 2 : 0;
      ctx.fillRect(bx + 4 + lg, y + e.h - 5, 4, 5); ctx.fillRect(bx + e.w - 8 - lg, y + e.h - 5, 4, 5);
      const front = dir > 0 ? bx + e.w : bx;
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath(); ctx.moveTo(front - dir * 4, y + 12); ctx.lineTo(front + dir * 6, y + 6); ctx.lineTo(front - dir, y + 15); ctx.fill();
      ctx.fillStyle = '#fca5a5'; ctx.fillRect(front - dir * 9 - 1, y + 6, 3, 3);
      break;
    }
    case 'bat': {
      const flap = e.state === 'hang' ? 0.1 : Math.sin(t * 22) * 0.8;
      ctx.fillStyle = col;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(x + e.w / 2 + s * 4, y + 6); ctx.rotate(s * flap);
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(s * 13, -6); ctx.lineTo(s * 10, 2); ctx.lineTo(s * 6, -1); ctx.lineTo(0, 4); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + 7, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
      eyes(x + e.w / 2 - 2.5, y + 6, '#fde047', 1.4); eyes(x + e.w / 2 + 2.5, y + 6, '#fde047', 1.4);
      break;
    }
    case 'skeleton': {
      const step = Math.abs(e.vx) > 1 ? Math.sin(t * 10) * 2 : 0;
      ctx.fillStyle = col;
      ctx.fillRect(x + 5 + step, y + e.h - 7, 3, 7); ctx.fillRect(x + e.w - 8 - step, y + e.h - 7, 3, 7); // 다리
      ctx.fillRect(x + 6, y + 12, e.w - 12, 10);                                                       // 몸
      ctx.fillStyle = '#d6d3d1'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 7, y + 13 + i * 3, e.w - 14, 1);
      ctx.fillStyle = col; roundRect(ctx, x + 4, y, e.w - 8, 12, 4);                                 // 머리
      eyes(x + e.w / 2 + dir * 3 - 2, y + 5, '#0f172a', 1.8); eyes(x + e.w / 2 + dir * 3 + 3, y + 5, '#0f172a', 1.8);
      // 방패 (앞쪽)
      const sx = dir > 0 ? x + e.w - 3 : x - 5;
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#64748b'; roundRect(ctx, sx, y + 9, 8, 15, 3);
      ctx.fillStyle = '#facc15'; ctx.fillRect(sx + 3, y + 12, 2, 9);
      break;
    }
    case 'ghost': {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + e.w / 2, y + 10, e.w / 2, Math.PI, 0);
      const wv = Math.sin(t * 6) * 2;
      ctx.lineTo(x + e.w, y + e.h); ctx.lineTo(x + e.w * 0.75, y + e.h - 4 + wv); ctx.lineTo(x + e.w / 2, y + e.h); ctx.lineTo(x + e.w * 0.25, y + e.h - 4 - wv); ctx.lineTo(x, y + e.h);
      ctx.fill();
      eyes(x + e.w / 2 + dir * 2 - 4, y + 9, '#1e1b4b', 2.2); eyes(x + e.w / 2 + dir * 2 + 4, y + 9, '#1e1b4b', 2.2);
      ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.ellipse(x + e.w / 2 + dir * 2, y + 16, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'scorpion': {
      ctx.fillStyle = col;
      roundRect(ctx, x + 4, y + 6, e.w - 8, e.h - 8, 5);
      ctx.fillRect(x + 4, y + e.h - 3, 3, 3); ctx.fillRect(x + 12, y + e.h - 3, 3, 3); ctx.fillRect(x + e.w - 8, y + e.h - 3, 3, 3);
      // 꼬리 (조준 중엔 높이 듦)
      const back = dir > 0 ? x + 4 : x + e.w - 4, up = e.state === 'aim' ? 14 : 9;
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(back, y + 8); ctx.quadraticCurveTo(back - dir * 10, y - up, back + dir * 4, y - up + 4); ctx.stroke();
      ctx.fillStyle = e.state === 'aim' ? '#a3e635' : '#78350f'; ctx.beginPath(); ctx.arc(back + dir * 5, y - up + 5, 3, 0, Math.PI * 2); ctx.fill();
      // 집게
      const front = dir > 0 ? x + e.w - 3 : x + 3;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(front, y + 8, 4, 0, Math.PI * 2); ctx.fill();
      eyes(front - dir * 7, y + 8, '#111', 1.4);
      break;
    }
    case 'cactus': {
      const sw = e.swell ? 1 + Math.sin(t * 40) * 0.05 + 0.08 : 1;
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.swell ? '#22c55e' : col);
      const cw = 12 * sw;
      roundRect(ctx, x + e.w / 2 - cw / 2, y, cw, e.h, 6);
      roundRect(ctx, x - 2, y + 10, 7, 10, 3); roundRect(ctx, x + e.w - 5, y + 6, 7, 10, 3);
      ctx.fillStyle = '#bbf7d0';
      for (let i = 0; i < 4; i++) { ctx.fillRect(x + e.w / 2 - cw / 2 - 2, y + 5 + i * 6, 2, 1); ctx.fillRect(x + e.w / 2 + cw / 2, y + 7 + i * 6, 2, 1); }
      eyes(x + e.w / 2 - 2.5, y + 8, '#14532d', 1.3); eyes(x + e.w / 2 + 2.5, y + 8, '#14532d', 1.3);
      break;
    }
    case 'snowman': {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h - 9, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + 9, 7, 0, Math.PI * 2); ctx.fill();
      eyes(x + e.w / 2 + dir * 2 - 2.5, y + 7, '#0f172a', 1.3); eyes(x + e.w / 2 + dir * 2 + 2.5, y + 7, '#0f172a', 1.3);
      ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(x + e.w / 2, y + 9); ctx.lineTo(x + e.w / 2 + dir * 7, y + 10); ctx.lineTo(x + e.w / 2, y + 11); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 4, y + 14, e.w - 8, 3);
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
      const arm = e.throwT > 0 ? -12 : -2;
      ctx.beginPath(); ctx.moveTo(x + e.w / 2 + dir * 8, y + 18); ctx.lineTo(x + e.w / 2 + dir * 16, y + 18 + arm); ctx.stroke();
      break;
    }
    case 'penguin': {
      const slide = e.state === 'slide';
      ctx.save();
      if (slide) { ctx.translate(x + e.w / 2, y + e.h - 6); ctx.rotate(dir * Math.PI / 2); ctx.translate(-(x + e.w / 2), -(y + e.h - 6)); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + e.h / 2 + 1, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.ellipse(x + e.w / 2 + dir * 2, y + e.h / 2 + 3, e.w / 3, e.h / 2.6, 0, 0, Math.PI * 2); ctx.fill();
      eyes(x + e.w / 2 + dir * 3, y + 6, '#0f172a', 1.5);
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(x + e.w / 2 + dir * 6, y + 8); ctx.lineTo(x + e.w / 2 + dir * 11, y + 10); ctx.lineTo(x + e.w / 2 + dir * 6, y + 11); ctx.fill();
      ctx.restore();
      break;
    }
    case 'fireSpirit': {
      const fl = Math.sin(t * 12) * 2;
      const gr = ctx.createRadialGradient(x + e.w / 2, y + e.h / 2 + 2, 2, x + e.w / 2, y + e.h / 2, 16);
      gr.addColorStop(0, e.flash > 0 ? '#fff' : '#fef08a'); gr.addColorStop(0.6, col); gr.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x + 2, y + e.h - 4); ctx.quadraticCurveTo(x + e.w / 2, y - 8 + fl, x + e.w - 2, y + e.h - 4); ctx.arc(x + e.w / 2, y + e.h - 6, e.w / 2 - 2, 0, Math.PI); ctx.fill();
      eyes(x + e.w / 2 + dir * 2 - 3, y + e.h / 2 + 2, '#7c2d12', 1.6); eyes(x + e.w / 2 + dir * 2 + 3, y + e.h / 2 + 2, '#7c2d12', 1.6);
      break;
    }
    case 'eagle': {
      const flap = e.state === 'dive' ? -0.9 : Math.sin(t * 10) * 0.6;
      ctx.fillStyle = col;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(x + e.w / 2, y + 7); ctx.rotate(s * flap);
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(s * 18, -4); ctx.lineTo(s * 14, 3); ctx.lineTo(0, 4); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + 9, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(x + e.w / 2 + dir * 8, y + 6, 4, 0, Math.PI * 2); ctx.fill();
      eyes(x + e.w / 2 + dir * 9, y + 5, '#111', 1.2);
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(x + e.w / 2 + dir * 11, y + 5); ctx.lineTo(x + e.w / 2 + dir * 16, y + 8); ctx.lineTo(x + e.w / 2 + dir * 11, y + 9); ctx.fill();
      break;
    }
    case 'cloud': {
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.charging && Math.floor(t * 12) % 2 ? '#94a3b8' : col);
      ctx.beginPath();
      ctx.ellipse(x + 12, y + 12, 12, 8, 0, 0, Math.PI * 2); ctx.ellipse(x + 24, y + 8, 13, 10, 0, 0, Math.PI * 2); ctx.ellipse(x + 31, y + 13, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      eyes(x + 19, y + 11, '#0f172a', 1.6); eyes(x + 27, y + 11, '#0f172a', 1.6);
      if (e.charging) { ctx.fillStyle = 'rgba(253,224,71,.35)'; ctx.fillRect(x + e.w / 2 - 9, y + e.h, 18, 400); }
      break;
    }
    case 'robot': {
      ctx.fillStyle = col;
      roundRect(ctx, x + 2, y + 6, e.w - 4, e.h - 12, 4);
      roundRect(ctx, x + 4, y, e.w - 8, 9, 3);
      ctx.fillStyle = '#334155'; ctx.fillRect(x + e.w / 2 - 1, y - 5, 2, 5);
      eyes(x + e.w / 2, y - 6, e.state === 'charge' ? '#f43f5e' : '#22d3ee', 2);
      const eyeOn = e.state === 'charge';
      ctx.fillStyle = eyeOn ? '#f43f5e' : '#67e8f9';
      ctx.fillRect(x + e.w / 2 + dir * 3 - 3, y + 3, 6, 3);
      if (eyeOn) { ctx.globalAlpha = 0.25 + (e.t / 0.7) * 0.4; ctx.fillRect(dir > 0 ? x + e.w : x - 300, y + 8, 300, 2); ctx.globalAlpha = e.hidden ? 0.15 : 1; }
      const wh = Math.abs(e.vx) > 1 ? t * 12 : 0;
      ctx.fillStyle = '#1f2937';
      for (const wx of [x + 6, x + e.w - 6]) { ctx.beginPath(); ctx.arc(wx, y + e.h - 4, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1;
      for (const wx of [x + 6, x + e.w - 6]) { ctx.beginPath(); ctx.moveTo(wx, y + e.h - 4); ctx.lineTo(wx + Math.cos(wh) * 4, y + e.h - 4 + Math.sin(wh) * 4); ctx.stroke(); }
      break;
    }
    case 'golem': {
      const crouch = (e.state === 'slam' && e.t < 0.45) ? 6 : 0;
      const flashCharge = e.state === 'charge' && e.t < 0.6 && Math.floor(e.t * 12) % 2;
      ctx.fillStyle = e.flash > 0 || flashCharge ? '#fff' : (e.state === 'stun' ? '#57534e' : col);
      roundRect(ctx, x, y + 14 + crouch, e.w, e.h - 14 - crouch, 8);
      roundRect(ctx, x + 10, y + crouch, e.w - 20, 22, 6);
      ctx.fillStyle = '#57534e';
      roundRect(ctx, x - 8, y + 22 + crouch, 12, 26, 5); roundRect(ctx, x + e.w - 4, y + 22 + crouch, 12, 26, 5);
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 30); ctx.lineTo(x + 20, y + 40); ctx.lineTo(x + 16, y + 50); ctx.stroke();
      ctx.fillStyle = e.state === 'stun' ? '#a8a29e' : (e.phase2 ? '#ef4444' : '#fb923c');
      ctx.fillRect(x + 16 + dir * 2, y + 8 + crouch, 6, 4); ctx.fillRect(x + e.w - 22 + dir * 2, y + 8 + crouch, 6, 4);
      if (e.state === 'stun') { ctx.font = '700 12px system-ui'; ctx.fillText('💫', x + e.w / 2 - 6, y - 4); }
      break;
    }
    case 'slimeKing': {
      const crouch = e.state === 'leap' && e.t < 0.55 ? 8 : 0;
      const sq = (e.squash ?? 0) * 30;
      const w = e.w + sq + crouch, hh = e.h - sq / 2 - crouch, bx = x + e.w / 2 - w / 2, by = y + e.h - hh;
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.phase2 ? '#16a34a' : col);
      ctx.beginPath(); ctx.moveTo(bx, by + hh); ctx.bezierCurveTo(bx - 4, by - hh * 0.35, bx + w + 4, by - hh * 0.35, bx + w, by + hh); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(bx + w * 0.3, by + hh * 0.3, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
      // 왕관
      ctx.fillStyle = '#facc15';
      const cx = x + e.w / 2, cy = by - 4;
      ctx.beginPath(); ctx.moveTo(cx - 14, cy + 8); ctx.lineTo(cx - 14, cy - 4); ctx.lineTo(cx - 7, cy + 2); ctx.lineTo(cx, cy - 7); ctx.lineTo(cx + 7, cy + 2); ctx.lineTo(cx + 14, cy - 4); ctx.lineTo(cx + 14, cy + 8); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, cy + 3, 2, 0, Math.PI * 2); ctx.fill();
      const ey = by + hh * 0.45;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx - 10 + dir * 3, ey, 6, 7, 0, 0, Math.PI * 2); ctx.ellipse(cx + 10 + dir * 3, ey, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
      eyes(cx - 10 + dir * 5, ey + 1, '#052e16', 3); eyes(cx + 10 + dir * 5, ey + 1, '#052e16', 3);
      ctx.strokeStyle = '#052e16'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 17, ey - 10); ctx.lineTo(cx - 5, ey - 7); ctx.moveTo(cx + 17, ey - 10); ctx.lineTo(cx + 5, ey - 7); ctx.stroke();
      break;
    }
    case 'mech': {
      const grounded = e.state === 'grounded';
      // 프로펠러
      ctx.fillStyle = '#cbd5e1';
      const pw = grounded ? 10 : Math.abs(Math.sin(t * 40)) * 22 + 4;
      for (const px of [x + 14, x + e.w - 14]) { ctx.fillRect(px - 1, y - 8, 2, 8); ctx.fillRect(px - pw / 2, y - 10, pw, 3); }
      ctx.fillStyle = e.flash > 0 ? '#fff' : (grounded ? '#334155' : col);
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e293b'; ctx.fillRect(x + 10, y + e.h / 2 + 4, e.w - 20, 4);
      ctx.fillStyle = grounded ? '#64748b' : (e.phase2 ? '#ef4444' : '#f43f5e');
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h / 2 - 2, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + e.w / 2 + 3, y + e.h / 2 - 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#334155'; ctx.fillRect(x + e.w / 2 - 4, y + e.h - 4, 8, 8);
      if (grounded) { // 고장 연기
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#9ca3af';
        for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1; ctx.beginPath(); ctx.arc(x + e.w / 2 + Math.sin(i + t) * 8, y - k * 30, 4 + k * 6, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.font = '700 12px system-ui'; ctx.fillText('💫', x + e.w / 2 - 6, y - 14);
      }
      break;
    }
  }
  ctx.restore();
  if (!e.boss && e.hp < e.maxHp && !e.hidden) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x, e.y - 7, e.w, 3);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(e.x, e.y - 7, e.w * Math.max(0, e.hp / e.maxHp), 3);
  }
}
