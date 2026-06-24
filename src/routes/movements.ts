import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { Movement, InventoryRow, Product, getShift } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let movements = await readJson<Movement>('movements.json');
    const { startDate, endDate, type, locationId } = req.query;
    if (startDate)  movements = movements.filter(m => m.createdAt >= (startDate as string));
    if (endDate)    movements = movements.filter(m => m.createdAt <= (endDate as string) + 'T23:59:59');
    if (type)       movements = movements.filter(m => m.type === type);
    if (locationId) movements = movements.filter(m => m.locationId === locationId);
    res.json(movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/stock-in', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { productId, locationId, quantity, notes } = req.body;
  if (!productId || !locationId || !quantity || quantity <= 0) { res.status(400).json({ error: 'שדות חסרים' }); return; }
  const user = req.user!;

  try {
    const products = await readJson<Product>('products.json');
    const product = products.find(p => p.id === productId);
    if (!product) { res.status(404).json({ error: 'מוצר לא נמצא' }); return; }

    const now = new Date().toISOString();
    const qty = Number(quantity);

    const inventory = await readJson<InventoryRow>('inventory.json');
    const idx = inventory.findIndex(i => i.productId === productId);
    let newQty: number;
    if (idx >= 0) { inventory[idx].quantity += qty; inventory[idx].lastUpdated = now; newQty = inventory[idx].quantity; }
    else { newQty = qty; inventory.push({ productId, quantity: qty, lastUpdated: now }); }
    await writeJson('inventory.json', inventory);

    const movement: Movement = {
      id: uuidv4(), type: 'in', productId, locationId,
      quantity: qty, quantityAfter: newQty, price: product.price, totalValue: qty * product.price,
      shift: getShift(now), userId: user.id, userName: user.name, createdAt: now, notes,
    };
    const movements = await readJson<Movement>('movements.json');
    movements.push(movement);
    await writeJson('movements.json', movements);
    res.status(201).json({ ...movement, newQuantity: newQty });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/stock-out', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { productId, locationId, quantity, notes } = req.body;
  if (!productId || !locationId || !quantity || quantity <= 0) { res.status(400).json({ error: 'שדות חסרים' }); return; }
  const user = req.user!;

  try {
    const products = await readJson<Product>('products.json');
    const product = products.find(p => p.id === productId);
    if (!product) { res.status(404).json({ error: 'מוצר לא נמצא' }); return; }

    const qty = Number(quantity);
    const inventory = await readJson<InventoryRow>('inventory.json');
    const idx = inventory.findIndex(i => i.productId === productId);
    const currentQty = idx >= 0 ? inventory[idx].quantity : 0;

    if (idx === -1 || currentQty < qty) { res.status(400).json({ error: 'אין מספיק מלאי', available: currentQty }); return; }

    const now = new Date().toISOString();
    inventory[idx].quantity -= qty;
    inventory[idx].lastUpdated = now;
    const newQty = inventory[idx].quantity;
    await writeJson('inventory.json', inventory);

    const movement: Movement = {
      id: uuidv4(), type: 'out', productId, locationId,
      quantity: qty, quantityAfter: newQty, price: product.price, totalValue: qty * product.price,
      shift: getShift(now), userId: user.id, userName: user.name, createdAt: now, notes,
    };
    const movements = await readJson<Movement>('movements.json');
    movements.push(movement);
    await writeJson('movements.json', movements);
    res.status(201).json({ ...movement, newQuantity: newQty });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
