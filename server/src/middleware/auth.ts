import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Login required' });
  }
  try {
    const p = jwt.verify(h.slice(7), process.env.JWT_SECRET as string) as any;
    (req as any).user = { id: p.id, role: p.role, branchId: p.branchId };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
export const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user;
    if (!u || !roles.includes(u.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
