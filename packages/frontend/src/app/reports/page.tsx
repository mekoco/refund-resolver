'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface DefectiveProductItem {
  orderId: string;
  refundDetailId: string;
  skuName: string;
  quantity: number;
  unitPrice: number;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ totalAmount: number; byType: Record<string, number> } | null>(null);
  const [accounting, setAccounting] = useState<Record<string, { amount: number; count: number }> | null>(null);
  const [staff, setStaff] = useState<Record<string, { count: number; totalVariance: number }> | null>(null);
  const [defects, setDefects] = useState<DefectiveProductItem[]>([]);
  const [impact, setImpact] = useState<{ totalRefunds: number; totalAccounted: number; recoveryRate: number } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [s, a, st, d, f] = await Promise.all([
        api.refundSummary({ startDate: start, endDate: end }),
        api.accountingStatus({ startDate: start, endDate: end }),
        api.staffErrors({ startDate: start, endDate: end }),
        api.defectiveProducts({ startDate: start, endDate: end }),
        api.financialImpact({ startDate: start, endDate: end }),
      ]);
      setSummary({ totalAmount: s.totalAmount, byType: s.byType });
      setAccounting(a.statusTotals);
      setStaff(st.byStaff);
      setDefects(d.items);
      setImpact(f.totals);
    } catch (e: unknown) {
      setError('Failed to load reports. Please adjust date range or try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-600">Refund tracking dashboard</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">{error}</div>
        )}

        {loading && (
          <div className="text-gray-500">Loading reports…</div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Total Refunds</div>
            <div className="text-2xl font-semibold">{summary?.totalAmount?.toFixed(2) ?? '-'}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Accounted</div>
            <div className="text-2xl font-semibold">{impact?.totalAccounted?.toFixed(2) ?? '-'}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Recovery Rate</div>
            <div className="text-2xl font-semibold">{impact ? `${(impact.recoveryRate * 100).toFixed(1)}%` : '-'}</div>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Refunds by Type</h2></div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {summary && Object.entries(summary.byType).map(([type, amount]) => (
              <div key={type} className="border rounded p-4">
                <div className="text-sm text-gray-500">{type}</div>
                <div className="text-lg font-semibold">{amount.toFixed(2)}</div>
              </div>
            ))}
            {!summary && <div className="text-gray-500 p-6">No data</div>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Accounting Status</h2></div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounting && Object.entries(accounting).map(([status, { amount, count }]) => (
              <div key={status} className="border rounded p-4">
                <div className="text-sm text-gray-500">{status}</div>
                <div className="text-lg font-semibold">{amount.toFixed(2)} • {count} orders</div>
              </div>
            ))}
            {!accounting && <div className="text-gray-500 p-6">No data</div>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Staff Errors</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staff && Object.entries(staff).map(([code, v]) => (
                  <tr key={code}>
                    <td className="px-4 py-2 text-sm">{code}</td>
                    <td className="px-4 py-2 text-sm">{v.count}</td>
                    <td className="px-4 py-2 text-sm">{v.totalVariance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!staff && <div className="text-center py-6 text-gray-500">No data</div>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold">Defective Products</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Refund Detail</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {defects.map((x, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-sm">{x.orderId}</td>
                    <td className="px-4 py-2 text-sm">{x.refundDetailId}</td>
                    <td className="px-4 py-2 text-sm">{x.skuName}</td>
                    <td className="px-4 py-2 text-sm">{x.quantity}</td>
                    <td className="px-4 py-2 text-sm">{x.unitPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {defects.length === 0 && <div className="text-center py-6 text-gray-500">No data</div>}
          </div>
        </section>
      </div>
    </div>
  );
} 