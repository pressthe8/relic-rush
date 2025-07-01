import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, RefreshCw, Database, Search, Shield, Network, Code } from 'lucide-react'

interface TestResult {
  test: string
  status: 'success' | 'error' | 'warning' | 'pending' | 'skipped'
  message: string
  details?: any
  query?: string
}

export const LobbySystemDiagnostic: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState('')

  const addResult = (result: TestResult) => {
    setResults(prev => [...prev, result])
  }

  const updateResult = (testName: string, updates: Partial<TestResult>) => {
    setResults(prev => prev.map(r => 
      r.test === testName ? { ...r, ...updates } : r
    ))
  }

  // Test 1: Exact failing query in isolation
  const testExactFailingQuery = async () => {
    setCurrentStep('Testing exact failing query...')
    addResult({
      test: '1. Exact Failing Query',
      status: 'pending',
      message: 'Testing the exact query that fails in GameLobby...'
    })

    try {
      console.log('🔍 Testing exact lobby query that fails...')
      
      // This is the EXACT query from GameLobby.tsx line 37
      const { data: lobbyGame, error: gameError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (gameError) {
        updateResult('1. Exact Failing Query', {
          status: 'error',
          message: `Query failed: ${gameError.message}`,
          details: gameError,
          query: "supabase.from('game_sessions').select('*').eq('is_lobby_game', true).eq('status', 'scheduled').order('created_at', { ascending: false }).limit(1).maybeSingle()"
        })
        return false
      }

      updateResult('1. Exact Failing Query', {
        status: 'success',
        message: `Query succeeded! Found: ${lobbyGame ? 'lobby game' : 'no lobby game'}`,
        details: lobbyGame,
        query: "supabase.from('game_sessions').select('*').eq('is_lobby_game', true).eq('status', 'scheduled').order('created_at', { ascending: false }).limit(1).maybeSingle()"
      })
      return true
    } catch (error) {
      updateResult('1. Exact Failing Query', {
        status: 'error',
        message: `Network/JS error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 2: RLS policies for anonymous users
  const testRLSPolicies = async () => {
    setCurrentStep('Testing RLS policies...')
    addResult({
      test: '2. RLS Policies',
      status: 'pending',
      message: 'Testing Row Level Security policies for anonymous access...'
    })

    try {
      // Test basic read access
      const { data: basicRead, error: basicError } = await supabase
        .from('game_sessions')
        .select('id, status')
        .limit(1)

      if (basicError) {
        updateResult('2. RLS Policies', {
          status: 'error',
          message: `Basic read blocked by RLS: ${basicError.message}`,
          details: basicError
        })
        return false
      }

      // Test lobby-specific access
      const { data: lobbyRead, error: lobbyError } = await supabase
        .from('game_sessions')
        .select('id, is_lobby_game, status')
        .eq('is_lobby_game', true)

      if (lobbyError) {
        updateResult('2. RLS Policies', {
          status: 'error',
          message: `Lobby read blocked by RLS: ${lobbyError.message}`,
          details: lobbyError
        })
        return false
      }

      updateResult('2. RLS Policies', {
        status: 'success',
        message: `RLS allows access. Found ${basicRead?.length || 0} total games, ${lobbyRead?.length || 0} lobby games`,
        details: { totalGames: basicRead?.length, lobbyGames: lobbyRead?.length }
      })
      return true
    } catch (error) {
      updateResult('2. RLS Policies', {
        status: 'error',
        message: `RLS test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 3: Database functions exist and are callable
  const testDatabaseFunctions = async () => {
    setCurrentStep('Testing database functions...')
    addResult({
      test: '3. Database Functions',
      status: 'pending',
      message: 'Testing if lobby management functions exist and work...'
    })

    try {
      // Test ensure_lobby_game_available function
      const { data: ensureResult, error: ensureError } = await supabase
        .rpc('ensure_lobby_game_available')

      if (ensureError) {
        updateResult('3. Database Functions', {
          status: 'error',
          message: `ensure_lobby_game_available failed: ${ensureError.message}`,
          details: ensureError
        })
        return false
      }

      // Test create_lobby_game function
      const { data: createResult, error: createError } = await supabase
        .rpc('create_lobby_game')

      if (createError) {
        updateResult('3. Database Functions', {
          status: 'warning',
          message: `create_lobby_game failed (may be expected): ${createError.message}`,
          details: { ensureResult, createError }
        })
      } else {
        updateResult('3. Database Functions', {
          status: 'success',
          message: 'All lobby functions working correctly',
          details: { ensureResult, createResult }
        })
      }
      return true
    } catch (error) {
      updateResult('3. Database Functions', {
        status: 'error',
        message: `Function test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 4: Check if there's actual data in the database
  const testDataIntegrity = async () => {
    setCurrentStep('Checking data integrity...')
    addResult({
      test: '4. Data Integrity',
      status: 'pending',
      message: 'Checking if lobby games exist and have valid data...'
    })

    try {
      // Check all game sessions
      const { data: allGames, error: allError } = await supabase
        .from('game_sessions')
        .select('*')

      if (allError) {
        updateResult('4. Data Integrity', {
          status: 'error',
          message: `Cannot read game sessions: ${allError.message}`,
          details: allError
        })
        return false
      }

      // Check lobby games specifically
      const { data: lobbyGames, error: lobbyError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)

      if (lobbyError) {
        updateResult('4. Data Integrity', {
          status: 'error',
          message: `Cannot read lobby games: ${lobbyError.message}`,
          details: lobbyError
        })
        return false
      }

      // Check scheduled lobby games
      const scheduledGames = lobbyGames?.filter(g => g.status === 'scheduled') || []

      updateResult('4. Data Integrity', {
        status: scheduledGames.length > 0 ? 'success' : 'warning',
        message: `Found ${allGames?.length || 0} total games, ${lobbyGames?.length || 0} lobby games, ${scheduledGames.length} scheduled`,
        details: { 
          totalGames: allGames?.length, 
          lobbyGames: lobbyGames?.length, 
          scheduledGames: scheduledGames.length,
          sampleGame: scheduledGames[0] || lobbyGames?.[0] || allGames?.[0]
        }
      })
      return true
    } catch (error) {
      updateResult('4. Data Integrity', {
        status: 'error',
        message: `Data check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 5: Network connectivity to Supabase specifically
  const testNetworkConnectivity = async () => {
    setCurrentStep('Testing network connectivity...')
    addResult({
      test: '5. Network Connectivity',
      status: 'pending',
      message: 'Testing network access to Supabase API...'
    })

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) {
        updateResult('5. Network Connectivity', {
          status: 'error',
          message: 'Missing environment variables',
          details: { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey }
        })
        return false
      }

      // Test direct fetch to Supabase REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/game_sessions?select=id&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        updateResult('5. Network Connectivity', {
          status: 'error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText }
        })
        return false
      }

      const data = await response.json()
      updateResult('5. Network Connectivity', {
        status: 'success',
        message: 'Direct API access working',
        details: { responseData: data }
      })
      return true
    } catch (error) {
      updateResult('5. Network Connectivity', {
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 6: Authentication context
  const testAuthenticationContext = async () => {
    setCurrentStep('Testing authentication context...')
    addResult({
      test: '6. Authentication Context',
      status: 'pending',
      message: 'Testing anonymous authentication and permissions...'
    })

    try {
      // Check current session
      const { data: session, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        updateResult('6. Authentication Context', {
          status: 'error',
          message: `Session check failed: ${sessionError.message}`,
          details: sessionError
        })
        return false
      }

      // Check user
      const { data: user, error: userError } = await supabase.auth.getUser()

      if (userError) {
        updateResult('6. Authentication Context', {
          status: 'warning',
          message: `User check failed (may be normal for anon): ${userError.message}`,
          details: { sessionError, userError }
        })
      } else {
        updateResult('6. Authentication Context', {
          status: 'success',
          message: `Auth context: ${session?.session ? 'authenticated' : 'anonymous'}`,
          details: { 
            hasSession: !!session?.session, 
            hasUser: !!user?.user,
            role: session?.session?.role || 'anon'
          }
        })
      }
      return true
    } catch (error) {
      updateResult('6. Authentication Context', {
        status: 'error',
        message: `Auth test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  const runSystematicInvestigation = async () => {
    setIsRunning(true)
    setResults([])
    setCurrentStep('Starting investigation...')

    // Run tests in priority order
    const test1Success = await testExactFailingQuery()
    if (!test1Success) {
      // If the exact query fails, continue with other tests to understand why
    }

    await testRLSPolicies()
    await testDatabaseFunctions()
    await testDataIntegrity()
    await testNetworkConnectivity()
    await testAuthenticationContext()

    setCurrentStep('Investigation complete')
    setIsRunning(false)
  }

  const getIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      case 'pending':
        return <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
      case 'skipped':
        return <div className="w-5 h-5 bg-gray-300 rounded-full" />
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
      case 'pending':
        return 'bg-blue-50 border-blue-200'
      case 'skipped':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Search className="w-8 h-8 text-purple-600" />
          <h2 className="text-3xl font-bold text-gray-800">Lobby System Investigation</h2>
        </div>
        <p className="text-gray-600">
          Systematic diagnosis of the lobby system network errors
        </p>
        {currentStep && (
          <p className="text-sm text-purple-600 font-medium">{currentStep}</p>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={runSystematicInvestigation}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          <Search className={`w-5 h-5 ${isRunning ? 'animate-pulse' : ''}`} />
          {isRunning ? 'Investigating...' : 'Start Investigation'}
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
            
            {result.query && (
              <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                <strong>Query:</strong> <code>{result.query}</code>
              </div>
            )}
            
            {result.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  View Technical Details
                </summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-60">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">Investigation Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">
                {results.filter(r => r.status === 'success').length}
              </div>
              <div className="text-gray-600">Passed</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-red-600">
                {results.filter(r => r.status === 'error').length}
              </div>
              <div className="text-gray-600">Failed</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-yellow-600">
                {results.filter(r => r.status === 'warning').length}
              </div>
              <div className="text-gray-600">Warnings</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-blue-600">
                {results.filter(r => r.status === 'pending').length}
              </div>
              <div className="text-gray-600">Pending</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-gray-600">
                {results.filter(r => r.status === 'skipped').length}
              </div>
              <div className="text-gray-600">Skipped</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}