import { db } from '../config/firebase';

export async function recomputeAndWriteOrderRefundSnapshot(orderId: string): Promise<void> {
  const refundSnap = await db
    .collection('refundDetails')
    .where('orderId', '==', orderId)
    .get();

  const refundDetails: any[] = refundSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Gather reconciliations for these refund details
  const detailIds = refundDetails.map((r) => r.id);
  let detailIdToRecon: Record<string, any[]> = {};
  if (detailIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < detailIds.length; i += 10) chunks.push(detailIds.slice(i, i + 10));

    const snapPromises = chunks.map((chunk) =>
      db.collection('refundReconciliations').where('refundDetailId', 'in', chunk).get()
    );
    const snaps = await Promise.all(snapPromises);
    for (const recSnap of snaps) {
      for (const d of recSnap.docs) {
        const data = { id: d.id, ...d.data() } as any;
        const key = data.refundDetailId;
        if (!detailIdToRecon[key]) detailIdToRecon[key] = [];
        detailIdToRecon[key].push(data);
      }
    }
  }

  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    const recs = detailIdToRecon[rd.id] || [];
    let actualValue = 0;
    if (recs.length > 0) {
      recs.sort((a, b) => {
        const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt).getTime();
        const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });
      actualValue = Number(recs[0]?.actualValue || 0);
    } else if (Array.isArray(rd.returnTrackings)) {
      for (const rt of rd.returnTrackings) {
        if (!Array.isArray(rt.returnItems)) continue;
        for (const item of rt.returnItems) {
          if (item?.condition === 'GOOD' || item?.condition === 0) {
            actualValue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
          }
        }
      }
    }
    return sum + (isNaN(actualValue) ? 0 : actualValue);
  }, 0);

  await db
    .collection('orders')
    .doc(orderId)
    .set({ refundAccount: { accountedRefundAmount } }, { merge: true });
}

// Computes the sum of refundAmount across all RefundDetails for a given order
export async function getRefundDetailsTotalAmount(orderId: string): Promise<number> {
  const snap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  return snap.docs.reduce((sum, d) => sum + Number((d.data() as any)?.refundAmount || 0), 0);
}

// Validates that the sum of RefundDetails equals the Order.buyerRefundAmount (within epsilon)
export async function validateRefundDetailsSumEqualsOrder(orderId: string, epsilon: number = 0.01): Promise<{ actualTotal: number; expectedTotal: number }> {
  const orderDoc = await db.collection('orders').doc(orderId).get();
  if (!orderDoc.exists) throw new Error(`Order ${orderId} not found`);
  const order = orderDoc.data() as any;
  const expectedTotal = Number(order?.buyerRefundAmount || 0);
  const actualTotal = await getRefundDetailsTotalAmount(orderId);
  if (Math.abs(actualTotal - expectedTotal) > epsilon) {
    throw new Error(`RefundDetails sum (${actualTotal}) does not match order refund amount (${expectedTotal})`);
  }
  return { actualTotal, expectedTotal };
} 