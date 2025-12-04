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
      socketUrl = `http://${window.location.hostname}:3001`
    } else if (window.location.hostname.includes('webcontainer-api.io')) {
      // WebContainer environment - use window.location to construct proper URL
      const protocol = window.location.protocol
      const hostname = window.location.hostname

      // Extract the base hostname pattern and construct server URL
      // Format: protocol://hash--serverPort--hash.domain
      // We need to replace the port part with 3001
      const portMatch = hostname.match(/--(\d+)--/)
      if (portMatch) {
        const currentPort = portMatch[1]
        socketUrl = `${protocol}//${hostname.replace(`--${currentPort}--`, '--3001--')}`
      } else {
        // Fallback: append port-style pattern
        socketUrl = `${protocol}//${hostname.replace(/\.webcontainer/, '--3001.webcontainer')}`
      }
    } else {
      // Fallback for other environments
      socketUrl = `http://${window.location.hostname}:3001`
    }

    console.log('🔌 Connecting to Socket.IO server at:', socketUrl)

    const newSocket = io(socketUrl, {
      transports: ['polling', 'websocket'], // Try polling first in WebContainer
      timeout: 20000,
      forceNew: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: '/socket.io/'
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
      console.error('🔌 Error details:', {
        message: error.message,
        type: error.name,
        description: error.toString()
      })
      setLobbyState(prev => ({
        ...prev,
        isConnected: false,
        error: `Connection failed: ${error.message}. Please ensure the server is running.`
      }))
    })

    newSocket.on('error', (error) => {
      console.error('🔌 Socket error:', error)
    })

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔌 Reconnection attempt ${attemptNumber}`)
    })

    newSocket.on('reconnect_failed', () => {
      console.error('🔌 Reconnection failed after all attempts')
      setLobbyState(prev => ({
        ...prev,
        error: 'Failed to reconnect to server. Please refresh the page.'
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