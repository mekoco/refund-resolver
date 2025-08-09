import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

router.get('/unaccounted', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', 'PENDING').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list unaccounted' });
  }
});

router.get('/partial', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', 'VARIANCE_FOUND').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list partial' });
  }
});

router.post('/:refundId/reconcile', async (req: Request, res: Response) => {
  try {
    const { expectedValue, actualValue, status, notes } = req.body;
    const variance = (actualValue ?? 0) - (expectedValue ?? 0);
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
    res.status(201).json({ success: true, reconciliation: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to reconcile' });
  }
});

router.get('/variance-report', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundReconciliations').where('status', '==', 'VARIANCE_FOUND').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch variance report' });
  }
});

export default router; 