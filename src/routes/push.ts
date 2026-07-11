import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { PushSubscriptionRecord } from '../types';
import { authenticate, AuthRequest, requireManager } from '../middleware/auth';
import { sendDailyDigestToManagers } from '../utils/push';

const router = Router();

// GET the public VAPID key — safe to expose, it's public by design (the
// private key never leaves the server / .env).
router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// POST save a push subscription for the current manager's device — manager only
// (matches the "only managers get push" decision).
router.post('/subscribe', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    res.status(400).json({ error: 'מנוי Push לא תקין' }); return;
  }
  try {
    const subs = await readJson<PushSubscriptionRecord>('push_subscriptions.json');
    // Same device re-subscribing (e.g. after clearing permission) — replace, don't duplicate.
    const filtered = subs.filter(s => s.subscription.endpoint !== subscription.endpoint);
    const rec: PushSubscriptionRecord = {
      id: uuidv4(), userId: req.user!.id, subscription, createdAt: new Date().toISOString(),
    };
    filtered.push(rec);
    await writeJson('push_subscriptions.json', filtered);
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST remove a push subscription (turning notifications off on this device)
router.post('/unsubscribe', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { endpoint } = req.body;
  try {
    const subs = await readJson<PushSubscriptionRecord>('push_subscriptions.json');
    const filtered = subs.filter(s => !(s.userId === req.user!.id && s.subscription.endpoint === endpoint));
    await writeJson('push_subscriptions.json', filtered);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET whether the current manager has an active subscription — used by the
// client to show "Push is ON" vs "Push is OFF" without storing that locally.
router.get('/status', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const subs = await readJson<PushSubscriptionRecord>('push_subscriptions.json');
    const count = subs.filter(s => s.userId === req.user!.id).length;
    res.json({ subscribed: count > 0, deviceCount: count });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST run-daily-check — NOT protected by normal user login. It's meant to be
// called once a day by an external scheduler (e.g. cron-job.org, GitHub
// Actions cron, or Render's Cron Job service) that has no user session.
// Protected instead by a shared secret in the query string, matched against
// CRON_SECRET in .env. See DEPLOY notes for how to wire up the scheduler.
router.post('/run-daily-check', async (req: Request, res: Response): Promise<void> => {
  const secret = req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    res.status(403).json({ error: 'לא מורשה' }); return;
  }
  try {
    const result = await sendDailyDigestToManagers();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
