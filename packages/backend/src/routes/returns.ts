import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReturnItem, ReturnStatus } from '@packages/shared';
import { z } from 'zod';
import { recomputeAndWriteOrderRefundSnapshot } from '../utils/snapshot';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit, cursor } = listQuerySchema.parse(req.query);

    const base = db.collection('returns').orderBy('updatedAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('returns').doc(cursor).get();
      if (!cursorDoc.exists) return res.status(400).json({ success: false, error: 'Invalid cursor', code: 'INVALID_CURSOR' });
      const snap = await base.startAfter(cursorDoc).limit(limit).get();
      const returns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = returns.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: returns.length, returns, page, limit, nextCursor });
    }

    if (page === 1) {
      const snap = await base.limit(limit).get();
      const returns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = returns.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: returns.length, returns, page, limit, nextCursor });
    }

    const prevSnap = await base.limit((page - 1) * limit).get();
    if (prevSnap.empty) return res.json({ success: true, count: 0, returns: [], page, limit, nextCursor: null });
    const lastPrevDoc = prevSnap.docs[prevSnap.docs.length - 1];
    const snap = await base.startAfter(lastPrevDoc).limit(limit).get();
    const returns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = returns.length === limit ? snap.docs[snap.docs.length - 1].id : null;
    res.json({ success: true, count: returns.length, returns, page, limit, nextCursor });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list returns', code: 'RETURNS_LIST_ERROR' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('returns').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found', code: 'RETURN_NOT_FOUND' });
    res.json({ success: true, return: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get return', code: 'RETURN_GET_ERROR' });
  }
});

router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { page, limit, cursor } = listQuerySchema.parse(req.query);
    const pendingStatuses: ReturnStatus[] = [ReturnStatus.PENDING, ReturnStatus.IN_TRANSIT];
    const base = db.collection('returns').where('returnStatus', 'in', pendingStatuses).orderBy('updatedAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('returns').doc(cursor).get();
      if (!cursorDoc.exists) return res.status(400).json({ success: false, error: 'Invalid cursor', code: 'INVALID_CURSOR' });
      const snap = await base.startAfter(cursorDoc).limit(limit).get();
      const docs = snap.docs;
      const items = docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = docs.length === limit ? docs[docs.length - 1].id : null;
      return res.json({ success: true, count: items.length, items, page, limit, nextCursor });
    }

    if (page === 1) {
      const snap = await base.limit(limit).get();
      const docs = snap.docs;
      const items = docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = docs.length === limit ? docs[docs.length - 1].id : null;
      return res.json({ success: true, count: items.length, items, page, limit, nextCursor });
    }

    const prevSnap = await base.limit((page - 1) * limit).get();
    if (prevSnap.empty) return res.json({ success: true, count: 0, items: [], page, limit, nextCursor: null });
    const lastPrevDoc = prevSnap.docs[prevSnap.docs.length - 1];
    const snap = await base.startAfter(lastPrevDoc).limit(limit).get();
    const docs = snap.docs;
    const items = docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = docs.length === limit ? docs[docs.length - 1].id : null;
    res.json({ success: true, count: items.length, items, page, limit, nextCursor });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list pending returns', code: 'RETURNS_PENDING_ERROR' });
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
  expectedReturnDate: z.coerce.date().optional(),
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { refundDetailId, returnItems, reason, expectedReturnDate } = initiateSchema.parse(req.body);

    const rdRef = db.collection('refundDetails').doc(refundDetailId);
    const rdDoc = await rdRef.get();
    if (!rdDoc.exists) return res.status(404).json({ success: false, error: 'RefundDetail not found', code: 'REFUND_DETAIL_NOT_FOUND' });
    const rd = { id: rdDoc.id, ...rdDoc.data() } as any;

    const now = new Date();
    const newReturnId = db.collection('returns').doc().id;
    const totalReturnValue = (returnItems || []).reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0);

    const returnTracking: any = {
      id: newReturnId,
      returnInitiatedDate: now,
      expectedReturnDate: expectedReturnDate || undefined,
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
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x) => x.message).join('; '), code: 'VALIDATION_ERROR' });
    res.status(500).json({ success: false, error: 'Failed to initiate return', code: 'RETURN_INITIATE_ERROR' });
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
    if (!idxDoc.exists) return res.status(404).json({ success: false, error: 'Return not found', code: 'RETURN_NOT_FOUND' });

    const { refundDetailId, orderId } = idxDoc.data() as any;
    const rdRef = db.collection('refundDetails').doc(refundDetailId);
    const rdDoc = await rdRef.get();
    if (!rdDoc.exists) return res.status(404).json({ success: false, error: 'RefundDetail not found', code: 'REFUND_DETAIL_NOT_FOUND' });

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
    res.status(500).json({ success: false, error: 'Failed to update return status', code: 'RETURN_STATUS_UPDATE_ERROR' });
  }
}

export default router; 