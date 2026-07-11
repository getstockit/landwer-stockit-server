import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Product, Location, InventoryRow, Movement } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';

const router = Router();

const SHIFT_HE: Record<string, string> = { morning: 'בוקר', afternoon: 'צהריים', evening: 'ערב' };

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
  const { startDate, endDate } = req.query;

  try {
    let movements = await readJson<Movement>('movements.json');
    const products  = await readJson<Product>('products.json');
    const locations = await readJson<Location>('locations.json');

    if (startDate) movements = movements.filter(m => m.createdAt >= (startDate as string));
    if (endDate)   movements = movements.filter(m => m.createdAt <= (endDate as string) + 'T23:59:59');

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

    res.json({
      movements: enriched,
      summary: {
        totalIn:       inMoves.reduce((s,m)=>s+m.totalValue,0),
        totalOut:      outMoves.reduce((s,m)=>s+m.totalValue,0),
        totalDelivery: deliveryMoves.reduce((s,m)=>s+m.totalValue,0),
        countIn: inMoves.length, countOut: outMoves.length, countDelivery: deliveryMoves.length,
        byShift, byUser,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
