import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root (where .env file is located)
dotenv.config({ path: join(__dirname, '..', '.env') });

// Also try loading from server directory as fallback
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const server = createServer(app);

// Configure Socket.IO with WebContainer-compatible CORS settings
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins in WebContainer environment
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true, // Allow Engine.IO v3 clients
  transports: ['polling', 'websocket'], // Polling first for WebContainer compatibility
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6,
  allowUpgrades: true
});

// Validate environment variables
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error('❌ Missing required Firebase environment variables:');
  console.error('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅' : '❌');
  console.error('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅' : '❌');
  console.error('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅' : '❌');
  console.error('');
  console.error('Please create a .env file in the project root with:');
  console.error('FIREBASE_PROJECT_ID=your-project-id');
  console.error('FIREBASE_CLIENT_EMAIL=your-service-account-email');
  console.error('FIREBASE_PRIVATE_KEY=your-private-key');
  console.error('');
  console.error('You can get these values from your Firebase project service account.');
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  process.exit(1);
}

const db = admin.firestore();

// In-memory lobby state for fast access
let lobbyState = {
  currentGame: null,
  players: new Map(), // playerId -> { socketId, playerData }
  gameTimer: null,
  isInitialized: false
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

    const gameRef = db.collection('gameSessions').doc();
    const gameData = {
      gameCode: gameCode,
      gridSize: 6,
      treasureCount: 5,
      digAttempts: 10,
      treasurePositions: treasurePositions,
      scheduledStartTime: scheduledStartTime.toISOString(),
      status: 'scheduled',
      isLobbyGame: true,
      maxPlayers: 6,
      gameSettings: { gridSize: 6, treasureCount: 5, digAttempts: 10, gameMode: 'multiplayer' },
      allDiscoveries: [],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      startTime: ''
    };

    await gameRef.set(gameData);

    const game = {
      id: gameRef.id,
      ...gameData
    };

    console.log('✅ Created lobby game:', game.gameCode);
    return game;
  } catch (error) {
    console.error('❌ Failed to create lobby game:', error);
    return null;
  }
};

const startGame = async (gameId) => {
  try {
    console.log('🚀 Starting game:', gameId);

    await db.collection('gameSessions').doc(gameId).update({
      status: 'active',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      startedPlayerCount: lobbyState.players.size
    });

    // Notify all players that the game is starting
    io.to('lobby').emit('gameStarting', { gameId });

    console.log('✅ Game started successfully');

    // Clear lobby state and create new lobby game immediately
    // This ensures new players see a fresh countdown
    lobbyState.players.clear();
    lobbyState.currentGame = await ensureLobbyGame();
    setupGameTimer();
    broadcastLobbyUpdate();

  } catch (error) {
    console.error('❌ Failed to start game:', error);
  }
};

const cancelGame = async (gameId) => {
  try {
    console.log('❌ Cancelling game:', gameId);

    await db.collection('gameSessions').doc(gameId).update({
      status: 'cancelled',
      endTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    // Archive stats BEFORE deleting boards
    await archiveGame(gameId, 'cancelled');

    // Remove all players from cancelled game
    const playersSnapshot = await db.collection('playerBoards')
      .where('sessionId', '==', gameId)
      .get();

    const batch = db.batch();
    playersSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log('✅ Game cancelled successfully');
  } catch (error) {
    console.error('❌ Failed to cancel game:', error);
  }
};

let lobbyCreationPromise = null;

const ensureLobbyGame = async () => {
  if (lobbyCreationPromise) {
    console.log('⏳ Waiting for existing lobby creation...');
    return lobbyCreationPromise;
  }

  lobbyCreationPromise = (async () => {
    try {
      // Check if there's already a scheduled lobby game
      const existingGameSnapshot = await db.collection('gameSessions')
        .where('isLobbyGame', '==', true)
        .where('status', '==', 'scheduled')
        .limit(1)
        .get();

      if (!existingGameSnapshot.empty) {
        const existingGameDoc = existingGameSnapshot.docs[0];
        const existingGame = {
          id: existingGameDoc.id,
          ...existingGameDoc.data()
        };
        console.log('✅ Found existing lobby game:', existingGame.gameCode);
        return existingGame;
      }

      // Create new lobby game
      return await createLobbyGame();
    } catch (error) {
      console.error('❌ Error ensuring lobby game:', error);
      return await createLobbyGame();
    } finally {
      lobbyCreationPromise = null;
    }
  })();

  return lobbyCreationPromise;
};

const broadcastLobbyUpdate = () => {
  const lobbyData = {
    currentGame: lobbyState.currentGame,
    playerCount: lobbyState.players.size,
    players: Array.from(lobbyState.players.values()).map(p => ({
      id: p.playerData.mockPlayerId,
      joinedAt: p.playerData.joinedAt
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

  const timeUntilStart = new Date(lobbyState.currentGame.scheduledStartTime).getTime() - Date.now();

  if (timeUntilStart <= 0) {
    console.log('⏰ Game start time has passed, checking start conditions...');

    if (lobbyState.players.size >= 2) {
      // Start the game immediately
      startGame(lobbyState.currentGame.id);
    } else {
      // Cancel and create new game
      cancelGame(lobbyState.currentGame.id).then(async () => {
        lobbyState.players.clear();
        lobbyState.currentGame = await ensureLobbyGame();
        setupGameTimer();
        broadcastLobbyUpdate();
      });
    }
    return;
  }

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

// Add basic Express middleware for health checks
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lobbyPlayers: lobbyState.players.size,
    currentGame: lobbyState.currentGame?.gameCode || 'none',
    environment: 'firebase',
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'missing'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('joinLobby', async () => {
    console.log('🎮 User joining lobby:', socket.id);

    socket.join('lobby');

    // Wait for lobby to be initialized
    if (!lobbyState.isInitialized) {
      console.log('⏳ Waiting for lobby initialization...');
      // Wait up to 10 seconds for initialization
      const startTime = Date.now();
      while (!lobbyState.isInitialized && Date.now() - startTime < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!lobbyState.isInitialized) {
        console.error('❌ Lobby initialization timeout');
        socket.emit('lobbyError', { message: 'Lobby not ready, please try again' });
        return;
      }
    }

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

    // Check if player is already in the lobby map (rejoining lobby)
    if (lobbyState.players.has(mockPlayerId)) {
      console.log('🔄 Player rejoining lobby:', mockPlayerId);
      const playerInfo = lobbyState.players.get(mockPlayerId);

      // Update socket ID
      playerInfo.socketId = socket.id;
      lobbyState.players.set(mockPlayerId, playerInfo);

      socket.emit('joinSuccess', { playerBoard: playerInfo.playerData });
      broadcastLobbyUpdate();
      return;
    }

    // Check if player board exists in Firebase for current game (rejoin after disconnect)
    try {
      console.log('🔍 Checking Firebase for existing board. mockPlayerId:', mockPlayerId, 'currentGameId:', lobbyState.currentGame.id);

      const existingBoardSnapshot = await db.collection('playerBoards')
        .where('mockPlayerId', '==', mockPlayerId)
        .where('sessionId', '==', lobbyState.currentGame.id)
        .limit(1)
        .get();

      console.log('🔍 Firebase query returned', existingBoardSnapshot.size, 'results');

      if (!existingBoardSnapshot.empty) {
        console.log('🔄 Restoring player from Firebase:', mockPlayerId);
        const boardDoc = existingBoardSnapshot.docs[0];
        const playerBoard = {
          id: boardDoc.id,
          ...boardDoc.data()
        };

        // Restore to lobby state
        lobbyState.players.set(mockPlayerId, {
          socketId: socket.id,
          playerData: playerBoard
        });

        socket.emit('joinSuccess', { playerBoard });
        broadcastLobbyUpdate();
        return;
      }
    } catch (error) {
      console.error('❌ Error checking for existing player board:', error);
    }

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
      lobbyState.currentGame.treasurePositions.forEach(pos => {
        if (initialBoard[pos.row] && initialBoard[pos.row][pos.col]) {
          initialBoard[pos.row][pos.col].isTreasure = true;
        }
      });

      // Add player to database
      const playerRef = db.collection('playerBoards').doc();
      const playerData = {
        mockPlayerId: mockPlayerId,
        isMockPlayer: true,
        sessionId: lobbyState.currentGame.id,
        boardState: JSON.stringify(initialBoard), // Convert to JSON string for Firestore
        remainingDigs: 10,
        score: 0,
        discoveries: [],
        subGridHints: {},
        joinedAt: new Date().toISOString()
      };

      await playerRef.set(playerData);

      const playerBoard = {
        id: playerRef.id,
        ...playerData
      };

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
        const playerInfo = lobbyState.players.get(mockPlayerId);

        // Remove from database
        await db.collection('playerBoards').doc(playerInfo.playerData.id).delete();

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

    // Find player by socket ID
    for (const [playerId, playerInfo] of lobbyState.players.entries()) {
      if (playerInfo.socketId === socket.id) {
        console.log('🚪 Player disconnected from lobby:', playerId);

        // Remove from in-memory lobby state
        lobbyState.players.delete(playerId);

        // Only delete from database if the game hasn't been joined yet
        // For scheduled/active games, preserve the player data for rejoining
        if (lobbyState.currentGame && lobbyState.currentGame.status === 'scheduled') {
          console.log('💾 Preserving player data for rejoin (scheduled game)');
          // Don't delete from database - they can rejoin
        } else {
          // Game is waiting/cancelled/completed, safe to delete
          console.log('🗑️ Removing player from database');
          db.collection('playerBoards').doc(playerInfo.playerData.id).delete()
            .catch(console.error);
        }

        broadcastLobbyUpdate();
        break;
      }
    }
  });
});

// Initialize lobby system
const initializeLobby = async () => {
  console.log('🚀 Initializing lobby system...');

  try {
    // 1. Run Purge First (Efficiency: Remove 24h+ dead games before checking hygiene)
    await cleanupOldGames();

    // Schedule cleanup to run every 24 hours
    setInterval(cleanupOldGames, 24 * 60 * 60 * 1000);

    // Test Firebase connection
    await db.collection('gameSessions').limit(1).get();
    console.log('✅ Firebase connection successful');

    // Clean up any existing lobby games FIRST
    const existingLobbyGames = await db.collection('gameSessions')
      .where('isLobbyGame', '==', true)
      .where('status', 'in', ['scheduled', 'waiting'])
      .get();

    if (!existingLobbyGames.empty) {
      const batch = db.batch();
      const gameIds = [];

      existingLobbyGames.docs.forEach(doc => {
        gameIds.push(doc.id);
        batch.update(doc.ref, {
          status: 'cancelled',
          lastUpdated: new Date().toISOString()
        });
      });
      await batch.commit();
      console.log(`✅ Cancelled ${existingLobbyGames.size} existing lobby games`);

      // Delete player boards from these games
      for (const gameId of gameIds) {
        const playersSnapshot = await db.collection('playerBoards')
          .where('sessionId', '==', gameId)
          .get();

        if (!playersSnapshot.empty) {
          const deleteBatch = db.batch();
          playersSnapshot.docs.forEach(doc => {
            deleteBatch.delete(doc.ref);
          });
          await deleteBatch.commit();
          console.log(`🗑️ Deleted ${playersSnapshot.size} player boards from game ${gameId}`);
        }
      }
    }

    // ALSO clean up player boards from ANY cancelled lobby games (from previous restarts)
    const cancelledLobbyGames = await db.collection('gameSessions')
      .where('isLobbyGame', '==', true)
      .where('status', '==', 'cancelled')
      .get();

    if (!cancelledLobbyGames.empty) {
      console.log(`🧹 Found ${cancelledLobbyGames.size} old cancelled lobby games, cleaning up player boards...`);

      for (const gameDoc of cancelledLobbyGames.docs) {
        const playersSnapshot = await db.collection('playerBoards')
          .where('sessionId', '==', gameDoc.id)
          .get();

        if (!playersSnapshot.empty) {
          const deleteBatch = db.batch();
          playersSnapshot.docs.forEach(doc => {
            deleteBatch.delete(doc.ref);
          });
          await deleteBatch.commit();
          console.log(`🗑️ Deleted ${playersSnapshot.size} orphaned player boards from cancelled game ${gameDoc.id}`);
        }
      }
    }

    // NOW create a fresh lobby game (ensureLobbyGame won't find any scheduled ones)
    lobbyState.currentGame = await ensureLobbyGame();
    setupGameTimer();
    lobbyState.isInitialized = true;

    console.log('✅ Lobby system initialized');

  } catch (error) {
    console.error('❌ Failed to initialize lobby system:', error);
    lobbyState.isInitialized = true; // Set to true even on error to avoid blocking
  }
};

const archiveGame = async (gameId, statusOverride = null) => {
  try {
    const gameDoc = await db.collection('gameSessions').doc(gameId).get();
    if (!gameDoc.exists) return;

    const game = gameDoc.data();
    const status = statusOverride || game.status;

    // Fetch all players for this game
    const playersSnapshot = await db.collection('playerBoards')
      .where('sessionId', '==', gameId)
      .get();

    // Calculate Stats
    const players = playersSnapshot.docs.map(doc => doc.data());
    const finalPlayerCount = players.length;

    // Duration
    const startTime = new Date(game.startTime || game.createdAt);
    const endTime = new Date(game.endTime || new Date().toISOString());
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    // Total Discoveries
    // We can sum up discoveries from all players to be robust
    const totalDiscoveries = players.reduce((sum, p) => sum + (p.discoveries ? p.discoveries.length : 0), 0);

    // Leaderboard & Winner
    // Sort by score descending
    const sortedPlayers = players.sort((a, b) => (b.score || 0) - (a.score || 0));

    const leaderboard = sortedPlayers.map((p, index) => ({
      playerId: p.mockPlayerId,
      score: p.score || 0,
      digsUsed: game.digAttempts - (p.remainingDigs || 0),
      discoveriesCount: p.discoveries ? p.discoveries.length : 0,
      rank: index + 1
    }));

    // Winner is top of leaderboard if game is completed
    const winner = (status === 'completed' && leaderboard.length > 0)
      ? { playerId: leaderboard[0].playerId, score: leaderboard[0].score }
      : null;

    // Write to gameHistory
    await db.collection('gameHistory').doc(gameId).set({
      gameId,
      gameCode: game.gameCode,
      status: status,
      startedAt: game.startTime || null,
      endedAt: endTime.toISOString(),
      durationSeconds: durationSeconds > 0 ? durationSeconds : 0,
      totalDiscoveries,
      finalPlayerCount,
      winner,
      leaderboard,
      // Preserve for future replay/analytics
      treasurePositions: game.treasurePositions || [],
      allDiscoveries: game.allDiscoveries || [],
      archivedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`📜 Archived game ${gameId} as ${status}`);

    // Update Player Stats (Persistence)
    const statsBatch = db.batch();

    for (const player of players) {
      if (!player.mockPlayerId) continue;

      const statsRef = db.collection('playerStats').doc(player.mockPlayerId);
      const isWinner = winner && winner.playerId === player.mockPlayerId;
      const discoveriesCount = player.discoveries ? player.discoveries.length : 0;
      const score = player.score || 0;

      statsBatch.set(statsRef, {
        playerId: player.mockPlayerId,
        lastActive: new Date().toISOString(),
        displayName: player.displayName || `Player ${player.mockPlayerId.substr(0, 6)}`, // Fallback or existing
        gamesPlayed: admin.firestore.FieldValue.increment(1),
        gamesWon: admin.firestore.FieldValue.increment(isWinner ? 1 : 0),
        totalScore: admin.firestore.FieldValue.increment(score),
        totalDiscoveries: admin.firestore.FieldValue.increment(discoveriesCount)
      }, { merge: true });
    }

    await statsBatch.commit();
    console.log(`👤 Updated stats for ${players.length} players`);

  } catch (error) {
    console.error(`❌ Failed to archive game ${gameId}:`, error);
  }
};

const cleanupOldGames = async () => {
  console.log('🧹 Starting cleanup of old games...');
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Query ALL games last updated > 24h ago
    const oldGamesSnapshot = await db.collection('gameSessions')
      .where('lastUpdated', '<', twentyFourHoursAgo)
      .get();

    if (oldGamesSnapshot.empty) {
      console.log('✅ No old games to cleanup');
      return;
    }

    console.log(`🧹 Found ${oldGamesSnapshot.size} old games to process`);

    const batch = db.batch();
    const gameIdsToDelete = [];

    for (const doc of oldGamesSnapshot.docs) {
      const game = doc.data();
      gameIdsToDelete.push(doc.id);

      // ZOMBIE CHECK: If status is active/scheduled/waiting, force archive as cancelled
      let statusToArchive = game.status;
      if (['active', 'scheduled', 'waiting'].includes(game.status)) {
        console.log(`🧟 Found ZOMBIE game ${game.gameCode} (${game.status}). Force archiving as cancelled.`);
        statusToArchive = 'cancelled';
      }

      // Archive it first (Safety Net)
      await archiveGame(doc.id, statusToArchive);

      // Mark for deletion
      batch.delete(doc.ref);
    }

    // Delete Players for these games
    for (const gameId of gameIdsToDelete) {
      const playersSnapshot = await db.collection('playerBoards')
        .where('sessionId', '==', gameId)
        .get();

      if (!playersSnapshot.empty) {
        const playerBatch = db.batch();
        playersSnapshot.docs.forEach(p => playerBatch.delete(p.ref));
        await playerBatch.commit();
      }
    }

    // Commit Game Deletions
    await batch.commit();
    console.log(`✅ Cleanup complete. Processed ${oldGamesSnapshot.size} games.`);

  } catch (error) {
    console.error('❌ Error during game cleanup:', error);
  }
};

// Add endpoint for immediate archiving from client
app.post('/api/archive-game', async (req, res) => {
  const { gameId, status } = req.body;
  if (!gameId) {
    return res.status(400).json({ error: 'Missing gameId' });
  }

  console.log(`📥 Received archive request for ${gameId} (${status})`);

  // Archiving is async, don't block response too long but ensure it starts
  archiveGame(gameId, status).then(() => {
    console.log(`✅ Immediate archive successful for ${gameId}`);
  }).catch(err => {
    console.error(`❌ Immediate archive failed for ${gameId}:`, err);
  });

  res.json({ success: true, message: 'Archive process started' });
});

// Get player stats
app.get('/api/player-stats/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const statsDoc = await db.collection('playerStats').doc(id).get();
    if (!statsDoc.exists) {
      return res.status(404).json({ error: 'Stats not found' });
    }
    res.json(statsDoc.data());
  } catch (error) {
    console.error(`❌ Failed to fetch stats for ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for WebContainer environment`);
  console.log(`🔗 Server accessible at: http://localhost:${PORT}`);
  console.log(`🔗 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Environment variables loaded:`, {
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'missing',
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'configured' : 'missing'
  });
  console.log(`⚙️  Socket.IO config: transports=[polling, websocket], path=/socket.io/`);
  initializeLobby();
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  if (lobbyState.gameTimer) {
    clearTimeout(lobbyState.gameTimer);
  }
  server.close();
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  if (lobbyState.gameTimer) {
    clearTimeout(lobbyState.gameTimer);
  }
  server.close();
  process.exit(0);
});