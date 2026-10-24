import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simulate, ENGINE_VERSION } from '../simulation/engine.js';
import { BOT_VERSION } from '../policies/index.js';
import { DEFAULT_PARAMETERS, PARAMETER_GRID } from '../policies/tactics.js';
import { interval } from '../reporting/statistics.js';

export async function tuneTactics({ configurations, playerCounts, seeds, source, output }) {
  const selected = structuredClone(DEFAULT_PARAMETERS);
  const candidates = [];
  let matchCount = 0;
  const startedAt = new Date().toISOString();
  for (const [policy, grid] of Object.entries(PARAMETER_GRID)) {
    for (const parameters of grid) {
      const samples = [];
      for (const seed of seeds) {
        let total = 0;
        let conditions = 0;
        for (const configuration of configurations) for (const count of playerCounts) for (const background of ['hybrid', 'mixed']) {
          const pool = background === 'hybrid' ? ['hybrid50'] : ['hint', 'probability', 'hybrid50', 'explorer', 'patient'];
          const scenario = { id: `training-${policy}-${background}`, focal: 0,
            players: Array.from({ length: count }, (_, i) => ({ role: `role-${i}`, policy: i ? pool[(i - 1) % pool.length] : policy,
              parameters: i ? {} : parameters, decisionMs: 3000, latencyMs: 100 })) };
          let conditionCredit = 0;
          for (let rotation = 0; rotation < count; rotation++) {
            const result = simulate({ seed, configuration, scenario, rotation });
            conditionCredit += result.players.find(p => p.playerId === 'role-0').winCredit;
            matchCount++;
          }
          // Mean credit over seats divided by fair share 1/N equals this sum.
          total += conditionCredit;
          conditions++;
        }
        samples.push(total / conditions);
      }
      const score = interval(samples);
      candidates.push({ policy, parameters, fairShareRatio: score });
      console.log(`Tuning ${policy} ${JSON.stringify(parameters)}: fair-share ratio ${score.mean.toFixed(3)}`);
    }
    const ranked = candidates.filter(c => c.policy === policy).sort((a, b) => b.fairShareRatio.mean - a.fairShareRatio.mean);
    selected[policy] = ranked[0].parameters;
  }
  const lock = { formatVersion: 1, botVersion: BOT_VERSION, engineVersion: ENGINE_VERSION, sourceFingerprint: source.fingerprint,
    parameters: selected, training: { seeds, playerCounts, configurations, matchCount, startedAt, finishedAt: new Date().toISOString(),
      objective: 'Maximize mean focal win credit divided by 1/N; average seat rotations within each condition, then give equal weight to configurations, player counts and backgrounds.',
      backgrounds: ['all hybrid50', 'hint, probability, hybrid50, explorer, patient cycling'],
      tieBreak: 'First candidate in the documented parameter grid', candidates,
      warning: 'Training intervals are descriptive; parameter selection is not confirmation. Freeze this file and evaluate on disjoint seeds and adaptive opponent groups.' } };
  await writeFile(join(output, 'tactics.lock.json'), JSON.stringify(lock, null, 2));
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ preset: 'tune', source, ...lock }, null, 2));
  await writeFile(join(output, 'tuning.csv'), 'policy,parameters,fairShareRatio,low,high\n' + candidates.map(c =>
    [c.policy, `"${JSON.stringify(c.parameters).replaceAll('"', '""')}"`, c.fairShareRatio.mean, c.fairShareRatio.low, c.fairShareRatio.high].join(',')).join('\n') + '\n');
  return lock;
}
