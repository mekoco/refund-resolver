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
    for (const chunk of chunks) {
      const recSnap = await db
        .collection('refundReconciliations')
        .where('refundDetailId', 'in', chunk)
        .get();
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
      recs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
    .set(
      {
        refundAccount: {
          refundDetails,
          accountedRefundAmount,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );
} 