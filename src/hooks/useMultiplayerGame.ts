import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { auth, initializeAuth, subscribeToGameSession, subscribeToPlayerBoards } from '../lib/firebase'
import type { GameSession, PlayerBoard } from '../lib/firebase'
import type { Position } from '../types'
import { calculateSubGridHintsFromCentralLog } from '../utils/centralHintUtils'
import { liveStandings, personalStanding } from '../utils/standings'
import { mergeBoardUpdates } from '../utils/boardUpdates'

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
  const subscriptionRetries = useRef(0)
  const [uid, setUid] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<'connection' | 'data' | 'action'>('connection')
  const errorKindRef = useRef(errorKind)
  errorKindRef.current = errorKind
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
      subscriptionRetries.current = 0
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
        client.on('disconnect', () => { setConnected(false); setErrorKind('connection'); setError('Connection lost. Reconnecting…') })
        client.on('connect_error', (error: Error) => { setConnected(false); setLoading(false); setErrorKind('connection'); setError(error.message) })
      } catch (error) { if (!disposed) { setError((error as Error).message); setLoading(false) } }
    }
    void connect()
    return () => { disposed = true; client?.close(); socket.current = null }
  }, [request, openSession])

  useEffect(() => {
    if (!sessionId || !uid || auth.currentUser?.uid !== uid) return
    let disposed = false
    let retrying = false
    let sessionLoaded = false
    let boardsLoaded = false
    const clearDataError = () => {
      if (sessionLoaded && boardsLoaded) setError(current => errorKindRef.current === 'data' ? null : current)
    }
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const failed = (error: Error & { code?: string }) => {
      if (disposed || retrying) return
      setErrorKind('data')
      setLoading(false)
      if (['permission-denied', 'unauthenticated'].includes(error.code || '') && subscriptionRetries.current < 2) {
        retrying = true
        subscriptionRetries.current++
        setError('Refreshing access to your game…')
        retryTimer = setTimeout(() => {
          void auth.currentUser?.getIdToken(true).then(() => {
            if (!disposed) setSubscriptionRevision(value => value + 1)
          }).catch(() => { if (!disposed) setError('Unable to load game updates. Retry game updates to continue.') })
        }, subscriptionRetries.current * 500)
      } else setError('Unable to load game updates. Retry game updates to continue.')
    }
    const timer = setTimeout(() => failed(new Error('Game data is taking too long to load. Please reconnect.')), 10000)
    const stopSession = subscribeToGameSession(sessionId, game => {
      if (disposed || retrying) return
      clearTimeout(timer)
      setSession(game)
      sessionLoaded = !!game
      clearDataError()
      if (!game) failed(new Error('This game is no longer available. Return to the lobby.'))
    }, failed)
    const stopBoards = subscribeToPlayerBoards(sessionId, incoming => {
      if (disposed || retrying) return
      setBoards(current => mergeBoardUpdates(current, incoming))
      boardsLoaded = true
      clearDataError()
    }, failed)
    return () => { disposed = true; clearTimeout(timer); clearTimeout(retryTimer); stopSession(); stopBoards() }
  }, [sessionId, uid, subscriptionRevision])

  const action = useCallback(async (event: string, data: object, after?: (data: { sessionId: string }) => void) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    setErrorKind('action')
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
    setErrorKind('action')
    setPendingMove(move)
    sessionStorage.setItem(pendingKey, JSON.stringify(move))
    try {
      const result = await request<{ board?: Omit<PlayerBoard, 'boardState'> & { boardState: PlayerBoard['boardState'] | string } }>('dig', move)
      if (result.board && selectedSession.current === move.sessionId) {
        const board = { ...result.board, boardState: typeof result.board.boardState === 'string' ? JSON.parse(result.board.boardState) : result.board.boardState } as PlayerBoard
        setBoards(current => mergeBoardUpdates(current, [board]))
      }
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
    const board = boards.find(board => board.playerId === uid)
    if (!board || board.remainingDigs <= 0 || board.boardState[position.row]?.[position.col]?.isRevealed) return
    void sendMove({ ...position, sessionId, requestId: crypto.randomUUID() })
  }
  const resetGame = () => {
    sessionStorage.removeItem(pendingKey)
    setPendingMove(null)
    openSession(null, uid)
    setError(null)
  }
  const reconnect = () => {
    if (socket.current?.connected) {
      subscriptionRetries.current = 0
      setError(null)
      setSubscriptionRevision(value => value + 1)
      return
    }
    if (socket.current) socket.current.disconnect().connect()
    else window.location.reload()
  }
  const player = boards.find(board => board.playerId === uid)
  const playerBoard = player && session ? {
    ...player, subGridHints: calculateSubGridHintsFromCentralLog(session.allDiscoveries || [], uid, session.gridSize)
  } : null
  const membership = lobby?.players.find(player => player.id === uid)
  const standings = liveStandings(boards, session?.status === 'active' ? session.participantIds : [])
  const currentRank = personalStanding(standings, uid)?.rank ?? null
  return { uid, lobby, session, sessionId, playerBoard, otherPlayers: boards.filter(board => board.playerId !== uid),
    standings, currentRank,
    connected, loading, busy, error, errorKind, dismissError: () => setError(null), clockOffset, hasJoined: !!membership, ready: membership?.ready || false,
    pendingMove, joinGame, leaveGame, setReady, dig, resetGame, reconnect,
    retryMove: () => { if (pendingMove) void sendMove(pendingMove) } }
}
