import { db, admin } from '../config/firebase';
import { AccountingStatus, AccountStatus, ItemCondition } from '@packages/shared';
import { RefundDetailDoc, RefundReconciliationDoc, ReturnTrackingDoc } from '../types/firestore';

// Configurable epsilon for accounting validations
export const ACCOUNTING_EPSILON: number = (() => {
  const raw = process.env.ACCOUNTING_EPSILON;
  const parsed = raw ? Number(raw) : 0.01;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.01;
})();

// Optional in-memory cache for snapshots to reduce recomputation hot paths
const SNAPSHOT_CACHE_TTL_MS: number = (() => {
  const raw = process.env.SNAPSHOT_CACHE_TTL_MS;
  const parsed = raw ? Number(raw) : 5 * 60 * 1000; // default 5 minutes
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5 * 60 * 1000;
})();

type SnapshotCacheValue = { accountedRefundAmount: number; accountStatus: AccountStatus; cachedAt: number };
const snapshotCache = new Map<string, SnapshotCacheValue>();

function isCacheValid(entry?: SnapshotCacheValue): boolean {
  if (!entry) return false;
  if (SNAPSHOT_CACHE_TTL_MS === 0) return false;
  return Date.now() - entry.cachedAt <= SNAPSHOT_CACHE_TTL_MS;
}

function toMillis(ts?: Date | FirebaseFirestore.Timestamp | null): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (ts instanceof admin.firestore.Timestamp) return ts.toMillis();
  return 0;
}

async function computeOrderRefundSnapshot(
  orderId: string,
  options: { useCache?: boolean } = { useCache: true }
): Promise<{ accountedRefundAmount: number; accountStatus: AccountStatus }> {
  if (options.useCache) {
    const cached = snapshotCache.get(orderId);
    if (isCacheValid(cached)) {
      return { accountedRefundAmount: cached!.accountedRefundAmount, accountStatus: cached!.accountStatus };
    }
  }

  const refundSnap = await db
    .collection('refundDetails')
    .where('orderId', '==', orderId)
    .get();

  const refundDetails: (Partial<RefundDetailDoc> & { id: string })[] = refundSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as RefundDetailDoc),
  }));

  // Gather reconciliations for these refund details
  const detailIds = refundDetails.map((r) => r.id);
  const detailIdToRecon: Record<string, RefundReconciliationDoc[]> = {};
  if (detailIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < detailIds.length; i += 10) chunks.push(detailIds.slice(i, i + 10));

    const snapPromises = chunks.map((chunk) =>
      db.collection('refundReconciliations').where('refundDetailId', 'in', chunk).get()
    );
    const snaps = await Promise.all(snapPromises);
    for (const recSnap of snaps) {
      for (const d of recSnap.docs) {
        const data = d.data() as RefundReconciliationDoc;
        const key = data.refundDetailId;
        if (!key) continue;
        if (!detailIdToRecon[key]) detailIdToRecon[key] = [];
        detailIdToRecon[key].push(data);
      }
    }
  }

  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    try {
      const recs: RefundReconciliationDoc[] = detailIdToRecon[rd.id] || [];
      let actualValue = 0;
      if (recs.length > 0) {
        recs.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        actualValue = Number(recs[0]?.actualValue || 0);
      } else if (Array.isArray(rd.returnTrackings)) {
        for (const rt of rd.returnTrackings as ReturnTrackingDoc[]) {
          if (!Array.isArray(rt.returnItems)) continue;
          for (const item of rt.returnItems) {
            const condition = (item?.condition as ItemCondition) ?? undefined;
            if (condition === ItemCondition.GOOD) {
              actualValue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
            }
          }
        }
      }
      return sum + (isNaN(actualValue) ? 0 : actualValue);
    } catch (err) {
      const reconArr = detailIdToRecon[rd.id] || [];
      console.warn('SNAPSHOT_REDUCE_ERROR', {
        orderId,
        refundDetailId: rd.id,
        hasReturnTrackings: Array.isArray(rd.returnTrackings),
        returnTrackingsCount: Array.isArray(rd.returnTrackings) ? rd.returnTrackings!.length : 0,
        reconCount: reconArr.length,
        sampleRecon: reconArr.length > 0 ? { updatedAt: reconArr[0].updatedAt, actualValue: reconArr[0].actualValue } : undefined,
        errorMessage: (err as Error).message,
        stack: (err as Error).stack,
      });
      return sum;
    }
  }, 0);

  // Compute accountStatus
  let accountStatus: AccountStatus = AccountStatus.UNINITIATED;
  if (refundDetails.length > 0) {
    const allFully = refundDetails.every((rd) => rd.accountingStatus === AccountingStatus.FULLY_ACCOUNTED);
    accountStatus = allFully ? AccountStatus.FULLY_ACCOUNTED : AccountStatus.PARTIALLY_ACCOUNTED;
  }

  const result = { accountedRefundAmount, accountStatus };
  snapshotCache.set(orderId, { ...result, cachedAt: Date.now() });
  return result;
}

export async function recomputeAndWriteOrderRefundSnapshot(orderId: string): Promise<void> {
  const { accountedRefundAmount, accountStatus } = await computeOrderRefundSnapshot(orderId, { useCache: false });
  await db
    .collection('orders')
    .doc(orderId)
    .set({ refundAccount: { accountedRefundAmount, accountStatus } }, { merge: true });
  // Update cache post-write for subsequent reads
  snapshotCache.set(orderId, { accountedRefundAmount, accountStatus, cachedAt: Date.now() });
}

// Computes the sum of refundAmount across all RefundDetails for a given order
export async function getRefundDetailsTotalAmount(orderId: string): Promise<number> {
  const snap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  return snap.docs.reduce((sum, d) => {
    const data = d.data() as RefundDetailDoc;
    const amt = Number(data?.refundAmount ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

// Validates that the sum of RefundDetails equals the Order.buyerRefundAmount (within epsilon)
export async function validateRefundDetailsSumEqualsOrder(
  orderId: string,
  epsilon: number = ACCOUNTING_EPSILON
): Promise<{ actualTotal: number; expectedTotal: number }> {
  const orderDoc = await db.collection('orders').doc(orderId).get();
  if (!orderDoc.exists) throw new Error(`Order ${orderId} not found`);
  const order = orderDoc.data() as { buyerRefundAmount?: number };
  const expectedTotal = Number(order?.buyerRefundAmount || 0);
  const actualTotal = await getRefundDetailsTotalAmount(orderId);
  if (Math.abs(actualTotal - expectedTotal) > epsilon) {
    throw new Error(`RefundDetails sum (${actualTotal}) does not match order refund amount (${expectedTotal})`);
  }
  return { actualTotal, expectedTotal };
} 