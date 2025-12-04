import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let io = null;
let lobbyState = {
  currentGame: null,
  players: new Map(),
  gameTimer: null
};

const generateGameCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let code = '';

  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }

  return code;
};

const createLobbyGame = async (supabase) => {
  try {
    console.log('🎮 Creating new lobby game...');

    const treasurePositions = [];
    const usedPositions = new Set();

    while (treasurePositions.length < 5) {
      const row = Math.floor(Math.random() * 6);
      const col = Math.floor(Math.random() * 6);
      const key = `${row},${col}`;

      if (!usedPositions.has(key)) {
        treasurePositions.push({ row, col });
        usedPositions.add(key);
      }
    }

    const gameCode = generateGameCode();
    const scheduledStartTime = new Date(Date.now() + 10 * 60 * 1000);

    const { data: game, error } = await supabase
      .from('game_sessions')
      .insert({
        game_code: gameCode,
        grid_size: 6,
        treasure_count: 5,
        dig_attempts: 10,
        treasure_positions: treasurePositions,
        scheduled_start_time: scheduledStartTime.toISOString(),
        status: 'scheduled',
        is_lobby_game: true,
        max_players: 6,
        game_settings: { gridSize: 6, treasureCount: 5, digAttempts: 10, gameMode: 'multiplayer' },
        all_discoveries: []
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Created lobby game:', game.game_code);
    return game;
  } catch (error) {
    console.error('❌ Failed to create lobby game:', error);
    return null;
  }
};

const startGame = async (supabase, gameId) => {
  try {
    console.log('🚀 Starting game:', gameId);

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'active',
        start_time: new Date().toISOString()
      })
      .eq('id', gameId);

    if (error) throw error;

    io.to('lobby').emit('gameStarting', { gameId });
    console.log('✅ Game started successfully');
  } catch (error) {
    console.error('❌ Failed to start game:', error);
  }
};

const cancelGame = async (supabase, gameId) => {
  try {
    console.log('❌ Cancelling game:', gameId);

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'cancelled',
        end_time: new Date().toISOString()
      })
      .eq('id', gameId);

    if (error) throw error;

    await supabase
      .from('player_boards')
      .delete()
      .eq('session_id', gameId);

    console.log('✅ Game cancelled successfully');
  } catch (error) {
    console.error('❌ Failed to cancel game:', error);
  }
};

const ensureLobbyGame = async (supabase) => {
  try {
    const { data: existingGame } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('is_lobby_game', true)
      .eq('status', 'scheduled')
      .single();

    if (existingGame) {
      console.log('✅ Found existing lobby game:', existingGame.game_code);
      return existingGame;
    }

    return await createLobbyGame(supabase);
  } catch (error) {
    console.error('❌ Error ensuring lobby game:', error);
    return await createLobbyGame(supabase);
  }
};

const broadcastLobbyUpdate = () => {
  const lobbyData = {
    currentGame: lobbyState.currentGame,
    playerCount: lobbyState.players.size,
    players: Array.from(lobbyState.players.values()).map(p => ({
      id: p.playerData.mock_player_id,
      joinedAt: p.playerData.joined_at
    }))
  };

  io.to('lobby').emit('lobbyUpdate', lobbyData);
  console.log('📡 Broadcasted lobby update:', lobbyData);
};

const setupGameTimer = (supabase) => {
  if (lobbyState.gameTimer) {
    clearTimeout(lobbyState.gameTimer);
  }

  if (!lobbyState.currentGame) return;

  const timeUntilStart = new Date(lobbyState.currentGame.scheduled_start_time).getTime() - Date.now();

  if (timeUntilStart > 0) {
    lobbyState.gameTimer = setTimeout(async () => {
      console.log('⏰ Game timer expired');

      if (lobbyState.players.size >= 2) {
        await startGame(supabase, lobbyState.currentGame.id);
      } else {
        await cancelGame(supabase, lobbyState.currentGame.id);
        lobbyState.players.clear();
        lobbyState.currentGame = await ensureLobbyGame(supabase);
        setupGameTimer(supabase);
        broadcastLobbyUpdate();
      }
    }, timeUntilStart);

    console.log(`⏰ Game timer set for ${Math.round(timeUntilStart / 1000)}s`);
  }
};

export default function socketIOPlugin() {
  return {
    name: 'socketio-server',
    configureServer(server) {
      if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
        console.error('❌ Missing Supabase environment variables');
        return;
      }

      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.VITE_SUPABASE_ANON_KEY
      );

      io = new Server(server.httpServer, {
        cors: {
          origin: true,
          methods: ["GET", "POST"],
          credentials: true
        },
        allowEIO3: true,
        transports: ['polling', 'websocket'],
        path: '/socket.io/',
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 30000,
        maxHttpBufferSize: 1e6,
        allowUpgrades: true
      });

      io.on('connection', (socket) => {
        console.log('🔌 User connected:', socket.id);

        socket.on('joinLobby', async () => {
          console.log('🎮 User joining lobby:', socket.id);

          socket.join('lobby');

          if (!lobbyState.currentGame) {
            lobbyState.currentGame = await ensureLobbyGame(supabase);
            setupGameTimer(supabase);
          }

          socket.emit('lobbyState', {
            currentGame: lobbyState.currentGame,
            playerCount: lobbyState.players.size,
            hasJoined: false
          });
        });

        socket.on('joinGame', async (data) => {
          const { mockPlayerId } = data;
          console.log('🎯 Player joining game:', mockPlayerId);

          if (!lobbyState.currentGame || lobbyState.players.size >= 6) {
            socket.emit('joinError', { message: 'Game is full or not available' });
            return;
          }

          try {
            const initialBoard = Array(6).fill(null).map(() =>
              Array(6).fill(null).map(() => ({
                isRevealed: false,
                isTreasure: false,
                discoveryCount: 0
              }))
            );

            lobbyState.currentGame.treasure_positions.forEach(pos => {
              if (initialBoard[pos.row] && initialBoard[pos.row][pos.col]) {
                initialBoard[pos.row][pos.col].isTreasure = true;
              }
            });

            const { data: playerBoard, error } = await supabase
              .from('player_boards')
              .insert({
                mock_player_id: mockPlayerId,
                is_mock_player: true,
                session_id: lobbyState.currentGame.id,
                board_state: initialBoard,
                remaining_digs: 10,
                score: 0,
                discoveries: [],
                sub_grid_hints: {}
              })
              .select()
              .single();

            if (error) throw error;

            lobbyState.players.set(mockPlayerId, {
              socketId: socket.id,
              playerData: playerBoard
            });

            socket.emit('joinSuccess', { playerBoard });
            broadcastLobbyUpdate();

            if (lobbyState.players.size >= 6) {
              await startGame(supabase, lobbyState.currentGame.id);
            }

          } catch (error) {
            console.error('❌ Failed to join game:', error);
            socket.emit('joinError', { message: 'Failed to join game' });
          }
        });

        socket.on('leaveGame', async (data) => {
          const { mockPlayerId } = data;
          console.log('🚪 Player leaving game:', mockPlayerId);

          if (lobbyState.players.has(mockPlayerId)) {
            try {
              await supabase
                .from('player_boards')
                .delete()
                .eq('session_id', lobbyState.currentGame.id)
                .eq('mock_player_id', mockPlayerId);

              lobbyState.players.delete(mockPlayerId);

              socket.emit('leaveSuccess');
              broadcastLobbyUpdate();

            } catch (error) {
              console.error('❌ Failed to leave game:', error);
              socket.emit('leaveError', { message: 'Failed to leave game' });
            }
          }
        });

        socket.on('disconnect', () => {
          console.log('🔌 User disconnected:', socket.id);

          for (const [playerId, playerInfo] of lobbyState.players.entries()) {
            if (playerInfo.socketId === socket.id) {
              console.log('🚪 Auto-removing disconnected player:', playerId);
              lobbyState.players.delete(playerId);

              supabase
                .from('player_boards')
                .delete()
                .eq('session_id', lobbyState.currentGame?.id)
                .eq('mock_player_id', playerId)
                .then(() => broadcastLobbyUpdate())
                .catch(console.error);

              break;
            }
          }
        });
      });

      // Initialize lobby system
      (async () => {
        console.log('🚀 Initializing Socket.IO lobby system...');

        try {
          const { data, error } = await supabase.from('game_sessions').select('count').limit(1);
          if (error) {
            console.error('❌ Supabase connection failed:', error);
            return;
          }
          console.log('✅ Supabase connection successful');

          await supabase
            .from('game_sessions')
            .update({ status: 'cancelled' })
            .eq('is_lobby_game', true)
            .in('status', ['scheduled', 'waiting']);

          lobbyState.currentGame = await ensureLobbyGame(supabase);
          setupGameTimer(supabase);

          console.log('✅ Socket.IO lobby system initialized');
          console.log('🔗 Socket.IO available on Vite server with path: /socket.io/');
        } catch (error) {
          console.error('❌ Failed to initialize lobby system:', error);
        }
      })();

      console.log('✅ Socket.IO server integrated with Vite');
    }
  };
}
