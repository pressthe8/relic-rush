import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite dev server
    methods: ["GET", "POST"]
  }
});

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// In-memory lobby state for fast access
let lobbyState = {
  currentGame: null,
  players: new Map(), // playerId -> { socketId, playerData }
  gameTimer: null
};

// Utility functions
const generateMockPlayerId = () => `mock_player_${Math.random().toString(36).substr(2, 8)}`;

const generateGameCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let code = '';
  
  // 3 letters + 3 numbers
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
};

const createLobbyGame = async () => {
  try {
    console.log('🎮 Creating new lobby game...');
    
    // Generate treasure positions for 6x6 grid
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
    const scheduledStartTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
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

const startGame = async (gameId) => {
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
    
    // Notify all players that the game is starting
    io.to('lobby').emit('gameStarting', { gameId });
    
    console.log('✅ Game started successfully');
  } catch (error) {
    console.error('❌ Failed to start game:', error);
  }
};

const cancelGame = async (gameId) => {
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
    
    // Remove all players from cancelled game
    await supabase
      .from('player_boards')
      .delete()
      .eq('session_id', gameId);
    
    console.log('✅ Game cancelled successfully');
  } catch (error) {
    console.error('❌ Failed to cancel game:', error);
  }
};

const ensureLobbyGame = async () => {
  try {
    // Check if there's already a scheduled lobby game
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
    
    // Create new lobby game
    return await createLobbyGame();
  } catch (error) {
    console.error('❌ Error ensuring lobby game:', error);
    return await createLobbyGame();
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

const setupGameTimer = () => {
  if (lobbyState.gameTimer) {
    clearTimeout(lobbyState.gameTimer);
  }
  
  if (!lobbyState.currentGame) return;
  
  const timeUntilStart = new Date(lobbyState.currentGame.scheduled_start_time).getTime() - Date.now();
  
  if (timeUntilStart > 0) {
    lobbyState.gameTimer = setTimeout(async () => {
      console.log('⏰ Game timer expired');
      
      if (lobbyState.players.size >= 2) {
        // Start the game
        await startGame(lobbyState.currentGame.id);
      } else {
        // Cancel and create new game
        await cancelGame(lobbyState.currentGame.id);
        lobbyState.players.clear();
        lobbyState.currentGame = await ensureLobbyGame();
        setupGameTimer();
        broadcastLobbyUpdate();
      }
    }, timeUntilStart);
    
    console.log(`⏰ Game timer set for ${Math.round(timeUntilStart / 1000)}s`);
  }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  
  socket.on('joinLobby', async () => {
    console.log('🎮 User joining lobby:', socket.id);
    
    socket.join('lobby');
    
    // Ensure we have a lobby game
    if (!lobbyState.currentGame) {
      lobbyState.currentGame = await ensureLobbyGame();
      setupGameTimer();
    }
    
    // Send current lobby state
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
      // Create initial board state
      const initialBoard = Array(6).fill(null).map(() =>
        Array(6).fill(null).map(() => ({
          isRevealed: false,
          isTreasure: false,
          discoveryCount: 0
        }))
      );
      
      // Place treasures
      lobbyState.currentGame.treasure_positions.forEach(pos => {
        if (initialBoard[pos.row] && initialBoard[pos.row][pos.col]) {
          initialBoard[pos.row][pos.col].isTreasure = true;
        }
      });
      
      // Add player to database
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
      
      // Add to lobby state
      lobbyState.players.set(mockPlayerId, {
        socketId: socket.id,
        playerData: playerBoard
      });
      
      socket.emit('joinSuccess', { playerBoard });
      broadcastLobbyUpdate();
      
      // Check if we should start the game immediately (6 players)
      if (lobbyState.players.size >= 6) {
        await startGame(lobbyState.currentGame.id);
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
        // Remove from database
        await supabase
          .from('player_boards')
          .delete()
          .eq('session_id', lobbyState.currentGame.id)
          .eq('mock_player_id', mockPlayerId);
        
        // Remove from lobby state
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
    
    // Find and remove player by socket ID
    for (const [playerId, playerInfo] of lobbyState.players.entries()) {
      if (playerInfo.socketId === socket.id) {
        console.log('🚪 Auto-removing disconnected player:', playerId);
        lobbyState.players.delete(playerId);
        
        // Remove from database
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
const initializeLobby = async () => {
  console.log('🚀 Initializing lobby system...');
  
  // Clean up any existing lobby games
  await supabase
    .from('game_sessions')
    .update({ status: 'cancelled' })
    .eq('is_lobby_game', true)
    .in('status', ['scheduled', 'waiting']);
  
  // Create initial lobby game
  lobbyState.currentGame = await ensureLobbyGame();
  setupGameTimer();
  
  console.log('✅ Lobby system initialized');
};

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  initializeLobby();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  if (lobbyState.gameTimer) {
    clearTimeout(lobbyState.gameTimer);
  }
  server.close();
});