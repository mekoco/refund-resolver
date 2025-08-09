import { db, admin } from '../config/firebase';

async function deleteCollectionRecursive(collectionPath: string): Promise<void> {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  const deleteDocRecursive = async (docRef: FirebaseFirestore.DocumentReference) => {
    const subcollections = await docRef.listCollections();
    for (const sub of subcollections) {
      // Recurse into subcollection
      await deleteCollectionRecursive(`${docRef.path}/${sub.id}`);
    }
    await docRef.delete();
  };

  for (const doc of snapshot.docs) {
    await deleteDocRecursive(doc.ref);
  }
}

async function clearAllCollections() {
  try {
    const collections = await db.listCollections();
    if (collections.length === 0) {
      console.log('No collections found. Firestore is already empty.');
      return;
    }

    console.log(`Found ${collections.length} top-level collections: ${collections.map(c => c.id).join(', ')}`);

    // Use BulkWriter for better throughput
    const writer = db.bulkWriter();

    // Helper to delete docs in batches for a given collection
    const deleteCollectionInBatches = async (col: FirebaseFirestore.CollectionReference) => {
      const batchSize = 500;
      while (true) {
        const snap = await col.limit(batchSize).get();
        if (snap.empty) break;
        const tasks: Promise<void>[] = [];
        for (const doc of snap.docs) {
          // Ensure subcollections are removed first
          tasks.push((async () => {
            const subs = await doc.ref.listCollections();
            for (const s of subs) {
              await deleteCollectionRecursive(`${doc.ref.path}/${s.id}`);
            }
            writer.delete(doc.ref);
          })());
        }
        await Promise.all(tasks);
        await writer.flush();
      }
    };

    for (const col of collections) {
      console.log(`Clearing collection: ${col.id}`);
      await deleteCollectionInBatches(col);
      console.log(`Cleared collection: ${col.id}`);
    }

    await writer.close();
    console.log('✅ All Firestore collections cleared.');
  } catch (err) {
    console.error('Error clearing Firestore:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to clear Firestore in production environment.');
    process.exit(1);
  }
  clearAllCollections().then(() => process.exit(0));
}

export { clearAllCollections }; 