import { useState, useCallback, useEffect, useRef } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import {
  db,
  generateMockPlayerId,
  generateGameCode,
  isValidGameCode,
  GameSession,
  PlayerBoard,
  Discovery,
  createGameSession as createFirebaseGameSession,
  getGameSession,
  getGameSessionByCode,
  updateGameSession,
  createPlayerBoard,
  getPlayerBoardsBySession,
  getPlayerBoardByMockId,
  updatePlayerBoard,
  subscribeToGameSession,
  subscribeToPlayerBoards
} from '../lib/firebase'
import { GameSettings, Position } from '../types'
import { createInitialBoard, placeTreasures, calculatePoints } from '../utils/gameLogic'
import { calculateSubGridHintsFromCentralLog } from '../utils/centralHintUtils'

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

  // Use ref instead of state to avoid triggering re-renders
  const unsubscribersRef = useRef<(() => void)[]>([])

  // Check if game should be completed
  const checkGameCompletion = useCallback(async (sessionId: string) => {
    try {
      console.log('=== CHECKING GAME COMPLETION ===')
      console.log('Session ID:', sessionId)

      // First check if session is already completed or cancelled
      const sessionData = await getGameSession(sessionId)
      if (!sessionData) {
        console.error('Session not found')
        return false
      }

      console.log('Current session status:', sessionData.status)

      if (sessionData.status === 'completed') {
        console.log('Session already marked as completed, loading final results...')

        // Load final results
        const allBoards = await getPlayerBoardsBySession(sessionId)
        const sortedBoards = allBoards.sort((a, b) => b.score - a.score)

        setState(prev => ({
          ...prev,
          gameCompleted: true,
          finalResults: sortedBoards,
          session: {
            ...sessionData,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime
          }
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
      const allBoards = await getPlayerBoardsBySession(sessionId)

      console.log('All boards in session:', allBoards)
      console.log('Board count:', allBoards.length)

      if (allBoards.length === 0) {
        console.log('No boards found, cannot complete game')
        return false
      }

      // Log each player's remaining digs
      allBoards.forEach((board, index) => {
        console.log(`Player ${index + 1} (${board.mockPlayerId}): ${board.remainingDigs} digs remaining, score: ${board.score}`)
      })

      // Check if all players have 0 remaining digs
      const allPlayersFinished = allBoards.every(board => board.remainingDigs === 0)
      console.log('All players finished?', allPlayersFinished)

      if (allPlayersFinished && allBoards.length >= 1) {
        console.log('🎉 GAME SHOULD BE COMPLETED! Updating session status...')

        // Update session status to completed
        await updateGameSession(sessionId, {
          status: 'completed',
          endTime: new Date().toISOString()
        })

        console.log('Session status updated to completed')

        // Sort players by score (highest first)
        const sortedResults = allBoards.sort((a, b) => b.score - a.score)
        console.log('Final results (sorted by score):', sortedResults)

        // Get updated session data with endTime
        const updatedSession = await getGameSession(sessionId)

        setState(prev => ({
          ...prev,
          gameCompleted: true,
          finalResults: sortedResults,
          session: updatedSession
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
      const sessionData = await getGameSession(sessionId)
      if (!sessionData) return

      // Only activate if currently waiting
      if (sessionData.status !== 'waiting') return

      // Count players in session
      const players = await getPlayerBoardsBySession(sessionId)

      // Activate if 2 or more players
      if (players.length >= 2) {
        console.log('🎮 Activating game - 2+ players joined')
        await updateGameSession(sessionId, {
          status: 'active',
          startTime: new Date().toISOString()
        })
        console.log('Game activated successfully')
      }
    } catch (error) {
      console.error('Error activating game:', error)
    }
  }, [])

  // Helper function to activate game on first move
  const activateGameOnFirstMove = useCallback(async (sessionId: string) => {
    try {
      // Get current session status
      const sessionData = await getGameSession(sessionId)
      if (!sessionData) return

      // Only activate if currently waiting
      if (sessionData.status === 'waiting') {
        console.log('🎮 Activating game - first player made a move')
        await updateGameSession(sessionId, {
          status: 'active',
          startTime: new Date().toISOString()
        })
        console.log('Game activated on first move')
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
      const session = await getGameSession(sessionId)

      if (!session) {
        throw new Error('Game session not found')
      }

      // Check if game is already completed
      if (session.status === 'completed') {
        // Load final results and show completion screen
        const allBoards = await getPlayerBoardsBySession(session.id)
        const sortedBoards = allBoards.sort((a, b) => b.score - a.score)

        setState(prev => ({
          ...prev,
          session,
          gameCompleted: true,
          finalResults: sortedBoards,
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
      let existingBoard = await getPlayerBoardByMockId(sessionId, state.mockPlayerId)

      let playerBoard = existingBoard

      if (!playerBoard) {
        // Create initial board state
        const initialBoard = createInitialBoard(session.gridSize)
        const boardWithTreasures = placeTreasures(initialBoard, session.treasurePositions)

        // Calculate sub-grid hints from central discoveries log
        console.log('🔍 Calculating initial hints from central discoveries:', session.allDiscoveries)
        const subGridHints = calculateSubGridHintsFromCentralLog(
          session.allDiscoveries || [],
          state.mockPlayerId,
          session.gridSize
        )
        console.log('🔍 Calculated initial hints for new player:', subGridHints)

        // Create player board with calculated sub-grid hints
        playerBoard = await createPlayerBoard({
          mockPlayerId: state.mockPlayerId,
          isMockPlayer: true,
          sessionId: session.id,
          boardState: boardWithTreasures,
          remainingDigs: session.digAttempts,
          score: 0,
          discoveries: [], // Keep for backward compatibility
          subGridHints: subGridHints
        })
      }

      setState(prev => ({
        ...prev,
        session,
        playerBoard,
        isLoading: false
      }))

      // Load other players
      await loadOtherPlayers(session.id, state.mockPlayerId)

      // Check if game should be activated (2+ players)
      await activateGameIfNeeded(session.id)

      // Set up real-time listeners
      setupRealtimeListeners(session.id, state.mockPlayerId)

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
        const existingSession = await getGameSessionByCode(gameCode)

        if (!existingSession) {
          codeExists = false
        } else {
          gameCode = generateGameCode()
        }
      }

      // Create game session with 'waiting' status and empty discoveries array
      const session = await createFirebaseGameSession({
        gameCode: gameCode,
        gridSize: settings.gridSize,
        treasureCount: settings.treasureCount,
        digAttempts: settings.digAttempts,
        gameSettings: settings,
        treasurePositions: treasurePositions,
        allDiscoveries: [], // Initialize empty central discoveries log
        status: 'waiting',
        isLobbyGame: false, // Mark as private game
        startTime: ''
      })

      // Create initial board state
      const initialBoard = createInitialBoard(settings.gridSize)
      const boardWithTreasures = placeTreasures(initialBoard, treasurePositions)

      // Create player board with empty sub-grid hints (no discoveries yet)
      const playerBoard = await createPlayerBoard({
        mockPlayerId: state.mockPlayerId,
        isMockPlayer: true,
        sessionId: session.id,
        boardState: boardWithTreasures,
        remainingDigs: settings.digAttempts,
        score: 0,
        discoveries: [], // Keep for backward compatibility
        subGridHints: {}
      })

      setState(prev => ({
        ...prev,
        session,
        playerBoard,
        isLoading: false
      }))

      // Set up real-time listeners
      setupRealtimeListeners(session.id, state.mockPlayerId)

      return session.gameCode
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
      const session = await getGameSessionByCode(gameCode.toUpperCase())

      if (!session) {
        setState(prev => ({
          ...prev,
          error: 'Game not found. Please check the game code.',
          isLoading: false
        }))
        return false
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
      const allPlayers = await getPlayerBoardsBySession(sessionId)
      const otherPlayers = allPlayers.filter(p => p.mockPlayerId !== currentMockPlayerId)

      setState(prev => ({
        ...prev,
        otherPlayers: otherPlayers || []
      }))
    } catch (error) {
      console.error('Failed to load other players:', error)
    }
  }, [])

  // Setup real-time listeners (replaces polling)
  const setupRealtimeListeners = useCallback((sessionId: string, currentMockPlayerId: string) => {
    console.log('🔥 Setting up real-time Firebase listeners')

    // Clean up existing listeners
    unsubscribersRef.current.forEach(unsub => unsub())

    const newUnsubscribers: (() => void)[] = []

    // Listen to session changes
    const sessionUnsub = subscribeToGameSession(sessionId, async (sessionData) => {
      if (!sessionData) return

      setState(prev => ({
        ...prev,
        session: sessionData
      }))

      // Check for game completion when session updates
      if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
        await checkGameCompletion(sessionId)
      }

      // Check if game should be activated when new players join
      await activateGameIfNeeded(sessionId)
    })

    newUnsubscribers.push(sessionUnsub)

    // Listen to all player boards
    const playersUnsub = subscribeToPlayerBoards(sessionId, async (allBoards) => {
      const ourBoard = allBoards.find(b => b.mockPlayerId === currentMockPlayerId)
      const othersBoards = allBoards.filter(b => b.mockPlayerId !== currentMockPlayerId)

      console.log('📊 Player boards update - our sub_grid_hints:', ourBoard?.subGridHints)

      setState(prev => ({
        ...prev,
        playerBoard: ourBoard || prev.playerBoard,
        otherPlayers: othersBoards
      }))

      // Check if game should be completed
      const allPlayersFinished = allBoards.every(board => board.remainingDigs === 0)
      if (allPlayersFinished && allBoards.length >= 1) {
        console.log('🚨 All players finished detected through real-time update')
        await checkGameCompletion(sessionId)
      }
    })

    newUnsubscribers.push(playersUnsub)

    unsubscribersRef.current = newUnsubscribers
  }, [checkGameCompletion, activateGameIfNeeded])

  // Stop real-time listeners
  const stopListeners = useCallback(() => {
    console.log('🛑 Stopping real-time listeners')
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []
  }, [])

  // Make a dig
  const dig = useCallback(async (position: Position) => {
    if (!state.playerBoard || !state.session || state.gameCompleted) return

    const { row, col } = position
    const currentBoard = state.playerBoard.boardState

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
    if (square.isRevealed || state.playerBoard.remainingDigs <= 0) return

    try {
      // Activate game on first move if still waiting
      await activateGameOnFirstMove(state.session.id)

      // Update local board state immediately for responsive UI
      const newBoard = JSON.parse(JSON.stringify(currentBoard))
      newBoard[row][col].isRevealed = true

      let newScore = state.playerBoard.score
      let newDigs = state.playerBoard.remainingDigs - 1
      let newDiscoveries = [...state.playerBoard.discoveries] // Keep for backward compatibility

      console.log(`🎯 Player ${state.mockPlayerId} making dig at (${row}, ${col})`)
      console.log(`Remaining digs after this move: ${newDigs}`)

      // Handle treasure discovery
      if (square.isTreasure) {
        console.log('💎 TREASURE FOUND!')

        // Get current central discoveries to calculate discovery order
        const currentAllDiscoveries = state.session.allDiscoveries || []

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

        await updateGameSession(state.session.id, {
          allDiscoveries: updatedAllDiscoveries
        })

        console.log('✅ Central discoveries log updated')

        // Update hints for all players based on new central log
        console.log('🗺️ Updating hints for all players from central log...')
        await updateAllPlayersHintsFromFirebase(
          state.session.id,
          updatedAllDiscoveries,
          state.session.gridSize
        )
      }

      // Update local state immediately for responsive UI
      setState(prev => ({
        ...prev,
        playerBoard: prev.playerBoard ? {
          ...prev.playerBoard,
          boardState: newBoard,
          remainingDigs: newDigs,
          score: newScore,
          discoveries: newDiscoveries
        } : null
      }))

      // Update player board in database
      await updatePlayerBoard(state.playerBoard.id, {
        boardState: newBoard,
        remainingDigs: newDigs,
        score: newScore,
        discoveries: newDiscoveries
      })

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
      console.error('Database update failed:', error)
      // Revert local state on database error
      setState(prev => ({
        ...prev,
        playerBoard: state.playerBoard,
        error: error instanceof Error ? error.message : 'Failed to make dig'
      }))
    }
  }, [state.playerBoard, state.session, state.gameCompleted, state.mockPlayerId, checkGameCompletion, activateGameOnFirstMove])

  // Helper function to update hints for all players (Firebase version)
  const updateAllPlayersHintsFromFirebase = async (
    sessionId: string,
    allDiscoveries: Discovery[],
    gridSize: number
  ) => {
    try {
      const allPlayers = await getPlayerBoardsBySession(sessionId)

      for (const player of allPlayers) {
        const hints = calculateSubGridHintsFromCentralLog(
          allDiscoveries,
          player.mockPlayerId || '',
          gridSize
        )

        await updatePlayerBoard(player.id, {
          subGridHints: hints
        })
      }
    } catch (error) {
      console.error('Error updating player hints:', error)
    }
  }

  // Reset game state
  const resetGame = useCallback(() => {
    stopListeners()
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
  }, [stopListeners])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListeners()
    }
  }, [stopListeners])

  // Check for active game session for the current player
  const checkForActiveGame = useCallback(async () => {
    try {
      console.log('🔍 Checking for active game with mockPlayerId:', state.mockPlayerId)

      // Get all boards for this player (mock ID)
      const playersRef = collection(db, 'playerBoards')
      const q = query(playersRef, where('mockPlayerId', '==', state.mockPlayerId))
      const snapshot = await getDocs(q)

      console.log('🔍 Found', snapshot.size, 'player boards for this ID')

      if (snapshot.empty) {
        console.log('🔍 No existing player boards found')
        return null
      }

      // Check each board to see if it belongs to an active or scheduled session
      for (const doc of snapshot.docs) {
        const boardData = doc.data()
        console.log('🔍 Checking board:', doc.id, 'sessionId:', boardData.sessionId)
        const session = await getGameSession(boardData.sessionId)

        console.log('🔍 Session status:', session?.status)

        // Skip cancelled/completed games
        if (!session || session.status === 'cancelled' || session.status === 'completed') {
          console.log('🔍 Skipping cancelled/completed session')
          continue
        }

        if (session.status === 'active') {
          console.log('🔄 Rejoining active game:', session.id)
          // For active games, load the full session
          await joinGameSession(session.id)
          return { sessionId: session.id, status: 'active' }
        } else if (session.status === 'scheduled' && session.isLobbyGame) {
          console.log('🔄 Found scheduled lobby game:', session.id)
          // For scheduled lobby games, just return the info
          // Don't call joinGameSession - let the lobby handle it
          return { sessionId: session.id, status: 'scheduled' }
        }
      }

      console.log('🔍 No active or scheduled sessions found')
      return null
    } catch (error) {
      console.error('Error checking for active game:', error)
      return null
    }
  }, [state.mockPlayerId, joinGameSession])

  return {
    ...state,
    createGameSession,
    joinGameSession, // Join by session ID (for lobby)
    joinGameSessionByCode, // Join by game code (for private games)
    dig,
    resetGame,
    checkForActiveGame
  }
}