/**
 * Scenario: INCORRECT_PACKING → partial return with variance
 * - Create order via Excel (buyerRefundAmount = 600)
 * - Create RefundDetail type INCORRECT_PACKING (600)
 * - Update refund status to PROCESSING
 * - Initiate return with items totaling 500
 * - Progress to RECEIVED and mark DISCREPANCY_FOUND
 * - Reconcile as VARIANCE_FOUND with actualValue 500 (expected 600)
 * - Verify accountedRefundAmount reflects 500 (< 600)
 * - Cleanup data
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: INCORRECT_PACKING partial return variance', () => {
  const orderId = `IP_${unique()}`;
  let refundId: string;
  let returnId: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 600, items: [{ sku: 'SKU-B', qty: 3 }] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);

    const created = await api.get(`/orders/${orderId}`);
    expect(created.data.order?.refundAccount?.accountStatus).toBe('UNINITIATED');
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates incorrect packing refund and updates status', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 600,
      refundType: 'INCORRECT_PACKING',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    refundId = res.data.refund.id;

    const upd = await api.put(`/refunds/${refundId}/status`, { status: 'PROCESSING' });
    expect(upd.data.success).toBe(true);
  });

  it('initiates partial return and marks discrepancy', async () => {
    const init = await api.post('/returns/initiate', {
      refundDetailId: refundId,
      returnItems: [
        { skuName: 'SKU-B', quantity: 2, unitPrice: 250, condition: 'GOOD' }, // 500 value
      ],
      reason: 'Wrong item packed',
    });
    expect(init.data.success).toBe(true);
    returnId = init.data.id;

    await api.post(`/returns/${returnId}/mark-received`);
    await api.post(`/returns/${returnId}/mark-discrepancy`);
  });

  it('reconciles as variance found and validates accounted amount', async () => {
    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 600,
      actualValue: 500,
      status: 'VARIANCE_FOUND',
      notes: 'Short by 100',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    expect(order.data.success).toBe(true);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(500);
    expect(accounted).toBeLessThan(600);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('PARTIALLY_ACCOUNTED');
  });
}); 