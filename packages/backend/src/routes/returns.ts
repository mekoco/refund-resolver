import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReturnItem, ReturnStatus } from '@packages/shared';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('returns').get();
    const returns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: returns.length, returns });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list returns' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('returns').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, return: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get return' });
  }
});

router.get('/pending', async (_req: Request, res: Response) => {
  try {
    const pendingStatuses: ReturnStatus[] = [ReturnStatus.PENDING, ReturnStatus.IN_TRANSIT];
    const snap = await db.collection('returns').where('returnStatus', 'in', pendingStatuses).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list pending returns' });
  }
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { refundDetailId, returnItems, reason, expectedReturnDate } = req.body as { refundDetailId: string; returnItems: ReturnItem[]; reason?: string; expectedReturnDate?: string | Date };
    if (!refundDetailId || !Array.isArray(returnItems)) {
      return res.status(400).json({ success: false, error: 'refundDetailId and returnItems are required' });
    }

    const rdRef = db.collection('refundDetails').doc(refundDetailId);
    const rdDoc = await rdRef.get();
    if (!rdDoc.exists) return res.status(404).json({ success: false, error: 'RefundDetail not found' });
    const rd = { id: rdDoc.id, ...rdDoc.data() } as any;

    const now = new Date();
    const newReturnId = db.collection('returns').doc().id;
    const totalReturnValue = (returnItems || []).reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0);

    const returnTracking: any = {
      id: newReturnId,
      returnInitiatedDate: now,
      expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : undefined,
      actualReturnDate: undefined,
      returnStatus: ReturnStatus.PENDING,
      returnItems,
      totalReturnValue,
      reason,
    };

    const updatedReturnTrackings = Array.isArray(rd.returnTrackings) ? [...rd.returnTrackings, returnTracking] : [returnTracking];

    await rdRef.update({ returnTrackings: updatedReturnTrackings, updatedAt: now });

    // Maintain index doc for quick lookup
    await db.collection('returns').doc(newReturnId).set({
      refundDetailId,
      orderId: rd.orderId,
      returnStatus: returnTracking.returnStatus,
      totalReturnValue,
      createdAt: now,
      updatedAt: now,
    });

    await updateOrderRefundSnapshot(rd.orderId);

    res.status(201).json({ success: true, return: returnTracking });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to initiate return' });
  }
});

router.put('/:id/receive', async (req: Request, res: Response) => {
  await updateReturnStatus(req, res, ReturnStatus.RECEIVED);
});

router.put('/:id/inspect', async (req: Request, res: Response) => {
  await updateReturnStatus(req, res, ReturnStatus.INSPECTING);
});

router.put('/:id/restock', async (req: Request, res: Response) => {
  await updateReturnStatus(req, res, ReturnStatus.RESTOCKED);
});

router.put('/:id/mark-lost-by-courier', async (req: Request, res: Response) => {
  await updateReturnStatus(req, res, ReturnStatus.LOST_BY_COURIER);
});

router.put('/:id/mark-paid-by-courier', async (req: Request, res: Response) => {
  await updateReturnStatus(req, res, ReturnStatus.PAID_BY_COURIER);
});

async function updateReturnStatus(req: Request, res: Response, status: ReturnStatus) {
  try {
    const returnId = req.params.id;
    const idxDoc = await db.collection('returns').doc(returnId).get();
    if (!idxDoc.exists) return res.status(404).json({ success: false, error: 'Return not found' });

    const { refundDetailId, orderId } = idxDoc.data() as any;
    const rdRef = db.collection('refundDetails').doc(refundDetailId);
    const rdDoc = await rdRef.get();
    if (!rdDoc.exists) return res.status(404).json({ success: false, error: 'RefundDetail not found' });

    const rd = rdDoc.data() as any;
    const updated = (rd.returnTrackings || []).map((rt: any) => rt.id === returnId ? { ...rt, returnStatus: status, updatedAt: new Date(), actualReturnDate: status === ReturnStatus.RECEIVED ? new Date() : rt.actualReturnDate } : rt);

    await rdRef.update({ returnTrackings: updated, updatedAt: new Date() });

    await db.collection('returns').doc(returnId).update({ returnStatus: status, updatedAt: new Date() });

    await updateOrderRefundSnapshot(orderId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update return status' });
  }
}

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
    } else if (Array.isArray(rd.returnTrackings)) {
      for (const rt of rd.returnTrackings) {
        if (!Array.isArray(rt.returnItems)) continue;
        for (const item of rt.returnItems) {
          if (item?.condition === 'GOOD' || item?.condition === 0 /* fallback */) {
            actualValue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
          }
        }
      }
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