import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionProbabilities } from '../policies/probabilities.js';
import { decide } from '../policies/index.js';
import { validateParameters } from '../policies/tactics.js';
import { observation, initialPlayers, simulate } from '../simulation/engine.js';
import { scenarios, configurations, BASELINE } from '../experiments/index.js';
const view = () => observation(initialPlayers([{ role: 'me' }], [], 10)[0], {}, [
  { playerId: 'me', score: 0, remainingDigs: 10 }, { playerId: 'other', score: 0, remainingDigs: 10 }
], 3000, 120000, { treasureCount: 8 });
test('probability model is uniform without evidence and conserves remaining treasure mass', () => {
  const v = view();
  const p = regionProbabilities(v);
  assert.ok(p.every(n => Math.abs(n - 8 / 36) < 1e-12));
  const hinted = regionProbabilities({ ...v, hints: { 0: 2 } });
  assert.ok(hinted[0] > hinted[1]);
  assert.ok(Math.abs(hinted.reduce((s, n) => s + n * 4, 0) - 8) < 1e-12);
});
test('probabilities agree with an independently enumerated four-cell example', () => {
  const v = view();
  v.treasureCount = 2;
  v.cells = v.cells.map(c => ({ ...c, isRevealed: !(c.row === 0 && c.col < 4), isTreasure: false }));
  v.hints = { 0: 1 };
  const p = regionProbabilities(v);
  assert.ok(Math.abs(p[0] - 0.6) < 1e-12);
  assert.ok(Math.abs(p[1] - 0.4) < 1e-12);
});
test('leader waits only with a sufficient visible lead and resumes when tied', () => {
  const v = { ...view(), score: 100 };
  assert.equal(decide('leader', v, () => 0).waitUntil, 6000);
  assert.ok(decide('leader', v, () => 0, { leadBuffer: 100 }).row !== undefined);
  v.standings[1].score = 100;
  assert.ok(decide('leader', v, () => 0).row !== undefined);
});
test('opportunist eventually scouts when all opponents wait', () => {
  const v = view();
  assert.ok(decide('opportunist', v, () => 0).waitUntil > v.elapsedMs);
  assert.ok(decide('opportunist', { ...v, elapsedMs: 110000 }, () => 0).row !== undefined);
});
test('racer changes pace and sprinter reserves enough time for a bounded finish', () => {
  const v = view();
  assert.equal(decide('racer', v, () => 0).nextDecisionMs, 1000);
  assert.equal(decide('racer', { ...v, hints: { 0: 2 } }, () => 0).nextDecisionMs, 3000);
  const start = decide('sprinter', v, () => 0).waitUntil;
  assert.ok(start > 60000 && start < 100000);
  assert.equal(decide('sprinter', { ...v, elapsedMs: start }, () => 0).nextDecisionMs, 1000);
});
test('three- to six-player adversarial matrix is legal, deterministic and reports quiet periods', () => {
  for (const n of [3, 4, 5, 6]) for (const configuration of configurations('screen', 'adversarial')) for (const scenario of scenarios(n, 'adversarial')) {
    const result = simulate({ seed: 40001, configuration, scenario });
    assert.ok(result.players.every(p => p.unusedDigs >= 0 && p.deliberateWaitSeconds <= result.durationSeconds));
    assert.ok(result.longestQuietSeconds >= 0 && result.longestQuietSeconds <= result.durationSeconds);
  }
  const input = { seed: 40001, configuration: { id: '8', ...BASELINE, treasureCount: 8 }, scenario: scenarios(3, 'adversarial').find(s => s.id === 'all-sprinter'), trace: true };
  const result = simulate(input);
  assert.deepEqual(result, simulate(input));
  assert.ok(result.longestQuietSeconds > 60);
  assert.ok(result.actions[0].time > 60000);
  assert.ok(result.actions.every(a => a.time < 120000));
});
test('invalid tactic parameters and zero-time event loops are rejected', () => {
  assert.throws(() => validateParameters({ opportunist: { spentFraction: 2 } }), /Fractions/);
  assert.throws(() => validateParameters({ leader: { hiddenData: 1 } }), /Invalid tactic/);
  assert.throws(() => simulate({ seed: 1, configuration: { id: 'base', ...BASELINE }, scenario: { players: [{ role: 'a', decisionMs: 0, latencyMs: 0 }] } }), /Invalid scenario/);
});

test('adaptive players stop once their visible board accounts for every relic', () => {
  const v = view();
  v.cells = v.cells.map((cell, i) => i < 8 ? { ...cell, isRevealed: true, isTreasure: true } : cell);
  for (const policy of ['probability', 'leader', 'sprinter', 'opportunist', 'racer']) assert.equal(decide(policy, v, () => 0), null);
});
