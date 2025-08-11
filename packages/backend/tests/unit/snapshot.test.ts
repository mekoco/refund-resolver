import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/config/firebase';
import { recomputeAndWriteOrderRefundSnapshot } from '../../src/utils/snapshot';
import { AccountingStatus, RefundStatus, RefundType } from '@packages/shared';

describe('recomputeAndWriteOrderRefundSnapshot', () => {
  const orderId = 'UT-ORDER-1';

  beforeAll(async () => {
    // Cleanup any pre-existing data
    const batch = db.batch();
    const rdSnap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
    rdSnap.docs.forEach((d) => batch.delete(d.ref));
    const recSnap = await db.collection('refundReconciliations').where('orderId', '==', orderId).get();
    recSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection('orders').doc(orderId));
    await batch.commit();
  });

  it('handles corrupted returnTrackings safely and prefers latest reconciliation actualValue', async () => {
    const now = new Date();
    await db.collection('orders').doc(orderId).set({ orderId, buyerRefundAmount: 100, createdAt: now, updatedAt: now });

    const rdRef = await db.collection('refundDetails').add({
      orderId,
      refundAmount: 100,
      refundDate: now,
      status: RefundStatus.INITIATED,
      refundType: RefundType.OTHERS,
      accountingStatus: AccountingStatus.UNACCOUNTED,
      // corrupted trackings shape
      returnTrackings: [{ returnItems: [{ quantity: 'NaN', unitPrice: 'oops', condition: 0 }] }],
      createdBy: 'ut',
      createdAt: now,
      updatedAt: now,
    });

    // Add two reconciliations, latest should win
    await db.collection('refundReconciliations').add({
      refundDetailId: rdRef.id,
      expectedValue: 100,
      actualValue: 25,
      variance: 75,
      status: 'MATCHED',
      updatedAt: new Date(now.getTime() - 1000),
      createdAt: now,
    } as any);
    await db.collection('refundReconciliations').add({
      refundDetailId: rdRef.id,
      expectedValue: 100,
      actualValue: 30,
      variance: 70,
      status: 'MATCHED',
      updatedAt: new Date(now.getTime() + 1000),
      createdAt: now,
    } as any);

    await recomputeAndWriteOrderRefundSnapshot(orderId);

    const orderDoc = await db.collection('orders').doc(orderId).get();
    const account = (orderDoc.data() as any)?.refundAccount;

    expect(account).toBeTruthy();
    // Should take 30 from latest reconciliation, and ignore corrupted returnTrackings
    expect(account.accountedRefundAmount).toBe(30);
  });
}); 