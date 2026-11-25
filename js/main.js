import {
  createGame,
  stepGame,
  setBroom,
  toggleSpin,
  beginCharge,
  releaseThrow,
  setSweeping,
  restartMatch,
  currentTeam,
  stonesLeft,
  powerForStopAt,
  HOG_Z,
  TEE_Z,
  BACK_Z,
  STONE_R,
  BROOM_LIMIT
} from './engine.js';
import { IceAudio } from './audio.js';
import { CurlingRenderer } from './renderer3d.js';

const RECORD_KEY = 'carter_curl_record_v1';

const $ = (id) => document.getElementById(id);
const canvas = $('sheet');
const scoreCarter = $('score-carter');
const scoreWhite = $('score-white');
const endLabel = $('end-label');
const pipsCarter = $('pips-carter');
const pipsWhite = $('pips-white');
const banner = $('banner');
const power = $('power');
const powerFill = $('power-fill');
const hint = $('hint');
const curlBtn = $('curl-btn');
const curlLabel = $('curl-label');
const insetFrame = $('inset-frame');
const muteBtn = $('mute-btn');
const iconOn = $('icon-on');
const iconOff = $('icon-off');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)');

const audio = new IceAudio();
const renderer = new CurlingRenderer(canvas);
const state = createGame({ seed: (Date.now() & 0xffff) + 1 });
function loadRecord() {
  try {
    const r = JSON.parse(localStorage.getItem(RECORD_KEY) || 'null');
    if (r && Number.isFinite(r.w) && Number.isFinite(r.l)) return r;
  } catch (_) { /* storage unavailable */ }
  return { w: 0, l: 0 };
}
function saveRecord(r) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (_) { /* ignore */ }
}
const record = loadRecord();

// Power bar landmarks for an unswept, straight stone.
const marks = { 'mk-hog': powerForStopAt(HOG_Z - STONE_R), 'mk-tee': powerForStopAt(TEE_Z), 'mk-back': powerForStopAt(BACK_Z) };
for (const [id, p] of Object.entries(marks)) $(id).style.left = `${(p * 100).toFixed(1)}%`;

// ---------- HUD ----------
let bannerTimer = 0;
function showBanner(text, sub = '', team = null, seconds = 1.4) {
  banner.innerHTML = '';
  banner.append(document.createTextNode(text));
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    banner.append(s);
  }
  banner.classList.toggle('is-carter', team === 'carter');
  banner.classList.toggle('is-white', team === 'white');
  banner.classList.add('is-on');
  bannerTimer = seconds;
}

function renderPips(el, left, total) {
  if (el.childElementCount !== total) {
    el.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const p = document.createElement('span');
      p.className = 'pip';
      el.append(p);
    }
  }
  [...el.children].forEach((p, i) => p.classList.toggle('is-left', i < left));
}

let lastHud = '';
function syncHud() {
  const team = currentTeam(state);
  const key = [state.scores.carter, state.scores.white, state.end, state.thrown.carter, state.thrown.white, state.phase, state.spin, team, coarse.matches].join('|');
  if (key === lastHud) return;
  lastHud = key;
  scoreCarter.textContent = state.scores.carter;
  scoreWhite.textContent = state.scores.white;
  endLabel.textContent = state.end > state.totalEnds ? `EXTRA END` : `END ${state.end} / ${state.totalEnds}`;
  renderPips(pipsCarter, stonesLeft(state, 'carter'), state.stonesPerTeam);
  renderPips(pipsWhite, stonesLeft(state, 'white'), state.stonesPerTeam);

  const myTurn = team === 'carter' && (state.phase === 'aim' || state.phase === 'charge');
  curlBtn.disabled = !myTurn;
  curlBtn.classList.toggle('is-right', state.spin === 1);
  curlLabel.textContent = state.spin === 1 ? 'CURL RIGHT' : 'CURL LEFT';
  curlBtn.setAttribute('aria-label', `Curl ${state.spin === 1 ? 'right' : 'left'} — flip direction`);

  power.hidden = !(state.phase === 'charge' || state.phase === 'ai');
  power.classList.toggle('is-white', state.phase === 'ai');

  let h = '';
  if (state.phase === 'aim') {
    h = coarse.matches ? 'TOUCH & HOLD TO POWER · DRAG TO AIM' : 'MOVE TO AIM · C FLIPS CURL · HOLD & RELEASE TO THROW';
  } else if (state.phase === 'charge') {
    h = 'RELEASE TO THROW';
  } else if (state.phase === 'travel') {
    const shooter = state.stones.find((s) => s.id === state.shooterId);
    h = shooter && shooter.team === 'carter' ? 'HOLD TO SWEEP — FARTHER & STRAIGHTER' : '';
  } else if (state.phase === 'ai') {
    h = 'WHITE CARTER IS READING THE ICE';
  } else if (state.phase === 'over') {
    h = 'TAP OR PRESS SPACE TO PLAY AGAIN';
  }
  hint.textContent = h;
  hint.classList.toggle('is-faded', !h);
}

function handleFx() {
  for (const fx of state.fx) {
    if (fx.type === 'launch') {
      audio.playRelease(fx.power);
    } else if (fx.type === 'impact') {
      audio.playClack(fx.speed);
    } else if (fx.type === 'out') {
      audio.playOut();
    } else if (fx.type === 'hog') {
      audio.playOut();
      showBanner('HOGGED', 'MISSED THE FAR HOG LINE', fx.team, 1.1);
    } else if (fx.type === 'turn') {
      if (fx.team === 'white') showBanner("WHITE CARTER'S STONE", '', 'white', 1.0);
    } else if (fx.type === 'endScored') {
      const name = fx.team === 'carter' ? 'CARTER' : 'WHITE CARTER';
      const sub = `CARTER ${state.scores.carter} — ${state.scores.white} WHITE`;
      if (fx.team) showBanner(`+${fx.points} ${name}`, sub, fx.team, 2.5);
      else showBanner('BLANK END', sub, null, 2.5);
      audio.playCount(fx.points, fx.team === 'carter');
    } else if (fx.type === 'newEnd' && state.end > 1) {
      const hammer = state.firstTeam === 'carter' ? 'WHITE CARTER HAS THE HAMMER' : 'YOU HAVE THE HAMMER';
      showBanner(state.end > state.totalEnds ? 'EXTRA END' : `END ${state.end}`, hammer, null, 1.6);
    } else if (fx.type === 'gameOver') {
      const won = fx.winner === 'carter';
      if (won) record.w += 1;
      else record.l += 1;
      saveRecord(record);
      showBanner(
        won ? `CARTER WINS ${state.scores.carter}–${state.scores.white}` : `WHITE CARTER WINS ${state.scores.white}–${state.scores.carter}`,
        `RECORD ${record.w}–${record.l} · TAP TO PLAY AGAIN`,
        fx.winner,
        9999
      );
      audio.playGameOver(won);
    }
  }
}

// ---------- Input ----------
const keys = { left: false, right: false, space: false };
let pointerHeld = false;

function broomFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  setBroom(state, nx * BROOM_LIMIT * 1.15);
}

function press() {
  audio.ensure();
  if (state.phase === 'aim') beginCharge(state);
  else if (state.phase === 'over') {
    restartMatch(state);
    banner.classList.remove('is-on');
    bannerTimer = 0;
  }
}

function unpress() {
  if (state.phase === 'charge') releaseThrow(state);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerHeld = true;
  canvas.setPointerCapture(e.pointerId);
  if (state.phase === 'aim' && currentTeam(state) === 'carter') broomFromClientX(e.clientX);
  press();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && !pointerHeld) return;
  if (state.phase === 'aim' || state.phase === 'charge') broomFromClientX(e.clientX);
});
const endPointer = () => {
  if (!pointerHeld) return;
  pointerHeld = false;
  unpress();
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
  else if (k === 'c' || k === 'C' || k === 'q' || k === 'Q' || k === 'e' || k === 'E') {
    if (!e.repeat && toggleSpin(state)) audio.playAimTick();
  } else if (k === ' ' || k === 'Enter') {
    if (e.target === curlBtn || e.target === muteBtn) return;
    e.preventDefault();
    if (!e.repeat) {
      keys.space = true;
      press();
    }
  } else return;
  audio.ensure();
});
window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  else if (k === ' ' || k === 'Enter') {
    if (keys.space) {
      keys.space = false;
      unpress();
    }
  }
});
window.addEventListener('blur', () => {
  keys.left = keys.right = keys.space = false;
  pointerHeld = false;
  unpress();
});

curlBtn.addEventListener('click', () => {
  audio.ensure();
  if (toggleSpin(state)) audio.playAimTick();
});

muteBtn.addEventListener('click', () => {
  const m = !audio.muted;
  audio.setMuted(m);
  if (!m) audio.ensure();
  iconOn.hidden = m;
  iconOff.hidden = !m;
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
});

window.addEventListener('resize', () => renderer.resize());

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (kx !== 0) setBroom(state, state.broomX + kx * 1.6 * dt);

  setSweeping(state, pointerHeld || keys.space);
  if (state.sweeping) audio.brushStroke();

  stepGame(state, dt);

  let glide = 0;
  for (const s of state.stones) if (s.moving) glide += Math.hypot(s.vx, s.vz);
  audio.setGlide(glide);

  handleFx();
  syncHud();
  powerFill.style.width = `${(state.power * 100).toFixed(1)}%`;

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) banner.classList.remove('is-on');
  }

  renderer.render(state, dt, reducedMotion.matches);

  const r = renderer.insetRect;
  insetFrame.hidden = !renderer.insetVisible;
  if (r && renderer.insetVisible) {
    insetFrame.style.left = `${r.x}px`;
    insetFrame.style.top = `${r.y}px`;
    insetFrame.style.width = `${r.size}px`;
    insetFrame.style.height = `${r.size}px`;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
