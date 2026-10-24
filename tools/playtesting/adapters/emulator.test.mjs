// Only this adapter may import the database-backed game service.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { GameService } from '../../../server/game-service.js';
import { resolveDig, completionReason, rankPlayers, calculateHints } from '../../../game/rules.js';
import { initialPlayers } from '../simulation/engine.js';
import { treasureLayout } from '../simulation/random.js';

for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name] || '')) throw new Error(`Parity checks require a local ${name}`);
}
const app = admin.initializeApp({ projectId: 'demo-relic-rush' }, 'balance-parity');
const db = app.firestore();
after(async () => { await app.delete(); });
async function setup(count, seed = 42) {
  let now = 1700000000000;
  const service = new GameService(db, { now: () => now });
  const lobby = await service.ensureLobby();
  const layout = treasureLayout(seed, 8);
  // Override only the isolated demo fixture before joining; no experiment controls in the server.
  await db.collection('gameSessions').doc(lobby.id).update({ treasurePositions: layout });
  const specs = Array.from({ length: count }, (_, i) => ({ role: `player-${seed}-${i}` }));
  for (const spec of specs) await service.changeLobby(spec.role, lobby.id, 'join');
  if (count < 6) for (const spec of specs) await service.changeLobby(spec.role, lobby.id, 'ready', true);
  let players = initialPlayers(specs, layout, 10);
  let log = [];
  const start = now;
  const readGame = async () => (await db.collection('gameSessions').doc(lobby.id).get()).data();
  const readPlayer = async id => (await db.collection('playerBoards').doc(`${lobby.id}_${id}`).get()).data();
  async function compare() {
    const game = await readGame();
    assert.deepEqual(game.allDiscoveries, log);
    for (const expected of players) {
      const actual = await readPlayer(expected.playerId);
      for (const key of ['score', 'remainingDigs', 'discoveries', 'acceptedMoves']) assert.deepEqual(actual[key], expected[key]);
      assert.deepEqual(JSON.parse(actual.boardState), expected.boardState);
      assert.deepEqual(calculateHints(game.allDiscoveries, expected.playerId, 6), calculateHints(log, expected.playerId, 6));
    }
    return game;
  }
  async function move(index, position, time, requestId = `parity-${index}-${time}`) {
    now = start + time;
    const expected = resolveDig(players[index], log, position, { now, deadline: start + 120000, status: 'active' });
    const reply = await service.dig(specs[index].role, { sessionId: lobby.id, requestId, ...position });
    players[index] = expected.player;
    log = expected.allDiscoveries;
    await compare();
    return reply;
  }
  return { service, lobby, specs, layout, start, move, compare, readGame, readPlayer,
    setTime: time => { now = start + time; }, getPlayers: () => players };
}
async function reset() {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-relic-rush/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(response.ok);
}
for (const count of [3, 6]) test(`${count} players: deterministic schedule, same-time discoveries, retries and deadline agree`, async () => {
  await reset();
  const fixture = await setup(count, count);
  const { layout, specs, lobby, service, start } = fixture;
  // Equal virtual timestamps, specified acceptance order: the server serializes commits.
  for (let i = 0; i < count; i++) await fixture.move(i, layout[0], 100, `shared-find-${i}`);
  assert.deepEqual(fixture.getPlayers().map(p => p.score), [100, 80, 60, 40, 20, 0].slice(0, count));
  const duplicate = await service.dig(specs[0].role, { sessionId: lobby.id, requestId: 'shared-find-0', ...layout[0] });
  assert.equal(duplicate.duplicate, true);
  await fixture.compare();
  const empty = Array.from({ length: 36 }, (_, i) => ({ row: Math.floor(i / 6), col: i % 6 })).find(p => !layout.some(t => t.row === p.row && t.col === p.col));
  await fixture.move(0, empty, 119999);
  await assert.rejects(service.dig(specs[0].role, { sessionId: lobby.id, requestId: 'duplicate-square', ...empty }), /not available/);
  fixture.setTime(120000);
  await assert.rejects(service.dig(specs[1].role, { sessionId: lobby.id, requestId: 'deadline-move', ...empty }), /ended/);
  await service.settle(lobby.id);
  const game = await fixture.compare();
  assert.equal(game.completionReason, completionReason(fixture.getPlayers(), start + 120000, start + 120000));
  assert.equal(game.endTime, new Date(start + 120000).toISOString());
  assert.deepEqual(game.finalResults.map(p => [p.playerId, p.score, p.rank]), rankPlayers(fixture.getPlayers()).map(p => [p.playerId, p.score, p.rank]));
});
for (const count of [3, 6]) test(`${count} players: exhaustion and tied final results agree`, async () => {
  await reset();
  const fixture = await setup(count, count + 10);
  const empties = Array.from({ length: 36 }, (_, i) => ({ row: Math.floor(i / 6), col: i % 6 })).filter(p => !fixture.layout.some(t => t.row === p.row && t.col === p.col)).slice(0, 10);
  let time = 0;
  for (const position of empties) for (let i = 0; i < count; i++) await fixture.move(i, position, ++time);
  const game = await fixture.compare();
  assert.equal(game.completionReason, 'digs-exhausted');
  assert.ok(game.finalResults.every(p => p.rank === 1 && p.score === 0 && p.remainingDigs === 0));
  await assert.rejects(fixture.service.dig(fixture.specs[0].role, { sessionId: fixture.lobby.id, requestId: 'after-exhaustion', ...fixture.layout[0] }), /ended/);
});

for (const count of [3, 6]) test(`${count} players: mixed exhaustion and all-relic finishes agree without ending while a hunter remains`, async () => {
  await reset();
  const fixture = await setup(count, count + 30);
  const empty = Array.from({ length: 36 }, (_, i) => ({ row: Math.floor(i / 6), col: i % 6 }))
    .filter(p => !fixture.layout.some(t => t.row === p.row && t.col === p.col)).slice(0, 10);
  let time = 0;
  for (let i = 0; i < count; i++) {
    const positions = i % 2 === 0 ? empty : fixture.layout;
    for (const position of positions) {
      await fixture.move(i, position, ++time);
      const expected = completionReason(fixture.getPlayers(), fixture.start + 120000, fixture.start + time, fixture.layout.length);
      const game = await fixture.readGame();
      assert.equal(game.status, expected ? 'completed' : 'active');
      if (expected) assert.equal(game.completionReason, expected);
    }
  }
  const game = await fixture.compare();
  assert.equal(game.completionReason, 'players-finished');
  assert.equal(game.endTime, new Date(fixture.start + time).toISOString());
  assert.deepEqual(game.finalResults.map(p => [p.playerId, p.score, p.rank]), rankPlayers(fixture.getPlayers()).map(p => [p.playerId, p.score, p.rank]));
});
