import React, { useState, useEffect, useCallback } from 'react'
import { supabase, generateMockPlayerId } from '../lib/supabase'
import { LobbyGameCard } from './LobbyGameCard'
import { JoinedGameStatus } from './JoinedGameStatus'
import { Users, RefreshCw, AlertCircle, Wifi, WifiOff } from 'lucide-react'

interface LobbyGame {
  id: string
  game_code: string
  scheduled_start_time: string
  max_players: number
  status: 'scheduled'
  player_count: number
  joined_players: string[]
}

interface LobbyState {
  currentGame: LobbyGame | null
  hasJoined: boolean
  isJoining: boolean
  isLeaving: boolean
  isLoading: boolean
  error: string | null
  playerMockId: string
  connectionStatus: 'connected' | 'partial' | 'offline'
}

interface GameLobbyProps {
  onGameStart: (sessionId: string) => void
}

export const GameLobby: React.FC<GameLobbyProps> = ({ onGameStart }) => {
  const [lobbyState, setLobbyState] = useState<LobbyState>({
    currentGame: null,
    hasJoined: false,
    isJoining: false,
    isLeaving: false,
    isLoading: true,
    error: null,
    playerMockId: generateMockPlayerId(),
    connectionStatus: 'offline'
  })

  // Create mock lobby game for offline/demo mode
  const createMockLobbyGame = useCallback((): LobbyGame => {
    return {
      id: 'mock-lobby-game',
      game_code: 'DEMO01',
      scheduled_start_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      max_players: 6,
      status: 'scheduled',
      player_count: Math.floor(Math.random() * 4), // Random 0-3 players for demo
      joined_players: Array.from({ length: Math.floor(Math.random() * 4) }, (_, i) => `demo_player_${i + 1}`)
    }
  }, [])

  // Test connection with retry logic
  const testConnection = useCallback(async (retryCount = 0): Promise<'connected' | 'partial' | 'offline'> => {
    try {
      console.log(`🔍 Testing Supabase connectivity... ${retryCount > 0 ? retryCount : ''}`)
      
      // Test basic connection
      const { data, error } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)

      if (error) {
        console.error('❌ Basic connection test failed:', error)
        return 'offline'
      }

      console.log('✅ Connection test successful')
      return 'connected'
    } catch (error) {
      console.error('❌ Connection test failed:', error)
      
      // Retry up to 2 times with exponential backoff
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
        console.log(`🔄 Retrying connection in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return testConnection(retryCount + 1)
      }
      
      return 'offline'
    }
  }, [])

  // Load current lobby game with robust error handling
  const loadLobbyGame = useCallback(async () => {
    try {
      setLobbyState(prev => ({ ...prev, isLoading: true, error: null }))

      // Test connection first
      const connectionStatus = await testConnection()
      
      if (connectionStatus === 'offline') {
        console.log('🔄 No connection to Supabase, using mock lobby game')
        const mockGame = createMockLobbyGame()
        setLobbyState(prev => ({
          ...prev,
          currentGame: mockGame,
          hasJoined: false,
          isLoading: false,
          connectionStatus: 'offline'
        }))
        return
      }

      console.log('🔍 Fetching scheduled lobby games...')

      // Get current scheduled lobby game with timeout
      const gamePromise = supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      )

      const { data: lobbyGame, error: gameError } = await Promise.race([
        gamePromise,
        timeoutPromise
      ]) as any

      if (gameError) {
        console.error('❌ Error fetching lobby game:', gameError)
        throw gameError
      }

      if (!lobbyGame) {
        console.log('📭 No lobby game exists, creating mock game...')
        // Try to trigger creation of a new lobby game
        try {
          const { error: createError } = await supabase.rpc('ensure_lobby_game_available')
          if (createError) {
            console.warn('⚠️ Could not create lobby game:', createError)
          }
        } catch (createErr) {
          console.warn('⚠️ Failed to create lobby game, using mock:', createErr)
        }
        
        const mockGame = createMockLobbyGame()
        setLobbyState(prev => ({
          ...prev,
          currentGame: mockGame,
          hasJoined: false,
          isLoading: false,
          connectionStatus: 'partial'
        }))
        return
      }

      // Try to get players, but don't fail if this request fails
      let joinedPlayers: string[] = []
      let hasJoined = false
      
      try {
        const { data: players, error: playersError } = await Promise.race([
          supabase
            .from('player_boards')
            .select('mock_player_id')
            .eq('session_id', lobbyGame.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Players request timeout')), 5000)
          )
        ]) as any

        if (!playersError && players) {
          joinedPlayers = players.map((p: any) => p.mock_player_id).filter(Boolean)
          hasJoined = joinedPlayers.includes(lobbyState.playerMockId)
          console.log('🔍 Players in game:', joinedPlayers)
        } else {
          console.warn('⚠️ Could not fetch players, continuing with empty list')
        }
      } catch (playersErr) {
        console.warn('⚠️ Players request failed, continuing with empty list:', playersErr)
      }

      const currentGame: LobbyGame = {
        id: lobbyGame.id,
        game_code: lobbyGame.game_code,
        scheduled_start_time: lobbyGame.scheduled_start_time,
        max_players: lobbyGame.max_players,
        status: lobbyGame.status,
        player_count: joinedPlayers.length,
        joined_players: joinedPlayers
      }

      console.log('✅ Successfully loaded lobby game:', currentGame)

      setLobbyState(prev => ({
        ...prev,
        currentGame,
        hasJoined,
        isLoading: false,
        connectionStatus: 'connected'
      }))

    } catch (error) {
      console.error('❌ Failed to load lobby game:', error)
      
      // Always fall back to mock game on any error
      console.log('🔄 Falling back to mock lobby game due to error')
      const mockGame = createMockLobbyGame()
      
      setLobbyState(prev => ({
        ...prev,
        currentGame: mockGame,
        hasJoined: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load lobby game',
        connectionStatus: 'offline'
      }))
    }
  }, [lobbyState.playerMockId, createMockLobbyGame, testConnection])

  // Join current lobby game
  const handleJoinGame = async () => {
    if (!lobbyState.currentGame) return

    // Handle mock game join
    if (lobbyState.currentGame.id === 'mock-lobby-game') {
      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        currentGame: prev.currentGame ? {
          ...prev.currentGame,
          player_count: prev.currentGame.player_count + 1,
          joined_players: [...prev.currentGame.joined_players, prev.playerMockId]
        } : null
      }))
      return
    }

    setLobbyState(prev => ({ ...prev, isJoining: true, error: null }))

    try {
      // Create initial board state for 6x6 grid
      const initialBoard = Array(6).fill(null).map(() =>
        Array(6).fill(null).map(() => ({
          isRevealed: false,
          isTreasure: false,
          discoveryCount: 0
        }))
      )

      // Add player to game
      const { error } = await supabase
        .from('player_boards')
        .insert({
          mock_player_id: lobbyState.playerMockId,
          is_mock_player: true,
          session_id: lobbyState.currentGame.id,
          board_state: initialBoard,
          remaining_digs: 10,
          score: 0,
          discoveries: [],
          sub_grid_hints: {}
        })

      if (error) throw error

      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        isJoining: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      console.error('Failed to join game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to join game',
        isJoining: false
      }))
    }
  }

  // Leave current lobby game
  const handleLeaveGame = async () => {
    if (!lobbyState.currentGame) return

    // Handle mock game leave
    if (lobbyState.currentGame.id === 'mock-lobby-game') {
      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        currentGame: prev.currentGame ? {
          ...prev.currentGame,
          player_count: Math.max(0, prev.currentGame.player_count - 1),
          joined_players: prev.currentGame.joined_players.filter(id => id !== prev.playerMockId)
        } : null
      }))
      return
    }

    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))

    try {
      const { error } = await supabase
        .from('player_boards')
        .delete()
        .eq('session_id', lobbyState.currentGame.id)
        .eq('mock_player_id', lobbyState.playerMockId)

      if (error) throw error

      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        isLeaving: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      console.error('Failed to leave game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to leave game',
        isLeaving: false
      }))
    }
  }

  // Check for game status changes and redirect when game starts
  const checkGameStatus = useCallback(async () => {
    if (!lobbyState.currentGame || lobbyState.currentGame.id === 'mock-lobby-game') return

    try {
      const { data: gameStatus, error } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', lobbyState.currentGame.id)
        .single()

      if (error) return // Silently fail status checks

      if (gameStatus.status === 'active' && lobbyState.hasJoined) {
        // Game has started and we're in it - redirect to game
        onGameStart(lobbyState.currentGame.id)
      } else if (gameStatus.status === 'cancelled') {
        // Game was cancelled - reload lobby
        loadLobbyGame()
      }
    } catch (error) {
      // Silently fail status checks to avoid spam
    }
  }, [lobbyState.currentGame, lobbyState.hasJoined, onGameStart, loadLobbyGame])

  // Set up polling for game updates
  useEffect(() => {
    loadLobbyGame()

    const interval = setInterval(() => {
      loadLobbyGame()
      checkGameStatus()
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [loadLobbyGame, checkGameStatus])

  // Connection status indicator
  const getConnectionIcon = () => {
    switch (lobbyState.connectionStatus) {
      case 'connected':
        return <Wifi className="w-5 h-5 text-green-500" />
      case 'partial':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />
    }
  }

  const getConnectionText = () => {
    switch (lobbyState.connectionStatus) {
      case 'connected':
        return 'Connected'
      case 'partial':
        return 'Limited Connection'
      case 'offline':
        return 'Offline Mode'
    }
  }

  if (lobbyState.isLoading) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Game Lobby...</h2>
          <p className="text-gray-600">Finding available games for you to join</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Users className="w-8 h-8 text-emerald-600" />
          <h2 className="text-3xl font-bold text-gray-800">Game Lobby</h2>
        </div>
        <p className="text-gray-600">
          Join the next scheduled game or wait for more players to join
        </p>
        
        {/* Connection Status */}
        <div className="flex items-center justify-center gap-2 text-sm">
          {getConnectionIcon()}
          <span className="text-gray-600">{getConnectionText()}</span>
          {lobbyState.connectionStatus !== 'connected' && (
            <button
              onClick={loadLobbyGame}
              className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {lobbyState.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{lobbyState.error}</p>
          </div>
        </div>
      )}

      {/* Current Game Status */}
      {lobbyState.currentGame && (
        <>
          {lobbyState.hasJoined ? (
            <JoinedGameStatus
              game={lobbyState.currentGame}
              onLeave={handleLeaveGame}
              isLeaving={lobbyState.isLeaving}
            />
          ) : (
            <LobbyGameCard
              game={lobbyState.currentGame}
              onJoin={handleJoinGame}
              isJoining={lobbyState.isJoining}
            />
          )}
        </>
      )}

      {/* Refresh Button */}
      <div className="text-center">
        <button
          onClick={loadLobbyGame}
          disabled={lobbyState.isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${lobbyState.isLoading ? 'animate-spin' : ''}`} />
          Refresh Lobby
        </button>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">How Lobby Games Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Games start automatically when 6 players join OR after 10 minutes</li>
          <li>• Minimum 2 players required, otherwise game is cancelled</li>
          <li>• All lobby games use 6x6 grid with 5 treasures and 10 dig attempts</li>
          <li>• You can leave before the game starts if you change your mind</li>
          <li>• New games are created automatically when current ones start</li>
          {lobbyState.connectionStatus === 'offline' && (
            <li className="text-yellow-700">• Currently in offline demo mode - join to see how it works!</li>
          )}
        </ul>
      </div>
    </div>
  )
}