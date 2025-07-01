import React, { useState, useEffect, useCallback } from 'react'
import { supabase, generateMockPlayerId } from '../lib/supabase'
import { LobbyGameCard } from './LobbyGameCard'
import { JoinedGameStatus } from './JoinedGameStatus'
import { Users, RefreshCw, AlertCircle, Database, Bug } from 'lucide-react'

interface LobbyGame {
  id: string
  game_code: string
  scheduled_start_time: string
  max_players: number
  status: 'scheduled'
  player_count: number
  joined_players: string[]
  treasure_positions?: any[]
}

interface LobbyState {
  currentGame: LobbyGame | null
  hasJoined: boolean
  isJoining: boolean
  isLeaving: boolean
  isLoading: boolean
  error: string | null
  playerMockId: string
  debugInfo: any[]
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
    debugInfo: []
  })

  const addDebugInfo = (info: string, data?: any) => {
    console.log(`🎮 GameLobby: ${info}`, data)
    setLobbyState(prev => ({
      ...prev,
      debugInfo: [...prev.debugInfo.slice(-4), { time: new Date().toLocaleTimeString(), info, data }]
    }))
  }

  // Load current lobby game with comprehensive error handling
  const loadLobbyGame = useCallback(async () => {
    try {
      addDebugInfo('Starting loadLobbyGame...')
      setLobbyState(prev => ({ ...prev, isLoading: true, error: null }))

      // Step 1: Test basic connection first
      addDebugInfo('Testing basic Supabase connection...')
      const { data: connectionTest, error: connectionError } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)

      if (connectionError) {
        addDebugInfo('Connection test failed', connectionError)
        throw new Error(`Database connection failed: ${connectionError.message}`)
      }

      addDebugInfo('Connection test passed', { count: connectionTest?.length })

      // Step 2: Try to get current scheduled lobby game
      addDebugInfo('Querying for scheduled lobby games...')
      const { data: lobbyGame, error: gameError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (gameError) {
        addDebugInfo('Lobby game query failed', gameError)
        throw new Error(`Failed to query lobby games: ${gameError.message}`)
      }

      addDebugInfo('Lobby game query result', { found: !!lobbyGame, game: lobbyGame })

      // Step 3: If no lobby game exists, try to create one
      if (!lobbyGame) {
        addDebugInfo('No lobby game found, attempting to create one...')
        
        try {
          const { data: createResult, error: createError } = await supabase.rpc('ensure_lobby_game_available')
          
          if (createError) {
            addDebugInfo('Failed to create lobby game', createError)
            throw new Error(`Failed to create lobby game: ${createError.message}`)
          }
          
          addDebugInfo('Lobby game creation result', createResult)
          
          // Retry loading after creation with a delay
          setTimeout(() => {
            addDebugInfo('Retrying load after game creation...')
            loadLobbyGame()
          }, 2000)
          return
        } catch (createErr) {
          addDebugInfo('Exception during game creation', createErr)
          throw new Error(`Could not create lobby game: ${createErr instanceof Error ? createErr.message : 'Unknown error'}`)
        }
      }

      // Step 4: Get players in this game
      addDebugInfo('Getting players for lobby game...', { gameId: lobbyGame.id })
      const { data: players, error: playersError } = await supabase
        .from('player_boards')
        .select('mock_player_id')
        .eq('session_id', lobbyGame.id)

      if (playersError) {
        addDebugInfo('Failed to get players', playersError)
        throw new Error(`Failed to get players: ${playersError.message}`)
      }

      addDebugInfo('Players query result', { players })

      const joinedPlayers = players?.map(p => p.mock_player_id) || []
      const hasJoined = joinedPlayers.includes(lobbyState.playerMockId)

      const currentGame: LobbyGame = {
        id: lobbyGame.id,
        game_code: lobbyGame.game_code,
        scheduled_start_time: lobbyGame.scheduled_start_time,
        max_players: lobbyGame.max_players,
        status: lobbyGame.status,
        player_count: joinedPlayers.length,
        joined_players: joinedPlayers,
        treasure_positions: lobbyGame.treasure_positions
      }

      addDebugInfo('Successfully loaded lobby game', { currentGame, hasJoined })

      setLobbyState(prev => ({
        ...prev,
        currentGame,
        hasJoined,
        isLoading: false,
        error: null
      }))

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load lobby game'
      addDebugInfo('loadLobbyGame failed with error', { error, errorMessage })
      
      console.error('Failed to load lobby game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
    }
  }, [lobbyState.playerMockId])

  // Join current lobby game
  const handleJoinGame = async () => {
    if (!lobbyState.currentGame) return

    setLobbyState(prev => ({ ...prev, isJoining: true, error: null }))
    addDebugInfo('Attempting to join game...', { gameId: lobbyState.currentGame?.id })

    try {
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

      addDebugInfo('Created initial board state', { boardSize: initialBoard.length, treasureCount: treasurePositions.length })

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

      if (error) {
        addDebugInfo('Failed to join game', error)
        throw error
      }

      addDebugInfo('Successfully joined game')

      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        isJoining: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to join game'
      addDebugInfo('Join game failed', { error, errorMessage })
      
      console.error('Failed to join game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isJoining: false
      }))
    }
  }

  // Leave current lobby game
  const handleLeaveGame = async () => {
    if (!lobbyState.currentGame) return

    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))
    addDebugInfo('Attempting to leave game...', { gameId: lobbyState.currentGame?.id })

    try {
      const { error } = await supabase.rpc('leave_lobby_game', {
        p_session_id: lobbyState.currentGame.id,
        p_mock_player_id: lobbyState.playerMockId
      })

      if (error) {
        addDebugInfo('Failed to leave game', error)
        throw error
      }

      addDebugInfo('Successfully left game')

      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        isLeaving: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to leave game'
      addDebugInfo('Leave game failed', { error, errorMessage })
      
      console.error('Failed to leave game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isLeaving: false
      }))
    }
  }

  // Check for game status changes and redirect when game starts
  const checkGameStatus = useCallback(async () => {
    if (!lobbyState.currentGame) return

    try {
      const { data: gameStatus, error } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', lobbyState.currentGame.id)
        .single()

      if (error) {
        addDebugInfo('Game status check failed', error)
        throw error
      }

      addDebugInfo('Game status check result', gameStatus)

      if (gameStatus.status === 'active' && lobbyState.hasJoined) {
        addDebugInfo('Game started, redirecting...', { gameId: lobbyState.currentGame.id })
        onGameStart(lobbyState.currentGame.id)
      } else if (gameStatus.status === 'cancelled') {
        addDebugInfo('Game was cancelled, reloading lobby...')
        loadLobbyGame()
      }
    } catch (error) {
      addDebugInfo('Game status check error', error)
      console.error('Failed to check game status:', error)
    }
  }, [lobbyState.currentGame, lobbyState.hasJoined, onGameStart, loadLobbyGame])

  // Set up polling for game updates with error handling
  useEffect(() => {
    addDebugInfo('Setting up polling and initial load...')
    
    // Initial load
    loadLobbyGame()

    // Set up polling interval
    const interval = setInterval(() => {
      if (!lobbyState.isLoading) {
        loadLobbyGame()
        checkGameStatus()
      }
    }, 3000) // Poll every 3 seconds (less aggressive)

    return () => {
      addDebugInfo('Cleaning up polling interval')
      clearInterval(interval)
    }
  }, []) // Only run once on mount

  // Separate effect for status checking
  useEffect(() => {
    if (lobbyState.currentGame && !lobbyState.isLoading) {
      const statusInterval = setInterval(checkGameStatus, 2000)
      return () => clearInterval(statusInterval)
    }
  }, [lobbyState.currentGame, lobbyState.isLoading, checkGameStatus])

  // Show loading state with debug info
  if (lobbyState.isLoading && !lobbyState.currentGame) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Game Lobby...</h2>
          <p className="text-gray-600">Finding available games for you to join</p>
        </div>

        {/* Debug Information */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Bug className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-blue-800">Debug Information</h3>
          </div>
          <div className="space-y-1 text-xs text-blue-700">
            {lobbyState.debugInfo.slice(-5).map((debug, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-blue-500">{debug.time}</span>
                <span>{debug.info}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Manual retry button */}
        <div className="text-center">
          <button
            onClick={loadLobbyGame}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Loading
          </button>
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
      </div>

      {/* Error Display */}
      {lobbyState.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{lobbyState.error}</p>
          </div>
          <button
            onClick={loadLobbyGame}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
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

      {/* Debug Panel (only show if there are errors or debug info) */}
      {(lobbyState.debugInfo.length > 0 || lobbyState.error) && (
        <details className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2">
            <Database className="w-4 h-4" />
            Debug Information ({lobbyState.debugInfo.length} events)
          </summary>
          <div className="mt-2 space-y-1 text-xs text-gray-600 max-h-40 overflow-y-auto">
            {lobbyState.debugInfo.map((debug, index) => (
              <div key={index} className="flex gap-2 border-b border-gray-200 pb-1">
                <span className="text-gray-400 w-16">{debug.time}</span>
                <span className="flex-1">{debug.info}</span>
                {debug.data && (
                  <span className="text-gray-500 text-xs">
                    {typeof debug.data === 'object' ? JSON.stringify(debug.data).substring(0, 50) + '...' : debug.data}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">How Lobby Games Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Games start automatically when 6 players join OR after 10 minutes</li>
          <li>• Minimum 2 players required, otherwise game is cancelled</li>
          <li>• All lobby games use 6x6 grid with 5 treasures and 10 dig attempts</li>
          <li>• You can leave before the game starts if you change your mind</li>
          <li>• New games are created automatically when current ones start</li>
        </ul>
      </div>
    </div>
  )
}