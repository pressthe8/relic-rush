import type { PlayerBoard } from '../lib/firebase'

// A socket confirmation can arrive before Firestore's snapshot of the same dig.
export function mergeBoardUpdates(current: PlayerBoard[], incoming: PlayerBoard[]): PlayerBoard[] {
  const merged = new Map(current.map(board => [board.id, board]))
  for (const board of incoming) {
    const previous = merged.get(board.id)
    if (!previous || (board.acceptedMoves || 0) >= (previous.acceptedMoves || 0)) merged.set(board.id, board)
  }
  return [...merged.values()]
}
