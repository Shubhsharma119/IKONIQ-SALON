import { Router } from 'express';
import { z } from 'zod';
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canWrite = authorize('OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST');
const include = {
  customer: { select: { id: true, name: true, phone: true } },
  staff: { select: { id: true, name: true } },
  services: { include: { service: { select: { id: true, name: true } } } },
};
const BUSY: AppointmentStatus[] = ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];
const transitions: Record<string, string[]> = {
  SCHEDULED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
const bodySchema = z.object({
  customerId: z.number().int(),
  staffId: z.number().int().nullable().optional(),
  startAt: z.coerce.date(),
  serviceIds: z.array(z.number().int()).min(1),
  notes: z.string().optional(),
  isWalkIn: z.boolean().optional(),
});
const statusSchema = z.object({
  status: z.enum(['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  cancelReason: z.string().optional(),
});
async function buildTimes(serviceIds: number[], startAt: Date) {
  const unique = Array.from(new Set(serviceIds));
  const services = await prisma.service.findMany({ where: { id: { in: unique }, isActive: true } });
  if (services.length !== unique.length) return null;
  const total = services.reduce((n, s) => n + s.durationMin, 0);
  return { services, endAt: new Date(startAt.getTime() + total * 60000) };
}
async function hasConflict(staffId: number, startAt: Date, endAt: Date, excludeId?: number) {
  const c = await prisma.appointment.findFirst({
    where: {
      staffId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: BUSY },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  return !!c;
}
router.get('/', async (req, res) => {
  const from = new Date(String(req.query.from));
  const to = new Date(String(req.query.to));
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ message: 'from and to dates are required' });
  }
  const items = await prisma.appointment.findMany({
    where: { startAt: { gte: from, lt: to } },
    orderBy: { startAt: 'asc' },
    include,
  });
  res.json(items);
});
router.post('/', canWrite, async (req, res) => {
  const p = bodySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const me = (req as any).user;
  const { customerId, staffId, serviceIds, notes, isWalkIn } = p.data;
  const startAt = isWalkIn ? new Date() : p.data.startAt;
  if (!isWalkIn && startAt.getTime() < Date.now() - 5 * 60000) {
    return res.status(400).json({ message: 'Appointment time cannot be in the past' });
  }
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.isActive) {
    return res.status(400).json({ message: 'Customer not found or inactive' });
  }
  if (staffId) {
    const st = await prisma.user.findUnique({ where: { id: staffId } });
    if (!st || !st.isActive) return res.status(400).json({ message: 'Staff member not found or inactive' });
  }
  const t = await buildTimes(serviceIds, startAt);
  if (!t) return res.status(400).json({ message: 'One or more services are invalid or inactive' });
  if (staffId && (await hasConflict(staffId, startAt, t.endAt))) {
    return res.status(409).json({ message: 'This staff member already has an appointment during that time' });
  }
  const appt = await prisma.appointment.create({
    data: {
      customerId,
      staffId: staffId ?? null,
      startAt,
      endAt: t.endAt,
      status: isWalkIn ? 'CHECKED_IN' : 'SCHEDULED',
      isWalkIn: !!isWalkIn,
      notes,
      branchId: me.branchId,
      createdById: me.id,
      services: {
        create: t.services.map((s) => ({ serviceId: s.id, price: s.price, durationMin: s.durationMin })),
      },
    },
    include,
  });
  await prisma.auditLog.create({
    data: { userId: me.id, action: 'CREATE_APPOINTMENT', entity: 'Appointment', entityId: String(appt.id) },
  });
  res.status(201).json(appt);
});
router.put('/:id', canWrite, async (req, res) => {
  const p = bodySchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Appointment not found' });
  if (!['SCHEDULED', 'CHECKED_IN'].includes(existing.status)) {
    return res.status(400).json({ message: 'Only scheduled or waiting appointments can be edited' });
  }
  const d = p.data;
  if (d.customerId !== undefined) {
    const c = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!c || !c.isActive) return res.status(400).json({ message: 'Customer not found or inactive' });
  }
  const staffId = d.staffId !== undefined ? d.staffId : existing.staffId;
  const startAt = d.startAt ?? existing.startAt;
  let endAt = new Date(startAt.getTime() + (existing.endAt.getTime() - existing.startAt.getTime()));
  let servicesData: any;
  if (d.serviceIds) {
    const t = await buildTimes(d.serviceIds, startAt);
    if (!t) return res.status(400).json({ message: 'One or more services are invalid or inactive' });
    endAt = t.endAt;
    servicesData = {
      deleteMany: {},
      create: t.services.map((s) => ({ serviceId: s.id, price: s.price, durationMin: s.durationMin })),
    };
  }
  if (staffId && (await hasConflict(staffId, startAt, endAt, id))) {
    return res.status(409).json({ message: 'This staff member already has an appointment during that time' });
  }
  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      customerId: d.customerId,
      staffId,
      startAt,
      endAt,
      notes: d.notes,
      ...(servicesData ? { services: servicesData } : {}),
    },
    include,
  });
  await prisma.auditLog.create({
    data: { userId: me.id, action: 'UPDATE_APPOINTMENT', entity: 'Appointment', entityId: String(id) },
  });
  res.json(appt);
});
router.patch('/:id/status', canWrite, async (req, res) => {
  const p = statusSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid status' });
  const id = Number(req.params.id);
  const me = (req as any).user;
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Appointment not found' });
  if (!transitions[existing.status].includes(p.data.status)) {
    return res.status(400).json({ message: 'This status change is not allowed' });
  }
  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      status: p.data.status,
      cancelReason: p.data.status === 'CANCELLED' ? p.data.cancelReason ?? null : undefined,
    },
    include,
  });
  await prisma.auditLog.create({
    data: { userId: me.id, action: 'APPOINTMENT_' + p.data.status, entity: 'Appointment', entityId: String(id) },
  });
  res.json(appt);
});
export default router;
