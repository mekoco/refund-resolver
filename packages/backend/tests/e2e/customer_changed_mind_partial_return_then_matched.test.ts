/**
 * Scenario: CUSTOMER_CHANGED_MIND → partial return then matched
 * - Create order via Excel (buyerRefundAmount = 450)
 * - Create RefundDetail type CUSTOMER_CHANGED_MIND (450)
 * - Initiate return items totaling 450 but over two steps
 * - First reconcile VARIANCE_FOUND (actual=200), then upload another return and reconcile MATCHED (actual=450)
 * - Verify accountedRefundAmount reflects final 450
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: CUSTOMER_CHANGED_MIND staged returns to matched', () => {
  const orderId = `CCM_${unique()}`;
  let refundId: string;
  let returnId1: string;
  let returnId2: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 450, items: [{ sku: 'SKU-E', qty: 3 }] }),
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

  it('creates refund and initiates first partial return', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 450,
      refundType: 'CUSTOMER_CHANGED_MIND',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    refundId = res.data.refund.id;

    const init1 = await api.post('/returns/initiate', {
      refundDetailId: refundId,
      returnItems: [
        { skuName: 'SKU-E', quantity: 1, unitPrice: 200, condition: 'GOOD' },
      ],
    });
    returnId1 = init1.data.id;
  });

  it('reconciles variance found at 200 then completes with second return', async () => {
    await api.post(`/returns/${returnId1}/mark-received`);

    const recon1 = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 450,
      actualValue: 200,
      status: 'VARIANCE_FOUND',
    });
    expect(recon1.status).toBe(201);

    let order = await api.get(`/orders/${orderId}`);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('PARTIALLY_ACCOUNTED');

    const init2 = await api.post('/returns/initiate', {
      refundDetailId: refundId,
      returnItems: [
        { skuName: 'SKU-E', quantity: 1, unitPrice: 250, condition: 'GOOD' },
      ],
    });
    returnId2 = init2.data.id;

    await api.post(`/returns/${returnId2}/mark-received`);

    const recon2 = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 450,
      actualValue: 450,
      status: 'MATCHED',
    });
    expect(recon2.status).toBe(201);

    order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(450);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('FULLY_ACCOUNTED');
  });
}); 