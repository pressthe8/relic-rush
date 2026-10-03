import { Fragment, useEffect, useState } from 'react'
import { Gem, Check } from 'lucide-react'
import { Square } from './Square'
import type { PlayerBoard } from '../lib/firebase'
import type { Position } from '../types'
import type { Standing } from '../utils/standings'
import { ordinal } from '../utils/standings'
import { getHintIntensityClass } from '../utils/subGridUtils'
import { Standings } from './Standings'
import { CountdownTimer } from './CountdownTimer'
import { GameCode } from './GameCode'

interface MultiplayerBoardProps {
  playerBoard: PlayerBoard
  standings: Standing[]
  currentPlayerId: string
  currentRank: number | null
  onDig: (position: Position) => void
  isLoading: boolean
  gameCode?: string
  deadline?: string
  clockOffset?: number
}

export function MultiplayerBoard({ playerBoard, standings, currentPlayerId, currentRank, onDig, isLoading, gameCode, deadline, clockOffset = 0 }: MultiplayerBoardProps) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const update = () => setExpired(!!deadline && Date.now() + clockOffset >= Date.parse(deadline))
    update()
    const timer = setInterval(update, 250)
    return () => clearInterval(timer)
  }, [deadline, clockOffset])
  const boardSize = playerBoard.boardState.length
  const latest = playerBoard.discoveries[playerBoard.discoveries.length - 1]
  const outOfDigs = playerBoard.remainingDigs <= 0
  return <section className="w-full" aria-label="Active match">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="stage-kicker">The hunt is on</p><h1 className="stage-heading">Make every dig count.</h1></div>
      {gameCode && <GameCode code={gameCode} />}
    </div>
    <div className="match-layout">
          <div className="match-hud game-panel sticky top-0 z-20 grid grid-cols-[1.1fr_1fr_1fr] gap-2 !rounded-b-none px-3 py-3" aria-label="Your match stats">
            <div className="min-w-0 border-r border-emerald-100 pr-2">{deadline ? <CountdownTimer inline targetTime={deadline} clockOffset={clockOffset} label="Time left" expiredText="Match ended. Confirming results…" /> : <><span className="text-[11px] text-gray-600">Time left</span><p className="text-2xl">—</p></>}</div>
            <div className="min-w-0 border-r border-emerald-100 pr-1"><p className="text-[11px] text-gray-600">Your score</p>
              <p className="mt-1 flex items-baseline gap-1 whitespace-nowrap"><strong className="text-2xl leading-tight tabular-nums">{playerBoard.score}</strong><span data-testid="mobile-rank" aria-label={currentRank ? `Rank: ${ordinal(currentRank)}` : 'Rank loading'} className="rounded bg-emerald-50 px-1 text-[11px] font-semibold text-emerald-800 md:hidden">{currentRank ? ordinal(currentRank) : '—'}</span></p>
            </div>
            <div><p className="text-[11px] text-gray-600">Digs left</p><p className="mt-1 text-2xl font-bold leading-tight tabular-nums" data-testid="remaining-digs">{playerBoard.remainingDigs}</p></div>
          </div>
          <div className="match-board game-panel !rounded-t-none !border-t-0 px-2 pb-4 pt-4 sm:px-4">
            <div className="mx-auto grid max-w-[450px] gap-1 sm:gap-2" style={{ gridTemplateColumns: `12px repeat(${boardSize}, minmax(0, 1fr))` }} aria-label="Dig board">
              <span />{Array.from({ length: boardSize }, (_, col) => <span key={col} className="pb-1 text-center text-xs font-semibold text-emerald-800">{String.fromCharCode(65 + col)}</span>)}
              {playerBoard.boardState.map((row, rowIndex) => <Fragment key={rowIndex}>
                <span className="flex items-center text-xs font-semibold text-emerald-800">{rowIndex + 1}</span>
                {row.map((square, colIndex) => <Square key={colIndex} square={square} position={{ row: rowIndex, col: colIndex }} gridSize={boardSize}
                  subGridHints={playerBoard.subGridHints} onClick={() => onDig({ row: rowIndex, col: colIndex })} disabled={isLoading || expired || outOfDigs} showOwnDiscoveries />)}
              </Fragment>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-600" aria-label="Nearby relics legend">
              <span>Nearby relics</span>{[1, 2, 3, 4].map(level => <span key={level} className="inline-flex items-center gap-1"><span aria-hidden="true" className={`h-3 w-3 rounded-sm ${getHintIntensityClass(level)}`} />{level === 4 ? '4+' : level}</span>)}
            </div>
          </div>
        {(expired || outOfDigs || latest) && <div className="match-note game-panel mt-3 flex items-center gap-2 px-3 py-3 text-xs text-gray-600" role="status">
          {expired || outOfDigs ? <><Check size={16} className="shrink-0 text-emerald-700" />{expired ? 'Match ended. Confirming results…' : 'All digs used. Follow the standings.'}</> : latest && <><Gem size={16} className="shrink-0 text-amber-700" /><span>Your latest find · {String.fromCharCode(65 + latest.col)}{latest.row + 1}</span><strong className="ml-auto whitespace-nowrap text-amber-800">+{latest.points} points</strong></>}
        </div>}
      <aside className="match-standings mt-5 min-w-0 md:mt-0"><Standings rows={standings} currentPlayerId={currentPlayerId} /></aside>
    </div>
  </section>
}
