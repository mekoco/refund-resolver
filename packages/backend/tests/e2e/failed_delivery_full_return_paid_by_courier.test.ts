/**
 * Scenario: FAILED_DELIVERY → full refund; courier initially loses return then pays
 * - Create order via Excel (buyerRefundAmount = 800)
 * - Create RefundDetail type FAILED_DELIVERY (800)
 * - Initiate return for the full amount
 * - Mark LOST_BY_COURIER then PAID_BY_COURIER
 * - Reconcile MATCHED (actualValue = 800)
 * - Verify accountedRefundAmount >= 800
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: FAILED_DELIVERY courier paid', () => {
  const orderId = `FD_${unique()}`;
  let refundId: string;
  let returnId: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 800, items: [{ sku: 'SKU-C', qty: 4 }] }),
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

  it('creates failed delivery refund and initiates return', async () => {
    const res = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 800,
      refundType: 'FAILED_DELIVERY',
      status: 'INITIATED',
      accountingStatus: 'UNACCOUNTED',
    });
    expect(res.status).toBe(201);
    refundId = res.data.refund.id;

    const init = await api.post('/returns/initiate', {
      refundDetailId: refundId,
      returnItems: [
        { skuName: 'SKU-C', quantity: 4, unitPrice: 200, condition: 'GOOD' },
      ],
    });
    expect(init.data.success).toBe(true);
    returnId = init.data.id;
  });

  it('handles courier lost then paid', async () => {
    await api.post(`/returns/${returnId}/mark-lost`);
    await api.post(`/returns/${returnId}/mark-paid-by-courier`);
  });

  it('reconciles with MATCHED and checks accounted amount', async () => {
    const recon = await api.post(`/reconciliation/${refundId}/reconcile`, {
      expectedValue: 800,
      actualValue: 800,
      status: 'MATCHED',
      notes: 'Courier paid in full',
    });
    expect(recon.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(800);
    expect(order.data.order?.refundAccount?.accountStatus).toBe('FULLY_ACCOUNTED');
  });
}); 