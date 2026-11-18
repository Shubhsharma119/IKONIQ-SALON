import { Router } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/', async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [customers, newCustomersToday, services, activeStaff] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.customer.count({ where: { createdAt: { gte: today } } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);
  res.json({ customers, newCustomersToday, services, activeStaff });
});
export default router;
