import type { FinalResult, PlayerBoard } from '../lib/firebase'

export interface Standing {
  playerId: string
  displayName: string
  score: number | null
  remainingDigs: number | null
  treasures: number | null
  rank: number | null
}

export function displayPlayerName(playerId?: string, storedName?: string) {
  return storedName?.trim().replace(/^mock_player_/, 'Player ') || (playerId ? `Player ${playerId.slice(0, 6)}` : 'Connecting…')
}

export function ordinal(rank: number) {
  const lastTwo = rank % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] || 'th')
  return `${rank}${suffix}`
}

export function liveStandings(boards: PlayerBoard[], participantIds: string[]): Standing[] {
  const byPlayer = new Map(boards.filter(board => board.playerId).map(board => [board.playerId, board]))
  const complete = participantIds.every(id => byPlayer.has(id))
  const rows = [...new Set(participantIds)].map(playerId => {
    const board = byPlayer.get(playerId)
    return { playerId, displayName: displayPlayerName(playerId, board?.mockPlayerId),
      score: board?.score ?? null, remainingDigs: board?.remainingDigs ?? null,
      treasures: board?.discoveries.length ?? null, rank: null as number | null }
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
  return rows.map(row => ({ ...row, rank: complete ? rows.findIndex(other => other.score === row.score) + 1 : null }))
}

export function finalStandings(results: FinalResult[]): Standing[] {
  return results.map(result => ({ playerId: result.playerId || result.id,
    displayName: displayPlayerName(result.playerId, result.mockPlayerId), score: result.score,
    remainingDigs: result.remainingDigs, treasures: result.discoveries.length,
    rank: Number.isInteger(result.rank) && result.rank > 0 ? result.rank : null
  })).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
}

export const personalStanding = (standings: Standing[], uid: string) => standings.find(row => row.playerId === uid)
