/**
 * Scenario: ORDER_CANCELLED → full refund with product return
 * - Create an order via Excel upload (buyerRefundAmount = 1000)
 * - Create RefundDetail for ORDER_CANCELLED (1000)
 * - Initiate return for the full amount
 * - Progress return to RECEIVED then RESTOCKED
 * - Reconcile as MATCHED (expected == actual)
 * - Verify order.refundAccount.accountedRefundAmount reflects recovery
 * - Cleanup all created data
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: ORDER_CANCELLED full return matched', () => {
  const orderId = `OC_${unique()}`;
  let refundId: string;
  let returnId: string;

  beforeAll(async () => {
    // Upload Excel to create the order
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 1000, items: [{ sku: 'SKU-A', qty: 2 }] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);

    const created = await api.get(`/orders/${orderId}`);
    expect(created.data.success).toBe(true);
    expect(created.data.order?.refundAccount?.accountStatus).toBe('UNINITIATED');
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates refund detail for ORDER_CANCELLED', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 1000,
      refundType: 'ORDER_CANCELLED',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    refundId = res.data.refund.id;
    expect(refundId).toBeTruthy();
  });

  it('initiates a return for the full amount', async () => {
    const rr = await api.get(`/refunds/${refundId}`);
    expect(rr.data.success).toBe(true);

    const init = await api.post('/returns/initiate', {
      refundDetailId: refundId,
      returnItems: [
        { skuName: 'SKU-A', quantity: 2, unitPrice: 500, condition: 'GOOD' },
      ],
      expectedReturnDate: new Date().toISOString(),
    });
    expect(init.data.success).toBe(true);
    returnId = init.data.id;
    expect(returnId).toBeTruthy();
  });

  it('progresses return to RECEIVED then RESTOCKED', async () => {
    await api.post(`/returns/${returnId}/mark-received`);
    await api.post(`/returns/${returnId}/mark-restocked`);
  });

  it('reconciles to MATCHED and updates accounted amount', async () => {
    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 1000,
      actualValue: 1000,
      status: 'MATCHED',
      notes: 'Full return matched',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    expect(order.data.success).toBe(true);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(1000);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('FULLY_ACCOUNTED');
  });
}); 