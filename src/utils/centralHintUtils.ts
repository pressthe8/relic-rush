import { Discovery } from '../lib/supabase'
import { SubGridHints } from '../types'
import { getSubGridIndex } from './subGridUtils'

/**
 * Calculate sub-grid hints using discovery gap logic from central game log
 * Hint intensity = unique treasure positions others found that I haven't found
 */
export const calculateSubGridHintsFromCentralLog = (
  allDiscoveries: Discovery[],
  currentPlayerId: string,
  gridSize: number
): SubGridHints => {
  console.log('🗺️ Calculating hints from central log...')
  console.log('All discoveries:', allDiscoveries)
  console.log('Current player:', currentPlayerId)
  console.log('Grid size:', gridSize)
  
  const hints: SubGridHints = {}
  
  // Group discoveries by sub-grid
  const subGridDiscoveries: { [subGridIndex: number]: Discovery[] } = {}
  
  allDiscoveries.forEach(discovery => {
    const subGridIndex = getSubGridIndex({ row: discovery.row, col: discovery.col }, gridSize)
    if (!subGridDiscoveries[subGridIndex]) {
      subGridDiscoveries[subGridIndex] = []
    }
    subGridDiscoveries[subGridIndex].push(discovery)
  })
  
  // Calculate discovery gap for each sub-grid
  Object.keys(subGridDiscoveries).forEach(subGridIndexStr => {
    const subGridIndex = parseInt(subGridIndexStr)
    const discoveries = subGridDiscoveries[subGridIndex]
    
    // Get unique treasure positions found by others
    const otherPlayersPositions = new Set<string>()
    discoveries
      .filter(d => d.playerId !== currentPlayerId)
      .forEach(d => {
        otherPlayersPositions.add(`${d.row},${d.col}`)
      })
    
    // Get unique treasure positions found by current player
    const myPositions = new Set<string>()
    discoveries
      .filter(d => d.playerId === currentPlayerId)
      .forEach(d => {
        myPositions.add(`${d.row},${d.col}`)
      })
    
    // Calculate discovery gap: unique positions others found that I haven't
    let discoveryGap = 0
    otherPlayersPositions.forEach(position => {
      if (!myPositions.has(position)) {
        discoveryGap++
      }
    })
    
    console.log(`Sub-grid ${subGridIndex}:`)
    console.log(`  Others found positions: [${Array.from(otherPlayersPositions).join(', ')}]`)
    console.log(`  I found positions: [${Array.from(myPositions).join(', ')}]`)
    console.log(`  Discovery gap: ${discoveryGap}`)
    
    // Only show hint if there's a gap (others have found treasures I haven't)
    if (discoveryGap > 0) {
      hints[subGridIndex] = discoveryGap
    }
  })
  
  console.log('Final calculated hints:', hints)
  return hints
}

/**
 * Update sub-grid hints for all players based on central discoveries
 * This replaces the complex cross-table logic with a simple calculation
 */
export const updateAllPlayersHintsFromCentralLog = async (
  supabase: any,
  sessionId: string,
  allDiscoveries: Discovery[],
  gridSize: number
) => {
  try {
    console.log('🗺️ === UPDATING ALL PLAYER HINTS FROM CENTRAL LOG ===')
    console.log('Session ID:', sessionId)
    console.log('All discoveries:', allDiscoveries)
    
    // Get all players in the session
    const { data: allPlayers, error: playersError } = await supabase
      .from('player_boards')
      .select('*')
      .eq('session_id', sessionId)

    if (playersError) {
      console.error('Error fetching players:', playersError)
      throw playersError
    }

    console.log('Found', allPlayers.length, 'players in session')

    // Update each player's sub-grid hints
    for (const player of allPlayers) {
      console.log(`\n--- Processing hints for player ${player.mock_player_id} ---`)
      const hintsForThisPlayer = calculateSubGridHintsFromCentralLog(
        allDiscoveries,
        player.mock_player_id,
        gridSize
      )
      
      console.log(`Updating hints for player ${player.mock_player_id}:`, hintsForThisPlayer)
      
      const { error: updateError } = await supabase
        .from('player_boards')
        .update({ sub_grid_hints: hintsForThisPlayer })
        .eq('id', player.id)

      if (updateError) {
        console.error('Failed to update sub-grid hints for player:', player.mock_player_id, updateError)
      } else {
        console.log(`✅ Successfully updated hints for ${player.mock_player_id}`)
      }
    }
    
    console.log('✅ === CENTRAL LOG HINTS UPDATE COMPLETE ===')
  } catch (error) {
    console.error('Error updating hints from central log:', error)
  }
}