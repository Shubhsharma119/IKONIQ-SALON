import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
const loginSchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(6),
});
const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'ACCOUNTANT']),
  branchId: z.number().int().optional(),
});
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Phone and password required' });
  const { phone, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid phone or password' });
  }
  const token = jwt.sign(
    { id: user.id, role: user.role, branchId: user.branchId },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );
  await prisma.auditLog.create({
    data: { userId: user.id, action: 'LOGIN', entity: 'User', entityId: String(user.id) },
  });
  res.json({
    token,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role, branchId: user.branchId },
  });
});
router.get('/me', authenticate, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: (req as any).user.id },
    select: { id: true, name: true, phone: true, email: true, role: true, branchId: true },
  });
  res.json(me);
});
router.post('/register', authenticate, authorize('OWNER', 'ADMIN'), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid data', errors: parsed.error.issues });
  const { password, ...data } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, name: true, phone: true, role: true, branchId: true },
    });
    await prisma.auditLog.create({
      data: { userId: (req as any).user.id, action: 'CREATE_USER', entity: 'User', entityId: String(user.id) },
    });
    res.status(201).json(user);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Phone or email already exists' });
    throw e;
  }
});
router.post('/change-password', authenticate, async (req, res) => {
  const p = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  const me = (req as any).user;
  const u = await prisma.user.findUnique({ where: { id: me.id } });
  if (!u || !(await bcrypt.compare(p.data.currentPassword, u.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(p.data.newPassword, 10) } });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'CHANGE_PASSWORD', entity: 'User', entityId: String(me.id) } });
  res.json({ ok: true });
});
export default router;

