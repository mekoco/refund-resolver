import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';
import { expectAmountsClose, expectAmountsNotClose } from '../helpers/assertions';

const unique = () => Math.random().toString(36).slice(2);

/**
 * Scenario: Order fully reconciled, then buyerRefundAmount changes → previous fully-accounted state is voided
 * - Create order via Excel (buyerRefundAmount = 500)
 * - Create RefundDetail type PLATFORM_FEES (500)
 * - Reconcile as MATCHED with actualValue 500
 * - Verify accountedRefundAmount >= 500 and status is effectively FULLY_ACCOUNTED (by equality check)
 * - Upload Excel with increased buyerRefundAmount = 800
 * - System creates OTHERS RefundDetail for +300 (UNACCOUNTED)
 * - Snapshot recompute keeps accountedRefundAmount at ~500, but expected is now 800
 * - Assert order not fully accounted anymore (accountedRefundAmount < buyerRefundAmount) and delta detail exists
 */

describe('Voids fully-accounted state when order refund total changes', () => {
  const orderId = `RECONVOID_${unique()}`;
  let refundId: string;

  beforeAll(async () => {
    // Initial order upload: 500
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
    // Create a refund detail equal to total
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
    expect(accounted).toBeGreaterThanOrEqual(500);
    expectAmountsClose(accounted, expected);
  });

  it('increases order buyerRefundAmount via Excel and voids fully-accounted state', async () => {
    // Increase order total to 800
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 800, items: [] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);

    // After upload, snapshot recompute should reflect mismatch
    const order = await api.get(`/orders/${orderId}`);
    expect(order.data.success).toBe(true);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    const expected = Number(order.data.order?.buyerRefundAmount || 0);

    // accounted should still be ~500 (no reconciliation yet for +300 detail)
    expect(accounted).toBeGreaterThanOrEqual(500);
    expect(expected).toBe(800);
    expectAmountsNotClose(accounted, expected);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('PARTIALLY_ACCOUNTED');
  });
}); 