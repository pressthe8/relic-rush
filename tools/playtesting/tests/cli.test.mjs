import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const run = args => execFileSync(process.execPath, ['tools/playtesting/cli.js', ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
test('CLI writes complete artifacts, verifies replay and protects completed runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relic-balance-'));
  try {
    const output = join(directory, 'run');
    run(['--preset', 'baseline', '--matches', '2', '--players', '2', '--scenario', 'hybrid50-vs-explorer', '--output', output]);
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.matchCount, 4);
    assert.deepEqual(manifest.seeds, [1, 2]);
    assert.match(manifest.source.fingerprint, /^[a-f0-9]{64}$/);
    for (const filename of ['aggregate.csv', 'results.json', 'report.html']) assert.ok((await readFile(join(output, filename))).length > 100);
    const example = join(output, 'examples/baseline-2-hybrid50-vs-explorer.json');
    assert.match(run(['--replay', example, '--output', join(directory, 'replayed')]), /Replay verified/);
    assert.throws(() => run(['--matches', '1', '--output', output]), /already contains a run/);
    const altered = JSON.parse(await readFile(example, 'utf8'));
    altered.fingerprint = 'wrong';
    const changed = join(directory, 'changed.json');
    await writeFile(changed, JSON.stringify(altered));
    assert.throws(() => run(['--replay', changed, '--output', join(directory, 'mismatch')]), /Source differs/);
    assert.throws(() => run(['--preset', 'confirm', '--matches', '1', '--output', join(directory, 'invalid')]), /explicitly selected/);
    const config = join(directory, 'config.json');
    await writeFile(config, JSON.stringify([{ id: 'chosen', treasureCount: 6, durationSeconds: 90, scoring: 'gentle' }]));
    const confirmation = join(directory, 'confirm');
    run(['--preset', 'confirm', '--config', config, '--matches', '1', '--players', '2', '--scenario', 'all-hybrid50', '--output', confirmation]);
    const confirmed = JSON.parse(await readFile(join(confirmation, 'manifest.json'), 'utf8'));
    assert.deepEqual(confirmed.seeds, [1000001]);
    assert.equal(confirmed.configurations[0].startingDigs, 10);

    const trained = join(directory, 'trained');
    run(['--preset', 'tune', '--config', config, '--matches', '1', '--players', '3', '--output', trained]);
    const lock = join(trained, 'tactics.lock.json');
    const evaluated = join(directory, 'evaluated');
    run(['--suite', 'adversarial', '--tactics', lock, '--matches', '1', '--players', '3,5', '--scenario', 'all-opportunist', '--output', evaluated]);
    const evaluation = JSON.parse(await readFile(join(evaluated, 'manifest.json'), 'utf8'));
    assert.equal(evaluation.matchCount, 8 * 4);
    assert.deepEqual(evaluation.seeds, [40001]);
    assert.ok(evaluation.source.snapshot);
    assert.throws(() => run(['--suite', 'adversarial', '--tactics', lock, '--matches', '1', '--seed', '20001', '--output', join(directory, 'overlap')]), /overlap/);

  } finally { await rm(directory, { recursive: true, force: true }); }
});
