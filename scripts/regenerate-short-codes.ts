/**
 * One-time migration — replaces the long, hard-to-type barcode codes
 * (e.g. "LDW-IN-003") with short, memorable ones that employees can type
 * by hand on iPhone (where the in-app camera scanner doesn't work due to
 * an Apple/WebKit limitation in standalone PWA mode — see MOBILE_INSTALL.md).
 *
 * New format: <LOCATION><DIRECTION>
 *   Fridges:    F1I / F1O ... F8I / F8O
 *   Freezers:   Z1I / Z1O ... Z7I / Z7O
 *   Dry storage: DRYI / DRYO
 * (I = in/כניסה, O = out/יציאה)
 *
 * This does NOT change which locations have barcodes — the three
 * no-barcode freezers (dough, bread, gluten-free bread) stay excluded,
 * exactly as before.
 *
 * Usage:
 *   cd server
 *   npx ts-node --project scripts/tsconfig.json scripts/regenerate-short-codes.ts
 *
 * Safe to re-run — it only touches the barcodes.json table, never
 * products/inventory/movements, so running it again just regenerates the
 * same mapping deterministically.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

interface Location { id: string; name: string; type: string; isActive: boolean; }
interface Barcode { id: string; code: string; locationId: string; direction: 'in' | 'out'; createdAt: string; }

// Locations that intentionally have no barcode (dough, bread, gluten-free bread)
const NO_BARCODE_LOCS = new Set(['loc-z1', 'loc-z5', 'loc-z6']);

function shortCodeFor(locationId: string): string | null {
  const fridgeMatch  = locationId.match(/^loc-f(\d+)$/);
  const freezerMatch = locationId.match(/^loc-z(\d+)$/);
  if (fridgeMatch)  return `F${fridgeMatch[1]}`;
  if (freezerMatch) return `Z${freezerMatch[1]}`;
  if (locationId === 'loc-dry') return 'DRY';
  return null; // unknown location id pattern — skip rather than guess
}

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

  const now = new Date().toISOString();
  const barcodes: Barcode[] = [];

  for (const loc of locations.filter(l => l.isActive)) {
    if (NO_BARCODE_LOCS.has(loc.id)) continue;
    const base = shortCodeFor(loc.id);
    if (!base) { console.warn(`מיקום לא מוכר, מדלג: ${loc.id}`); continue; }

    barcodes.push({ id: `bc-${loc.id}-in`,  code: `${base}I`, locationId: loc.id, direction: 'in',  createdAt: now });
    barcodes.push({ id: `bc-${loc.id}-out`, code: `${base}O`, locationId: loc.id, direction: 'out', createdAt: now });
  }

  // Sanity check: every code must be unique, or barcode lookup would be ambiguous
  const codes = barcodes.map(b => b.code);
  const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (duplicates.length > 0) {
    console.error('קודים כפולים שהתגלו, עוצר ללא שינוי:', duplicates);
    process.exit(1);
  }

  const { error: wErr } = await sb
    .from('kv_store')
    .upsert({ key: 'barcodes.json', value: barcodes, updated_at: now }, { onConflict: 'key' });

  if (wErr) { console.error('שגיאה בכתיבה:', wErr.message); process.exit(1); }

  console.log(`נוצרו ${barcodes.length} ברקודים חדשים (${barcodes.length / 2} מיקומים)`);
  console.log('דוגמאות:');
  barcodes.slice(0, 6).forEach(b => console.log(`  ${b.code}  ←  ${locations.find(l => l.id === b.locationId)?.name}`));
}

main();
