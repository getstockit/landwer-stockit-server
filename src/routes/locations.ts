import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { Location, Product } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';
import { regenerateBarcodes } from '../utils/barcodes';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locations = (await readJson<Location>('locations.json')).filter(l => l.isActive);
    res.json(locations.sort((a, b) => a.sortOrder - b.sortOrder));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create a new fridge/freezer/warehouse location — manager only
router.post('/', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, type, hasBarcode } = req.body;
  if (!name?.trim() || !type) { res.status(400).json({ error: 'שם וסוג מיקום חובה' }); return; }
  try {
    const locations = await readJson<Location>('locations.json');
    const maxSort = locations.reduce((m, l) => Math.max(m, l.sortOrder), 0);
    const loc: Location = {
      id: uuidv4(), name: name.trim(), type,
      sortOrder: maxSort + 1, isActive: true,
      hasBarcode: hasBarcode !== false,
    };
    locations.push(loc);
    await writeJson('locations.json', locations);
    await regenerateBarcodes();
    res.status(201).json(loc);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update a location (rename, change type, reorder, toggle barcode) — manager only
router.put('/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locations = await readJson<Location>('locations.json');
    const idx = locations.findIndex(l => l.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'מיקום לא נמצא' }); return; }

    const { name, type, sortOrder, hasBarcode } = req.body;
    const l = locations[idx];
    if (name !== undefined)       l.name = name;
    if (type !== undefined)       l.type = type;
    if (sortOrder !== undefined)  l.sortOrder = Number(sortOrder);
    if (hasBarcode !== undefined) l.hasBarcode = !!hasBarcode;

    await writeJson('locations.json', locations);
    await regenerateBarcodes();
    res.json(l);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE (soft) a location — manager only. Blocked if active products still point to it.
router.delete('/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locations = await readJson<Location>('locations.json');
    const idx = locations.findIndex(l => l.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'מיקום לא נמצא' }); return; }

    const products = await readJson<Product>('products.json');
    const stillUsed = products.some(p => p.isActive && p.locationId === req.params.id);
    if (stillUsed) {
      res.status(400).json({ error: 'יש מוצרים פעילים המשויכים למיקום הזה — יש לשייך אותם למיקום אחר לפני המחיקה' });
      return;
    }

    locations[idx].isActive = false;
    await writeJson('locations.json', locations);
    await regenerateBarcodes();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
