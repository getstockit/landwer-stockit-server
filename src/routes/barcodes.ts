import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Location, Product, InventoryRow } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

interface Barcode { id: string; code: string; locationId: string; direction: 'in'|'out'; createdAt: string; }

const router = Router();

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
