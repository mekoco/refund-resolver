import { Router, Request, Response } from 'express';
import { db, admin } from '../config/firebase';
import { AccountingStatus, RefundDetail, RefundStatus, RefundType } from '@packages/shared';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundDetails').get();
    const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: refunds.length, refunds });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list refunds' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('refundDetails').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get refund' });
  }
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const data = req.body as Partial<RefundDetail>;
    if (!data.orderId || data.refundAmount === undefined) {
      return res.status(400).json({ success: false, error: 'orderId and refundAmount are required' });
    }

    const now = new Date();
    const payload: any = {
      ...data,
      status: data.status || RefundStatus.INITIATED,
      refundType: data.refundType || RefundType.OTHERS,
      accountingStatus: data.accountingStatus || AccountingStatus.UNACCOUNTED,
      refundDate: data.refundDate || now,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection('refundDetails').add(payload);
    const doc = await ref.get();

    // Update order snapshot
    await updateOrderRefundSnapshot(payload.orderId);

    res.status(201).json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to create refund' });
  }
});

router.post('/split', async (req: Request, res: Response) => {
  try {
    const { refundId, splits } = req.body as { refundId: string; splits: Array<Partial<RefundDetail>> };
    if (!refundId || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ success: false, error: 'refundId and non-empty splits are required' });
    }

    const originalDoc = await db.collection('refundDetails').doc(refundId).get();
    if (!originalDoc.exists) return res.status(404).json({ success: false, error: 'Original refund not found' });
    const original = { id: originalDoc.id, ...originalDoc.data() } as any;

    // Delete original and create new split records in a batch
    const batch = db.batch();
    const col = db.collection('refundDetails');
    batch.delete(col.doc(refundId));

    const now = new Date();
    const createdIds: string[] = [];

    for (const split of splits) {
      const ref = col.doc();
      const payload: any = {
        ...original,
        ...split,
        id: undefined,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(ref, payload);
      createdIds.push(ref.id);
    }

    await batch.commit();

    await updateOrderRefundSnapshot(original.orderId);

    res.json({ success: true, createdIds });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to split refund' });
  }
});

router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body as { status: RefundStatus };
    const docRef = db.collection('refundDetails').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    await docRef.update({ status, updatedAt: new Date() });

    const data = doc.data() as any;
    await updateOrderRefundSnapshot(data.orderId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

router.put('/:id/type-data', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const docRef = db.collection('refundDetails').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });

    await docRef.update({ ...updates, updatedAt: new Date() });

    const data = doc.data() as any;
    await updateOrderRefundSnapshot(data.orderId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update type data' });
  }
});

router.post('/bulk-update', async (req: Request, res: Response) => {
  try {
    const updates: Array<{ id: string; changes: any }> = req.body?.updates || [];
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: 'updates array required' });
    }
    const batch = db.batch();
    const col = db.collection('refundDetails');
    const affectedOrderIds = new Set<string>();

    for (const { id, changes } of updates) {
      const ref = col.doc(id);
      batch.update(ref, { ...changes, updatedAt: new Date() });
      const doc = await ref.get();
      if (doc.exists) {
        const data = doc.data() as any;
        if (data?.orderId) affectedOrderIds.add(data.orderId);
      }
    }

    await batch.commit();

    await Promise.all(Array.from(affectedOrderIds).map(id => updateOrderRefundSnapshot(id)));

    res.json({ success: true, updated: updates.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed bulk update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const docRef = db.collection('refundDetails').doc(req.params.id);
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data() as any;
      await docRef.delete();
      if (data?.orderId) await updateOrderRefundSnapshot(data.orderId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete refund' });
  }
});

async function updateOrderRefundSnapshot(orderId: string) {
  const refundSnap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  const refundDetails: any[] = refundSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    const reconciled = Number(rd?.accountedRefundAmount || 0);
    return sum + (isNaN(reconciled) ? 0 : reconciled);
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