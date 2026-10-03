import { randomInt } from 'node:crypto';

export const DEFAULTS = { lobbySeconds: 600, matchSeconds: 120, maxPlayers: 6 };
export class GameError extends Error {}
const iso = ms => new Date(ms).toISOString();
const boardId = (sessionId, uid) => `${sessionId}_${uid}`;
const rankPlayers = players => [...players].sort((a, b) => b.score - a.score).map((p, _i, sorted) => ({
  ...p, rank: sorted.findIndex(other => other.score === p.score) + 1,
  digsUsed: p.acceptedMoves || 0
}));

export class GameService {
  constructor(db, options = {}) {
    this.db = db;
    this.config = { ...DEFAULTS, ...options };
    this.now = options.now || Date.now;
    this.control = db.collection('gameControl').doc('lobby-v2');
    this.pendingArchives = new Set();
    this.initialized = false;
    this.queues = new Map();
    this.archiveError = null;
  }

  async ensureLobby() {
    if (this.lobbyId) {
      const existing = await this.db.collection('gameSessions').doc(this.lobbyId).get();
      if (existing.exists && existing.data().status === 'scheduled') return { id: existing.id, ...existing.data() };
    }
    const candidate = this.db.collection('gameSessions').doc();
    const result = await this.db.runTransaction(async tx => {
      const pointer = await tx.get(this.control);
      if (pointer.exists) {
        const existing = await tx.get(this.db.collection('gameSessions').doc(pointer.data().sessionId));
        if (existing.exists && existing.data().status === 'scheduled') return { id: existing.id, ...existing.data() };
      }
      const treasures = [];
      while (treasures.length < 5) {
        const position = { row: randomInt(6), col: randomInt(6) };
        if (!treasures.some(p => p.row === position.row && p.col === position.col)) treasures.push(position);
      }
      const now = this.now();
      const gameCode = Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join('') +
        Array.from({ length: 3 }, () => randomInt(10)).join('');
      const game = {
        schemaVersion: 2, isLobbyGame: true, gameCode, gridSize: 6, treasureCount: 5, digAttempts: 10,
        gameSettings: { gridSize: 6, treasureCount: 5, digAttempts: 10, gameMode: 'multiplayer' },
        treasurePositions: treasures, allDiscoveries: [], participants: {}, participantIds: [],
        maxPlayers: 6, matchSeconds: this.config.matchSeconds, status: 'scheduled',
        scheduledStartTime: iso(now + this.config.lobbySeconds * 1000), createdAt: iso(now), lastUpdated: iso(now), startTime: ''
      };
      tx.set(candidate, game);
      tx.set(this.control, { sessionId: candidate.id });
      return { id: candidate.id, ...game };
    });
    this.lobbyId = result.id;
    return result;
  }

  startPatch(game, participants, now) {
    const ids = Object.keys(participants);
    const reason = ids.length >= 6 ? 'full' : ids.length >= 2 && ids.every(id => participants[id].ready) ? 'ready' :
      now >= Date.parse(game.scheduledStartTime) && ids.length >= 2 ? 'countdown' : null;
    return reason ? {
      status: 'active', startReason: reason, participantIds: ids, startedPlayerCount: ids.length,
      startTime: iso(now), deadline: iso(now + game.matchSeconds * 1000), lastUpdated: iso(now)
    } : {};
  }

  async changeLobby(uid, sessionId, action, ready = false) {
    return this.serialize(sessionId, () => this.commitLobby(uid, sessionId, action, ready));
  }

  async commitLobby(uid, sessionId, action, ready) {
    if (!['join', 'leave', 'ready'].includes(action) || typeof ready !== 'boolean') throw new GameError('Invalid lobby action');
    const ref = this.db.collection('gameSessions').doc(sessionId);
    const playerRef = this.db.collection('playerBoards').doc(boardId(sessionId, uid));
    return this.db.runTransaction(async tx => {
      const pointer = await tx.get(this.control);
      const snapshot = await tx.get(ref);
      const oldBoard = await tx.get(playerRef);
      if (!pointer.exists || pointer.data().sessionId !== sessionId || !snapshot.exists || snapshot.data().status !== 'scheduled') {
        if (action === 'leave') return null;
        throw new GameError('This lobby has already started. Join the next game.');
      }
      const game = snapshot.data();
      const participants = { ...game.participants };
      const now = this.now();
      if (action === 'join') {
        if (now >= Date.parse(game.scheduledStartTime)) throw new GameError('This countdown has ended. Please join the next lobby.');
        if (!participants[uid] && Object.keys(participants).length >= 6) throw new GameError('This game is full.');
        participants[uid] ||= { ready: false, joinedAt: iso(now) };
        if (!oldBoard.exists) {
          const board = Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => ({
            isRevealed: false, isTreasure: game.treasurePositions.some(p => p.row === row && p.col === col), discoveryCount: 0
          })));
          tx.set(playerRef, {
            playerId: uid, mockPlayerId: `Player ${uid.slice(0, 6)}`, isMockPlayer: false, sessionId,
            boardState: JSON.stringify(board), remainingDigs: 10, score: 0, discoveries: [], subGridHints: {},
            joinedAt: iso(now), acceptedMoves: 0, processedMoves: {}
          });
        }
      } else if (action === 'leave') {
        delete participants[uid];
      } else {
        if (!participants[uid]) throw new GameError('Join this game before readying up.');
        participants[uid] = { ...participants[uid], ready };
      }
      const patch = { participants, lastUpdated: iso(now), ...this.startPatch(game, participants, now) };
      tx.update(ref, patch);
      return { id: sessionId, ...game, ...patch };
    });
  }

  async getSession(sessionId, uid) {
    const snapshot = await this.db.collection('gameSessions').doc(sessionId).get();
    if (!snapshot.exists) throw new GameError('This game is no longer available.');
    const game = snapshot.data();
    if (!game.participants?.[uid] && !game.participantIds?.includes(uid)) throw new GameError('You are not a participant in this game.');
    return { id: snapshot.id, ...game };
  }

  async recover(uid, savedId) {
    if (savedId) {
      try { return await this.getSession(savedId, uid); } catch { /* Fall back to an active membership. */ }
    }
    const boards = await this.db.collection('playerBoards').where('playerId', '==', uid).get();
    for (const board of boards.docs.sort((a, b) => Date.parse(b.data().joinedAt) - Date.parse(a.data().joinedAt))) {
      try {
        const game = await this.getSession(board.data().sessionId, uid);
        if (game.status === 'active' || game.status === 'scheduled') return game;
      } catch { /* Deleted or withdrawn waiting membership. */ }
    }
    return null;
  }

  async dig(uid, move) {
    return this.serialize(move.sessionId, () => this.commitDig(uid, move));
  }

  async serialize(sessionId, callback) {
    // One server instance handles a match in order; transactions still protect against other writers.
    const previous = this.queues.get(sessionId) || Promise.resolve();
    const next = previous.catch(() => {}).then(callback);
    this.queues.set(sessionId, next);
    try { return await next; }
    finally { if (this.queues.get(sessionId) === next) this.queues.delete(sessionId); }
  }

  async commitDig(uid, { sessionId, requestId, row, col }) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) ||
      !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= 6 || col >= 6) throw new GameError('Invalid move.');
    const ref = this.db.collection('gameSessions').doc(sessionId);
    const result = await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new GameError('Game not found.');
      const game = snapshot.data();
      if (!game.participantIds.includes(uid)) throw new GameError('You are not a participant in this match.');
      const refs = game.participantIds.map(id => this.db.collection('playerBoards').doc(boardId(sessionId, id)));
      const boards = await tx.getAll(...refs);
      const index = game.participantIds.indexOf(uid);
      const player = boards[index].data();
      if (!player) throw new GameError('Player board not found.');
      const previous = player.processedMoves?.[requestId];
      if (previous) {
        if (previous.row !== row || previous.col !== col) throw new GameError('Move identifier was already used.');
        return { duplicate: true, completed: game.status === 'completed' };
      }
      const now = this.now();
      if (game.status !== 'active' || now >= Date.parse(game.deadline)) throw new GameError('This match has ended.');
      const board = typeof player.boardState === 'string' ? JSON.parse(player.boardState) : player.boardState;
      if (board[row][col].isRevealed || player.remainingDigs <= 0) throw new GameError('That dig is not available.');
      const square = board[row][col];
      square.isRevealed = true;
      let score = player.score;
      let remainingDigs = player.remainingDigs - 1;
      const discoveries = [...player.discoveries];
      const allDiscoveries = [...game.allDiscoveries];
      if (square.isTreasure) {
        const order = allDiscoveries.filter(d => d.row === row && d.col === col).length + 1;
        const points = Math.max(0, 100 - (order - 1) * 20);
        square.discoveryCount = order;
        const discovery = { playerId: uid, row, col, points, discoveryOrder: order, timestamp: iso(now) };
        allDiscoveries.push(discovery);
        discoveries.push(discovery);
        score += points;
        remainingDigs++;
      }
      const updated = {
        ...player, boardState: JSON.stringify(board), score, remainingDigs, discoveries,
        acceptedMoves: (player.acceptedMoves || 0) + 1,
        processedMoves: { ...player.processedMoves, [requestId]: { row, col } }
      };
      tx.update(refs[index], updated);
      const allPlayers = boards.map((b, i) => ({ id: b.id, ...(i === index ? updated : b.data()) }));
      const finished = allPlayers.every(p => p.remainingDigs === 0);
      tx.update(ref, {
        allDiscoveries, acceptedMoves: (game.acceptedMoves || 0) + 1, lastUpdated: iso(now),
        ...(finished ? this.finishPatch(allPlayers, 'digs-exhausted', now) : {})
      });
      return { duplicate: false, completed: finished };
    });
    if (result.completed) this.pendingArchives.add(sessionId);
    return result;
  }

  finishPatch(players, reason, now) {
    return { status: 'completed', endTime: iso(now), completionReason: reason,
      finalResults: rankPlayers(players).map(({ id, playerId, mockPlayerId, score, discoveries, remainingDigs, acceptedMoves, rank, digsUsed }) =>
        ({ id, playerId, mockPlayerId, score, discoveries, remainingDigs, acceptedMoves, rank, digsUsed })) };
  }

  async settle(sessionId) {
    return this.serialize(sessionId, () => this.commitSettlement(sessionId));
  }

  async commitSettlement(sessionId) {
    const ref = this.db.collection('gameSessions').doc(sessionId);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;
      const game = snapshot.data();
      const now = this.now();
      let patch = {};
      if (game.status === 'scheduled') {
        patch = this.startPatch(game, game.participants, now);
        if (!patch.status && now >= Date.parse(game.scheduledStartTime)) patch = {
          status: 'cancelled', endTime: iso(now), completionReason: 'not-enough-players', finalResults: [], lastUpdated: iso(now)
        };
      } else if (game.status === 'active' && now >= Date.parse(game.deadline)) {
        const boards = await tx.getAll(...game.participantIds.map(uid => this.db.collection('playerBoards').doc(boardId(sessionId, uid))));
        patch = { ...this.finishPatch(boards.map(b => ({ id: b.id, ...b.data() })), 'deadline', Date.parse(game.deadline)), lastUpdated: iso(now) };
      }
      if (patch.status) tx.update(ref, patch);
      return { id: sessionId, ...game, ...patch };
    });
  }

  async archive(sessionId) {
    const ref = this.db.collection('gameSessions').doc(sessionId);
    const history = this.db.collection('gameHistory').doc(sessionId);
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const archived = await tx.get(history);
      if (!snapshot.exists || archived.data()?.statsApplied || snapshot.data().archivedAt) return;
      const game = snapshot.data();
      if (!['completed', 'cancelled'].includes(game.status)) return;
      const players = game.finalResults || [];
      const statsRefs = players.map(p => this.db.collection('playerStats').doc(p.playerId));
      const stats = statsRefs.length ? await tx.getAll(...statsRefs) : [];
      const now = iso(this.now());
      players.forEach((p, i) => {
        const old = stats[i].data() || {};
        tx.set(statsRefs[i], {
          playerId: p.playerId, displayName: p.mockPlayerId, lastActive: now,
          gamesPlayed: (old.gamesPlayed || 0) + 1, gamesWon: (old.gamesWon || 0) + (p.rank === 1 ? 1 : 0),
          totalScore: (old.totalScore || 0) + p.score, totalDiscoveries: (old.totalDiscoveries || 0) + p.discoveries.length
        }, { merge: true });
      });
      tx.set(history, {
        gameId: sessionId, gameCode: game.gameCode, status: game.status, startedAt: game.startTime || null,
        endedAt: game.endTime, durationSeconds: game.startTime ? Math.max(0, (Date.parse(game.endTime) - Date.parse(game.startTime)) / 1000) : 0,
        finalPlayerCount: game.participantIds.length || Object.keys(game.participants).length, totalDiscoveries: game.allDiscoveries.length,
        acceptedMoves: game.acceptedMoves || 0, completionReason: game.completionReason,
        leaderboard: players, treasurePositions: game.treasurePositions, allDiscoveries: game.allDiscoveries,
        archivedAt: now, statsApplied: true
      }, { merge: true });
      tx.update(ref, { archivedAt: now });
    });
  }

  async maintenance({ skipWaiting = false } = {}) {
    const games = await this.db.collection('gameSessions').where(this.initialized ? 'status' : 'schemaVersion',
      this.initialized ? 'in' : '==', this.initialized ? ['scheduled', 'active'] : 2).get();
    for (const snapshot of games.docs) {
      if (snapshot.data().schemaVersion !== 2 || snapshot.data().archivedAt) continue;
      if (skipWaiting && snapshot.data().status === 'scheduled') continue;
      const game = await this.settle(snapshot.id);
      if (game && ['completed', 'cancelled'].includes(game.status)) this.pendingArchives.add(game.id);
    }
    this.initialized = true;
    this.archiveError = null;
    for (const id of this.pendingArchives) {
      try {
        await this.archive(id);
        this.pendingArchives.delete(id);
      } catch (error) {
        this.archiveError = error.message;
        console.error(`Archive ${id} will be retried: ${error.message}`);
      }
    }
    return this.ensureLobby();
  }
}
