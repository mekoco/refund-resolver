import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('returns').get();
    const returns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, count: returns.length, returns });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list returns' });
  }
});

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const ref = await db.collection('returns').add({ ...data, createdAt: new Date(), updatedAt: new Date() });
    const doc = await ref.get();
    res.status(201).json({ success: true, return: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to initiate return' });
  }
});

router.put('/:id/receive', async (req: Request, res: Response) => {
  try {
    await db.collection('returns').doc(req.params.id).update({ returnStatus: 'RECEIVED', updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark received' });
  }
});

router.put('/:id/inspect', async (req: Request, res: Response) => {
  try {
    await db.collection('returns').doc(req.params.id).update({ returnStatus: 'INSPECTING', updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark inspecting' });
  }
});

router.put('/:id/restock', async (req: Request, res: Response) => {
  try {
    await db.collection('returns').doc(req.params.id).update({ returnStatus: 'RESTOCKED', updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark restocked' });
  }
});

router.put('/:id/mark-lost-by-courier', async (req: Request, res: Response) => {
  try {
    await db.collection('returns').doc(req.params.id).update({ returnStatus: 'LOST_BY_COURIER', updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark lost by courier' });
  }
});

router.put('/:id/mark-paid-by-courier', async (req: Request, res: Response) => {
  try {
    await db.collection('returns').doc(req.params.id).update({ returnStatus: 'PAID_BY_COURIER', updatedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark paid by courier' });
  }
});

export default router; 