import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReturnItem, ReturnStatus } from '@packages/shared';
import { z } from 'zod';
import { recomputeAndWriteOrderRefundSnapshot } from '../utils/snapshot';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit } = listQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;

    const snap = await db.collection('returns').orderBy('updatedAt', 'desc').limit(offset + limit).get();
    const docs = snap.docs.slice(offset, offset + limit);
    const returns = docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: returns.length, returns, page, limit });
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

router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { page, limit } = listQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;
    const pendingStatuses: ReturnStatus[] = [ReturnStatus.PENDING, ReturnStatus.IN_TRANSIT];
    const snap = await db.collection('returns').where('returnStatus', 'in', pendingStatuses).orderBy('updatedAt', 'desc').limit(offset + limit).get();
    const docs = snap.docs.slice(offset, offset + limit);
    const items = docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: items.length, items, page, limit });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list pending returns' });
  }
});

const initiateSchema = z.object({
  refundDetailId: z.string().min(1),
  returnItems: z
    .array(
      z.object({
        skuName: z.string().min(1),
        quantity: z.number().nonnegative(),
        unitPrice: z.number().nonnegative(),
        condition: z.enum(['GOOD', 'DAMAGED', 'MISSING']),
        restockedDate: z.coerce.date().optional(),
        restockedBy: z.string().optional(),
      })
    )
    .min(1),
  reason: z.string().optional(),
  expectedReturnDate: z.union([z.coerce.date(), z.string()]).optional(),
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { refundDetailId, returnItems, reason, expectedReturnDate } = initiateSchema.parse(req.body);

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
      expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate as any) : undefined,
      actualReturnDate: undefined,
      returnStatus: ReturnStatus.PENDING,
      returnItems,
      totalReturnValue,
      reason,
    };

    const updatedReturnTrackings = Array.isArray(rd.returnTrackings) ? [...rd.returnTrackings, returnTracking] : [returnTracking];

    await rdRef.update({ returnTrackings: updatedReturnTrackings, updatedAt: now });

    await db.collection('returns').doc(newReturnId).set({
      refundDetailId,
      orderId: rd.orderId,
      returnStatus: returnTracking.returnStatus,
      totalReturnValue,
      createdAt: now,
      updatedAt: now,
    });

    await recomputeAndWriteOrderRefundSnapshot(rd.orderId);

    res.status(201).json({ success: true, return: returnTracking });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x) => x.message).join('; ') });
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
    const updated = (rd.returnTrackings || []).map((rt: any) =>
      rt.id === returnId
        ? { ...rt, returnStatus: status, updatedAt: new Date(), actualReturnDate: status === ReturnStatus.RECEIVED ? new Date() : rt.actualReturnDate }
        : rt
    );

    await rdRef.update({ returnTrackings: updated, updatedAt: new Date() });

    await db.collection('returns').doc(returnId).update({ returnStatus: status, updatedAt: new Date() });

    await recomputeAndWriteOrderRefundSnapshot(orderId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update return status' });
  }
}

export default router; 