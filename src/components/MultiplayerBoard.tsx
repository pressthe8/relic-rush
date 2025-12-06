import React, { useState } from 'react'
import { Square } from './Square'
import { PlayerBoard } from '../lib/firebase'
import { Users, Trophy, Shovel, Copy, Check, Hash, Loader2 } from 'lucide-react'

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
  // Total players = current player + other players
  const totalPlayers = otherPlayers.length + 1

  // Helper for Battleship-style coordinates (A1, B3, etc.)
  const formatPosition = (row: number, col: number) => {
    const colLetter = String.fromCharCode(65 + col) // 0 -> A, 1 -> B
    const rowNumber = row + 1 // 0 -> 1
    return `${colLetter}${rowNumber}`
  }

  const columnLabels = Array.from({ length: boardSize }, (_, i) => String.fromCharCode(65 + i))

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

      {/* Game Board with Integrated Labels */}
      <div className="flex justify-center p-4">
        <div
          className="grid gap-2 relative"
          style={{
            gridTemplateColumns: `auto repeat(${boardSize}, minmax(0, 1fr))`,
            width: '100%',
            maxWidth: `${boardSize * 3.5 + 2}rem` // Add space for labels
          }}
        >
          {/* Overlay for Out of Digs - Blocks interaction when player has no digs left */}
          {playerBoard.remainingDigs <= 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-lg border border-amber-200 shadow-sm">
              <div className="flex flex-col items-center p-6 text-center transform scale-110">
                <Loader2 className="w-10 h-10 text-amber-600 animate-spin mb-4" />
                <h3 className="text-2xl font-bold text-amber-800 mb-2">All Digs Used</h3>
                <p className="text-emerald-800 font-medium px-4 py-1 bg-emerald-100/50 rounded-full text-sm">Waiting for other players...</p>
              </div>
            </div>
          )}

          {/* Top-Left Corner Spacer */}
          <div className="h-6 w-6"></div>

          {/* Column Headers (A-F) */}
          {columnLabels.map((label, i) => (
            <div key={`col-${i}`} className="flex items-end justify-center font-bold text-emerald-800 pb-1">
              {label}
            </div>
          ))}

          {/* Grid Rows with Side Labels */}
          {playerBoard.boardState.map((row: any[], rowIndex: number) => (
            <React.Fragment key={`row-${rowIndex}`}>
              {/* Row Label (1-6) */}
              <div className="flex items-center justify-center font-bold text-emerald-800 pr-2">
                {rowIndex + 1}
              </div>

              {/* Board Squares for this Row */}
              {row.map((square: any, colIndex: number) => (
                <div key={`${rowIndex}-${colIndex}`} className="aspect-square">
                  <Square
                    square={square}
                    position={{ row: rowIndex, col: colIndex }}
                    gridSize={boardSize}
                    subGridHints={playerBoard.subGridHints || {}}
                    onClick={() => onDig({ row: rowIndex, col: colIndex })}
                    disabled={isLoading || playerBoard.remainingDigs <= 0}
                    isOpponentView={false}
                    showOwnDiscoveries={true}
                  />
                </div>
              ))}
            </React.Fragment>
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
                  Position <span className="font-bold font-mono text-emerald-700">{formatPosition(discovery.row, discovery.col)}</span>
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