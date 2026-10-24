import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDig, calculateHints, completionReason, rankPlayers, calculatePoints } from '../../../game/rules.js';
import { initialPlayers } from '../simulation/engine.js';
import { scoring } from '../experiments/index.js';
const players = () => initialPlayers([{ role: 'a' }, { role: 'b' }], [{ row: 0, col: 0 }], 1);
const options = { now: 100, deadline: 1000, status: 'active' };
test('pure resolution refunds finds, consumes misses and preserves its inputs', () => {
  const [player] = players();
  const copy = structuredClone(player);
  const found = resolveDig(player, [], { row: 0, col: 0 }, options);
  assert.deepEqual(player, copy);
  assert.equal(found.player.score, 100);
  assert.equal(found.player.remainingDigs, 1);
  const missed = resolveDig(found.player, found.allDiscoveries, { row: 1, col: 1 }, options);
  assert.equal(missed.player.remainingDigs, 0);
  assert.equal(missed.player.acceptedMoves, 2);
  assert.equal(found.player.boardState[1][1].isRevealed, false);
  assert.throws(() => resolveDig(missed.player, [], { row: 2, col: 2 }, options), /not available/);
  assert.throws(() => resolveDig(found.player, [], { row: 0, col: 0 }, options), /not available/);
});
test('declining scores and discovery order match the existing curve', () => {
  const log = [];
  for (let i = 0; i < 6; i++) {
    const player = { ...players()[0], playerId: `p${i}` };
    const result = resolveDig(player, log, { row: 0, col: 0 }, options);
    assert.equal(result.player.score, [100, 80, 60, 40, 20, 0][i]);
    assert.equal(result.player.discoveries[0].discoveryOrder, i + 1);
    log.push(...result.player.discoveries);
  }
  assert.equal(calculatePoints(8), 0);
});
test('deadline boundaries, invalid coordinates, and inactive matches reject moves', () => {
  for (const now of [1000, 1001]) assert.throws(() => resolveDig(players()[0], [], { row: 0, col: 0 }, { ...options, now }), /ended/);
  assert.throws(() => resolveDig(players()[0], [], { row: 0, col: 0 }, { ...options, status: 'completed' }), /ended/);
  for (const position of [{ row: -1, col: 0 }, { row: 6, col: 0 }, { row: 0.5, col: 0 }, { row: 0, col: 6 }]) {
    assert.throws(() => resolveDig(players()[0], [], position, options), /Invalid move/);
  }
  assert.equal(completionReason([{ remainingDigs: 0 }], 1000, 999), 'digs-exhausted');
  assert.equal(completionReason([{ remainingDigs: 0 }], 1000, 1000), 'deadline');
  assert.equal(completionReason(players(), 1000, 999), null);
});
test('hints count unique opposing positions and disappear after finding them', () => {
  const log = [{ playerId: 'a', row: 0, col: 0 }, { playerId: 'b', row: 0, col: 0 }, { playerId: 'a', row: 1, col: 1 }];
  assert.deepEqual(calculateHints(log, 'me', 6), { 0: 2 });
  assert.deepEqual(calculateHints([...log, { playerId: 'me', row: 0, col: 0 }], 'me', 6), { 0: 1 });
});
test('ranks preserve ties and skip places', () => {
  assert.deepEqual(rankPlayers([{ score: 100 }, { score: 100 }, { score: 80 }]).map(p => p.rank), [1, 1, 3]);
});
test('experimental curves have specified values at every player count', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => scoring('gentle', 6)(i + 1)), [100, 90, 80, 70, 60, 50]);
  assert.deepEqual([1, 2].map(i => scoring('player-count', 2)(i)), [100, 40]);
  assert.deepEqual([1, 2, 3, 4].map(i => scoring('player-count', 4)(i)), [100, 80, 60, 40]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(i => scoring('player-count', 6)(i)), [100, 88, 76, 64, 52, 40]);
  assert.deepEqual([1, 2, 6].map(i => scoring('first-bonus', 6)(i)), [100, 80, 80]);
});

test('completion requires each player to be exhausted or have found the configured relic count', () => {
  const found = count => ({ remainingDigs: 2, discoveries: Array.from({ length: count }, (_, col) => ({ row: 0, col })) });
  const exhausted = { remainingDigs: 0, discoveries: [] };
  assert.equal(completionReason([found(8), exhausted, found(8)], 1000, 999, 8), 'players-finished');
  assert.equal(completionReason([found(8), found(8), found(8)], 1000, 999, 8), 'players-finished');
  assert.equal(completionReason([found(8), exhausted, found(7)], 1000, 999, 8), null);
  assert.equal(completionReason([exhausted, exhausted], 1000, 999, 8), 'digs-exhausted');
  assert.equal(completionReason([found(8), exhausted], 1000, 1000, 8), 'deadline');
  assert.equal(completionReason([], 1000, 999, 8), null);
  assert.equal(completionReason([found(5), exhausted], 1000, 999, 5), 'players-finished');
  assert.equal(completionReason([found(5), exhausted], 1000, 999, 8), null);
});
