import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReconciliationStatus } from '@packages/shared';

const router = Router();

router.get('/unaccounted', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.PENDING).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list unaccounted' });
  }
});

router.get('/partial', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.VARIANCE_FOUND).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

    // Update related order snapshot
    const refundDoc = await db.collection('refundDetails').doc(req.params.refundId).get();
    const refund = refundDoc.data() as any;
    if (refund?.orderId) {
      await updateOrderRefundSnapshot(refund.orderId);
    }

    res.status(201).json({ success: true, reconciliation: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to reconcile' });
  }
});

router.get('/variance-report', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', ReconciliationStatus.VARIANCE_FOUND).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch variance report' });
  }
});

async function updateOrderRefundSnapshot(orderId: string) {
  const refundSnap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  const refundDetails: any[] = refundSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const reconciliationSnap = await db.collection('refundReconciliations').where('refundDetailId', 'in', refundDetails.map(r => r.id)).get().catch(() => ({ docs: [] } as any));
  const detailIdToRecon: Record<string, any[]> = {};
  for (const d of reconciliationSnap.docs) {
    const data = { id: d.id, ...d.data() } as any;
    const key = data.refundDetailId;
    if (!detailIdToRecon[key]) detailIdToRecon[key] = [];
    detailIdToRecon[key].push(data);
  }

  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    const recs = detailIdToRecon[rd.id] || [];
    let actualValue = 0;
    if (recs.length > 0) {
      recs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      actualValue = Number(recs[0]?.actualValue || 0);
    }
    return sum + (isNaN(actualValue) ? 0 : actualValue);
  }, 0);

  await db.collection('orders').doc(orderId).set({
    refundAccount: {
      refundDetails,
      accountedRefundAmount,
    },
    updatedAt: new Date(),
  }, { merge: true });
}

export default router; 