import { Router } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
router.get('/customer/:id', async (req, res) => {
  const id = Number(req.params.id);
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  const [invoices, packages, memberships, wallet] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { id: 'asc' } }, payments: { orderBy: { createdAt: 'asc' } } },
    }),
    prisma.customerPackage.findMany({
      where: { customerId: id },
      orderBy: { purchasedAt: 'desc' },
      include: { uses: { orderBy: { usedAt: 'desc' } } },
    }),
    prisma.customerMembership.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.walletTransaction.findMany({ where: { customerId: id }, orderBy: { id: 'desc' } }),
  ]);
  const staffIds: number[] = [];
  const invIds: number[] = [];
  const addStaff = (s: number | null) => {
    if (s != null && !staffIds.includes(s)) staffIds.push(s);
  };
  const addInv = (i: number | null) => {
    if (i != null && !invIds.includes(i)) invIds.push(i);
  };
  for (const inv of invoices) for (const it of inv.items) addStaff(it.staffId);
  for (const p of packages) {
    addInv(p.invoiceId);
    for (const u of p.uses) {
      addStaff(u.staffId);
      addInv(u.invoiceId);
    }
  }
  for (const m of memberships) addInv(m.invoiceId);
  for (const w of wallet) addInv(w.invoiceId);
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
    : [];
  const invRows = invIds.length
    ? await prisma.invoice.findMany({ where: { id: { in: invIds } }, select: { id: true, invoiceNo: true } })
    : [];
  const sName = (s: number | null) => (s == null ? null : (staff.find((x) => x.id === s) || { name: null }).name);
  const iNo = (i: number | null) => (i == null ? null : (invRows.find((x) => x.id === i) || { invoiceNo: null }).invoiceNo);
  const svc: Record<string, { name: string; count: number; lastDate: Date }> = {};
  for (const inv of invoices) {
    if (inv.status === 'CANCELLED') continue;
    for (const it of inv.items) {
      if (it.itemType !== 'SERVICE' && it.itemType !== 'SESSION_USE') continue;
      const name = it.name.replace(/ \(session - .*\)$/, '');
      const cnt = num(it.qty);
      const cur = svc[name];
      if (!cur) svc[name] = { name, count: cnt, lastDate: inv.createdAt };
      else {
        cur.count += cnt;
        if (inv.createdAt > cur.lastDate) cur.lastDate = inv.createdAt;
      }
    }
  }
  const live = invoices.filter((i) => i.status !== 'CANCELLED');
  let walletPaid = 0;
  let walletBonus = 0;
  let walletSpent = 0;
  for (const w of wallet) {
    if (w.type === 'TOPUP') {
      walletPaid += num(w.paidAmount);
      walletBonus += num(w.bonusAmount);
    }
    if (w.type === 'PAYMENT') walletSpent += -num(w.amount);
  }
  res.json({
    customer: {
      id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
      gender: customer.gender, dob: customer.dob, notes: customer.notes,
      isActive: customer.isActive, createdAt: customer.createdAt,
    },
    summary: {
      visits: live.length,
      totalBilled: round2(live.reduce((s, i) => s + num(i.total), 0)),
      totalDue: round2(live.reduce((s, i) => s + (num(i.total) - num(i.paidAmount)), 0)),
      lastVisit: live.length ? live[0].createdAt : null,
      walletBalance: num(customer.walletBalance),
      walletPaid: round2(walletPaid),
      walletBonus: round2(walletBonus),
      walletSpent: round2(walletSpent),
    },
    services: Object.values(svc).sort((a, b) => b.count - a.count),
    bills: invoices.map((inv) => ({
      ...inv,
      items: inv.items.map((it) => ({ ...it, staffName: sName(it.staffId) })),
    })),
    wallet: wallet.map((w) => ({ ...w, invoiceNo: iNo(w.invoiceId) })),
    packages: packages.map((p) => ({
      ...p,
      invoiceNo: iNo(p.invoiceId),
      uses: p.uses.map((u) => ({ ...u, staffName: sName(u.staffId), invoiceNo: iNo(u.invoiceId) })),
    })),
    memberships: memberships.map((m) => ({ ...m, invoiceNo: iNo(m.invoiceId) })),
  });
});
router.get('/memberships', async (req, res) => {
  const status = String(req.query.status || 'active');
  const now = new Date();
  const where =
    status === 'active' ? { expiresAt: { gte: now } } : status === 'expired' ? { expiresAt: { lt: now } } : {};
  const rows = await prisma.customerMembership.findMany({
    where,
    orderBy: { expiresAt: status === 'expired' ? 'desc' : 'asc' },
    take: 300,
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  const ids: number[] = [];
  for (const r of rows) if (r.invoiceId != null && !ids.includes(r.invoiceId)) ids.push(r.invoiceId);
  const invs = ids.length
    ? await prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, invoiceNo: true } })
    : [];
  res.json(
    rows.map((r) => ({
      id: r.id,
      customer: r.customer,
      name: r.name,
      discountPercent: Number(r.discountPercent),
      price: Number(r.price),
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      daysLeft: Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86400000),
      state: r.expiresAt < now ? 'EXPIRED' : r.startsAt > now ? 'UPCOMING' : 'ACTIVE',
      invoiceNo: (invs.find((i) => i.id === r.invoiceId) || { invoiceNo: null }).invoiceNo,
    }))
  );
});
export default router;
