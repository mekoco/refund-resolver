import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { RefundType, AccountingStatus, ReturnStatus } from '@packages/shared';
import { z } from 'zod';

const router = Router();

const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

router.get('/refund-summary', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = dateRangeSchema.parse(req.query);
    if (!startDate && !endDate) {
      return res.status(400).json({ success: false, error: 'Provide startDate or endDate to bound the query', code: 'DATE_RANGE_REQUIRED' });
    }

    let query: FirebaseFirestore.Query = db.collection('refundDetails');
    if (startDate) query = query.where('refundDate', '>=', startDate);
    if (endDate) query = query.where('refundDate', '<=', endDate);
    const snap = await query.limit(limit).get();
    const details = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const totalAmount = details.reduce((s, d) => s + Number(d.refundAmount || 0), 0);
    const byType: Record<string, number> = {};
    for (const d of details) {
      const t = d.refundType || 'UNKNOWN';
      byType[t] = (byType[t] || 0) + Number(d.refundAmount || 0);
    }

    res.json({ success: true, totalAmount, byType, count: details.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build refund summary' });
  }
});

router.get('/accounting-status', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = dateRangeSchema.parse(req.query);
    if (!startDate && !endDate) {
      return res.status(400).json({ success: false, error: 'Provide startDate or endDate to bound the query', code: 'DATE_RANGE_REQUIRED' });
    }

    let query: FirebaseFirestore.Query = db.collection('orders');
    if (startDate) query = query.where('orderTime', '>=', startDate);
    if (endDate) query = query.where('orderTime', '<=', endDate);
    const snap = await query.limit(limit).get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const statusTotals: Record<string, { amount: number; count: number }> = {};

    for (const o of orders) {
      const refundAccount = o.refundAccount || {};
      const accountingStatus: AccountingStatus = inferOrderAccountingStatus(refundAccount);
      const total = Number(o?.buyerRefundAmount || 0);
      if (!statusTotals[accountingStatus]) statusTotals[accountingStatus] = { amount: 0, count: 0 };
      statusTotals[accountingStatus].amount += total;
      statusTotals[accountingStatus].count += 1;
    }

    res.json({ success: true, statusTotals, count: orders.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build accounting status' });
  }
});

router.get('/staff-errors', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = dateRangeSchema.parse(req.query);
    if (!startDate && !endDate) {
      return res.status(400).json({ success: false, error: 'Provide startDate or endDate to bound the query', code: 'DATE_RANGE_REQUIRED' });
    }
    let query: FirebaseFirestore.Query = db.collection('refundReconciliations');
    if (startDate) query = query.where('createdAt', '>=', startDate);
    if (endDate) query = query.where('createdAt', '<=', endDate);
    const snap = await query.limit(limit).get();

    const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const byStaff: Record<string, { count: number; totalVariance: number }> = {};

    for (const r of recs) {
      const owner = r.createdBy || 'UNKNOWN';
      const variance = Number(r.expectedValue || 0) - Number(r.actualValue || 0);
      if (!byStaff[owner]) byStaff[owner] = { count: 0, totalVariance: 0 };
      byStaff[owner].count += 1;
      byStaff[owner].totalVariance += variance;
    }

    res.json({ success: true, byStaff, count: recs.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build staff errors' });
  }
});

router.get('/defective-products', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = dateRangeSchema.parse(req.query);
    if (!startDate && !endDate) {
      return res.status(400).json({ success: false, error: 'Provide startDate or endDate to bound the query', code: 'DATE_RANGE_REQUIRED' });
    }
    let query: FirebaseFirestore.Query = db.collection('refundDetails').where('refundType', '==', RefundType.DEFECTIVE_PRODUCTS);
    if (startDate) query = query.where('refundDate', '>=', startDate);
    if (endDate) query = query.where('refundDate', '<=', endDate);
    const snap = await query.limit(limit).get();
    const details = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const items = details.flatMap((d) => (Array.isArray(d.defectiveItems) ? d.defectiveItems : []).map((x: any) => ({
      orderId: d.orderId,
      refundDetailId: d.id,
      ...x,
    })));

    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build defective products report' });
  }
});

router.get('/financial-impact', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = dateRangeSchema.parse(req.query);
    if (!startDate && !endDate) {
      return res.status(400).json({ success: false, error: 'Provide startDate or endDate to bound the query', code: 'DATE_RANGE_REQUIRED' });
    }
    let query: FirebaseFirestore.Query = db.collection('orders');
    if (startDate) query = query.where('orderTime', '>=', startDate);
    if (endDate) query = query.where('orderTime', '<=', endDate);
    const ordersSnap = await query.limit(limit).get();
    const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const totalRefunds = orders.reduce((s, o) => s + Number(o?.buyerRefundAmount || 0), 0);
    const totalAccounted = orders.reduce((s, o) => s + Number(o?.refundAccount?.accountedRefundAmount || 0), 0);

    res.json({ success: true, totals: { totalRefunds, totalAccounted, recoveryRate: totalRefunds ? totalAccounted / totalRefunds : 0 }, count: orders.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build financial impact report' });
  }
});

function inferOrderAccountingStatus(refundAccount: any): AccountingStatus {
  const details: any[] = Array.isArray(refundAccount?.refundDetails) ? refundAccount.refundDetails : [];
  if (details.length === 0) return AccountingStatus.UNACCOUNTED;

  const hasLost = details.some((d) => (d.returnTrackings || []).some((rt: any) => rt.returnStatus === ReturnStatus.LOST_BY_COURIER));
  if (hasLost) return AccountingStatus.PARTIALLY_ACCOUNTED;

  const totalRefund = details.reduce((s, d) => s + Number(d.refundAmount || 0), 0);
  const accounted = Number(refundAccount?.accountedRefundAmount || 0);

  if (Math.abs(accounted - totalRefund) < 0.01) return AccountingStatus.FULLY_ACCOUNTED;
  if (accounted > 0) return AccountingStatus.PARTIALLY_ACCOUNTED;
  return AccountingStatus.UNACCOUNTED;
}

export default router; 