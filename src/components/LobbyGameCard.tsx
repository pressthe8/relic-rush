import React from 'react'
import { CountdownTimer } from './CountdownTimer'
import { Users, Clock, Trophy, Grid3x3 } from 'lucide-react'

interface LobbyGame {
  id: string
  gameCode: string
  scheduledStartTime: string
  maxPlayers: number
  status: 'scheduled'
  playerCount: number
  joinedPlayers: string[]
}

interface LobbyGameCardProps {
  game: LobbyGame
  onJoin: () => void
  isJoining: boolean
}

export const LobbyGameCard: React.FC<LobbyGameCardProps> = ({ game, onJoin, isJoining }) => {
  const playersNeeded = game.maxPlayers - game.playerCount
  const isFull = game.playerCount >= game.maxPlayers

  return (
    <div className="bg-white rounded-xl shadow-lg border border-emerald-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-amber-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Next Scheduled Game</h3>
            <p className="text-emerald-100">Game Code: <span className="font-mono font-bold">{game.gameCode}</span></p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{game.playerCount}/{game.maxPlayers}</div>
            <div className="text-emerald-100 text-sm">Players</div>
          </div>
        </div>
      </div>

      {/* Game Info */}
      <div className="p-6 space-y-4">
        {/* Countdown Timer */}
        <div className="text-center">
          <CountdownTimer
            targetTime={game.scheduledStartTime}
            onComplete={() => window.location.reload()}
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

          {game.playerCount === 0 ? (
            <p className="text-gray-600 text-sm">No players joined yet. Be the first!</p>
          ) : isFull ? (
            <p className="text-emerald-600 text-sm font-medium">Game is full! Starting soon...</p>
          ) : (
            <p className="text-gray-600 text-sm">
              Waiting for <strong>{playersNeeded} more player{playersNeeded !== 1 ? 's' : ''}</strong> to join
            </p>
          )}

          {/* Player List Preview */}
          {game.playerCount > 0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1">Joined Players:</div>
              <div className="flex flex-wrap gap-1">
                {game.joinedPlayers.slice(0, 3).map((playerId, index) => (
                  <span
                    key={playerId}
                    className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded"
                  >
                    Player {index + 1}
                  </span>
                ))}
                {game.playerCount > 3 && (
                  <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                    +{game.playerCount - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Join Button */}
        <button
          onClick={onJoin}
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
            `Join Game (${game.playerCount}/${game.maxPlayers})`
          )}
        </button>

        {/* Game Rules Reminder */}
        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>Game starts when full OR after countdown expires</p>
          <p>Minimum 2 players required to start</p>
        </div>
      </div>
    </div>
  )
}