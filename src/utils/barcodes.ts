import { readJson, writeJson } from './db';
import { Location } from '../types';

export interface Barcode { id: string; code: string; locationId: string; direction: 'in' | 'out'; createdAt: string; }

// ──────────────────────────────────────────────────────────────────────────
// Barcode numbering scheme (עודכן):
// מספור דו-ספרתי רציף על כל המיקומים יחד (בלי הפרדה בין מקררים למקפיאים,
// ובלי קידומת "F") + אות עברית שמציינת כיוון:
//   כ = כניסה (in)     ה = הוצאה (out)
// לדוגמה: מיקום ראשון ברשימה -> "01כ" / "01ה", השני -> "02כ" / "02ה" וכו'.
// המספור נקבע לפי סדר ה-sortOrder של המיקומים הפעילים שמסומנים כבעלי ברקוד
// (hasBarcode !== false). כל שינוי במיקומים (הוספה/הסרה/סידור מחדש) דורש
// קריאה מחדש לפונקציה הזו כדי לשמור על מספור רציף ללא כפילויות.
// ──────────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export async function regenerateBarcodes(): Promise<Barcode[]> {
  const locations = (await readJson<Location>('locations.json'))
    .filter(l => l.isActive && l.hasBarcode !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const now = new Date().toISOString();
  const barcodes: Barcode[] = [];

  locations.forEach((loc, idx) => {
    const n = pad2(idx + 1);
    barcodes.push({ id: `bc-${loc.id}-in`, code: `${n}כ`, locationId: loc.id, direction: 'in', createdAt: now });
    barcodes.push({ id: `bc-${loc.id}-out`, code: `${n}ה`, locationId: loc.id, direction: 'out', createdAt: now });
  });

  await writeJson('barcodes.json', barcodes);
  return barcodes;
}
