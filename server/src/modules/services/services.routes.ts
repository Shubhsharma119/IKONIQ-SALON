import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN', 'MANAGER');
const serviceSchema = z.object({
  name: z.string().min(2),
  categoryId: z.number().int(),
  price: z.number().nonnegative(),
  durationMin: z.number().int().positive().default(30),
  isActive: z.boolean().optional(),
});
router.get('/categories', async (_req, res) => {
  res.json(await prisma.serviceCategory.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/categories', canManage, async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Category name required' });
  try {
    res.status(201).json(await prisma.serviceCategory.create({ data: p.data }));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Category already exists' });
    throw e;
  }
});
router.get('/', async (_req, res) => {
  res.json(
    await prisma.service.findMany({ include: { category: true }, orderBy: { name: 'asc' } })
  );
});
router.post('/', canManage, async (req, res) => {
  const p = serviceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  try {
    res.status(201).json(await prisma.service.create({ data: p.data }));
  } catch (e: any) {
    if (e.code === 'P2003') return res.status(400).json({ message: 'Category not found' });
    throw e;
  }
});
router.put('/:id', canManage, async (req, res) => {
  const p = serviceSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  try {
    res.json(await prisma.service.update({ where: { id: Number(req.params.id) }, data: p.data }));
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Service not found' });
    throw e;
  }
});
export default router;
