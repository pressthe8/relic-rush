import React, { useState } from 'react'
import { Square } from './Square'
import { PlayerBoard } from '../lib/firebase'
import { Users, Trophy, Shovel, Copy, Check, Hash } from 'lucide-react'

interface Position {
  row: number
  col: number
}

interface MultiplayerBoardProps {
  playerBoard: PlayerBoard
  otherPlayers: PlayerBoard[]
  onDig: (position: Position) => void
  isLoading: boolean
  gameCode?: string
}

export const MultiplayerBoard: React.FC<MultiplayerBoardProps> = ({
  playerBoard,
  otherPlayers,
  onDig,
  isLoading,
  gameCode
}) => {
  const [copied, setCopied] = useState(false)
  const boardSize = playerBoard.boardState.length

  const handleCopyGameCode = async () => {
    if (gameCode) {
      await navigator.clipboard.writeText(gameCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Total players = current player + other players
  const totalPlayers = otherPlayers.length + 1

  // Debug logging for sub-grid hints
  console.log('🎮 MultiplayerBoard render - playerBoard.subGridHints:', playerBoard.subGridHints)
  console.log('🎮 Has hints?', Object.keys(playerBoard.subGridHints || {}).length > 0)

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Game Code Display */}
      {gameCode && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-emerald-600" />
              <span className="font-medium text-emerald-800">Game Code:</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
              <div className="text-2xl font-bold text-emerald-700 tracking-wider bg-white px-4 py-2 rounded-lg border-2 border-emerald-300">
                {gameCode}
              </div>
              <button
                onClick={handleCopyGameCode}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <p className="text-sm text-emerald-700 mt-2 text-center">
            Share this <strong>6-character game code</strong> with other players to invite them to your game.
          </p>
        </div>
      )}

      {/* Game Stats - ONLY show player's own stats and total player count */}
      <div className="flex flex-wrap items-center gap-6 p-4 bg-white rounded-xl shadow-lg">
        <div className="flex items-center gap-2 text-gray-700">
          <Shovel className="w-5 h-5 text-amber-600" />
          <span className="font-medium">Digs: {playerBoard.remainingDigs}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-700">
          <Trophy className="w-5 h-5 text-amber-600" />
          <span className="font-medium">Score: {playerBoard.score}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-700">
          <Users className="w-5 h-5 text-emerald-600" />
          <span className="font-medium">Players: {totalPlayers}</span>
        </div>
      </div>

      {/* Sub-grid Hints Legend - Always show for debugging */}
      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
        <h3 className="font-semibold text-amber-800 mb-2">🗺️ Treasure Hunt Heat Map</h3>
        <p className="text-sm text-amber-700 mb-3">
          Colored borders show sub-grid areas where other players have found treasures.
          Intensity increases with more discoveries in that area.
        </p>

        {/* Debug info */}
        <div className="mb-3 p-2 bg-amber-100 rounded text-xs text-amber-800">
          <strong>Debug:</strong> Sub-grid hints: {JSON.stringify(playerBoard.subGridHints || {})}
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-400 bg-yellow-100 rounded"></div>
            <span className="text-amber-700">1 discovery</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-500 bg-orange-100 rounded"></div>
            <span className="text-amber-700">2 discoveries</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-600 bg-red-100 rounded"></div>
            <span className="text-amber-700">3 discoveries</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-800 bg-red-200 rounded"></div>
            <span className="text-amber-700">4+ discoveries</span>
          </div>
        </div>
      </div>

      {/* Game Board - Only show player's own board state with sub-grid hints */}
      <div className="flex justify-center">
        <div
          className={`
            grid gap-2 p-6 bg-emerald-950/10 rounded-xl shadow-inner
            transition-all duration-300
            ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}
          `}
          style={{
            gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
            width: '100%',
            maxWidth: `${boardSize * 3.5}rem`
          }}
        >
          {playerBoard.boardState.map((row: any[], rowIndex: number) => (
            row.map((square: any, colIndex: number) => (
              <Square
                key={`${rowIndex}-${colIndex}`}
                square={square}
                position={{ row: rowIndex, col: colIndex }}
                gridSize={boardSize}
                subGridHints={playerBoard.subGridHints || {}}
                onClick={() => onDig({ row: rowIndex, col: colIndex })}
                disabled={isLoading || playerBoard.remainingDigs <= 0}
                isOpponentView={false}
                showOwnDiscoveries={true}
              />
            ))
          ))}
        </div>
      </div>

      {/* Recent Discoveries */}
      {playerBoard.discoveries.length > 0 && (
        <div className="p-4 bg-white rounded-xl shadow-lg">
          <h3 className="font-semibold text-gray-800 mb-3">Your Discoveries</h3>
          <div className="space-y-2">
            {playerBoard.discoveries.slice(-3).reverse().map((discovery: any, index: number) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Position ({discovery.row}, {discovery.col})
                </span>
                <span className="font-medium text-amber-600">
                  +{discovery.points} points
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}