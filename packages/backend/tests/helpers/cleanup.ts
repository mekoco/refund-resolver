import { db } from '../../src/config/firebase';

export async function deleteOrderCascade(orderId: string) {
  const batch = db.batch();
  // Delete refundDetails for the order
  const rdSnap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  for (const d of rdSnap.docs) {
    // Delete reconciliations for refund detail
    const recSnap = await db.collection('refundReconciliations').where('refundDetailId', '==', d.id).get();
    for (const r of recSnap.docs) batch.delete(r.ref);
    batch.delete(d.ref);
  }
  // Delete returns for the order
  const retSnap = await db.collection('returns').where('orderId', '==', orderId).get();
  for (const r of retSnap.docs) batch.delete(r.ref);
  // Delete the order doc itself
  const orderRef = db.collection('orders').doc(orderId);
  batch.delete(orderRef);
  await batch.commit();
}

export async function deleteOrdersCascade(orderIds: string[]) {
  const concurrency = 5;
  const queue = [...orderIds];
  const workers: Promise<void>[] = [];
  const runWorker = async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) return;
      await deleteOrderCascade(id);
    }
  };
  for (let i = 0; i < concurrency; i++) workers.push(runWorker());
  await Promise.all(workers);
} 