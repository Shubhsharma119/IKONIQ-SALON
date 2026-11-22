import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { shapePurchase, userMap, purchaseUserIds } from './shape';
const router = Router();
router.use(authenticate);
router.use(authorize('OWNER', 'ADMIN', 'MANAGER'));
class PurError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
function fyKey(d: Date) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return start + '-' + String((start + 1) % 100).padStart(2, '0');
}
function fail(res: any, e: any) {
  if (e instanceof PurError) return res.status(e.code).json({ message: e.message });
  throw e;
}
const include = {
  supplier: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { id: 'asc' as const } },
};
const itemSchema = z.object({
  productId: z.number().int(),
  qty: z.number().positive().max(1000000),
  rate: z.number().nonnegative().max(10000000),
  gstRate: z.number().min(0).max(28).optional(),
});
const payRowSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK']),
  amount: z.number().positive(),
  reference: z.string().optional(),
});
const createSchema = z.object({
  supplierId: z.number().int(),
  billNo: z.string().optional(),
  billDate: z.coerce.date().optional(),
  items: z.array(itemSchema).min(1).max(100),
  payments: z.array(payRowSchema).optional(),
  note: z.string().optional(),
  updateCost: z.boolean().optional(),
});
router.get('/', async (req, res) => {
  const where: any = {};
  if (req.query.from && req.query.to) {
    where.billDate = { gte: new Date(String(req.query.from)), lt: new Date(String(req.query.to)) };
  }
  if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
  const q = String(req.query.q || '').trim();
  if (q) {
    where.OR = [
      { purchaseNo: { contains: q, mode: 'insensitive' } },
      { billNo: { contains: q, mode: 'insensitive' } },
      { supplier: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const rows = await prisma.purchase.findMany({
    where,
    orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
    take: 300,
    include,
  });
  const ids: (number | null | undefined)[] = [];
  for (const p of rows) ids.push(...purchaseUserIds(p));
  const names = await userMap(ids);
  res.json(rows.map((p) => shapePurchase(p, names)));
});
router.get('/:id', async (req, res) => {
  const p = await prisma.purchase.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!p) return res.status(404).json({ message: 'Purchase not found' });
  const names = await userMap(purchaseUserIds(p));
  res.json(shapePurchase(p, names));
});
router.post('/', async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d = p.data;
  const me = (req as any).user;
  const payments = d.payments ?? [];
  const billDate = d.billDate ?? new Date();
  if (billDate.getTime() > Date.now() + 86400000) {
    return res.status(400).json({ message: 'Bill date cannot be in the future' });
  }
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const sup = await tx.supplier.findUnique({ where: { id: d.supplierId } });
        if (!sup || !sup.isActive) throw new PurError('Supplier not found or inactive');
        const billNo = clean(d.billNo);
        if (billNo) {
          const dup = await tx.purchase.findFirst({
            where: { supplierId: d.supplierId, isVoid: false, billNo: { equals: billNo, mode: 'insensitive' } },
          });
          if (dup) throw new PurError('Bill no ' + billNo + ' is already entered for this supplier (' + dup.purchaseNo + ')', 409);
        }
        const lines: {
          productId: number; name: string; qty: number; rate: number; gstRate: number; gstAmount: number; amount: number;
        }[] = [];
        for (const it of d.items) {
          const prod = await tx.product.findUnique({ where: { id: it.productId } });
          if (!prod || !prod.isActive) throw new PurError('A selected product is not available');
          if ((prod.unit === 'piece' || prod.unit === 'kit') && !Number.isInteger(it.qty)) {
            throw new PurError('Quantity of ' + prod.name + ' must be a whole number');
          }
          const gstRate = it.gstRate ?? 0;
          const amount = round2(it.qty * it.rate);
          const gstAmount = round2((amount * gstRate) / 100);
          lines.push({ productId: prod.id, name: prod.name, qty: it.qty, rate: it.rate, gstRate, gstAmount, amount });
        }
        const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
        const gstAmount = round2(lines.reduce((n, l) => n + l.gstAmount, 0));
        const total = round2(subtotal + gstAmount);
        const paid = round2(payments.reduce((n, x) => n + x.amount, 0));
        if (paid > total + 0.001) throw new PurError('Payment is more than the purchase total');
        const key = 'PUR-' + fyKey(new Date());
        const c = await tx.invoiceCounter.upsert({
          where: { key },
          update: { lastNo: { increment: 1 } },
          create: { key, lastNo: 1 },
        });
        const purchaseNo = 'PUR/' + key.slice(4) + '/' + String(c.lastNo).padStart(4, '0');
        const purchase = await tx.purchase.create({
          data: {
            purchaseNo,
            supplierId: d.supplierId,
            billNo,
            billDate,
            subtotal,
            gstAmount,
            total,
            paidAmount: paid,
            note: clean(d.note),
            branchId: me.branchId,
            createdById: me.id,
            items: { create: lines },
            payments: {
              create: payments.map((x) => ({
                supplierId: d.supplierId,
                mode: x.mode,
                amount: x.amount,
                reference: clean(x.reference),
                createdById: me.id,
              })),
            },
          },
          include,
        });
        for (const l of lines) {
          await tx.product.update({ where: { id: l.productId }, data: { stockQty: { increment: l.qty } } });
          const after = await tx.product.findUnique({ where: { id: l.productId } });
          await tx.stockMovement.create({
            data: {
              productId: l.productId,
              type: 'IN',
              qty: l.qty,
              balanceAfter: after!.stockQty,
              note: 'Purchase ' + purchaseNo + ' from ' + sup.name,
              createdById: me.id,
            },
          });
          if (d.updateCost) {
            await tx.product.update({ where: { id: l.productId }, data: { costPrice: l.rate } });
          }
        }
        return purchase;
      },
      { maxWait: 5000, timeout: 30000 }
    );
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'CREATE_PURCHASE', entity: 'Purchase', entityId: String(created.id) },
    });
    const names = await userMap(purchaseUserIds(created));
    res.status(201).json(shapePurchase(created, names));
  } catch (e) {
    return fail(res, e);
  }
});
router.post('/:id/void', async (req, res) => {
  const p = z.object({ reason: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter a reason (at least 3 letters)' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  try {
    await prisma.$transaction(
      async (tx) => {
        const pu = await tx.purchase.findUnique({ where: { id }, include: { items: true } });
        if (!pu) throw new PurError('Purchase not found', 404);
        if (pu.isVoid) throw new PurError('This purchase is already voided');
        for (const it of pu.items) {
          const qty = Number(it.qty);
          const r = await tx.product.updateMany({
            where: { id: it.productId, stockQty: { gte: qty } },
            data: { stockQty: { decrement: qty } },
          });
          if (r.count === 0) {
            const prod = await tx.product.findUnique({ where: { id: it.productId } });
            throw new PurError(
              'Cannot void: only ' + Number(prod ? prod.stockQty : 0) + ' of ' + it.name +
                ' is in stock now, but ' + qty + ' came with this purchase. The rest was already used or sold.'
            );
          }
          const after = await tx.product.findUnique({ where: { id: it.productId } });
          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              type: 'OUT',
              qty: -qty,
              balanceAfter: after!.stockQty,
              note: 'Void of purchase ' + pu.purchaseNo,
              createdById: me.id,
            },
          });
        }
        await tx.supplierPayment.updateMany({
          where: { purchaseId: id, isVoid: false },
          data: { isVoid: true, voidReason: 'Purchase voided', voidedAt: new Date(), voidedById: me.id },
        });
        await tx.purchase.update({
          where: { id },
          data: { isVoid: true, voidReason: p.data.reason.trim(), voidedAt: new Date(), voidedById: me.id },
        });
      },
      { maxWait: 5000, timeout: 30000 }
    );
    await prisma.auditLog.create({ data: { userId: me.id, action: 'VOID_PURCHASE', entity: 'Purchase', entityId: String(id) } });
    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
export default router;
