import { Router } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.use(authorize('OWNER', 'ADMIN', 'MANAGER'));
const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;
const live = { status: { not: 'CANCELLED' as const } };
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const monthKey = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
async function keptRows(from: Date, to: Date) {
  const rows = await prisma.invoice.findMany({
    where: { status: 'CANCELLED' as const, cancelledAt: { gte: from, lt: to } },
    select: { cancelledAt: true, payments: { select: { mode: true, amount: true } } },
  });
  const out: { at: Date; mode: string; amount: number }[] = [];
  for (const inv of rows) {
    let cashIn = 0;
    let cashOut = 0;
    let mode = 'CASH';
    for (const p of inv.payments) {
      if (p.mode === 'WALLET') continue;
      const a = num(p.amount);
      if (a > 0) {
        if (cashIn === 0) mode = p.mode;
        cashIn += a;
      } else cashOut += -a;
    }
    const kept = r2(cashIn - cashOut);
    if (kept > 0.004 && inv.cancelledAt) out.push({ at: inv.cancelledAt, mode, amount: kept });
  }
  return out;
}
async function kpis(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [inv, pay, top, exp, newCust, items, cancelled] = await Promise.all([
    prisma.invoice.aggregate({
      where: { createdAt: range, ...live },
      _sum: { total: true, taxableAmount: true, gstAmount: true, discountAmount: true, membershipDiscount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({ where: { createdAt: range, mode: { not: 'WALLET' as const }, invoice: { status: { not: 'CANCELLED' as const } } }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'TOPUP' as const, createdAt: range }, _sum: { paidAmount: true } }),
    prisma.expense.aggregate({ where: { expenseDate: range, isVoid: false }, _sum: { amount: true } }),
    prisma.customer.count({ where: { createdAt: range } }),
    prisma.invoiceItem.findMany({
      where: { itemType: 'PRODUCT' as const, productId: { not: null }, invoice: { createdAt: range, ...live } },
      select: { productId: true, qty: true },
    }),
    prisma.invoice.aggregate({
      where: { createdAt: range, status: 'CANCELLED' as const },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);
  const ids = Array.from(new Set(items.map((i) => i.productId as number)));
  const prods = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, costPrice: true } })
    : [];
  const cost: Record<number, number> = {};
  for (const p of prods) cost[p.id] = num(p.costPrice);
  let cogs = 0;
  for (const i of items) cogs += num(i.qty) * (cost[i.productId as number] || 0);
  const netSales = num(inv._sum.taxableAmount);
  const kept = (await keptRows(from, to)).reduce((s, k) => s + k.amount, 0);
  const expenses = num(exp._sum.amount);
  const bills = inv._count._all;
  return {
    bills,
    billed: r2(num(inv._sum.total)),
    netSales: r2(netSales),
    gst: r2(num(inv._sum.gstAmount)),
    discounts: r2(num(inv._sum.discountAmount) + num(inv._sum.membershipDiscount)),
    collection: r2(num(pay._sum.amount) + num(top._sum.paidAmount) + kept),
    expenses: r2(expenses),
    cogs: r2(cogs),
    profit: r2(netSales - cogs - expenses),
    newCustomers: newCust,
    cancelledBills: cancelled._count._all,
    cancelledAmount: r2(num(cancelled._sum.total)),
    avgBill: bills ? r2(num(inv._sum.total) / bills) : 0,
  };
}
router.get('/', async (req, res) => {
  const from = new Date(String(req.query.from));
  const to = new Date(String(req.query.to));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
    return res.status(400).json({ message: 'Choose a valid date range' });
  }
  const span = to.getTime() - from.getTime();
  const days = Math.max(1, Math.round(span / DAY));
  if (days > 400) return res.status(400).json({ message: 'Please choose a range of 400 days or less' });
  const prevFrom = new Date(from.getTime() - span);
  const range = { gte: from, lt: to };
  const now = new Date();
  const [current, previous, invoices, payments, topups, expenses, appts, supPaid, purchased] = await Promise.all([
    kpis(from, to),
    kpis(prevFrom, from),
    prisma.invoice.findMany({
      where: { createdAt: range, ...live },
      select: {
        createdAt: true,
        total: true,
        customerId: true,
        items: { select: { itemType: true, productId: true, staffId: true, name: true, qty: true, amount: true } },
      },
    }),
    prisma.payment.findMany({ where: { createdAt: range, invoice: { status: { not: 'CANCELLED' as const } } }, select: { createdAt: true, mode: true, amount: true } }),
    prisma.walletTransaction.findMany({
      where: { type: 'TOPUP' as const, createdAt: range },
      select: { createdAt: true, paidAmount: true, mode: true },
    }),
    prisma.expense.findMany({
      where: { expenseDate: range, isVoid: false },
      select: { expenseDate: true, amount: true, category: { select: { name: true } } },
    }),
    prisma.appointment.groupBy({ by: ['status'], where: { startAt: range }, _count: { _all: true } }),
    prisma.supplierPayment.aggregate({ where: { createdAt: range, isVoid: false }, _sum: { amount: true } }),
    prisma.purchase.aggregate({ where: { billDate: range, isVoid: false }, _sum: { total: true } }),
  ]);
  const [recv, purch, prodsAll, walletAgg, members, pkgs, custTotal] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ['PARTIAL' as const, 'UNPAID' as const] } },
      select: { total: true, paidAmount: true, customerId: true, customer: { select: { name: true, phone: true } } },
    }),
    prisma.purchase.findMany({ where: { isVoid: false }, include: { supplier: { select: { id: true, name: true } } } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { name: true, unit: true, stockQty: true, costPrice: true, lowStockLevel: true },
    }),
    prisma.customer.aggregate({ where: { walletBalance: { gt: 0 } }, _sum: { walletBalance: true }, _count: { _all: true } }),
    prisma.customerMembership.count({ where: { startsAt: { lte: now }, expiresAt: { gte: now } } }),
    prisma.customerPackage.findMany({
      where: { expiresAt: { gte: now }, sessionsTotal: { not: null } },
      select: { sessionsTotal: true, sessionsUsed: true },
    }),
    prisma.customer.count({ where: { isActive: true } }),
  ]);
  // ---- trend (daily, or monthly for long ranges)
  const bucket = days <= 62 ? 'day' : 'month';
  const keyOf = (d: Date) => (bucket === 'day' ? dayKey(d) : monthKey(d));
  const trendMap = new Map<string, { label: string; sales: number; collection: number; expenses: number }>();
  const cursor = new Date(from);
  while (cursor.getTime() < to.getTime()) {
    const label =
      bucket === 'day'
        ? cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    trendMap.set(keyOf(cursor), { label, sales: 0, collection: 0, expenses: 0 });
    if (bucket === 'day') cursor.setDate(cursor.getDate() + 1);
    else {
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  for (const i of invoices as any[]) {
    const t = trendMap.get(keyOf(i.createdAt));
    if (t) t.sales += num(i.total);
  }
  const modeTotals: Record<string, number> = {};
  for (const k of await keptRows(from, to)) {
    modeTotals[k.mode] = (modeTotals[k.mode] || 0) + k.amount;
    const t = trendMap.get(keyOf(k.at));
    if (t) t.collection += k.amount;
  }
  let walletUsed = 0;
  for (const p of payments as any[]) {
    if (p.mode === 'WALLET') {
      walletUsed += num(p.amount);
      continue;
    }
    modeTotals[p.mode] = (modeTotals[p.mode] || 0) + num(p.amount);
    const t = trendMap.get(keyOf(p.createdAt));
    if (t) t.collection += num(p.amount);
  }
  for (const w of topups as any[]) {
    const m = w.mode || 'OTHER';
    modeTotals[m] = (modeTotals[m] || 0) + num(w.paidAmount);
    const t = trendMap.get(keyOf(w.createdAt));
    if (t) t.collection += num(w.paidAmount);
  }
  const expCat: Record<string, number> = {};
  for (const e of expenses as any[]) {
    const t = trendMap.get(keyOf(e.expenseDate));
    if (t) t.expenses += num(e.amount);
    const name = e.category ? e.category.name : 'Other';
    expCat[name] = (expCat[name] || 0) + num(e.amount);
  }
  const trend = Array.from(trendMap.values()).map((t) => ({
    label: t.label,
    sales: r2(t.sales),
    collection: r2(t.collection),
    expenses: r2(t.expenses),
  }));
  // ---- sales mix, services, products, staff, customers
  const mix: Record<string, number> = { Services: 0, Products: 0, Packages: 0, Memberships: 0 };
  const svc = new Map<string, { name: string; count: number; amount: number }>();
  const prodMap = new Map<number, { name: string; qty: number; revenue: number }>();
  const staffMap = new Map<number, { amount: number; items: number }>();
  const custMap = new Map<number, { bills: number; amount: number }>();
  for (const inv of invoices as any[]) {
    if (inv.customerId != null) {
      const c = custMap.get(inv.customerId) || { bills: 0, amount: 0 };
      c.bills += 1;
      c.amount += num(inv.total);
      custMap.set(inv.customerId, c);
    }
    for (const it of inv.items as any[]) {
      const amt = num(it.amount);
      if (it.itemType === 'PRODUCT') mix.Products += amt;
      else if (it.itemType === 'PACKAGE') mix.Packages += amt;
      else if (it.itemType === 'MEMBERSHIP') mix.Memberships += amt;
      else mix.Services += amt;
      if (it.itemType === 'SERVICE' || it.itemType === 'SESSION_USE') {
        const name = String(it.name).replace(/ \(session - .*\)$/, '');
        const s = svc.get(name) || { name, count: 0, amount: 0 };
        s.count += num(it.qty);
        s.amount += amt;
        svc.set(name, s);
      }
      if (it.itemType === 'PRODUCT' && it.productId != null) {
        const p = prodMap.get(it.productId) || { name: it.name, qty: 0, revenue: 0 };
        p.qty += num(it.qty);
        p.revenue += amt;
        prodMap.set(it.productId, p);
      }
      if (it.staffId != null) {
        const s = staffMap.get(it.staffId) || { amount: 0, items: 0 };
        s.amount += amt;
        s.items += 1;
        staffMap.set(it.staffId, s);
      }
    }
  }
  const prodIds = Array.from(prodMap.keys());
  const [prodCosts, staffUsers, custRows] = await Promise.all([
    prodIds.length
      ? prisma.product.findMany({ where: { id: { in: prodIds } }, select: { id: true, costPrice: true } })
      : Promise.resolve([] as { id: number; costPrice: any }[]),
    staffMap.size
      ? prisma.user.findMany({ where: { id: { in: Array.from(staffMap.keys()) } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: number; name: string }[]),
    custMap.size
      ? prisma.customer.findMany({ where: { id: { in: Array.from(custMap.keys()) } }, select: { id: true, name: true, phone: true } })
      : Promise.resolve([] as { id: number; name: string; phone: string }[]),
  ]);
  const products = Array.from(prodMap.entries())
    .map(([id, p]) => {
      const c = prodCosts.find((x) => x.id === id);
      const cost = p.qty * num(c ? c.costPrice : 0);
      return { name: p.name, qty: r2(p.qty), revenue: r2(p.revenue), profit: r2(p.revenue - cost) };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const services = Array.from(svc.values())
    .map((s) => ({ name: s.name, count: r2(s.count), amount: r2(s.amount) }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .slice(0, 8);
  const staff = Array.from(staffMap.entries())
    .map(([id, s]) => {
      const u = staffUsers.find((x) => x.id === id);
      return { name: u ? u.name : 'Staff ' + id, amount: r2(s.amount), items: s.items };
    })
    .sort((a, b) => b.amount - a.amount);
  const topCustomers = Array.from(custMap.entries())
    .map(([id, c]) => {
      const u = custRows.find((x) => x.id === id);
      return { id, name: u ? u.name : 'Customer ' + id, phone: u ? u.phone : '', bills: c.bills, amount: r2(c.amount) };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  // ---- snapshot as of today
  const recvRows = (recv as any[])
    .map((r) => ({ name: r.customer ? r.customer.name : 'Guest', due: num(r.total) - num(r.paidAmount) }))
    .filter((r) => r.due > 0.004);
  const recvBy: Record<string, number> = {};
  for (const r of recvRows) recvBy[r.name] = (recvBy[r.name] || 0) + r.due;
  const supBy: Record<string, number> = {};
  let supTotal = 0;
  for (const p of purch as any[]) {
    const due = Math.max(0, num(p.total) - num(p.paidAmount) - num(p.returnedAmount));
    if (due <= 0.004) continue;
    const name = p.supplier ? p.supplier.name : 'Supplier';
    supBy[name] = (supBy[name] || 0) + due;
    supTotal += due;
  }
  let stockValue = 0;
  let outCount = 0;
  const lowList: { name: string; qty: number; unit: string }[] = [];
  for (const p of prodsAll as any[]) {
    const q = num(p.stockQty);
    stockValue += q * num(p.costPrice);
    if (q <= 0) outCount += 1;
    else if (num(p.lowStockLevel) > 0 && q <= num(p.lowStockLevel)) lowList.push({ name: p.name, qty: q, unit: p.unit });
  }
  let sessionsLeft = 0;
  for (const p of pkgs) sessionsLeft += Math.max(0, num(p.sessionsTotal) - num(p.sessionsUsed));
  const money = (o: Record<string, number>, n: number) =>
    Object.keys(o)
      .map((k) => ({ name: k, amount: r2(o[k]) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, n);
  const paidOut = r2(num(supPaid._sum.amount));
  res.json({
    range: { from, to, days, bucket },
    current,
    previous,
    trend,
    salesMix: Object.keys(mix).map((k) => ({ name: k, amount: r2(mix[k]) })).filter((m) => m.amount > 0),
    payModes: Object.keys(modeTotals)
      .map((m) => ({ mode: m, amount: r2(modeTotals[m]) }))
      .filter((m) => Math.abs(m.amount) > 0.004)
      .sort((a, b) => b.amount - a.amount),
    walletUsed: r2(walletUsed),
    services,
    products,
    staff,
    customers: { served: custMap.size, newCustomers: current.newCustomers, top: topCustomers },
    expensesByCategory: money(expCat, 8),
    appointments: {
      total: appts.reduce((n, a) => n + a._count._all, 0),
      byStatus: appts.map((a) => ({ status: String(a.status), count: a._count._all })),
    },
    purchasing: { purchased: r2(num(purchased._sum.total)), paidToSuppliers: paidOut },
    cashFlow: {
      in: current.collection,
      out: r2(current.expenses + paidOut),
      net: r2(current.collection - current.expenses - paidOut),
    },
    snapshot: {
      customersTotal: custTotal,
      receivable: {
        total: r2(recvRows.reduce((n, r) => n + r.due, 0)),
        count: recvRows.length,
        top: money(recvBy, 5),
      },
      supplierDue: { total: r2(supTotal), top: money(supBy, 5) },
      stock: {
        value: r2(stockValue),
        products: prodsAll.length,
        low: lowList.length,
        out: outCount,
        lowList: lowList.slice(0, 5),
      },
      wallet: { balance: r2(num(walletAgg._sum.walletBalance)), customers: walletAgg._count._all },
      members,
      packages: { active: pkgs.length, sessionsLeft },
    },
  });
});
export default router;






