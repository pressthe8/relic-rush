import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../../', import.meta.url));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.(js|mjs|ts|tsx)$/.test(path)) result.push(path);
  }
  return result;
}
export function importTargets(source, file) {
  const targets = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) targets.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(tree) === 'require')) {
      assert.ok(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), `Nonliteral import requires boundary review: ${file}`);
      targets.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return targets;
}
function assertBoundary(file, target) {
  const resolved = target.startsWith('.') ? relative(root, resolve(root, dirname(file), target)) : target;
  const harness = resolved.startsWith('tools/playtesting/');
  if (file.startsWith('game/') || file.startsWith('src/') || file.startsWith('server/')) assert.ok(!harness, `${file} imports harness ${target}`);
  if (file.startsWith('game/')) assert.ok(resolved.startsWith('game/'), `Shared rules have external dependency: ${target}`);
  if (file.startsWith('tools/playtesting/') && resolved.startsWith('server/')) assert.ok(file.startsWith('tools/playtesting/adapters/'), `Server import outside adapter: ${file}`);
  if (file.startsWith('tools/playtesting/') && resolved.startsWith('src/')) assert.fail(`Harness imports frontend: ${file}`);
}
test('application, pure rules, and harness have one-way dependencies', async () => {
  for (const file of [...await files('game'), ...await files('src'), ...await files('server'), ...await files('tools/playtesting')]) {
    for (const target of importTargets(await readFile(resolve(root, file), 'utf8'), file)) assertBoundary(file, target);
  }
});
test('boundary scanner detects exports, imports, require and literal dynamic imports', () => {
  assert.deepEqual(importTargets("import x from './a.js'; export { x } from './b.js'; import('./c.js'); require('./d.js');", 'example.js'), ['./a.js', './b.js', './c.js', './d.js']);
  assert.throws(() => assertBoundary('src/a.ts', '../tools/playtesting/cli.js'), /harness/);
  assert.throws(() => assertBoundary('game/rules.js', 'node:fs'), /external/);
  assert.throws(() => assertBoundary('tools/playtesting/simulation/a.js', '../../../server/game-service.js'), /outside adapter/);
});
test('server deployment explicitly includes pure rules but not the harness', async () => {
  const docker = await readFile(resolve(root, 'Dockerfile'), 'utf8');
  assert.ok(docker.includes('COPY game ./game'));
  assert.ok(!/COPY\s+(\.|tools)/.test(docker));
  for (const name of ['.dockerignore', '.gcloudignore']) {
    const allowlist = await readFile(resolve(root, name), 'utf8');
    assert.ok(allowlist.startsWith('**\n'));
    assert.ok(allowlist.includes('!game/**'));
    assert.ok(!allowlist.includes('!tools'));
  }
});
