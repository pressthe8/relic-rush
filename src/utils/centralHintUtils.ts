import { Discovery } from '../lib/firebase'
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