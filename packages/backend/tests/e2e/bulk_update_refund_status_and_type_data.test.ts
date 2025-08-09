/**
 * Scenario: Bulk update refund details (status/type-data) then reconcile
 * - Create order via Excel (buyerRefundAmount = 700)
 * - Create two refunds: ORDER_CANCELLED (300) and INCORRECT_PACKING (400)
 * - Use /refunds/bulk-update to set statuses and stub returnTrackings for both
 * - Reconcile MATCHED for each
 * - Verify accountedRefundAmount >= 700
 * - Cleanup
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { api } from '../helpers/http';
import { buildOrdersExcel, buildOrderRow } from '../helpers/excel';
import FormData from 'form-data';
import { deleteOrderCascade } from '../helpers/cleanup';

const unique = () => Math.random().toString(36).slice(2);

describe('Workflow: bulk update then reconcile', () => {
  const orderId = `BULK_${unique()}`;
  let refundA: string;
  let refundB: string;

  beforeAll(async () => {
    const buf = buildOrdersExcel([
      buildOrderRow({ orderId, buyerRefundAmount: 700, items: [{ sku: 'SKU-H', qty: 7 }] }),
    ]);
    const fd = new FormData();
    fd.append('file', buf, { filename: 'orders.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await api.post('/orders/upload-excel', fd, { headers: fd.getHeaders() });
    expect(res.data.success).toBe(true);
  });

  afterAll(async () => {
    await deleteOrderCascade(orderId);
  });

  it('creates two refunds and bulk-updates them', async () => {
    const a = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 300,
      refundType: 'ORDER_CANCELLED',
      status: 'INITIATED',
    });
    refundA = a.data.refund.id;

    const b = await api.post('/refunds/initiate', {
      orderId,
      refundAmount: 400,
      refundType: 'INCORRECT_PACKING',
      status: 'INITIATED',
    });
    refundB = b.data.refund.id;

    const now = new Date().toISOString();

    const bulk = await api.post('/refunds/bulk-update', {
      updates: [
        {
          id: refundA,
          lastUpdatedAt: now,
          changes: {
            status: 'PROCESSING',
            returnTrackings: [
              {
                id: `R-${refundA}`,
                returnInitiatedDate: now,
                expectedReturnDate: now,
                returnStatus: 'PENDING',
                returnItems: [{ skuName: 'SKU-H', quantity: 3, unitPrice: 100, condition: 'GOOD' }],
                totalReturnValue: 300,
              },
            ],
          },
        },
        {
          id: refundB,
          lastUpdatedAt: now,
          changes: {
            status: 'PROCESSING',
            returnTrackings: [
              {
                id: `R-${refundB}`,
                returnInitiatedDate: now,
                expectedReturnDate: now,
                returnStatus: 'PENDING',
                returnItems: [{ skuName: 'SKU-H', quantity: 4, unitPrice: 100, condition: 'GOOD' }],
                totalReturnValue: 400,
              },
            ],
          },
        },
      ],
    });
    expect(bulk.data.success).toBe(true);
  });

  it('reconciles both refunds and verifies accounted amount', async () => {
    const r1 = await api.post(`/reconciliation/${refundA}/reconcile`, {
      expectedValue: 300,
      actualValue: 300,
      status: 'MATCHED',
    });
    expect(r1.status).toBe(201);

    const r2 = await api.post(`/reconciliation/${refundB}/reconcile`, {
      expectedValue: 400,
      actualValue: 400,
      status: 'MATCHED',
    });
    expect(r2.status).toBe(201);

    const order = await api.get(`/orders/${orderId}`);
    const accounted = Number(order.data.order?.refundAccount?.accountedRefundAmount || 0);
    expect(accounted).toBeGreaterThanOrEqual(700);
  });
}); 