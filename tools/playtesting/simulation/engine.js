import { calculateHints, resolveDig, completionReason, rankPlayers, RULES_VERSION } from '../../../game/rules.js';
import { decide, BOT_VERSION } from '../policies/index.js';
import { validateConfiguration, scoring } from '../experiments/index.js';
import { randomStream, treasureLayout } from './random.js';
export const ENGINE_VERSION = `2-rules${RULES_VERSION}-bots${BOT_VERSION}`;

export function initialPlayers(specifications, treasures, digs) {
  const positions = new Set(treasures.map(p => `${p.row},${p.col}`));
  return specifications.map(spec => ({ playerId: spec.role, score: 0, remainingDigs: digs, discoveries: [], acceptedMoves: 0,
    boardState: Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => ({
      isRevealed: false, isTreasure: positions.has(`${row},${col}`), discoveryCount: 0 }))) }));
}
export function observation(player, hints, standings, elapsedMs, durationMs, settings = {}) {
  return { gridSize: 6, treasureCount: 5, startingDigs: 10, decisionMs: 3000, latencyMs: 100, ...settings, playerId: player.playerId, score: player.score, remainingDigs: player.remainingDigs,
    elapsedMs, durationMs, hints: { ...hints }, standings: standings.map(p => ({ ...p })),
    cells: player.boardState.flatMap((row, r) => row.map((cell, col) => ({ row: r, col, isRevealed: cell.isRevealed,
      ...(cell.isRevealed ? { isTreasure: cell.isTreasure, discoveryCount: cell.discoveryCount } : {}) }))) };
}
export function rotateSeats(players, rotation) {
  return players.map((_, i) => players[(i + rotation) % players.length]);
}

export function simulate({ seed, configuration, scenario, rotation = 0, trace = false }) {
  validateConfiguration(configuration);
  const specs = rotateSeats(scenario.players, rotation);
  if (specs.length < 2 || specs.length > 6 || new Set(specs.map(s => s.role)).size !== specs.length ||
    specs.some(s => !Number.isFinite(s.decisionMs) || s.decisionMs < 1 || !Number.isFinite(s.latencyMs) || s.latencyMs < 0)) throw new Error('Invalid scenario');
  const duration = configuration.durationSeconds * 1000;
  const treasures = treasureLayout(seed, configuration.treasureCount);
  let players = initialPlayers(specs, treasures, configuration.startingDigs);
  let discoveries = [];
  let now = 0;
  let reason = null;
  let serial = 0;
  const order = randomStream(seed, `events:${rotation}`);
  const randoms = specs.map(s => randomStream(seed, `choices:${s.role}`));
  const pending = new Set();
  const exhausted = {};
  const firstDig = {};
  const deliberateWait = {};
  let revision = 0;
  let lastDig = 0;
  let longestQuiet = 0;
  const queue = [];
  const actions = [];
  const initialStandings = rankPlayers(players).map(p => ({ playerId: p.playerId, score: 0, remainingDigs: p.remainingDigs, treasures: 0, rank: 1 }));
  const views = players.map(player => ({ player, hints: {}, standings: initialStandings, revision: 0 }));
  let cachedHints = players.map(() => ({}));
  const score = scoring(configuration.scoring, specs.length);
  function schedule(time, kind, index, payload) {
    const event = { time, kind, index, payload, tie: order(), serial: serial++ };
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const other = queue[middle];
      const comparison = event.time - other.time || event.tie - other.tie || event.serial - other.serial;
      if (comparison < 0) high = middle;
      else low = middle + 1;
    }
    queue.splice(low, 0, event);
  }
  // A deadline has precedence over every event at the same timestamp.
  for (let i = 0; i < specs.length; i++) schedule(specs[i].decisionMs, 'decision', i);
  while (queue.length) {
    const event = queue.shift();
    if (event.time >= duration) { now = duration; reason = 'deadline'; break; }
    now = event.time;
    const { index, payload } = event;
    const spec = specs[index];
    const view = views[index];
    if (event.kind === 'decision') {
      if (pending.has(index)) throw new Error('More than one outstanding move');
      const choice = decide(spec.policy, observation(view.player, view.hints, view.standings, now, duration,
        { treasureCount: configuration.treasureCount, startingDigs: configuration.startingDigs, decisionMs: spec.decisionMs, latencyMs: spec.latencyMs }), randoms[index], spec.parameters);
      if (!choice) continue;
      if (choice.waitUntil !== undefined) {
        const until = Math.max(now + 1, choice.waitUntil);
        deliberateWait[spec.role] = (deliberateWait[spec.role] || 0) + Math.max(0, Math.min(duration, until) - now);
        schedule(until, 'decision', index); continue;
      }
      pending.add(index);
      schedule(now + spec.latencyMs, 'request', index, choice);
    } else if (event.kind === 'request') {
      const resolved = resolveDig(players[index], discoveries, payload, { now, deadline: duration, status: 'active', score });
      players[index] = resolved.player;
      revision++;
      longestQuiet = Math.max(longestQuiet, now - lastDig);
      lastDig = now;
      firstDig[spec.role] ??= now;
      if (resolved.allDiscoveries.length !== discoveries.length) {
        cachedHints = specs.map(spec => calculateHints(resolved.allDiscoveries, spec.role, 6));
      }
      discoveries = resolved.allDiscoveries;
      if (trace) actions.push({ time: now, playerId: spec.role, ...payload, score: resolved.player.score, remainingDigs: resolved.player.remainingDigs });
      if (resolved.player.remainingDigs === 0) exhausted[spec.role] = now;
      schedule(now + spec.latencyMs, 'ack', index, { player: resolved.player, nextDecisionMs: payload.nextDecisionMs || spec.decisionMs });
      const standings = rankPlayers(players).map(p => ({ playerId: p.playerId, score: p.score, remainingDigs: p.remainingDigs, treasures: p.discoveries.length, rank: p.rank }));
      for (let i = 0; i < specs.length; i++) schedule(now + specs[i].latencyMs, 'update', i,
        { hints: cachedHints[i], standings, revision });
      reason = completionReason(players, duration, now, configuration.treasureCount);
      if (reason) break;
    } else if (event.kind === 'ack') {
      pending.delete(index);
      view.player = payload.player;
      schedule(now + payload.nextDecisionMs, 'decision', index);
    } else if (event.kind === 'update' && payload.revision >= view.revision) {
      view.revision = payload.revision;
      view.hints = payload.hints;
      view.standings = payload.standings;
    }
  }
  if (!reason) { now = duration; reason = 'deadline'; }
  const ranked = rankPlayers(players);
  const winners = ranked.filter(p => p.rank === 1).length;
  return { engineVersion: ENGINE_VERSION, seed, configurationId: configuration.id, scenarioId: scenario.id, rotation,
    durationSeconds: now / 1000, longestQuietSeconds: Math.max(longestQuiet, now - lastDig) / 1000, completionReason: reason, tied: winners > 1,
    players: ranked.map(p => {
      const spec = specs.find(s => s.role === p.playerId);
      return { playerId: p.playerId, policy: spec.policy, decisionMs: spec.decisionMs, latencyMs: spec.latencyMs,
        rank: p.rank, winCredit: p.rank === 1 ? 1 / winners : 0, outrightWin: Number(p.rank === 1 && winners === 1),
        explorerBeatsHybrid: Number(spec.policy === 'explorer' && specs.some(s => s.policy.startsWith('hybrid')) &&
          ranked.filter(other => specs.find(s => s.role === other.playerId).policy.startsWith('hybrid')).every(other => p.score > other.score)),
        score: p.score, discoveries: p.discoveries.length,
        zeroScore: Number(p.score === 0), firstDigSeconds: (firstDig[p.playerId] ?? now) / 1000,
        deliberateWaitSeconds: (deliberateWait[p.playerId] || 0) / 1000,
        zeroFind: p.discoveries.length === 0 ? 1 : 0, unusedDigs: p.remainingDigs, digsUsed: p.acceptedMoves,
        exhaustedSeconds: exhausted[p.playerId] !== undefined ? (now - exhausted[p.playerId]) / 1000 : 0 };
    }), ...(trace ? { treasures, actions } : {}) };
}
