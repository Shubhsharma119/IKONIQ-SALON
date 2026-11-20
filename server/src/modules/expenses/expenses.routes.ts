import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.use(authorize('OWNER', 'ADMIN', 'MANAGER'));
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
const defaults = [
  'Rent', 'Salary', 'Electricity and water', 'Products and supplies',
  'Maintenance', 'Marketing', 'Refreshments', 'Other',
];
const baseSchema = z.object({
  categoryId: z.number().int(),
  amount: z.number().positive().max(10000000),
  mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK']),
  expenseDate: z.coerce.date().optional(),
  payee: z.string().optional(),
  reference: z.string().optional(),
  note: z.string().optional(),
});
function futureDate(d: Date) {
  return d.getTime() > Date.now() + 86400000;
}
router.get('/categories', async (_req, res) => {
  if ((await prisma.expenseCategory.count()) === 0) {
    await prisma.expenseCategory.createMany({ data: defaults.map((name) => ({ name })), skipDuplicates: true });
  }
  res.json(await prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
});
router.post('/categories', async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Category name required' });
  try {
    res.status(201).json(await prisma.expenseCategory.create({ data: { name: p.data.name.trim() } }));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Category already exists' });
    throw e;
  }
});
router.get('/', async (req, res) => {
  const where: any = {};
  if (req.query.from && req.query.to) {
    where.expenseDate = { gte: new Date(String(req.query.from)), lt: new Date(String(req.query.to)) };
  }
  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);
  const q = String(req.query.q || '').trim();
  if (q) {
    where.OR = [
      { payee: { contains: q, mode: 'insensitive' } },
      { note: { contains: q, mode: 'insensitive' } },
      { reference: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    take: 500,
    include: { category: true },
  });
  const uids: number[] = [];
  for (const r of rows) {
    if (r.createdById != null && !uids.includes(r.createdById)) uids.push(r.createdById);
    if (r.voidedById != null && !uids.includes(r.voidedById)) uids.push(r.voidedById);
  }
  const users = uids.length
    ? await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true } })
    : [];
  const nm = (id: number | null) => (id == null ? null : (users.find((u) => u.id === id) || { name: null }).name);
  const live = rows.filter((r) => !r.isVoid);
  const byCat: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  let total = 0;
  for (const r of live) {
    const a = Number(r.amount);
    total += a;
    byCat[r.category.name] = (byCat[r.category.name] || 0) + a;
    byMode[r.mode] = (byMode[r.mode] || 0) + a;
  }
  res.json({
    total: round2(total),
    count: live.length,
    byCategory: Object.keys(byCat).map((name) => ({ name, total: round2(byCat[name]) })).sort((a, b) => b.total - a.total),
    byMode: Object.keys(byMode).map((mode) => ({ mode, total: round2(byMode[mode]) })),
    rows: rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      category: { id: r.category.id, name: r.category.name },
      amount: Number(r.amount),
      mode: r.mode,
      expenseDate: r.expenseDate,
      payee: r.payee,
      reference: r.reference,
      note: r.note,
      isVoid: r.isVoid,
      voidReason: r.voidReason,
      voidedAt: r.voidedAt,
      createdAt: r.createdAt,
      createdByName: nm(r.createdById),
      voidedByName: nm(r.voidedById),
    })),
  });
});
router.post('/', async (req, res) => {
  const p = baseSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const me = (req as any).user;
  const date = p.data.expenseDate ?? new Date();
  if (futureDate(date)) return res.status(400).json({ message: 'Expense date cannot be in the future' });
  const cat = await prisma.expenseCategory.findUnique({ where: { id: p.data.categoryId } });
  if (!cat || !cat.isActive) return res.status(400).json({ message: 'Category not found' });
  const e = await prisma.expense.create({
    data: {
      categoryId: p.data.categoryId,
      amount: p.data.amount,
      mode: p.data.mode,
      expenseDate: date,
      payee: clean(p.data.payee),
      reference: clean(p.data.reference),
      note: clean(p.data.note),
      branchId: me.branchId,
      createdById: me.id,
    },
  });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'CREATE_EXPENSE', entity: 'Expense', entityId: String(e.id) } });
  res.status(201).json(e);
});
router.put('/:id', async (req, res) => {
  const p = baseSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const old = await prisma.expense.findUnique({ where: { id } });
  if (!old) return res.status(404).json({ message: 'Expense not found' });
  if (old.isVoid) return res.status(400).json({ message: 'A voided expense cannot be edited' });
  if (p.data.expenseDate && futureDate(p.data.expenseDate)) {
    return res.status(400).json({ message: 'Expense date cannot be in the future' });
  }
  if (p.data.categoryId) {
    const cat = await prisma.expenseCategory.findUnique({ where: { id: p.data.categoryId } });
    if (!cat || !cat.isActive) return res.status(400).json({ message: 'Category not found' });
  }
  const data: any = {};
  if (p.data.categoryId !== undefined) data.categoryId = p.data.categoryId;
  if (p.data.amount !== undefined) data.amount = p.data.amount;
  if (p.data.mode !== undefined) data.mode = p.data.mode;
  if (p.data.expenseDate !== undefined) data.expenseDate = p.data.expenseDate;
  if (p.data.payee !== undefined) data.payee = clean(p.data.payee);
  if (p.data.reference !== undefined) data.reference = clean(p.data.reference);
  if (p.data.note !== undefined) data.note = clean(p.data.note);
  const e = await prisma.expense.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'UPDATE_EXPENSE', entity: 'Expense', entityId: String(id) } });
  res.json(e);
});
router.post('/:id/void', async (req, res) => {
  const p = z.object({ reason: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter a reason (at least 3 letters)' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const old = await prisma.expense.findUnique({ where: { id } });
  if (!old) return res.status(404).json({ message: 'Expense not found' });
  if (old.isVoid) return res.status(400).json({ message: 'This expense is already voided' });
  const e = await prisma.expense.update({
    where: { id },
    data: { isVoid: true, voidReason: p.data.reason.trim(), voidedAt: new Date(), voidedById: me.id },
  });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'VOID_EXPENSE', entity: 'Expense', entityId: String(id) } });
  res.json(e);
});
export default router;
