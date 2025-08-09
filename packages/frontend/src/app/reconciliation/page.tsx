'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RefundReconciliation } from '@/types/refund';

export default function ReconciliationPage() {
  const [unaccounted, setUnaccounted] = useState<RefundReconciliation[]>([]);
  const [partial, setPartial] = useState<RefundReconciliation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [u, p] = await Promise.all([api.listUnaccounted(), api.listPartial()]);
    setUnaccounted(u.items);
    setPartial(p.items);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation</h1>
          <p className="text-gray-600">Unaccounted and variance items</p>
        </div>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Unaccounted</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Refund Detail</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unaccounted.map(x => (
                  <tr key={x.id}>
                    <td className="px-4 py-2 text-sm">{x.refundDetailId}</td>
                    <td className="px-4 py-2 text-sm">{x.expectedValue?.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm">{x.actualValue?.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm">{x.variance?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unaccounted.length === 0 && <div className="text-center py-6 text-gray-500">None</div>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Variance Found</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Refund Detail</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partial.map(x => (
                  <tr key={x.id}>
                    <td className="px-4 py-2 text-sm">{x.refundDetailId}</td>
                    <td className="px-4 py-2 text-sm">{x.expectedValue?.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm">{x.actualValue?.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm">{x.variance?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partial.length === 0 && <div className="text-center py-6 text-gray-500">None</div>}
          </div>
        </section>
      </div>
    </div>
  );
} 