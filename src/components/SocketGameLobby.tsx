import React from 'react'
import { useSocketLobby } from '../hooks/useSocketLobby'
import { CountdownTimer } from './CountdownTimer'
import { Users, RefreshCw, AlertCircle, Wifi, Grid3x3, Trophy, Clock, User } from 'lucide-react'

interface SocketGameLobbyProps {
  onGameStart: (sessionId: string) => void
  autoJoin?: boolean
}

export const SocketGameLobby: React.FC<SocketGameLobbyProps> = ({ onGameStart, autoJoin = false }) => {
  const {
    currentGame,
    playerCount,
    hasJoined,
    isConnected,
    isJoining,
    isLeaving,
    error,
    playerMockId,
    joinGame,
    leaveGame
  } = useSocketLobby(onGameStart)

  // Track if auto-join has been performed to prevent re-joining after explicit leave
  const hasAutoJoined = React.useRef(false)

  React.useEffect(() => {
    if (currentGame && !hasJoined && !isJoining && autoJoin && !hasAutoJoined.current) {
      hasAutoJoined.current = true
      joinGame();
    }
  }, [currentGame, hasJoined, isJoining, joinGame, autoJoin]);

  // Connection status indicator
  const ConnectionStatus = () => (
    <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-600' : 'text-amber-600'}`}>
      {isConnected ? <Wifi className="w-4 h-4" /> : <RefreshCw className="w-4 h-4 animate-spin" />}
      {isConnected ? 'Connected' : 'Connecting...'}
    </div>
  )

  // Format player ID for display
  const formatPlayerId = (id: string) => {
    return id.replace('mock_player_', 'Player ')
  }

  if (!isConnected) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Connecting to Lobby...</h2>
          <p className="text-gray-600">Establishing real-time connection</p>
        </div>
      </div>
    )
  }

  if (!currentGame) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Game Lobby...</h2>
          <p className="text-gray-600">Setting up the next game</p>
        </div>
      </div>
    )
  }

  const playersNeeded = currentGame.maxPlayers - playerCount
  const isFull = playerCount >= currentGame.maxPlayers

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
        <div className="flex items-center justify-center gap-4">
          <ConnectionStatus />
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <User className="w-4 h-4" />
            <span className="font-mono">{formatPlayerId(playerMockId)}</span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Game Card */}
      {hasJoined ? (
        // Joined Status
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6">
          <div className="text-center space-y-4 mb-6">
            <div className="flex items-center justify-center gap-3">
              <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-emerald-800">You're In!</h3>
            </div>
            <p className="text-emerald-700">
              Successfully joined game <span className="font-mono font-bold">{currentGame.gameCode}</span>
            </p>
            <p className="text-sm text-emerald-600">
              Playing as <span className="font-mono font-semibold">{formatPlayerId(playerMockId)}</span>
            </p>
          </div>

          {/* Countdown Timer */}
          <div className="text-center mb-6">
            <CountdownTimer
              targetTime={currentGame.scheduledStartTime}
              onComplete={() => console.log('Countdown finished, waiting for game start...')}
              variant="success"
            />
          </div>

          {/* Game Status */}
          <div className="bg-white rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-800">Game Status</span>
              <Users className="w-5 h-5 text-emerald-600" />
            </div>

            {isFull ? (
              <div className="space-y-2">
                <p className="text-emerald-700 font-medium">🎉 Game is full! Starting soon...</p>
                <p className="text-sm text-emerald-600">
                  All {currentGame.maxPlayers} players have joined. The game will begin shortly!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-700">
                  Waiting for <strong className="text-emerald-700">{playersNeeded} more player{playersNeeded !== 1 ? 's' : ''}</strong> to join
                </p>
                <p className="text-sm text-gray-600">
                  Game will start when full or when the countdown reaches zero
                </p>
              </div>
            )}

            {/* Player Count Visual */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Players Joined</span>
                <span>{playerCount}/{currentGame.maxPlayers}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(playerCount / currentGame.maxPlayers) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Leave Button */}
          <div className="text-center">
            <button
              onClick={leaveGame}
              disabled={isLeaving}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLeaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Leaving...
                </>
              ) : (
                'Leave Game'
              )}
            </button>
          </div>
        </div>
      ) : (
        // Available Game Card
        <div className="bg-white rounded-xl shadow-lg border border-emerald-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-amber-600 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Next Scheduled Game</h3>
                <p className="text-emerald-100">Game Code: <span className="font-mono font-bold">{currentGame.gameCode}</span></p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{playerCount}/{currentGame.maxPlayers}</div>
                <div className="text-emerald-100 text-sm">Players</div>
              </div>
            </div>
          </div>

          {/* Game Info */}
          <div className="p-6 space-y-4">
            {/* Countdown Timer */}
            <div className="text-center">
              <CountdownTimer
                targetTime={currentGame.scheduledStartTime}
                onComplete={() => console.log('Countdown finished, waiting for game start...')}
              />
            </div>

            {/* Game Details */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <Grid3x3 className="w-6 h-6 text-emerald-600 mx-auto" />
                <div className="text-sm font-medium text-gray-800">6x6 Grid</div>
                <div className="text-xs text-gray-600">Standard Size</div>
              </div>
              <div className="space-y-1">
                <Trophy className="w-6 h-6 text-amber-600 mx-auto" />
                <div className="text-sm font-medium text-gray-800">5 Treasures</div>
                <div className="text-xs text-gray-600">To Discover</div>
              </div>
              <div className="space-y-1">
                <Clock className="w-6 h-6 text-blue-600 mx-auto" />
                <div className="text-sm font-medium text-gray-800">10 Digs</div>
                <div className="text-xs text-gray-600">Starting Attempts</div>
              </div>
            </div>

            {/* Player Status */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">Player Status</span>
                <Users className="w-5 h-5 text-gray-600" />
              </div>

              {playerCount === 0 ? (
                <p className="text-gray-600 text-sm">No players joined yet. Be the first!</p>
              ) : isFull ? (
                <p className="text-emerald-600 text-sm font-medium">Game is full! Starting soon...</p>
              ) : (
                <p className="text-gray-600 text-sm">
                  Waiting for <strong>{playersNeeded} more player{playersNeeded !== 1 ? 's' : ''}</strong> to join
                </p>
              )}

              {/* Real-time player count display */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Players Online</span>
                  <span>{playerCount}/{currentGame.maxPlayers}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div
                    className="bg-emerald-600 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${(playerCount / currentGame.maxPlayers) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Join Button */}
            <button
              onClick={joinGame}
              disabled={isJoining || isFull}
              className={`
                w-full py-3 px-6 rounded-lg font-semibold transition-all
                ${isFull
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isJoining ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Joining Game...
                </span>
              ) : isFull ? (
                'Game Full'
              ) : (
                `Join Game (${playerCount}/${currentGame.maxPlayers})`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">Real-Time Lobby System</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Instant updates when players join or leave</li>
          <li>• Games start automatically when 6 players join OR after 10 minutes</li>
          <li>• Minimum 2 players required, otherwise game is cancelled</li>
          <li>• All lobby games use 6x6 grid with 5 treasures and 10 dig attempts</li>
          <li>• Powered by Socket.IO for real-time communication</li>
        </ul>
      </div>
    </div>
  )
}