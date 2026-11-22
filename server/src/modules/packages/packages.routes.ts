import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN', 'MANAGER');
const include = {
  services: {
    include: { service: { select: { id: true, name: true, price: true, durationMin: true } } },
    orderBy: { id: 'asc' as const },
  },
};
const createSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(['COMBO', 'SESSION']),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  validityDays: z.number().int().min(1).max(3650),
  sessionCount: z.number().int().min(1).max(500).optional(),
  serviceIds: z.array(z.number().int()),
});
const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });
async function validServices(ids: number[]) {
  const unique = Array.from(new Set(ids));
  const count = await prisma.service.count({ where: { id: { in: unique } } });
  return count === unique.length ? unique : null;
}
router.get('/', async (_req, res) => {
  res.json(
    await prisma.package.findMany({
      where: { kind: { in: ['COMBO', 'SESSION'] as ('COMBO' | 'SESSION')[] } },
      orderBy: { name: 'asc' },
      include,
    })
  );
});
router.post('/', canManage, async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const { serviceIds, sessionCount, ...data } = p.data;
  if (serviceIds.length === 0) return res.status(400).json({ message: 'Select at least one service' });
  if (data.kind === 'SESSION' && !sessionCount) {
    return res.status(400).json({ message: 'Enter the number of sessions' });
  }
  const unique = await validServices(serviceIds);
  if (!unique) return res.status(400).json({ message: 'One or more services are invalid' });
  const pkg = await prisma.package.create({
    data: {
      ...data,
      sessionCount: data.kind === 'SESSION' ? sessionCount : null,
      branchId: (req as any).user.branchId,
      services: { create: unique.map((serviceId) => ({ serviceId })) },
    },
    include,
  });
  await prisma.auditLog.create({
    data: { userId: (req as any).user.id, action: 'CREATE_PACKAGE', entity: 'Package', entityId: String(pkg.id) },
  });
  res.status(201).json(pkg);
});
router.put('/:id', canManage, async (req, res) => {
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const existing = await prisma.package.findUnique({ where: { id }, include });
  if (!existing) return res.status(404).json({ message: 'Package not found' });
  const { serviceIds, sessionCount, ...data } = p.data;
  const finalKind = data.kind ?? existing.kind;
  const finalCount = serviceIds ? new Set(serviceIds).size : existing.services.length;
  if (finalCount === 0) return res.status(400).json({ message: 'Select at least one service' });
  const finalSessions = sessionCount ?? existing.sessionCount;
  if (finalKind === 'SESSION' && !finalSessions) {
    return res.status(400).json({ message: 'Enter the number of sessions' });
  }
  let servicesData: any;
  if (serviceIds) {
    const unique = await validServices(serviceIds);
    if (!unique) return res.status(400).json({ message: 'One or more services are invalid' });
    servicesData = { deleteMany: {}, create: unique.map((serviceId) => ({ serviceId })) };
  }
  const pkg = await prisma.package.update({
    where: { id },
    data: {
      ...data,
      sessionCount: finalKind === 'SESSION' ? finalSessions : null,
      ...(servicesData ? { services: servicesData } : {}),
    },
    include,
  });
  res.json(pkg);
});
export default router;
