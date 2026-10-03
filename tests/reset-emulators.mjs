// Browser fixtures must start with an empty demo database so persisted timing is not inherited.
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('This reset is only available with the local Firebase emulators.');
}
const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-relic-rush/databases/(default)/documents`, { method: 'DELETE' });
if (!response.ok) throw new Error(`Could not reset the demo database: ${response.status}`);
