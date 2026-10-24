import { regionIndex } from '../../../game/rules.js';
const choose = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]];
const cache = new Map();
const convolve = (left, right, total) => {
  const result = Array(total + 1).fill(0);
  for (let i = 0; i <= total; i++) if (left[i]) for (let j = 0; j + i <= total; j++) if (right[j]) result[i + j] += left[i] * right[j];
  return result;
};

// Exact combinatorics under a deliberately limited model: all layouts consistent with
// personal reveals, total treasure count, and region lower bounds have equal weight.
// Opponent policy/selection bias is not modelled. This is not an omniscient posterior.
export function regionProbabilities(view) {
  const available = Array(9).fill(0);
  let found = 0;
  for (const cell of view.cells) {
    if (!cell.isRevealed) available[regionIndex(cell, view.gridSize)]++;
    else if (cell.isTreasure) found++;
  }
  const total = view.treasureCount - found;
  const lower = available.map((u, i) => Math.min(u, view.hints[i] || 0));
  const key = `${total}/${available.join('')}/${lower.join('')}`;
  if (cache.has(key)) return cache.get(key);
  const distributions = available.map((u, i) => Array.from({ length: total + 1 }, (_, t) => t >= lower[i] && t <= u ? choose[u][t] : 0));
  const unit = Array(total + 1).fill(0); unit[0] = 1;
  const prefix = [unit];
  for (const d of distributions) prefix.push(convolve(prefix.at(-1), d, total));
  const suffix = Array(10); suffix[9] = unit;
  for (let i = 8; i >= 0; i--) suffix[i] = convolve(distributions[i], suffix[i + 1], total);
  const mass = prefix[9][total];
  if (!mass) throw new Error('Inconsistent visible treasure constraints');
  const probabilities = Object.freeze(available.map((u, i) => {
    if (!u) return 0;
    const rest = convolve(prefix[i], suffix[i + 1], total);
    let expected = 0;
    for (let t = 0; t <= Math.min(u, total); t++) expected += t * distributions[i][t] * rest[total - t];
    return expected / mass / u;
  }));
  if (cache.size >= 20000) cache.clear();
  cache.set(key, probabilities);
  return probabilities;
}
export function probabilityChoice(view, random) {
  const probabilities = regionProbabilities(view);
  const available = view.cells.filter(cell => !cell.isRevealed);
  const best = Math.max(...available.map(cell => probabilities[regionIndex(cell, view.gridSize)]));
  const candidates = available.filter(cell => Math.abs(probabilities[regionIndex(cell, view.gridSize)] - best) < 1e-12);
  const { row, col } = candidates[Math.floor(random() * candidates.length)];
  return { row, col };
}
