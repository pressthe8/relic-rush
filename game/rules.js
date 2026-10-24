// Pure mechanics only. Runtime identity, persistence, retries and randomness belong to adapters.
export const RULES_VERSION = '2';

export const calculatePoints = discoveryOrder => Math.max(0, 100 - (discoveryOrder - 1) * 20);
export const regionIndex = ({ row, col }, gridSize) => Math.floor(row / (gridSize / 3)) * 3 + Math.floor(col / (gridSize / 3));

export function calculateHints(discoveries, playerId, gridSize) {
  const own = new Set(discoveries.filter(d => d.playerId === playerId).map(d => `${d.row},${d.col}`));
  const other = new Map();
  for (const d of discoveries) {
    const key = `${d.row},${d.col}`;
    if (d.playerId !== playerId && !own.has(key)) other.set(key, d);
  }
  const hints = {};
  for (const position of other.values()) {
    const region = regionIndex(position, gridSize);
    hints[region] = (hints[region] || 0) + 1;
  }
  return hints;
}

export function completionReason(players, deadline, now, treasureCount = Infinity) {
  if (now >= deadline) return 'deadline';
  if (!players.length) return null;
  if (players.every(p => p.remainingDigs <= 0)) return 'digs-exhausted';
  return players.every(p => p.remainingDigs <= 0 || p.discoveries?.length >= treasureCount) ? 'players-finished' : null;
}

export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map(p => ({ ...p, rank: sorted.findIndex(other => other.score === p.score) + 1, digsUsed: p.acceptedMoves || 0 }));
}

/** Resolve one already-authenticated, non-duplicate move. Inputs are never modified. */
export function resolveDig(player, allDiscoveries, move, { now, deadline, status, score = calculatePoints }) {
  const { row, col } = move;
  const board = player.boardState;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || !board[row]?.[col]) throw new Error('Invalid move.');
  if (status !== 'active' || now >= deadline) throw new Error('This match has ended.');
  if (board[row][col].isRevealed || player.remainingDigs <= 0) throw new Error('That dig is not available.');
  const square = { ...board[row][col], isRevealed: true };
  const discoveries = [...player.discoveries];
  const log = [...allDiscoveries];
  let points = 0;
  if (square.isTreasure) {
    const order = log.filter(d => d.row === row && d.col === col).length + 1;
    points = score(order);
    square.discoveryCount = order;
    const discovery = { playerId: player.playerId, row, col, points, discoveryOrder: order, timestamp: new Date(now).toISOString() };
    discoveries.push(discovery);
    log.push(discovery);
  }
  const nextBoard = [...board];
  nextBoard[row] = [...board[row]];
  nextBoard[row][col] = square;
  return {
    player: { ...player, boardState: nextBoard, score: player.score + points,
      remainingDigs: player.remainingDigs - (square.isTreasure ? 0 : 1), discoveries,
      acceptedMoves: (player.acceptedMoves || 0) + 1 },
    allDiscoveries: log
  };
}
