import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, connectAuthEmulator, setPersistence, browserLocalPersistence, updateProfile } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, collection, query, where, onSnapshot } from 'firebase/firestore'
import type { Square, Position, SubGridHints } from '../types'
import { generateGuestName } from '../utils/guestNames'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
})
export const auth = getAuth(app)
export const db = getFirestore(app)
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
let authentication: Promise<string> | null = null
export const initializeAuth = (): Promise<string> => {
  authentication ||= (async () => {
    await auth.authStateReady()
    // Use explicit local persistence, including browsers with unreliable IndexedDB.
    // Do not silently create a session-only identity when durable storage fails.
    try { await setPersistence(auth, browserLocalPersistence) }
    catch { throw new Error('Your browser could not save your guest sign-in. Allow site storage, then retry.') }
    const existing = auth.currentUser
    const user = existing || (await signInAnonymously(auth)).user
    const pendingNameKey = `relic_rush_guest_name_pending_${user.uid}`
    // Record only accounts created here. A failed profile write can be retried on
    // refresh without renaming an older guest whose profile has no display name.
    if (!existing) localStorage.setItem(pendingNameKey, generateGuestName(user.uid))
    const pendingName = localStorage.getItem(pendingNameKey)
    if (pendingName) {
      if (!user.displayName) await updateProfile(user, { displayName: pendingName })
      await user.getIdToken(true)
      localStorage.removeItem(pendingNameKey)
    }
    return user.uid
  })().catch(error => { authentication = null; throw error })
  return authentication
}
export interface Discovery extends Position {
  playerId: string
  points: number
  timestamp: string
  discoveryOrder: number
}
export interface PlayerBoard {
  id: string
  playerId?: string
  mockPlayerId?: string
  sessionId: string
  boardState: Square[][]
  score: number
  remainingDigs: number
  discoveries: Discovery[]
  subGridHints: SubGridHints
  joinedAt: string
  rank?: number
  acceptedMoves?: number
}
export interface GameSession {
  id: string
  gameCode: string
  gridSize: number
  matchSeconds?: number
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  allDiscoveries: Discovery[]
  participants: Record<string, { ready: boolean; joinedAt: string }>
  participantIds: string[]
  startTime: string
  deadline?: string
  endTime?: string
  completionReason?: string
  finalResults?: FinalResult[]
}
export type FinalResult = Pick<PlayerBoard, 'id' | 'playerId' | 'mockPlayerId' | 'score' | 'remainingDigs' | 'discoveries' | 'acceptedMoves'> & {
  rank: number
  digsUsed: number
}
export const isValidGameCode = (code: string) => /^[A-Z]{3}[0-9]{3}$/i.test(code.trim())
export const subscribeToGameSession = (sessionId: string, callback: (session: GameSession | null) => void, onError: (error: Error) => void) =>
  onSnapshot(doc(db, 'gameSessions', sessionId), snapshot => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as GameSession : null)
  }, onError)
export const subscribeToPlayerBoards = (sessionId: string, callback: (boards: PlayerBoard[]) => void, onError: (error: Error) => void) =>
  onSnapshot(query(collection(db, 'playerBoards'), where('sessionId', '==', sessionId)), snapshot => {
    try {
      callback(snapshot.docs.map(snapshot => {
        const data = snapshot.data()
        return { id: snapshot.id, ...data, boardState: typeof data.boardState === 'string' ? JSON.parse(data.boardState) : data.boardState } as PlayerBoard
      }))
    } catch { onError(new Error('Unable to read your game board. Please reconnect.')) }
  }, onError)
