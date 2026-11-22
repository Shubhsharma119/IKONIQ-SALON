import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { getSettings } from './settings.service';
const router = Router();
router.use(authenticate);
const canEdit = authorize('OWNER', 'ADMIN');
const str = (max: number) => z.string().max(max);
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter time as HH:MM');
const salonSchema = z.object({
  name: z.string().min(2).max(80),
  tagline: str(120),
  address: str(200),
  city: str(60),
  state: str(60),
  pincode: z.string().regex(/^(\d{6})?$/, 'Enter a valid 6-digit pincode'),
  phone: z.string().regex(/^([0-9+\- ]{8,15})?$/, 'Enter a valid phone number'),
  email: z.union([z.literal(''), z.string().email('Enter a valid email address')]),
  gstin: z.string().regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'Enter a valid 15-character GSTIN'),
  logo: z.string().max(450000, 'Logo is too large').refine((v) => v === '' || v.startsWith('data:image/'), 'Logo must be an image'),
});
const invoiceSchema = z.object({
  prefix: z.string().regex(/^[A-Za-z0-9]{1,8}$/, 'Prefix must be 1 to 8 letters or digits'),
  footer: str(200),
  terms: str(500),
  showGstin: z.boolean(),
  defaultGst: z.boolean(),
  defaultGstRate: z.number().min(0).max(28),
  defaultPaper: z.enum(['80', '58', 'A4']),
  upiId: z.string().regex(/^([\w.\-]{2,}@[\w]{2,})?$/, 'Enter a valid UPI ID (like name@bank)'),
  bankDetails: str(300),
});
const hoursSchema = z
  .object({
    days: z
      .array(z.object({ day: z.number().int().min(0).max(6), open: z.boolean(), from: timeStr, to: timeStr }))
      .length(7),
  })
  .refine((v) => v.days.every((d) => !d.open || d.to > d.from), { message: 'Closing time must be after opening time' });
const holidaysSchema = z.object({
  list: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), reason: str(80) }))
    .max(100),
});
const whatsappSchema = z.object({
  enabled: z.boolean(),
  phoneNumberId: z.string().regex(/^\d{0,20}$/, 'Phone number ID must be digits only'),
  businessAccountId: z.string().regex(/^\d{0,20}$/, 'Business account ID must be digits only'),
  accessToken: str(600).optional(),
  graphVersion: z.string().regex(/^v\d+\.\d+$/, 'Use a version like v21.0'),
});
async function save(key: string, value: any, userId: number) {
  await prisma.setting.upsert({
    where: { key },
    update: { value, updatedById: userId },
    create: { key, value, updatedById: userId },
  });
  await prisma.auditLog.create({
    data: { userId, action: 'UPDATE_SETTINGS', entity: 'Setting', entityId: key },
  });
}
function bad(res: any, e: any) {
  return res.status(400).json({ message: e.issues && e.issues[0] ? e.issues[0].message : 'Invalid data' });
}
router.get('/', async (req, res) => {
  const cfg = await getSettings(prisma);
  const me = (req as any).user;
  const out: any = { salon: cfg.salon, invoice: cfg.invoice, hours: cfg.hours, holidays: cfg.holidays };
  if (me.role === 'OWNER' || me.role === 'ADMIN') {
    const { accessToken, ...rest } = cfg.whatsapp;
    out.whatsapp = { ...rest, tokenSet: !!accessToken };
  }
  res.json(out);
});
router.put('/salon', canEdit, async (req, res) => {
  const p = salonSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  await save('salon', p.data, (req as any).user.id);
  res.json(p.data);
});
router.put('/invoice', canEdit, async (req, res) => {
  const p = invoiceSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  await save('invoice', p.data, (req as any).user.id);
  res.json(p.data);
});
router.put('/hours', canEdit, async (req, res) => {
  const p = hoursSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  await save('hours', p.data, (req as any).user.id);
  res.json(p.data);
});
router.put('/holidays', canEdit, async (req, res) => {
  const p = holidaysSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const list = p.data.list.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  await save('holidays', { list }, (req as any).user.id);
  res.json({ list });
});
router.put('/whatsapp', canEdit, async (req, res) => {
  const p = whatsappSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const cur = await getSettings(prisma);
  const token = p.data.accessToken ? p.data.accessToken : cur.whatsapp.accessToken;
  if (p.data.enabled && (!p.data.phoneNumberId || !p.data.businessAccountId || !token)) {
    return res.status(400).json({ message: 'Phone number ID, business account ID and access token are required to enable WhatsApp' });
  }
  await save(
    'whatsapp',
    {
      enabled: p.data.enabled,
      phoneNumberId: p.data.phoneNumberId,
      businessAccountId: p.data.businessAccountId,
      accessToken: token,
      graphVersion: p.data.graphVersion,
    },
    (req as any).user.id
  );
  res.json({
    enabled: p.data.enabled,
    phoneNumberId: p.data.phoneNumberId,
    businessAccountId: p.data.businessAccountId,
    graphVersion: p.data.graphVersion,
    tokenSet: !!token,
  });
});
export default router;
