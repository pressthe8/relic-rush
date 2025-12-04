import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, RefreshCw, Database, Search, Shield, Network, Code } from 'lucide-react'
import { io } from 'socket.io-client'

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

  // Test 1: Direct API call bypassing Supabase client
  const testDirectAPICall = async () => {
    setCurrentStep('Testing direct API call...')
    addResult({
      test: '1. Direct API Call',
      status: 'pending',
      message: 'Bypassing Supabase client to test raw API access...'
    })

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) {
        updateResult('1. Direct API Call', {
          status: 'error',
          message: 'Missing environment variables',
          details: { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey }
        })
        return false
      }

      // Direct fetch to the exact endpoint that's failing
      const response = await fetch(`${supabaseUrl}/rest/v1/game_sessions?select=*&is_lobby_game=eq.true&status=eq.scheduled&order=created_at.desc&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        updateResult('1. Direct API Call', {
          status: 'error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText, errorBody: errorText }
        })
        return false
      }

      const data = await response.json()
      updateResult('1. Direct API Call', {
        status: 'success',
        message: `Direct API call succeeded! Found ${Array.isArray(data) ? data.length : 'unknown'} results`,
        details: data
      })
      return true
    } catch (error) {
      updateResult('1. Direct API Call', {
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 2: Supabase client configuration
  const testSupabaseClientConfig = async () => {
    setCurrentStep('Testing Supabase client configuration...')
    addResult({
      test: '2. Supabase Client Config',
      status: 'pending',
      message: 'Testing if Supabase client is properly configured...'
    })

    try {
      // Test basic client properties
      const clientUrl = (supabase as any).supabaseUrl
      const clientKey = (supabase as any).supabaseKey
      
      // Test simple query without auth context
      const { data, error, status, statusText } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)

      if (error) {
        updateResult('2. Supabase Client Config', {
          status: 'error',
          message: `Client query failed: ${error.message}`,
          details: { error, status, statusText, clientUrl: clientUrl?.substring(0, 30) + '...', hasKey: !!clientKey }
        })
        return false
      }

      updateResult('2. Supabase Client Config', {
        status: 'success',
        message: 'Supabase client working correctly',
        details: { dataLength: data?.length, clientConfigured: true }
      })
      return true
    } catch (error) {
      updateResult('2. Supabase Client Config', {
        status: 'error',
        message: `Client test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 3: Exact failing query with detailed error capture
  const testExactFailingQuery = async () => {
    setCurrentStep('Testing exact failing query...')
    addResult({
      test: '3. Exact Failing Query',
      status: 'pending',
      message: 'Testing the exact query that fails in GameLobby with detailed error capture...'
    })

    try {
      console.log('🔍 Testing exact lobby query that fails...')
      
      // This is the EXACT query from GameLobby.tsx line 37
      const queryBuilder = supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)

      console.log('Query builder created, executing...')
      
      const { data: lobbyGame, error: gameError, status, statusText } = await queryBuilder.maybeSingle()

      console.log('Query executed, results:', { lobbyGame, gameError, status, statusText })

      if (gameError) {
        updateResult('3. Exact Failing Query', {
          status: 'error',
          message: `Query failed: ${gameError.message}`,
          details: { 
            error: gameError, 
            status, 
            statusText,
            errorCode: gameError.code,
            errorDetails: gameError.details,
            errorHint: gameError.hint
          },
          query: "supabase.from('game_sessions').select('*').eq('is_lobby_game', true).eq('status', 'scheduled').order('created_at', { ascending: false }).limit(1).maybeSingle()"
        })
        return false
      }

      updateResult('3. Exact Failing Query', {
        status: 'success',
        message: `Query succeeded! Found: ${lobbyGame ? 'lobby game' : 'no lobby game'}`,
        details: { lobbyGame, status, statusText },
        query: "supabase.from('game_sessions').select('*').eq('is_lobby_game', true).eq('status', 'scheduled').order('created_at', { ascending: false }).limit(1).maybeSingle()"
      })
      return true
    } catch (error) {
      console.error('Query failed with exception:', error)
      updateResult('3. Exact Failing Query', {
        status: 'error',
        message: `Network/JS error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { 
          error, 
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorStack: error instanceof Error ? error.stack : 'No stack trace'
        }
      })
      return false
    }
  }

  // Test 4: Authentication context without triggering errors
  const testAuthenticationContext = async () => {
    setCurrentStep('Testing authentication context...')
    addResult({
      test: '4. Authentication Context',
      status: 'pending',
      message: 'Testing authentication state without triggering session errors...'
    })

    try {
      // Check if we can access auth without triggering session missing errors
      const authClient = supabase.auth
      
      // Try to get session without throwing errors
      let sessionResult = null
      let sessionError = null
      
      try {
        const { data: session, error } = await authClient.getSession()
        sessionResult = session
        sessionError = error
      } catch (e) {
        sessionError = e
      }

      // Try to get user without throwing errors
      let userResult = null
      let userError = null
      
      try {
        const { data: user, error } = await authClient.getUser()
        userResult = user
        userError = error
      } catch (e) {
        userError = e
      }

      if (sessionError && sessionError.message?.includes('Auth session missing')) {
        updateResult('4. Authentication Context', {
          status: 'error',
          message: `Auth session missing error detected: ${sessionError.message}`,
          details: { sessionError, userError }
        })
        return false
      }

      updateResult('4. Authentication Context', {
        status: sessionError ? 'warning' : 'success',
        message: `Auth context accessible. Session: ${sessionResult?.session ? 'present' : 'none'}, User: ${userResult?.user ? 'present' : 'none'}`,
        details: { 
          hasSession: !!sessionResult?.session, 
          hasUser: !!userResult?.user,
          sessionError: sessionError?.message,
          userError: userError?.message
        }
      })
      return true
    } catch (error) {
      updateResult('4. Authentication Context', {
        status: 'error',
        message: `Auth test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 5: Database function calls
  const testDatabaseFunctions = async () => {
    setCurrentStep('Testing database functions...')
    addResult({
      test: '5. Database Functions',
      status: 'pending',
      message: 'Testing if lobby management functions work...'
    })

    try {
      // Test ensure_lobby_game_available function
      const { data: ensureResult, error: ensureError } = await supabase
        .rpc('ensure_lobby_game_available')

      if (ensureError) {
        updateResult('5. Database Functions', {
          status: 'error',
          message: `ensure_lobby_game_available failed: ${ensureError.message}`,
          details: ensureError
        })
        return false
      }

      updateResult('5. Database Functions', {
        status: 'success',
        message: 'Database functions working correctly',
        details: { ensureResult }
      })
      return true
    } catch (error) {
      updateResult('5. Database Functions', {
        status: 'error',
        message: `Function test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Test 6: Socket.IO Server Connection
  const testSocketConnection = async () => {
    setCurrentStep('Testing Socket.IO server connection...')
    addResult({
      test: '6. Socket.IO Server',
      status: 'pending',
      message: 'Testing WebSocket server connection...'
    })

    return new Promise<boolean>((resolve) => {
      try {
        // Socket.IO is integrated with Vite server - connect to same origin
        const socketUrl = window.location.origin

        const testSocket = io(socketUrl, {
          transports: ['polling', 'websocket'],
          timeout: 10000,
          forceNew: true,
          path: '/socket.io/'
        })

        let connected = false

        testSocket.on('connect', () => {
          connected = true
          updateResult('6. Socket.IO Server', {
            status: 'success',
            message: `Successfully connected to Socket.IO server at ${socketUrl}`,
            details: { socketUrl, socketId: testSocket.id, transport: testSocket.io.engine.transport.name }
          })
          testSocket.close()
          resolve(true)
        })

        testSocket.on('connect_error', (error) => {
          updateResult('6. Socket.IO Server', {
            status: 'error',
            message: `Failed to connect: ${error.message}`,
            details: { socketUrl, error: error.message, errorType: error.name }
          })
          testSocket.close()
          resolve(false)
        })

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!connected) {
            updateResult('6. Socket.IO Server', {
              status: 'error',
              message: 'Connection timeout - server may not be running',
              details: { socketUrl, message: 'Please ensure the server is running with "npm run start"' }
            })
            testSocket.close()
            resolve(false)
          }
        }, 10000)
      } catch (error) {
        updateResult('6. Socket.IO Server', {
          status: 'error',
          message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error
        })
        resolve(false)
      }
    })
  }

  // Test 7: Socket.IO Health Endpoint
  const testSocketHealthEndpoint = async () => {
    setCurrentStep('Testing Socket.IO health endpoint...')
    addResult({
      test: '7. Socket.IO Health Check',
      status: 'pending',
      message: 'Testing server health endpoint...'
    })

    try {
      // Socket.IO is integrated with Vite - no separate health endpoint needed
      updateResult('7. Socket.IO Health Check', {
        status: 'skipped',
        message: 'Socket.IO integrated with Vite server - no separate health endpoint needed',
        details: { message: 'Socket.IO now runs on the same server as the Vite dev server' }
      })
      return true
    } catch (error) {
      updateResult('7. Socket.IO Health Check', {
        status: 'error',
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  // Legacy health endpoint test (for reference if separate server is used)
  const testSocketHealthEndpointLegacy = async () => {
    setCurrentStep('Testing Socket.IO health endpoint...')
    addResult({
      test: '7. Socket.IO Health Check',
      status: 'pending',
      message: 'Testing server health endpoint...'
    })

    try {
      const healthUrl = `${window.location.origin}/health`
      const response = await fetch(healthUrl)

      if (!response.ok) {
        updateResult('7. Socket.IO Health Check', {
          status: 'error',
          message: `Health check failed: HTTP ${response.status}`,
          details: { status: response.status, statusText: response.statusText, healthUrl }
        })
        return false
      }

      const healthData = await response.json()
      updateResult('7. Socket.IO Health Check', {
        status: 'success',
        message: `Server is healthy. Current players: ${healthData.lobbyPlayers || 0}`,
        details: { healthData, healthUrl }
      })
      return true
    } catch (error) {
      updateResult('7. Socket.IO Health Check', {
        status: 'error',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error, message: 'Server may not be running. Please run "npm run start"' }
      })
      return false
    }
  }

  const runSystematicInvestigation = async () => {
    setIsRunning(true)
    setResults([])
    setCurrentStep('Starting investigation...')

    // Run tests in priority order
    await testSocketHealthEndpoint()
    await testSocketConnection()
    await testDirectAPICall()
    await testSupabaseClientConfig()
    await testExactFailingQuery()
    await testAuthenticationContext()
    await testDatabaseFunctions()

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
          Systematic diagnosis of the authentication session missing errors
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