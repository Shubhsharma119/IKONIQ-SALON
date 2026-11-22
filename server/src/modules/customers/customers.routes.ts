import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().email().optional(),
  gender: z.string().optional(),
  dob: z.coerce.date().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});
const canWrite = authorize('OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST');
async function phoneMsg(phone: unknown) {
  const c = phone ? await prisma.customer.findUnique({ where: { phone: String(phone) } }) : null;
  if (c && !c.isActive) {
    return 'This mobile number belongs to a deactivated customer (' + c.name + '). Open Customers and activate that customer instead.';
  }
  if (c) return 'This mobile number is already registered for ' + c.name + '.';
  return 'Phone already registered';
}
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const customers = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
      : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(req.query.take) || 100, 1000),
  });
  res.json(customers);
});
router.get('/:id', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) return res.status(404).json({ message: 'Customer not found' });
  res.json(c);
});
router.post('/', canWrite, async (req, res) => {
  const p = customerSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  try {
    const c = await prisma.customer.create({
      data: { ...p.data, branchId: (req as any).user.branchId },
    });
    res.status(201).json(c);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: await phoneMsg((req.body as any)?.phone) });
    throw e;
  }
});
router.put('/:id', canWrite, async (req, res) => {
  const p = customerSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data', errors: p.error.issues });
  try {
    const c = await prisma.customer.update({ where: { id: Number(req.params.id) }, data: p.data });
    res.json(c);
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Customer not found' });
    if (e.code === 'P2002') return res.status(409).json({ message: await phoneMsg((req.body as any)?.phone) });
    throw e;
  }
});
export default router;





