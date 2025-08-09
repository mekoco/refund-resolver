/**
 * Scenario: DEFECTIVE_PRODUCTS → refund without returns; manual write-off later
 * - Create order via Excel (buyerRefundAmount = 300)
 * - Create RefundDetail type DEFECTIVE_PRODUCTS (300)
 * - Do not create returns
 * - Reconcile as VARIANCE_FOUND with actualValue 0
 * - Verify accountedRefundAmount remains 0
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: DEFECTIVE_PRODUCTS manual write-off', () => {
  const orderId = `DP_${unique()}`;
  let refundId: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 300, items: [{ sku: 'SKU-D', qty: 1 }] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates defective products refund', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 300,
      refundType: 'DEFECTIVE_PRODUCTS',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    refundId = res.data.refund.id;
  });

  it('reconciles with actualValue 0, variance found', async () => {
    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 300,
      actualValue: 0,
      status: 'VARIANCE_FOUND',
      notes: 'Pending write-off',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBe(0);
  });
}); 