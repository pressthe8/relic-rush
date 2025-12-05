import React, { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { generateMockPlayerId } from '../lib/firebase'

interface LobbyGame {
  id: string
  gameCode: string
  scheduledStartTime: string
  maxPlayers: number
  status: 'scheduled'
  treasurePositions: any[]
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



export const useSocketLobby = (onGameStart?: (gameId: string) => void) => {
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

  // Keep track of the latest callback without triggering re-renders or re-connections
  const onGameStartRef = React.useRef(onGameStart)
  useEffect(() => {
    onGameStartRef.current = onGameStart
  }, [onGameStart])

  // Initialize socket connection for WebContainer
  useEffect(() => {
    // Socket.IO server runs on port 3001
    const socketUrl = 'http://localhost:3001'

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
      if (onGameStartRef.current) {
        onGameStartRef.current(data.gameId)
      }
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