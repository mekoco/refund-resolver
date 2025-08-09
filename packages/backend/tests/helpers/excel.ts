import * as XLSX from 'xlsx';

export function buildOrdersExcel(rows: Array<Record<string, string | number>>): Buffer {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, 'Orders');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}

export function buildOrderRow(params: {
  orderId: string;
  storeName?: string;
  orderRevenue?: number;
  items?: { sku: string; qty: number; isGift?: boolean }[];
  buyerRefundAmount?: number;
  otherPlatformFees?: number;
  times?: Partial<{ order: string; confirm: string; release: string; update: string; completed: string }>;
  orderStatus?: string;
}): Record<string, string | number> {
  const { orderId, storeName = 'Store A', orderRevenue = 1000, items = [], buyerRefundAmount = 0, otherPlatformFees = 0, times = {}, orderStatus = 'COMPLETED' } = params;

  return {
    'Order No': orderId,
    'BigSeller Store Name': storeName,
    'Order Revenue': String(orderRevenue),
    'Merchant SKU': items.map(i => i.sku).join('\n'),
    'Sales Volume': items.map(i => String(i.qty)).join('\n'),
    'Gift': items.map(i => (i.isGift ? 'Yes' : 'No')).join('\n'),
    'Commodity Cost': '0',
    'Profit/Loss': '0',
    'Profit Rate': '0',
    'Product Sales': '0',
    'Shipping Fee Paid by Buyer': '0',
    'Subsidy for Discount & Promotion': '0',
    'Commission Fee': '0',
    'Transaction Fee': '0',
    'Service Charge': '0',
    'Shipping Fee Paid by Seller': '0',
    'Marketing Fees': '0',
    'Buyer Refund Amount': String(buyerRefundAmount),
    'Other Platform Fees': String(otherPlatformFees),
    'Order Time': times.order || new Date().toISOString(),
    'Confirm Time': times.confirm || new Date().toISOString(),
    'Release Time': times.release || new Date().toISOString(),
    'Update Time': times.update || new Date().toISOString(),
    'Completed Time': times.completed || new Date().toISOString(),
    'Order Status': orderStatus,
  };
} 