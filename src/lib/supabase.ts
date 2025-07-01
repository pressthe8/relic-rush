import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey
    }
  }
})

// Connection state management
let connectionState: 'unknown' | 'connected' | 'failed' = 'unknown'
let lastConnectionTest = 0
const CONNECTION_TEST_COOLDOWN = 5000 // 5 seconds

// Test Supabase connection with caching
export const testSupabaseConnection = async (): Promise<boolean> => {
  const now = Date.now()
  
  // Return cached result if within cooldown period
  if (connectionState !== 'unknown' && (now - lastConnectionTest) < CONNECTION_TEST_COOLDOWN) {
    return connectionState === 'connected'
  }

  try {
    console.log('🔍 Testing Supabase connectivity...')
    const { error } = await supabase
      .from('game_sessions')
      .select('id')
      .limit(1)
    
    if (error) {
      console.error('❌ Connection test failed:', error)
      connectionState = 'failed'
      lastConnectionTest = now
      return false
    }
    
    console.log('✅ Connection test successful')
    connectionState = 'connected'
    lastConnectionTest = now
    return true
  } catch (error) {
    console.error('❌ Connection test failed:', error)
    connectionState = 'failed'
    lastConnectionTest = now
    return false
  }
}

// Reset connection state (useful for manual retry)
export const resetConnectionState = () => {
  connectionState = 'unknown'
  lastConnectionTest = 0
}

// Generate a mock player ID for testing
export const generateMockPlayerId = (): string => {
  return `mock_player_${Math.random().toString(36).substr(2, 8)}`
}

// Generate a simple 6-character game code (3 letters + 3 numbers)
export const generateGameCode = (): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  
  let code = ''
  
  // Add 3 random letters
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length))
  }
  
  // Add 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length))
  }
  
  return code
}

// Validate game code format (3 letters + 3 numbers)
export const isValidGameCode = (code: string): boolean => {
  const gameCodeRegex = /^[A-Z]{3}[0-9]{3}$/i
  return gameCodeRegex.test(code.trim())
}

// Import Square type for better type safety
import { Square, SubGridHints } from '../types'

// Discovery type for central game log
export interface Discovery {
  playerId: string
  row: number
  col: number
  points: number
  timestamp: string
  discoveryOrder: number
}

// Database types
export interface GameSession {
  id: string
  game_code?: string
  grid_size: number
  treasure_count: number
  dig_attempts: number
  game_settings: any
  treasure_positions: any[]
  all_discoveries: Discovery[]
  start_time: string
  end_time?: string
  last_updated: string
  status: 'waiting' | 'active' | 'completed' | 'cancelled'
  created_at: string
}

export interface PlayerBoard {
  id: string
  player_id?: string
  mock_player_id?: string
  is_mock_player: boolean
  session_id: string
  board_state: Square[][]
  remaining_digs: number
  score: number
  discoveries: any[] // Keep for backward compatibility
  sub_grid_hints: SubGridHints
  joined_at: string
}