import { defineConfig } from '@playwright/test'

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Run browser checks inside Firebase emulators:exec, using the demo-relic-rush project.')
}
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  outputDir: '.test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  },
  webServer: {
    // Match the browser's IPv4 URL even when localhost resolves to IPv6 first.
    command: 'node tests/reset-emulators.mjs && concurrently --kill-others-on-fail "npm run server" "vite --host 127.0.0.1 --strictPort"',
    url: 'http://127.0.0.1:5173/health', reuseExistingServer: false, timeout: 30000,
    stdout: 'pipe',
    env: {
      FIREBASE_PROJECT_ID: 'demo-relic-rush', VITE_FIREBASE_PROJECT_ID: 'demo-relic-rush',
      VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-relic-rush.firebaseapp.com',
      VITE_FIREBASE_APP_ID: 'demo-app', VITE_USE_EMULATORS: 'true', VITE_SERVER_URL: '',
      LOBBY_DURATION_SECONDS: '40', MATCH_DURATION_SECONDS: '20', PORT: '3001'
    }
  }
})
