import { Order } from '@/types/order';
import { RefundDetail, RefundReconciliation, ReturnIndexDoc, ReturnItem } from '@/types/refund';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

type DefectiveProductItem = {
  orderId: string;
  refundDetailId: string;
  skuName: string;
  quantity: number;
  unitPrice: number;
  defectDescription: string;
  evidenceUrls?: string[];
  reportedBy: string;
  reportedDate: string;
  verifiedBy?: string;
  verifiedDate?: string;
};

type UpdateTypeDataPayload = Partial<Pick<RefundDetail, 'returnTrackings' | 'accountingStatus' | 'status'>> & Record<string, unknown>;

export const api = {
  async checkHealth() {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('API is not healthy');
    }
    return response.json();
  },

  async getOrders(): Promise<{ success: boolean; count: number; orders: Order[] }> {
    const response = await fetch(`${API_BASE_URL}/orders`);
    if (!response.ok) {
      throw new Error('Failed to fetch orders');
    }
    return response.json();
  },

  async getOrder(orderId: string): Promise<{ success: boolean; order: Order }> {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch order');
    }
    return response.json();
  },

  async uploadOrderExcel(file: File): Promise<{ success: boolean; message: string; results: { total: number; successful: number; failed: number; errors: string[] } }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/orders/upload-excel`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error('Failed to upload Excel file');
    }
    return response.json();
  },

  // Refunds
  async listRefunds(): Promise<{ success: boolean; count: number; refunds: RefundDetail[] }> {
    const response = await fetch(`${API_BASE_URL}/refunds`);
    if (!response.ok) throw new Error('Failed to list refunds');
    return response.json();
  },
  async getRefund(id: string): Promise<{ success: boolean; refund: RefundDetail }> {
    const response = await fetch(`${API_BASE_URL}/refunds/${id}`);
    if (!response.ok) throw new Error('Failed to get refund');
    return response.json();
  },
  async initiateRefund(payload: Partial<RefundDetail>): Promise<{ success: boolean; refund: RefundDetail }> {
    const response = await fetch(`${API_BASE_URL}/refunds/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to initiate refund');
    return response.json();
  },
  async updateRefundStatus(id: string, status: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/refunds/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update refund status');
    return response.json();
  },
  async updateRefundTypeData(id: string, changes: UpdateTypeDataPayload): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/refunds/${id}/type-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error('Failed to update type data');
    return response.json();
  },
  async splitRefund(refundId: string, splits: Partial<RefundDetail>[]): Promise<{ success: boolean; createdIds: string[] }> {
    const response = await fetch(`${API_BASE_URL}/refunds/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundId, splits }),
    });
    if (!response.ok) throw new Error('Failed to split refund');
    return response.json();
  },

  // Returns
  async listReturns(): Promise<{ success: boolean; count: number; returns: ReturnIndexDoc[] }> {
    const response = await fetch(`${API_BASE_URL}/returns`);
    if (!response.ok) throw new Error('Failed to list returns');
    return response.json();
  },
  async getReturn(id: string): Promise<{ success: boolean; return: ReturnIndexDoc }> {
    const response = await fetch(`${API_BASE_URL}/returns/${id}`);
    if (!response.ok) throw new Error('Failed to get return');
    return response.json();
  },
  async listPendingReturns(): Promise<{ success: boolean; count: number; items: ReturnIndexDoc[] }> {
    const response = await fetch(`${API_BASE_URL}/returns/pending`);
    if (!response.ok) throw new Error('Failed to list pending returns');
    return response.json();
  },
  async initiateReturn(refundDetailId: string, returnItems: ReturnItem[], reason?: string, expectedReturnDate?: string) {
    const response = await fetch(`${API_BASE_URL}/returns/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundDetailId, returnItems, reason, expectedReturnDate }),
    });
    if (!response.ok) throw new Error('Failed to initiate return');
    return response.json();
  },
  async updateReturnStatus(id: string, action: 'receive' | 'inspect' | 'restock' | 'mark-lost-by-courier' | 'mark-paid-by-courier') {
    const response = await fetch(`${API_BASE_URL}/returns/${id}/${action}`, { method: 'PUT' });
    if (!response.ok) throw new Error('Failed to update return status');
    return response.json();
  },

  // Reconciliation
  async createReconciliation(refundId: string, payload: { expectedValue: number; actualValue: number; status: 'PENDING' | 'MATCHED' | 'VARIANCE_FOUND'; notes?: string }): Promise<{ success: boolean; reconciliation: RefundReconciliation }> {
    const response = await fetch(`${API_BASE_URL}/reconciliation/${refundId}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to reconcile');
    return response.json();
  },
  async listUnaccounted(): Promise<{ success: boolean; count: number; items: RefundReconciliation[] }> {
    const response = await fetch(`${API_BASE_URL}/reconciliation/unaccounted`);
    if (!response.ok) throw new Error('Failed to list unaccounted');
    return response.json();
  },
  async listPartial(): Promise<{ success: boolean; count: number; items: RefundReconciliation[] }> {
    const response = await fetch(`${API_BASE_URL}/reconciliation/partial`);
    if (!response.ok) throw new Error('Failed to list partial');
    return response.json();
  },
  async varianceReport(): Promise<{ success: boolean; count: number; items: RefundReconciliation[] }> {
    const response = await fetch(`${API_BASE_URL}/reconciliation/variance-report`);
    if (!response.ok) throw new Error('Failed to get variance report');
    return response.json();
  },

  // Reports
  async refundSummary(): Promise<{ success: boolean; totalAmount: number; byType: Record<string, number> }> {
    const response = await fetch(`${API_BASE_URL}/reports/refund-summary`);
    if (!response.ok) throw new Error('Failed to fetch refund summary');
    return response.json();
  },
  async accountingStatus(): Promise<{ success: boolean; statusTotals: Record<string, { amount: number; count: number }> }> {
    const response = await fetch(`${API_BASE_URL}/reports/accounting-status`);
    if (!response.ok) throw new Error('Failed to fetch accounting status');
    return response.json();
  },
  async staffErrors(): Promise<{ success: boolean; byStaff: Record<string, { count: number; totalVariance: number }> }> {
    const response = await fetch(`${API_BASE_URL}/reports/staff-errors`);
    if (!response.ok) throw new Error('Failed to fetch staff errors');
    return response.json();
  },
  async defectiveProducts(): Promise<{ success: boolean; count: number; items: DefectiveProductItem[] }> {
    const response = await fetch(`${API_BASE_URL}/reports/defective-products`);
    if (!response.ok) throw new Error('Failed to fetch defective products');
    return response.json();
  },
  async financialImpact(): Promise<{ success: boolean; totals: { totalRefunds: number; totalAccounted: number; recoveryRate: number } }> {
    const response = await fetch(`${API_BASE_URL}/reports/financial-impact`);
    if (!response.ok) throw new Error('Failed to fetch financial impact');
    return response.json();
  },
};