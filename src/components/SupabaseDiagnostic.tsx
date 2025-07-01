import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, RefreshCw, Database, Shield, Users } from 'lucide-react'

interface DiagnosticResult {
  test: string
  status: 'success' | 'error' | 'warning'
  message: string
  details?: any
}

export const SupabaseDiagnostic: React.FC = () => {
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addResult = (result: DiagnosticResult) => {
    setResults(prev => [...prev, result])
  }

  const runDiagnostics = async () => {
    setIsRunning(true)
    setResults([])

    // Test 1: Basic connection
    try {
      console.log('🔍 Testing basic Supabase connection...')
      const { data, error } = await supabase.from('game_sessions').select('count', { count: 'exact', head: true })
      
      if (error) {
        addResult({
          test: 'Basic Connection',
          status: 'error',
          message: `Connection failed: ${error.message}`,
          details: error
        })
      } else {
        addResult({
          test: 'Basic Connection',
          status: 'success',
          message: `Connected successfully. Found ${data} records.`
        })
      }
    } catch (error) {
      addResult({
        test: 'Basic Connection',
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
    }

    // Test 2: Check if tables exist
    try {
      console.log('🔍 Testing table existence...')
      const { data: gameSessionsData, error: gameSessionsError } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)

      if (gameSessionsError) {
        addResult({
          test: 'Game Sessions Table',
          status: 'error',
          message: `Table access failed: ${gameSessionsError.message}`,
          details: gameSessionsError
        })
      } else {
        addResult({
          test: 'Game Sessions Table',
          status: 'success',
          message: 'Table accessible'
        })
      }

      const { data: playerBoardsData, error: playerBoardsError } = await supabase
        .from('player_boards')
        .select('id')
        .limit(1)

      if (playerBoardsError) {
        addResult({
          test: 'Player Boards Table',
          status: 'error',
          message: `Table access failed: ${playerBoardsError.message}`,
          details: playerBoardsError
        })
      } else {
        addResult({
          test: 'Player Boards Table',
          status: 'success',
          message: 'Table accessible'
        })
      }
    } catch (error) {
      addResult({
        test: 'Table Access',
        status: 'error',
        message: `Failed to check tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
    }

    // Test 3: Check specific lobby query
    try {
      console.log('🔍 Testing lobby game query...')
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .limit(1)

      if (lobbyError) {
        addResult({
          test: 'Lobby Game Query',
          status: 'error',
          message: `Lobby query failed: ${lobbyError.message}`,
          details: lobbyError
        })
      } else {
        addResult({
          test: 'Lobby Game Query',
          status: 'success',
          message: `Found ${lobbyData?.length || 0} lobby games`,
          details: lobbyData
        })
      }
    } catch (error) {
      addResult({
        test: 'Lobby Game Query',
        status: 'error',
        message: `Network error on lobby query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
    }

    // Test 4: Check RLS policies
    try {
      console.log('🔍 Testing RLS policies...')
      const { data: rlsData, error: rlsError } = await supabase
        .from('game_sessions')
        .select('id, status, is_lobby_game')
        .eq('status', 'scheduled')

      if (rlsError) {
        addResult({
          test: 'RLS Policies',
          status: 'error',
          message: `RLS policy failed: ${rlsError.message}`,
          details: rlsError
        })
      } else {
        addResult({
          test: 'RLS Policies',
          status: 'success',
          message: `RLS working. Found ${rlsData?.length || 0} scheduled games`
        })
      }
    } catch (error) {
      addResult({
        test: 'RLS Policies',
        status: 'error',
        message: `RLS test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
    }

    // Test 5: Test function calls
    try {
      console.log('🔍 Testing database functions...')
      const { data: functionData, error: functionError } = await supabase.rpc('ensure_lobby_game_available')

      if (functionError) {
        addResult({
          test: 'Database Functions',
          status: 'error',
          message: `Function call failed: ${functionError.message}`,
          details: functionError
        })
      } else {
        addResult({
          test: 'Database Functions',
          status: 'success',
          message: 'Functions working correctly',
          details: functionData
        })
      }
    } catch (error) {
      addResult({
        test: 'Database Functions',
        status: 'error',
        message: `Function test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
    }

    // Test 6: Check environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      addResult({
        test: 'Environment Variables',
        status: 'error',
        message: 'Missing environment variables',
        details: { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey }
      })
    } else {
      addResult({
        test: 'Environment Variables',
        status: 'success',
        message: 'Environment variables present',
        details: { 
          url: supabaseUrl.substring(0, 30) + '...', 
          keyLength: supabaseKey.length 
        }
      })
    }

    setIsRunning(false)
  }

  useEffect(() => {
    runDiagnostics()
  }, [])

  const getIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      default:
        return <RefreshCw className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Database className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800">Supabase Diagnostics</h2>
        </div>
        <p className="text-gray-600">
          Comprehensive testing of database connection and functionality
        </p>
      </div>

      <div className="flex justify-center">
        <button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running Tests...' : 'Run Diagnostics'}
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border-2 ${getStatusColor(result.status)}`}
          >
            <div className="flex items-center gap-3 mb-2">
              {getIcon(result.status)}
              <h3 className="font-semibold text-gray-800">{result.test}</h3>
            </div>
            <p className="text-gray-700 mb-2">{result.message}</p>
            {result.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  View Details
                </summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <Shield className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-600">
              Tests completed: {results.filter(r => r.status === 'success').length} passed, {results.filter(r => r.status === 'error').length} failed
            </span>
          </div>
        </div>
      )}
    </div>
  )
}