import React, { useState, useEffect, useCallback } from 'react'
import { supabase, testSupabaseConnection, resetConnectionState } from '../lib/supabase'
import { LobbyGameCard } from './LobbyGameCard'
import { CountdownTimer } from './CountdownTimer'

interface LobbyGame {
  id: string
  game_code: string
  scheduled_start_time: string
  max_players: number
  status: string
  player_count: number
  joined_players: string[]
}

interface GameLobbyProps {
  onJoinGame: (gameCode: string) => void
  onCreateGame: () => void
}

export const GameLobby: React.FC<GameLobbyProps> = ({ onJoinGame, onCreateGame }) => {
  const [lobbyGame, setLobbyGame] = useState<LobbyGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Create mock lobby game for offline mode
  const createMockLobbyGame = useCallback((): LobbyGame => {
    const mockGame = {
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

  // Load lobby game data
  const loadLobbyGame = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Test connection first
      const isConnected = await testSupabaseConnection()
      setIsOnline(isConnected)

      if (!isConnected) {
        console.log('🔄 No connection to Supabase, using mock lobby game')
        setLobbyGame(createMockLobbyGame())
        return
      }

      console.log('🔍 Fetching scheduled lobby games...')
      
      // Fetch the most recent scheduled lobby game
      const { data: gameData, error: gameError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)

      if (gameError) {
        console.error('❌ Error fetching lobby game:', gameError)
        throw gameError
      }

      if (!gameData || gameData.length === 0) {
        console.log('📭 No scheduled lobby games found')
        setLobbyGame(createMockLobbyGame())
        return
      }

      const game = gameData[0]
      console.log('🔍 Players in game:', game.id)

      // Fetch players for this game
      const { data: playersData, error: playersError } = await supabase
        .from('player_boards')
        .select('mock_player_id')
        .eq('session_id', game.id)

      if (playersError) {
        console.error('❌ Error fetching players:', playersError)
        throw playersError
      }

      const joinedPlayers = playersData?.map(p => p.mock_player_id).filter(Boolean) || []
      console.log('🔍 Players in game:', joinedPlayers)

      const lobbyGameData: LobbyGame = {
        id: game.id,
        game_code: game.game_code || 'UNKNOWN',
        scheduled_start_time: game.scheduled_start_time || new Date().toISOString(),
        max_players: game.max_players || 6,
        status: game.status,
        player_count: joinedPlayers.length,
        joined_players: joinedPlayers
      }

      console.log('✅ Successfully loaded lobby game:', lobbyGameData)
      setLobbyGame(lobbyGameData)

    } catch (error: any) {
      console.error('❌ Failed to load lobby game:', error)
      setError(error.message || 'Failed to load lobby game')
      
      // Fall back to mock game on error
      console.log('🔄 Falling back to mock lobby game due to error')
      setLobbyGame(createMockLobbyGame())
      setIsOnline(false)
    } finally {
      setLoading(false)
    }
  }, [createMockLobbyGame])

  // Handle retry with exponential backoff
  const handleRetry = useCallback(() => {
    resetConnectionState()
    setRetryCount(prev => prev + 1)
    loadLobbyGame()
  }, [loadLobbyGame])

  // Initial load
  useEffect(() => {
    loadLobbyGame()
  }, [loadLobbyGame])

  // Auto-refresh every 30 seconds if online
  useEffect(() => {
    if (!isOnline) return

    const interval = setInterval(() => {
      loadLobbyGame()
    }, 30000)

    return () => clearInterval(interval)
  }, [isOnline, loadLobbyGame])

  const handleJoinLobbyGame = () => {
    if (lobbyGame) {
      onJoinGame(lobbyGame.game_code)
    }
  }

  if (loading && !lobbyGame) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading lobby game...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            🏴‍☠️ Treasure Hunt Lobby
          </h1>
          <p className="text-xl text-blue-200 mb-4">
            Join the next scheduled game or create your own adventure!
          </p>
          
          {/* Connection Status */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm text-gray-300">
              {isOnline ? 'Connected to server' : 'Offline mode'}
            </span>
            {!isOnline && (
              <button
                onClick={handleRetry}
                className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && isOnline && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-center">{error}</p>
            <button
              onClick={handleRetry}
              className="mt-2 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Lobby Game Card */}
        {lobbyGame && (
          <div className="mb-8">
            <LobbyGameCard
              game={lobbyGame}
              onJoin={handleJoinLobbyGame}
              isOnline={isOnline}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <button
            onClick={onCreateGame}
            className="group relative overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <div className="text-lg">Create Private Game</div>
                <div className="text-sm opacity-90">Start immediately</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              const code = prompt('Enter game code:')
              if (code) onJoinGame(code.toUpperCase())
            }}
            className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-3">
              <span className="text-2xl">🔑</span>
              <div>
                <div className="text-lg">Join Private Game</div>
                <div className="text-sm opacity-90">Enter game code</div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-blue-200">
          <p className="text-sm">
            {isOnline ? 'Connected to live games' : 'Playing in offline mode'}
          </p>
          {retryCount > 0 && (
            <p className="text-xs mt-1 opacity-75">
              Connection attempts: {retryCount}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}