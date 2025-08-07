import * as path from 'path';
import { OrderExcelReader } from '../utils/orderExcelReader';

async function testExcelRead() {
  try {
    const reader = new OrderExcelReader();
    const excelPath = path.join(__dirname, '../../../../sample-orders.xlsx');
    
    console.log('Reading Excel file from:', excelPath);
    const orders = await reader.readAndConvertOrders(excelPath);
    
    console.log(`Successfully read ${orders.length} valid orders`);
    
    orders.forEach((order, index) => {
      console.log(`\nOrder ${index + 1}:`);
      console.log(`  Order No: ${order.orderNo}`);
      console.log(`  Store: ${order.storeName}`);
      console.log(`  Status: ${order.orderStatus}`);
      console.log(`  Revenue: $${order.orderRevenue.toFixed(2)}`);
      console.log(`  Items: ${order.items.length}`);
      if (order.items.length > 0) {
        order.items.forEach(item => {
          console.log(`    - ${item.merchantSKU} (Qty: ${item.salesVolume}, Gift: ${item.isGift})`);
        });
      }
    });
    
  } catch (error) {
    console.error('Error reading Excel file:', error);
  }
}

testExcelRead();