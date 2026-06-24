import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../types';

const SECRET = process.env.JWT_SECRET || 'landwer-stockit-secret-2024';

export interface AuthRequest extends Request {
  user?: { id: string; name: string; role: UserRole };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'לא מחובר' }); return; }
  try {
    req.user = jwt.verify(token, SECRET) as any;
    next();
  } catch { res.status(401).json({ error: 'התחברות לא תקפה' }); }
}

export function requireManager(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'manager') { res.status(403).json({ error: 'פעולה זו דורשת הרשאת מנהל' }); return; }
  next();
}

export function signToken(payload: { id: string; name: string; role: UserRole }): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}
