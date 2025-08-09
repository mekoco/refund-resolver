import * as path from 'path';
import { db } from '../config/firebase';
import { OrderExcelReader } from '../utils/orderExcelReader';
import { Order } from '@packages/shared';

async function seedOrders() {
  try {
    console.log('Starting order seeding process...');
    
    const reader = new OrderExcelReader();
    const excelPath = path.join(__dirname, '../../../../sample-orders.xlsx');
    
    console.log('Reading Excel file from:', excelPath);
    const orders = await reader.readAndConvertOrders(excelPath);
    
    console.log(`Found ${orders.length} orders to seed`);
    
    const batch = db.batch();
    const ordersCollection = db.collection('orders');
    
    let count = 0;
    const batchSize = 500;
    
    for (const order of orders) {
      const docRef = ordersCollection.doc(order.orderId);
      batch.set(docRef, order);
      count++;
      
      if (count % batchSize === 0) {
        await batch.commit();
        console.log(`Committed batch of ${batchSize} orders (total: ${count})`);
      }
    }
    
    if (count % batchSize !== 0) {
      await batch.commit();
      console.log(`Committed final batch (total: ${count} orders)`);
    }
    
    console.log('✅ Order seeding completed successfully!');
    console.log(`Total orders seeded: ${count}`);
    
    const sampleOrders = orders.slice(0, 3);
    console.log('\nSample of seeded orders:');
    sampleOrders.forEach(order => {
      console.log(`- Order ${order.orderId}: ${order.items.length} items, Status: ${order.orderStatus}`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding orders:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedOrders().then(() => {
    console.log('Seed script finished');
    process.exit(0);
  });
}

export { seedOrders };