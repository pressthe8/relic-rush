import { Check, UserRound } from 'lucide-react'
import type { LobbyGame } from '../hooks/useMultiplayerGame'
import { displayPlayerName } from '../utils/standings'
import { CountdownTimer } from './CountdownTimer'
import { GameCode } from './GameCode'
import { YouBadge } from './Standings'

interface Props {
  game: LobbyGame | null
  currentPlayerId: string
  hasJoined: boolean
  ready: boolean
  disabled: boolean
  clockOffset: number
  onJoin: () => void
  onLeave: () => void
  onReady: (ready: boolean) => void
}
export function SocketGameLobby({ game, currentPlayerId, hasJoined, ready, disabled, clockOffset, onJoin, onLeave, onReady }: Props) {
  if (!game) return <p role="status">Loading the next lobby…</p>
  const readyCount = game.players.filter(player => player.ready).length
  return <section className="w-full" aria-label="Game lobby">
    <div className="mb-5"><p className="stage-kicker">Gather your crew</p><h1 className="stage-heading">Game Lobby</h1>
      <p className="mt-2 text-sm text-gray-600">{hasJoined ? 'You’re in. Your next adventure starts here.' : 'Join the crew for a quick treasure hunt.'}</p>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="md:col-start-2 md:row-start-1">
        <div className="game-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-2 text-sm text-gray-600"><span>{game.players.length}/{game.maxPlayers} players</span><span>{readyCount}/{game.players.length} ready</span></div>
          <CountdownTimer targetTime={game.scheduledStartTime} clockOffset={clockOffset} />
          <dl className="my-5 grid grid-cols-4 gap-2 text-xs text-gray-600">
            <div><dt>Board</dt><dd className="mt-1 font-semibold text-gray-800">6 × 6</dd></div>
            <div><dt>Treasures</dt><dd className="mt-1 font-semibold text-gray-800">5 relics</dd></div>
            <div><dt>Initial digs</dt><dd className="mt-1 font-semibold text-gray-800">10 digs</dd></div>
            <div><dt>Duration</dt><dd className="mt-1 font-semibold text-gray-800">{game.matchSeconds % 60 === 0 ? `${game.matchSeconds / 60} min` : `${game.matchSeconds} sec`}</dd></div>
          </dl>
          <div className="border-t border-emerald-100 pt-4"><GameCode code={game.gameCode} copyable /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {hasJoined ? <><button aria-pressed={ready} disabled={disabled} onClick={() => onReady(!ready)} className="game-button flex-1">{ready && <Check size={16} />}{ready ? 'Undo ready' : 'Ready'}</button>
            <button disabled={disabled} onClick={onLeave} className="game-button-secondary flex-1">Leave game</button></> :
            <button disabled={disabled} onClick={onJoin} className="game-button w-full">Join game</button>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">{game.players.length < 2 ? 'Waiting for another player before we can start. ' : ready && hasJoined ? 'You’re ready. ' : ''}Starts when six players join, everyone is ready with at least two players, or the countdown ends with at least two players.</p>
      </div>
      <section className="game-panel overflow-hidden md:col-start-1 md:row-start-1" aria-label="Lobby players">
        <div className="flex items-center justify-between gap-3 p-4"><h2 className="text-xl font-bold">The crew</h2><span className="text-xs text-emerald-800">{game.players.length} / {game.maxPlayers} players</span></div>
        <ul>{game.players.map(player => <li key={player.id} data-player-id={player.id} className={`flex items-center gap-3 border-t border-emerald-100 px-4 py-4 ${player.id === currentPlayerId ? 'own-player border-l-[3px] border-l-emerald-700' : ''}`}>
          <UserRound size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words text-sm font-semibold">{displayPlayerName(player.id)} {player.id === currentPlayerId && <YouBadge />}</span>
          <span className={`flex shrink-0 items-center gap-1 text-xs ${player.ready ? 'text-emerald-800' : 'text-gray-600'}`}>{player.ready && <Check size={14} aria-hidden="true" />}{player.ready ? 'Ready' : 'Waiting'}</span>
        </li>)}
          {Array.from({ length: Math.max(0, game.maxPlayers - game.players.length) }, (_, i) => <li key={`open-${i}`} className="flex items-center justify-between border-t border-emerald-100 px-4 py-4 text-sm text-gray-500"><span>Open spot</span><span className="text-xs">Available</span></li>)}
        </ul>
      </section>
    </div>
  </section>
}
