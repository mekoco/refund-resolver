import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../config/firebase';
import { OrderExcelReader } from '../utils/orderExcelReader';
import { Order, AccountingStatus, RefundStatus, RefundType } from '@packages/shared';
import * as fs from 'fs';
import { z, ZodIssue } from 'zod';
import { recomputeAndWriteOrderRefundSnapshot, validateRefundDetailsSumEqualsOrder, ACCOUNTING_EPSILON } from '../utils/snapshot';

const router = Router();

const upload = multer({
  dest: '/tmp/',
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Invalid file type'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit, cursor } = listQuerySchema.parse(req.query);

    const baseQuery = db.collection('orders').orderBy('orderId');

    // Prefer cursor-based pagination when provided
    if (cursor) {
      const safeCursor = String(cursor).trim();
      const cursorDoc = await db.collection('orders').doc(safeCursor).get();
      if (!cursorDoc.exists) return res.status(400).json({ success: false, error: 'Invalid cursor', code: 'INVALID_CURSOR' });
      const snap = await baseQuery.startAfter(cursorDoc).limit(limit).get();
      const orders: Order[] = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const nextCursor = orders.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: orders.length, orders, page, limit, nextCursor });
    }

    // First page without cursor
    if (page === 1) {
      const snap = await baseQuery.limit(limit).get();
      const orders: Order[] = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const nextCursor = orders.length === limit ? snap.docs[snap.docs.length - 1].id : null;
      return res.json({ success: true, count: orders.length, orders, page, limit, nextCursor });
    }

    // Disallow inefficient page-based access without cursor
    return res.status(400).json({ success: false, error: 'Cursor is required for page > 1. Use nextCursor from the previous response.', code: 'CURSOR_REQUIRED' });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders', code: 'ORDERS_LIST_ERROR' });
  }
});

const refundAccountingSchema = z
  .object({
    refundDetails: z.array(z.any()).optional(),
    accountedRefundAmount: z.number().nonnegative().default(0),
    accountStatus: z.enum(['UNINITIATED', 'PARTIALLY_ACCOUNTED', 'FULLY_ACCOUNTED']).optional(),
  })
  .strict();

const orderSchema = z.object({
  id: z.any().optional(),
  orderId: z.string().min(1),
  storeName: z.string().min(1),
  orderRevenue: z.number(),
  items: z
    .array(
      z.object({
        merchantSKU: z.string().min(1),
        salesVolume: z.number().nonnegative(),
        isGift: z.boolean(),
      })
    )
    .max(500),
  commodityCost: z.number(),
  profitLoss: z.number(),
  profitRate: z.number(),
  productSales: z.number(),
  shippingFeePaidByBuyer: z.number(),
  subsidyForDiscountPromotion: z.number(),
  commissionFee: z.number(),
  transactionFee: z.number(),
  serviceCharge: z.number(),
  shippingFeePaidBySeller: z.number(),
  marketingFees: z.number(),
  buyerRefundAmount: z.number(),
  refundAccount: refundAccountingSchema.optional(),
  otherPlatformFees: z.number(),
  orderTime: z.coerce.date().nullable(),
  confirmTime: z.coerce.date().nullable(),
  releaseTime: z.coerce.date().nullable(),
  updateTime: z.coerce.date().nullable(),
  completedTime: z.coerce.date().nullable(),
  orderStatus: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

router.post('/upload-excel', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded', code: 'NO_FILE' });
  }

  const cleanup = () => {
    try {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
  };

  try {
    console.log('Processing uploaded Excel file:', req.file.originalname);

    const reader = new OrderExcelReader();
    const ordersRaw = await reader.readAndConvertOrders(req.file.path);

    // Validate each order
    const orders: Order[] = [];
    for (const o of ordersRaw) {
      const parsed = orderSchema.safeParse(o);
      if (!parsed.success) {
        throw new Error(`Invalid order data for ${o.orderId}: ${parsed.error.issues.map((i: ZodIssue) => i.message).join(', ')}`);
      }
      orders.push(parsed.data as unknown as Order);
    }

    const results = { total: orders.length, successful: 0, failed: 0, errors: [] as string[] };

    for (const order of orders) {
      try {
        await db.runTransaction(async (tx) => {
          const docRef = db.collection('orders').doc(order.orderId);
          const existingDoc = await tx.get(docRef);
          const now = new Date();

          if (existingDoc.exists) {
            const existing = existingDoc.data() as Order;
            const oldAmount = Number(existing?.buyerRefundAmount || 0);
            const newAmount = Number(order.buyerRefundAmount || 0);
            if (Math.abs(newAmount - oldAmount) >= ACCOUNTING_EPSILON) {
              const difference = newAmount - oldAmount;
              const rdRef = db.collection('refundDetails').doc();
              tx.set(rdRef, {
                orderId: order.orderId,
                refundAmount: difference,
                refundDate: now,
                status: difference >= 0 ? RefundStatus.INITIATED : RefundStatus.PROCESSING,
                refundType: RefundType.OTHERS,
                accountingStatus: AccountingStatus.UNACCOUNTED,
                createdBy: 'system:excel-upload',
                createdAt: now,
                updatedAt: now,
              });
            }
          }

          tx.set(docRef, { ...order, updatedAt: new Date() }, { merge: true });
        });

        // Recompute snapshot and validate sums per business rules
        await recomputeAndWriteOrderRefundSnapshot(order.orderId);
        await validateRefundDetailsSumEqualsOrder(order.orderId, ACCOUNTING_EPSILON);
        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Order ${order.orderId}: ${error.message}`);
      }
    }

    cleanup();

    res.json({ success: true, message: `Successfully processed ${results.successful} orders`, results });
  } catch (error: any) {
    console.error('Error processing Excel file:', error);
    cleanup();
    res.status(500).json({ success: false, error: 'Failed to process Excel file', details: error.message, code: 'EXCEL_PROCESSING_FAILED' });
  }
});

router.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) return res.status(400).json({ success: false, error: 'Invalid orderId', code: 'INVALID_ID' });
    const doc = await db.collection('orders').doc(orderId).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }

    res.json({ success: true, order: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order', code: 'ORDER_GET_ERROR' });
  }
});

export default router;