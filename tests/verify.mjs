// Run: node tests/verify.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const still = (id, team, x, z) => ({ id, team, x, z, vx: 0, vz: 0, spin: 0, angle: 0, moving: false, touched: false });

console.log('=== 1. Draw weight stops on the button ===');
const draw = E.powerForStopAt(E.TEE_Z);
const straight = E.simulateThrow([], 'carter', 0, 0, draw);
assert.equal(straight.length, 1);
assert.ok(E.distToTee(straight[0]) < 0.15, 'straight draw lands on the button');
console.log('PASS');

console.log('=== 2. Curl bends the stone toward the spin side ===');
const inTurn = E.simulateThrow([], 'carter', 0, 1, draw)[0];
const outTurn = E.simulateThrow([], 'carter', 0, -1, draw)[0];
assert.ok(inTurn.x > 0.5 && outTurn.x < -0.5, `curl drift ${inTurn.x.toFixed(2)} / ${outTurn.x.toFixed(2)}`);
console.log('PASS');

console.log('=== 3. Hog rule removes short stones ===');
const hogged = E.simulateThrow([], 'carter', 0, 0, 0.02);
assert.equal(hogged.length, 0, 'short stone removed');
console.log('PASS');

console.log('=== 4. Heavy stones fly through the back line ===');
assert.equal(E.simulateThrow([], 'carter', 0, 0, 1).length, 0);
console.log('PASS');

console.log('=== 5. Takeout removes the target stone ===');
const target = still(9, 'white', 0, E.TEE_Z);
const afterTakeout = E.simulateThrow([target], 'carter', 0, 0, 0.85);
assert.ok(!afterTakeout.some((s) => s.id === 9), 'white stone knocked out of play');
console.log('PASS');

console.log('=== 6. Sweeping carries the stone further ===');
function runSwept(sweep) {
  const st = [E.makeStone(1, 'carter', 0, 0, E.powerForStopAt(-6))];
  while (E.anyMoving(st)) E.physicsTick(st, E.FIXED_DT, sweep ? 1 : null);
  return st[0].z;
}
assert.ok(runSwept(true) < runSwept(false) - 0.8, 'sweeping adds distance');
console.log('PASS');

console.log('=== 7. End scoring counts stones closer than the opponent best ===');
const sc = E.scoreEnd([
  still(1, 'carter', 0.1, E.TEE_Z),
  still(2, 'carter', 0.5, E.TEE_Z + 0.4),
  still(3, 'white', 1.0, E.TEE_Z),
  still(4, 'carter', 1.5, E.TEE_Z),
  still(5, 'white', 0, E.TEE_Z + 5)
]);
assert.deepEqual([sc.team, sc.points], ['carter', 2]);
assert.equal(E.scoreEnd([still(1, 'white', 0, 0)]).points, 0, 'stone outside house scores nothing');
console.log('PASS');

console.log('=== 8. AI finds a scoring shot ===');
const t0 = Date.now();
const plan = E.planShot([still(1, 'carter', 0.3, E.TEE_Z + 0.2)], 'white', true, E.mulberry32(3));
const res = E.scoreEnd(E.simulateThrow([still(1, 'carter', 0.3, E.TEE_Z + 0.2)], 'white', plan.broomX, plan.spin, plan.power));
console.log(`   plan in ${Date.now() - t0}ms →`, res.team, res.points);
assert.ok(plan.expected > 5, 'AI sees a scoring option');
console.log('PASS');

console.log('=== 9. Full match plays to a result ===');
const g = E.createGame({ seed: 42 });
let guard = 0;
while (g.phase !== 'over' && guard++ < 200000) {
  if (g.phase === 'aim') {
    E.setBroom(g, (g.rand() - 0.5) * 1.6);
    E.beginCharge(g);
  }
  if (g.phase === 'charge' && g.power >= 0.3) E.releaseThrow(g);
  E.stepGame(g, 1 / 60);
  g.fx.length = 0;
}
assert.equal(g.phase, 'over', 'match finished');
assert.ok(g.winner === 'carter' || g.winner === 'white');
assert.ok(g.endLog.length >= g.totalEnds);
console.log(`   final ${g.scores.carter}-${g.scores.white}, winner ${g.winner}, ends`, g.endLog.map((e) => `${e.team ?? '-'}${e.points}`).join(' '));
console.log('PASS');
console.log('\nALL CHECKS PASSED');
