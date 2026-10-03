import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { auth, initializeAuth, subscribeToGameSession, subscribeToPlayerBoards } from '../lib/firebase'
import type { GameSession, PlayerBoard } from '../lib/firebase'
import type { Position } from '../types'
import { calculateSubGridHintsFromCentralLog } from '../utils/centralHintUtils'

export interface LobbyGame {
  id: string
  gameCode: string
  scheduledStartTime: string
  maxPlayers: number
  matchSeconds: number
  players: { id: string; ready: boolean }[]
}
type Reply<T> = { ok: boolean; data: T; error?: string; retryable?: boolean }
class RequestError extends Error {
  constructor(message: string, readonly retryable = true) { super(message) }
}
type Move = Position & { sessionId: string; requestId: string }
const pendingKey = 'relic_rush_pending_move'

export function useMultiplayerGame() {
  const socket = useRef<Socket | null>(null)
  const locked = useRef(false)
  const selectedSession = useRef<string | null>(null)
  const [uid, setUid] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lobby, setLobby] = useState<LobbyGame | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [boards, setBoards] = useState<PlayerBoard[]>([])
  const [clockOffset, setClockOffset] = useState(0)
  const [subscriptionRevision, setSubscriptionRevision] = useState(0)
  const [pendingMove, setPendingMove] = useState<Move | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null') } catch { return null }
  })

  const request = useCallback(<T,>(event: string, data: object): Promise<T> => new Promise((resolve, reject) => {
    if (!socket.current?.connected) { reject(new RequestError('Connection lost. Reconnect to continue.')); return }
    socket.current.timeout(15000).emit(event, data, (timeout: Error | null, reply: Reply<T>) => {
      if (timeout) reject(new RequestError('The server did not respond. Please retry.'))
      else if (!reply?.ok) reject(new RequestError(reply?.error || 'Unable to complete this action.', reply?.retryable ?? true))
      else resolve(reply.data)
    })
  }), [])
  const openSession = useCallback((id: string | null, playerId: string) => {
    if (id) localStorage.setItem(`relic_rush_session_${playerId}`, id)
    else localStorage.removeItem(`relic_rush_session_${playerId}`)
    if (selectedSession.current !== id) {
      selectedSession.current = id
      setSessionId(id)
      setSession(null)
      setBoards([])
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let client: Socket | null = null
    const connect = async () => {
      try {
        const playerId = await initializeAuth()
        if (disposed) return
        setUid(playerId)
        client = io(import.meta.env.VITE_SERVER_URL || undefined, {
          auth: callback => { auth.currentUser?.getIdToken().then(token => callback({ token })).catch(() => callback({})) },
          reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000
        })
        socket.current = client
        client.on('lobby', (game: LobbyGame) => { setLobby(game) })
        client.on('session', ({ sessionId: id }: { sessionId: string }) => openSession(id, playerId))
        client.on('connect', async () => {
          setConnected(true)
          setLoading(true)
          setError(null)
          try {
            const start = Date.now()
            const recovery = await request<{ sessionId: string | null; serverTime: number }>('recover', {
              sessionId: localStorage.getItem(`relic_rush_session_${playerId}`)
            })
            if (disposed) return
            setClockOffset(recovery.serverTime - (Date.now() + start) / 2)
            openSession(recovery.sessionId, playerId)
            setSubscriptionRevision(value => value + 1)
            setLoading(false)
          } catch (error) { if (!disposed) { setError((error as Error).message); setLoading(false) } }
        })
        client.on('disconnect', () => { setConnected(false); setError('Connection lost. Reconnecting…') })
        client.on('connect_error', (error: Error) => { setConnected(false); setLoading(false); setError(error.message) })
      } catch (error) { if (!disposed) { setError((error as Error).message); setLoading(false) } }
    }
    void connect()
    return () => { disposed = true; client?.close(); socket.current = null }
  }, [request, openSession])

  useEffect(() => {
    if (!sessionId) return
    const failed = (error: Error) => { setError(error.message); setLoading(false) }
    const timer = setTimeout(() => failed(new Error('Game data is taking too long to load. Please reconnect.')), 10000)
    const stopSession = subscribeToGameSession(sessionId, game => {
      clearTimeout(timer)
      setSession(game)
      if (!game) failed(new Error('This game is no longer available. Return to the lobby.'))
    }, failed)
    const stopBoards = subscribeToPlayerBoards(sessionId, setBoards, failed)
    return () => { clearTimeout(timer); stopSession(); stopBoards() }
  }, [sessionId, subscriptionRevision])

  const action = useCallback(async (event: string, data: object, after?: (data: { sessionId: string }) => void) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    try { const result = await request<{ sessionId: string }>(event, data); after?.(result) }
    catch (error) { setError((error as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }, [request])
  const joinGame = () => { if (lobby) void action('joinGame', { sessionId: lobby.id }, result => openSession(result.sessionId, uid)) }
  const leaveGame = () => { if (lobby) void action('leaveGame', { sessionId: lobby.id }, () => openSession(null, uid)) }
  const setReady = (ready: boolean) => { if (lobby) void action('setReady', { sessionId: lobby.id, ready }) }
  const sendMove = useCallback(async (move: Move) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    setPendingMove(move)
    sessionStorage.setItem(pendingKey, JSON.stringify(move))
    try {
      await request('dig', move)
      sessionStorage.removeItem(pendingKey)
      setPendingMove(null)
    } catch (error) {
      setError((error as Error).message)
      if (error instanceof RequestError && !error.retryable) { sessionStorage.removeItem(pendingKey); setPendingMove(null) }
    }
    finally { locked.current = false; setBusy(false) }
  }, [request])
  const dig = (position: Position) => {
    if (session?.status !== 'active' || pendingMove || !sessionId) return
    void sendMove({ ...position, sessionId, requestId: crypto.randomUUID() })
  }
  const resetGame = () => {
    sessionStorage.removeItem(pendingKey)
    setPendingMove(null)
    openSession(null, uid)
    setError(null)
  }
  const reconnect = () => {
    if (socket.current) socket.current.disconnect().connect()
    else window.location.reload()
  }
  const player = boards.find(board => board.playerId === uid)
  const playerBoard = player && session ? {
    ...player, subGridHints: calculateSubGridHintsFromCentralLog(session.allDiscoveries || [], uid, session.gridSize)
  } : null
  const membership = lobby?.players.find(player => player.id === uid)
  return { uid, lobby, session, sessionId, playerBoard, otherPlayers: boards.filter(board => board.playerId !== uid),
    connected, loading, busy, error, clockOffset, hasJoined: !!membership, ready: membership?.ready || false,
    pendingMove, joinGame, leaveGame, setReady, dig, resetGame, reconnect,
    retryMove: () => { if (pendingMove) void sendMove(pendingMove) } }
}
