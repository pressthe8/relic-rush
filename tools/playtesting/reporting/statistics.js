export const METRICS = ['winCredit', 'outrightWin', 'explorerBeatsHybrid', 'score', 'discoveries', 'zeroFind', 'unusedDigs', 'digsUsed', 'exhaustedSeconds', 'durationSeconds', 'tieRate', 'deadlineRate', 'fairShareRatio', 'longestQuietSeconds', 'firstDigSeconds', 'deliberateWaitSeconds', 'zeroScore'];
export function interval(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  // Normal approximation over independent board-seed clusters, not individual seats.
  const halfWidth = n > 1 ? 1.96 * Math.sqrt(variance / n) : null;
  return { mean, low: halfWidth === null ? null : mean - halfWidth, high: halfWidth === null ? null : mean + halfWidth, seeds: n };
}
export function paired(left, right) {
  if (left.length !== right.length) throw new Error('Unpaired samples');
  return interval(left.map((value, i) => value - right[i]));
}
export function clusterMatches(matches, scenario) {
  const groups = new Map();
  for (const match of matches) for (const player of match.players) {
    const cohort = scenario.focal === null ? 'all' : player.playerId === scenario.players[scenario.focal].role ? 'focal' : 'opponents';
    const key = `${player.policy}/${cohort}`;
    const group = groups.get(key) || { policy: player.policy, cohort, count: 0, totals: Object.fromEntries(METRICS.map(k => [k, 0])) };
    group.count++;
    const values = { ...player, fairShareRatio: player.winCredit * match.players.length, longestQuietSeconds: match.longestQuietSeconds, durationSeconds: match.durationSeconds, tieRate: Number(match.tied), deadlineRate: Number(match.completionReason === 'deadline') };
    for (const metric of METRICS) group.totals[metric] += values[metric];
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ policy: group.policy, cohort: group.cohort,
    metrics: Object.fromEntries(METRICS.map(metric => [metric, group.totals[metric] / group.count])) }));
}
export function comparisons(rows) {
  const result = [];
  const find = (row, configurationId, scenarioId, policy = row.policy) => rows.find(r =>
    r.configurationId === configurationId && r.scenarioId === scenarioId && r.playerCount === row.playerCount && r.policy === policy && r.cohort === row.cohort);
  function compare(label, row, reference) {
    if (!reference) return;
    const difference = paired(row.samples.winCredit, reference.samples.winCredit);
    result.push({ label, playerCount: row.playerCount, configurationId: row.configurationId, scenarioId: row.scenarioId,
      policy: row.policy, cohort: row.cohort, reference: `${reference.configurationId}/${reference.scenarioId}/${reference.policy}/${reference.cohort}`, ...difference,
      interpretation: difference.low === null ? 'insufficient seeds' : difference.low > 0 ? 'higher win credit' : difference.high < 0 ? 'lower win credit' : 'inconclusive' });
  }
  for (const row of rows) {
    if (row.configurationId !== 'baseline') compare('Setting versus baseline', row, find(row, 'baseline', row.scenarioId));
    if (row.cohort !== 'focal') continue;
    if (row.scenarioId === 'pace-1000' || row.scenarioId === 'pace-8000' || row.scenarioId === 'latency-500') {
      compare('Timing versus equal-speed 100ms', row, find(row, row.configurationId, 'pace-3000'));
    }
    if (row.scenarioId.endsWith('-vs-adaptive') && row.policy !== 'hybrid50') {
      compare('Tactic versus reference in adaptive field', row, find(row, row.configurationId, 'hybrid50-vs-adaptive', 'hybrid50'));
    }
    if (['probability-pace-1000', 'probability-pace-8000', 'probability-latency-500'].includes(row.scenarioId)) {
      compare('Probability timing versus equal speed', row, find(row, row.configurationId, 'probability-pace-3000'));
    }
    const counterpart = row.configurationId.replace('-player-count', '-current');
    if (counterpart !== row.configurationId) compare('Scoring at the same relic count', row, find(row, counterpart, row.scenarioId));
    if (row.scenarioId === 'pace-3000') {
      compare('Hybrid versus pure hint policy', row, find(row, row.configurationId, 'hint-vs-hybrid50', 'hint'));
      compare('Hybrid versus explorer policy', row, find(row, row.configurationId, 'explorer-vs-hybrid50', 'explorer'));
    }
    for (const background of ['explorer', 'hybrid50']) {
      if (!row.scenarioId.endsWith(`-vs-${background}`)) continue;
      if (row.policy.startsWith('hybrid')) {
        compare('Hybrid versus pure hint policy', row, find(row, row.configurationId, `hint-vs-${background}`, 'hint'));
        // Homogeneous explorer has no focal row; pace-3000 likewise supplies a homogeneous hybrid comparison.
        if (background === 'hybrid50') compare('Hybrid versus explorer policy', row, find(row, row.configurationId, 'explorer-vs-hybrid50', 'explorer'));
      }
      if (row.policy === 'patient') compare('Waiting versus immediate hints', row, find(row, row.configurationId, `hint-vs-${background}`, 'hint'));
    }
  }
  // Homogeneous random explorers are exchangeable: each has expected win credit 1/N.
  for (const row of rows.filter(r => r.cohort === 'focal' && r.scenarioId.endsWith('-vs-explorer'))) {
    const difference = interval(row.samples.winCredit.map(v => v - 1 / row.playerCount));
    result.push({ label: 'Strategy versus explorer symmetry baseline', configurationId: row.configurationId,
      playerCount: row.playerCount, scenarioId: row.scenarioId, policy: row.policy, reference: '1/playerCount', ...difference,
      cohort: row.cohort,
      interpretation: difference.low === null ? 'insufficient seeds' : difference.low > 0 ? 'higher win credit' : difference.high < 0 ? 'lower win credit' : 'inconclusive' });
  }
  return result;
}
