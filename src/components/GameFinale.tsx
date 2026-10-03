import { RotateCcw, ArrowLeft } from 'lucide-react'
import type { FinalResult } from '../lib/firebase'
import { finalStandings, ordinal, personalStanding } from '../utils/standings'
import { Standings, YouBadge } from './Standings'

interface GameFinaleProps {
  finalResults: FinalResult[]
  currentPlayerId: string
  onPlayAgain: () => void
  onBackToMenu: () => void
  completionReason?: string
}

export function GameFinale({ finalResults, currentPlayerId, onPlayAgain, onBackToMenu, completionReason }: GameFinaleProps) {
  const cancelled = completionReason === 'not-enough-players'
  const rows = finalStandings(finalResults)
  const own = personalStanding(rows, currentPlayerId)
  const tied = own?.rank != null && rows.filter(row => row.rank === own.rank).length > 1
  return <section className="w-full" aria-label="Game results">
    <div className="mb-5"><p className="stage-kicker">{cancelled ? 'Next time' : 'Hunt complete'}</p>
      <h1 className="stage-heading">{cancelled ? 'Game Cancelled' : 'Game Complete!'}</h1>
      <p className="mt-2 text-sm text-gray-600">{cancelled ? 'At least two players are needed. A new lobby is ready.' : completionReason === 'deadline' ? 'Time is up! Here are your final scores.' : 'Everyone has used their digs.'}</p>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-2">
      <div>
        {!cancelled && <section className="game-panel border-emerald-400 p-6" aria-label="Your result">
          <p className="stage-kicker">Your result</p>
          <h2 className="text-xl font-bold">{own?.rank ? `You finished ${tied ? 'joint ' : ''}${ordinal(own.rank)}` : 'Your result is unavailable'}</h2>
          {own && <><p className="my-5 text-6xl font-bold tracking-tight text-emerald-700" aria-hidden="true">{own.rank ? ordinal(own.rank) : '—'}</p>
            <p className="break-words text-sm font-semibold">{own.displayName} <YouBadge /></p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-emerald-100 pt-5">
              <div className="flex flex-col"><dt className="order-2 text-xs text-gray-600">points earned</dt><dd className="order-1 text-3xl font-bold tabular-nums">{own.score}</dd></div>
              <div className="flex flex-col"><dt className="order-2 text-xs text-gray-600">treasures found</dt><dd className="order-1 text-3xl font-bold tabular-nums">{own.treasures} / 5</dd></div>
            </dl></>}
        </section>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={onPlayAgain} className="game-button"><RotateCcw size={17} />Play Again</button>
          <button onClick={onBackToMenu} className="game-button-secondary"><ArrowLeft size={17} />Back to Menu</button>
        </div>
      </div>
      {!cancelled && <Standings rows={rows} currentPlayerId={currentPlayerId} final />}
    </div>
  </section>
}
