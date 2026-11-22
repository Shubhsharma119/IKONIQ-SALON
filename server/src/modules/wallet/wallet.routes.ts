import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canTopUp = authorize('OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST');
const canManage = authorize('OWNER', 'ADMIN', 'MANAGER');
const canAdjust = authorize('OWNER', 'ADMIN');
class WalletError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
function fail(res: any, e: any) {
  if (e instanceof WalletError) return res.status(e.code).json({ message: e.message });
  throw e;
}
const offerBase = z.object({
  name: z.string().min(2),
  payAmount: z.number().positive().max(10000000),
  creditAmount: z.number().positive().max(10000000),
  isActive: z.boolean().optional(),
});
router.get('/offers', async (_req, res) => {
  res.json(await prisma.walletOffer.findMany({ orderBy: [{ isActive: 'desc' }, { payAmount: 'asc' }] }));
});
router.post('/offers', canManage, async (req, res) => {
  const p = offerBase.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  if (p.data.creditAmount < p.data.payAmount) {
    return res.status(400).json({ message: 'Wallet credit must be equal to or more than the amount paid' });
  }
  res.status(201).json(await prisma.walletOffer.create({ data: p.data }));
});
router.put('/offers/:id', canManage, async (req, res) => {
  const p = offerBase.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const old = await prisma.walletOffer.findUnique({ where: { id } });
  if (!old) return res.status(404).json({ message: 'Offer not found' });
  const pay = p.data.payAmount ?? Number(old.payAmount);
  const credit = p.data.creditAmount ?? Number(old.creditAmount);
  if (credit < pay) {
    return res.status(400).json({ message: 'Wallet credit must be equal to or more than the amount paid' });
  }
  res.json(await prisma.walletOffer.update({ where: { id }, data: p.data }));
});
router.get('/balances', async (_req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [rows, agg, month] = await Promise.all([
    prisma.customer.findMany({
      where: { walletBalance: { gt: 0 } },
      orderBy: { walletBalance: 'desc' },
      take: 300,
      select: { id: true, name: true, phone: true, walletBalance: true },
    }),
    prisma.customer.aggregate({
      where: { walletBalance: { gt: 0 } },
      _sum: { walletBalance: true },
      _count: { _all: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: 'TOPUP', createdAt: { gte: monthStart } },
      _sum: { paidAmount: true, bonusAmount: true },
    }),
  ]);
  res.json({
    totalBalance: round2(Number(agg._sum.walletBalance ?? 0)),
    customersWithBalance: agg._count._all,
    monthPaid: round2(Number(month._sum.paidAmount ?? 0)),
    monthBonus: round2(Number(month._sum.bonusAmount ?? 0)),
    customers: rows,
  });
});
router.get('/customer/:id', async (req, res) => {
  const id = Number(req.params.id);
  const c = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true, walletBalance: true },
  });
  if (!c) return res.status(404).json({ message: 'Customer not found' });
  const txns = await prisma.walletTransaction.findMany({
    where: { customerId: id },
    orderBy: { id: 'desc' },
    take: 300,
  });
  const ids: number[] = [];
  for (const t of txns) if (t.invoiceId != null && !ids.includes(t.invoiceId)) ids.push(t.invoiceId);
  const invs = ids.length
    ? await prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, invoiceNo: true } })
    : [];
  res.json({
    customer: c,
    balance: Number(c.walletBalance),
    transactions: txns.map((t) => ({
      ...t,
      invoiceNo: (invs.find((i) => i.id === t.invoiceId) || { invoiceNo: null }).invoiceNo,
    })),
  });
});
const topupSchema = z.object({
  offerId: z.number().int().optional(),
  paidAmount: z.number().positive().max(10000000).optional(),
  bonusAmount: z.number().min(0).max(10000000).optional(),
  mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK']),
  reference: z.string().optional(),
  note: z.string().optional(),
});
router.post('/customer/:id/topup', canTopUp, async (req, res) => {
  const p = topupSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const isManager = ['OWNER', 'ADMIN', 'MANAGER'].includes(me.role);
  try {
    const out = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id } });
      if (!c || !c.isActive) throw new WalletError('Customer not found or inactive');
      let paid = 0;
      let bonus = 0;
      let offerName: string | null = null;
      if (p.data.offerId) {
        const o = await tx.walletOffer.findUnique({ where: { id: p.data.offerId } });
        if (!o || !o.isActive) throw new WalletError('This offer is not available');
        paid = Number(o.payAmount);
        bonus = round2(Number(o.creditAmount) - Number(o.payAmount));
        offerName = o.name;
      } else {
        if (!p.data.paidAmount) throw new WalletError('Enter the amount received from the customer');
        paid = p.data.paidAmount;
        bonus = p.data.bonusAmount ?? 0;
        if (bonus > 0 && !isManager) {
          throw new WalletError('Only a manager or owner can add a custom extra amount. Please choose an offer.', 403);
        }
      }
      const credit = round2(paid + bonus);
      const updated = await tx.customer.update({
        where: { id },
        data: { walletBalance: { increment: credit } },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          customerId: id,
          type: 'TOPUP',
          amount: credit,
          paidAmount: paid,
          bonusAmount: bonus,
          mode: p.data.mode,
          reference: p.data.reference ? p.data.reference.trim() || null : null,
          offerName,
          balanceAfter: updated.walletBalance,
          note: p.data.note ? p.data.note.trim() || null : null,
          createdById: me.id,
        },
      });
      return { txn, balance: Number(updated.walletBalance) };
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'WALLET_TOPUP', entity: 'Customer', entityId: String(id) },
    });
    res.status(201).json(out);
  } catch (e) {
    return fail(res, e);
  }
});
const adjustSchema = z.object({
  amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 10000000, 'Invalid amount'),
  note: z.string().min(3),
});
router.post('/customer/:id/adjust', canAdjust, async (req, res) => {
  const p = adjustSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter the amount and a reason (at least 3 letters)' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  try {
    const out = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id } });
      if (!c) throw new WalletError('Customer not found', 404);
      if (p.data.amount < 0) {
        const r = await tx.customer.updateMany({
          where: { id, walletBalance: { gte: -p.data.amount } },
          data: { walletBalance: { decrement: -p.data.amount } },
        });
        if (r.count === 0) throw new WalletError('Not enough E-wallet balance');
      } else {
        await tx.customer.update({ where: { id }, data: { walletBalance: { increment: p.data.amount } } });
      }
      const after = await tx.customer.findUnique({ where: { id } });
      const txn = await tx.walletTransaction.create({
        data: {
          customerId: id,
          type: 'ADJUSTMENT',
          amount: p.data.amount,
          balanceAfter: after!.walletBalance,
          note: p.data.note.trim(),
          createdById: me.id,
        },
      });
      return { txn, balance: Number(after!.walletBalance) };
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'WALLET_ADJUST', entity: 'Customer', entityId: String(id) },
    });
    res.status(201).json(out);
  } catch (e) {
    return fail(res, e);
  }
});
export default router;
