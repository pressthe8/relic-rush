import React from 'react'
import { Trophy, Medal, Award, RotateCcw, ArrowLeft } from 'lucide-react'
import { PlayerBoard } from '../lib/firebase'

interface GameFinaleProps {
  finalResults: PlayerBoard[]
  onPlayAgain: () => void
  onBackToMenu: () => void
}

export const GameFinale: React.FC<GameFinaleProps> = ({
  finalResults,
  onPlayAgain,
  onBackToMenu
}) => {
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="w-8 h-8 text-yellow-500" />
      case 2:
        return <Medal className="w-8 h-8 text-gray-400" />
      case 3:
        return <Award className="w-8 h-8 text-amber-600" />
      default:
        return <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full text-gray-600 font-bold">{position}</div>
    }
  }

  const getPositionColor = (position: number) => {
    switch (position) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white'
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white'
      case 3:
        return 'bg-gradient-to-r from-amber-400 to-amber-600 text-white'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }



  const winner = finalResults[0]
  const hasMultiplePlayers = finalResults.length > 1

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <Trophy className="w-16 h-16 text-yellow-500" />
        </div>
        <h1 className="text-4xl font-bold text-gray-800">Game Complete!</h1>
        {hasMultiplePlayers ? (
          <p className="text-xl text-gray-600">
            🎉 Congratulations to <span className="font-bold text-yellow-600">{winner.mockPlayerId}</span> for winning!
          </p>
        ) : (
          <p className="text-xl text-gray-600">
            Great job exploring! You scored <span className="font-bold text-amber-600">{winner.score}</span> points.
          </p>
        )}
      </div>

      {/* Final Scores */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-amber-600 text-white p-4">
          <h2 className="text-xl font-bold text-center">Final Scores</h2>
        </div>

        <div className="p-6 space-y-3">
          {finalResults.map((player, index) => {
            const position = index + 1
            const isWinner = position === 1 && hasMultiplePlayers

            return (
              <div
                key={player.id}
                className={`
                  flex items-center gap-4 p-4 rounded-lg transition-all
                  ${getPositionColor(position)}
                  ${isWinner ? 'ring-2 ring-yellow-400 shadow-lg scale-105' : ''}
                `}
              >
                <div className="flex-shrink-0">
                  {getPositionIcon(position)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">
                      {player.mockPlayerId?.replace('mock_player_', 'Player ')}
                    </span>
                    {isWinner && <span className="text-sm font-medium">👑 WINNER</span>}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold">{player.score}</div>
                  <div className="text-sm opacity-75">
                    {player.discoveries.length} treasures found
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onPlayAgain}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg shadow-md hover:bg-emerald-700 transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
          Play Again
        </button>

        <button
          onClick={onBackToMenu}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Menu
        </button>
      </div>
    </div>
  )
}