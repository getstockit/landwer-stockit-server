import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Product, InventoryRow, Supplier, Location } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Same legacy fallback as routes/suppliers.ts — records saved before
// alertMode existed had a plain alertEnabled boolean meaning "1 day before".
function effectiveAlertMode(s: Supplier): { mode: string; daysBefore: number; customDay?: number } {
  if (s.alertMode) return { mode: s.alertMode, daysBefore: s.alertDaysBefore ?? 1, customDay: s.customDay };
  const legacy = s as any;
  return { mode: legacy.alertEnabled === false ? 'off' : 'daysBefore', daysBefore: 1 };
}

// GET suppliers whose reminder condition is met TODAY (either "N days before
// their order day" or a fixed custom weekday), with the current stock of
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

    const today = new Date().getDay(); // 0=ראשון ... 6=שבת

    const triggeringSuppliers = suppliers.filter(s => {
      const cfg = effectiveAlertMode(s);
      if (cfg.mode === 'off') return false;
      if (cfg.mode === 'custom') return cfg.customDay === today;
      const triggerDay = ((s.orderDay - cfg.daysBefore) % 7 + 7) % 7;
      return triggerDay === today;
    });

    const result = triggeringSuppliers.map(s => ({
      supplier: s,
      orderDayName: DAY_NAMES[s.orderDay],
      products: enrichedProducts.filter(p => p.supplierId === s.id),
    }));

    res.json({ todayName: DAY_NAMES[today], reminders: result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
