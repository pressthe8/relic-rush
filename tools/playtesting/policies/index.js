import { regionIndex } from '../../../game/rules.js';
import { adaptiveDecision, ADAPTIVE_POLICIES } from './tactics.js';
export const BOT_VERSION = '2';
export const CLASSIC_POLICIES = ['explorer', 'hint', 'hybrid25', 'hybrid50', 'hybrid75', 'patient'];

export const POLICIES = [...CLASSIC_POLICIES, ...ADAPTIVE_POLICIES];

// The entire policy interface is (observation, random) -> cell or waitUntil.
// It deliberately cannot accept engine state or discovery logs.
export function decide(policy, observation, random, parameters = {}) {
  if (!POLICIES.includes(policy)) throw new Error(`Unknown policy: ${policy}`);
  const { cells, remainingDigs, elapsedMs, durationMs, hints, gridSize } = observation;
  const available = cells.filter(cell => !cell.isRevealed);
  if (!available.length || remainingDigs <= 0) return null;
  if (policy === 'patient') {
    if (elapsedMs < durationMs / 4) return { waitUntil: durationMs / 4 };
    if (remainingDigs <= 2 && elapsedMs < durationMs / 2) return { waitUntil: durationMs / 2 };
  }
  if (ADAPTIVE_POLICIES.includes(policy)) {
    if (cells.filter(cell => cell.isRevealed && cell.isTreasure).length >= observation.treasureCount) return null;
    return adaptiveDecision(policy, observation, random, parameters);
  }
  const exploration = policy === 'explorer' ? 1 : policy.startsWith('hybrid') ? Number(policy.slice(6)) / 100 : 0;
  let candidates = available;
  if (exploration === 0 || (exploration < 1 && random() >= exploration)) {
    const counts = {};
    for (const cell of available) {
      const region = regionIndex(cell, gridSize);
      counts[region] = (counts[region] || 0) + 1;
    }
    const density = cell => (hints[regionIndex(cell, gridSize)] || 0) / counts[regionIndex(cell, gridSize)];
    const best = Math.max(...available.map(density));
    if (best > 0) candidates = available.filter(cell => density(cell) === best);
  }
  const { row, col } = candidates[Math.floor(random() * candidates.length)];
  return { row, col };
}
