import React, { useState } from 'react'
import { useMultiplayerGame } from './hooks/useMultiplayerGame'
import { MultiplayerSetup } from './components/MultiplayerSetup'
import { MultiplayerBoard } from './components/MultiplayerBoard'
import { GameFinale } from './components/GameFinale'
import { GameIntroduction } from './components/GameIntroduction'
import { SocketGameLobby } from './components/SocketGameLobby'
import { SupabaseConnectionTest } from './components/SupabaseConnectionTest'
import { LobbySystemDiagnostic } from './components/LobbySystemDiagnostic'
import { Gem, ArrowLeft } from 'lucide-react'
import { GameSettings, GridSize } from './types'

type AppMode = 'introduction' | 'lobby' | 'private-setup' | 'game' | 'connection-test' | 'lobby-diagnostic'

function App() {
  const [appMode, setAppMode] = useState<AppMode>('lobby') // Switch to lobby as default
  const [settings, setSettings] = useState<GameSettings>({
    gridSize: 9 as GridSize,
    treasureCount: 5,
    digAttempts: 10,
    gameMode: 'single' // Keep for compatibility but unused
  })
  
  // Feature flag for private games (parked for now)
  const ENABLE_PRIVATE_GAMES = false
  
  // Multiplayer game state
  const {
    session,
    playerBoard,
    otherPlayers,
    isLoading,
    error,
    gameCompleted,
    finalResults,
    createGameSession,
    joinGameSession,
    joinGameSessionByCode,
    dig: multiplayerDig,
    resetGame: resetMultiplayerGame
  } = useMultiplayerGame()

  const handleBackToIntroduction = () => {
    setAppMode('introduction')
    resetMultiplayerGame()
  }

  const handleEnterLobby = () => {
    setAppMode('lobby')
  }

  const handleEnterPrivateSetup = () => {
    setAppMode('private-setup')
  }

  const handleGameStart = (sessionId: string) => {
    // Join the game session and switch to game mode
    joinGameSession(sessionId)
    setAppMode('game')
  }

  const handleCreateMultiplayerGame = async () => {
    const gameCode = await createGameSession(settings)
    if (gameCode) {
      console.log('Game created with code:', gameCode)
      setAppMode('game')
    }
  }

  const handleJoinMultiplayerGame = async (gameCode: string) => {
    const success = await joinGameSessionByCode(gameCode)
    if (success) {
      console.log('Successfully joined game:', gameCode)
      setAppMode('game')
    }
  }

  const handlePlayAgain = () => {
    resetMultiplayerGame()
    setAppMode('lobby') // Return to lobby for next game
  }

  // Debug: Log current app mode
  console.log('Current app mode:', appMode)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 p-4">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-6">
        <div className="flex items-center gap-3 mt-8">
          <Gem className="w-8 h-8 text-amber-600" />
          <h1 className="text-4xl font-bold text-gray-800">Relic Rush</h1>
        </div>

        {/* Error Display */}
        {error && (
          <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Mode Navigation */}
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setAppMode('lobby')}
            className={`px-3 py-1 rounded ${appMode === 'lobby' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}
          >
            🎮 Socket Lobby
          </button>
          <button
            onClick={() => setAppMode('introduction')}
            className={`px-3 py-1 rounded ${appMode === 'introduction' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            📖 Introduction
          </button>
          <button
            onClick={() => setAppMode('lobby-diagnostic')}
            className={`px-3 py-1 rounded ${appMode === 'lobby-diagnostic' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
          >
            🔍 Diagnostics
          </button>
          <button
            onClick={() => setAppMode('connection-test')}
            className={`px-3 py-1 rounded ${appMode === 'connection-test' ? 'bg-orange-600 text-white' : 'bg-gray-200'}`}
          >
            🔧 Connection Test
          </button>
          {ENABLE_PRIVATE_GAMES && (
            <button
              onClick={() => setAppMode('private-setup')}
              className={`px-3 py-1 rounded ${appMode === 'private-setup' ? 'bg-amber-600 text-white' : 'bg-gray-200'}`}
            >
              🔒 Private Games
            </button>
          )}
        </div>

        {/* Lobby System Diagnostic */}
        {appMode === 'lobby-diagnostic' && (
          <LobbySystemDiagnostic />
        )}

        {/* Connection Test Mode */}
        {appMode === 'connection-test' && (
          <SupabaseConnectionTest />
        )}

        {/* Introduction Screen */}
        {appMode === 'introduction' && (
          <GameIntroduction 
            onEnterLobby={handleEnterLobby}
            onEnterPrivateSetup={ENABLE_PRIVATE_GAMES ? handleEnterPrivateSetup : undefined}
          />
        )}

        {/* Socket.IO Game Lobby */}
        {appMode === 'lobby' && (
          <>
            <button
              onClick={handleBackToIntroduction}
              className="self-start flex items-center gap-2 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Introduction
            </button>

            <SocketGameLobby onGameStart={handleGameStart} />
          </>
        )}

        {/* Private Game Setup (Parked Feature) */}
        {appMode === 'private-setup' && ENABLE_PRIVATE_GAMES && (
          <>
            <button
              onClick={handleBackToIntroduction}
              className="self-start flex items-center gap-2 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Introduction
            </button>

            <MultiplayerSetup
              settings={settings}
              onSettingsChange={setSettings}
              onCreateGame={handleCreateMultiplayerGame}
              onJoinGame={handleJoinMultiplayerGame}
              isLoading={isLoading}
              gameCode={session?.game_code}
            />
          </>
        )}

        {/* Active Game */}
        {appMode === 'game' && (
          <>
            <button
              onClick={handleBackToIntroduction}
              className="self-start flex items-center gap-2 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Introduction
            </button>

            {gameCompleted && finalResults ? (
              <GameFinale
                finalResults={finalResults}
                onPlayAgain={handlePlayAgain}
                onBackToMenu={handleBackToIntroduction}
                gameStartTime={session?.start_time}
                gameEndTime={session?.end_time}
              />
            ) : !session || !playerBoard ? (
              <div className="text-center">
                <p className="text-gray-600">Loading game...</p>
              </div>
            ) : (
              <MultiplayerBoard
                playerBoard={playerBoard}
                otherPlayers={otherPlayers}
                onDig={multiplayerDig}
                isLoading={isLoading}
                gameCode={session.game_code}
              />
            )}
          </>
        )}

        {/* Fallback for Unknown State */}
        {!['introduction', 'lobby', 'private-setup', 'game', 'connection-test', 'lobby-diagnostic'].includes(appMode) && (
          <div className="text-center">
            <p className="text-red-600">Unknown app state: {appMode}</p>
            <button
              onClick={() => setAppMode('lobby')}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg"
            >
              Return to Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App