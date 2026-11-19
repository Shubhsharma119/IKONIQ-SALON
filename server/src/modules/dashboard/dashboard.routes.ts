import { Router } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const round2 = (n: number) => Math.round(n * 100) / 100;
router.get('/', async (_req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);
  const [
    customers, newCustomersToday, services, activeStaff, recentCustomers, weekCustomers,
    staffRows, todayAppointments, weekInvoices, collection, staffSales, stockRows,
  ] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.customer.count({ where: { createdAt: { gte: start } } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, phone: true, createdAt: true },
    }),
    prisma.customer.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 6,
      select: { id: true, name: true, role: true, staffProfile: { select: { designation: true } } },
    }),
    prisma.appointment.count({
      where: { startAt: { gte: start, lt: end }, status: { not: 'CANCELLED' as const } },
    }),
    prisma.invoice.findMany({
      where: { createdAt: { gte: weekStart }, status: { not: 'CANCELLED' as const } },
      select: { createdAt: true, total: true },
    }),
    prisma.payment.aggregate({ where: { createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.invoiceItem.groupBy({
      by: ['staffId'],
      where: {
        staffId: { not: null },
        invoice: { createdAt: { gte: start, lt: end }, status: { not: 'CANCELLED' as const } },
      },
      _sum: { amount: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, lowStockLevel: { gt: 0 } },
      select: { id: true, name: true, unit: true, stockQty: true, lowStockLevel: true },
    }),
  ]);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    week.push({
      date: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      customers: weekCustomers.filter((c) => c.createdAt >= d && c.createdAt < next).length,
      sales: round2(
        weekInvoices.filter((v) => v.createdAt >= d && v.createdAt < next).reduce((n, v) => n + Number(v.total), 0)
      ),
    });
  }
  const staff = staffRows.map((s) => {
    const row = staffSales.find((x) => x.staffId === s.id);
    return { ...s, todayRevenue: round2(Number(row?._sum.amount ?? 0)) };
  });
  const lowStock = stockRows
    .filter((p) => Number(p.stockQty) <= Number(p.lowStockLevel))
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, unit: p.unit, stockQty: Number(p.stockQty), lowStockLevel: Number(p.lowStockLevel) }));
  res.json({
    customers,
    newCustomersToday,
    services,
    activeStaff,
    recentCustomers,
    staff,
    week,
    lowStock,
    todaySales: week[6].sales,
    todayCollection: round2(Number(collection._sum.amount ?? 0)),
    todayExpenses: 0,
    estimatedProfit: 0,
    todayAppointments,
    billingReady: true,
  });
});
export default router;
