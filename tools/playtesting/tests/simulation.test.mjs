import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, observation, initialPlayers, rotateSeats } from '../simulation/engine.js';
import { randomStream, treasureLayout } from '../simulation/random.js';
import { scenarios, BASELINE, configurations } from '../experiments/index.js';
import { decide, POLICIES } from '../policies/index.js';
import { clusterMatches, interval, paired, comparisons } from '../reporting/statistics.js';
const input = { seed: 17, configuration: { id: 'baseline', ...BASELINE }, scenario: scenarios(6).find(s => s.id === 'hybrid50-vs-explorer') };
test('same inputs reproduce the whole action trace exactly', () => {
  assert.deepEqual(simulate({ ...input, trace: true }), simulate({ ...input, trace: true }));
});
test('random streams are independent and layouts share nested prefixes across treasure counts', () => {
  const a = randomStream(17, 'layout');
  const b = randomStream(17, 'choices');
  const reference = randomStream(17, 'layout');
  b(); b(); b();
  assert.equal(a(), reference());
  assert.deepEqual(treasureLayout(17, 4), treasureLayout(17, 6).slice(0, 4));
  assert.equal(new Set(treasureLayout(17, 36).map(p => `${p.row},${p.col}`)).size, 36);
});
test('rotations place each stable role in each seat exactly once', () => {
  const players = input.scenario.players;
  for (let seat = 0; seat < players.length; seat++) {
    assert.equal(new Set(players.map((_, rotation) => rotateSeats(players, rotation)[seat].role)).size, players.length);
  }
});
test('unrevealed treasure layouts cannot change observations or policy decisions', () => {
  const left = initialPlayers([{ role: 'a' }], [{ row: 0, col: 0 }], 10)[0];
  const right = initialPlayers([{ role: 'a' }], [{ row: 5, col: 5 }], 10)[0];
  const a = observation(left, { 0: 1 }, [], 40000, 120000);
  const b = observation(right, { 0: 1 }, [], 40000, 120000);
  assert.deepEqual(a, b);
  assert.equal('isTreasure' in a.cells[0], false);
  for (const policy of POLICIES) assert.deepEqual(decide(policy, a, randomStream(1, policy)), decide(policy, b, randomStream(1, policy)));
});
test('patient policy waits, reserves digs, and eventually acts', () => {
  const player = initialPlayers([{ role: 'a' }], [], 10)[0];
  const view = observation(player, {}, [], 1000, 120000);
  assert.deepEqual(decide('patient', view, () => 0), { waitUntil: 30000 });
  assert.deepEqual(decide('patient', { ...view, elapsedMs: 40000, remainingDigs: 2 }, () => 0), { waitUntil: 60000 });
  assert.deepEqual(decide('patient', { ...view, elapsedMs: 60000, remainingDigs: 2 }, () => 0), { row: 0, col: 0 });
});
test('simulated action timing respects one pending request and refunds', () => {
  const scenario = scenarios(2).find(s => s.id === 'all-explorer');
  const result = simulate({ ...input, scenario, trace: true });
  for (const role of scenario.players.map(s => s.role)) {
    const actions = result.actions.filter(a => a.playerId === role);
    assert.equal(actions[0].time, 3100);
    for (let i = 1; i < actions.length; i++) assert.equal(actions[i].time - actions[i - 1].time, 3200);
  }
  assert.equal(result.players.reduce((s, p) => s + p.winCredit, 0), 1);
  assert.ok(result.actions.every(a => a.time < 120000));
  const expired = simulate({ ...input, scenario, configuration: { ...input.configuration, durationSeconds: 1 } });
  assert.equal(expired.completionReason, 'deadline');
  assert.equal(expired.players[0].digsUsed, 0);
});
test('each supported configuration runs without illegal actions', () => {
  for (const configuration of configurations('screen')) for (const n of [2, 4, 6]) for (const scenario of scenarios(n)) {
    const result = simulate({ seed: 42, configuration, scenario });
    assert.ok(result.players.every(p => p.unusedDigs >= 0 && p.score >= 0 && p.discoveries <= configuration.treasureCount));
  }
});
test('uncertainty treats seat rotations as a single seed cluster', () => {
  const result = simulate(input);
  const clusters = clusterMatches([result, result], input.scenario);
  const focal = clusters.find(c => c.cohort === 'focal');
  assert.equal(focal.metrics.winCredit, result.players.find(p => p.playerId === 'role-0').winCredit);
  assert.deepEqual(paired([1, 0, 1], [0, 0, 0]), interval([1, 0, 1]));
  assert.equal(interval([1]).low, null);
});

test('comparisons retain focal and opponent identity even when policies match', () => {
  const rows = ['baseline', 'variant'].flatMap(configurationId => ['focal', 'opponents'].map(cohort => ({
    configurationId, cohort, policy: 'hybrid50', playerCount: 2, scenarioId: 'pace-1000',
    samples: { winCredit: configurationId === 'baseline' ? [0.5, 0.5] : cohort === 'focal' ? [1, 1] : [0, 0] }
  })));
  const differences = comparisons(rows).filter(row => row.label === 'Setting versus baseline');
  assert.deepEqual(differences.map(row => [row.cohort, row.mean]), [['focal', 0.5], ['opponents', -0.5]]);
  assert.ok(differences.every(row => row.reference.endsWith(row.cohort)));
});
