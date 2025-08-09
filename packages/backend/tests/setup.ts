import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test';

// Nothing to start here; tests will assume emulator and server are running externally.
// We keep setup minimal and rely on scripts to orchestrate emulator + server. 