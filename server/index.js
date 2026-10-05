import 'dotenv/config';
import admin from 'firebase-admin';
import { createGameServer } from './transport.js';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID in .env.');
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.K_SERVICE && (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY)) {
  throw new Error('Set Firebase Admin credentials in .env, or use the local emulators.');
}
admin.initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : process.env.K_SERVICE ? {
  credential: admin.credential.applicationDefault()
} : {
  credential: admin.credential.cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') })
}) });
const seconds = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 86400) throw new Error(`${name} must be an integer from 1 to 86400.`);
  return value;
};
const gameServer = createGameServer(admin.firestore(), token => admin.auth().verifyIdToken(token), {
  lobbySeconds: seconds('LOBBY_DURATION_SECONDS', 600), matchSeconds: seconds('MATCH_DURATION_SECONDS', 120),
  clientOrigin: process.env.CLIENT_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean), staticDirectory: process.env.STATIC_DIRECTORY || 'dist'
});
await gameServer.start(Number(process.env.PORT || 3001));
console.log(`Relic Rush listening on port ${gameServer.port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await gameServer.close(); process.exit(0); });
