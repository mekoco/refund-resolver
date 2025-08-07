import { db } from '../config/firebase';
import * as path from 'path';
import { OrderExcelReader } from '../utils/orderExcelReader';

export async function seedOrderDatabase() {
  try {
    const ordersCollection = db.collection('orders');
    
    const snapshot = await ordersCollection.get();
    if (!snapshot.empty) {
      console.log(`Orders collection already has ${snapshot.size} orders`);
      return;
    }
    
    const reader = new OrderExcelReader();
    const excelPath = path.join(__dirname, '../../../../sample-orders.xlsx');
    
    console.log('Seeding orders from Excel file...');
    const orders = await reader.readAndConvertOrders(excelPath);
    
    for (const order of orders) {
      await ordersCollection.doc(order.orderNo).set(order);
    }
    
    console.log(`Database seeded with ${orders.length} orders`);
  } catch (error) {
    console.error('Error seeding order database:', error);
  }
}