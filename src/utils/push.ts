import webpush from 'web-push';
import { readJson, writeJson } from './db';
import { Product, InventoryRow, Supplier, Location, User, PushSubscriptionRecord } from '../types';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY חסרים ב-.env');
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

// Same legacy-fallback logic as routes/suppliers.ts / routes/alerts.ts.
function effectiveAlertMode(s: Supplier): { mode: string; daysBefore: number; customDay?: number } {
  if (s.alertMode) return { mode: s.alertMode, daysBefore: s.alertDaysBefore ?? 1, customDay: s.customDay };
  const legacy = s as any;
  return { mode: legacy.alertEnabled === false ? 'off' : 'daysBefore', daysBefore: 1 };
}

export interface DailyDigest {
  lowStockCount: number;
  supplierNames: string[];
}

// Recomputes exactly what /reports/low-stock and /alerts/supplier-reminders
// would show right now, condensed into one push-notification-sized summary.
export async function computeDailyDigest(): Promise<DailyDigest> {
  const products  = (await readJson<Product>('products.json')).filter(p => p.isActive);
  const inventory = await readJson<InventoryRow>('inventory.json');
  const suppliers = (await readJson<Supplier>('suppliers.json')).filter(s => s.isActive);

  const lowStockCount = products.filter(p => {
    const qty = inventory.find(i => i.productId === p.id)?.quantity ?? 0;
    return qty <= p.minQty;
  }).length;

  const today = new Date().getDay();
  const supplierNames = suppliers
    .filter(s => {
      const cfg = effectiveAlertMode(s);
      if (cfg.mode === 'off') return false;
      if (cfg.mode === 'custom') return cfg.customDay === today;
      const triggerDay = ((s.orderDay - cfg.daysBefore) % 7 + 7) % 7;
      return triggerDay === today;
    })
    .map(s => s.name);

  return { lowStockCount, supplierNames };
}

function digestToPayload(d: DailyDigest): { title: string; body: string; url: string } | null {
  if (d.lowStockCount === 0 && d.supplierNames.length === 0) return null;
  const parts: string[] = [];
  if (d.lowStockCount > 0) parts.push(`${d.lowStockCount} מוצרים במלאי נמוך`);
  if (d.supplierNames.length > 0) parts.push(`יום הזמנה: ${d.supplierNames.join(', ')}`);
  return { title: 'Stock-It · לנדוור — התראות היום', body: parts.join(' · '), url: '/alerts' };
}

// Sends the daily digest to every manager who has push enabled on at least
// one device. Prunes subscriptions the browser has since revoked (410/404).
export async function sendDailyDigestToManagers(): Promise<{ sent: number; pruned: number; skipped: boolean }> {
  ensureConfigured();

  const digest = await computeDailyDigest();
  const payload = digestToPayload(digest);
  if (!payload) return { sent: 0, pruned: 0, skipped: true }; // nothing to report today

  const users = await readJson<User>('users.json');
  const managerIds = new Set(users.filter(u => u.role === 'manager' && u.isActive).map(u => u.id));

  const subs = await readJson<PushSubscriptionRecord>('push_subscriptions.json');
  const targetSubs = subs.filter(s => managerIds.has(s.userId));

  let sent = 0;
  const stillValid: PushSubscriptionRecord[] = [...subs];

  for (const rec of targetSubs) {
    try {
      await webpush.sendNotification(rec.subscription as any, JSON.stringify(payload));
      sent++;
    } catch (err: any) {
      // 404/410 = the browser/OS revoked this subscription (uninstalled, permission
      // revoked, etc.) — drop it so we stop wasting calls on it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        const idx = stillValid.findIndex(s => s.id === rec.id);
        if (idx !== -1) stillValid.splice(idx, 1);
      }
    }
  }

  const pruned = subs.length - stillValid.length;
  if (pruned > 0) await writeJson('push_subscriptions.json', stillValid);

  return { sent, pruned, skipped: false };
}
