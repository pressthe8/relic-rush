import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface ConnectionStatus {
  isConnected: boolean
  error: string | null
  projectUrl: string
  hasValidKey: boolean
  canQuery: boolean
  testResults: {
    basicConnection: boolean
    gameSessionsTable: boolean
    playerBoardsTable: boolean
    lobbyFunctions: boolean
  }
}

export const SupabaseConnectionTest: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    error: null,
    projectUrl: '',
    hasValidKey: false,
    canQuery: false,
    testResults: {
      basicConnection: false,
      gameSessionsTable: false,
      playerBoardsTable: false,
      lobbyFunctions: false
    }
  })
  const [isLoading, setIsLoading] = useState(false)

  const runConnectionTests = async () => {
    setIsLoading(true)
    console.log('🔍 Starting Supabase connection tests...')

    const newStatus: ConnectionStatus = {
      isConnected: false,
      error: null,
      projectUrl: import.meta.env.VITE_SUPABASE_URL || 'NOT_SET',
      hasValidKey: !!(import.meta.env.VITE_SUPABASE_ANON_KEY),
      canQuery: false,
      testResults: {
        basicConnection: false,
        gameSessionsTable: false,
        playerBoardsTable: false,
        lobbyFunctions: false
      }
    }

    try {
      // Test 1: Basic connection
      console.log('📡 Testing basic connection...')
      const { data: basicTest, error: basicError } = await supabase
        .from('game_sessions')
        .select('count')
        .limit(1)

      if (basicError) {
        console.error('❌ Basic connection failed:', basicError)
        newStatus.error = `Connection failed: ${basicError.message}`
      } else {
        console.log('✅ Basic connection successful')
        newStatus.testResults.basicConnection = true
        newStatus.canQuery = true
      }

      // Test 2: Game sessions table
      if (newStatus.testResults.basicConnection) {
        console.log('📊 Testing game_sessions table...')
        const { data: gameSessionsTest, error: gameSessionsError } = await supabase
          .from('game_sessions')
          .select('id, status, is_lobby_game')
          .limit(5)

        if (gameSessionsError) {
          console.error('❌ Game sessions table test failed:', gameSessionsError)
        } else {
          console.log('✅ Game sessions table accessible:', gameSessionsTest)
          newStatus.testResults.gameSessionsTable = true
        }
      }

      // Test 3: Player boards table
      if (newStatus.testResults.basicConnection) {
        console.log('👥 Testing player_boards table...')
        const { data: playerBoardsTest, error: playerBoardsError } = await supabase
          .from('player_boards')
          .select('id, mock_player_id, is_mock_player')
          .limit(5)

        if (playerBoardsError) {
          console.error('❌ Player boards table test failed:', playerBoardsError)
        } else {
          console.log('✅ Player boards table accessible:', playerBoardsTest)
          newStatus.testResults.playerBoardsTable = true
        }
      }

      // Test 4: Lobby functions
      if (newStatus.testResults.basicConnection) {
        console.log('🎮 Testing lobby functions...')
        const { data: lobbyFunctionTest, error: lobbyFunctionError } = await supabase
          .rpc('ensure_lobby_game_available')

        if (lobbyFunctionError) {
          console.error('❌ Lobby function test failed:', lobbyFunctionError)
        } else {
          console.log('✅ Lobby functions working:', lobbyFunctionTest)
          newStatus.testResults.lobbyFunctions = true
        }
      }

      // Overall status
      newStatus.isConnected = newStatus.testResults.basicConnection && 
                             newStatus.testResults.gameSessionsTable && 
                             newStatus.testResults.playerBoardsTable

      console.log('📋 Final connection status:', newStatus)

    } catch (error) {
      console.error('💥 Connection test failed with exception:', error)
      newStatus.error = error instanceof Error ? error.message : 'Unknown connection error'
    }

    setStatus(newStatus)
    setIsLoading(false)
  }

  useEffect(() => {
    runConnectionTests()
  }, [])

  const getStatusIcon = () => {
    if (isLoading) return <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
    if (status.isConnected) return <CheckCircle className="w-6 h-6 text-green-600" />
    if (status.canQuery) return <Wifi className="w-6 h-6 text-yellow-600" />
    return <WifiOff className="w-6 h-6 text-red-600" />
  }

  const getStatusText = () => {
    if (isLoading) return 'Testing connection...'
    if (status.isConnected) return 'Connected and ready!'
    if (status.canQuery) return 'Connected but some issues detected'
    return 'Connection failed'
  }

  const getStatusColor = () => {
    if (isLoading) return 'border-blue-200 bg-blue-50'
    if (status.isConnected) return 'border-green-200 bg-green-50'
    if (status.canQuery) return 'border-yellow-200 bg-yellow-50'
    return 'border-red-200 bg-red-50'
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className={`p-6 rounded-xl border-2 ${getStatusColor()}`}>
        <div className="flex items-center gap-3 mb-4">
          {getStatusIcon()}
          <h2 className="text-2xl font-bold text-gray-800">Supabase Connection Test</h2>
        </div>
        <p className="text-lg font-medium text-gray-700">{getStatusText()}</p>
        {status.error && (
          <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 text-sm">{status.error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Environment Check */}
      <div className="bg-white p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Environment Configuration</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Supabase URL:</span>
            <span className={`font-mono text-sm ${status.projectUrl !== 'NOT_SET' ? 'text-green-600' : 'text-red-600'}`}>
              {status.projectUrl === 'NOT_SET' ? 'NOT SET' : status.projectUrl.substring(0, 30) + '...'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Anon Key:</span>
            <span className={`font-mono text-sm ${status.hasValidKey ? 'text-green-600' : 'text-red-600'}`}>
              {status.hasValidKey ? 'SET' : 'NOT SET'}
            </span>
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="bg-white p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Connection Tests</h3>
        <div className="space-y-3">
          {Object.entries(status.testResults).map(([test, passed]) => (
            <div key={test} className="flex items-center justify-between">
              <span className="text-gray-600 capitalize">
                {test.replace(/([A-Z])/g, ' $1').trim()}:
              </span>
              <div className="flex items-center gap-2">
                {passed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-medium ${passed ? 'text-green-600' : 'text-red-600'}`}>
                  {passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={runConnectionTests}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          Retest Connection
        </button>
      </div>

      {/* Troubleshooting */}
      {!status.isConnected && (
        <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-3">🔧 Troubleshooting Steps</h3>
          <ol className="text-sm text-amber-700 space-y-2 list-decimal list-inside">
            <li>Check that your <code>.env</code> file exists in the project root</li>
            <li>Verify your Supabase project URL and anon key are correct</li>
            <li>Make sure your Supabase project is not paused or suspended</li>
            <li>Check if you have internet connectivity</li>
            <li>Try refreshing the page or restarting the dev server</li>
            <li>Verify the database migration completed successfully</li>
          </ol>
        </div>
      )}
    </div>
  )
}