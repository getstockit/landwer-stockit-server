/**
 * Testing helper — fills every product's quantity in Supabase with a random
 * value, so you can exercise the low-stock alert flow (badge, banner, alerts
 * page) without manually scanning 78 products one by one.
 *
 * About a third of products will land BELOW their minQty (triggers alerts),
 * the rest land comfortably above it — so you can immediately see both the
 * "alerts appear" case and the "alerts clear when you add stock" case.
 *
 * Reads current product definitions (for minQty) from Supabase directly,
 * not from the local data/*.json files — so this is safe to run even after
 * you've edited products/prices through the app.
 *
 * Usage:
 *   cd server
 *   npx ts-node --project scripts/tsconfig.json scripts/randomize-quantities.ts
 *
 * Warning: this OVERWRITES every product's quantity with a random number.
 * Only run this for testing, never on a live system with real counts.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

interface Product { id: string; minQty: number; isActive: boolean; }
interface InventoryRow { productId: string; quantity: number; lastUpdated: string; }

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('חסרים SUPABASE_URL / SUPABASE_SERVICE_KEY בקובץ .env');
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: productsRow, error: pErr } = await sb.from('kv_store').select('value').eq('key', 'products.json').maybeSingle();
  if (pErr || !productsRow) { console.error('לא הצלחתי לקרוא products.json:', pErr?.message); process.exit(1); }
  const products: Product[] = productsRow.value;

  const inventory: InventoryRow[] = products
    .filter(p => p.isActive)
    .map(p => {
      const belowThreshold = Math.random() < 0.35;
      const min = Math.max(1, p.minQty);
      const quantity = belowThreshold
        ? Math.floor(Math.random() * min)
        : min + Math.floor(Math.random() * min * 3);
      return { productId: p.id, quantity, lastUpdated: new Date().toISOString() };
    });

  const { error: wErr } = await sb
    .from('kv_store')
    .upsert({ key: 'inventory.json', value: inventory, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (wErr) { console.error('שגיאה בכתיבה:', wErr.message); process.exit(1); }

  const lowCount = inventory.filter(i => {
    const p = products.find(pr => pr.id === i.productId);
    return p && i.quantity <= p.minQty;
  }).length;

  console.log(`עודכנו כמויות אקראיות ל-${inventory.length} מוצרים`);
  console.log(`${lowCount} מוצרים מתחת לסף המינימום (לבדיקת ההתראות)`);
  console.log(`${inventory.length - lowCount} מוצרים עם מלאי תקין`);
}

main();
