/**
 * One-time migration — moves barcodes from the old per-type scheme
 * (F1I/F1O ... Z7I/Z7O, separate counters for fridges vs freezers, "F"/"Z"
 * prefix) to a continuous, no-prefix numbering:
 *
 *   1I / 1O, 2I / 2O, 3I / 3O ... — one running sequence across ALL
 *   fridges AND freezers together, no separation by type, no F/Z prefix.
 *   (I = in/כניסה, O = out/יציאה)
 *
 * Note on why "I"/"O" and not Hebrew letters: these are real CODE128
 * barcodes (see BarcodesPage.tsx / JsBarcode), and CODE128 physically
 * cannot encode Hebrew characters — only Latin/ASCII — regardless of which
 * phone does the scanning. The fridge/freezer type is still shown right
 * next to the code via the location name printed on the label.
 *
 * This does NOT change which locations have barcodes — locations flagged
 * hasBarcode: false (or, for older records without that field yet, the
 * three known no-barcode freezers: dough, bread, gluten-free bread) stay
 * excluded, exactly as before.
 *
 * Usage:
 *   cd server
 *   npx ts-node --project scripts/tsconfig.json scripts/regenerate-short-codes.ts
 *
 * Safe to re-run — it only touches the barcodes.json table, never
 * products/inventory/movements, so running it again just regenerates the
 * same mapping deterministically (numbers may shift if you've added/removed
 * locations since the last run — that's expected and correct).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

interface Location { id: string; name: string; type: string; sortOrder: number; isActive: boolean; hasBarcode?: boolean; }
interface Barcode { id: string; code: string; locationId: string; direction: 'in' | 'out'; createdAt: string; }

// Fallback for location records saved before the hasBarcode field existed.
const LEGACY_NO_BARCODE_LOCS = new Set(['loc-z1', 'loc-z5', 'loc-z6']);

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('חסרים SUPABASE_URL / SUPABASE_SERVICE_KEY בקובץ .env');
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: locRow, error: locErr } = await sb.from('kv_store').select('value').eq('key', 'locations.json').maybeSingle();
  if (locErr || !locRow) { console.error('לא הצלחתי לקרוא locations.json:', locErr?.message); process.exit(1); }
  const locations: Location[] = locRow.value;

  const eligible = locations
    .filter(l => l.isActive)
    .filter(l => (l.hasBarcode !== undefined ? l.hasBarcode !== false : !LEGACY_NO_BARCODE_LOCS.has(l.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const now = new Date().toISOString();
  const barcodes: Barcode[] = [];

  eligible.forEach((loc, idx) => {
    const n = String(idx + 1);
    barcodes.push({ id: `bc-${loc.id}-in`, code: `${n}I`, locationId: loc.id, direction: 'in', createdAt: now });
    barcodes.push({ id: `bc-${loc.id}-out`, code: `${n}O`, locationId: loc.id, direction: 'out', createdAt: now });
  });

  const { error: wErr } = await sb
    .from('kv_store')
    .upsert({ key: 'barcodes.json', value: barcodes, updated_at: now }, { onConflict: 'key' });

  if (wErr) { console.error('שגיאה בכתיבה:', wErr.message); process.exit(1); }

  console.log(`נוצרו ${barcodes.length} ברקודים חדשים (${barcodes.length / 2} מיקומים), מספור רציף ללא הפרדה בין מקרר למקפיא`);
  console.log('דוגמאות:');
  barcodes.slice(0, 6).forEach(b => console.log(`  ${b.code}  ←  ${locations.find(l => l.id === b.locationId)?.name}`));
}

main();
