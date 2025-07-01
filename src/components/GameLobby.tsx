import React, { useState, useEffect, useCallback } from 'react'
import { supabase, generateMockPlayerId } from '../lib/supabase'
import { LobbyGameCard } from './LobbyGameCard'
import { JoinedGameStatus } from './JoinedGameStatus'
import { Users, RefreshCw, AlertCircle } from 'lucide-react'

interface LobbyGame {
  id: string
  game_code: string
  scheduled_start_time: string
  max_players: number
  status: 'scheduled'
  player_count: number
  joined_players: string[]
  treasure_positions: any[] // Add this to match the interface
}

interface LobbyState {
  currentGame: LobbyGame | null
  hasJoined: boolean
  isJoining: boolean
  isLeaving: boolean
  isLoading: boolean
  error: string | null
  playerMockId: string
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
    playerMockId: generateMockPlayerId()
  })

  // Load current lobby game
  const loadLobbyGame = useCallback(async () => {
    try {
      console.log('🔍 Loading lobby game...')
      setLobbyState(prev => ({ ...prev, isLoading: true, error: null }))

      // Get current scheduled lobby game - include treasure_positions
      console.log('📡 Querying for scheduled lobby games...')
      const { data: lobbyGame, error: gameError } = await supabase
        .from('game_sessions')
        .select('id, game_code, scheduled_start_time, max_players, status, treasure_positions')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      console.log('📊 Query result:', { lobbyGame, gameError })

      if (gameError) {
        console.error('❌ Database error:', gameError)
        throw gameError
      }

      if (!lobbyGame) {
        console.log('🚫 No lobby game found, creating one...')
        // No lobby game exists, trigger creation
        const { data: createResult, error: createError } = await supabase.rpc('ensure_lobby_game_available')
        console.log('🎮 Create result:', { createResult, createError })
        
        if (createError) {
          console.error('❌ Failed to create lobby game:', createError)
          throw createError
        }
        
        // Retry loading after creation
        console.log('🔄 Retrying load after creation...')
        setTimeout(loadLobbyGame, 2000)
        return
      }

      console.log('✅ Found lobby game:', lobbyGame)

      // Get players in this game
      console.log('👥 Loading players for session:', lobbyGame.id)
      const { data: players, error: playersError } = await supabase
        .from('player_boards')
        .select('mock_player_id')
        .eq('session_id', lobbyGame.id)

      console.log('👥 Players result:', { players, playersError })

      if (playersError) {
        console.error('❌ Players query error:', playersError)
        throw playersError
      }

      const joinedPlayers = players?.map(p => p.mock_player_id) || []
      const hasJoined = joinedPlayers.includes(lobbyState.playerMockId)

      console.log('🎯 Player status:', {
        playerMockId: lobbyState.playerMockId,
        joinedPlayers,
        hasJoined
      })

      const currentGame: LobbyGame = {
        id: lobbyGame.id,
        game_code: lobbyGame.game_code,
        scheduled_start_time: lobbyGame.scheduled_start_time,
        max_players: lobbyGame.max_players,
        status: lobbyGame.status,
        player_count: joinedPlayers.length,
        joined_players: joinedPlayers,
        treasure_positions: lobbyGame.treasure_positions || [] // Include treasure positions
      }

      console.log('🎮 Final lobby state:', currentGame)

      setLobbyState(prev => ({
        ...prev,
        currentGame,
        hasJoined,
        isLoading: false
      }))

    } catch (error) {
      console.error('💥 Failed to load lobby game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load lobby game',
        isLoading: false
      }))
    }
  }, [lobbyState.playerMockId])

  // Join current lobby game
  const handleJoinGame = async () => {
    if (!lobbyState.currentGame) return

    console.log('🚀 Joining game:', lobbyState.currentGame.id)
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

      // Place treasures based on game session
      const treasurePositions = lobbyState.currentGame.treasure_positions || []
      treasurePositions.forEach((pos: any) => {
        if (initialBoard[pos.row] && initialBoard[pos.row][pos.col]) {
          initialBoard[pos.row][pos.col].isTreasure = true
        }
      })

      console.log('🎯 Creating player board with initial state')

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
        console.error('❌ Failed to join game:', error)
        throw error
      }

      console.log('✅ Successfully joined game')

      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        isJoining: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      console.error('💥 Failed to join game:', error)
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

    console.log('👋 Leaving game:', lobbyState.currentGame.id)
    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))

    try {
      const { error } = await supabase.rpc('leave_lobby_game', {
        p_session_id: lobbyState.currentGame.id,
        p_mock_player_id: lobbyState.playerMockId
      })

      if (error) {
        console.error('❌ Failed to leave game:', error)
        throw error
      }

      console.log('✅ Successfully left game')

      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        isLeaving: false
      }))

      // Reload to get updated player count
      setTimeout(loadLobbyGame, 500)

    } catch (error) {
      console.error('💥 Failed to leave game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to leave game',
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

      if (error) throw error

      if (gameStatus.status === 'active' && lobbyState.hasJoined) {
        // Game has started and we're in it - redirect to game
        console.log('🎮 Game started! Redirecting...')
        onGameStart(lobbyState.currentGame.id)
      } else if (gameStatus.status === 'cancelled') {
        // Game was cancelled - reload lobby
        console.log('❌ Game was cancelled, reloading lobby...')
        loadLobbyGame()
      }
    } catch (error) {
      console.error('💥 Failed to check game status:', error)
    }
  }, [lobbyState.currentGame, lobbyState.hasJoined, onGameStart, loadLobbyGame])

  // Set up polling for game updates
  useEffect(() => {
    console.log('🔄 Setting up lobby polling...')
    loadLobbyGame()

    const interval = setInterval(() => {
      loadLobbyGame()
      checkGameStatus()
    }, 3000) // Poll every 3 seconds

    return () => {
      console.log('🛑 Cleaning up lobby polling...')
      clearInterval(interval)
    }
  }, [loadLobbyGame, checkGameStatus])

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

      {/* Debug Info */}
      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <strong>Debug:</strong> Player ID: {lobbyState.playerMockId} | 
        Has Game: {lobbyState.currentGame ? 'Yes' : 'No'} | 
        Has Joined: {lobbyState.hasJoined ? 'Yes' : 'No'}
      </div>

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
        </ul>
      </div>
    </div>
  )
}