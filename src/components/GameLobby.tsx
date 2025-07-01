import React, { useState, useEffect, useCallback } from 'react'
import { supabase, generateMockPlayerId } from '../lib/supabase'
import { LobbyGameCard } from './LobbyGameCard'
import { JoinedGameStatus } from './JoinedGameStatus'
import { Users, AlertCircle, RefreshCw } from 'lucide-react'

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
      setLobbyState(prev => ({ ...prev, isLoading: true, error: null }))

      // Get current scheduled lobby game
      const { data: lobbyGame, error: gameError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (gameError) {
        throw new Error(`Failed to query lobby games: ${gameError.message}`)
      }

      // If no game exists, ensure one is created
      if (!lobbyGame) {
        const { error: availabilityError } = await supabase
          .rpc('ensure_lobby_game_available')

        if (availabilityError) {
          throw new Error(`Failed to ensure lobby availability: ${availabilityError.message}`)
        }

        // Query again after ensuring availability
        const { data: newLobbyGame, error: newGameError } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('is_lobby_game', true)
          .eq('status', 'scheduled')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (newGameError || !newLobbyGame) {
          throw new Error('Failed to create or find lobby game')
        }

        return await processLobbyGame(newLobbyGame)
      }

      return await processLobbyGame(lobbyGame)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load lobby game'
      console.error('Failed to load lobby game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
    }
  }, [])

  // Process a lobby game (get players, check join status, etc.)
  const processLobbyGame = useCallback(async (lobbyGame: any) => {
    try {
      // Get players in this game
      const { data: players, error: playersError } = await supabase
        .from('player_boards')
        .select('mock_player_id')
        .eq('session_id', lobbyGame.id)

      if (playersError) {
        throw new Error(`Failed to get players: ${playersError.message}`)
      }

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

      setLobbyState(prev => ({
        ...prev,
        currentGame,
        hasJoined,
        isLoading: false,
        error: null
      }))

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process lobby game'
      throw new Error(errorMessage)
    }
  }, [lobbyState.playerMockId])

  // Join current lobby game
  const handleJoinGame = useCallback(async () => {
    if (!lobbyState.currentGame) return

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
        throw error
      }

      setLobbyState(prev => ({
        ...prev,
        hasJoined: true,
        isJoining: false
      }))

      // Refresh to show updated state
      await loadLobbyGame()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to join game'
      console.error('Failed to join game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isJoining: false
      }))
    }
  }, [lobbyState.currentGame, lobbyState.playerMockId, loadLobbyGame])

  // Leave current lobby game
  const handleLeaveGame = useCallback(async () => {
    if (!lobbyState.currentGame) return

    setLobbyState(prev => ({ ...prev, isLeaving: true, error: null }))

    try {
      const { error } = await supabase.rpc('leave_lobby_game', {
        p_session_id: lobbyState.currentGame.id,
        p_mock_player_id: lobbyState.playerMockId
      })

      if (error) {
        throw error
      }

      setLobbyState(prev => ({
        ...prev,
        hasJoined: false,
        isLeaving: false
      }))

      // Refresh to show updated state
      await loadLobbyGame()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to leave game'
      console.error('Failed to leave game:', error)
      setLobbyState(prev => ({
        ...prev,
        error: errorMessage,
        isLeaving: false
      }))
    }
  }, [lobbyState.currentGame, lobbyState.playerMockId, loadLobbyGame])

  // Check if game has started (manual only)
  const checkGameStatus = useCallback(async () => {
    if (!lobbyState.currentGame) return

    try {
      const { data: gameStatus, error } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', lobbyState.currentGame.id)
        .single()

      if (error) {
        console.error('Game status check failed:', error)
        return
      }

      if (gameStatus.status === 'active' && lobbyState.hasJoined) {
        console.log('Game started, redirecting...')
        onGameStart(lobbyState.currentGame.id)
      } else if (gameStatus.status === 'cancelled') {
        console.log('Game was cancelled, reloading lobby...')
        setLobbyState(prev => ({ ...prev, hasJoined: false }))
        await loadLobbyGame()
      }
    } catch (error) {
      console.error('Game status check error:', error)
    }
  }, [lobbyState.currentGame, lobbyState.hasJoined, onGameStart, loadLobbyGame])

  // Manual refresh function
  const handleRefresh = useCallback(async () => {
    await loadLobbyGame()
    await checkGameStatus()
  }, [loadLobbyGame, checkGameStatus])

  // Only load once on mount - NO POLLING
  useEffect(() => {
    loadLobbyGame()
  }, []) // Only run once on mount

  // Show loading state
  if (lobbyState.isLoading && !lobbyState.currentGame) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
          <button
            onClick={handleRefresh}
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

      {/* Manual Refresh Button */}
      <div className="text-center">
        <button
          onClick={handleRefresh}
          disabled={lobbyState.isLoading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${lobbyState.isLoading ? 'animate-spin' : ''}`} />
          Refresh Lobby
        </button>
        <p className="text-sm text-gray-500 mt-2">
          Click to check for updates or see if the game has started
        </p>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">How Lobby Games Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Games start automatically when 6 players join OR after 10 minutes</li>
          <li>• Minimum 2 players required, otherwise game is cancelled and new one created</li>
          <li>• All lobby games use 6x6 grid with 5 treasures and 10 dig attempts</li>
          <li>• You can leave before the game starts if you change your mind</li>
          <li>• <strong>Click "Refresh Lobby" to check for updates</strong></li>
        </ul>
      </div>
    </div>
  )
}