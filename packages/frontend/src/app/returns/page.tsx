'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ReturnIndexDoc } from '@/types/refund';

export default function ReturnsPage() {
  const [items, setItems] = useState<ReturnIndexDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await api.listReturns();
      setItems(res.returns);
    } catch (e) {
      setError('Failed to load returns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReturns(); }, []);

  const quickAction = async (id: string, action: 'receive' | 'inspect' | 'restock' | 'mark-lost-by-courier' | 'mark-paid-by-courier') => {
    await api.updateReturnStatus(id, action);
    fetchReturns();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Returns</h1>
          <p className="text-gray-600">Embedded return trackings index</p>
        </div>

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Refund Detail</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map(x => (
                <tr key={x.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{x.id}</td>
                  <td className="px-4 py-2 text-sm">{x.orderId}</td>
                  <td className="px-4 py-2 text-sm">{x.refundDetailId}</td>
                  <td className="px-4 py-2 text-sm">{String(x.returnStatus)}</td>
                  <td className="px-4 py-2 text-sm">{x.totalReturnValue?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm space-x-2">
                    <button className="text-indigo-600" onClick={() => quickAction(x.id, 'receive')}>Receive</button>
                    <button className="text-indigo-600" onClick={() => quickAction(x.id, 'inspect')}>Inspect</button>
                    <button className="text-indigo-600" onClick={() => quickAction(x.id, 'restock')}>Restock</button>
                    <button className="text-red-600" onClick={() => quickAction(x.id, 'mark-lost-by-courier')}>Lost</button>
                    <button className="text-green-600" onClick={() => quickAction(x.id, 'mark-paid-by-courier')}>Paid</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">No returns found</div>
          )}
        </div>

        {error && <div className="text-red-600 mt-4">{error}</div>}
      </div>
    </div>
  );
} 