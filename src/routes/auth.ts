import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { readJson, writeJson } from '../utils/db';
import { User } from '../types';
import { signToken, authenticate, AuthRequest, requireManager } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'landwer-stockit-secret-2024';
const router = Router();

// GET all active users (for the "who am I" picker on login screen)
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = (await readJson<User>('users.json')).filter(u => u.isActive);
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST register a new employee — request goes to "pending" until a manager approves it
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, pin } = req.body;
  if (!name?.trim() || !pin || pin.length !== 4) {
    res.status(400).json({ error: 'שם וקוד בן 4 ספרות חובה' }); return;
  }
  try {
    const users = await readJson<User>('users.json');
    if (users.some(u => u.name.trim() === name.trim() && (u.isActive || u.approvalStatus === 'pending'))) {
      res.status(400).json({ error: 'כבר קיים משתמש בשם זה, או שכבר יש בקשה ממתינה עם שם זה' }); return;
    }
    const passwordHash = await bcrypt.hash(pin, 10);
    const user: User = {
      id: uuidv4(), name: name.trim(), pin, passwordHash,
      role: 'employee', isActive: false, approvalStatus: 'pending',
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeJson('users.json', users);
    // No token — the account isn't active until a manager approves the request.
    res.status(201).json({ pending: true, message: 'הבקשה נשלחה למנהל ותאושר בקרוב' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET all pending employee requests — manager only
router.get('/pending', authenticate, requireManager, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await readJson<User>('users.json');
    const pending = users.filter(u => u.approvalStatus === 'pending');
    res.json(pending.map(u => ({ id: u.id, name: u.name, createdAt: u.createdAt })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST approve a pending employee request — manager only
router.post('/users/:id/approve', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await readJson<User>('users.json');
    const idx = users.findIndex(u => u.id === req.params.id && u.approvalStatus === 'pending');
    if (idx === -1) { res.status(404).json({ error: 'בקשה לא נמצאה' }); return; }
    users[idx].isActive = true;
    users[idx].approvalStatus = 'approved';
    await writeJson('users.json', users);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST reject a pending employee request — manager only (removes the request entirely)
router.post('/users/:id/reject', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await readJson<User>('users.json');
    const idx = users.findIndex(u => u.id === req.params.id && u.approvalStatus === 'pending');
    if (idx === -1) { res.status(404).json({ error: 'בקשה לא נמצאה' }); return; }
    users.splice(idx, 1);
    await writeJson('users.json', users);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST register a manager — requires an existing manager's token, OR bootstrap if none exist
router.post('/register-manager', async (req: Request, res: Response): Promise<void> => {
  const { name, pin, bootstrapCode } = req.body;
  if (!name?.trim() || !pin || pin.length !== 4) {
    res.status(400).json({ error: 'שם וקוד בן 4 ספרות חובה' }); return;
  }
  try {
    const users = await readJson<User>('users.json');
    const hasManager = users.some(u => u.role === 'manager' && u.isActive);

    if (hasManager) {
      // Need a valid manager token to create another manager
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) { res.status(403).json({ error: 'יש צורך באישור מנהל קיים' }); return; }
      try {
        const payload: any = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'manager') { res.status(403).json({ error: 'רק מנהל יכול להוסיף מנהל נוסף' }); return; }
      } catch { res.status(403).json({ error: 'אישור לא תקף' }); return; }
    } else {
      // First manager ever — require bootstrap code to prevent randoms from self-promoting
      if (bootstrapCode !== 'LANDWER2024') {
        res.status(403).json({ error: 'קוד הקמה שגוי' }); return;
      }
    }

    if (users.some(u => u.name.trim() === name.trim() && u.isActive)) {
      res.status(400).json({ error: 'כבר קיים משתמש בשם זה' }); return;
    }
    const passwordHash = await bcrypt.hash(pin, 10);
    const user: User = {
      id: uuidv4(), name: name.trim(), pin, passwordHash,
      role: 'manager', isActive: true, createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeJson('users.json', users);
    const token = signToken({ id: user.id, name: user.name, role: user.role });
    res.status(201).json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST login by selecting name + entering PIN
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { userId, pin } = req.body;
  try {
    const users = await readJson<User>('users.json');
    const user = users.find(u => u.id === userId && u.isActive);
    if (!user) { res.status(401).json({ error: 'משתמש לא נמצא' }); return; }
    const ok = await bcrypt.compare(pin, user.passwordHash);
    if (!ok) { res.status(401).json({ error: 'קוד שגוי' }); return; }
    const token = signToken({ id: user.id, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE deactivate a user — manager only
router.delete('/users/:id', authenticate, requireManager, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await readJson<User>('users.json');
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'משתמש לא נמצא' }); return; }
    users[idx].isActive = false;
    await writeJson('users.json', users);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
