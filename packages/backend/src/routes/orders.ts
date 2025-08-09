import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../config/firebase';
import { OrderExcelReader } from '../utils/orderExcelReader';
import { Order, AccountingStatus, RefundStatus, RefundType } from '@packages/shared';
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
    
    const results = {
      total: orders.length,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    for (const order of orders) {
      try {
        const docRef = db.collection('orders').doc(order.orderId);
        const existingDoc = await docRef.get();
        const now = new Date();
        
        // Create RefundDetail delta if buyerRefundAmount changed
        if (existingDoc.exists) {
          const existing = existingDoc.data() as Order;
          const oldAmount = Number(existing?.buyerRefundAmount || 0);
          const newAmount = Number(order.buyerRefundAmount || 0);
          if (newAmount !== oldAmount) {
            const difference = newAmount - oldAmount; // could be negative
            await db.collection('refundDetails').add({
              orderId: order.orderId,
              refundAmount: difference,
              refundDate: now,
              status: difference >= 0 ? RefundStatus.INITIATED : RefundStatus.PROCESSING,
              refundType: RefundType.OTHERS,
              accountingStatus: AccountingStatus.UNACCOUNTED,
              createdBy: 'system:excel-upload',
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        
        await docRef.set({ ...order, updatedAt: now }, { merge: true });
        await updateOrderRefundSnapshot(order.orderId);
        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Order ${order.orderId}: ${error.message}`);
      }
    }
    
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      message: `Successfully processed ${results.successful} orders` ,
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

async function updateOrderRefundSnapshot(orderId: string) {
  const refundSnap = await db.collection('refundDetails').where('orderId', '==', orderId).get();
  const refundDetails: any[] = refundSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Derive accounted amount from latest reconciliation if exists; otherwise sum good return items
  const reconciliationSnap = await db.collection('refundReconciliations').where('refundDetailId', 'in', refundDetails.map(r => r.id)).get().catch(() => ({ docs: [] } as any));
  const detailIdToRecon: Record<string, any[]> = {};
  for (const d of reconciliationSnap.docs) {
    const data = { id: d.id, ...d.data() } as any;
    const key = data.refundDetailId;
    if (!detailIdToRecon[key]) detailIdToRecon[key] = [];
    detailIdToRecon[key].push(data);
  }

  const accountedRefundAmount = refundDetails.reduce((sum, rd) => {
    const recs = detailIdToRecon[rd.id] || [];
    let actualValue = 0;
    if (recs.length > 0) {
      // take the most recent reconciliation actualValue
      recs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      actualValue = Number(recs[0]?.actualValue || 0);
    } else if (Array.isArray(rd.returnTrackings)) {
      for (const rt of rd.returnTrackings) {
        if (!Array.isArray(rt.returnItems)) continue;
        for (const item of rt.returnItems) {
          if (item?.condition === 'GOOD' || item?.condition === 0 /* fallback */) {
            actualValue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
          }
        }
      }
    }
    return sum + (isNaN(actualValue) ? 0 : actualValue);
  }, 0);

  await db.collection('orders').doc(orderId).set({
    refundAccount: {
      refundDetails,
      accountedRefundAmount,
    },
    updatedAt: new Date(),
  }, { merge: true });
}

export default router;