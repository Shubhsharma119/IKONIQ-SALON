import { Router } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/', async (_req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);
  const [customers, newCustomersToday, services, activeStaff, recentCustomers, weekCustomers, staff] =
    await Promise.all([
      prisma.customer.count({ where: { isActive: true } }),
      prisma.customer.count({ where: { createdAt: { gte: start } } }),
      prisma.service.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
      prisma.customer.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        take: 6,
        select: { id: true, name: true, role: true, staffProfile: { select: { designation: true } } },
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
      sales: 0,
    });
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const todayAppointments = await prisma.appointment.count({
    where: { startAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
  });

  res.json({
    customers,
    newCustomersToday,
    services,
    activeStaff,
    recentCustomers,
    staff,
    week,
    todaySales: 0,
    todayCollection: 0,
    todayExpenses: 0,
    estimatedProfit: 0,
    todayAppointments,
    billingReady: false,
  });
});
export default router;

