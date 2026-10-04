import { describe, expect, it } from 'vitest'
import { mergeBoardUpdates } from '../src/utils/boardUpdates'
import type { PlayerBoard } from '../src/lib/firebase'

const board = (id: string, acceptedMoves: number): PlayerBoard => ({
  id, acceptedMoves, sessionId: 'match', playerId: id,
  boardState: [[{ isRevealed: acceptedMoves > 0, isTreasure: false, discoveryCount: 0 }]],
  score: 0, remainingDigs: 10 - acceptedMoves, discoveries: [], subGridHints: {}, joinedAt: ''
})
describe('committed board updates', () => {
  it('keeps an acknowledged dig when an older snapshot arrives, then accepts newer progress', () => {
    const committed = board('alice', 1)
    expect(mergeBoardUpdates([committed], [board('alice', 0), board('bob', 0)])[0]).toEqual(committed)
    expect(mergeBoardUpdates([committed], [board('alice', 2)])[0].remainingDigs).toBe(8)
  })
  it('accepts score and standings updates with an unchanged move count', () => {
    expect(mergeBoardUpdates([board('alice', 1)], [{ ...board('alice', 1), score: 100 }])[0].score).toBe(100)
  })
})
