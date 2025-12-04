import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, RefreshCw, Database, ExternalLink, Copy, Check } from 'lucide-react'

interface TestResult {
  test: string
  status: 'success' | 'error' | 'warning' | 'pending'
  message: string
  details?: any
}

export const SupabaseConnectionTest: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [envVars, setEnvVars] = useState({
    url: '',
    key: '',
    hasUrl: false,
    hasKey: false
  })
  const [copied, setCopied] = useState(false)

  const addResult = (result: TestResult) => {
    setResults(prev => [...prev, result])
  }

  const updateResult = (testName: string, updates: Partial<TestResult>) => {
    setResults(prev => prev.map(r => 
      r.test === testName ? { ...r, ...updates } : r
    ))
  }

  const checkEnvironmentVariables = () => {
    const url = import.meta.env.VITE_SUPABASE_URL || ''
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    
    setEnvVars({
      url,
      key,
      hasUrl: !!url,
      hasKey: !!key
    })

    if (!url || !key) {
      addResult({
        test: 'Environment Variables',
        status: 'error',
        message: 'Missing required environment variables',
        details: { 
          VITE_SUPABASE_URL: url ? 'Present' : 'Missing',
          VITE_SUPABASE_ANON_KEY: key ? 'Present' : 'Missing'
        }
      })
      return false
    } else {
      addResult({
        test: 'Environment Variables',
        status: 'success',
        message: 'Environment variables configured',
        details: { 
          url: url.substring(0, 50) + '...', 
          keyLength: key.length 
        }
      })
      return true
    }
  }

  const testBasicConnection = async () => {
    addResult({
      test: 'Basic Connection',
      status: 'pending',
      message: 'Testing connection to Supabase...'
    })

    try {
      // Simple health check
      const response = await fetch(`${envVars.url}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': envVars.key,
          'Authorization': `Bearer ${envVars.key}`
        }
      })

      if (response.ok) {
        updateResult('Basic Connection', {
          status: 'success',
          message: 'Successfully connected to Supabase API'
        })
        return true
      } else {
        updateResult('Basic Connection', {
          status: 'error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText }
        })
        return false
      }
    } catch (error) {
      updateResult('Basic Connection', {
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  const testTableAccess = async () => {
    addResult({
      test: 'Table Access',
      status: 'pending',
      message: 'Testing database table access...'
    })

    try {
      // Test game_sessions table
      const { data: gameSessionsData, error: gameSessionsError } = await supabase
        .from('game_sessions')
        .select('id')
        .limit(1)

      if (gameSessionsError) {
        updateResult('Table Access', {
          status: 'error',
          message: `Cannot access game_sessions table: ${gameSessionsError.message}`,
          details: gameSessionsError
        })
        return false
      }

      // Test player_boards table
      const { data: playerBoardsData, error: playerBoardsError } = await supabase
        .from('player_boards')
        .select('id')
        .limit(1)

      if (playerBoardsError) {
        updateResult('Table Access', {
          status: 'error',
          message: `Cannot access player_boards table: ${playerBoardsError.message}`,
          details: playerBoardsError
        })
        return false
      }

      updateResult('Table Access', {
        status: 'success',
        message: 'All required tables accessible'
      })
      return true
    } catch (error) {
      updateResult('Table Access', {
        status: 'error',
        message: `Table access failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  const testLobbyFunctionality = async () => {
    addResult({
      test: 'Lobby Functions',
      status: 'pending',
      message: 'Testing lobby game functions...'
    })

    try {
      // Test lobby game query
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('is_lobby_game', true)
        .eq('status', 'scheduled')
        .limit(1)

      if (lobbyError) {
        updateResult('Lobby Functions', {
          status: 'error',
          message: `Lobby query failed: ${lobbyError.message}`,
          details: lobbyError
        })
        return false
      }

      // Test function call
      const { data: functionData, error: functionError } = await supabase
        .rpc('ensure_lobby_game_available')

      if (functionError) {
        updateResult('Lobby Functions', {
          status: 'warning',
          message: `Function call failed (may need database setup): ${functionError.message}`,
          details: functionError
        })
        return false
      }

      updateResult('Lobby Functions', {
        status: 'success',
        message: `Lobby system working. Found ${lobbyData?.length || 0} scheduled games`,
        details: { lobbyGames: lobbyData?.length, functionResult: functionData }
      })
      return true
    } catch (error) {
      updateResult('Lobby Functions', {
        status: 'error',
        message: `Lobby test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      })
      return false
    }
  }

  const runAllTests = async () => {
    setIsRunning(true)
    setResults([])

    // Step 1: Check environment variables
    const hasEnvVars = checkEnvironmentVariables()
    if (!hasEnvVars) {
      setIsRunning(false)
      return
    }

    // Step 2: Test basic connection
    const hasConnection = await testBasicConnection()
    if (!hasConnection) {
      setIsRunning(false)
      return
    }

    // Step 3: Test table access
    const hasTableAccess = await testTableAccess()
    if (!hasTableAccess) {
      setIsRunning(false)
      return
    }

    // Step 4: Test lobby functionality
    await testLobbyFunctionality()

    setIsRunning(false)
  }

  const copyEnvTemplate = async () => {
    const template = `# Add these to your .env file in the project root
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here`

    await navigator.clipboard.writeText(template)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    runAllTests()
  }, [])

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
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const hasErrors = results.some(r => r.status === 'error')
  const allPassed = results.length > 0 && results.every(r => r.status === 'success')

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Database className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800">Supabase Connection Test</h2>
        </div>
        <p className="text-gray-600">
          Testing database connection and setup
        </p>
      </div>

      {/* Environment Variables Status */}
      {(!envVars.hasUrl || !envVars.hasKey) && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-4">⚠️ Setup Required</h3>
          <p className="text-red-700 mb-4">
            Missing environment variables. You need to set up your Supabase credentials.
          </p>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-red-800 mb-2">Steps to fix:</h4>
              <ol className="list-decimal list-inside space-y-2 text-red-700 text-sm">
                <li>Create a Supabase project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a></li>
                <li>Go to Settings → API in your Supabase dashboard</li>
                <li>Copy your Project URL and anon public key</li>
                <li>Create a <code className="bg-red-100 px-1 rounded">.env</code> file in your project root</li>
                <li>Add the environment variables shown below</li>
              </ol>
            </div>

            <div className="bg-red-100 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-red-800">Environment Variables Template:</h5>
                <button
                  onClick={copyEnvTemplate}
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs text-red-800 whitespace-pre-wrap">
{`# Add these to your .env file in the project root
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
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
                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Testing...' : 'Run Tests'}
        </button>

        {hasErrors && (
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Create Supabase Project
          </a>
        )}
      </div>

      {/* Status Summary */}
      {results.length > 0 && (
        <div className="text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
            allPassed ? 'bg-green-100 text-green-800' : 
            hasErrors ? 'bg-red-100 text-red-800' : 
            'bg-yellow-100 text-yellow-800'
          }`}>
            {allPassed ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">All tests passed! ✅</span>
              </>
            ) : hasErrors ? (
              <>
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {results.filter(r => r.status === 'error').length} test(s) failed
                </span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span className="text-sm font-medium">Tests in progress...</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}