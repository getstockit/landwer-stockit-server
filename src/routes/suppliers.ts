import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { Supplier } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const suppliers = (await readJson<Supplier>('suppliers.json')).filter(s => s.isActive);
    res.json(suppliers);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create a new supplier — manager only
router.post('/', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, orderDay, alertEnabled } = req.body;
  if (!name?.trim() || orderDay === undefined || orderDay === null) {
    res.status(400).json({ error: 'שם ספק ויום הזמנה חובה' }); return;
  }
  const day = Number(orderDay);
  if (Number.isNaN(day) || day < 0 || day > 6) { res.status(400).json({ error: 'יום הזמנה לא תקין' }); return; }
  try {
    const suppliers = await readJson<Supplier>('suppliers.json');
    const supplier: Supplier = {
      id: uuidv4(), name: name.trim(), orderDay: day,
      alertEnabled: alertEnabled !== false, isActive: true,
      createdAt: new Date().toISOString(),
    };
    suppliers.push(supplier);
    await writeJson('suppliers.json', suppliers);
    res.status(201).json(supplier);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update a supplier — manager only
router.put('/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const suppliers = await readJson<Supplier>('suppliers.json');
    const idx = suppliers.findIndex(s => s.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'ספק לא נמצא' }); return; }

    const { name, orderDay, alertEnabled } = req.body;
    const s = suppliers[idx];
    if (name !== undefined)         s.name = name;
    if (orderDay !== undefined)     s.orderDay = Number(orderDay);
    if (alertEnabled !== undefined) s.alertEnabled = !!alertEnabled;

    await writeJson('suppliers.json', suppliers);
    res.json(s);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE (soft) a supplier — manager only
router.delete('/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const suppliers = await readJson<Supplier>('suppliers.json');
    const idx = suppliers.findIndex(s => s.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'ספק לא נמצא' }); return; }
    suppliers[idx].isActive = false;
    await writeJson('suppliers.json', suppliers);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
