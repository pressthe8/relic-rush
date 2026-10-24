import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { interval, METRICS, comparisons } from './statistics.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const number = value => value === null ? '—' : value.toFixed(3);
export async function writeReport(directory, manifest, rows) {
  const aggregates = rows.map(({ samples, ...row }) => ({ ...row,
    metrics: Object.fromEntries(METRICS.map(metric => [metric, interval(samples[metric])])) }));
  const differences = comparisons(rows);
  await writeSummaryReport(directory, manifest, aggregates, differences);
  return { aggregates, comparisons: differences };
}

// Rendering accepts summaries independently of the simulator so reports can be reused or combined.
export async function writeSummaryReport(directory, manifest, aggregates, differences) {
  const columns = ['configurationId', 'playerCount', 'scenarioId', 'policy', 'cohort', 'metric', 'mean', 'low', 'high', 'seeds'];
  const records = aggregates.flatMap(row => METRICS.map(metric => [row.configurationId, row.playerCount, row.scenarioId, row.policy, row.cohort, metric,
    row.metrics[metric].mean, row.metrics[metric].low ?? '', row.metrics[metric].high ?? '', row.metrics[metric].seeds]));
  await writeFile(join(directory, 'aggregate.csv'), [columns, ...records].map(row => row.map(csv).join(',')).join('\n') + '\n');
  await writeFile(join(directory, 'results.json'), JSON.stringify({ aggregates, comparisons: differences }, null, 2));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const headers = ['Configuration', 'Players', 'Scenario', 'Policy', 'Group', 'Win credit', 'Finds', 'Zero finds', 'Score', 'Unused digs', 'Exhausted seconds', 'Duration', 'Tie rate', 'Deadline rate', 'Longest quiet seconds', 'First dig seconds', 'Deliberate wait seconds'];
  const tr = cells => `<tr>${cells.map(v => `<td>${escape(v)}</td>`).join('')}</tr>`;
  const table = `<table><thead>${tr(headers)}</thead><tbody>${aggregates.map(row => tr([
    row.configurationId, row.playerCount, row.scenarioId, row.policy, row.cohort,
    ...['winCredit', 'discoveries', 'zeroFind', 'score', 'unusedDigs', 'exhaustedSeconds', 'durationSeconds', 'tieRate', 'deadlineRate', 'longestQuietSeconds', 'firstDigSeconds', 'deliberateWaitSeconds'].map(m => number(row.metrics[m].mean))])).join('')}</tbody></table>`;
  const differenceTable = `<table><thead>${tr(['Comparison', 'Configuration', 'Players', 'Scenario', 'Policy', 'Group', 'Reference', 'Win-credit difference', '95% interval', 'Evidence'])}</thead><tbody>${differences.map(row => tr([
    row.label, row.configurationId, row.playerCount, row.scenarioId, row.policy, row.cohort, row.reference, number(row.mean), `${number(row.low)} to ${number(row.high)}`, row.interpretation])).join('')}</tbody></table>`;
  await writeFile(join(directory, 'report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relic Rush balance experiments</title>
<style>body{font:15px system-ui;margin:2rem;color:#163b31}h1,h2{color:#123d32}p{max-width:85ch;line-height:1.6}table{border-collapse:collapse;font-size:12px;margin:1rem 0}td{padding:7px;border:1px solid #ccd9d2}thead{background:#e5f1e9;font-weight:bold;position:sticky;top:0}tbody tr:nth-child(even){background:#f4f8f5}.scroll{overflow:auto;max-height:65vh}input{padding:10px;width:30rem;max-width:90%}</style>
<h1>Relic Rush balance experiments</h1><p>${escape(manifest.matchCount)} matches · ${escape(manifest.seeds.length)} independent board seeds per condition · ${escape(manifest.preset)} · engine ${escape(manifest.engineVersion)}</p>
<p><strong>Target:</strong> a mix of exploration and hints should outperform pure exploration over repeated matches while preserving lucky upsets. No settings have been promoted automatically.</p>
<p><strong>Modelling assumptions:</strong> bots understand hints perfectly, use specified decision intervals including explicit sprints, and have fixed symmetric one-way request/update latency. Adaptive tactics use only delivered observations and public rule settings, and stop digging once they have found every relic. Probability estimates assume uniform layouts consistent with visible constraints and do not model opponent selection bias. They do not model human confusion, learning, fatigue, connection loss, or enjoyment. At most one move is outstanding per player. Scores across scoring policies are not directly comparable; use win credit and discoveries.</p>
<p><strong>Uncertainty:</strong> paired comparisons reuse board seeds; all seat rotations are one cluster. Intervals are approximate 95% normal intervals over seed means. Screening makes many comparisons without multiple-testing correction: confirm candidates on fresh seeds. “Inconclusive” does not establish equivalence. Rates are fractions, not percentages. Full metric intervals are in aggregate.csv and results.json.</p>
<label>Filter tables <input id="filter" placeholder="e.g. hybrid50, scoring-gentle"></label><h2>Aggregate outcomes</h2><div class="scroll">${table}</div><h2>Paired comparisons and timing sensitivity</h2><div class="scroll">${differenceTable}</div>
<p>Read manifest.json for complete configurations, scenario definitions, seeds, source fingerprint, and replay instructions. examples/ contains replayable action traces. Preserve the complete directory when sharing results.</p>
<script>document.getElementById('filter').addEventListener('input',event=>{const q=event.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q))})</script></html>`);
  return { aggregates, comparisons: differences };
}
