import { useEffect, useState } from 'react'
import { Gem } from 'lucide-react'
import { useMultiplayerGame } from './hooks/useMultiplayerGame'
import { SocketGameLobby } from './components/SocketGameLobby'
import { MultiplayerBoard } from './components/MultiplayerBoard'
import { GameFinale } from './components/GameFinale'
import { GameIntroduction } from './components/GameIntroduction'
import { displayPlayerName } from './utils/standings'
import { YouBadge } from './components/Standings'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('how-to-play') === '1') {
    const seconds = Number(params.get('matchSeconds') || 120)
    return <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 p-4"><div className="mx-auto max-w-4xl py-6"><GameIntroduction referenceOnly matchSeconds={Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : 120} onEnterLobby={() => window.close()} /></div></main>
  }
  return <GameApp />
}

function GameApp() {
  const game = useMultiplayerGame()
  const [introduction, setIntroduction] = useState(false)
  const session = game.session
  useEffect(() => {
    if (session?.status === 'active' || session?.status === 'completed' || session?.status === 'cancelled') setIntroduction(false)
  }, [session?.status])
  const finished = session?.status === 'completed' || session?.status === 'cancelled'
  const betweenHunts = !game.connected && !!game.error && !session && !game.sessionId && !game.hasJoined
  const storedName = game.playerBoard?.mockPlayerId || session?.finalResults?.find(result => result.playerId === game.uid)?.mockPlayerId
  const instructionsSeconds = session?.matchSeconds || game.lobby?.matchSeconds || 120
  return <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 px-2 pb-6 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 py-5">
        <div className="flex items-center gap-2 text-xl font-bold tracking-tight text-gray-800 sm:text-2xl"><Gem className="text-amber-600" aria-hidden="true" />Relic Rush</div>
        <div className="min-w-0 text-right"><p className="break-words text-xs font-semibold" data-testid="current-player">{displayPlayerName(game.uid, storedName)} {game.uid && <YouBadge />}</p>
          <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-gray-600"><span className={`h-1.5 w-1.5 rounded-full ${game.connected ? 'bg-emerald-600' : 'bg-amber-600'}`} />{betweenHunts ? 'Between hunts' : game.connected ? 'Connected' : 'Connecting…'}</p>
        </div>
      </header>
      <div className="flex flex-col items-center gap-5">
      {game.error && !betweenHunts && <div role="alert" className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p>{game.error}</p>
        <button className="mt-2 underline" onClick={game.errorKind === 'action' && game.connected ? game.dismissError : game.reconnect}>{game.errorKind === 'action' && game.connected ? 'Dismiss' : game.errorKind === 'data' && game.connected ? 'Retry game updates' : 'Reconnect'}</button>
      </div>}
      {game.pendingMove && !game.busy && session?.status === 'active' && <div role="status" className="rounded-lg bg-amber-50 p-4 text-amber-900">
        A dig is awaiting confirmation. <button disabled={!game.connected} className="underline" onClick={game.retryMove}>Retry dig</button>
      </div>}
      {betweenHunts ? <section aria-labelledby="between-hunts-heading" className="game-panel my-4 w-full max-w-2xl px-5 py-10 text-center sm:px-10 sm:py-14">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Gem size={34} aria-hidden="true" /></div>
        <h1 id="between-hunts-heading" className="stage-heading">The next hunt awaits.</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-gray-600">Relic Rush currently opens for limited play windows only.<br />Sign up for announcements, or try your luck another time.<br />We look forward to seeing you for the next rush.</p>
        <button className="game-button mt-7" disabled aria-describedby="signup-coming-soon">Sign up / Login</button>
        <p id="signup-coming-soon" className="mt-2 text-xs text-gray-600">Coming soon</p>
      </section> : introduction ? <GameIntroduction matchSeconds={game.lobby?.matchSeconds} onEnterLobby={() => setIntroduction(false)} /> : finished ?
        <GameFinale finalResults={session.finalResults || []} completionReason={session.completionReason} currentPlayerId={game.uid}
          onPlayAgain={game.resetGame} onBackToMenu={() => { game.resetGame(); setIntroduction(true) }} /> :
        session?.status === 'active' ? <>
          {game.playerBoard ? <MultiplayerBoard playerBoard={game.playerBoard} standings={game.standings} currentPlayerId={game.uid} currentRank={game.currentRank} onDig={game.dig}
            isLoading={game.busy || game.loading || !game.connected || !!game.pendingMove} gameCode={session.gameCode} deadline={session.deadline} clockOffset={game.clockOffset} /> : <p>Loading your board…</p>}
        </> : <>
          {game.sessionId && !session ? <p>Loading game…</p> : <SocketGameLobby game={game.lobby} currentPlayerId={game.uid} hasJoined={game.hasJoined} ready={game.ready}
            disabled={game.busy || !game.connected || game.loading} clockOffset={game.clockOffset} onJoin={game.joinGame} onLeave={game.leaveGame} onReady={game.setReady} />}
          {game.error && <button className="text-sm underline" onClick={game.resetGame}>Return to lobby</button>}
        </>}
      </div>
      <footer className="mt-6 flex items-center justify-between gap-3 text-xs text-gray-600"><span>6 × 6 board · 5 hidden treasures</span>
        <a className="inline-flex min-h-11 items-center text-emerald-800 underline underline-offset-4" href={`?how-to-play=1&matchSeconds=${instructionsSeconds}`} target="_blank" rel="noopener noreferrer">How to play<span className="sr-only"> (opens in a new tab)</span><span aria-hidden="true" className="ml-1">↗</span></a>
      </footer>
    </div>
  </main>
}
