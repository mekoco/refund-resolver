'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RefundDetail, RefundStatus, RefundType } from '@/types/refund';

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRefunds = async () => {
    try {
      setLoading(true);
      const res = await api.listRefunds();
      setRefunds(res.refunds);
    } catch (e) {
      setError('Failed to load refunds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRefunds(); }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Refunds</h1>
          <p className="text-gray-600">List of refund details</p>
        </div>

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Accounting</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {refunds.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{r.id}</td>
                  <td className="px-4 py-2 text-sm">{r.orderId}</td>
                  <td className="px-4 py-2 text-sm">{r.refundType}</td>
                  <td className="px-4 py-2 text-sm">{r.refundAmount.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm">{r.status}</td>
                  <td className="px-4 py-2 text-sm">{r.accountingStatus}</td>
                  <td className="px-4 py-2 text-sm">{new Date(r.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {refunds.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">No refunds found</div>
          )}
        </div>

        {error && <div className="text-red-600 mt-4">{error}</div>}
      </div>
    </div>
  );
} 