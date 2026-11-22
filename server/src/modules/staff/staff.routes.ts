import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN');
const phoneRule = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const roles = z.enum(['ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'ACCOUNTANT']);
const staffSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  isActive: true,
  branchId: true,
  staffProfile: true,
};
const createSchema = z.object({
  name: z.string().min(2),
  phone: phoneRule,
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: roles.default('STAFF'),
  designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  baseSalary: z.number().nonnegative().default(0),
  commissionPercent: z.number().min(0).max(100).default(0),
});
const updateSchema = z.object({
  phone: phoneRule.optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: roles.optional(),
  isActive: z.boolean().optional(),
  designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  baseSalary: z.number().nonnegative().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
});
router.get('/', async (_req, res) => {
  res.json(await prisma.user.findMany({ select: staffSelect, orderBy: { name: 'asc' } }));
});
router.post('/', canManage, async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const { password, name, phone, email, role, designation, joiningDate, baseSalary, commissionPercent } = p.data;
  try {
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        role,
        passwordHash: await bcrypt.hash(password, 10),
        branchId: (req as any).user.branchId,
        staffProfile: { create: { designation, joiningDate, baseSalary, commissionPercent } },
      },
      select: staffSelect,
    });
    await prisma.auditLog.create({
      data: { userId: (req as any).user.id, action: 'CREATE_STAFF', entity: 'User', entityId: String(user.id) },
    });
    res.status(201).json(user);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Mobile number or email already registered' });
    throw e;
  }
});
router.put('/:id', canManage, async (req, res) => {
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ message: 'Staff member not found' });
  if (target.role === 'OWNER' && me.role !== 'OWNER') {
    return res.status(403).json({ message: 'Only the owner can edit the owner account' });
  }
  if (target.role === 'OWNER' && p.data.role) {
    return res.status(400).json({ message: 'The owner role cannot be changed' });
  }
  if (id === me.id && p.data.isActive === false) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }
  const { name, phone, email, password, role, isActive, designation, joiningDate, baseSalary, commissionPercent } = p.data;
  const profile = { designation, joiningDate, baseSalary, commissionPercent };
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        isActive,
        ...(phone ? { phone } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
        staffProfile: { upsert: { create: profile, update: profile } },
      },
      select: staffSelect,
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'UPDATE_STAFF', entity: 'User', entityId: String(id) },
    });
    res.json(user);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Mobile number or email already registered' });
    throw e;
  }
});
export default router;




