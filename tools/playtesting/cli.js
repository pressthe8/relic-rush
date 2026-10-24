import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative, dirname } from 'node:path';
import { BOT_VERSION } from './policies/index.js';
import { validateParameters } from './policies/tactics.js';
import { tuneTactics } from './experiments/tuning.js';
import { simulate, ENGINE_VERSION } from './simulation/engine.js';
import { configurations, scenarios, validateConfiguration, BASELINE } from './experiments/index.js';
import { clusterMatches, METRICS } from './reporting/statistics.js';
import { writeReport } from './reporting/report.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
function args(argv) {
  const result = {};
  const allowed = ['preset', 'config', 'seed', 'matches', 'players', 'scenario', 'output', 'replay', 'help', 'suite', 'tactics'];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.includes(name)) throw new Error(`Unknown option ${argv[i]}`);
    if (name === 'help') result.help = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
      result[name] = argv[++i];
    }
  }
  return result;
}
async function sourceIdentity() {
  const files = ['package.json', 'package-lock.json'];
  async function walk(directory) {
    for (const entry of (await readdir(join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(js|mjs|ts|tsx|json)$/.test(path)) files.push(path);
    }
  }
  for (const directory of ['game', 'server', 'src', 'tools/playtesting']) await walk(directory);
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file + '\0').update(await readFile(join(root, file))).update('\0');
  let revision = null;
  let dirty = null;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
  } catch { /* A source archive can still be fingerprinted without Git metadata. */ }
  return { revision, dirty, fingerprint: hash.digest('hex'), files: files.sort() };
}
function positive(value, fallback, name) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`);
  return number;
}
async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) {
    console.log('balance --preset baseline|screen|confirm|tune [--suite classic|adversarial] [--tactics lock.json] [--config file.json] [--seed N] [--matches N]\n  [--players 2,3,4,5,6] [--scenario exact-id] [--output directory]\n  --replay path/to/example.json [--output directory]\n--matches is independent board seeds PER condition; each seed rotates all seats.\nConfirmation requires an explicit --config. Defaults: 1000 screen/baseline seeds; 10000 confirm seeds.');
    return;
  }
  const source = await sourceIdentity();
  const output = resolve(options.output || join(root, '.balance-results', new Date().toISOString().replaceAll(':', '-')));
  const relOutput = relative(root, output);
  if (['game', 'server', 'src', 'tools', 'tests'].some(dir => relOutput === dir || relOutput.startsWith(`${dir}/`))) throw new Error('Output must be outside source directories');
  await mkdir(output, { recursive: true });
  try { await readFile(join(output, 'manifest.json')); throw new Error('Output directory already contains a run. Choose a new directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (options.replay) {
    const saved = JSON.parse(await readFile(resolve(options.replay), 'utf8'));
    if (saved.engineVersion !== ENGINE_VERSION || saved.fingerprint !== source.fingerprint) throw new Error('Source differs from saved run; restore the recorded source before replaying.');
    const result = simulate({ ...saved.input, trace: true });
    if (saved.result && JSON.stringify(result) !== JSON.stringify(saved.result)) throw new Error('Replay diverged from saved result');
    await writeFile(join(output, 'replay.json'), JSON.stringify(result, null, 2));
    console.log(`Replay verified: ${join(output, 'replay.json')}`);
    return;
  }
  const preset = options.preset || 'baseline';
  const suite = options.suite || (preset === 'tune' ? 'adversarial' : 'classic');
  if (!['classic', 'adversarial'].includes(suite)) throw new Error('Invalid suite');
  if (!['baseline', 'screen', 'confirm', 'tune'].includes(preset)) throw new Error('Invalid preset');
  if (preset === 'confirm' && !options.config) throw new Error('Confirmation requires --config with explicitly selected settings.');
  const count = positive(options.matches, preset === 'confirm' ? 10000 : preset === 'tune' ? 64 : 1000, 'matches');
  const firstSeed = positive(options.seed, preset === 'confirm' ? 1000001 : preset === 'tune' ? 20001 : suite === 'adversarial' ? 40001 : 1, 'seed');
  if (!Number.isSafeInteger(firstSeed + count)) throw new Error('Seed range overflow');
  if (preset === 'confirm' && firstSeed <= 1000000) throw new Error('Confirmation seeds must be above 1000000; use a fresh range.');
  if (preset !== 'confirm' && firstSeed + count - 1 > 1000000) throw new Error('Screening seeds must stay below 1000001.');
  let configs = configurations(preset, suite);
  if (options.config) {
    const loaded = JSON.parse(await readFile(resolve(options.config), 'utf8'));
    configs = (Array.isArray(loaded) ? loaded : [loaded]).map((config, i) => validateConfiguration({ ...BASELINE, ...config, id: config.id || `custom-${i + 1}` }));
  }
  if (!configs.length || configs.some(c => typeof c.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(c.id)) || new Set(configs.map(c => c.id)).size !== configs.length) throw new Error('Configuration IDs must be unique nonempty letters/numbers/hyphens');
  const playerCounts = (options.players || (suite === 'adversarial' ? '3,4,5,6' : '2,4,6')).split(',').map(Number);
  if (!playerCounts.length || playerCounts.some(n => ![2, 3, 4, 5, 6].includes(n)) || new Set(playerCounts).size !== playerCounts.length) throw new Error('players must be a unique subset of 2,3,4,5,6');
  const seeds = Array.from({ length: count }, (_, i) => firstSeed + i);
  for (const file of source.files) {
    const destination = join(output, 'source', file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, file), destination);
  }
  source.snapshot = 'source/';
  if (preset === 'tune') {
    if (suite !== 'adversarial' || options.tactics) throw new Error('Tuning uses the adversarial suite and no prior tactics lock.');
    const lock = await tuneTactics({ configurations: configs, playerCounts, seeds, source, output });
    console.log(`Frozen tactics: ${join(output, 'tactics.lock.json')} (${lock.training.matchCount} training matches)`);
    return;
  }
  let tacticLock = null;
  if (options.tactics) {
    tacticLock = JSON.parse(await readFile(resolve(options.tactics), 'utf8'));
    if (tacticLock.botVersion !== BOT_VERSION || tacticLock.sourceFingerprint !== source.fingerprint || !Array.isArray(tacticLock.training?.seeds)) throw new Error('Tactics lock does not match source or bot version');
    validateParameters(tacticLock.parameters);
    const trainingSeeds = new Set(tacticLock.training.seeds);
    if (seeds.some(seed => trainingSeeds.has(seed))) throw new Error('Evaluation seeds overlap tactic training seeds');
  }
  if (suite === 'adversarial' && preset === 'confirm' && !tacticLock) throw new Error('Adversarial confirmation requires a frozen --tactics lock');
  const scenarioSets = playerCounts.map(playerCount => ({ playerCount, scenarios: scenarios(playerCount, suite, tacticLock?.parameters).filter(s => !options.scenario || options.scenario.split(',').includes(s.id)) }));
  if (scenarioSets.some(set => !set.scenarios.length)) throw new Error('Unknown scenario');
  if (options.scenario && scenarioSets.some(set => options.scenario.split(',').some(id => !set.scenarios.some(s => s.id === id)))) throw new Error('Unknown scenario in selection');
  const manifest = { formatVersion: 1, engineVersion: ENGINE_VERSION, source, preset, suite, tacticLock, seeds, configurations: configs,
    scenarioSets, startedAt: new Date().toISOString(), matchCount: 0,
    seedDomains: { screening: '1..1000000', confirmation: '1000001 upwards; choose non-overlapping ranges for independent confirmations' },
    timing: 'decisionMs is think time after acknowledgement; latencyMs is one-way request and update latency; no wall clock sleeps',
    replay: 'npm run balance -- --replay <examples/file.json> --output <new-directory>',
    uncertainty: '95% approximate normal intervals over board-seed means including every seat rotation; paired differences share seeds; no multiple-testing correction' };
  await mkdir(join(output, 'examples'), { recursive: true });
  const rows = [];
  for (const configuration of configs) for (const set of scenarioSets) for (const scenario of set.scenarios) {
    const byGroup = new Map();
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
      const seed = seeds[seedIndex];
      const matches = [];
      for (let rotation = 0; rotation < set.playerCount; rotation++) {
        const input = { seed, configuration, scenario, rotation };
        try {
          const example = seedIndex === 0 && rotation === 0;
          const result = simulate({ ...input, trace: example });
          if (example) await writeFile(join(output, 'examples', `${configuration.id}-${set.playerCount}-${scenario.id}.json`),
            JSON.stringify({ engineVersion: ENGINE_VERSION, fingerprint: source.fingerprint, input, result }, null, 2));
          matches.push(result);
          manifest.matchCount++;
        } catch (error) {
          await writeFile(join(output, 'failure.json'), JSON.stringify({ engineVersion: ENGINE_VERSION, fingerprint: source.fingerprint, input, error: error.stack }, null, 2));
          throw error;
        }
      }
      for (const group of clusterMatches(matches, scenario)) {
        const key = `${group.policy}/${group.cohort}`;
        if (!byGroup.has(key)) byGroup.set(key, { configurationId: configuration.id, playerCount: set.playerCount, scenarioId: scenario.id,
          policy: group.policy, cohort: group.cohort, samples: Object.fromEntries(METRICS.map(k => [k, []])) });
        const row = byGroup.get(key);
        for (const metric of METRICS) row.samples[metric].push(group.metrics[metric]);
      }
    }
    rows.push(...byGroup.values());
    console.log(`${configuration.id} / ${set.playerCount} players / ${scenario.id}: ${count * set.playerCount} matches`);
  }
  manifest.finishedAt = new Date().toISOString();
  await writeReport(output, manifest, rows);
  console.log(`Report: ${join(output, 'report.html')} (${manifest.matchCount} matches)`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
