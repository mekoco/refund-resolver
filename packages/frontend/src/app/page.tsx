'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function Home() {
  const [apiHealth, setApiHealth] = useState<{ status: string; message: string; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching from:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api');
        
        const healthResponse = await api.checkHealth();
        console.log('Health response:', healthResponse);
        setApiHealth(healthResponse);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 text-red-700 p-4 rounded-lg">
            <p className="font-semibold">Error loading data</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome to Refund Resolver</h1>
          <p className="text-gray-600">Manage your orders efficiently</p>
          
          <div className="mt-6 flex gap-4">
            <Link 
              href="/orders"
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              View Orders
            </Link>
          </div>
          
          {apiHealth && (
            <div className="mt-4 bg-green-100 text-green-800 p-3 rounded-lg inline-block">
              <p className="text-sm font-medium">
                API Status: {apiHealth.status} - {apiHealth.message}
              </p>
            </div>
          )}
        </header>
        
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Order Management System</h2>
          <p className="text-gray-600">
            Navigate to the Orders page to view and manage all your orders.
          </p>
        </section>

        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p className="mt-2">Data fetched from Firestore via Express API</p>
        </footer>
      </div>
    </main>
  );
}