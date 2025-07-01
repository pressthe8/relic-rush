import { useState, useCallback, useEffect } from 'react'
import { supabase, generateMockPlayerId, generateGameCode, isValidGameCode, GameSession, PlayerBoard, Discovery } from '../lib/supabase'
import { GameSettings, Position, PlayerState, SubGridHints } from '../types'
import { createInitialBoard, placeTreasures, calculatePoints } from '../utils/gameLogic'
import { calculateSubGridHintsFromCentralLog, updateAllPlayersHintsFromCentralLog } from '../utils/centralHintUtils'

interface MultiplayerGameState {
  session: GameSession | null
  playerBoard: PlayerBoard | null
  otherPlayers: PlayerBoard[]
  mockPlayerId: string
  isLoading: boolean
  error: string | null
  gameCompleted: boolean
  finalResults: PlayerBoard[] | null
}

export const useMultiplayerGame = () => {
  const [state, setState] = useState<MultiplayerGameState>({
    session: null,
    playerBoard: null,
    otherPlayers: [],
    mockPlayerId: generateMockPlayerId(),
    isLoading: false,
    error: null,
    gameCompleted: false,
    finalResults: null
  })

  // Polling interval for updates
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Check if game should be completed
  const checkGameCompletion = useCallback(async (sessionId: string) => {
    try {
      console.log('=== CHECKING GAME COMPLETION ===')
      console.log('Session ID:', sessionId)
      
      // First check if session is already completed or cancelled
      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('status, start_time, end_time')
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        console.error('Error fetching session:', sessionError)
        throw sessionError
      }

      console.log('Current session status:', sessionData.status)
      
      if (sessionData.status === 'completed') {
        console.log('Session already marked as completed, loading final results...')
        
        // Load final results
        const { data: allBoards, error: boardsError } = await supabase
          .from('player_boards')
          .select('*')
          .eq('session_id', sessionId)
          .order('score', { ascending: false })

        if (boardsError) throw boardsError

        setState(prev => ({
          ...prev,
          gameCompleted: true,
          finalResults: allBoards,
          session: prev.session ? {
            ...prev.session,
            start_time: sessionData.start_time,
            end_time: sessionData.end_time
          } : null
        }))
        
        return true
      }

      if (sessionData.status === 'cancelled') {
        console.log('Session was cancelled due to timeout')
        setState(prev => ({
          ...prev,
          error: 'Game session was cancelled due to inactivity',
          gameCompleted: true,
          finalResults: []
        }))
        return true
      }
      
      // Get all player boards for this session
      const { data: allBoards, error } = await supabase
        .from('player_boards')
        .select('*')
        .eq('session_id', sessionId)

      if (error) throw error

      console.log('All boards in session:', allBoards)
      console.log('Board count:', allBoards.length)
      
      if (allBoards.length === 0) {
        console.log('No boards found, cannot complete game')
        return false
      }

      // Log each player's remaining digs
      allBoards.forEach((board, index) => {
        console.log(`Player ${index + 1} (${board.mock_player_id}): ${board.remaining_digs} digs remaining, score: ${board.score}`)
      })

      // Check if all players have 0 remaining digs
      const allPlayersFinished = allBoards.every(board => board.remaining_digs === 0)
      console.log('All players finished?', allPlayersFinished)

      if (allPlayersFinished && allBoards.length >= 1) {
        console.log('🎉 GAME SHOULD BE COMPLETED! Updating session status...')
        
        // Update session status to completed
        const { error: updateError } = await supabase
          .from('game_sessions')
          .update({ 
            status: 'completed',
            end_time: new Date().toISOString()
          })
          .eq('id', sessionId)

        if (updateError) {
          console.error('Failed to update session status:', updateError)
          throw updateError
        }

        console.log('Session status updated to completed')

        // Sort players by score (highest first)
        const sortedResults = allBoards.sort((a, b) => b.score - a.score)
        console.log('Final results (sorted by score):', sortedResults)

        // Get updated session data with end_time
        const { data: updatedSession, error: sessionUpdateError } = await supabase
          .from('game_sessions')
          .select('start_time, end_time')
          .eq('id', sessionId)
          .single()

        if (sessionUpdateError) {
          console.error('Error fetching updated session:', sessionUpdateError)
        }

        setState(prev => ({
          ...prev,
          gameCompleted: true,
          finalResults: sortedResults,
          session: prev.session && updatedSession ? {
            ...prev.session,
            start_time: updatedSession.start_time,
            end_time: updatedSession.end_time
          } : prev.session
        }))

        console.log('Game completion state updated!')
        return true
      } else {
        console.log('Game not ready to complete yet')
        console.log('Players finished:', allPlayersFinished, 'Player count:', allBoards.length)
      }

      return false
    } catch (error) {
      console.error('Error checking game completion:', error)
      return false
    }
  }, [])

  // Helper function to activate game when conditions are met
  const activateGameIfNeeded = useCallback(async (sessionId: string) => {
    try {
      // Get current session status and player count
      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError

      // Only activate if currently waiting
      if (sessionData.status !== 'waiting') return

      // Count players in session
      const { data: players, error: playersError } = await supabase
        .from('player_boards')
        .select('id')
        .eq('session_id', sessionId)

      if (playersError) throw playersError

      // Activate if 2 or more players
      if (players.length >= 2) {
        console.log('🎮 Activating game - 2+ players joined')
        const { error: updateError } = await supabase
          .from('game_sessions')
          .update({ 
            status: 'active',
            start_time: new Date().toISOString()
          })
          .eq('id', sessionId)

        if (updateError) {
          console.error('Failed to activate game:', updateError)
        } else {
          console.log('Game activated successfully')
        }
      }
    } catch (error) {
      console.error('Error activating game:', error)
    }
  }, [])

  // Helper function to activate game on first move
  const activateGameOnFirstMove = useCallback(async (sessionId: string) => {
    try {
      // Get current session status
      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError

      // Only activate if currently waiting
      if (sessionData.status === 'waiting') {
        console.log('🎮 Activating game - first player made a move')
        const { error: updateError } = await supabase
          .from('game_sessions')
          .update({ 
            status: 'active',
            start_time: new Date().toISOString()
          })
          .eq('id', sessionId)

        if (updateError) {
          console.error('Failed to activate game:', updateError)
        } else {
          console.log('Game activated on first move')
        }
      }
    } catch (error) {
      console.error('Error activating game on first move:', error)
    }
  }, [])

  // Join an existing game session by session ID (for lobby games)
  const joinGameSession = useCallback(async (sessionId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Find session by ID
      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        throw new Error('Game session not found')
      }

      // Check if game is already completed
      if (session.status === 'completed') {
        // Load final results and show completion screen
        const { data: allBoards, error: boardsError } = await supabase
          .from('player_boards')
          .select('*')
          .eq('session_id', session.id)
          .order('score', { ascending: false })

        if (boardsError) throw boardsError

        setState(prev => ({
          ...prev,
          session,
          gameCompleted: true,
          finalResults: allBoards,
          isLoading: false
        }))

        return true
      }

      // Check if game was cancelled
      if (session.status === 'cancelled') {
        setState(prev => ({
          ...prev,
          error: 'This game session was cancelled',
          isLoading: false
        }))
        return false
      }

      // Check if we already have a board in this session
      const { data: existingBoard, error: boardCheckError } = await supabase
        .from('player_boards')
        .select('*')
        .eq('session_id', sessionId)
        .eq('mock_player_id', state.mockPlayerId)
        .maybeSingle()

      if (boardCheckError) throw boardCheckError

      let playerBoard = existingBoard

      if (!playerBoard) {
        // Create initial board state
        const initialBoard = createInitialBoard(session.grid_size)
        const boardWithTreasures = placeTreasures(initialBoard, session.treasure_positions)

        // Calculate sub-grid hints from central discoveries log
        console.log('🔍 Calculating initial hints from central discoveries:', session.all_discoveries)
        const subGridHints = calculateSubGridHintsFromCentralLog(
          session.all_discoveries || [],
          state.mockPlayerId,
          session.grid_size
        )
        console.log('🔍 Calculated initial hints for new player:', subGridHints)

        // Create player board with calculated sub-grid hints
        const { data: newPlayerBoard, error: boardError } = await supabase
          .from('player_boards')
          .insert({
            mock_player_id: state.mockPlayerId,
            is_mock_player: true,
            session_id: session.id,
            board_state: boardWithTreasures,
            remaining_digs: session.dig_attempts,
            score: 0,
            discoveries: [], // Keep for backward compatibility
            sub_grid_hints: subGridHints
          })
          .select()
          .single()

        if (boardError) throw boardError
        playerBoard = newPlayerBoard
      }

      setState(prev => ({
        ...prev,
        session,
        playerBoard,
        isLoading: false
      }))

      // Load other players and start polling
      await loadOtherPlayers(session.id, state.mockPlayerId)
      
      // Check if game should be activated (2+ players)
      await activateGameIfNeeded(session.id)
      
      startPolling(session.id, state.mockPlayerId)

      return true
    } catch (error) {
      console.error('Error joining game session:', error)
      
      // Enhanced error handling to extract user-friendly messages
      let errorMessage = 'Failed to join game session'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as any).message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
      return false
    }
  }, [state.mockPlayerId, activateGameIfNeeded])

  // Create a new game session (kept for private games)
  const createGameSession = useCallback(async (settings: GameSettings) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Generate treasure positions
      const treasurePositions = []
      const usedPositions = new Set<string>()
      
      while (treasurePositions.length < settings.treasureCount) {
        const row = Math.floor(Math.random() * settings.gridSize)
        const col = Math.floor(Math.random() * settings.gridSize)
        const key = `${row},${col}`
        
        if (!usedPositions.has(key)) {
          treasurePositions.push({ row, col })
          usedPositions.add(key)
        }
      }

      // Generate a unique game code
      let gameCode = generateGameCode()
      let codeExists = true
      
      // Keep generating until we find a unique code
      while (codeExists) {
        const { data: existingSession } = await supabase
          .from('game_sessions')
          .select('id')
          .eq('game_code', gameCode)
          .maybeSingle()
        
        if (!existingSession) {
          codeExists = false
        } else {
          gameCode = generateGameCode()
        }
      }

      // Create game session with 'waiting' status and empty discoveries array
      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          game_code: gameCode,
          grid_size: settings.gridSize,
          treasure_count: settings.treasureCount,
          dig_attempts: settings.digAttempts,
          game_settings: settings,
          treasure_positions: treasurePositions,
          all_discoveries: [], // Initialize empty central discoveries log
          status: 'waiting',
          is_lobby_game: false // Mark as private game
        })
        .select()
        .single()

      if (sessionError) throw sessionError

      // Create initial board state
      const initialBoard = createInitialBoard(settings.gridSize)
      const boardWithTreasures = placeTreasures(initialBoard, treasurePositions)

      // Create player board with empty sub-grid hints (no discoveries yet)
      const { data: playerBoard, error: boardError } = await supabase
        .from('player_boards')
        .insert({
          mock_player_id: state.mockPlayerId,
          is_mock_player: true,
          session_id: session.id,
          board_state: boardWithTreasures,
          remaining_digs: settings.digAttempts,
          score: 0,
          discoveries: [], // Keep for backward compatibility
          sub_grid_hints: {}
        })
        .select()
        .single()

      if (boardError) throw boardError

      setState(prev => ({
        ...prev,
        session,
        playerBoard,
        isLoading: false
      }))

      // Start polling for updates
      startPolling(session.id, state.mockPlayerId)

      return session.game_code
    } catch (error) {
      console.error('Error creating game session:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create game session',
        isLoading: false
      }))
      return null
    }
  }, [state.mockPlayerId])

  // Join an existing game session by game code (kept for private games)
  const joinGameSessionByCode = useCallback(async (gameCode: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Validate game code format
      if (!isValidGameCode(gameCode)) {
        setState(prev => ({
          ...prev,
          error: 'Invalid game code format. Please enter a 6-character code (e.g., ABC123)',
          isLoading: false
        }))
        return false
      }

      // Find session by game code (case-insensitive)
      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .ilike('game_code', gameCode.toUpperCase())
        .single()

      if (sessionError) {
        if (sessionError.code === 'PGRST116') {
          setState(prev => ({
            ...prev,
            error: 'Game not found. Please check the game code.',
            isLoading: false
          }))
          return false
        }
        throw sessionError
      }

      return await joinGameSession(session.id)
    } catch (error) {
      console.error('Error joining game session by code:', error)
      
      let errorMessage = 'Failed to join game session'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as any).message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
      return false
    }
  }, [joinGameSession])

  // Load other players in the session
  const loadOtherPlayers = useCallback(async (sessionId: string, currentMockPlayerId: string) => {
    try {
      const { data: otherPlayers, error } = await supabase
        .from('player_boards')
        .select('*')
        .eq('session_id', sessionId)
        .neq('mock_player_id', currentMockPlayerId)

      if (error) throw error

      setState(prev => ({
        ...prev,
        otherPlayers: otherPlayers || []
      }))
    } catch (error) {
      console.error('Failed to load other players:', error)
    }
  }, [])

  // Start polling for updates
  const startPolling = useCallback((sessionId: string, currentMockPlayerId: string) => {
    // Clear any existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    const interval = setInterval(async () => {
      try {
        // Check if game should be completed first
        const gameCompleted = await checkGameCompletion(sessionId)
        
        // If game is completed, stop polling
        if (gameCompleted) {
          clearInterval(interval)
          setPollingInterval(null)
          return
        }

        // Update session data (including central discoveries)
        const { data: sessionData, error: sessionError } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('id', sessionId)
          .single()

        if (sessionError) throw sessionError

        // Update other players
        const { data: otherPlayers, error: playersError } = await supabase
          .from('player_boards')
          .select('*')
          .eq('session_id', sessionId)
          .neq('mock_player_id', currentMockPlayerId)

        if (playersError) throw playersError

        // Update our own board state
        const { data: ourBoard, error: boardError } = await supabase
          .from('player_boards')
          .select('*')
          .eq('session_id', sessionId)
          .eq('mock_player_id', currentMockPlayerId)
          .single()

        if (boardError) throw boardError

        console.log('📊 Polling update - our board sub_grid_hints:', ourBoard.sub_grid_hints)

        setState(prev => ({
          ...prev,
          session: sessionData,
          otherPlayers: otherPlayers || [],
          playerBoard: ourBoard
        }))

        // Check if game should be activated when new players join
        await activateGameIfNeeded(sessionId)

      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 1000) // Poll every 1 second for faster completion detection

    setPollingInterval(interval)
  }, [pollingInterval, checkGameCompletion, activateGameIfNeeded])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
  }, [pollingInterval])

  // Make a dig
  const dig = useCallback(async (position: Position) => {
    if (!state.playerBoard || !state.session || state.gameCompleted) return

    const { row, col } = position
    const currentBoard = state.playerBoard.board_state

    // Validation checks
    if (!currentBoard || !Array.isArray(currentBoard) || 
        !currentBoard[row] || !Array.isArray(currentBoard[row]) || 
        !currentBoard[row][col]) {
      setState(prev => ({
        ...prev,
        error: 'Invalid board state detected. Please refresh the game.'
      }))
      return
    }

    const square = currentBoard[row][col]

    // Check if already revealed or no digs remaining
    if (square.isRevealed || state.playerBoard.remaining_digs <= 0) return

    try {
      // Activate game on first move if still waiting
      await activateGameOnFirstMove(state.session.id)

      // Update local board state immediately for responsive UI
      const newBoard = JSON.parse(JSON.stringify(currentBoard))
      newBoard[row][col].isRevealed = true

      let newScore = state.playerBoard.score
      let newDigs = state.playerBoard.remaining_digs - 1
      let newDiscoveries = [...state.playerBoard.discoveries] // Keep for backward compatibility

      console.log(`🎯 Player ${state.mockPlayerId} making dig at (${row}, ${col})`)
      console.log(`Remaining digs after this move: ${newDigs}`)

      // Handle treasure discovery
      if (square.isTreasure) {
        console.log('💎 TREASURE FOUND!')
        
        // Get current central discoveries to calculate discovery order
        const currentAllDiscoveries = state.session.all_discoveries || []
        
        // Check how many times this treasure has been discovered
        const treasureDiscoveries = currentAllDiscoveries.filter(
          (discovery: Discovery) => discovery.row === row && discovery.col === col
        )

        const discoveryCount = treasureDiscoveries.length + 1
        const points = calculatePoints(discoveryCount)
        
        newScore += points
        newDigs++ // Bonus dig for finding treasure
        
        // Create new discovery for central log
        const newDiscovery: Discovery = {
          playerId: state.mockPlayerId,
          row,
          col,
          points,
          timestamp: new Date().toISOString(),
          discoveryOrder: discoveryCount
        }

        // Create discovery for backward compatibility
        const legacyDiscovery = {
          row,
          col,
          points,
          discoveryOrder: discoveryCount,
          timestamp: new Date().toISOString()
        }
        
        newDiscoveries.push(legacyDiscovery)

        console.log('💎 New discovery:', newDiscovery)
        console.log(`Treasure found! Bonus dig granted. New remaining digs: ${newDigs}`)

        // Update central discoveries log in game session
        const updatedAllDiscoveries = [...currentAllDiscoveries, newDiscovery]
        
        const { error: sessionUpdateError } = await supabase
          .from('game_sessions')
          .update({
            all_discoveries: updatedAllDiscoveries
          })
          .eq('id', state.session.id)

        if (sessionUpdateError) {
          console.error('Failed to update central discoveries:', sessionUpdateError)
          throw sessionUpdateError
        }

        console.log('✅ Central discoveries log updated')

        // Update hints for all players based on new central log
        console.log('🗺️ Updating hints for all players from central log...')
        await updateAllPlayersHintsFromCentralLog(
          supabase,
          state.session.id,
          updatedAllDiscoveries,
          state.session.grid_size
        )
      }

      // Update local state immediately for responsive UI
      setState(prev => ({
        ...prev,
        playerBoard: prev.playerBoard ? {
          ...prev.playerBoard,
          board_state: newBoard,
          remaining_digs: newDigs,
          score: newScore,
          discoveries: newDiscoveries
        } : null
      }))

      // Update player board in database
      const { error } = await supabase
        .from('player_boards')
        .update({
          board_state: newBoard,
          remaining_digs: newDigs,
          score: newScore,
          discoveries: newDiscoveries
        })
        .eq('id', state.playerBoard.id)

      if (error) {
        console.error('Database update failed:', error)
        // Revert local state on database error
        setState(prev => ({
          ...prev,
          playerBoard: state.playerBoard,
          error: 'Failed to save move. Please try again.'
        }))
        throw error
      }

      console.log('✅ Player board updated successfully')

      // Check if this player just finished their last dig
      if (newDigs === 0) {
        console.log('🚨 Player finished their last dig! Triggering immediate completion check...')
        // Trigger immediate game completion check with a short delay
        setTimeout(() => {
          console.log('Running immediate completion check...')
          checkGameCompletion(state.session!.id)
        }, 500)
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to make dig'
      }))
    }
  }, [state.playerBoard, state.session, state.gameCompleted, state.mockPlayerId, checkGameCompletion, activateGameOnFirstMove])

  // Reset game state
  const resetGame = useCallback(() => {
    stopPolling()
    setState({
      session: null,
      playerBoard: null,
      otherPlayers: [],
      mockPlayerId: generateMockPlayerId(),
      isLoading: false,
      error: null,
      gameCompleted: false,
      finalResults: null
    })
  }, [stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  return {
    ...state,
    createGameSession,
    joinGameSession, // Join by session ID (for lobby)
    joinGameSessionByCode, // Join by game code (for private games)
    dig,
    resetGame
  }
}