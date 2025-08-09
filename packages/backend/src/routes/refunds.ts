import { Router, Request, Response } from 'express';
import { db, admin } from '../config/firebase';
import { AccountingStatus, RefundDetail, RefundStatus, RefundType } from '@packages/shared';
import { z, ZodIssue } from 'zod';
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

    const baseQuery = db.collection('refundDetails').orderBy('updatedAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('refundDetails').doc(cursor).get();
      if (!cursorDoc.exists) return res.status(400).json({ success: false, error: 'Invalid cursor', code: 'INVALID_CURSOR' });
      const snap = await baseQuery.startAfter(cursorDoc).limit(limit).get();
      const refunds = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = refunds.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: refunds.length, refunds, page, limit, nextCursor });
    }

    if (page === 1) {
      const snap = await baseQuery.limit(limit).get();
      const refunds = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nextCursor = refunds.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: refunds.length, refunds, page, limit, nextCursor });
    }

    return res.status(400).json({ success: false, error: 'Cursor is required for page > 1. Use nextCursor from the previous response.', code: 'CURSOR_REQUIRED' });
  } catch (e) {
    console.error('REFUNDS_LIST_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to list refunds', code: 'REFUNDS_LIST_ERROR' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('refundDetails').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found', code: 'REFUND_NOT_FOUND' });
    res.json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e) {
    console.error('REFUND_GET_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to get refund', code: 'REFUND_GET_ERROR' });
  }
});

const initiateSchema = z
  .object({
    orderId: z.string().min(1),
    refundAmount: z.number(),
    refundDate: z.coerce.date().optional(),
    refundType: z.nativeEnum(RefundType).optional(),
    status: z.nativeEnum(RefundStatus).optional(),
    accountingStatus: z.nativeEnum(AccountingStatus).optional(),
    createdBy: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    const type = val.refundType ?? RefundType.OTHERS;
    if (val.refundAmount < 0 && type !== RefundType.OTHERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Negative refundAmount is only allowed for refundType=OTHERS (corrections)',
        path: ['refundAmount'],
      });
    }
  });

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const data = initiateSchema.parse(req.body);

    const now = new Date();
    const payload: any = {
      ...data,
      status: data.status || RefundStatus.INITIATED,
      refundType: data.refundType || RefundType.OTHERS,
      accountingStatus: data.accountingStatus || AccountingStatus.UNACCOUNTED,
      refundDate: data.refundDate || now,
      createdBy: data.createdBy || 'system:api',
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection('refundDetails').add(payload);
    const doc = await ref.get();

    await recomputeAndWriteOrderRefundSnapshot(payload.orderId);

    res.status(201).json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x: ZodIssue) => x.message).join('; '), code: 'VALIDATION_ERROR' });
    console.error('REFUND_INITIATE_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to initiate refund', code: 'REFUND_INITIATE_ERROR' });
  }
});

const splitSchema = z.object({
  refundId: z.string().min(1),
  splits: z
    .array(
      z
        .object({
          refundAmount: z.number(),
          refundType: z.nativeEnum(RefundType).optional(),
          status: z.nativeEnum(RefundStatus).optional(),
          accountingStatus: z.nativeEnum(AccountingStatus).optional(),
        })
        .superRefine((val, ctx) => {
          const type = val.refundType ?? RefundType.OTHERS;
          if (val.refundAmount < 0 && type !== RefundType.OTHERS) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Negative refundAmount in split is only allowed for refundType=OTHERS (corrections)',
              path: ['refundAmount'],
            });
          }
        })
    )
    .min(1),
});

router.post('/split', async (req: Request, res: Response) => {
  try {
    const { refundId, splits } = splitSchema.parse(req.body);

    const originalDoc = await db.collection('refundDetails').doc(refundId).get();
    if (!originalDoc.exists) return res.status(404).json({ success: false, error: 'Original refund not found', code: 'REFUND_NOT_FOUND' });
    const original = { id: originalDoc.id, ...originalDoc.data() } as any;

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
        createdAt: now,
        updatedAt: now,
      };
      delete payload.id;
      // Ensure required fields present post-merge
      if (!payload.orderId || typeof payload.refundAmount !== 'number') {
        const missing: string[] = [];
        if (!payload.orderId) missing.push('orderId');
        if (typeof payload.refundAmount !== 'number') missing.push('refundAmount');
        throw new Error(`Invalid split payload after merge: missing ${missing.join(', ')}`);
      }
      batch.set(ref, payload);
      createdIds.push(ref.id);
    }

    await batch.commit();

    await recomputeAndWriteOrderRefundSnapshot(original.orderId);

    res.json({ success: true, createdIds });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x: ZodIssue) => x.message).join('; '), code: 'VALIDATION_ERROR' });
    console.error('REFUND_SPLIT_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to split refund', code: 'REFUND_SPLIT_ERROR' });
  }
});

// Strict typing for returnTrackings
const returnItemSchema = z.object({
  skuName: z.string().min(1),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  condition: z.enum(['GOOD', 'DAMAGED', 'MISSING']),
  restockedDate: z.coerce.date().optional(),
  restockedBy: z.string().optional(),
});

const returnTrackingSchema = z.object({
  id: z.string().min(1),
  returnInitiatedDate: z.coerce.date().optional(),
  expectedReturnDate: z.coerce.date().optional(),
  actualReturnDate: z.coerce.date().optional(),
  returnStatus: z.enum(['PENDING', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING', 'RESTOCKED', 'DISCREPANCY_FOUND', 'LOST_BY_COURIER', 'PAID_BY_COURIER']),
  returnItems: z.array(returnItemSchema),
  totalReturnValue: z.number().nonnegative(),
  reason: z.string().optional(),
});

// Restrict type-data updates to known safe fields
const typeDataSchema = z.object({
  returnTrackings: z.array(returnTrackingSchema).optional(),
  accountingStatus: z.nativeEnum(AccountingStatus).optional(),
  status: z.nativeEnum(RefundStatus).optional(),
}).strict();

router.put('/:id/type-data', async (req: Request, res: Response) => {
  try {
    const updates = typeDataSchema.parse(req.body);
    const docRef = db.collection('refundDetails').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found', code: 'REFUND_NOT_FOUND' });

    await docRef.update({ ...updates, updatedAt: new Date() });

    const data = doc.data() as any;
    await recomputeAndWriteOrderRefundSnapshot(data.orderId);

    res.json({ success: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x: ZodIssue) => x.message).join('; '), code: 'VALIDATION_ERROR' });
    console.error('REFUND_TYPE_DATA_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to update type data', code: 'REFUND_TYPE_DATA_ERROR' });
  }
});

const bulkSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        // Optional last known update time for optimistic concurrency
        lastUpdatedAt: z.coerce.date().optional(),
        changes: z
          .object({
            refundAmount: z.number().optional(),
            refundType: z.nativeEnum(RefundType).optional(),
            status: z.nativeEnum(RefundStatus).optional(),
            accountingStatus: z.nativeEnum(AccountingStatus).optional(),
            returnTrackings: z.array(returnTrackingSchema).optional(),
          })
          .strict()
          .superRefine((val, ctx) => {
            // If both refundAmount and refundType present (or refundType missing but amount negative), enforce rule
            const amt = val.refundAmount;
            const type = val.refundType ?? RefundType.OTHERS;
            if (typeof amt === 'number' && amt < 0 && type !== RefundType.OTHERS) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Negative refundAmount is only allowed when refundType=OTHERS',
                path: ['refundAmount'],
              });
            }
          }),
      })
    )
    .min(1),
});

router.post('/bulk-update', async (req: Request, res: Response) => {
  try {
    const { updates } = bulkSchema.parse(req.body);
    const col = db.collection('refundDetails');

    const affectedOrderIds = new Set<string>();

    // Read and update strictly inside the transaction for isolation
    await db.runTransaction(async (tx) => {
      const now = new Date();
      for (const payload of updates) {
        const ref = col.doc(payload.id);
        const doc = await tx.get(ref);
        if (!doc.exists) continue;
        const data = doc.data() as any;
        if (data?.orderId) affectedOrderIds.add(data.orderId);

        if (payload.lastUpdatedAt) {
          const currentUpdatedAt = (data?.updatedAt as FirebaseFirestore.Timestamp)?.toDate?.() || data?.updatedAt;
          const expected = new Date(payload.lastUpdatedAt);
          if (!currentUpdatedAt || Math.abs(currentUpdatedAt.getTime() - expected.getTime()) > 2000) {
            throw new Error(`Conflict on ${ref.id}: document was modified by another process`);
          }
        }

        tx.update(ref, { ...payload.changes, updatedAt: now });
      }
    });

    await Promise.all(Array.from(affectedOrderIds).map((id) => recomputeAndWriteOrderRefundSnapshot(id)));

    res.json({ success: true, updated: updates.length });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: e.errors.map((x: ZodIssue) => x.message).join('; '), code: 'VALIDATION_ERROR' });
    if (typeof e?.message === 'string' && e.message.startsWith('Conflict')) {
      console.error('REFUND_BULK_UPDATE_CONFLICT', e.message);
      return res.status(409).json({ success: false, error: e.message, code: 'CONFLICT' });
    }
    console.error('REFUND_BULK_UPDATE_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed bulk update', code: 'REFUND_BULK_UPDATE_ERROR' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ref = db.collection('refundDetails').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found', code: 'REFUND_NOT_FOUND' });

    const data = doc.data() as any;
    await ref.delete();
    await recomputeAndWriteOrderRefundSnapshot(data.orderId);

    res.json({ success: true });
  } catch (e) {
    console.error('REFUND_DELETE_ERROR', e);
    res.status(500).json({ success: false, error: 'Failed to delete refund', code: 'REFUND_DELETE_ERROR' });
  }
});

export default router; 