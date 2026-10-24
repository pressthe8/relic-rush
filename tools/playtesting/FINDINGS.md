# Initial balance screening — 22 October 2026

Completed **2,880,000 deterministic matches**: 12 rule configurations × 20 scenarios × 1,000 board seeds × every seat rotation for 2, 4 and 6 players. The player-count partitions use identical source fingerprints, configurations and seeds. No live settings were changed.

The full local report is [report.html](../../.balance-results/screening/report.html); machine-readable results, intervals, manifest and replayable examples are beside it. These large artifacts are ignored by Git. Preserve the run directory with the matching source checkout if sharing or retaining it.

## Higher relic counts

These rows use homogeneous 50/50 hybrid bots, three seconds thinking after each acknowledgement, 100 ms one-way latency and the existing scoring. Finds and empty-round rates are per player; duration is actual match duration, including early completion.

| Relics | Players | Mean finds | No relics found | Mean round duration |
|---|---|---|---|---|
| 5 | 2 | 2.15 | 7.0% | 40.2s |
| 8 | 2 | 3.74 | 1.3% | 45.8s |
| 10 | 2 | 4.96 | 0.5% | 50.3s |
| 5 | 4 | 2.72 | 3.1% | 43.6s |
| 8 | 4 | 4.47 | 0.5% | 50.7s |
| 10 | 4 | 5.76 | 0.2% | 55.8s |
| 5 | 6 | 2.98 | 2.1% | 45.2s |
| 8 | 6 | 4.77 | 0.4% | 53.0s |
| 10 | 6 | 6.10 | 0.1% | 58.4s |

Eight and ten relics produce more discoveries and fewer empty rounds. They also extend active play. This supports comparing both counts with humans; it does not establish that the denser game is more enjoyable. Ten relics can require up to 20 digs because treasure digs are refunded, so a shorter clock needs its own combined experiment.

## Two-player rounds deserve a separate decision

Each strategy below is a single focal player against 50/50 hybrid opponents. Percentages are **win credit**, splitting ties equally; a fair share is 50%, 25% or 16.7% for 2, 4 or 6 players.

| Players | Explorer | Hints first | Patient follower |
|---|---|---|---|
| 2 | 40.2% | 57.0% | 67.2% |
| 4 | 11.4% | 40.8% | 27.1% |
| 6 | 7.3% | 36.1% | 6.5% |

The patient follower waits for the first quarter of the round and reserves its last two digs until halfway. In two-player games its win credit rises from **67.2% at five relics to 78.2% at eight and 79.0% at ten**. More relics therefore do not solve the two-player waiting incentive under current scoring. The ordinary opponent spends roughly 31–34 seconds out of digs in those patient-versus-hybrid matches.

Prioritize four- and six-player human sessions when judging the denser boards. Keep two-player results as a diagnostic control; whether to offer the mode publicly is a product decision informed by actual enjoyment, not a bot score.

## Scoring and strategy

The player-count curve is a useful confirmation candidate: it declines from 100 for the first finder to 40 for the last. At two players, patient win credit falls from 67.2% to 49.8%. At six players, the one-second hybrid changes from 23.4% win credit to 15.1%, compared with 16.9% for the equal-speed hybrid under that curve. The paired fast-versus-equal-speed interval includes zero: this is inconclusive evidence of a remaining timing advantage, not proof of equivalence. Four-player scoring is exactly the existing 100/80/60/40 curve.

Gentler scoring and the 80-plus-first-finder-bonus alternative reward waiting more in larger groups. With six players, patient win credit rises from 6.5% under current scoring to 21.4% with gentle scoring and 31.4% with the first-finder bonus. Do not assume a smaller speed reward automatically improves active play.

Hints-first is usually stronger than a fixed exploration probability. It still explores whenever no hints exist, so it is already a mix of exploration and following discoveries. These bots do not establish an optimal strategy or adapt their policy to each scoring curve.

Pure explorers retain lucky wins but are disadvantaged. Under the baseline against hybrid opponents, their outright win rates are 35.7% with 2 players, 10.1% with 4 players, 6.5% with 6 players.

## Suggested next experiments

Compare 8 and 10 relics in human four- and six-player rounds. For a fresh-seed automated confirmation, compare the original baseline with 8 and 10 relics using the player-count scoring curve. Those combined settings have **not** been screened together; the next run tests their interaction and may reject them.

```sh
npm run balance -- --preset confirm --players 4,6 --config .balance-results/screening/candidates.json
```

The candidate file is explicit, defaults to 10,000 new seeds per condition, and does not promote a winner. Larger counts and 60/90-second limits should be combined only in a subsequent selected experiment, rather than inferred from the one-variable screen.

## Verification and limits

- 19 harness tests, 13 existing unit tests, 15 server integration tests, 4 emulator parity tests and all 7 browser tests passed. Type checks, lint and the production build passed. Browser execution used the installed Chrome and IPv4 localhost resolution.
- The report was checked in headless Chrome: filtering worked, tables rendered and no page errors occurred. Dependency checks enforce isolation and packaging; the frontend bundle excludes the harness.
- An independent random-player sanity check over 20,000 players produced 1.571 mean finds and 17.29% empty rounds versus analytical expectations of 1.5625 and 17.45%.
- Known equivalent scoring cases were checked: the four-player count-adjusted curve matches baseline, and the two-player first-finder-bonus curve matches baseline.
- Intervals use independent board-seed clusters, grouping all rotations together. Screening makes many comparisons without adjustment; confirm selected findings on new seeds.
- Bots understand hints perfectly, have fixed thinking/latency assumptions and do not model learning, confusion, fatigue, disconnections or fun. Their fixed policies do not react strategically to new reward curves.

Runtime engine: `1-rules1-bots1`. Source fingerprint: `d8be19545fb478b35721a265a220391f3fb4782a8bd430952ebdebe64a52d3ec`. See [architecture.md](../../architecture.md) for boundaries, definitions, timing and extension instructions.
