import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Location, Product, InventoryRow } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';
import { regenerateBarcodes, Barcode } from '../utils/barcodes';

const router = Router();

// POST regenerate all barcodes with the current numbering scheme — manager only.
// Also runs automatically whenever locations are added/edited/removed (see
// routes/locations.ts); this manual trigger is here as a safety net / for the
// one-time migration off the old F1I/Z3O per-type scheme.
router.post('/regenerate', authenticate, requireManager, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const barcodes = await regenerateBarcodes();
    res.json({ success: true, count: barcodes.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const barcodes = await readJson<Barcode>('barcodes.json');
    const locations = await readJson<Location>('locations.json');
    res.json(barcodes.map(bc => ({ ...bc, location: locations.find(l => l.id === bc.locationId) })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Main scan endpoint
router.get('/lookup/:code', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const barcodes = await readJson<Barcode>('barcodes.json');
    const bc = barcodes.find(b => b.code === req.params.code);
    if (!bc) { res.status(404).json({ error: 'ברקוד לא נמצא' }); return; }

    const locations = await readJson<Location>('locations.json');
    const location = locations.find(l => l.id === bc.locationId);
    if (!location) { res.status(404).json({ error: 'מיקום לא נמצא' }); return; }

    const products  = (await readJson<Product>('products.json')).filter(p => p.locationId === bc.locationId && p.isActive);
    const inventory = await readJson<InventoryRow>('inventory.json');

    const productList = products.map(p => ({
      ...p,
      quantity: inventory.find(i => i.productId === p.id)?.quantity ?? 0,
    }));

    res.json({ direction: bc.direction, location, products: productList });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
