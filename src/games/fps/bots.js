// 스쿼드 슈터 - 봇 AI: 보고(시야·소리) → 조준하고(반응 시간·오차) → 움직임(길찾기·옆걸음·엄폐)
// 봇도 플레이어와 같은 무기·이동 규칙을 씀 (game.stepActor / game.tryFire)

const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const rnd = (a, b) => a + Math.random() * (b - a);
// 무기별로 좋아하는 교전 거리(m)
const PREF = { ar: 17, smg: 9, shotgun: 5, sniper: 34, lmg: 20, pistol: 10, knife: 1.2, grenade: 14 };

export function newAI() {
  return { target: null, senseT: Math.random() * 0.2, reactT: 0, errX: 0, errY: 0, errT: 0, burst: 0, pause: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    engageT: 0, headOnly: false, goal: null, path: null, pi: 0, repathT: 0, stuckT: 0, lastX: 0, lastZ: 0, fails: 0, alertT: 0, chase: null, lastSeenT: -9, nadeCd: rnd(4, 12), crouchT: 0, jumpCd: 0 };
}

/** 총소리·피격 등으로 주변 적 봇에게 위치를 알림 */
export function alertBots(game, x, z, team, radius) {
  for (const b of game.actors) {
    if (!b.ai || !b.alive || b.remote || b.zombie || b.team === team) continue;
    if ((b.x - x) ** 2 + (b.z - z) ** 2 > radius * radius) continue;
    b.ai.alertT = 3;
    if (!b.ai.target && !b.ai.chase) b.ai.chase = [x + rnd(-3, 3), z + rnd(-3, 3)];
  }
}

function eyeY(a) { return a.y + (a.crouch ? 1.05 : 1.6) * (a.scale ?? 1); }

function sense(game, a) {
  const ai = a.ai, D = game.diff, W = game.world;
  let best = null, bd = Infinity;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  for (const e of game.actors) {
    if (!e.alive || e === a || e.team === a.team) continue;
    const dx = e.x - a.x, dz = e.z - a.z, d = Math.hypot(dx, dz);
    if (d > D.see) continue;
    // 시야각: 평소엔 앞쪽 약 130°, 경계 중이거나 아주 가까우면 사방
    if (!(ai.alertT > 0 || d < 6 || e === ai.target)) { if ((dx * fx + dz * fz) / (d || 1) < 0.42) continue; }
    const sc = d * (e === ai.target ? 0.6 : 1);
    if (sc >= bd) continue;
    const ey = eyeY(a), s = e.scale ?? 1;
    // 몸통이 보이면 몸통을, 엄폐물 위로 머리만 보이면 머리를 겨눔
    const chest = W.los(a.x, ey, a.z, e.x, e.y + (e.crouch ? 0.7 : 1.15) * s, e.z);
    if (chest || W.los(a.x, ey, a.z, e.x, e.y + (e.crouch ? 1.0 : 1.58) * s, e.z)) { best = e; bd = sc; ai.headOnly = !chest; }
  }
  if (best) {
    if (ai.target !== best) ai.reactT = D.react * rnd(0.7, 1.4) * (ai.alertT > 0 ? 0.7 : 1);
    ai.target = best; ai.lastSeen = [best.x, best.z]; ai.lastSeenT = game.time; ai.chase = null; ai.alertT = Math.max(ai.alertT, 2);
  } else if (ai.target && (!ai.target.alive || game.time - ai.lastSeenT > 0.5)) {
    if (ai.target.alive && ai.lastSeen) { ai.chase = ai.lastSeen; ai.goal = null; }
    ai.target = null;
  }
}

function pickGoal(game, a) {
  const ai = a.ai, W = game.world;
  if (ai.chase) { const c = ai.chase; ai.chase = null; return c; }
  // 체력·탄약이 부족하면 보급 상자로
  const w = a.weapons[0];
  const need = a.hp < 45 ? 'health' : w && w.reserve + w.mag < w.def.mag ? 'ammo' : null;
  if (need) {
    let bp = null, bd2 = 1e9;
    for (const p of game.pickups) { if (p.type !== need || p.t > 0 || p.y > 1) continue; const d2 = (p.x - a.x) ** 2 + (p.z - a.z) ** 2; if (d2 < bd2) { bd2 = d2; bp = p; } }
    if (bp && bd2 < 45 * 45) return [bp.x, bp.z];
  }
  // 적이 있을 법한 곳으로: 무작위 후보 몇 곳 중 적과 가까운 곳 (전투가 끊기지 않게)
  const foes = game.actors.filter((e) => e.alive && e.team !== a.team);
  const foe = foes[Math.floor(Math.random() * foes.length)];
  let best = W.randomFree(), bs = Infinity;
  for (let k = 0; k < 5; k++) {
    const c = W.randomFree();
    const s = foe ? Math.hypot(c[0] - foe.x, c[1] - foe.z) + rnd(0, 14) : Math.random();
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}

/** 길을 따라 걷기 → [wx, wz] (가고 싶은 방향, 길이 1) */
function follow(game, a, dt) {
  const ai = a.ai, W = game.world;
  ai.repathT -= dt;
  if (!ai.goal || Math.hypot(ai.goal[0] - a.x, ai.goal[1] - a.z) < 1.3 || ai.fails > 2) { ai.goal = pickGoal(game, a); ai.path = null; ai.fails = 0; }
  if (!ai.path || ai.repathT <= 0) {
    ai.path = W.path(a.x, a.z, ai.goal[0], ai.goal[1]); ai.pi = 0; ai.repathT = rnd(2.5, 4);
    if (!ai.path) { ai.goal = null; return [0, 0]; }
  }
  const P = ai.path;
  // 다음 지점들을 건너뛸 수 있으면 건너뜀 (모서리를 부드럽게 돎)
  while (ai.pi < P.length - 1 && (Math.hypot(P[ai.pi][0] - a.x, P[ai.pi][1] - a.z) < 0.7 || W.walkable(a.x, a.z, P[ai.pi + 1][0], P[ai.pi + 1][1]))) ai.pi++;
  const [tx, tz] = P[ai.pi], dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (ai.pi >= P.length - 1 && d < 0.8) { ai.goal = null; return [0, 0]; }
  return [dx / (d || 1), dz / (d || 1)];
}

export function updateBot(game, a, dt) {
  const ai = a.ai, D = game.diff;
  ai.alertT -= dt; ai.nadeCd -= dt; ai.jumpCd -= dt;
  if ((ai.senseT -= dt) <= 0) { ai.senseT = rnd(0.1, 0.2); sense(game, a); }
  const t = ai.target, w = a.weapons[a.cur], id = w.def.id;
  let wx = 0, wz = 0, sprint = false, jump = false, wantYaw = null, wantPitch = 0;
  a.ads = false;

  if (t && t.alive) {
    const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz), s = t.scale ?? 1;
    // 조준: 몸통(어려움에선 가끔 머리) + 오차. 오차는 0.35초마다 새로 정함 (움직이는 적·먼 적일수록 큼)
    if ((ai.errT -= dt) <= 0) {
      ai.errT = 0.35;
      const mv = Math.hypot(t.vx ?? 0, t.vz ?? 0) / 5, k = D.err * (1 + mv * 1.2 + (ai.reactT > 0 ? 1.5 : 0));
      ai.errX = (Math.random() - 0.5) * 2 * k; ai.errY = (Math.random() - 0.5) * 2 * k * 0.7;
      ai.head = Math.random() < (D === game.DIFFS.hard ? 0.3 : 0.1);
    }
    const ty = t.y + (ai.head || ai.headOnly ? (t.crouch ? 1.0 : 1.58) : (t.crouch ? 0.7 : 1.15)) * s;
    wantYaw = Math.atan2(-dx, -dz) + ai.errX;
    wantPitch = Math.atan2(ty - eyeY(a), d) + ai.errY;
    ai.reactT -= dt;
    const off = Math.abs(wrap(wantYaw - a.yaw));
    // 사격
    const pref = PREF[id] ?? 15;
    if (w.def.melee) { if (d < w.def.reach - 0.3 && off < 0.5) game.tryFire(a); }
    else if (ai.reactT <= 0 && off < 0.09 + 1.2 / Math.max(4, d) && d < (id === 'shotgun' ? 22 : 150)) {
      a.ads = d > 12 && id !== 'shotgun';
      if (ai.pause > 0) ai.pause -= dt;
      else if (ai.burst <= 0) { ai.burst = w.def.auto ? Math.round(rnd(D.burst[0], D.burst[1])) : 1; ai.pause = 0; }
      if (ai.pause <= 0 && ai.burst > 0 && game.tryFire(a)) { if (--ai.burst <= 0) ai.pause = w.def.auto ? rnd(0.2, 0.55) : rnd(0.12, 0.4) + (id === 'sniper' ? 0.5 : 0); }
    }
    // 수류탄: 중거리에서 가끔
    if (ai.nadeCd <= 0 && d > 9 && d < 24 && a.nades > 0 && Math.random() < dt * 0.25) { ai.nadeCd = rnd(9, 18); game.throwGrenade(a, Math.atan2(-dx, -dz), 0.25 + d * 0.012); }
    // 이동: 거리 맞추기 + 옆걸음
    if ((ai.strafeT -= dt) <= 0 || a.hitWall) { ai.strafeT = rnd(0.6, 1.5); ai.strafe = a.hitWall ? -ai.strafe : (Math.random() < 0.5 ? 1 : -1); ai.crouchT = d > 14 && Math.random() < 0.25 ? rnd(0.8, 1.6) : 0; }
    const nx = dx / (d || 1), nz = dz / (d || 1);
    let fwd = d > pref * 1.35 ? 1 : d < pref * 0.5 ? -0.8 : 0;
    if (w.def.melee) fwd = 1;
    // 5초 넘게 맞히지 못하면 자리를 박차고 다가감 (엄폐물을 사이에 둔 대치가 끝없이 이어지지 않게)
    ai.engageT = (ai.engageT ?? 0) + dt;
    if (ai.engageT > 5) { fwd = 1; ai.crouchT = 0; if (ai.engageT > 8) ai.engageT = 0; }
    if (ai.crouchT > 0 && !w.def.melee) { ai.crouchT -= dt; a.crouch = true; } else { a.crouch = false; wx = nx * fwd - nz * ai.strafe * (fwd ? 0.5 : 1); wz = nz * fwd + nx * ai.strafe * (fwd ? 0.5 : 1); }
    // 엄폐물 뒤 적에게 다가갈 때는 길찾기를 따름
    if (fwd > 0 && !game.world.walkable(a.x, a.z, t.x, t.z)) { ai.goal = [t.x, t.z]; const f = follow(game, a, dt); wx = f[0]; wz = f[1]; }
  } else {
    a.crouch = false;
    const f = follow(game, a, dt); wx = f[0]; wz = f[1];
    if (wx || wz) wantYaw = Math.atan2(-wx, -wz);
    sprint = !!ai.path && ai.path.length - ai.pi > 6 && ai.alertT <= 0;
  }
  // 막혔는지 확인: 1초 동안 거의 못 움직였으면 뛰어 보고, 길을 다시 찾고, 옆걸음 방향을 바꿈
  if ((ai.stuckT += dt) > 1) {
    if (Math.hypot(a.x - ai.lastX, a.z - ai.lastZ) < 0.5 && (wx || wz)) { jump = true; ai.path = null; ai.fails++; ai.strafe = -ai.strafe; }
    ai.stuckT = 0; ai.lastX = a.x; ai.lastZ = a.z;
  }
  // 재장전 · 무기 바꾸기
  if (!w.def.melee && !w.def.throw && a.reloadT <= 0) {
    if (w.mag === 0 && w.reserve === 0) { const next = a.weapons.findIndex((x, i) => i !== a.cur && (x.def.melee || x.mag + x.reserve > 0) && !x.def.throw); if (next >= 0) game.switchWeapon(a, next); }
    else if (w.mag === 0 || (!t && w.mag < w.def.mag * 0.45 && w.reserve > 0)) game.startReload(a);
  }
  if (a.cur !== 0 && a.weapons[0].mag + a.weapons[0].reserve > 0 && !t) game.switchWeapon(a, 0);
  // 조준 방향으로 부드럽게 돌기
  if (wantYaw !== null) {
    const dy = wrap(wantYaw - a.yaw), sp = D.turn * (t ? 1 : 0.8) * (1 + Math.min(2, Math.abs(dy)));
    a.yaw += Math.max(-sp * dt, Math.min(sp * dt, dy));
  }
  a.pitch += (wantPitch - a.pitch) * Math.min(1, dt * D.turn * 1.6);
  a.hitWall = false;
  game.stepActor(a, wx, wz, dt, { sprint, jump });
}

/** 좀비: 거리 지도를 따라 가장 가까운 사람에게 → 닿으면 할큄 */
export function updateZombie(game, a, dt) {
  const W = game.world, flow = game.flow;
  let t = null, bd = Infinity;
  for (const e of game.actors) { if (!e.alive || e.team === a.team) continue; const d = Math.hypot(e.x - a.x, e.z - a.z); if (d < bd) { bd = d; t = e; } }
  let wx = 0, wz = 0, jump = false;
  if (t) {
    if (bd < 7 && W.walkable(a.x, a.z, t.x, t.z)) { wx = (t.x - a.x) / (bd || 1); wz = (t.z - a.z) / (bd || 1); }
    else if (flow) { // 이웃 칸 중 사람에게 더 가까운 칸으로
      const c = W.nearFree(a.x, a.z), nw = W.nw, ci = c % nw, cj = (c - ci) / nw;
      let best = c, bv = flow[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nw || j >= W.nh) continue;
        const n = j * nw + i; if (!W.canStep(c, n) || (di && dj && (!W.canStep(c, cj * nw + i) || !W.canStep(c, j * nw + ci)))) continue;
        const v = flow[n] + (di && dj ? 0.4 : 0); if (v < bv) { bv = v; best = n; }
      }
      const [px, pz] = W.cellPos(best), dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { wx = dx / d; wz = dz / d; }
    }
    if (wx || wz) { const dy = wrap(Math.atan2(-wx, -wz) - a.yaw); a.yaw += Math.max(-6 * dt, Math.min(6 * dt, dy)); }
    if (bd < a.weapons[0].def.reach * (a.scale ?? 1) - 0.2 && Math.abs(t.y - a.y) < 2.2) { a.yaw = Math.atan2(-(t.x - a.x), -(t.z - a.z)); game.tryFire(a); }
    // 플레이어가 높은 곳에 있어 닿지 못하면 가끔 뛰어오름
    if (bd < 2.5 && t.y - a.y > 0.6 && Math.random() < dt * 2) jump = true;
  }
  const ai = a.ai;
  if ((ai.stuckT += dt) > 1.2) { if (Math.hypot(a.x - ai.lastX, a.z - ai.lastZ) < 0.3 && bd > 2.5) jump = true; ai.stuckT = 0; ai.lastX = a.x; ai.lastZ = a.z; }
  a.pitch = 0;
  game.stepActor(a, wx, wz, dt, { jump });
}
