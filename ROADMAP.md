# Relic Rush roadmap

## Invited playtest

- Keep the development Firebase project; matches default to two minutes for 2–6 players.
- Compare two-player and six-player rounds: time spent understanding hints, digs used, treasure discoveries, and desire to replay.
- Change `MATCH_DURATION_SECONDS` between sessions if players struggle. The chosen duration is stored in each lobby and stays fixed once that lobby is created.
- Review `gameHistory`: participant count, duration, completion reason, accepted moves, discovery order, and final scores. Use observations alongside these records; a high score alone does not show whether the rules are understandable.

## Before open public testing

- Hide treasure layouts and precise opposing discoveries from client-readable Firestore documents. Server lobby broadcasts already omit layouts, but the current subscriptions still expose them.
- Restrict reads by membership, review authorization and guest identity recovery, and perform adversarial tests of the deployed Firestore rules and socket commands.
- Add connection/action rate limits, abuse controls, and database cost monitoring.
- Review and update the inherited dependency tree and resolve package security advisories.
- Add a bounded retention policy for schema-v2 source records after successful archival. Existing legacy sessions and history must remain untouched.
- Introduce a separate production Firebase project and deployment monitoring when ready for public launch.

## Later product decisions

- Additional modes and board sizes, player names/accounts, visual redesign, and new mechanics follow playtest feedback.
- Horizontal scaling requires shared connection presence; this milestone runs one Node server instance.
