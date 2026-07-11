import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Product, InventoryRow, Supplier, Location } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// GET suppliers whose weekly order day is TOMORROW, with the current stock of
// every product they supply — additive to /reports/low-stock, not a replacement.
router.get('/supplier-reminders', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products  = (await readJson<Product>('products.json')).filter(p => p.isActive);
    const inventory = await readJson<InventoryRow>('inventory.json');
    const suppliers = (await readJson<Supplier>('suppliers.json')).filter(s => s.isActive);
    const locations = await readJson<Location>('locations.json');

    const enrichedProducts = products.map(p => ({
      ...p,
      quantity: inventory.find(i => i.productId === p.id)?.quantity ?? 0,
      locationName: locations.find(l => l.id === p.locationId)?.name || '',
    }));

    const today = new Date().getDay();       // 0=ראשון ... 6=שבת
    const tomorrow = (today + 1) % 7;

    const reminders = suppliers
      .filter(s => s.alertEnabled && s.orderDay === tomorrow)
      .map(s => ({
        supplier: s,
        orderDayName: DAY_NAMES[s.orderDay],
        products: enrichedProducts.filter(p => p.supplierId === s.id),
      }));

    res.json({ todayName: DAY_NAMES[today], tomorrowName: DAY_NAMES[tomorrow], reminders });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
