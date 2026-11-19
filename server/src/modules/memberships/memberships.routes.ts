import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN', 'MANAGER');
const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  validityDays: z.number().int().min(1).max(3650),
  discountPercent: z.number().min(0).max(100),
});
const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });
router.get('/', async (_req, res) => {
  res.json(await prisma.membershipPlan.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/', canManage, async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const plan = await prisma.membershipPlan.create({
    data: { ...p.data, branchId: (req as any).user.branchId },
  });
  await prisma.auditLog.create({
    data: { userId: (req as any).user.id, action: 'CREATE_MEMBERSHIP_PLAN', entity: 'MembershipPlan', entityId: String(plan.id) },
  });
  res.status(201).json(plan);
});
router.put('/:id', canManage, async (req, res) => {
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  try {
    res.json(await prisma.membershipPlan.update({ where: { id: Number(req.params.id) }, data: p.data }));
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Membership plan not found' });
    throw e;
  }
});
export default router;
