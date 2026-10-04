import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { io } from 'socket.io-client';
import { GameService } from '../server/game-service.js';
import { createGameServer } from '../server/transport.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run this suite with Firebase emulators.');
const projectId = 'demo-relic-rush';
const app = admin.initializeApp({ projectId });
const db = app.firestore();
let now;
let service;
let gameServer;
let clients;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  now = Date.now();
  service = new GameService(db, { now: () => now });
  clients = [];
});
afterEach(async () => {
  clients.forEach(client => client.close());
  if (gameServer) { await gameServer.close(); gameServer = null; }
});
const players = ['alice', 'bob', 'charlie', 'david', 'erin', 'frank'];
async function join(count = 2) {
  const lobby = await service.ensureLobby();
  await Promise.all(players.slice(0, count).map(uid => service.changeLobby(uid, lobby.id, 'join')));
  return lobby.id;
}
async function ready(sessionId) {
  await service.changeLobby('alice', sessionId, 'ready', true);
  return service.changeLobby('bob', sessionId, 'ready', true);
}
const readGame = async id => (await db.collection('gameSessions').doc(id).get()).data();
const readBoard = async (id, uid) => (await db.collection('playerBoards').doc(`${id}_${uid}`).get()).data();
const move = (id, requestId, position) => ({ sessionId: id, requestId, ...position });

test('ready toggles, newcomers, and simultaneous start triggers freeze membership exactly once', async () => {
  const id = await join();
  await service.changeLobby('alice', id, 'ready', true);
  await service.changeLobby('alice', id, 'ready', false);
  assert.equal((await readGame(id)).status, 'scheduled');
  await service.changeLobby('charlie', id, 'join');
  await ready(id);
  assert.equal((await readGame(id)).status, 'scheduled');
  now += 600000;
  await Promise.allSettled([service.changeLobby('charlie', id, 'ready', true), service.settle(id), service.settle(id)]);
  const game = await readGame(id);
  assert.equal(game.status, 'active');
  assert.deepEqual(game.participantIds.sort(), ['alice', 'bob', 'charlie']);
  assert.equal(Date.parse(game.deadline) - Date.parse(game.startTime), 120000);
  await assert.rejects(service.changeLobby('david', id, 'join'));
  const next = await service.ensureLobby();
  assert.notEqual(next.id, id);
  assert.deepEqual(next.participants, {});
});

test('full lobby starts without readiness and countdown starts two unready players', async () => {
  const full = await join(6);
  assert.equal((await readGame(full)).startReason, 'full');
  const timed = await join();
  now += 600000;
  await service.settle(timed);
  assert.equal((await readGame(timed)).startReason, 'countdown');
});

test('empty countdown cancels and creates one replacement; legacy data remains intact', async () => {
  await db.collection('gameSessions').doc('legacy').set({ status: 'active', isLobbyGame: true, lastUpdated: '2020-01-01' });
  const first = await service.ensureLobby();
  now += 600000;
  const next = await service.maintenance();
  assert.notEqual(next.id, first.id);
  assert.equal((await readGame(first.id)).completionReason, 'not-enough-players');
  assert.equal((await readGame('legacy')).status, 'active');
  const repeated = await Promise.all(Array.from({ length: 6 }, () => service.ensureLobby()));
  assert.ok(repeated.every(game => game.id === next.id));
});

test('simultaneous treasure discoveries get distinct orders and declining points', async () => {
  const id = await join();
  const game = await ready(id);
  const treasure = game.treasurePositions[0];
  const otherWriter = new GameService(db, { now: () => now });
  await Promise.all(players.slice(0, 2).map((uid, index) => (index ? otherWriter : service).dig(uid, move(id, `request-${uid}`, treasure))));
  const committed = await readGame(id);
  assert.deepEqual(committed.allDiscoveries.map(d => d.discoveryOrder).sort(), [1, 2]);
  assert.deepEqual(committed.allDiscoveries.map(d => d.points).sort((a, b) => a - b), [80, 100]);
  for (const uid of players.slice(0, 2)) assert.equal((await readBoard(id, uid)).remainingDigs, 10);
});

test('duplicate requests and rapid same-player moves do not overspend or overwrite boards', async () => {
  const id = await join();
  const game = await ready(id);
  const empty = Array.from({ length: 36 }, (_, i) => ({ row: Math.floor(i / 6), col: i % 6 }))
    .filter(p => !game.treasurePositions.some(t => t.row === p.row && t.col === p.col));
  const request = move(id, 'request-duplicate', empty[0]);
  const replies = await Promise.all([service.dig('alice', request), service.dig('alice', request)]);
  for (const reply of replies) {
    assert.equal(reply.board.acceptedMoves, 1);
    assert.equal(reply.board.remainingDigs, 9);
    assert.equal(JSON.parse(reply.board.boardState)[empty[0].row][empty[0].col].isRevealed, true);
  }
  await Promise.all([service.dig('alice', move(id, 'request-move-2', empty[1])), service.dig('alice', move(id, 'request-move-3', empty[2]))]);
  const board = await readBoard(id, 'alice');
  assert.equal(board.remainingDigs, 7);
  assert.equal(board.acceptedMoves, 3);
  assert.equal(JSON.parse(board.boardState).flat().filter(s => s.isRevealed).length, 3);
  await assert.rejects(service.dig('alice', move(id, 'request-duplicate', empty[3])));
  await assert.rejects(service.dig('spectator', move(id, 'request-outsider', empty[3])));
});

test('deadline preserves earned score, rejects new moves, allows duplicate acknowledgements, and restores results', async () => {
  const id = await join();
  const game = await ready(id);
  const request = move(id, 'request-deadline', game.treasurePositions[0]);
  await service.dig('alice', request);
  now += 120000;
  await assert.rejects(service.dig('bob', move(id, 'request-too-late', game.treasurePositions[0])));
  await service.settle(id);
  assert.equal((await service.dig('alice', request)).duplicate, true);
  const result = await service.recover('alice', id);
  assert.equal(result.status, 'completed');
  assert.equal(result.completionReason, 'deadline');
  assert.equal(result.finalResults[0].score, 100);
});

test('all digs exhausted finishes early and ties share ranks', async () => {
  const id = await join();
  const game = await ready(id);
  const empty = Array.from({ length: 36 }, (_, i) => ({ row: Math.floor(i / 6), col: i % 6 }))
    .filter(p => !game.treasurePositions.some(t => t.row === p.row && t.col === p.col)).slice(0, 10);
  for (const uid of players.slice(0, 2)) for (const [i, position] of empty.entries()) await service.dig(uid, move(id, `request-${uid}-${i}`, position));
  const result = await readGame(id);
  assert.equal(result.status, 'completed');
  assert.equal(result.completionReason, 'digs-exhausted');
  assert.deepEqual(result.finalResults.map(p => p.rank), [1, 1]);
  assert.equal(result.acceptedMoves, 20);
});

test('restart preserves waiting membership, active deadline, and board progress', async () => {
  const activeId = await join();
  const active = await ready(activeId);
  await service.dig('alice', move(activeId, 'request-restart', active.treasurePositions[0]));
  const waiting = await service.ensureLobby();
  await service.changeLobby('charlie', waiting.id, 'join');
  service = new GameService(db, { now: () => now });
  await service.maintenance();
  assert.equal((await service.ensureLobby()).id, waiting.id);
  assert.equal((await service.recover('charlie')).id, waiting.id);
  assert.equal((await service.recover('alice')).deadline, active.deadline);
  assert.equal((await readBoard(activeId, 'alice')).score, 100);
  now += 120001;
  await service.maintenance();
  assert.equal((await readGame(activeId)).status, 'completed');
});

test('archiving is atomic and repeatable without inflating lifetime statistics', async () => {
  const id = await join();
  await ready(id);
  now += 120000;
  await service.settle(id);
  await Promise.all([service.archive(id), service.archive(id), service.archive(id)]);
  assert.equal((await db.collection('playerStats').doc('alice').get()).data().gamesPlayed, 1);
  assert.equal((await db.collection('gameHistory').doc(id).get()).data().durationSeconds, 120);
  assert.ok((await readGame(id)).archivedAt);
  assert.ok(await readBoard(id, 'alice'));
});

test('failed archiving preserves source records and can be retried', async () => {
  const id = await join();
  await ready(id);
  now += 120000;
  await service.settle(id);
  const failed = new GameService({ collection: db.collection.bind(db), runTransaction: async () => { throw new Error('Temporary outage'); } });
  await assert.rejects(failed.archive(id), /Temporary outage/);
  assert.equal((await readGame(id)).archivedAt, undefined);
  assert.ok(await readBoard(id, 'alice'));
  await service.archive(id);
  assert.equal((await db.collection('playerStats').doc('alice').get()).data().gamesPlayed, 1);
});

async function client() {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  const user = await response.json();
  const socket = io(`http://127.0.0.1:${gameServer.port}`, { auth: { token: user.idToken }, autoConnect: false });
  clients.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  return { socket, uid: user.localId };
}
const command = (socket, event, data) => socket.timeout(5000).emitWithAck(event, data);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('authenticated sockets exclude spectators and only the last tab disconnect removes lobby membership', async () => {
  gameServer = createGameServer(db, token => app.auth().verifyIdToken(token), { tickMs: 100 });
  await gameServer.start();
  const a = await client(), b = await client(), spectator = await client();
  const id = (await gameServer.service.ensureLobby()).id;
  let spectatorStarts = 0;
  spectator.socket.on('session', () => spectatorStarts++);
  assert.equal((await command(a.socket, 'joinGame', { sessionId: id })).ok, true);
  assert.equal((await command(b.socket, 'joinGame', { sessionId: id })).ok, true);
  const secondTab = io(`http://127.0.0.1:${gameServer.port}`, { auth: a.socket.auth, autoConnect: false });
  clients.push(secondTab);
  await new Promise((resolve, reject) => { secondTab.once('connect', resolve); secondTab.once('connect_error', reject); secondTab.connect(); });
  a.socket.disconnect();
  await wait(150);
  assert.ok((await readGame(id)).participants[a.uid]);
  secondTab.disconnect();
  await wait(200);
  assert.equal((await readGame(id)).participants[a.uid], undefined);
  a.socket.connect();
  await new Promise(resolve => a.socket.once('connect', resolve));
  await command(a.socket, 'joinGame', { sessionId: id });
  await command(a.socket, 'setReady', { sessionId: id, ready: true });
  await command(b.socket, 'setReady', { sessionId: id, ready: true });
  await wait(150);
  assert.equal(spectatorStarts, 0);
  assert.equal((await readGame(id)).status, 'active');
  a.socket.disconnect();
  await wait(150);
  assert.ok((await readGame(id)).participantIds.includes(a.uid));
  assert.equal((await gameServer.service.recover(a.uid, id)).id, id);
});

test('invalid credentials cannot enter the lobby', async () => {
  gameServer = createGameServer(db, token => app.auth().verifyIdToken(token));
  await gameServer.start();
  const socket = io(`http://127.0.0.1:${gameServer.port}`, { auth: { token: 'invalid' }, reconnection: false, autoConnect: false });
  clients.push(socket);
  const error = await new Promise(resolve => { socket.once('connect_error', resolve); socket.connect(); });
  assert.match(error.message, /authenticate/);
});

test('graceful server restart preserves waiting membership and readiness for reconnecting guests', async () => {
  gameServer = createGameServer(db, token => app.auth().verifyIdToken(token), { recoveryGraceMs: 500, tickMs: 100 });
  await gameServer.start();
  const guest = await client();
  const lobby = await gameServer.service.ensureLobby();
  await command(guest.socket, 'joinGame', { sessionId: lobby.id });
  await command(guest.socket, 'setReady', { sessionId: lobby.id, ready: true });
  const token = guest.socket.auth.token;
  await gameServer.close();
  assert.equal((await readGame(lobby.id)).participants[guest.uid].ready, true);
  gameServer = createGameServer(db, token => app.auth().verifyIdToken(token), { recoveryGraceMs: 1000, tickMs: 100 });
  await gameServer.start();
  const replacement = io(`http://127.0.0.1:${gameServer.port}`, { auth: { token }, autoConnect: false });
  clients.push(replacement);
  await new Promise((resolve, reject) => { replacement.once('connect', resolve); replacement.once('connect_error', reject); replacement.connect(); });
  const recovery = await command(replacement, 'recover', { sessionId: lobby.id });
  assert.equal(recovery.data.sessionId, lobby.id);
  await wait(1100);
  assert.equal((await readGame(lobby.id)).participants[guest.uid].ready, true);
});

test('client writes are denied while authenticated state subscriptions remain available', async () => {
  gameServer = createGameServer(db, token => app.auth().verifyIdToken(token));
  await gameServer.start();
  const guest = await client();
  const id = (await gameServer.service.ensureLobby()).id;
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/gameSessions/${id}`;
  const headers = { Authorization: `Bearer ${guest.socket.auth.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(url, { headers })).status, 200);
  const write = await fetch(url + '?updateMask.fieldPaths=status', { method: 'PATCH', headers, body: JSON.stringify({ fields: { status: { stringValue: 'completed' } } }) });
  assert.equal(write.status, 403);
});
