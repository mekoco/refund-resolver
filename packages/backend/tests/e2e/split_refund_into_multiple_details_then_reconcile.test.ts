/**
 * Scenario: Split refund into multiple details and reconcile separately
 * - Create order via Excel (buyerRefundAmount = 900)
 * - Create single RefundDetail OTHERS (900)
 * - Split into two: 400 (ORDER_CANCELLED), 500 (INCORRECT_PACKING)
 * - Initiate returns for both and reconcile MATCHED
 * - Verify accountedRefundAmount >= 900
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: split refund into multiple details', () => {
  const orderId = `SPL_${unique()}`;
  let originalRefundId: string;
  let splitIds: string[] = [];
  let returnA: string;
  let returnB: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 900, items: [{ sku: 'SKU-G', qty: 9 }] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates a single refund then splits it', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 900,
      refundType: 'OTHERS',
    });
    originalRefundId = res.data.refund.id;

    const split = await api.post('/refunds/split', {
      refundId: originalRefundId,
      splits: [
        { refundAmount: 400, refundType: 'ORDER_CANCELLED' },
        { refundAmount: 500, refundType: 'INCORRECT_PACKING' },
      ],
    });
    expect(split.data.success).toBe(true);
    splitIds = split.data.createdIds;
    expect(splitIds.length).toBe(2);
  });

  it('initiates returns and reconciles both parts', async () => {
    const s1 = await api.get(`/refunds/${splitIds[0]}`);
    const s2 = await api.get(`/refunds/${splitIds[1]}`);
    expect(s1.data.success && s2.data.success).toBe(true);

    const initA = await api.post('/returns/initiate', {
      refundDetailId: splitIds[0],
      returnItems: [{ skuName: 'SKU-G', quantity: 4, unitPrice: 100, condition: 'GOOD' }], // 400
    });
    returnA = initA.data.id;

    const initB = await api.post('/returns/initiate', {
      refundDetailId: splitIds[1],
      returnItems: [{ skuName: 'SKU-G', quantity: 5, unitPrice: 100, condition: 'GOOD' }], // 500
    });
    returnB = initB.data.id;

    await api.post(`/returns/${returnA}/mark-received`);
    await api.post(`/returns/${returnB}/mark-received`);

    const reconA = await api.post(`/reconciliation/${splitIds[0]}/reconcile`, {
      expectedValue: 400,
      actualValue: 400,
      status: 'MATCHED',
    });
    expect(reconA.status).toBe(201);

    const reconB = await api.post(`/reconciliation/${splitIds[1]}/reconcile`, {
      expectedValue: 500,
      actualValue: 500,
      status: 'MATCHED',
    });
    expect(reconB.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(900);
  });
}); 