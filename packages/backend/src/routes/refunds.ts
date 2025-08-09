import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('refundDetails').get();
    const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: refunds.length, refunds });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list refunds' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('refundDetails').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get refund' });
  }
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const ref = await db.collection('refundDetails').add({ ...data, createdAt: new Date(), updatedAt: new Date() });
    const doc = await ref.get();
    res.status(201).json({ success: true, refund: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to create refund' });
  }
});

router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await db.collection('refundDetails').doc(req.params.id).update({ status, updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.collection('refundDetails').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete refund' });
  }
});

export default router; 