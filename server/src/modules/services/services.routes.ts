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
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
async function findDuplicate(name: string, categoryId: number, exceptId?: number) {
  return prisma.service.findFirst({
    where: {
      categoryId,
      isDeleted: false,
      name: { equals: norm(name), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}
async function categoryDuplicate(name: string, exceptId?: number) {
  return prisma.serviceCategory.findFirst({
    where: {
      isDeleted: false,
      name: { equals: norm(name), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}
router.get('/categories', async (_req, res) => {
  res.json(await prisma.serviceCategory.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }));
});
router.post('/categories', canManage, async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Category name required' });
  if (await categoryDuplicate(p.data.name)) return res.status(409).json({ message: 'Category already exists' });
  try {
    res.status(201).json(await prisma.serviceCategory.create({ data: { name: norm(p.data.name) } }));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Category already exists' });
    throw e;
  }
});
router.put('/categories/:id', canManage, async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Category name required' });
  const id = Number(req.params.id);
  const cat = await prisma.serviceCategory.findUnique({ where: { id } });
  if (!cat || cat.isDeleted) return res.status(404).json({ message: 'Category not found' });
  if (await categoryDuplicate(p.data.name, id)) return res.status(409).json({ message: 'Category already exists' });
  try {
    res.json(await prisma.serviceCategory.update({ where: { id }, data: { name: norm(p.data.name) } }));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Category already exists' });
    throw e;
  }
});
router.delete('/categories/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  const cat = await prisma.serviceCategory.findUnique({ where: { id } });
  if (!cat || cat.isDeleted) return res.status(404).json({ message: 'Category not found' });
  const live = await prisma.service.count({ where: { categoryId: id, isDeleted: false } });
  if (live > 0) {
    return res.status(409).json({
      message: 'This category has ' + live + ' service(s). Move them to another category or delete them first.',
    });
  }
  const any = await prisma.service.count({ where: { categoryId: id } });
  let done = false;
  if (any === 0) {
    try {
      await prisma.serviceCategory.delete({ where: { id } });
      done = true;
    } catch (e: any) {
      if (e.code !== 'P2003') throw e;
    }
  }
  if (!done) {
    await prisma.serviceCategory.update({
      where: { id },
      data: { isDeleted: true, name: cat.name + ' [deleted ' + id + ']' },
    });
  }
  await prisma.auditLog.create({
    data: { userId: (req as any).user.id, action: 'DELETE_SERVICE_CATEGORY', entity: 'ServiceCategory', entityId: String(id) },
  });
  res.json({ ok: true });
});
router.get('/', async (_req, res) => {
  res.json(
    await prisma.service.findMany({
      where: { isDeleted: false },
      include: { category: true },
      orderBy: { name: 'asc' },
    })
  );
});
router.post('/', canManage, async (req, res) => {
  const p = serviceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  const cat = await prisma.serviceCategory.findUnique({ where: { id: p.data.categoryId } });
  if (!cat || cat.isDeleted) return res.status(400).json({ message: 'Category not found' });
  if (await findDuplicate(p.data.name, p.data.categoryId)) {
    return res.status(409).json({ message: 'This service already exists in this category' });
  }
  try {
    res.status(201).json(await prisma.service.create({ data: { ...p.data, name: norm(p.data.name) } }));
  } catch (e: any) {
    if (e.code === 'P2003') return res.status(400).json({ message: 'Category not found' });
    throw e;
  }
});
router.put('/:id', canManage, async (req, res) => {
  const p = serviceSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  const id = Number(req.params.id);
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old || old.isDeleted) return res.status(404).json({ message: 'Service not found' });
  if (p.data.categoryId !== undefined) {
    const cat = await prisma.serviceCategory.findUnique({ where: { id: p.data.categoryId } });
    if (!cat || cat.isDeleted) return res.status(400).json({ message: 'Category not found' });
  }
  if (p.data.name !== undefined || p.data.categoryId !== undefined) {
    const name = p.data.name !== undefined ? p.data.name : old.name;
    const categoryId = p.data.categoryId !== undefined ? p.data.categoryId : old.categoryId;
    if (await findDuplicate(name, categoryId, id)) {
      return res.status(409).json({ message: 'This service already exists in this category' });
    }
  }
  const data: any = { ...p.data };
  if (p.data.name !== undefined) data.name = norm(p.data.name);
  try {
    res.json(await prisma.service.update({ where: { id }, data }));
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Service not found' });
    throw e;
  }
});
router.delete('/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  const s = await prisma.service.findUnique({ where: { id } });
  if (!s || s.isDeleted) return res.status(404).json({ message: 'Service not found' });
  await prisma.service.update({
    where: { id },
    data: { isDeleted: true, isActive: false, deletedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: (req as any).user.id, action: 'DELETE_SERVICE', entity: 'Service', entityId: String(id) },
  });
  res.json({ ok: true });
});
export default router;
