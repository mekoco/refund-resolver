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
    // Use local in-memory data for development
    console.log('Firebase skipped - using in-memory data store for development');
  }
};

initializeFirebase();

// Create a mock db object for local development
class MockFirestore {
  private collections: Map<string, Map<string, any>> = new Map();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const collectionData = this.collections.get(name)!;

    return {
      get: async () => {
        const docs = Array.from(collectionData.entries()).map(([id, data]) => ({
          id,
          data: () => data,
          exists: true
        }));
        return {
          empty: docs.length === 0,
          forEach: (callback: any) => docs.forEach(doc => callback(doc))
        };
      },
      doc: (id?: string) => {
        const docId = id || Math.random().toString(36).substring(7);
        return {
          get: async () => ({
            id: docId,
            exists: collectionData.has(docId),
            data: () => collectionData.get(docId)
          }),
          set: async (data: any) => {
            collectionData.set(docId, data);
            return;
          }
        };
      },
      add: async (data: any) => {
        const docId = Math.random().toString(36).substring(7);
        collectionData.set(docId, data);
        return {
          id: docId,
          get: async () => ({
            id: docId,
            data: () => data
          })
        };
      }
    };
  }

  batch() {
    const operations: Array<() => void> = [];
    return {
      set: (docRef: any, data: any) => {
        operations.push(() => {
          const collection = this.collections.get(docRef.parent?.id || 'default');
          if (collection) {
            collection.set(docRef.id, data);
          }
        });
      },
      commit: async () => {
        operations.forEach(op => op());
      }
    };
  }
}

export const db = process.env.NODE_ENV === 'production' && process.env.FIREBASE_PROJECT_ID 
  ? admin.firestore() 
  : new MockFirestore() as any;

export { admin };