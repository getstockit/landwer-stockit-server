import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { Product, InventoryRow } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';

const router = Router();

// GET all products joined with current inventory quantity
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products  = await readJson<Product>('products.json');
    const inventory = await readJson<InventoryRow>('inventory.json');
    const enriched = products.map(p => ({
      ...p,
      quantity: inventory.find(i => i.productId === p.id)?.quantity ?? 0,
    }));
    res.json(enriched);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create new product — manager only
router.post('/', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, locationId, unit, sku, price, minQty, hasBarcode } = req.body;
  if (!name?.trim() || !locationId || !unit) { res.status(400).json({ error: 'שם, מיקום ויחידה חובה' }); return; }

  try {
    const products = await readJson<Product>('products.json');
    const product: Product = {
      id: uuidv4(), name: name.trim(), locationId, unit,
      sku: sku?.trim() || '', price: Number(price) || 0,
      minQty: Number(minQty) || 0, hasBarcode: hasBarcode !== false,
      isActive: true, createdAt: new Date().toISOString(),
    };
    products.push(product);
    await writeJson('products.json', products);

    const inventory = await readJson<InventoryRow>('inventory.json');
    inventory.push({ productId: product.id, quantity: 0, lastUpdated: new Date().toISOString() });
    await writeJson('inventory.json', inventory);

    res.status(201).json({ ...product, quantity: 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update product fields (sku, price, name, minQty...) — manager only
router.put('/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products = await readJson<Product>('products.json');
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'מוצר לא נמצא' }); return; }

    const { name, unit, sku, price, minQty, hasBarcode, isActive } = req.body;
    const p = products[idx];
    if (name !== undefined)       p.name = name;
    if (unit !== undefined)       p.unit = unit;
    if (sku !== undefined)        p.sku = sku;
    if (price !== undefined)      p.price = Number(price);
    if (minQty !== undefined)     p.minQty = Number(minQty);
    if (hasBarcode !== undefined) p.hasBarcode = hasBarcode;
    if (isActive !== undefined)   p.isActive = isActive;

    await writeJson('products.json', products);
    const inventory = await readJson<InventoryRow>('inventory.json');
    const qty = inventory.find(i => i.productId === p.id)?.quantity ?? 0;
    res.json({ ...p, quantity: qty });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
