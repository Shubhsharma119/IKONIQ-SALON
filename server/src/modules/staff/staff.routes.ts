import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN');
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
  phone: z.string().min(10),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'ACCOUNTANT']).default('STAFF'),
  designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  baseSalary: z.number().nonnegative().default(0),
  commissionPercent: z.number().min(0).max(100).default(0),
});
const updateSchema = z.object({
  name: z.string().min(2).optional(),
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
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
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
    if (e.code === 'P2002') return res.status(409).json({ message: 'Phone or email already exists' });
    throw e;
  }
});
router.put('/:id', canManage, async (req, res) => {
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  const { name, isActive, designation, joiningDate, baseSalary, commissionPercent } = p.data;
  const profile = { designation, joiningDate, baseSalary, commissionPercent };
  try {
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { name, isActive, staffProfile: { upsert: { create: profile, update: profile } } },
      select: staffSelect,
    });
    res.json(user);
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Staff not found' });
    throw e;
  }
});
export default router;
