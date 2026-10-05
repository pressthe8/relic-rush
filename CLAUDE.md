# Relic Rush — Claude Code Guide

## Project Overview

**Relic Rush** is a real-time competitive multiplayer treasure-hunting game. Players dig a shared hidden grid, compete for first-discovery bonuses, and use a heat-map hint system showing where opponents are finding more treasure.

**Stack:** React 18 + TypeScript + Tailwind CSS (Vite) · Firebase Firestore (game state) · Socket.IO + Express (lobby) · Firebase Anonymous Auth

---

## Architecture at a Glance

```
src/
  App.tsx                    ← Screen router: introduction | lobby | game
  components/
    GameIntroduction.tsx     ← Landing/rules screen
    SocketGameLobby.tsx      ← Real-time lobby (Socket.IO)
    MultiplayerBoard.tsx     ← Active game grid
    GameFinale.tsx           ← Leaderboard & results
    Square.tsx               ← Individual grid cell with heat-map hints
  hooks/
    useMultiplayerGame.ts    ← Core game state, dig logic, Firebase listeners
    useSocketLobby.ts        ← Lobby state via Socket.IO
  utils/
    gameLogic.ts             ← Pure functions: board creation, treasure placement, scoring
    centralHintUtils.ts      ← Heat-map discovery gap calculation
    subGridUtils.ts          ← Sub-grid coordinate math for hints
  lib/
    firebase.ts              ← Firestore helpers, ID/code generation, real-time subscriptions
  types/index.ts             ← Shared TypeScript interfaces
server/
  index.js                   ← Express + Socket.IO server: lobby management, archiving, cleanup
```

**Data flow:** Client digs → Firebase playerBoard + allDiscoveries updated → Firestore `onSnapshot` triggers on all clients → hint recalculation → UI update

**Session lifecycle:** `waiting → scheduled → active → completed/cancelled`

---

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```env
# Firebase Client (Web — must be VITE_ prefixed)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

# Firebase Server (Admin SDK — used by server/index.js)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Firebase project requirements:
- **Anonymous Authentication** enabled (Authentication → Sign-in method → Anonymous)
- **Firestore** in production mode with these security rules:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /gameSessions/{sessionId} {
        allow read, write: if request.auth != null;
      }
      match /playerBoards/{playerId} {
        allow read, write: if request.auth != null;
      }
    }
  }
  ```

---

## Running Locally

```bash
npm install
npm run dev        # Starts BOTH frontend (port 5173) and Socket.IO server (port 3001)
```

The `dev` script uses `concurrently` to run client and server simultaneously. You need both running — the frontend connects to `localhost:3001` for lobby Socket.IO events, and to Firebase directly for game state.

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Frontend + server together (use this) |
| `npm run server` | Socket.IO server only |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

---

## Testing

> No tests exist yet. The plan below is what to implement.

**Framework:** Vitest (zero additional config — shares Vite pipeline)

### Setup (not yet done)

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Add to `vite.config.ts`:
```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
}
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

Create `src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

### Running tests (once set up)

```bash
npm test           # Run once
npm run test:watch # Watch mode
npm run test:ui    # Visual browser UI
```

### What to test (priority order)

All smoke tests are **pure unit tests — no Firebase or Socket.IO mocking needed**.

| File | Functions covered |
|---|---|
| `src/utils/gameLogic.test.ts` | `calculatePoints`, `generateTreasurePositions`, `createInitialBoard`, `placeTreasures` |
| `src/utils/centralHintUtils.test.ts` | `calculateSubGridHintsFromCentralLog` (the heat-map logic) |
| `src/utils/subGridUtils.test.ts` | `getSubGridIndex`, `getSubGridBounds`, `getHintIntensityClass` |
| `src/lib/firebase.test.ts` | `generateMockPlayerId`, `generateGameCode`, `isValidGameCode` |

Critical assertions:
- `calculatePoints(1) === 100`, `calculatePoints(6) === 0`
- `generateTreasurePositions` returns unique, in-bounds positions
- `placeTreasures` does not mutate the original board
- Discovery gap of 2 (opponent found 2, you found 0) → hint intensity 2
- `isValidGameCode('ABC123') === true`, `isValidGameCode('abc') === false`

---

## Deployment

No deployment config exists yet. When ready:

- **Frontend:** Static build via `npm run build` → deploy `dist/` to Vercel / Netlify / Firebase Hosting
- **Server:** `server/index.js` is a standard Node.js Express app. Binds to `process.env.PORT || 3001`. Deploy to Railway / Render / Fly.io.
- **After deploy:** Update the Socket.IO client URL in `src/hooks/useSocketLobby.ts` from `localhost:3001` to your server's public URL.
- **CORS:** The server currently uses `origin: true` (permissive). Lock this down to your frontend domain before going to production.
- Set all 10 environment variables in your platform's dashboard (7 `VITE_*` for the frontend build, 3 `FIREBASE_*` for the server).

---

## Key Decisions & Constraints

- **Private games are disabled** — `ENABLE_PRIVATE_GAMES = false` in `App.tsx`. The UI and hook logic exist in `MultiplayerSetup.tsx` and `useMultiplayerGame.ts` but are not wired up.
- **Solo/practice mode is hidden** — `useGameState.ts` and `useSinglePlayerGame.ts` hooks exist but the mode is not exposed in the screen router.
- **Player identity is anonymous** — mock player IDs stored in `localStorage` (`mock_player_*`). No login required.
- **Board state is JSON-serialised** in Firestore as a string (Firestore document size limit workaround).
- **Lobby games are hardcoded** — 6×6 grid, 5 treasures, 10 digs. Configured in `server/index.js` `createLobbyGame()`.
- **Cleanup runs hourly** — server archives and deletes games older than 24 hours automatically.
