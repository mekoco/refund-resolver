import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReconciliationStatus, AccountingStatus } from '@packages/shared';
import { recomputeAndWriteOrderRefundSnapshot } from '../utils/snapshot';
import { RefundDetailDoc, RefundReconciliationDoc } from '../types/firestore';

const router = Router();

router.get('/unaccounted', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.PENDING).get();
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as RefundReconciliationDoc) }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list unaccounted' });
  }
});

router.get('/partial', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.VARIANCE_FOUND).get();
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as RefundReconciliationDoc) }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list partial' });
  }
});

router.post('/:refundId/reconcile', async (req: Request, res: Response) => {
  try {
    const { expectedValue, actualValue, status, notes } = req.body as { expectedValue: number; actualValue: number; status: ReconciliationStatus; notes?: string };
    const variance = (Number(actualValue) || 0) - (Number(expectedValue) || 0);
    const ref = await db.collection('refundReconciliations').add({
      refundDetailId: req.params.refundId,
      expectedValue,
      actualValue,
      variance,
      status,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const doc = await ref.get();

    const refundDoc = await db.collection('refundDetails').doc(req.params.refundId).get();
    const refund = refundDoc.data() as RefundDetailDoc | undefined;
    // Update refundDetails.accountingStatus based on reconciliation outcome
    if (refundDoc.exists) {
      const rdRef = db.collection('refundDetails').doc(req.params.refundId);
      let accountingStatus: AccountingStatus | undefined;
      if (status === ReconciliationStatus.MATCHED) accountingStatus = AccountingStatus.FULLY_ACCOUNTED;
      else if (status === ReconciliationStatus.VARIANCE_FOUND) accountingStatus = AccountingStatus.PARTIALLY_ACCOUNTED;
      if (accountingStatus) await rdRef.update({ accountingStatus, updatedAt: new Date() });
    }
    if (refund?.orderId) {
      await recomputeAndWriteOrderRefundSnapshot(refund.orderId);
    }

    res.status(201).json({ success: true, reconciliation: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to reconcile' });
  }
});

router.get('/variance-report', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.VARIANCE_FOUND).get();
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as RefundReconciliationDoc) }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch variance report' });
  }
});

export default router; 