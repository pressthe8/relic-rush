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
  connectionStatus: 'connected' | 'disconnected' | 'testing'
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
    connectionStatus: 'testing'
  })

  // Test network connectivity to Supabase
  const testConnection = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔍 Testing Supabase connectivity...')
      setLobbyState(prev => ({ ...prev, connectionStatus: 'testing' }))

      // Try a simple query with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const { error } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        console.error('❌ Connection test failed:', error)
        setLobbyState(prev => ({ ...prev, connectionStatus: 'disconnected' }))
        return false
      }

      console.log('✅ Connection test successful')
      setLobbyState(prev => ({ ...prev, connectionStatus: 'connected' }))
      return true
    } catch (error) {
      console.error('❌ Connection test error:', error)
      setLobbyState(prev => ({ ...prev, connectionStatus: 'disconnected' }))
      return false
    }
  }, [])

  // Create a mock lobby game for offline mode
  const createMockLobbyGame = useCallback((): LobbyGame => {
    const mockGame: LobbyGame = {
      id: 'mock-lobby-game',
      game_code: 'DEMO01',
      scheduled_start_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
      max_players: 6,
      status: 'scheduled',
      player_count: 0,
      joined_players: []
    }
    console.log('🎮 Created mock lobby game for offline mode:', mockGame)
    return mockGame
  }, [])

  // Load current lobby game with fallback
  const loadLobbyGame = useCallback(async () => {
    try {
      setLobbyState(prev => ({ ...prev, isLoading: true, error: null }))

      // Test connection first
      const isConnected = await testConnection()
      
      if (!isConnected) {
        console.log('🔄 No connection to Supabase, using mock lobby game')
        const mockGame = createMockLobbyGame()
        setLobbyState(prev => ({
          ...prev,
          currentGame: mockGame,
          hasJoined: false,
          isLoading: false,
          error: 'Running in offline mode - Supabase connection unavailable'
        }))
        return
      }

      // Get current scheduled lobby game
      console.log('🔍 Fetching scheduled lobby games...')
      const { data: lobbyGame, error: gameError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (gameError) {
        console.error('❌ Error fetching lobby game:', gameError)
        throw gameError
      }

      console.log('🔍 Lobby game query result:', lobbyGame)

      if (!lobbyGame) {
        // No lobby game exists, trigger creation
        console.log('🔍 No lobby game found, calling ensure_lobby_game_available...')
        const { data: createResult, error: createError } = await supabase.rpc('ensure_lobby_game_available')
        
        console.log('🔍 Create function result:', createResult)
        if (createError) {
          console.error('❌ Error creating lobby game:', createError)
          throw createError
        }
        
        // Retry loading after creation
        console.log('🔍 Retrying load after creation...')
        setTimeout(loadLobbyGame, 1000)
        return
      }

      // Get players in this game
      console.log('🔍 Fetching players for game:', lobbyGame.id)
      const { data: players, error: playersError } = await supabase
        .from('player_boards')
        .select('mock_player_id')
        .eq('session_id', lobbyGame.id)

      if (playersError) {
        console.error('❌ Error fetching players:', playersError)
        throw playersError
      }

      console.log('🔍 Players in game:', players)

      const joinedPlayers = players?.map(p => p.mock_player_id) || []
      const hasJoined = joinedPlayers.includes(lobbyState.playerMockId)

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
        isLoading: false
      }))

    } catch (error) {
      console.error('❌ Failed to load lobby game:', error)
      
      // Fallback to mock game on any error
      console.log('🔄 Falling back to mock lobby game due to error')
      const mockGame = createMockLobbyGame()
      
      setLobbyState(prev => ({
        ...prev,
        currentGame: mockGame,
        hasJoined: false,
        isLoading: false,
        error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}. Running in demo mode.`
      }))
    }
  }, [lobbyState.playerMockId, testConnection, createMockLobbyGame])

  // Join current lobby game
  const handleJoinGame = async () => {
    if (!lobbyState.currentGame) return

    setLobbyState(prev => ({ ...prev, isJoining: true, error: null }))

    try {
      // Check if we're in offline mode
      if (lobbyState.connectionStatus === 'disconnected' || lobbyState.currentGame.id === 'mock-lobby-game') {
        console.log('🎮 Joining mock lobby game (offline mode)')
        
        // Simulate joining in offline mode
        setLobbyState(prev => ({
          ...prev,
          hasJoined: true,
          isJoining: false,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            player_count: prev.currentGame.player_count + 1,
            joined_players: [...prev.currentGame.joined_players, prev.playerMockId]
          } : null
        }))
        return
      }

      // Create initial board state for 6x6 grid
      const initialBoard = Array(6).fill(null).map(() =>
        Array(6).fill(null).map(() => ({
          isRevealed: false,
          isTreasure: false,
          discoveryCount: 0
        }))
      )

      // Place treasures based on game session
      const treasurePositions = lobbyState.currentGame.treasure_positions || []
      treasurePositions.forEach((pos: any) => {
        if (initialBoard[pos.row] && initialBoard[pos.row][pos.col]) {
          initialBoard[pos.row][pos.col].isTreasure = true
        }
      })

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

    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))

    try {
      // Check if we're in offline mode
      if (lobbyState.connectionStatus === 'disconnected' || lobbyState.currentGame.id === 'mock-lobby-game') {
        console.log('🎮 Leaving mock lobby game (offline mode)')
        
        // Simulate leaving in offline mode
        setLobbyState(prev => ({
          ...prev,
          hasJoined: false,
          isLeaving: false,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            player_count: Math.max(0, prev.currentGame.player_count - 1),
            joined_players: prev.currentGame.joined_players.filter(id => id !== prev.playerMockId)
          } : null
        }))
        return
      }

      const { error } = await supabase.rpc('leave_lobby_game', {
        p_session_id: lobbyState.currentGame.id,
        p_mock_player_id: lobbyState.playerMockId
      })

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
    if (!lobbyState.currentGame || lobbyState.connectionStatus === 'disconnected') return

    try {
      const { data: gameStatus, error } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', lobbyState.currentGame.id)
        .single()

      if (error) throw error

      if (gameStatus.status === 'active' && lobbyState.hasJoined) {
        // Game has started and we're in it - redirect to game
        onGameStart(lobbyState.currentGame.id)
      } else if (gameStatus.status === 'cancelled') {
        // Game was cancelled - reload lobby
        loadLobbyGame()
      }
    } catch (error) {
      console.error('Failed to check game status:', error)
    }
  }, [lobbyState.currentGame, lobbyState.hasJoined, lobbyState.connectionStatus, onGameStart, loadLobbyGame])

  // Set up polling for game updates
  useEffect(() => {
    loadLobbyGame()

    const interval = setInterval(() => {
      if (lobbyState.connectionStatus === 'connected') {
        loadLobbyGame()
        checkGameStatus()
      }
    }, 2000) // Poll every 2 seconds only when connected

    return () => clearInterval(interval)
  }, [loadLobbyGame, checkGameStatus, lobbyState.connectionStatus])

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
          {lobbyState.connectionStatus === 'connected' && <Wifi className="w-6 h-6 text-green-600" />}
          {lobbyState.connectionStatus === 'disconnected' && <WifiOff className="w-6 h-6 text-red-600" />}
          {lobbyState.connectionStatus === 'testing' && <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />}
        </div>
        <p className="text-gray-600">
          {lobbyState.connectionStatus === 'connected' 
            ? 'Join the next scheduled game or wait for more players to join'
            : 'Running in demo mode - try the lobby system offline'
          }
        </p>
      </div>

      {/* Connection Status */}
      {lobbyState.connectionStatus === 'disconnected' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Demo Mode</h3>
          </div>
          <p className="text-amber-700 text-sm">
            Unable to connect to Supabase. You can still explore the lobby interface in demo mode.
          </p>
          <button
            onClick={testConnection}
            className="mt-2 px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

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
          {lobbyState.connectionStatus === 'disconnected' && (
            <li className="text-amber-700">• Currently in demo mode - full functionality requires Supabase connection</li>
          )}
        </ul>
      </div>
    </div>
  )
}