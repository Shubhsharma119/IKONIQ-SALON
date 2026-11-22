import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { shapePayment, shapePurchase, userMap, purchaseUserIds } from './shape';
const router = Router();
router.use(authenticate);
router.use(authorize('OWNER', 'ADMIN', 'MANAGER'));
class SupError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
function fail(res: any, e: any) {
  if (e instanceof SupError) return res.status(e.code).json({ message: e.message });
  throw e;
}
const supplierSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});
function toData(d: z.infer<typeof supplierSchema>) {
  const data: any = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.contactPerson !== undefined) data.contactPerson = clean(d.contactPerson);
  if (d.phone !== undefined) data.phone = clean(d.phone);
  if (d.email !== undefined) data.email = clean(d.email);
  if (d.gstin !== undefined) data.gstin = clean(d.gstin);
  if (d.address !== undefined) data.address = clean(d.address);
  if (d.notes !== undefined) data.notes = clean(d.notes);
  if (d.isActive !== undefined) data.isActive = d.isActive;
  return data;
}
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where: any = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { contactPerson: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      }
    : {};
  const [rows, sums] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    prisma.purchase.groupBy({
      by: ['supplierId'],
      where: { isVoid: false },
      _sum: { total: true, paidAmount: true },
      _count: { _all: true },
    }),
  ]);
  res.json(
    rows.map((s) => {
      const g = sums.find((x) => x.supplierId === s.id);
      const total = Number(g?._sum.total ?? 0);
      const paid = Number(g?._sum.paidAmount ?? 0);
      return {
        id: s.id,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        gstin: s.gstin,
        address: s.address,
        notes: s.notes,
        isActive: s.isActive,
        purchaseCount: g?._count._all ?? 0,
        totalPurchased: round2(total),
        totalPaid: round2(paid),
        due: round2(total - paid),
      };
    })
  );
});
router.post('/', async (req, res) => {
  const p = supplierSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const me = (req as any).user;
  const dup = await prisma.supplier.findFirst({ where: { name: { equals: p.data.name.trim(), mode: 'insensitive' } } });
  if (dup) return res.status(409).json({ message: 'A supplier with this name already exists' });
  const s = await prisma.supplier.create({ data: { ...toData(p.data), branchId: me.branchId } });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'CREATE_SUPPLIER', entity: 'Supplier', entityId: String(s.id) } });
  res.status(201).json(s);
});
router.put('/:id', async (req, res) => {
  const p = supplierSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const old = await prisma.supplier.findUnique({ where: { id } });
  if (!old) return res.status(404).json({ message: 'Supplier not found' });
  if (p.data.name && p.data.name.trim().toLowerCase() !== old.name.toLowerCase()) {
    const dup = await prisma.supplier.findFirst({ where: { name: { equals: p.data.name.trim(), mode: 'insensitive' }, id: { not: id } } });
    if (dup) return res.status(409).json({ message: 'A supplier with this name already exists' });
  }
  const s = await prisma.supplier.update({ where: { id }, data: toData(p.data as any) });
  await prisma.auditLog.create({ data: { userId: me.id, action: 'UPDATE_SUPPLIER', entity: 'Supplier', entityId: String(id) } });
  res.json(s);
});
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) return res.status(404).json({ message: 'Supplier not found' });
  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: { supplierId: id },
      orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
      include: { items: { orderBy: { id: 'asc' } }, payments: { orderBy: { id: 'asc' } } },
    }),
    prisma.supplierPayment.findMany({ where: { supplierId: id }, orderBy: { id: 'desc' } }),
  ]);
  const ids: (number | null | undefined)[] = [];
  for (const p of purchases) ids.push(...purchaseUserIds(p));
  for (const x of payments) ids.push(x.createdById, x.voidedById);
  const names = await userMap(ids);
  const live = purchases.filter((p) => !p.isVoid);
  const totalPurchased = round2(live.reduce((n, p) => n + Number(p.total), 0));
  const totalPaid = round2(live.reduce((n, p) => n + Number(p.paidAmount), 0));
  res.json({
    supplier: s,
    summary: { purchaseCount: live.length, totalPurchased, totalPaid, due: round2(totalPurchased - totalPaid) },
    purchases: purchases.map((p) => shapePurchase(p, names)),
    payments: payments.map((x) => {
      const pu = purchases.find((p) => p.id === x.purchaseId);
      return shapePayment(x, names, pu ? pu.purchaseNo : null);
    }),
  });
});
const paySchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK']),
  amount: z.number().positive().max(100000000),
  reference: z.string().optional(),
  note: z.string().optional(),
  purchaseId: z.number().int().optional(),
});
router.post('/:id/payments', async (req, res) => {
  const p = paySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  try {
    const allocations = await prisma.$transaction(
      async (tx) => {
        const sup = await tx.supplier.findUnique({ where: { id } });
        if (!sup) throw new SupError('Supplier not found', 404);
        let open = await tx.purchase.findMany({
          where: { supplierId: id, isVoid: false },
          orderBy: [{ billDate: 'asc' }, { id: 'asc' }],
        });
        open = open.filter((x) => round2(Number(x.total) - Number(x.paidAmount)) > 0.004);
        if (p.data.purchaseId) {
          open = open.filter((x) => x.id === p.data.purchaseId);
          if (open.length === 0) throw new SupError('This bill has nothing due');
        }
        const totalDue = round2(open.reduce((n, x) => n + (Number(x.total) - Number(x.paidAmount)), 0));
        if (totalDue <= 0.004) throw new SupError('Nothing is due to this supplier');
        if (p.data.amount > totalDue + 0.001) throw new SupError('Amount is more than the due balance (' + totalDue + ')');
        let left = p.data.amount;
        const made: { purchaseNo: string; amount: number }[] = [];
        for (const pu of open) {
          if (left <= 0.004) break;
          const due = round2(Number(pu.total) - Number(pu.paidAmount));
          const part = round2(Math.min(due, left));
          left = round2(left - part);
          await tx.supplierPayment.create({
            data: {
              supplierId: id,
              purchaseId: pu.id,
              amount: part,
              mode: p.data.mode,
              reference: clean(p.data.reference),
              note: clean(p.data.note),
              createdById: me.id,
            },
          });
          await tx.purchase.update({ where: { id: pu.id }, data: { paidAmount: { increment: part } } });
          made.push({ purchaseNo: pu.purchaseNo, amount: part });
        }
        return made;
      },
      { maxWait: 5000, timeout: 20000 }
    );
    await prisma.auditLog.create({ data: { userId: me.id, action: 'SUPPLIER_PAYMENT', entity: 'Supplier', entityId: String(id) } });
    res.status(201).json({ allocations });
  } catch (e) {
    return fail(res, e);
  }
});
router.post('/payments/:paymentId/void', async (req, res) => {
  const p = z.object({ reason: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter a reason (at least 3 letters)' });
  const pid = Number(req.params.paymentId);
  const me = (req as any).user;
  try {
    await prisma.$transaction(async (tx) => {
      const pay = await tx.supplierPayment.findUnique({ where: { id: pid } });
      if (!pay) throw new SupError('Payment not found', 404);
      if (pay.isVoid) throw new SupError('This payment is already voided');
      await tx.supplierPayment.update({
        where: { id: pid },
        data: { isVoid: true, voidReason: p.data.reason.trim(), voidedAt: new Date(), voidedById: me.id },
      });
      if (pay.purchaseId) {
        const pu = await tx.purchase.findUnique({ where: { id: pay.purchaseId } });
        if (pu) {
          const next = Math.max(0, round2(Number(pu.paidAmount) - Number(pay.amount)));
          await tx.purchase.update({ where: { id: pu.id }, data: { paidAmount: next } });
        }
      }
    });
    await prisma.auditLog.create({ data: { userId: me.id, action: 'VOID_SUPPLIER_PAYMENT', entity: 'SupplierPayment', entityId: String(pid) } });
    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
export default router;
