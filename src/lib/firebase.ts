import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { Square, SubGridHints } from '../types';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Export Firebase instances
export { db, auth };

// Auth state management
let currentUser: User | null = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

// Initialize anonymous authentication
export const initializeAuth = async (): Promise<string> => {
  try {
    if (currentUser) {
      return currentUser.uid;
    }
    const userCredential = await signInAnonymously(auth);
    return userCredential.user.uid;
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
};

// Ensure user is authenticated before operations
export const ensureAuth = async (): Promise<void> => {
  if (!currentUser) {
    await initializeAuth();
  }
};

// Utility functions (migrated from supabase.ts)
export const generateMockPlayerId = (): string => {
  return `mock_player_${Math.random().toString(36).substr(2, 8)}`;
};

export const generateGameCode = (): string => {
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

export const isValidGameCode = (code: string): boolean => {
  const gameCodeRegex = /^[A-Z]{3}[0-9]{3}$/i;
  return gameCodeRegex.test(code.trim());
};

// Types (migrated from supabase.ts)
export interface Discovery {
  playerId: string;
  row: number;
  col: number;
  points: number;
  timestamp: string;
  discoveryOrder: number;
}

export interface GameSession {
  id: string;
  gameCode?: string;
  gridSize: number;
  treasureCount: number;
  digAttempts: number;
  gameSettings: any;
  treasurePositions: any[];
  allDiscoveries: Discovery[];
  startTime: string;
  endTime?: string;
  lastUpdated: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
  isLobbyGame?: boolean;
  maxPlayers?: number;
  scheduledStartTime?: string;
}

export interface PlayerBoard {
  id: string;
  playerId?: string;
  mockPlayerId?: string;
  isMockPlayer: boolean;
  sessionId: string;
  boardState: Square[][];
  remainingDigs: number;
  score: number;
  discoveries: any[];
  subGridHints: SubGridHints;
  joinedAt: string;
}

// Helper function to convert Firestore Timestamp to ISO string
const timestampToString = (timestamp: any): string => {
  if (!timestamp) return new Date().toISOString();
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  return timestamp;
};

// Firestore helper functions for GameSession
export const createGameSession = async (data: Omit<GameSession, 'id' | 'createdAt' | 'lastUpdated'>): Promise<GameSession> => {
  await ensureAuth();

  const sessionRef = doc(collection(db, 'gameSessions'));
  const now = new Date().toISOString();

  const sessionData = {
    ...data,
    createdAt: now,
    lastUpdated: now
  };

  await setDoc(sessionRef, sessionData);

  return {
    id: sessionRef.id,
    ...sessionData
  } as GameSession;
};

export const getGameSession = async (sessionId: string): Promise<GameSession | null> => {
  await ensureAuth();

  const sessionRef = doc(db, 'gameSessions', sessionId);
  const snapshot = await getDoc(sessionRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: timestampToString(data.createdAt),
    lastUpdated: timestampToString(data.lastUpdated),
    startTime: timestampToString(data.startTime),
    endTime: data.endTime ? timestampToString(data.endTime) : undefined,
    scheduledStartTime: data.scheduledStartTime ? timestampToString(data.scheduledStartTime) : undefined
  } as GameSession;
};

export const getGameSessionByCode = async (gameCode: string): Promise<GameSession | null> => {
  await ensureAuth();

  const sessionsRef = collection(db, 'gameSessions');
  const q = query(sessionsRef, where('gameCode', '==', gameCode));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  return {
    id: snapshot.docs[0].id,
    ...data,
    createdAt: timestampToString(data.createdAt),
    lastUpdated: timestampToString(data.lastUpdated),
    startTime: timestampToString(data.startTime),
    endTime: data.endTime ? timestampToString(data.endTime) : undefined,
    scheduledStartTime: data.scheduledStartTime ? timestampToString(data.scheduledStartTime) : undefined
  } as GameSession;
};

export const updateGameSession = async (sessionId: string, data: Partial<GameSession>): Promise<void> => {
  await ensureAuth();

  const sessionRef = doc(db, 'gameSessions', sessionId);
  await updateDoc(sessionRef, {
    ...data,
    lastUpdated: new Date().toISOString()
  });
};

export const deleteGameSession = async (sessionId: string): Promise<void> => {
  await ensureAuth();

  const sessionRef = doc(db, 'gameSessions', sessionId);
  await deleteDoc(sessionRef);
};

// Firestore helper functions for PlayerBoard
export const createPlayerBoard = async (data: Omit<PlayerBoard, 'id' | 'joinedAt'>): Promise<PlayerBoard> => {
  await ensureAuth();

  const playerRef = doc(collection(db, 'playerBoards'));
  const now = new Date().toISOString();

  const playerData = {
    ...data,
    boardState: JSON.stringify(data.boardState), // Convert to JSON string for Firestore
    joinedAt: now
  };

  await setDoc(playerRef, playerData);

  return {
    id: playerRef.id,
    ...data, // Return original data with 2D array
    joinedAt: now
  } as PlayerBoard;
};

export const getPlayerBoard = async (playerId: string): Promise<PlayerBoard | null> => {
  await ensureAuth();

  const playerRef = doc(db, 'playerBoards', playerId);
  const snapshot = await getDoc(playerRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    boardState: typeof data.boardState === 'string' ? JSON.parse(data.boardState) : data.boardState,
    joinedAt: timestampToString(data.joinedAt)
  } as PlayerBoard;
};

export const getPlayerBoardsBySession = async (sessionId: string): Promise<PlayerBoard[]> => {
  await ensureAuth();

  const playersRef = collection(db, 'playerBoards');
  const q = query(playersRef, where('sessionId', '==', sessionId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      boardState: typeof data.boardState === 'string' ? JSON.parse(data.boardState) : data.boardState,
      joinedAt: timestampToString(data.joinedAt)
    } as PlayerBoard;
  });
};

export const getPlayerBoardByMockId = async (sessionId: string, mockPlayerId: string): Promise<PlayerBoard | null> => {
  await ensureAuth();

  const playersRef = collection(db, 'playerBoards');
  const q = query(
    playersRef,
    where('sessionId', '==', sessionId),
    where('mockPlayerId', '==', mockPlayerId)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  return {
    id: snapshot.docs[0].id,
    ...data,
    boardState: typeof data.boardState === 'string' ? JSON.parse(data.boardState) : data.boardState,
    joinedAt: timestampToString(data.joinedAt)
  } as PlayerBoard;
};

export const updatePlayerBoard = async (playerId: string, data: Partial<PlayerBoard>): Promise<void> => {
  await ensureAuth();

  const playerRef = doc(db, 'playerBoards', playerId);
  const updateData = { ...data };

  // Convert boardState to JSON string if it's being updated
  if (updateData.boardState) {
    updateData.boardState = JSON.stringify(updateData.boardState) as any;
  }

  await updateDoc(playerRef, updateData);
};

export const deletePlayerBoard = async (playerId: string): Promise<void> => {
  await ensureAuth();

  const playerRef = doc(db, 'playerBoards', playerId);
  await deleteDoc(playerRef);
};

export const deletePlayerBoardsBySession = async (sessionId: string): Promise<void> => {
  await ensureAuth();

  const players = await getPlayerBoardsBySession(sessionId);
  const batch = writeBatch(db);

  players.forEach(player => {
    const playerRef = doc(db, 'playerBoards', player.id);
    batch.delete(playerRef);
  });

  await batch.commit();
};

// Real-time listeners
export const subscribeToGameSession = (
  sessionId: string,
  callback: (session: GameSession | null) => void
): (() => void) => {
  const sessionRef = doc(db, 'gameSessions', sessionId);

  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      callback({
        id: snapshot.id,
        ...data,
        createdAt: timestampToString(data.createdAt),
        lastUpdated: timestampToString(data.lastUpdated),
        startTime: timestampToString(data.startTime),
        endTime: data.endTime ? timestampToString(data.endTime) : undefined,
        scheduledStartTime: data.scheduledStartTime ? timestampToString(data.scheduledStartTime) : undefined
      } as GameSession);
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('Error in game session subscription:', error);
    callback(null);
  });
};

export const subscribeToPlayerBoards = (
  sessionId: string,
  callback: (boards: PlayerBoard[]) => void
): (() => void) => {
  const playersRef = collection(db, 'playerBoards');
  const q = query(playersRef, where('sessionId', '==', sessionId));

  return onSnapshot(q, (snapshot) => {
    const boards = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        boardState: typeof data.boardState === 'string' ? JSON.parse(data.boardState) : data.boardState,
        joinedAt: timestampToString(data.joinedAt)
      } as PlayerBoard;
    });
    callback(boards);
  }, (error) => {
    console.error('Error in player boards subscription:', error);
    callback([]);
  });
};
