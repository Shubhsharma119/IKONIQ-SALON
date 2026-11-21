import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const KEYS = ['salonName', 'address', 'phone', 'gstin', 'billFooter'];
router.get('/', async (_req, res) => {
  const rows = await prisma.setting.findMany({ where: { key: { in: KEYS } } });
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});
router.put('/', authorize('OWNER', 'ADMIN'), async (req, res) => {
  const p = z
    .object({ salonName: z.string(), address: z.string(), phone: z.string(), gstin: z.string(), billFooter: z.string() })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d: Record<string, string> = {
    salonName: p.data.salonName.trim(),
    address: p.data.address.trim(),
    phone: p.data.phone.trim(),
    gstin: p.data.gstin.trim().toUpperCase(),
    billFooter: p.data.billFooter.trim(),
  };
  if (d.salonName.length < 2 || d.salonName.length > 80) {
    return res.status(400).json({ message: 'Enter the salon name (2 to 80 letters)' });
  }
  if (d.address.length > 200) return res.status(400).json({ message: 'Address is too long (200 letters at most)' });
  if (d.phone.length > 30) return res.status(400).json({ message: 'Phone is too long' });
  if (d.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(d.gstin)) {
    return res.status(400).json({ message: 'Enter a valid 15-character GSTIN' });
  }
  if (d.billFooter.length > 120) return res.status(400).json({ message: 'Bill footer is too long (120 letters at most)' });
  await prisma.$transaction(
    KEYS.map((k) =>
      prisma.setting.upsert({ where: { key: k }, update: { value: d[k] }, create: { key: k, value: d[k] } })
    )
  );
  await prisma.auditLog.create({
    data: { userId: (req as any).user.id, action: 'UPDATE_SETTINGS', entity: 'Setting', entityId: 'salon' },
  });
  res.json(d);
});
export default router;
