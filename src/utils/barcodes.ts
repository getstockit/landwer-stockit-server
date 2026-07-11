import { readJson, writeJson } from './db';
import { Location } from '../types';

export interface Barcode { id: string; code: string; locationId: string; direction: 'in' | 'out'; createdAt: string; }

// ──────────────────────────────────────────────────────────────────────────
// Barcode numbering scheme
// ---------------------------------------------------------------------------
// Continuous number across ALL fridges AND freezers together (no separate
// counters per type, no "F"/"Z" prefix) + a letter for direction:
//   1I / 1O, 2I / 2O, 3I / 3O ... (I = in/כניסה, O = out/יציאה)
//
// English letters, not Hebrew כ/ה/נ/י: these are real CODE128 barcodes (see
// BarcodesPage.tsx), and CODE128 can only encode ASCII/Latin characters — it
// physically cannot encode Hebrew at all, regardless of which phone scans
// it. The fridge/freezer distinction is still visible via the location name
// printed right next to the code on the label — it's just not baked into
// the code string itself.
//
// Locations excluded from barcodes (hasBarcode === false, e.g. dough/bread
// freezers that aren't tracked by scan) are skipped and don't consume a
// number, keeping the sequence gap-free.
// ──────────────────────────────────────────────────────────────────────────

export async function regenerateBarcodes(): Promise<Barcode[]> {
  const locations = (await readJson<Location>('locations.json'))
    .filter(l => l.isActive && l.hasBarcode !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const now = new Date().toISOString();
  const barcodes: Barcode[] = [];

  locations.forEach((loc, idx) => {
    const n = String(idx + 1);
    barcodes.push({ id: `bc-${loc.id}-in`, code: `${n}I`, locationId: loc.id, direction: 'in', createdAt: now });
    barcodes.push({ id: `bc-${loc.id}-out`, code: `${n}O`, locationId: loc.id, direction: 'out', createdAt: now });
  });

  await writeJson('barcodes.json', barcodes);
  return barcodes;
}
