import { useEffect, useState } from 'react'
import { Gem } from 'lucide-react'
import { useMultiplayerGame } from './hooks/useMultiplayerGame'
import { SocketGameLobby } from './components/SocketGameLobby'
import { MultiplayerBoard } from './components/MultiplayerBoard'
import { GameFinale } from './components/GameFinale'
import { GameIntroduction } from './components/GameIntroduction'
import { CountdownTimer } from './components/CountdownTimer'

export default function App() {
  const game = useMultiplayerGame()
  const [introduction, setIntroduction] = useState(false)
  const session = game.session
  useEffect(() => {
    if (session?.status === 'active' || session?.status === 'completed' || session?.status === 'cancelled') setIntroduction(false)
  }, [session?.status])
  const finished = session?.status === 'completed' || session?.status === 'cancelled'
  return <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 p-4">
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-6">
      <h1 className="mt-6 flex items-center gap-3 text-4xl font-bold text-gray-800"><Gem className="text-amber-600" />Relic Rush</h1>
      <p className="text-sm text-gray-600">{game.connected ? 'Connected' : 'Connecting…'}</p>
      {game.error && <div role="alert" className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p>{game.error}</p>
        <button className="mt-2 underline" onClick={game.reconnect}>Reconnect</button>
      </div>}
      {game.pendingMove && !game.busy && session?.status === 'active' && <div role="status" className="rounded-lg bg-amber-50 p-4 text-amber-900">
        A dig is awaiting confirmation. <button disabled={!game.connected} className="underline" onClick={game.retryMove}>Retry dig</button>
      </div>}
      {introduction ? <GameIntroduction matchSeconds={game.lobby?.matchSeconds} onEnterLobby={() => setIntroduction(false)} /> : finished ?
        <GameFinale finalResults={session.finalResults || []} completionReason={session.completionReason}
          onPlayAgain={game.resetGame} onBackToMenu={() => { game.resetGame(); setIntroduction(true) }} /> :
        session?.status === 'active' ? <>
          {session.deadline && <div className="sticky top-0 z-20 w-full max-w-2xl"><CountdownTimer compact targetTime={session.deadline} clockOffset={game.clockOffset} label="Match ends in" expiredText="Match ended. Confirming results…" /></div>}
          {game.playerBoard ? <MultiplayerBoard playerBoard={game.playerBoard} otherPlayers={game.otherPlayers} onDig={game.dig}
            isLoading={game.busy || game.loading || !game.connected || !!game.pendingMove} gameCode={session.gameCode} deadline={session.deadline} clockOffset={game.clockOffset} /> : <p>Loading your board…</p>}
        </> : <>
          {game.sessionId && !session ? <p>Loading game…</p> : <SocketGameLobby game={game.lobby} hasJoined={game.hasJoined} ready={game.ready}
            disabled={game.busy || !game.connected || game.loading} clockOffset={game.clockOffset} onJoin={game.joinGame} onLeave={game.leaveGame} onReady={game.setReady} />}
          <button className="text-sm text-emerald-800 underline" onClick={() => setIntroduction(true)}>How to play</button>
          {game.error && <button className="text-sm underline" onClick={game.resetGame}>Return to lobby</button>}
        </>}
    </div>
  </main>
}
