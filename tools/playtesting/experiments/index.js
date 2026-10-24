import { CLASSIC_POLICIES, POLICIES } from '../policies/index.js';
import { ADAPTIVE_POLICIES, validateParameters } from '../policies/tactics.js';
import { calculatePoints } from '../../../game/rules.js';
export const BASELINE = { treasureCount: 5, startingDigs: 10, durationSeconds: 120, scoring: 'current' };
export const SCORE_NAMES = ['current', 'gentle', 'player-count', 'first-bonus'];
export function scoring(policy, count) {
  if (!SCORE_NAMES.includes(policy)) throw new Error(`Unknown scoring: ${policy}`);
  if (policy === 'current') return calculatePoints;
  return order => policy === 'gentle' ? Math.max(0, 100 - (order - 1) * 10)
    : policy === 'player-count' ? Math.max(40, Math.round(100 - (order - 1) * 60 / (count - 1)))
    : policy === 'first-bonus' ? 80 + (order === 1 ? 20 : 0) : Math.max(0, 100 - (order - 1) * 20);
}
export function validateConfiguration(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be an object.');
  for (const key of Object.keys(config)) if (!(key in BASELINE) && key !== 'id') throw new Error(`Unknown configuration key: ${key}`);
  for (const [key, min, max] of [['treasureCount', 1, 36], ['startingDigs', 1, 36], ['durationSeconds', 1, 3600]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Invalid ${key}`);
  }
  if (!SCORE_NAMES.includes(config.scoring)) throw new Error('Invalid scoring');
  return config;
}
export function configurations(preset, suite = 'classic') {
  if (suite === 'adversarial') return [8, 10].flatMap(treasureCount => ['current', 'player-count'].map(score => ({
    ...BASELINE, id: `relics-${treasureCount}-${score}`, treasureCount, scoring: score })));
  const baseline = { id: 'baseline', ...BASELINE };
  if (preset === 'baseline') return [baseline];
  return [baseline,
    ...[4, 6, 8, 10].map(treasureCount => ({ ...baseline, id: `treasures-${treasureCount}`, treasureCount })),
    ...[8, 12].map(startingDigs => ({ ...baseline, id: `digs-${startingDigs}`, startingDigs })),
    ...[60, 90].map(durationSeconds => ({ ...baseline, id: `seconds-${durationSeconds}`, durationSeconds })),
    ...SCORE_NAMES.slice(1).map(score => ({ ...baseline, id: `scoring-${score}`, scoring: score }))];
}
export function scenarios(count, suite = 'classic', parameters = {}) {
  if (suite === 'adversarial') return adversarialScenarios(count, parameters);
  const create = (id, policies, focal = null, pace = 3000, latency = 100) => ({
    id, focal, players: policies.map((policy, i) => ({ role: `role-${i}`, policy,
      decisionMs: i === focal ? pace : 3000, latencyMs: i === focal ? latency : 100 }))
  });
  const result = CLASSIC_POLICIES.map(policy => create(`all-${policy}`, Array(count).fill(policy)));
  for (const background of ['explorer', 'hybrid50']) for (const policy of CLASSIC_POLICIES) {
    if (policy === background) continue;
    result.push(create(`${policy}-vs-${background}`, [policy, ...Array(count - 1).fill(background)], 0));
  }
  for (const pace of [1000, 3000, 8000]) result.push(create(`pace-${pace}`, Array(count).fill('hybrid50'), 0, pace));
  result.push(create('latency-500', Array(count).fill('hybrid50'), 0, 3000, 500));
  return result;
}

export function adversarialScenarios(count, parameters = {}) {
  validateParameters(parameters);
  const create = (id, policies, focal = null, pace = 3000, latency = 100) => ({ id, focal,
    players: policies.map((policy, i) => ({ role: `role-${i}`, policy, parameters: parameters[policy] || {},
      decisionMs: i === focal ? pace : 3000, latencyMs: i === focal ? latency : 100 })) });
  const result = ['explorer', 'hint', 'hybrid50', ...ADAPTIVE_POLICIES].map(p => create(`all-${p}`, Array(count).fill(p)));
  for (const policy of ADAPTIVE_POLICIES) result.push(create(`${policy}-vs-hybrid50`, [policy, ...Array(count - 1).fill('hybrid50')], 0));
  const pool = ['probability', 'opportunist', 'racer', 'leader', 'sprinter'];
  for (const policy of POLICIES) result.push(create(`${policy}-vs-adaptive`, [policy, ...Array.from({ length: count - 1 }, (_, i) => pool[i % pool.length])], 0));
  const fields = [
    ['hybrid50', 'probability', 'opportunist', 'racer', 'leader', 'sprinter'],
    ['explorer', 'hint', 'racer', 'sprinter', 'probability', 'leader'],
    ['leader', 'sprinter', 'opportunist', 'probability', 'hint', 'hybrid50']
  ];
  fields.forEach((field, i) => result.push(create(`mixed-${i + 1}`, field.slice(0, count))));
  for (const pace of [1000, 3000, 8000]) result.push(create(`probability-pace-${pace}`, Array(count).fill('probability'), 0, pace));
  result.push(create('probability-latency-500', Array(count).fill('probability'), 0, 3000, 500));
  return result;
}
