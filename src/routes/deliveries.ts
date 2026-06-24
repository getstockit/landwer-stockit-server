import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { Delivery, DeliveryLineItem, Movement, InventoryRow, Product, getShift } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deliveries = await readJson<Delivery>('deliveries.json');
    res.json(deliveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/analyze', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) { res.status(400).json({ error: 'תמונה חובה' }); return; }

  try {
    const products = (await readJson<Product>('products.json')).filter(p => p.isActive);
    const skuIndex: Record<string, Product> = {};
    products.forEach(p => { if (p.sku?.trim()) skuIndex[p.sku.trim().toLowerCase()] = p; });

    const productList = products.map(p => `${p.name}${p.sku ? ` [מק"ט: ${p.sku}]` : ''}`).join(', ');

    const aiRes = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (mimeType || 'image/jpeg') as 'image/jpeg'|'image/png'|'image/gif'|'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `זוהי תעודת משלוח. חלץ את כל הפריטים והכמויות.
רשימת מוצרים קיימים במערכת: ${productList}

החזר JSON בלבד ללא טקסט נוסף:
{"supplier":"שם ספק אם מופיע","items":[{"productName":"שם כפי שמופיע בתעודה","sku":"מקט אם מופיע","quantity":5,"unit":"יחידה"}]}

quantity הוא תמיד מספר - הכמות שמופיעה בתעודת המשלוח עבור השורה.`,
          },
        ],
      }],
    });

    const textBlock = aiRes.content.find(c => c.type === 'text');
    const rawText = textBlock?.type === 'text' ? textBlock.text : '{}';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed: { supplier?: string; items: { productName: string; sku?: string; quantity: number; unit: string }[] } =
      jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] };

    const lineItems: DeliveryLineItem[] = (parsed.items || []).map(item => {
      let match: Product | undefined;
      if (item.sku?.trim()) match = skuIndex[item.sku.trim().toLowerCase()];
      if (!match) match = products.find(p => p.name === item.productName);
      if (!match) match = products.find(p => p.name.includes(item.productName) || item.productName.includes(p.name));

      return {
        productName: item.productName,
        sku: item.sku || match?.sku || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || match?.unit || 'יחידה',
        matched: !!match,
        productId: match?.id,
      };
    });

    res.json({
      supplier: parsed.supplier || '',
      matched:   lineItems.filter(i => i.matched),
      unmatched: lineItems.filter(i => !i.matched),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'שגיאת AI: ' + (err.message || 'לא ידוע') });
  }
});

router.post('/confirm', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { supplier, items, unmatchedItems, locationId } = req.body;
  if (!items) { res.status(400).json({ error: 'items חובה' }); return; }

  const user = req.user!;
  const now = new Date().toISOString();
  const deliveryId = uuidv4();

  try {
    const products  = await readJson<Product>('products.json');
    const inventory = await readJson<InventoryRow>('inventory.json');
    const movements = await readJson<Movement>('movements.json');

    const applied: DeliveryLineItem[] = [];

    for (const item of items as DeliveryLineItem[]) {
      if (!item.productId) continue;
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;

      const qty = Number(item.quantity);
      const loc = locationId || product.locationId;

      const idx = inventory.findIndex(i => i.productId === item.productId);
      let newQty: number;
      if (idx >= 0) { inventory[idx].quantity += qty; inventory[idx].lastUpdated = now; newQty = inventory[idx].quantity; }
      else { newQty = qty; inventory.push({ productId: item.productId, quantity: qty, lastUpdated: now }); }

      if (item.sku && !product.sku) {
        const pi = products.findIndex(p => p.id === item.productId);
        if (pi >= 0) products[pi].sku = item.sku;
      }

      movements.push({
        id: uuidv4(), type: 'delivery', productId: item.productId, locationId: loc,
        quantity: qty, quantityAfter: newQty, price: product.price, totalValue: qty * product.price,
        shift: getShift(now), userId: user.id, userName: user.name, createdAt: now,
        notes: supplier ? `תעודת משלוח: ${supplier}` : 'תעודת משלוח', deliveryId,
      });

      applied.push({ ...item, matched: true });
    }

    await writeJson('inventory.json', inventory);
    await writeJson('movements.json', movements);
    await writeJson('products.json', products);

    const delivery: Delivery = {
      id: deliveryId, receivedBy: user.id, receiverName: user.name,
      supplier, locationId, items: applied, unmatchedItems: unmatchedItems || [],
      createdAt: now,
    };
    const deliveries = await readJson<Delivery>('deliveries.json');
    deliveries.push(delivery);
    await writeJson('deliveries.json', deliveries);

    res.status(201).json(delivery);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
