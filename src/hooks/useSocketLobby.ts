import { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { generateMockPlayerId } from '../lib/supabase'

interface LobbyGame {
  id: string
  game_code: string
  scheduled_start_time: string
  max_players: number
  status: 'scheduled'
  treasure_positions: any[]
}

interface LobbyState {
  currentGame: LobbyGame | null
  playerCount: number
  hasJoined: boolean
  isConnected: boolean
  isJoining: boolean
  isLeaving: boolean
  error: string | null
  playerMockId: string
}

interface LobbyPlayer {
  id: string
  joinedAt: string
}

export const useSocketLobby = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [lobbyState, setLobbyState] = useState<LobbyState>({
    currentGame: null,
    playerCount: 0,
    hasJoined: false,
    isConnected: false,
    isJoining: false,
    isLeaving: false,
    error: null,
    playerMockId: generateMockPlayerId()
  })

  // Initialize socket connection for WebContainer
  useEffect(() => {
    // Determine the correct socket URL based on environment
    let socketUrl: string
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Local development
      socketUrl = `${window.location.protocol}//${window.location.hostname}:3001`
    } else if (window.location.hostname.includes('webcontainer-api.io')) {
      // WebContainer environment - construct URL using current origin and replace port
      const currentOrigin = window.location.origin
      const frontendPort = window.location.port || '5173'
      socketUrl = currentOrigin.replace(`:${frontendPort}`, ':3001')
    } else {
      // Fallback for other environments
      socketUrl = `${window.location.protocol}//${window.location.hostname}:3001`
    }
    
    console.log('🔌 Connecting to Socket.IO server at:', socketUrl)
    
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      timeout: 20000,
      forceNew: true
    })
    
    setSocket(newSocket)

    // Connection events
    newSocket.on('connect', () => {
      console.log('🔌 Connected to lobby server')
      setLobbyState(prev => ({ ...prev, isConnected: true, error: null }))
      newSocket.emit('joinLobby')
    })

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from lobby server')
      setLobbyState(prev => ({ ...prev, isConnected: false }))
    })

    newSocket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error)
      setLobbyState(prev => ({ 
        ...prev, 
        isConnected: false, 
        error: `Connection failed: ${error.message}` 
      }))
    })

    // Lobby events
    newSocket.on('lobbyState', (data) => {
      console.log('📡 Received lobby state:', data)
      setLobbyState(prev => ({
        ...prev,
        currentGame: data.currentGame,
        playerCount: data.playerCount,
        hasJoined: data.hasJoined || prev.hasJoined
      }))
    })

    newSocket.on('lobbyUpdate', (data) => {
      console.log('📡 Received lobby update:', data)
      setLobbyState(prev => ({
        ...prev,
        currentGame: data.currentGame,
        playerCount: data.playerCount
      }))
    })

    // Game events
    newSocket.on('joinSuccess', (data) => {
      console.log('✅ Successfully joined game:', data)
      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        isJoining: false,
        error: null
      }))
    })

    newSocket.on('joinError', (data) => {
      console.error('❌ Failed to join game:', data.message)
      setLobbyState(prev => ({
        ...prev,
        error: data.message,
        isJoining: false
      }))
    })

    newSocket.on('leaveSuccess', () => {
      console.log('✅ Successfully left game')
      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        isLeaving: false,
        error: null
      }))
    })

    newSocket.on('leaveError', (data) => {
      console.error('❌ Failed to leave game:', data.message)
      setLobbyState(prev => ({
        ...prev,
        error: data.message,
        isLeaving: false
      }))
    })

    newSocket.on('gameStarting', (data) => {
      console.log('🚀 Game is starting:', data.gameId)
      // Redirect to game - in WebContainer, we'll use the current URL structure
      window.location.href = `${window.location.origin}/#/game/${data.gameId}`
    })

    return () => {
      console.log('🔌 Cleaning up socket connection')
      newSocket.close()
    }
  }, [])

  const joinGame = useCallback(() => {
    if (!socket || !lobbyState.currentGame) return

    setLobbyState(prev => ({ ...prev, isJoining: true, error: null }))
    socket.emit('joinGame', { mockPlayerId: lobbyState.playerMockId })
  }, [socket, lobbyState.currentGame, lobbyState.playerMockId])

  const leaveGame = useCallback(() => {
    if (!socket) return

    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))
    socket.emit('leaveGame', { mockPlayerId: lobbyState.playerMockId })
  }, [socket, lobbyState.playerMockId])

  return {
    ...lobbyState,
    joinGame,
    leaveGame
  }
}