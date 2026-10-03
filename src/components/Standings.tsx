import type { Standing } from '../utils/standings'

export function YouBadge() {
  return <span className="you-badge">You</span>
}

export function Standings({ rows, currentPlayerId, final = false }: { rows: Standing[]; currentPlayerId: string; final?: boolean }) {
  const winners = rows.filter(row => row.rank === 1).length
  const title = final ? 'Final standings' : 'Leaderboard'
  return <section className="game-panel overflow-hidden" aria-label={title}>
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <span className="text-xs font-medium text-emerald-800">{final ? `${rows.length} players` : 'Live'}</span>
    </div>
    {rows.length ? <table className="standings-table" aria-label={title}>
      <thead><tr><th scope="col"><span className="sr-only">Rank</span><span aria-hidden="true">#</span></th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">{final ? 'Relics' : 'Digs'}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.playerId} data-player-id={row.playerId} aria-current={row.playerId === currentPlayerId ? 'true' : undefined} className={row.playerId === currentPlayerId ? 'own-player' : ''}>
        <td>{row.rank ?? '—'}</td>
        <th scope="row"><span className="break-words">{row.displayName}</span>{row.playerId === currentPlayerId && <> <YouBadge /></>}
          {final && row.rank === 1 && <span className="mt-1 block text-xs font-medium text-amber-800">{winners > 1 ? 'Joint winner' : 'Winner'}</span>}
        </th>
        <td className="font-semibold" data-stat="score">{row.score ?? '—'}</td>
        <td data-stat={final ? 'treasures' : 'digs'}>{(final ? row.treasures : row.remainingDigs) ?? '—'}</td>
      </tr>)}</tbody>
    </table> : <p className="px-4 pb-5 text-sm text-gray-600">{final ? 'No results available.' : 'Loading standings…'}</p>}
  </section>
}
