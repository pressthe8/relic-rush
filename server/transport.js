import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { GameService, GameError } from './game-service.js';

export function createGameServer(db, verifyToken, options = {}) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { ...(options.clientOrigin ? { cors: { origin: options.clientOrigin } } : {}) });
  const service = new GameService(db, options);
  const connections = new Map();
  let timer;
  let busy = false;
  let healthy = false;
  let closing = false;
  let lobby;
  let lastLobbyPayload = '';
  const reported = new Set();
  const tasks = new Set();
  const track = promise => {
    tasks.add(promise);
    promise.finally(() => tasks.delete(promise)).catch(logError);
  };
  let recoveryGraceEnds = Date.now() + (options.recoveryGraceMs ?? 10000);
  const logError = error => console.error('Game service:', error.message);

  app.get('/health', (_req, res) => res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable', pendingArchives: service.pendingArchives.size }));
  app.use(express.static(resolve(options.staticDirectory || 'dist')));
  app.get('*', (_req, res) => res.sendFile(resolve(options.staticDirectory || 'dist', 'index.html')));

  io.use(async (socket, next) => {
    try {
      const user = await verifyToken(socket.handshake.auth?.token);
      if (!user.uid) throw new GameError('Missing guest identity');
      socket.data.uid = user.uid;
      next();
    } catch { next(new Error('Unable to authenticate your guest session. Please reconnect.')); }
  });

  const publicLobby = game => ({
    id: game.id, gameCode: game.gameCode, scheduledStartTime: game.scheduledStartTime,
    maxPlayers: game.maxPlayers, matchSeconds: game.matchSeconds, status: game.status,
    players: Object.entries(game.participants).map(([id, p]) => ({ id, ready: p.ready }))
  });
  async function publish(game) {
    if (game && ['active', 'cancelled'].includes(game.status) && !reported.has(game.id)) {
      reported.add(game.id);
      for (const uid of Object.keys(game.participants)) io.to(`guest:${uid}`).emit('session', { sessionId: game.id });
    }
    lobby = await service.ensureLobby();
    const payload = publicLobby(lobby);
    const serialized = JSON.stringify(payload);
    if (serialized !== lastLobbyPayload) { io.emit('lobby', payload); lastLobbyPayload = serialized; }
  }

  io.on('connection', socket => {
    const uid = socket.data.uid;
    const sockets = connections.get(uid) || new Set();
    sockets.add(socket.id);
    connections.set(uid, sockets);
    socket.join(`guest:${uid}`);
    if (lobby) socket.emit('lobby', publicLobby(lobby));
    const command = (event, handler) => socket.on(event, (data, ack) => track((async () => {
      if (typeof ack !== 'function') return;
      try {
        if (closing) throw new Error('The server is restarting. Please reconnect.');
        if (!data || typeof data !== 'object') throw new GameError('Invalid request.');
        const result = await handler(data);
        ack({ ok: true, data: result });
      } catch (error) { ack({ ok: false, error: error.message, retryable: !(error instanceof GameError) }); }
    })()));
    command('recover', async ({ sessionId }) => {
      const game = await service.recover(uid, typeof sessionId === 'string' ? sessionId : null);
      return { sessionId: game?.id || null, serverTime: Date.now() };
    });
    command('joinGame', async ({ sessionId }) => {
      if (typeof sessionId !== 'string') throw new GameError('Select a lobby first.');
      const game = await service.changeLobby(uid, sessionId, 'join');
      if (!connections.get(uid)?.size) await service.changeLobby(uid, sessionId, 'leave');
      await publish(game);
      return { sessionId };
    });
    command('leaveGame', async ({ sessionId }) => {
      if (typeof sessionId !== 'string') throw new GameError('Invalid lobby.');
      const game = await service.changeLobby(uid, sessionId, 'leave');
      if (!game) {
        const existing = await service.getSession(sessionId, uid);
        if (existing.status === 'active') {
          socket.emit('session', { sessionId });
          throw new GameError('This match has already started. Your place is saved.');
        }
      }
      await publish(game);
      return null;
    });
    command('setReady', async ({ sessionId, ready }) => {
      if (typeof sessionId !== 'string') throw new GameError('Invalid lobby.');
      const game = await service.changeLobby(uid, sessionId, 'ready', ready);
      await publish(game);
      return null;
    });
    command('dig', async data => {
      if (typeof data.sessionId !== 'string') throw new GameError('Invalid match.');
      const result = await service.dig(uid, data);
      const game = await service.getSession(data.sessionId, uid);
      if (game.status === 'completed') await service.archive(game.id).catch(logError);
      return result;
    });
    socket.on('disconnect', () => track((async () => {
      sockets.delete(socket.id);
      if (sockets.size) return;
      connections.delete(uid);
      if (closing) return;
      try {
        const current = await service.ensureLobby();
        const game = await service.changeLobby(uid, current.id, 'leave');
        await publish(game);
      } catch (error) { logError(error); }
    })()));
  });

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (lobby && Date.now() >= recoveryGraceEnds) {
        const current = await service.ensureLobby();
        for (const uid of Object.keys(current.participants)) {
          if (!connections.get(uid)?.size) await service.changeLobby(uid, current.id, 'leave');
        }
      }
      if (lobby && Date.now() >= recoveryGraceEnds) await publish(await service.settle(lobby.id));
      lobby = await service.maintenance({ skipWaiting: Date.now() < recoveryGraceEnds });
      healthy = true;
    } catch (error) { healthy = false; logError(error); }
    finally { busy = false; }
  }
  return {
    service, io, server,
    get port() { return server.address()?.port; },
    async start(port = 0) {
      recoveryGraceEnds = Date.now() + (options.recoveryGraceMs ?? 10000);
      lobby = await service.maintenance({ skipWaiting: true });
      healthy = true;
      await new Promise(resolve => server.listen(port, '0.0.0.0', resolve));
      timer = setInterval(() => track(tick()), options.tickMs || 1000);
    },
    async close() {
      closing = true;
      clearInterval(timer);
      await Promise.allSettled([...tasks]);
      await new Promise(resolve => io.close(resolve));
    }
  };
}
