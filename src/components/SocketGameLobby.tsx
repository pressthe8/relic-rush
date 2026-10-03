import type { LobbyGame } from '../hooks/useMultiplayerGame'
import { CountdownTimer } from './CountdownTimer'

interface Props {
  game: LobbyGame | null
  hasJoined: boolean
  ready: boolean
  disabled: boolean
  clockOffset: number
  onJoin: () => void
  onLeave: () => void
  onReady: (ready: boolean) => void
}
export function SocketGameLobby({ game, hasJoined, ready, disabled, clockOffset, onJoin, onLeave, onReady }: Props) {
  if (!game) return <p>Loading the next lobby…</p>
  const readyCount = game.players.filter(player => player.ready).length
  return <section className="w-full max-w-2xl space-y-5 rounded-xl border border-emerald-200 bg-white p-6 shadow-lg">
    <h2 className="text-3xl font-bold text-gray-800">Game Lobby</h2>
    <p className="text-gray-700">Game <strong className="font-mono">{game.gameCode}</strong> · {game.players.length}/{game.maxPlayers} players</p>
    <CountdownTimer targetTime={game.scheduledStartTime} clockOffset={clockOffset} />
    <p className="text-gray-700">6×6 board · 5 treasures · 10 digs · {game.matchSeconds >= 60 ? `${game.matchSeconds / 60} minute` : `${game.matchSeconds} second`} match</p>
    <p className="text-sm text-gray-600">Starts when six players join, or when the countdown ends with at least two players. Everyone can ready up to start sooner.</p>
    {hasJoined ? <div className="space-y-4">
      <p className="font-semibold text-emerald-800">You’re in! {readyCount}/{game.players.length} players ready.</p>
      <div className="flex flex-wrap gap-3">
        <button aria-pressed={ready} disabled={disabled} onClick={() => onReady(!ready)} className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50">
          {ready ? 'Undo ready' : 'Ready'}
        </button>
        <button disabled={disabled} onClick={onLeave} className="rounded-lg bg-gray-100 px-6 py-3 text-gray-800 disabled:opacity-50">Leave game</button>
      </div>
      {game.players.length < 2 && <p className="text-sm text-gray-600">Waiting for another player before we can start.</p>}
    </div> : <button disabled={disabled} onClick={onJoin} className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50">Join game</button>}
  </section>
}
