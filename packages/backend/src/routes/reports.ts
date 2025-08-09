import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { RefundType, AccountingStatus, ReturnStatus } from '@packages/shared';

const router = Router();

router.get('/refund-summary', async (req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundDetails').get();
    const details = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const totalAmount = details.reduce((s, d) => s + Number(d.refundAmount || 0), 0);
    const byType: Record<string, number> = {};
    for (const d of details) {
      const t = d.refundType || 'UNKNOWN';
      byType[t] = (byType[t] || 0) + Number(d.refundAmount || 0);
    }

    res.json({ success: true, totalAmount, byType });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build refund summary' });
  }
});

router.get('/accounting-status', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('orders').get();
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const statusTotals: Record<string, { amount: number; count: number }> = {};

    for (const o of orders) {
      const refundAccount = o.refundAccount || {};
      const accountingStatus: AccountingStatus = inferOrderAccountingStatus(refundAccount);
      const total = Number(o?.buyerRefundAmount || 0);
      if (!statusTotals[accountingStatus]) statusTotals[accountingStatus] = { amount: 0, count: 0 };
      statusTotals[accountingStatus].amount += total;
      statusTotals[accountingStatus].count += 1;
    }

    res.json({ success: true, statusTotals });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build accounting status' });
  }
});

router.get('/staff-errors', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundDetails').where('refundType', '==', RefundType.INCORRECT_PACKING).get();
    const details = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const byStaff: Record<string, { count: number; totalVariance: number }> = {};
    for (const d of details) {
      const staff = d?.packingError?.packedByStaffCode || 'UNKNOWN';
      const variance = (d?.discrepancies || []).reduce((s: number, x: any) => s + Number(x?.variance || 0), 0);
      if (!byStaff[staff]) byStaff[staff] = { count: 0, totalVariance: 0 };
      byStaff[staff].count += 1;
      byStaff[staff].totalVariance += variance;
    }

    res.json({ success: true, byStaff });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build staff errors' });
  }
});

router.get('/defective-products', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundDetails').where('refundType', '==', RefundType.DEFECTIVE_PRODUCTS).get();
    const details = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const items = details.flatMap(d => (Array.isArray(d.defectiveItems) ? d.defectiveItems : []).map((x: any) => ({
      orderId: d.orderId,
      refundDetailId: d.id,
      ...x,
    })));

    res.json({ success: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build defective products report' });
  }
});

router.get('/financial-impact', async (_req: Request, res: Response) => {
  try {
    const ordersSnap = await db.collection('orders').get();
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const totalRefunds = orders.reduce((s, o) => s + Number(o?.buyerRefundAmount || 0), 0);
    const totalAccounted = orders.reduce((s, o) => s + Number(o?.refundAccount?.accountedRefundAmount || 0), 0);

    res.json({ success: true, totals: { totalRefunds, totalAccounted, recoveryRate: totalRefunds ? totalAccounted / totalRefunds : 0 } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to build financial impact report' });
  }
});

function inferOrderAccountingStatus(refundAccount: any): AccountingStatus {
  const details: any[] = Array.isArray(refundAccount?.refundDetails) ? refundAccount.refundDetails : [];
  if (details.length === 0) return AccountingStatus.UNACCOUNTED;

  const hasLost = details.some(d => (d.returnTrackings || []).some((rt: any) => rt.returnStatus === ReturnStatus.LOST_BY_COURIER));
  if (hasLost) return AccountingStatus.PARTIALLY_ACCOUNTED;

  const totalRefund = details.reduce((s, d) => s + Number(d.refundAmount || 0), 0);
  const accounted = Number(refundAccount?.accountedRefundAmount || 0);

  if (Math.abs(accounted - totalRefund) < 0.01) return AccountingStatus.FULLY_ACCOUNTED;
  if (accounted > 0) return AccountingStatus.PARTIALLY_ACCOUNTED;
  return AccountingStatus.UNACCOUNTED;
}

export default router; 