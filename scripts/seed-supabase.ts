/**
 * One-time setup script — uploads the existing seed data (products, locations,
 * barcodes, inventory) from the local data/*.json files into Supabase.
 *
 * Run this ONCE after creating your Supabase project and setting the
 * SUPABASE_URL / SUPABASE_SERVICE_KEY environment variables (see
 * SUPABASE_SETUP.md). Running it again later is safe — it overwrites each
 * table with the current contents of the local JSON file, so don't re-run
 * it after the app has been used in production or you'll lose real data.
 *
 * Usage:
 *   cd server
 *   npm install
 *   npx ts-node scripts/seed-supabase.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const TABLES = [
  'users.json',
  'locations.json',
  'products.json',
  'inventory.json',
  'barcodes.json',
  'movements.json',
  'deliveries.json',
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('❌ חסרים SUPABASE_URL / SUPABASE_SERVICE_KEY בקובץ .env');
    console.error('   ראה SUPABASE_SETUP.md להוראות.');
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log('🔄 מעלה נתונים ל-Supabase...\n');

  for (const filename of TABLES) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭  ${filename} — קובץ לא נמצא, מדלג`);
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const value = raw.trim() ? JSON.parse(raw) : [];

    const { error } = await sb
      .from('kv_store')
      .upsert({ key: filename, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error(`❌ ${filename} — שגיאה: ${error.message}`);
      process.exit(1);
    }

    console.log(`✅ ${filename} — ${Array.isArray(value) ? value.length : 0} רשומות הועלו`);
  }

  console.log('\n🎉 סיום! כל הנתונים נמצאים כעת ב-Supabase ולא יימחקו עם הפעלה מחדש של השרת.');
}

main();
