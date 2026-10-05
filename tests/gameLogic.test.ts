import { describe, expect, it } from 'vitest'
import { calculatePoints, createInitialBoard, generateTreasurePositions, placeTreasures } from '../src/utils/gameLogic'
import { calculateSubGridHintsFromCentralLog } from '../src/utils/centralHintUtils'
import { getSubGridBounds, getSubGridIndex } from '../src/utils/subGridUtils'
import type { Discovery } from '../src/lib/firebase'

describe('game mechanics', () => {
  it('awards declining points and never negative points', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(calculatePoints)).toEqual([100, 80, 60, 40, 20, 0, 0])
  })
  it('places unique treasures in bounds for every supported board size', () => {
    for (const size of [6, 9, 12]) {
      const positions = generateTreasurePositions(size, size * size)
      expect(new Set(positions.map(p => `${p.row},${p.col}`)).size).toBe(size * size)
      expect(positions.every(p => p.row >= 0 && p.row < size && p.col >= 0 && p.col < size)).toBe(true)
    }
    expect(() => generateTreasurePositions(6, 37)).toThrow()
  })
  it('does not mutate the original board or share its square objects', () => {
    const board = createInitialBoard(6)
    const treasures = placeTreasures(board, [{ row: 0, col: 0 }])
    expect(board[0][0].isTreasure).toBe(false)
    treasures[1][1].isRevealed = true
    expect(board[1][1].isRevealed).toBe(false)
  })
  it('counts unique opposing finds and removes hints for treasures already found by me', () => {
    const discovery = (playerId: string, row: number, col: number): Discovery => ({ playerId, row, col, points: 100, discoveryOrder: 1, timestamp: '' })
    const log = [discovery('a', 0, 0), discovery('b', 0, 0), discovery('a', 1, 1), discovery('a', 5, 5)]
    expect(calculateSubGridHintsFromCentralLog(log, 'me', 6)).toEqual({ 0: 2, 8: 1 })
    log.push(discovery('me', 0, 0), discovery('me', 1, 1))
    expect(calculateSubGridHintsFromCentralLog(log, 'me', 6)).toEqual({ 8: 1 })
  })
  it('maps every supported board into nine non-overlapping regions', () => {
    for (const size of [6, 9, 12]) for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      const bounds = getSubGridBounds(getSubGridIndex({ row, col }, size), size)
      expect(row >= bounds.startRow && row <= bounds.endRow && col >= bounds.startCol && col <= bounds.endCol).toBe(true)
    }
  })
})
