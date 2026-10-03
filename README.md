# Relic Rush

A quick competitive treasure hunt for 2–6 invited players. The supported playtest mode uses a 6×6 grid, five shared treasures, ten initial digs, and two-minute matches. Each treasure grants a bonus dig. Discoveries earn 100, 80, 60, 40, 20, then zero points according to the order players find that treasure. Heat-map hints show unique treasures opponents have found in a region that you have not yet found.

## Lobby and match flow

The lobby has a ten-minute countdown. It starts when six players join, when the countdown expires with at least two players, or when at least two players have joined and everyone presses **Ready**. Readiness is optional; it does not block the other start conditions. New players begin unready. A new lobby appears immediately after a match starts, and spectators stay there.

With fewer than two players at countdown expiry, the session is cancelled and replaced. A waiting player who disconnects is removed from that lobby's membership; reconnecting can join again. Multiple tabs share a guest identity, and closing one tab does not remove a player while another tab stays connected.

Matches end after 120 seconds or when everyone exhausts their digs. Scores earned before the deadline remain valid. Refreshing or reconnecting restores progress with the original deadline. Returning after expiry shows results. Equal scores share a rank. **Play Again** returns to the next lobby.

## Local setup with the existing development project

Use Node.js 22 or newer and npm. No production Firebase project is required.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` if needed, retaining the existing development project's client settings. Supply its Firebase Admin service-account email and private key. Keep `.env` private. Never place Admin credentials in variables starting with `VITE_`.
3. Enable Firebase Anonymous Authentication and Firestore in the development project.
4. Apply the checked-in `firestore.rules` to that project before inviting testers. Clients subscribe to sessions and boards; the Admin server performs writes. The new rules intentionally deny client writes. Old frontend builds that write directly to Firestore should be retired when these rules are applied. Do not reset or delete the database.
5. Run `npm run dev`, then open the displayed Vite URL. Vite proxies the socket connection to the Node server on port 3001.

Timing can be set in `.env`:

```env
LOBBY_DURATION_SECONDS=600
MATCH_DURATION_SECONDS=120
PORT=3001
```

Restart after changing these values. They apply to newly created lobbies; already-created lobbies and active deadlines retain their settings.

Anonymous Firebase authentication supplies identity without a login screen. Browser storage retains that identity and the last selected session. Clearing browser storage creates a new guest. Older mock-player history is preserved and is not automatically assigned to the new Firebase guest identity.

## Hosting an invited playtest

Run `npm ci`, `npm run build`, then `npm start` on a Node host that supports long-lived WebSocket connections. The server serves `dist/` and Socket.IO from the same origin. Supply the development Firebase client variables at build time and Admin credentials at runtime. The host can set `PORT`; `/health` returns HTTP 200 only when the game service is healthy.

Run **one Node instance** for this milestone. Durable transactions prevent duplicate starts and moves, while connection presence is maintained in that instance. Deploying this repository does not require creating a production Firebase project.

For separate frontend/server hosts, set `VITE_SERVER_URL` before building and set `CLIENT_ORIGIN` on the server to that exact frontend origin. No server address is hardcoded in the frontend.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The emulator checks require a Firebase CLI on your path, Java 21+, and Chromium for Playwright:

```sh
npm install --global firebase-tools
npx playwright install chromium
npm run test:emulators
npm run test:playtest
```

Both emulator commands explicitly use the fake project **demo-relic-rush**, not the development database. Integration tests refuse to run without both emulators. Browser tests run the frontend and server with demo configuration and shortened timers to exercise expiry quickly; integration checks verify the actual 120-second default. Do not run emulator suites against an existing shared emulator session: the integration suite resets the demo database between tests.

Tests cover scoring, independent board copies, unique treasure placement, hints, readiness and capacity races, spectators, simultaneous discoveries, duplicate moves, disconnects, multiple tabs, recovery, deadline expiry, early completion, ties, archive retries, and server restart. Browser checks exercise two- and six-player flows, a mobile viewport, slower requests, refresh, reconnect, results, and replay. Failure traces and screenshots are written to `.test-results/`.

## Data and recovery

New sessions have `schemaVersion: 2`; they retain the existing collections and add lifecycle fields, a persisted lobby pointer, guest ownership, fixed participant IDs, deadlines, accepted-move counts, and retry identifiers. Legacy records are left intact. Server startup restores version-two sessions without cancelling them or restarting their clocks. Waiting memberships get ten seconds to reconnect after a restart; absent guests are then removed.

History and aggregate stats are written in a single transaction with an archive marker. Retrying cannot double-count a match. Source sessions and boards are retained, including when archiving fails. Archive failures are retried by the maintenance loop and after restart. A future retention policy is tracked in [ROADMAP.md](ROADMAP.md).

This release is intended for invited testers. Hidden board information is still present in client-readable Firestore state; public integrity hardening and dependency maintenance are tracked in the roadmap.
