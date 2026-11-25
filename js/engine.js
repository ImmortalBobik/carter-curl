// Deterministic curling engine for Carter Curl (browser ESM & Node testable).
// Sheet axes: x = across the sheet, z = down the sheet. Stones are thrown toward -z.

export const STONE_R = 0.34;
export const HALF_W = 2.4;
export const NEAR_Z = 10.6;      // back boards behind the hack
export const RELEASE_Z = 8.0;    // where the stone leaves the thrower's hand
export const HOG_Z = -3.5;       // far hog line: stone must fully cross it
export const TEE_Z = -8.0;       // centre of the house
export const HOUSE_R = 1.8;      // outer ring (12-foot)
export const RING_RADII = [1.8, 1.2, 0.6, 0.16];
export const BACK_Z = TEE_Z - HOUSE_R; // back line
export const FAR_Z = -11.0;      // far boards

export const MU = 1.25;          // ice deceleration (units/s^2)
export const MU_SWEEP = 1.05;    // deceleration while swept
export const CURL_K = 0.62;      // lateral curl strength
export const CURL_SWEEP = 0.55;  // sweeping straightens the stone
export const RESTITUTION = 0.88;
export const STOP_SPEED = 0.03;
export const FIXED_DT = 1 / 120;
export const SPEED_MIN = 4.8;
export const SPEED_SPAN = 4.8;
export const CHARGE_RATE = 0.55; // power units per second while charging
export const BROOM_LIMIT = 2.0;

export const TEAMS = ['carter', 'white'];
export const other = (team) => (team === 'carter' ? 'white' : 'carter');

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function powerToSpeed(p) {
  return SPEED_MIN + clamp(p, 0, 1) * SPEED_SPAN;
}

// Power needed for an unswept straight stone to stop at a given z (power bar markers).
export function powerForStopAt(z) {
  const d = RELEASE_Z - z;
  return clamp((Math.sqrt(2 * MU * d) - SPEED_MIN) / SPEED_SPAN, 0, 1);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function makeStone(id, team, broomX, spin, power) {
  const dx = broomX;
  const dz = TEE_Z - RELEASE_Z;
  const len = Math.hypot(dx, dz);
  const speed = powerToSpeed(power);
  return {
    id,
    team,
    x: 0,
    z: RELEASE_Z,
    vx: (dx / len) * speed,
    vz: (dz / len) * speed,
    spin,
    angle: 0,
    moving: true,
    touched: false
  };
}

function cloneStones(stones) {
  return stones.map((s) => ({ ...s }));
}

// One fixed physics tick. `sweepId` is the stone being swept (or null).
// Returns { impacts: [{x,z,speed,a,b}], removed: [stone] } and mutates `stones`.
export function physicsTick(stones, dt, sweepId = null) {
  const impacts = [];
  const removed = [];

  for (const s of stones) {
    if (!s.moving) continue;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < STOP_SPEED) {
      s.vx = 0;
      s.vz = 0;
      s.moving = false;
      continue;
    }
    const swept = s.id === sweepId;
    const ux = s.vx / sp;
    const uz = s.vz / sp;

    // Curl: perpendicular push, stronger as the stone slows down.
    if (s.spin !== 0) {
      const k = (CURL_K * s.spin * (swept ? CURL_SWEEP : 1)) / (0.55 + sp);
      // Thrower's right of travel direction is (-uz, ux).
      s.vx += -uz * k * dt;
      s.vz += ux * k * dt;
    }

    const decel = (swept ? MU_SWEEP : MU) * dt;
    const sp2 = Math.hypot(s.vx, s.vz);
    const ns = Math.max(0, sp2 - decel);
    if (ns <= STOP_SPEED) {
      s.vx = 0;
      s.vz = 0;
      s.moving = false;
    } else {
      s.vx *= ns / sp2;
      s.vz *= ns / sp2;
    }

    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.angle += s.spin * (0.6 + ns * 0.35) * dt;
  }

  // Granite-on-granite collisions (equal mass).
  for (let i = 0; i < stones.length; i++) {
    const a = stones[i];
    for (let j = i + 1; j < stones.length; j++) {
      const b = stones[j];
      if (!a.moving && !b.moving) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const minD = STONE_R * 2;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const nx = d2 > 1e-8 ? dx / d : 1;
      const nz = d2 > 1e-8 ? dz / d : 0;
      const overlap = minD - d;
      a.x -= nx * overlap * 0.5;
      a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.z += nz * overlap * 0.5;
      const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rv <= 0) continue;
      const jImp = ((1 + RESTITUTION) * rv) / 2;
      a.vx -= jImp * nx;
      a.vz -= jImp * nz;
      b.vx += jImp * nx;
      b.vz += jImp * nz;
      a.moving = true;
      b.moving = true;
      a.touched = true;
      b.touched = true;
      // Contact scrubs off most of the rotation-driven curl.
      a.spin *= 0.5;
      b.spin *= 0.5;
      impacts.push({ x: a.x + nx * STONE_R, z: a.z + nz * STONE_R, speed: rv, a: a.id, b: b.id });
    }
  }

  // Out of play: touching side boards or entirely past the back line.
  for (let i = stones.length - 1; i >= 0; i--) {
    const s = stones[i];
    if (Math.abs(s.x) > HALF_W - STONE_R || s.z + STONE_R < BACK_Z || s.z > NEAR_Z) {
      removed.push(s);
      stones.splice(i, 1);
    }
  }

  return { impacts, removed };
}

export function anyMoving(stones) {
  return stones.some((s) => s.moving);
}

// Hog rule: a delivered stone that stops short of the far hog line without touching anything is removed.
export function applyHogRule(stones, shooterId) {
  const idx = stones.findIndex((s) => s.id === shooterId);
  if (idx < 0) return null;
  const s = stones[idx];
  if (!s.touched && s.z - STONE_R > HOG_Z) {
    stones.splice(idx, 1);
    return s;
  }
  return null;
}

export function distToTee(s) {
  return Math.hypot(s.x, s.z - TEE_Z);
}

export function inHouse(s) {
  return distToTee(s) <= HOUSE_R + STONE_R;
}

// Standard curling count: the team with the shot stone scores one per stone closer than the opponent's best.
export function scoreEnd(stones) {
  const sorted = stones.filter(inHouse).sort((a, b) => distToTee(a) - distToTee(b));
  if (sorted.length === 0) return { team: null, points: 0, counting: [] };
  const team = sorted[0].team;
  const counting = [];
  for (const s of sorted) {
    if (s.team !== team) break;
    counting.push(s.id);
  }
  return { team, points: counting.length, counting };
}

// Full deterministic run of one delivery on a copy of the sheet.
export function simulateThrow(stones, team, broomX, spin, power, maxTime = 14) {
  const sim = cloneStones(stones);
  const shot = makeStone(-1, team, broomX, spin, power);
  sim.push(shot);
  let t = 0;
  while (anyMoving(sim) && t < maxTime) {
    physicsTick(sim, FIXED_DT, null);
    t += FIXED_DT;
  }
  applyHogRule(sim, -1);
  return sim;
}

function evaluateFor(team, stones) {
  const res = scoreEnd(stones);
  let v = res.team === team ? res.points * 10 : res.team ? -res.points * 10 : 0;
  for (const s of stones) {
    if (!inHouse(s)) continue;
    const w = HOUSE_R + STONE_R - distToTee(s);
    v += s.team === team ? w * 0.9 : -w * 0.9;
  }
  // Mild interest in centre guards that protect the house.
  for (const s of stones) {
    if (s.team === team && s.z < HOG_Z && s.z > TEE_Z + HOUSE_R + 0.4 && Math.abs(s.x) < 0.9) v += 0.6;
  }
  return v;
}

export function planShot(stones, team, isHammer, rand, skill = 1) {
  let best = { score: -Infinity, broomX: 0, spin: 1, power: powerForStopAt(TEE_Z) };
  for (const spin of [-1, 1]) {
    for (let bx = -1.8; bx <= 1.8001; bx += 0.2) {
      for (let p = 0.1; p <= 1.0001; p += 0.05) {
        const after = simulateThrow(stones, team, bx, spin, p);
        let sc = evaluateFor(team, after);
        if (isHammer) sc += scoreEnd(after).team === team ? 2 : 0;
        // Small preference for softer, more forgiving shots.
        sc -= p * 0.3;
        if (sc > best.score) best = { score: sc, broomX: bx, spin, power: p };
      }
    }
  }
  const noise = 1 / Math.max(0.2, skill);
  return {
    broomX: clamp(best.broomX + gauss(rand) * 0.15 * noise, -BROOM_LIMIT, BROOM_LIMIT),
    spin: best.spin,
    power: clamp(best.power + gauss(rand) * 0.022 * noise, 0, 1),
    expected: best.score
  };
}

// ---------- Match state machine ----------

export function createGame(opts = {}) {
  const state = {
    seed: opts.seed ?? 20261125,
    rand: null,
    stonesPerTeam: opts.stonesPerTeam ?? 4,
    totalEnds: opts.totalEnds ?? 3,
    end: 1,
    scores: { carter: 0, white: 0 },
    endLog: [],
    firstTeam: 'carter',
    thrown: { carter: 0, white: 0 },
    stones: [],
    nextId: 1,
    phase: 'aim',
    timer: 0,
    broomX: 0.55,
    spin: -1,
    power: 0,
    chargeDir: 1,
    sweeping: false,
    shooterId: -1,
    aiPlan: null,
    lastResult: null,
    winner: null,
    accum: 0,
    fx: []
  };
  state.rand = mulberry32(state.seed);
  return state;
}

export function currentTeam(state) {
  const n = state.thrown.carter + state.thrown.white;
  return n % 2 === 0 ? state.firstTeam : other(state.firstTeam);
}

export function stonesLeft(state, team) {
  return state.stonesPerTeam - state.thrown[team];
}

export function isHammerThrow(state) {
  return state.thrown.carter + state.thrown.white === state.stonesPerTeam * 2 - 1;
}

export function setBroom(state, x) {
  if (state.phase === 'aim' || state.phase === 'charge') {
    state.broomX = clamp(x, -BROOM_LIMIT, BROOM_LIMIT);
  }
}

export function toggleSpin(state) {
  if (state.phase === 'aim' || state.phase === 'charge') {
    state.spin = state.spin === 1 ? -1 : 1;
    return true;
  }
  return false;
}

export function beginCharge(state) {
  if (state.phase !== 'aim' || currentTeam(state) !== 'carter') return false;
  state.phase = 'charge';
  state.power = 0;
  state.chargeDir = 1;
  return true;
}

function launch(state, team, broomX, spin, power) {
  const stone = makeStone(state.nextId++, team, broomX, spin, power);
  state.stones.push(stone);
  state.shooterId = stone.id;
  state.thrown[team] += 1;
  state.phase = 'travel';
  state.timer = 0;
  state.sweeping = false;
  state.fx.push({ type: 'launch', team, id: stone.id, power });
  return stone;
}

export function releaseThrow(state) {
  if (state.phase !== 'charge') return null;
  return launch(state, 'carter', state.broomX, state.spin, state.power);
}

export function setSweeping(state, on) {
  const s = state.stones.find((st) => st.id === state.shooterId);
  state.sweeping = !!on && state.phase === 'travel' && !!s && s.team === 'carter' && s.moving;
}

export function restartMatch(state) {
  const fresh = createGame({ seed: state.seed + 7919, stonesPerTeam: state.stonesPerTeam, totalEnds: state.totalEnds });
  Object.assign(state, fresh);
  state.fx.push({ type: 'newEnd', end: 1 });
}

function startEnd(state) {
  state.stones = [];
  state.thrown = { carter: 0, white: 0 };
  state.fx.push({ type: 'newEnd', end: state.end });
  beginTurn(state);
}

function beginTurn(state) {
  const team = currentTeam(state);
  state.power = 0;
  state.sweeping = false;
  state.timer = 0;
  state.shooterId = -1;
  if (team === 'carter') {
    state.phase = 'aim';
  } else {
    state.phase = 'ai';
    state.aiPlan = null;
  }
  state.fx.push({ type: 'turn', team });
}

export function stepGame(state, dt) {
  const ev = { impacts: [], removed: [], hog: null, settled: false, endScored: null, gameOver: false, launched: null };
  const cdt = Math.min(0.05, Math.max(0, dt));
  state.timer += cdt;

  if (state.phase === 'charge') {
    state.power += state.chargeDir * CHARGE_RATE * cdt;
    if (state.power >= 1) {
      state.power = 1;
      state.chargeDir = -1;
    } else if (state.power <= 0) {
      state.power = 0;
      state.chargeDir = 1;
    }
    return ev;
  }

  if (state.phase === 'ai') {
    if (!state.aiPlan) {
      // White Carter eases off when comfortably ahead, and bears down when behind.
      const lead = state.scores.white - state.scores.carter;
      const skill = lead >= 3 ? 0.6 : lead <= -2 ? 1.25 : 1;
      state.aiPlan = planShot(state.stones, 'white', isHammerThrow(state), state.rand, skill);
    }
    // White Carter sets the broom, then delivers.
    const k = 1 - Math.exp(-4 * cdt);
    state.broomX += (state.aiPlan.broomX - state.broomX) * k;
    state.spin = state.aiPlan.spin;
    state.power = Math.min(state.aiPlan.power, state.timer > 0.9 ? (state.timer - 0.9) * 1.4 : 0);
    if (state.timer > 1.6) {
      const p = state.aiPlan;
      const stone = launch(state, 'white', p.broomX, p.spin, p.power);
      ev.launched = stone;
    }
    return ev;
  }

  if (state.phase === 'travel') {
    state.accum += cdt;
    while (state.accum >= FIXED_DT) {
      state.accum -= FIXED_DT;
      const shooter = state.stones.find((s) => s.id === state.shooterId);
      if (state.sweeping && (!shooter || !shooter.moving)) state.sweeping = false;
      const r = physicsTick(state.stones, FIXED_DT, state.sweeping ? state.shooterId : null);
      for (const im of r.impacts) {
        ev.impacts.push(im);
        state.fx.push({ type: 'impact', ...im });
      }
      for (const s of r.removed) {
        ev.removed.push(s);
        state.fx.push({ type: 'out', x: s.x, z: s.z, team: s.team, id: s.id });
      }
    }
    if (!anyMoving(state.stones) && state.timer > 0.3) {
      state.accum = 0;
      const hog = applyHogRule(state.stones, state.shooterId);
      if (hog) {
        ev.hog = hog;
        state.fx.push({ type: 'hog', x: hog.x, z: hog.z, team: hog.team, id: hog.id });
      }
      state.sweeping = false;
      state.phase = 'settle';
      state.timer = 0;
      ev.settled = true;
    }
    return ev;
  }

  if (state.phase === 'settle') {
    if (state.timer > 0.75) {
      const done = state.thrown.carter >= state.stonesPerTeam && state.thrown.white >= state.stonesPerTeam;
      if (done) {
        const res = scoreEnd(state.stones);
        if (res.team) state.scores[res.team] += res.points;
        state.endLog.push({ end: state.end, team: res.team, points: res.points });
        state.lastResult = res;
        state.phase = 'endScore';
        state.timer = 0;
        ev.endScored = res;
        state.fx.push({ type: 'endScored', ...res });
      } else {
        beginTurn(state);
      }
    }
    return ev;
  }

  if (state.phase === 'endScore') {
    if (state.timer > 2.6) {
      const res = state.lastResult;
      // Scoring team throws first next end (the other side keeps hammer).
      if (res && res.team) state.firstTeam = res.team;
      const tied = state.scores.carter === state.scores.white;
      if (state.end >= state.totalEnds && !tied) {
        state.phase = 'over';
        state.timer = 0;
        state.winner = state.scores.carter > state.scores.white ? 'carter' : 'white';
        ev.gameOver = true;
        state.fx.push({ type: 'gameOver', winner: state.winner });
      } else {
        state.end += 1;
        startEnd(state);
      }
    }
    return ev;
  }

  return ev;
}
