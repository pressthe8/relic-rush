import React, { useState } from 'react'
import { GameSettings, GridSize } from '../types'
import { Settings, Users, User, Grid2x2, Plus, LogIn, Copy, Check, AlertCircle, Clock } from 'lucide-react'
import { isValidGameCode } from '../lib/firebase'

interface MultiplayerSetupProps {
  settings: GameSettings
  onSettingsChange: (settings: GameSettings) => void
  onCreateGame: () => void
  onJoinGame: (gameCode: string) => void
  isLoading: boolean
  gameCode?: string
}

const GRID_SIZES: GridSize[] = [6, 9, 12]

export const MultiplayerSetup: React.FC<MultiplayerSetupProps> = ({
  settings,
  onSettingsChange,
  onCreateGame,
  onJoinGame,
  isLoading,
  gameCode
}) => {
  const [joinGameCode, setJoinGameCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [validationError, setValidationError] = useState('')

  const handleChange = (key: keyof GameSettings, value: number | string) => {
    onSettingsChange({
      ...settings,
      [key]: value
    })
  }

  const handleCopyGameCode = async () => {
    if (gameCode) {
      await navigator.clipboard.writeText(gameCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleJoinGameCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase() // Auto-uppercase for consistency
    setJoinGameCode(value)

    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError('')
    }
  }

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedCode = joinGameCode.trim()

    if (!trimmedCode) {
      setValidationError('Please enter a game code')
      return
    }

    if (!isValidGameCode(trimmedCode)) {
      setValidationError('Please enter a valid 6-character game code (e.g., ABC123)')
      return
    }

    setValidationError('')
    onJoinGame(trimmedCode)
  }

  console.log('MultiplayerSetup render - gameCode:', gameCode)

  return (
    <div className="w-full max-w-2xl p-6 bg-white rounded-xl shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-amber-600" />
        <h2 className="text-2xl font-bold text-gray-800">Multiplayer Game Setup</h2>
      </div>

      {/* Game Timeout Notice */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-800">Game Timeout Policy</h3>
        </div>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• Games waiting for players will be cancelled after <strong>30 minutes</strong></p>
          <p>• Active games will be cancelled after <strong>2 hours</strong> of inactivity</p>
          <p>• Make sure to share game codes promptly and stay active during gameplay</p>
        </div>
      </div>

      {gameCode && (
        <div className="mb-6 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
          <h3 className="font-semibold text-emerald-800 mb-2">🎉 Game Created!</h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold text-emerald-700 tracking-wider bg-white px-4 py-2 rounded-lg border-2 border-emerald-300">
                {gameCode}
              </div>
            </div>
            <button
              onClick={handleCopyGameCode}
              className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors text-sm"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-emerald-700">
            Share this <strong>6-character game code</strong> with other players so they can join your game. The game will start automatically when players join.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Create Game Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Game
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Grid Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {GRID_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => handleChange('gridSize', size)}
                    disabled={isLoading}
                    className={`py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${settings.gridSize === size
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    <Grid2x2 className="w-4 h-4" />
                    {size}x{size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Treasure Count: {settings.treasureCount}
              </label>
              <input
                type="range"
                min="1"
                max={Math.floor(settings.gridSize * settings.gridSize / 3)}
                value={settings.treasureCount}
                onChange={(e) => handleChange('treasureCount', parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Dig Attempts: {settings.digAttempts}
              </label>
              <input
                type="range"
                min="5"
                max="20"
                value={settings.digAttempts}
                onChange={(e) => handleChange('digAttempts', parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>

            <button
              onClick={onCreateGame}
              disabled={isLoading || !!gameCode}
              className="w-full py-3 px-4 bg-amber-600 text-white font-semibold rounded-lg shadow-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : gameCode ? 'Game Created!' : 'Create Game'}
            </button>
          </div>
        </div>

        {/* Join Game Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <LogIn className="w-5 h-5" />
            Join Existing Game
          </h3>

          <form onSubmit={handleJoinSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Game Code
              </label>
              <input
                type="text"
                value={joinGameCode}
                onChange={handleJoinGameCodeChange}
                placeholder="Enter 6-character code (e.g., ABC123)"
                maxLength={6}
                disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 text-center text-lg font-mono tracking-wider uppercase ${validationError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
              />
              {validationError && (
                <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {validationError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !joinGameCode.trim()}
              className="w-full py-3 px-4 bg-emerald-600 text-white font-semibold rounded-lg shadow-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-opacity-75 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Joining...' : 'Join Game'}
            </button>
          </form>

          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">How to play multiplayer:</p>
            <ul className="space-y-1 text-xs">
              <li>• Create a game and share the <strong>6-character code</strong></li>
              <li>• Other players join using the same code</li>
              <li>• All players see the same treasure layout</li>
              <li>• First discovery gets 100 points, decreasing for later finds</li>
              <li>• Use heat map hints from other players' discoveries</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}