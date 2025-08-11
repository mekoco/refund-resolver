import { db } from '../config/firebase';
import { AccountingStatus, AccountStatus, RefundDetail, RefundReconciliation, ItemCondition } from '@packages/shared';

// Configurable epsilon for accounting validations
export const ACCOUNTING_EPSILON: number = (() => {
  const raw = process.env.ACCOUNTING_EPSILON;
  const parsed = raw ? Number(raw) : 0.01;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.01;
})();

async function computeOrderRefundSnapshot(orderId: string): Promise<{ accountedRefundAmount: number; accountStatus: AccountStatus }> {
  const refundSnap = await db
    .collection('refundDetails')
    .where('orderId', '==', orderId)
    .get();

  const refundDetails: (Partial<RefundDetail> & { id: string })[] = refundSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Gather reconciliations for these refund details
  const detailIds = refundDetails.map((r) => r.id);
  const detailIdToRecon: Record<string, RefundReconciliation[]> = {};
  if (detailIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < detailIds.length; i += 10) chunks.push(detailIds.slice(i, i + 10));

    const snapPromises = chunks.map((chunk) =>
      db.collection('refundReconciliations').where('refundDetailId', 'in', chunk).get()
    );
    const snaps = await Promise.all(snapPromises);
    for (const recSnap of snaps) {
      for (const d of recSnap.docs) {
        const data = { id: d.id, ...(d.data() as any) } as RefundReconciliation;
        const key = (data as any).refundDetailId as string;
        if (!detailIdToRecon[key]) detailIdToRecon[key] = [];
        detailIdToRecon[key].push(data);
      }
    }
  }

  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    try {
      const recs = detailIdToRecon[rd.id] || [];
      let actualValue = 0;
      if (recs.length > 0) {
        recs.sort((a: any, b: any) => {
          const aTime = (a.updatedAt as any)?.toDate ? (a.updatedAt as any).toDate().getTime() : new Date((a as any).updatedAt).getTime();
          const bTime = (b.updatedAt as any)?.toDate ? (b.updatedAt as any).toDate().getTime() : new Date((b as any).updatedAt).getTime();
          return bTime - aTime;
        });
        actualValue = Number((recs[0] as any)?.actualValue || 0);
      } else if (Array.isArray(rd.returnTrackings)) {
        for (const rt of rd.returnTrackings as any[]) {
          if (!Array.isArray((rt as any).returnItems)) continue;
          for (const item of (rt as any).returnItems as any[]) {
            const condition = (item?.condition as ItemCondition) ?? (item?.condition === 0 ? ItemCondition.GOOD : undefined);
            if (condition === ItemCondition.GOOD) {
              actualValue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
            }
          }
        }
      }
      return sum + (isNaN(actualValue) ? 0 : actualValue);
    } catch (err) {
      console.warn('SNAPSHOT_REDUCE_ERROR', { orderId, refundDetailId: rd.id, error: (err as Error).message });
      return sum;
    }
  }, 0);

  // Compute accountStatus
  let accountStatus: AccountStatus = AccountStatus.UNINITIATED;
  if (refundDetails.length > 0) {
    const allFully = refundDetails.every((rd) => rd.accountingStatus === AccountingStatus.FULLY_ACCOUNTED);
    accountStatus = allFully ? AccountStatus.FULLY_ACCOUNTED : AccountStatus.PARTIALLY_ACCOUNTED;
  }

  return { accountedRefundAmount, accountStatus };
}

export async function recomputeAndWriteOrderRefundSnapshot(orderId: string): Promise<void> {
  const { accountedRefundAmount, accountStatus } = await computeOrderRefundSnapshot(orderId);
  await db
    .collection('orders')
    .doc(orderId)
    .set({ refundAccount: { accountedRefundAmount, accountStatus } }, { merge: true });
}

// Computes the sum of refundAmount across all RefundDetails for a given order
export async function getRefundDetailsTotalAmount(orderId: string): Promise<number> {
  const snap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  return snap.docs.reduce((sum, d) => sum + Number(((d.data() as any)?.refundAmount) || 0), 0);
}

// Validates that the sum of RefundDetails equals the Order.buyerRefundAmount (within epsilon)
export async function validateRefundDetailsSumEqualsOrder(orderId: string, epsilon: number = ACCOUNTING_EPSILON): Promise<{ actualTotal: number; expectedTotal: number }> {
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