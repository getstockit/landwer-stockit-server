import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Product, Location, InventoryRow, Movement, Supplier } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';

const router = Router();

const SHIFT_HE: Record<string, string> = { morning: 'בוקר', afternoon: 'צהריים', evening: 'ערב' };

// Lightweight low-stock summary — available to everyone (employee + manager),
// unlike the full /current and /history reports which are manager-only.
// Used for the badge/banner shown to all users, not just full reporting.
router.get('/low-stock', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products  = (await readJson<Product>('products.json')).filter(p => p.isActive);
    const inventory = await readJson<InventoryRow>('inventory.json');
    const locations = await readJson<Location>('locations.json');
    const suppliers = await readJson<Supplier>('suppliers.json');

    const lowStock = products
      .map(p => ({
        id: p.id, name: p.name, unit: p.unit, minQty: p.minQty,
        quantity: inventory.find(i => i.productId === p.id)?.quantity ?? 0,
        locationName: locations.find(l => l.id === p.locationId)?.name || '',
        supplierName: p.supplierId ? (suppliers.find(s => s.id === p.supplierId)?.name || null) : null,
      }))
      .filter(p => p.quantity <= p.minQty)
      .sort((a, b) => a.quantity - b.quantity);

    res.json({ count: lowStock.length, items: lowStock });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/current', authenticate, requireManager, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products  = (await readJson<Product>('products.json')).filter(p => p.isActive);
    const inventory = await readJson<InventoryRow>('inventory.json');
    const locations = await readJson<Location>('locations.json');

    const enriched = products.map(p => {
      const qty = inventory.find(i => i.productId === p.id)?.quantity ?? 0;
      return {
        ...p, quantity: qty, totalValue: qty * p.price,
        locationName: locations.find(l => l.id === p.locationId)?.name || '',
        isLow: qty <= p.minQty,
      };
    });

    const totalValue = enriched.reduce((s, p) => s + p.totalValue, 0);
    const lowStock   = enriched.filter(p => p.isLow);

    const byLocation: Record<string, { name: string; value: number; count: number }> = {};
    enriched.forEach(p => {
      if (!byLocation[p.locationId]) byLocation[p.locationId] = { name: p.locationName, value: 0, count: 0 };
      byLocation[p.locationId].value += p.totalValue;
      byLocation[p.locationId].count++;
    });

    res.json({ totalValue, productCount: enriched.length, lowStockCount: lowStock.length, lowStock, byLocation, products: enriched });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/history', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  const { startDate, endDate, startTime, endTime, type, shift, userId, locationId } = req.query;

  try {
    let movements = await readJson<Movement>('movements.json');
    const products  = await readJson<Product>('products.json');
    const locations = await readJson<Location>('locations.json');

    // Date+time range — startTime/endTime let the manager narrow to a specific
    // window within a day (e.g. "what happened between 14:00-18:00"), not just whole days.
    const startDT = startDate ? `${startDate}T${startTime || '00:00'}:00` : undefined;
    const endDT   = endDate   ? `${endDate}T${endTime || '23:59'}:59.999` : undefined;
    if (startDT) movements = movements.filter(m => m.createdAt >= startDT);
    if (endDT)   movements = movements.filter(m => m.createdAt <= endDT);

    if (type && type !== 'all')             movements = movements.filter(m => m.type === type);
    if (shift && shift !== 'all')           movements = movements.filter(m => m.shift === shift);
    if (userId && userId !== 'all')         movements = movements.filter(m => m.userId === userId);
    if (locationId && locationId !== 'all') movements = movements.filter(m => m.locationId === locationId);

    const enriched = movements.map(m => ({
      ...m,
      productName:  products.find(p => p.id === m.productId)?.name || '',
      productUnit:  products.find(p => p.id === m.productId)?.unit || '',
      locationName: locations.find(l => l.id === m.locationId)?.name || '',
      shiftHe: SHIFT_HE[m.shift] || m.shift,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const inMoves       = enriched.filter(m => m.type === 'in');
    const outMoves      = enriched.filter(m => m.type === 'out');
    const deliveryMoves = enriched.filter(m => m.type === 'delivery');

    const byShift: Record<string, { count: number; value: number }> = { morning: {count:0,value:0}, afternoon: {count:0,value:0}, evening: {count:0,value:0} };
    enriched.forEach(m => { byShift[m.shift].count++; byShift[m.shift].value += m.totalValue; });

    const byUser: Record<string, { count: number; value: number }> = {};
    enriched.forEach(m => {
      if (!byUser[m.userName]) byUser[m.userName] = { count: 0, value: 0 };
      byUser[m.userName].count++;
      byUser[m.userName].value += m.totalValue;
    });

    const byLocation: Record<string, { name: string; count: number; value: number }> = {};
    enriched.forEach(m => {
      if (!byLocation[m.locationId]) byLocation[m.locationId] = { name: m.locationName, count: 0, value: 0 };
      byLocation[m.locationId].count++;
      byLocation[m.locationId].value += m.totalValue;
    });

    res.json({
      movements: enriched,
      summary: {
        totalIn:       inMoves.reduce((s,m)=>s+m.totalValue,0),
        totalOut:      outMoves.reduce((s,m)=>s+m.totalValue,0),
        totalDelivery: deliveryMoves.reduce((s,m)=>s+m.totalValue,0),
        countIn: inMoves.length, countOut: outMoves.length, countDelivery: deliveryMoves.length,
        byShift, byUser, byLocation,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
