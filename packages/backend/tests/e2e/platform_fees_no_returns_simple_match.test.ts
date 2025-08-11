/**
 * Scenario: PLATFORM_FEES → fees-only refund without returns; reconcile directly
 * - Create order via Excel (buyerRefundAmount = 150)
 * - Create RefundDetail type PLATFORM_FEES (150)
 * - Reconcile as MATCHED with actualValue 150
 * - Verify accountedRefundAmount >= 150
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: PLATFORM_FEES reconcile without returns', () => {
  const orderId = `PF_${unique()}`;
  let refundId: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 150, items: [] }),
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

  it('creates platform fees refund and reconciles', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 150,
      refundType: 'PLATFORM_FEES',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    refundId = res.data.refund.id;

    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 150,
      actualValue: 150,
      status: 'MATCHED',
      notes: 'Fees matched',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(150);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('FULLY_ACCOUNTED');
  });
}); 