import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const initializeFirebase = () => {
  if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('Firebase initialized with service account');
  } else {
    // Initialize for local development with emulator
    admin.initializeApp({
      projectId: 'demo-test',
    });
    console.log('Firebase initialized for local development with emulator');
  }
};

initializeFirebase();

// Get Firestore instance
const db = admin.firestore();

// Connect to emulator in development
if (process.env.NODE_ENV !== 'production') {
  db.settings({
    host: 'localhost:8080',
    ssl: false
  });
  console.log('Connected to Firestore emulator at localhost:8080');
}

export { db };

export { admin };