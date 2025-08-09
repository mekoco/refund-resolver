import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { ReturnItem, ReturnStatus, ItemCondition } from '@packages/shared';
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

    return res.status(400).json({ success: false, error: 'Cursor is required for page > 1. Use nextCursor from the previous response.', code: 'CURSOR_REQUIRED' });
  } catch (e) {
    console.error('RETURNS_LIST_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to list returns', code: 'RETURNS_LIST_ERROR' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('returns').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found', code: 'RETURN_NOT_FOUND' });
    res.json({ success: true, return: { id: doc.id, ...doc.data() } });
  } catch (e) {
    console.error('RETURN_GET_ERROR', e);
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

    return res.status(400).json({ success: false, error: 'Cursor is required for page > 1. Use nextCursor from the previous response.', code: 'CURSOR_REQUIRED' });
  } catch (e) {
    console.error('RETURNS_PENDING_ERROR', e);
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
        condition: z.nativeEnum(ItemCondition),
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
      returnStatus: ReturnStatus.PENDING,
      returnItems,
      totalReturnValue,
      ...(expectedReturnDate ? { expectedReturnDate } : {}),
      ...(typeof reason === 'string' && reason.length > 0 ? { reason } : {}),
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

    res.json({ success: true, id: newReturnId });
  } catch (e) {
    console.error('RETURN_INITIATE_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to initiate return', code: 'RETURN_INITIATE_ERROR' });
  }
});

router.post('/:id/mark-in-transit', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.IN_TRANSIT));
router.post('/:id/mark-received', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.RECEIVED));
router.post('/:id/mark-inspecting', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.INSPECTING));
router.post('/:id/mark-restocked', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.RESTOCKED));
router.post('/:id/mark-discrepancy', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.DISCREPANCY_FOUND));
router.post('/:id/mark-lost', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.LOST_BY_COURIER));
router.post('/:id/mark-paid-by-courier', (req: Request, res: Response) => updateReturnStatus(req, res, ReturnStatus.PAID_BY_COURIER));

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
    console.error('RETURN_STATUS_UPDATE_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to update return status', code: 'RETURN_STATUS_UPDATE_ERROR' });
  }
}

export default router; 