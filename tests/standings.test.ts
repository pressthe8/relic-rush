import { describe, expect, it } from 'vitest'
import type { FinalResult, PlayerBoard } from '../src/lib/firebase'
import { displayPlayerName, finalStandings, liveStandings, ordinal, personalStanding } from '../src/utils/standings'

const board = (playerId: string, score: number, remainingDigs = 5): PlayerBoard => ({
  id: `session_${playerId}`, playerId, mockPlayerId: 'Same display name', sessionId: 'session',
  score, remainingDigs, boardState: [], discoveries: [], subGridHints: {}, joinedAt: ''
})

describe('standings', () => {
  it('ranks confirmed scores, shares tie ranks, and keeps tied rows stable', () => {
    const boards = [board('d', 80), board('c', 100), board('a', 180), board('b', 100)]
    const first = liveStandings(boards, ['a', 'b', 'c', 'd'])
    expect(first.map(row => [row.playerId, row.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]])
    expect(liveStandings([...boards].reverse(), ['d', 'c', 'b', 'a'])).toEqual(first)
    boards[0].score = 200
    boards[0].remainingDigs = 0
    const updated = liveStandings(boards, ['a', 'b', 'c', 'd'])
    expect(updated[0]).toMatchObject({ playerId: 'd', rank: 1, remainingDigs: 0 })
    expect(personalStanding(updated, 'a')?.rank).toBe(2)
  })
  it('excludes retained departed boards and avoids ranks until all participants load', () => {
    const rows = liveStandings([board('me', 80), board('departed', 900)], ['me', 'missing'])
    expect(rows.map(row => row.playerId)).toEqual(['me', 'missing'])
    expect(rows.every(row => row.rank === null)).toBe(true)
    expect(rows[1]).toMatchObject({ score: null, remainingDigs: null })
    expect(liveStandings([board('me', 80)], [])).toEqual([])
  })
  it('identifies your result by UID, preserves authoritative final ranks, and handles absent results', () => {
    const results: FinalResult[] = [
      { ...board('opponent', 100), rank: 1, digsUsed: 10 },
      { ...board('me', 100), rank: 2, digsUsed: 10 }
    ]
    const rows = finalStandings(results)
    expect(personalStanding(rows, 'me')).toMatchObject({ playerId: 'me', rank: 2 })
    expect(personalStanding(rows, 'Same display name')).toBeUndefined()
    expect(personalStanding(rows, 'absent')).toBeUndefined()
    expect(finalStandings([])).toEqual([])
  })
  it('formats stored and generated names and correct ordinal suffixes', () => {
    expect(displayPlayerName('abcdef123')).toBe('Player abcdef')
    expect(displayPlayerName('abcdef123', 'Stored name')).toBe('Stored name')
    expect(displayPlayerName('abcdef123', 'mock_player_legacy')).toBe('Player legacy')
    expect(displayPlayerName()).toBe('Connecting…')
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st'])
  })
})
