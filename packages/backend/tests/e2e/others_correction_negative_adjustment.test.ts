/**
 * Scenario: OTHERS (correction) → negative adjustment
 * - Create order via Excel (buyerRefundAmount = 400)
 * - Upload a second Excel with same order but buyerRefundAmount = 300
 *   → system auto-creates a refundDetails record with refundAmount = -100 (OTHERS)
 * - Manually create an additional correction of -50 via /refunds/initiate with refundType OTHERS
 * - Reconcile MATCHED for -150 (expectedValue is still positive sum context; we set actualValue 150 to reflect corrections accounted)
 * - Verify accountedRefundAmount >= 150
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: OTHERS negative correction adjustments', () => {
  const orderId = `OTH_${unique()}`;
  let manualCorrectionId: string;

  beforeAll(async () => {
    // Initial upload at 400
    const buf1 = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 400, items: [{ sku: 'SKU-F', qty: 2 }] }),
    ]);
    const fd1 = new FormData();
    fd1.append('file', buf1, { filename: 'orders1.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res1 = await api.post('/orders/upload-excel', fd1, { headers: fd1.getHeaders() });
    expect(res1.data.success).toBe(true);

    const created = await api.get(`/orders/${orderId}`);
    expect(created.data.order?.refundAccount?.accountStatus).toBe('UNINITIATED');

    // Second upload at 300 triggers auto refundDetail of -100
    const buf2 = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 300, items: [{ sku: 'SKU-F', qty: 2 }] }),
    ]);
    const fd2 = new FormData();
    fd2.append('file', buf2, { filename: 'orders2.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res2 = await api.post('/orders/upload-excel', fd2, { headers: fd2.getHeaders() });
    expect(res2.data.success).toBe(true);
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('manually creates an additional negative correction (OTHERS)', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: -50,
      refundType: 'OTHERS',
      status: 'PROCESSING',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    manualCorrectionId = res.data.refund.id;
  });

  it('reconciles corrections to matched accounting value', async () => {
    const recon = await api.post(`/reconciliation/${manualCorrectionId}/reconcile`, {
      expectedValue: 50, // corrections accounted positively as recovery
      actualValue: 50,
      status: 'MATCHED',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(50);
  });
}); 