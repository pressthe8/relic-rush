import React from 'react'
import { CountdownTimer } from './CountdownTimer'
import { Users, CheckCircle, Clock, LogOut } from 'lucide-react'

interface LobbyGame {
  id: string
  gameCode: string
  scheduledStartTime: string
  maxPlayers: number
  status: 'scheduled'
  playerCount: number
  joinedPlayers: string[]
}

interface JoinedGameStatusProps {
  game: LobbyGame
  onLeave: () => void
  isLeaving: boolean
}

export const JoinedGameStatus: React.FC<JoinedGameStatusProps> = ({ game, onLeave, isLeaving }) => {
  const playersNeeded = game.maxPlayers - game.playerCount
  const isFull = game.playerCount >= game.maxPlayers

  return (
    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6">
      {/* Success Header */}
      <div className="text-center space-y-4 mb-6">
        <div className="flex items-center justify-center gap-3">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
          <h3 className="text-2xl font-bold text-emerald-800">You're In!</h3>
        </div>
        <p className="text-emerald-700">
          Successfully joined game <span className="font-mono font-bold">{game.gameCode}</span>
        </p>
      </div>

      {/* Countdown Timer */}
      <div className="text-center mb-6">
        <CountdownTimer
          targetTime={game.scheduledStartTime}
          onComplete={() => window.location.reload()}
          variant="success"
        />
      </div>

      {/* Waiting Status */}
      <div className="bg-white rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-gray-800">Game Status</span>
          <Users className="w-5 h-5 text-emerald-600" />
        </div>

        {isFull ? (
          <div className="space-y-2">
            <p className="text-emerald-700 font-medium">🎉 Game is full! Starting soon...</p>
            <p className="text-sm text-emerald-600">
              All {game.maxPlayers} players have joined. The game will begin shortly!
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
            <span>{game.playerCount}/{game.maxPlayers}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(game.playerCount / game.maxPlayers) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* What Happens Next */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          What Happens Next?
        </h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• You'll be automatically redirected when the game starts</li>
          <li>• All players will see the same treasure layout</li>
          <li>• First discoveries are worth more points (100, 80, 60...)</li>
          <li>• Use the heat map to find areas where others found treasures</li>
        </ul>
      </div>

      {/* Leave Game Button */}
      <div className="text-center">
        <button
          onClick={onLeave}
          disabled={isLeaving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLeaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Leaving...
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              Leave Game
            </>
          )}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          You can leave anytime before the game starts
        </p>
      </div>
    </div>
  )
}