import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';
import { expectAmountsClose } from '../helpers/assertions';

const unique = () => Math.random().toString(36).slice(2);

/**
 * Scenario: Very small increase (< epsilon) in buyerRefundAmount should not void fully-accounted state
 * - Start at 500, reconcile MATCHED 500
 * - Increase to 500.005 (delta below 0.01 epsilon)
 * - Assert accountedRefundAmount ~= buyerRefundAmount (still effectively fully accounted)
 */

describe('Small delta (< epsilon) does not void fully-accounted state', () => {
  const orderId = `RECONVOID_EPS_${unique()}`;
  let refundId: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 500, items: [] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates initial refund and reconciles to matched', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 500,
      refundType: 'PLATFORM_FEES',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    refundId = res.data.refund.id;

    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 500,
      actualValue: 500,
      status: 'MATCHED',
      notes: 'Initial match',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    const expected = Number(order.data.order?.buyerRefundAmount || 0);
    expectAmountsClose(accounted, expected);
  });

  it('increases buyerRefundAmount by 0.005 and remains effectively fully accounted', async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 500.005, items: [] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    const expected = Number(order.data.order?.buyerRefundAmount || 0);
    // Difference is 0.005, below epsilon 0.01
    expectAmountsClose(accounted, expected);
  });
}); 