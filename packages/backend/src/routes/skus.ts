import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await db.collection('skus').doc(data.name).set({ ...data, createdAt: new Date(), updatedAt: new Date() });
    const doc = await db.collection('skus').doc(data.name).get();
    res.status(201).json({ success: true, sku: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to create SKU' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('skus').get();
    res.json({ success: true, skus: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list SKUs' });
  }
});

router.get('/:skuName', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('skus').doc(req.params.skuName).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, sku: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get SKU' });
  }
});

router.put('/:skuName', async (req: Request, res: Response) => {
  try {
    await db.collection('skus').doc(req.params.skuName).update({ ...req.body, updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update SKU' });
  }
});

router.delete('/:skuName', async (req: Request, res: Response) => {
  try {
    await db.collection('skus').doc(req.params.skuName).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete SKU' });
  }
});

export default router; 