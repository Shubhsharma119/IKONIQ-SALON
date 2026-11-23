import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { getSettings } from '../settings/settings.service';
const router = Router();
router.use(authenticate);
const canBill = authorize('OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST');
class BillError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
function fyKey(d: Date) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return start + '-' + String((start + 1) % 100).padStart(2, '0');
}
function fail(res: any, e: any) {
  if (e instanceof BillError) return res.status(e.code).json({ message: e.message });
  if (e && e.code === 'P2002') return res.status(409).json({ message: 'This appointment is already billed' });
  throw e;
}
const include = {
  customer: { select: { id: true, name: true, phone: true } },
  items: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
};
const staffOpt = z.number().int().nullable().optional();
const itemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SERVICE'), serviceId: z.number().int(), qty: z.number().int().min(1).max(99).optional(), staffId: staffOpt }),
  z.object({ type: z.literal('PRODUCT'), productId: z.number().int(), qty: z.number().positive().max(100000), staffId: staffOpt }),
  z.object({ type: z.literal('PACKAGE'), packageId: z.number().int(), staffId: staffOpt }),
  z.object({ type: z.literal('MEMBERSHIP'), planId: z.number().int() }),
  z.object({ type: z.literal('SESSION_USE'), customerPackageId: z.number().int(), serviceId: z.number().int(), staffId: staffOpt }),
  z.object({ type: z.literal('CUSTOM'), name: z.string().min(1), price: z.number().nonnegative(), qty: z.number().int().min(1).max(99).optional(), staffId: staffOpt }),
]);
const paymentSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK', 'WALLET']),
  amount: z.number().positive(),
  reference: z.string().optional(),
});
const billSchema = z.object({
  customerId: z.number().int().nullable().optional(),
  guestName: z.string().optional(),
  appointmentId: z.number().int().optional(),
  items: z.array(itemSchema).min(1),
  isGst: z.boolean().optional(),
  gstRate: z.number().min(0).max(28).optional(),
  discountType: z.enum(['FLAT', 'PERCENT']).nullable().optional(),
  discountValue: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
const createSchema = billSchema.extend({ payments: z.array(paymentSchema).optional() });
type BillInput = z.infer<typeof billSchema>;
type Line = {
  itemType: 'SERVICE' | 'PRODUCT' | 'PACKAGE' | 'MEMBERSHIP' | 'SESSION_USE' | 'CUSTOM';
  serviceId: number | null;
  productId: number | null;
  packageId: number | null;
  membershipPlanId: number | null;
  customerPackageId: number | null;
  staffId: number | null;
  name: string;
  qty: number;
  price: number;
  amount: number;
};
const blank = {
  serviceId: null, productId: null, packageId: null,
  membershipPlanId: null, customerPackageId: null, staffId: null,
};
async function computeBill(db: any, d: BillInput) {
  const now = new Date();
  const customerId = d.customerId ?? null;
  let customer: any = null;
  if (customerId) {
    customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.isActive) throw new BillError('Customer not found or inactive');
  }
  if (d.appointmentId && !customerId) throw new BillError('Select a customer for an appointment bill');
  const needsCustomer = d.items.some((i) => ['PACKAGE', 'MEMBERSHIP', 'SESSION_USE'].includes(i.type));
  if (needsCustomer && !customerId) {
    throw new BillError('Select a customer. Packages, memberships and sessions cannot be billed to a guest.');
  }
  const lines: Line[] = [];
  for (const it of d.items) {
    const staffId = (it as any).staffId ?? null;
    if (it.type === 'SERVICE') {
      const s = await db.service.findUnique({ where: { id: it.serviceId } });
      if (!s || !s.isActive) throw new BillError('A selected service is not available');
      const qty = it.qty ?? 1;
      const price = Number(s.price);
      lines.push({ ...blank, itemType: 'SERVICE', serviceId: s.id, staffId, name: s.name, qty, price, amount: round2(price * qty) });
    } else if (it.type === 'PRODUCT') {
      const p = await db.product.findUnique({ where: { id: it.productId } });
      if (!p || !p.isActive) throw new BillError('A selected product is not available');
      if (p.usage === 'SALON_USE') throw new BillError(p.name + ' is for salon use only and cannot be sold');
      if ((p.unit === 'piece' || p.unit === 'kit') && !Number.isInteger(it.qty)) {
        throw new BillError('Quantity of ' + p.name + ' must be a whole number');
      }
      const price = Number(p.salePrice);
      lines.push({ ...blank, itemType: 'PRODUCT', productId: p.id, staffId, name: p.name, qty: it.qty, price, amount: round2(price * it.qty) });
    } else if (it.type === 'PACKAGE') {
      const pk = await db.package.findUnique({ where: { id: it.packageId } });
      if (!pk || !pk.isActive || pk.kind === 'MEMBERSHIP') throw new BillError('A selected package is not available');
      const price = Number(pk.price);
      lines.push({ ...blank, itemType: 'PACKAGE', packageId: pk.id, staffId, name: pk.name, qty: 1, price, amount: round2(price) });
    } else if (it.type === 'MEMBERSHIP') {
      const plan = await db.membershipPlan.findUnique({ where: { id: it.planId } });
      if (!plan || !plan.isActive) throw new BillError('A selected membership plan is not available');
      const price = Number(plan.price);
      lines.push({ ...blank, itemType: 'MEMBERSHIP', membershipPlanId: plan.id, name: plan.name + ' (membership)', qty: 1, price, amount: round2(price) });
    } else if (it.type === 'SESSION_USE') {
      const cp = await db.customerPackage.findUnique({ where: { id: it.customerPackageId } });
      if (!cp || cp.customerId !== customerId) throw new BillError('Package not found for this customer');
      if (cp.expiresAt < now) throw new BillError(cp.name + ' has expired');
      if (!cp.sessionsTotal) throw new BillError(cp.name + ' is not a session package');
      const already = lines.filter((l) => l.itemType === 'SESSION_USE' && l.customerPackageId === cp.id).length;
      if (cp.sessionsUsed + already >= cp.sessionsTotal) throw new BillError('No sessions left in ' + cp.name);
      const allowed = await db.packageService.findFirst({
        where: { packageId: cp.packageId, serviceId: it.serviceId },
        include: { service: true },
      });
      if (!allowed) throw new BillError('This service is not included in ' + cp.name);
      lines.push({
        ...blank, itemType: 'SESSION_USE', customerPackageId: cp.id, serviceId: it.serviceId, staffId,
        name: allowed.service.name + ' (session - ' + cp.name + ')', qty: 1, price: 0, amount: 0,
      });
    } else {
      const qty = it.qty ?? 1;
      lines.push({ ...blank, itemType: 'CUSTOM', staffId, name: it.name.trim(), qty, price: it.price, amount: round2(it.price * qty) });
    }
  }
  const need: Record<number, number> = {};
  for (const l of lines) if (l.itemType === 'PRODUCT') need[l.productId!] = (need[l.productId!] || 0) + l.qty;
  for (const key of Object.keys(need)) {
    const p = await db.product.findUnique({ where: { id: Number(key) } });
    if (Number(p.stockQty) < need[Number(key)]) {
      throw new BillError('Not enough stock for ' + p.name + '. Available: ' + Number(p.stockQty));
    }
  }
  let membershipDiscount = 0;
  let membership: { name: string; discountPercent: number } | null = null;
  if (customerId) {
    const active = await db.customerMembership.findMany({
      where: { customerId, startsAt: { lte: now }, expiresAt: { gte: now } },
    });
    active.sort((a: any, b: any) => Number(b.discountPercent) - Number(a.discountPercent));
    const best = active[0];
    if (best && Number(best.discountPercent) > 0) {
      membership = { name: best.name, discountPercent: Number(best.discountPercent) };
      const svcTotal = lines.filter((l) => l.itemType === 'SERVICE').reduce((n, l) => n + l.amount, 0);
      membershipDiscount = round2((svcTotal * Number(best.discountPercent)) / 100);
    }
  }
  const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
  const afterMembership = round2(subtotal - membershipDiscount);
  let manual = 0;
  const dv = d.discountValue ?? 0;
  if (d.discountType === 'FLAT') manual = dv;
  if (d.discountType === 'PERCENT') manual = (afterMembership * Math.min(dv, 100)) / 100;
  const discountAmount = round2(Math.min(manual, afterMembership));
  const taxable = round2(afterMembership - discountAmount);
  const gstRate = d.isGst ? d.gstRate ?? 18 : 0;
  const gstAmount = round2((taxable * gstRate) / 100);
  const total = round2(taxable + gstAmount);
  return { customer, lines, subtotal, membershipDiscount, membership, discountAmount, taxable, gstRate, gstAmount, total };
}
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where: any = {};
  if (q) {
    where.OR = [
      { invoiceNo: { contains: q, mode: 'insensitive' } },
      { guestName: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q } } },
    ];
  }
  if (req.query.from && req.query.to) {
    where.createdAt = { gte: new Date(String(req.query.from)), lt: new Date(String(req.query.to)) };
  }
  res.json(await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.take) || 200, 2000), include }));
});
router.get('/from-appointment/:id', async (req, res) => {
  const a = await prisma.appointment.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      services: { include: { service: { select: { id: true, name: true } } } },
    },
  });
  if (!a) return res.status(404).json({ message: 'Appointment not found' });
  const billed = await prisma.invoice.findUnique({ where: { appointmentId: a.id } });
  res.json({
    appointmentId: a.id,
    status: a.status,
    customer: a.customer,
    billedInvoiceNo: billed ? billed.invoiceNo : null,
    items: a.services.map((s) => ({ type: 'SERVICE', serviceId: s.serviceId, qty: 1, staffId: a.staffId })),
  });
});
router.get('/customer-info/:id', async (req, res) => {
  const id = Number(req.params.id);
  const now = new Date();
  const memberships = await prisma.customerMembership.findMany({
    where: { customerId: id, startsAt: { lte: now }, expiresAt: { gte: now } },
    orderBy: { discountPercent: 'desc' },
  });
  const best = memberships[0];
  const pkgs = await prisma.customerPackage.findMany({
    where: { customerId: id, expiresAt: { gte: now }, sessionsTotal: { not: null } },
    orderBy: { expiresAt: 'asc' },
  });
  const withLeft = pkgs.filter((p) => p.sessionsUsed < (p.sessionsTotal ?? 0));
  const ids = Array.from(new Set(withLeft.map((p) => p.packageId)));
  const ps = await prisma.packageService.findMany({
    where: { packageId: { in: ids } },
    include: { service: { select: { id: true, name: true } } },
  });
  res.json({
    walletBalance: Number((await prisma.customer.findUnique({ where: { id }, select: { walletBalance: true } }))?.walletBalance ?? 0),
    membership: best
      ? { name: best.name, discountPercent: Number(best.discountPercent), expiresAt: best.expiresAt }
      : null,
    sessionPackages: withLeft.map((p) => ({
      id: p.id,
      name: p.name,
      sessionsTotal: p.sessionsTotal,
      sessionsUsed: p.sessionsUsed,
      expiresAt: p.expiresAt,
      services: ps.filter((x) => x.packageId === p.packageId).map((x) => x.service),
    })),
  });
});
router.get('/:id', async (req, res) => {
  const inv = await prisma.invoice.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  res.json(inv);
});
router.post('/preview', canBill, async (req, res) => {
  const p = billSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  try {
    const b = await computeBill(prisma, p.data);
    res.json({
      lines: b.lines,
      subtotal: b.subtotal,
      membershipDiscount: b.membershipDiscount,
      membership: b.membership,
      discountAmount: b.discountAmount,
      taxableAmount: b.taxable,
      gstRate: b.gstRate,
      gstAmount: b.gstAmount,
      total: b.total,
    });
  } catch (e) {
    return fail(res, e);
  }
});
router.post('/', canBill, async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d = p.data;
  const me = (req as any).user;
  const payments = d.payments ?? [];
  const needStaff = d.items.filter((i: any) => i.type !== 'MEMBERSHIP');
  if (needStaff.some((i: any) => !i.staffId)) {
    return res.status(400).json({ message: 'Select who served each item (Served by).' });
  }
  const staffIds = Array.from(new Set(needStaff.map((i: any) => Number(i.staffId))));
  if (staffIds.length > 0) {
    const okCount = await prisma.user.count({ where: { id: { in: staffIds }, isActive: true } });
    if (okCount !== staffIds.length) {
      return res.status(400).json({ message: 'A selected staff member is not available.' });
    }
  }
  try {
    const inv = await prisma.$transaction(
      async (tx) => {
        if (d.appointmentId) {
          const a = await tx.appointment.findUnique({ where: { id: d.appointmentId } });
          if (!a || a.customerId !== d.customerId) throw new BillError('Appointment not found');
          if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') throw new BillError('This appointment cannot be billed');
          const already = await tx.invoice.findUnique({ where: { appointmentId: d.appointmentId } });
          if (already) throw new BillError('This appointment is already billed', 409);
        }
        const b = await computeBill(tx, d);
        const now = new Date();
        const paid = round2(payments.reduce((n, x) => n + x.amount, 0));
        if (paid > b.total + 0.001) throw new BillError('Payment is more than the bill total');
        if (!b.customer && paid < b.total - 0.001) throw new BillError('Guest bills must be paid in full');
        const walletPay = round2(payments.filter((x) => x.mode === 'WALLET').reduce((s, x) => s + x.amount, 0));
        if (walletPay > 0 && !b.customer) throw new BillError('E-wallet payment needs a customer');
        let walletAfter: any = null;
        if (walletPay > 0) {
          const r = await tx.customer.updateMany({
            where: { id: b.customer.id, walletBalance: { gte: walletPay } },
            data: { walletBalance: { decrement: walletPay } },
          });
          if (r.count === 0) throw new BillError('Not enough E-wallet balance');
          const w = await tx.customer.findUnique({ where: { id: b.customer.id } });
          walletAfter = w!.walletBalance;
        }
        const status: 'PAID' | 'PARTIAL' | 'UNPAID' = paid >= b.total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
        const key = fyKey(now);
        const c = await tx.invoiceCounter.upsert({
          where: { key },
          update: { lastNo: { increment: 1 } },
          create: { key, lastNo: 1 },
        });
        const cfg = await getSettings(tx);
        const invoiceNo = cfg.invoice.prefix + '/' + key + '/' + String(c.lastNo).padStart(4, '0');
        const invoice = await tx.invoice.create({
          data: {
            invoiceNo,
            customerId: b.customer ? b.customer.id : null,
            guestName: b.customer ? null : (d.guestName || '').trim() || null,
            appointmentId: d.appointmentId ?? null,
            isGst: !!d.isGst,
            gstRate: b.gstRate,
            subtotal: b.subtotal,
            membershipDiscount: b.membershipDiscount,
            discountType: d.discountType ?? null,
            discountValue: d.discountValue ?? 0,
            discountAmount: b.discountAmount,
            taxableAmount: b.taxable,
            gstAmount: b.gstAmount,
            total: b.total,
            paidAmount: paid,
            status,
            notes: d.notes,
            branchId: me.branchId,
            createdById: me.id,
            items: { create: b.lines },
            payments: {
              create: payments.map((x) => ({ mode: x.mode, amount: x.amount, reference: x.reference, createdById: me.id, balanceAfter: x.mode === 'WALLET' ? walletAfter : null })),
            },
          },
          include,
        });
        if (walletPay > 0) {
          await tx.walletTransaction.create({
            data: {
              customerId: b.customer.id,
              type: 'PAYMENT',
              amount: -walletPay,
              balanceAfter: walletAfter,
              invoiceId: invoice.id,
              note: 'Bill ' + invoiceNo,
              createdById: me.id,
            },
          });
        }
        for (const l of b.lines) {
          if (l.itemType === 'PRODUCT') {
            const r = await tx.product.updateMany({
              where: { id: l.productId!, stockQty: { gte: l.qty } },
              data: { stockQty: { decrement: l.qty } },
            });
            if (r.count === 0) throw new BillError('Not enough stock for ' + l.name);
            const after = await tx.product.findUnique({ where: { id: l.productId! } });
            await tx.stockMovement.create({
              data: {
                productId: l.productId!,
                type: 'SALE',
                qty: -l.qty,
                balanceAfter: after!.stockQty,
                note: 'Invoice ' + invoiceNo,
                createdById: me.id,
              },
            });
          } else if (l.itemType === 'PACKAGE') {
            const pk = await tx.package.findUnique({ where: { id: l.packageId! } });
            await tx.customerPackage.create({
              data: {
                customerId: b.customer.id,
                packageId: pk!.id,
                invoiceId: invoice.id,
                name: pk!.name,
                kind: pk!.kind,
                sessionsTotal: pk!.kind === 'SESSION' ? pk!.sessionCount : null,
                expiresAt: addDays(now, pk!.validityDays),
              },
            });
          } else if (l.itemType === 'MEMBERSHIP') {
            const plan = await tx.membershipPlan.findUnique({ where: { id: l.membershipPlanId! } });
            const latest = await tx.customerMembership.findFirst({
              where: { customerId: b.customer.id },
              orderBy: { expiresAt: 'desc' },
            });
            const startsAt = latest && latest.expiresAt > now ? latest.expiresAt : now;
            await tx.customerMembership.create({
              data: {
                customerId: b.customer.id,
                planId: plan!.id,
                invoiceId: invoice.id,
                name: plan!.name,
                discountPercent: plan!.discountPercent,
                price: plan!.price,
                startsAt,
                expiresAt: addDays(startsAt, plan!.validityDays),
              },
            });
          } else if (l.itemType === 'SESSION_USE') {
            await tx.customerPackage.update({
              where: { id: l.customerPackageId! },
              data: { sessionsUsed: { increment: 1 } },
            });
            const cp = await tx.customerPackage.findUnique({ where: { id: l.customerPackageId! } });
            if (cp!.sessionsUsed > (cp!.sessionsTotal ?? 0)) throw new BillError('No sessions left in ' + cp!.name);
            await tx.sessionUse.create({
              data: {
                customerPackageId: cp!.id,
                invoiceId: invoice.id,
                serviceId: l.serviceId!,
                serviceName: l.name,
                staffId: l.staffId,
                usedById: me.id,
              },
            });
          }
        }
        return invoice;
      },
      { maxWait: 5000, timeout: 20000 }
    );
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'CREATE_INVOICE', entity: 'Invoice', entityId: String(inv.id) },
    });
    res.status(201).json(inv);
  } catch (e) {
    return fail(res, e);
  }
});
router.post('/:id/payments', canBill, async (req, res) => {
  const p = paymentSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id } });
      if (!inv) throw new BillError('Invoice not found', 404);
      if (inv.status === 'CANCELLED') throw new BillError('This invoice is cancelled');
      const due = round2(Number(inv.total) - Number(inv.paidAmount));
      if (p.data.amount > due + 0.001) throw new BillError('Amount is more than the due balance');
      let walletAfter: any = null;
      if (p.data.mode === 'WALLET') {
        if (!inv.customerId) throw new BillError('E-wallet payment needs a customer');
        const r = await tx.customer.updateMany({
          where: { id: inv.customerId, walletBalance: { gte: p.data.amount } },
          data: { walletBalance: { decrement: p.data.amount } },
        });
        if (r.count === 0) throw new BillError('Not enough E-wallet balance');
        const w = await tx.customer.findUnique({ where: { id: inv.customerId } });
        walletAfter = w!.walletBalance;
        await tx.walletTransaction.create({
          data: {
            customerId: inv.customerId,
            type: 'PAYMENT',
            amount: -p.data.amount,
            balanceAfter: walletAfter,
            invoiceId: id,
            note: 'Bill ' + inv.invoiceNo + ' (balance payment)',
            createdById: me.id,
          },
        });
      }
      await tx.payment.create({
        data: { invoiceId: id, mode: p.data.mode, amount: p.data.amount, reference: p.data.reference, createdById: me.id, balanceAfter: walletAfter },
      });
      const paid = round2(Number(inv.paidAmount) + p.data.amount);
      const status: 'PAID' | 'PARTIAL' = paid >= Number(inv.total) - 0.001 ? 'PAID' : 'PARTIAL';
      return tx.invoice.update({ where: { id }, data: { paidAmount: paid, status }, include });
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'ADD_PAYMENT', entity: 'Invoice', entityId: String(id) },
    });
    res.json(updated);
  } catch (e) {
    return fail(res, e);
  }
});
const canCancel = authorize('OWNER', 'ADMIN', 'MANAGER');
router.post('/:id/cancel', canCancel, async (req, res) => {
  const p = z
    .object({
      reason: z.string().min(3),
      refundMode: z.enum(['CASH', 'UPI', 'CARD', 'BANK', 'WALLET']).optional(),
      refundReference: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter a reason (at least 3 letters)' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const refundMode = p.data.refundMode ?? 'CASH';
  const refundRef = p.data.refundReference ? p.data.refundReference.trim() : '';
  try {
    await prisma.$transaction(
      async (tx) => {
        const inv = await tx.invoice.findUnique({ where: { id }, include: { items: true, payments: true } });
        if (!inv) throw new BillError('Invoice not found', 404);
        if (inv.status === 'CANCELLED') throw new BillError('This bill is already cancelled');
        if (refundMode === 'WALLET' && !inv.customerId) {
          throw new BillError('A guest bill cannot be refunded to an E-Wallet');
        }
        const bought = await tx.customerPackage.findMany({ where: { invoiceId: id }, include: { uses: true } });
        for (const cp of bought) {
          if (cp.sessionsUsed > 0 || cp.uses.length > 0) {
            throw new BillError('Cannot cancel: sessions of ' + cp.name + ' bought on this bill are already used.');
          }
        }
        if (inv.customerId) {
          const mems = await tx.customerMembership.count({ where: { invoiceId: id } });
          if (mems > 0) {
            const later = await tx.invoice.findFirst({
              where: {
                customerId: inv.customerId,
                id: { not: id },
                status: { not: 'CANCELLED' as const },
                createdAt: { gt: inv.createdAt },
                membershipDiscount: { gt: 0 },
              },
            });
            if (later) {
              throw new BillError('Cannot cancel: the membership from this bill was already used for a discount on bill ' + later.invoiceNo + '.');
            }
          }
        }
        const uses = await tx.sessionUse.findMany({ where: { invoiceId: id } });
        for (const u of uses) {
          await tx.customerPackage.updateMany({
            where: { id: u.customerPackageId, sessionsUsed: { gt: 0 } },
            data: { sessionsUsed: { decrement: 1 } },
          });
        }
        await tx.sessionUse.deleteMany({ where: { invoiceId: id } });
        await tx.customerPackage.deleteMany({ where: { invoiceId: id } });
        await tx.customerMembership.deleteMany({ where: { invoiceId: id } });
        for (const it of inv.items) {
          if (it.itemType === 'PRODUCT' && it.productId) {
            const qty = Number(it.qty);
            const exists = await tx.product.findUnique({ where: { id: it.productId } });
            if (!exists) continue;
            const after = await tx.product.update({
              where: { id: it.productId },
              data: { stockQty: { increment: qty } },
            });
            await tx.stockMovement.create({
              data: {
                productId: it.productId,
                type: 'IN',
                qty,
                balanceAfter: after.stockQty,
                note: 'Cancelled bill ' + inv.invoiceNo,
                createdById: me.id,
              },
            });
          }
        }
        const paidRows = inv.payments.filter((x) => Number(x.amount) > 0);
        const walletPaid = round2(paidRows.filter((x) => x.mode === 'WALLET').reduce((s, x) => s + Number(x.amount), 0));
        const otherPaid = round2(paidRows.filter((x) => x.mode !== 'WALLET').reduce((s, x) => s + Number(x.amount), 0));
        const toWallet = round2(walletPaid + (refundMode === 'WALLET' ? otherPaid : 0));
        if (toWallet > 0.004) {
          const c = await tx.customer.update({
            where: { id: inv.customerId! },
            data: { walletBalance: { increment: toWallet } },
          });
          await tx.walletTransaction.create({
            data: {
              customerId: inv.customerId!,
              type: 'ADJUSTMENT',
              amount: toWallet,
              balanceAfter: c.walletBalance,
              invoiceId: id,
              note: 'Refund: cancelled bill ' + inv.invoiceNo,
              createdById: me.id,
            },
          });
          await tx.payment.create({
            data: {
              invoiceId: id,
              mode: 'WALLET',
              amount: -toWallet,
              reference: 'Refund to E-Wallet',
              balanceAfter: c.walletBalance,
              createdById: me.id,
            },
          });
        }
        if (refundMode !== 'WALLET' && otherPaid > 0.004) {
          await tx.payment.create({
            data: {
              invoiceId: id,
              mode: refundMode,
              amount: -otherPaid,
              reference: 'Refund' + (refundRef ? ' ' + refundRef : ''),
              createdById: me.id,
            },
          });
        }
        await tx.invoice.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            appointmentId: null,
            paidAmount: 0,
            cancelReason: p.data.reason.trim(),
            cancelledAt: new Date(),
            cancelledById: me.id,
          },
        });
      },
      { maxWait: 5000, timeout: 30000 }
    );
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'CANCEL_INVOICE', entity: 'Invoice', entityId: String(id) },
    });
    res.json(await prisma.invoice.findUnique({ where: { id }, include }));
  } catch (e) {
    return fail(res, e);
  }
});export default router;













