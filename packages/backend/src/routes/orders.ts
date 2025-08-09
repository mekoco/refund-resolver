import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../config/firebase';
import { OrderExcelReader } from '../utils/orderExcelReader';
import { Order } from '@packages/shared';
import * as fs from 'fs';

const router = Router();
const upload = multer({ dest: '/tmp/' });

router.get('/', async (req: Request, res: Response) => {
  try {
    const ordersSnapshot = await db.collection('orders').get();
    const orders: Order[] = [];
    
    console.log(`Fetching orders - found ${ordersSnapshot.size} documents`);
    
    ordersSnapshot.forEach((doc: any) => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    
    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

router.post('/upload-excel', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }
  
  try {
    console.log('Processing uploaded Excel file:', req.file.originalname);
    
    const reader = new OrderExcelReader();
    const orders = await reader.readAndConvertOrders(req.file.path);
    
    console.log(`Parsed ${orders.length} orders from Excel file`);
    
    let batch = db.batch();
    const ordersCollection = db.collection('orders');
    
    let count = 0;
    let batchCount = 0;
    const batchSize = 500;
    const results = {
      total: orders.length,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    for (const order of orders) {
      try {
        const docRef = ordersCollection.doc(order.orderId);
        batch.set(docRef, order);
        batchCount++;
        count++;
        
        if (batchCount === batchSize) {
          console.log('Committing batch of', batchSize, 'orders');
          await batch.commit();
          batch = db.batch(); // Create new batch after commit
          batchCount = 0;
          results.successful = count;
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Order ${order.orderId}: ${error.message}`);
      }
    }
    
    if (batchCount > 0) {
      console.log('Committing final batch with', batchCount, 'orders');
      await batch.commit();
      results.successful = count;
    }
    
    
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      message: `Successfully imported ${results.successful} orders`,
      results
    });
    
  } catch (error: any) {
    console.error('Error processing Excel file:', error);
    
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to process Excel file',
      details: error.message
    });
  }
});

router.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('orders').doc(req.params.orderId).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      order: { id: doc.id, ...doc.data() }
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

export default router;