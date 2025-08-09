import { Order } from '@/types/order';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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
};