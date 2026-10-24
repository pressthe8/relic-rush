import { regionIndex } from '../../../game/rules.js';
import { probabilityChoice } from './probabilities.js';
export const ADAPTIVE_POLICIES = ['probability', 'opportunist', 'racer', 'leader', 'sprinter'];
export const DEFAULT_PARAMETERS = {
  probability: {}, opportunist: { spentFraction: 0.5 }, racer: { densityThreshold: 0.5 },
  leader: { leadBuffer: 0 }, sprinter: { reserveSeconds: 10 }
};
export const PARAMETER_GRID = {
  opportunist: [0.25, 0.5, 0.75].map(spentFraction => ({ spentFraction })),
  racer: [0.25, 0.5, 0.75].map(densityThreshold => ({ densityThreshold })),
  leader: [0, 40, 100].map(leadBuffer => ({ leadBuffer })),
  sprinter: [0, 10, 20].map(reserveSeconds => ({ reserveSeconds }))
};
export function validateParameters(parameters = {}) {
  for (const [policy, values] of Object.entries(parameters)) {
    if (!ADAPTIVE_POLICIES.includes(policy) || !values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`Invalid tactic parameters: ${policy}`);
    for (const [key, value] of Object.entries(values)) {
      if (!(key in DEFAULT_PARAMETERS[policy]) || !Number.isFinite(value)) throw new Error(`Invalid tactic parameter: ${policy}.${key}`);
      if (key === 'spentFraction' || key === 'densityThreshold') { if (value < 0 || value > 1) throw new Error('Fractions must be 0..1'); }
      else if (value < 0 || value > 1000) throw new Error('Invalid tactic threshold');
    }
  }
  return parameters;
}
export function adaptiveDecision(policy, view, random, overrides = {}) {
  const parameters = { ...DEFAULT_PARAMETERS[policy], ...overrides };
  const opponents = view.standings.filter(p => p.playerId !== view.playerId);
  const available = view.cells.filter(cell => !cell.isRevealed);
  const found = view.cells.filter(cell => cell.isRevealed && cell.isTreasure).length;
  const maxMoves = view.remainingDigs + Math.max(0, view.treasureCount - found);
  const pace = policy === 'sprinter' ? 1000 : view.decisionMs;
  const latestStart = Math.max(0, view.durationMs - maxMoves * (pace + 2 * view.latencyMs) - 1000);
  const wait = until => ({ waitUntil: Math.min(view.durationMs, until) });
  if (policy === 'sprinter') {
    const start = latestStart - parameters.reserveSeconds * 1000;
    if (view.elapsedMs < start) return wait(start);
    return { ...probabilityChoice(view, random), nextDecisionMs: 1000 };
  }
  if (policy === 'leader' && opponents.length && view.score > Math.max(...opponents.map(p => p.score)) + parameters.leadBuffer) {
    return wait(view.elapsedMs + 3000);
  }
  if (policy === 'opportunist' && view.elapsedMs < latestStart) {
    const spent = opponents.length ? opponents.reduce((sum, p) => sum + (view.startingDigs - p.remainingDigs) / view.startingDigs, 0) / opponents.length : 0;
    if (spent < parameters.spentFraction || !Object.values(view.hints).some(n => n > 0)) return wait(Math.min(latestStart, view.elapsedMs + 3000));
  }
  const choice = probabilityChoice(view, random);
  if (policy === 'racer') {
    const counts = {};
    for (const cell of available) { const r = regionIndex(cell, view.gridSize); counts[r] = (counts[r] || 0) + 1; }
    const density = Math.max(0, ...Object.keys(counts).map(r => (view.hints[r] || 0) / counts[r]));
    const exhausted = opponents.length && opponents.every(p => p.remainingDigs === 0);
    return { ...choice, nextDecisionMs: exhausted || density < parameters.densityThreshold ? 1000 : view.decisionMs };
  }
  return choice;
}
