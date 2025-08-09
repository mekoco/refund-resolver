import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await db.collection('staff').doc(data.staffCode).set({ ...data, createdAt: new Date(), updatedAt: new Date() });
    const doc = await db.collection('staff').doc(data.staffCode).get();
    res.status(201).json({ success: true, staff: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to create staff' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('staff').get();
    res.json({ success: true, staff: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list staff' });
  }
});

router.get('/:staffCode', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('staff').doc(req.params.staffCode).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, staff: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get staff' });
  }
});

router.put('/:staffCode', async (req: Request, res: Response) => {
  try {
    await db.collection('staff').doc(req.params.staffCode).update({ ...req.body, updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update staff' });
  }
});

router.delete('/:staffCode', async (req: Request, res: Response) => {
  try {
    await db.collection('staff').doc(req.params.staffCode).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete staff' });
  }
});

export default router; 