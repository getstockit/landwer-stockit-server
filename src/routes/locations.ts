import { Router, Response } from 'express';
import { readJson } from '../utils/db';
import { Location } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locations = (await readJson<Location>('locations.json')).filter(l => l.isActive);
    res.json(locations.sort((a, b) => a.sortOrder - b.sortOrder));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
