import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { userMap } from './shape';
const router = Router();
router.use(authenticate);
router.use(authorize('OWNER', 'ADMIN', 'MANAGER'));
class PoError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
const DAY = 86400000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: unknown) => Number(v) || 0;
const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);
function fyKey(d: Date) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return start + '-' + String((start + 1) % 100).padStart(2, '0');
}
function fail(res: any, e: any) {
  if (e instanceof PoError) return res.status(e.code).json({ message: e.message });
  throw e;
}
const include = {
  supplier: { select: { id: true, name: true, phone: true, gstin: true, address: true } },
  items: { orderBy: { id: 'asc' as const } },
  receipts: true,
};
function liveReceived(po: any, pm: Record<number, any>) {
  const got: Record<number, number> = {};
  for (const r of po.receipts) {
    const p = pm[r.purchaseId];
    if (!p || p.isVoid) continue;
    got[r.poItemId] = (got[r.poItemId] || 0) + num(r.qty);
  }
  return got;
}
function shapeOne(po: any, pm: Record<number, any>, names: Record<number, string>) {
  const got = liveReceived(po, pm);
  const items = po.items.map((i: any) => {
    const qty = num(i.qty);
    const rec = round3(got[i.id] || 0);
    return {
      id: i.id,
      productId: i.productId,
      name: i.name,
      qty,
      rate: num(i.rate),
      gstRate: num(i.gstRate),
      gstAmount: num(i.gstAmount),
      amount: num(i.amount),
      received: rec,
      remaining: Math.max(0, round3(qty - rec)),
    };
  });
  const totalReceived = items.reduce((n: number, i: any) => n + i.received, 0);
  const allDone = items.every((i: any) => i.remaining <= 0.0005);
  const status = po.state !== 'OPEN' ? po.state : totalReceived <= 0.0005 ? 'ORDERED' : allDone ? 'RECEIVED' : 'PARTIAL';
  const linked: { id: number; purchaseNo: string }[] = [];
  for (const r of po.receipts) {
    const p = pm[r.purchaseId];
    if (p && !p.isVoid && !linked.some((x) => x.id === p.id)) linked.push({ id: p.id, purchaseNo: p.purchaseNo });
  }
  return {
    id: po.id,
    poNo: po.poNo,
    supplier: po.supplier,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate,
    subtotal: num(po.subtotal),
    gstAmount: num(po.gstAmount),
    total: num(po.total),
    note: po.note,
    state: po.state,
    status,
    stateReason: po.stateReason,
    createdByName: po.createdById != null ? names[po.createdById] || null : null,
    stateByName: po.stateById != null ? names[po.stateById] || null : null,
    createdAt: po.createdAt,
    items,
    purchases: linked,
  };
}
async function shapeMany(pos: any[]) {
  const pids: number[] = [];
  const uids: (number | null | undefined)[] = [];
  for (const po of pos) {
    uids.push(po.createdById, po.stateById);
    for (const r of po.receipts) if (!pids.includes(r.purchaseId)) pids.push(r.purchaseId);
  }
  const purchases = pids.length
    ? await prisma.purchase.findMany({ where: { id: { in: pids } }, select: { id: true, isVoid: true, purchaseNo: true } })
    : [];
  const pm: Record<number, any> = {};
  for (const p of purchases) pm[p.id] = p;
  const names = await userMap(uids);
  return pos.map((po) => shapeOne(po, pm, names));
}
const itemSchema = z.object({
  productId: z.number().int(),
  qty: z.number().positive().max(1000000),
  rate: z.number().nonnegative().max(10000000),
  gstRate: z.number().min(0).max(28).optional(),
});
const baseSchema = z.object({
  supplierId: z.number().int(),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.coerce.date().nullable().optional(),
  items: z.array(itemSchema).min(1).max(100),
  note: z.string().optional(),
});
async function buildLines(tx: any, items: z.infer<typeof itemSchema>[]) {
  const seen: number[] = [];
  const lines: { productId: number; name: string; qty: number; rate: number; gstRate: number; gstAmount: number; amount: number }[] = [];
  for (const it of items) {
    if (seen.includes(it.productId)) throw new PoError('The same product is added twice. Change its quantity instead.');
    seen.push(it.productId);
    const prod = await tx.product.findUnique({ where: { id: it.productId } });
    if (!prod || !prod.isActive) throw new PoError('A selected product is not available');
    if ((prod.unit === 'piece' || prod.unit === 'kit') && !Number.isInteger(it.qty)) {
      throw new PoError('Quantity of ' + prod.name + ' must be a whole number');
    }
    const gstRate = it.gstRate ?? 0;
    const amount = round2(it.qty * it.rate);
    const gstAmount = round2((amount * gstRate) / 100);
    lines.push({ productId: prod.id, name: prod.name, qty: it.qty, rate: it.rate, gstRate, gstAmount, amount });
  }
  const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
  const gstAmount = round2(lines.reduce((n, l) => n + l.gstAmount, 0));
  return { lines, subtotal, gstAmount, total: round2(subtotal + gstAmount) };
}
function checkDates(orderDate: Date, expectedDate: Date | null | undefined) {
  if (orderDate.getTime() > Date.now() + DAY) throw new PoError('Order date cannot be in the future');
  if (expectedDate && expectedDate.getTime() < orderDate.getTime() - DAY / 2) {
    throw new PoError('Expected date cannot be before the order date');
  }
}
router.get('/', async (req, res) => {
  const where: any = {};
  if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
  if (req.query.from && req.query.to) {
    where.orderDate = { gte: new Date(String(req.query.from)), lt: new Date(String(req.query.to)) };
  }
  const q = String(req.query.q || '').trim();
  if (q) {
    where.OR = [
      { poNo: { contains: q, mode: 'insensitive' } },
      { supplier: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const rows = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [{ orderDate: 'desc' }, { id: 'desc' }],
    take: 300,
    include,
  });
  res.json(await shapeMany(rows));
});
router.get('/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!po) return res.status(404).json({ message: 'Order not found' });
  const [shaped] = await shapeMany([po]);
  res.json(shaped);
});
router.post('/', async (req, res) => {
  const p = baseSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d = p.data;
  const me = (req as any).user;
  const orderDate = d.orderDate ?? new Date();
  try {
    checkDates(orderDate, d.expectedDate);
    const created = await prisma.$transaction(
      async (tx) => {
        const sup: any = await tx.supplier.findUnique({ where: { id: d.supplierId } });
        if (!sup || !sup.isActive || sup.isDeleted) throw new PoError('Supplier not found or inactive');
        const b = await buildLines(tx, d.items);
        const key = 'PO-' + fyKey(new Date());
        const c = await tx.invoiceCounter.upsert({
          where: { key },
          update: { lastNo: { increment: 1 } },
          create: { key, lastNo: 1 },
        });
        const poNo = 'PO/' + key.slice(3) + '/' + String(c.lastNo).padStart(4, '0');
        return tx.purchaseOrder.create({
          data: {
            poNo,
            supplierId: d.supplierId,
            orderDate,
            expectedDate: d.expectedDate ?? null,
            subtotal: b.subtotal,
            gstAmount: b.gstAmount,
            total: b.total,
            note: clean(d.note),
            branchId: me.branchId,
            createdById: me.id,
            items: { create: b.lines },
          },
          include,
        });
      },
      { maxWait: 5000, timeout: 20000 }
    );
    await prisma.auditLog.create({ data: { userId: me.id, action: 'CREATE_PURCHASE_ORDER', entity: 'PurchaseOrder', entityId: String(created.id) } });
    const [shaped] = await shapeMany([created]);
    res.status(201).json(shaped);
  } catch (e) {
    return fail(res, e);
  }
});
router.put('/:id', async (req, res) => {
  const p = baseSchema.omit({ supplierId: true }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d = p.data;
  const id = Number(req.params.id);
  const me = (req as any).user;
  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const po: any = await tx.purchaseOrder.findUnique({ where: { id }, include: { receipts: true } });
        if (!po) throw new PoError('Order not found', 404);
        if (po.state !== 'OPEN') throw new PoError('This order is ' + po.state.toLowerCase() + ' and cannot be edited');
        if (po.receipts.length > 0) throw new PoError('Goods were already received against this order, so it cannot be edited');
        const orderDate = d.orderDate ?? po.orderDate;
        checkDates(orderDate, d.expectedDate === undefined ? po.expectedDate : d.expectedDate);
        const b = await buildLines(tx, d.items);
        return tx.purchaseOrder.update({
          where: { id },
          data: {
            orderDate,
            expectedDate: d.expectedDate === undefined ? po.expectedDate : d.expectedDate,
            subtotal: b.subtotal,
            gstAmount: b.gstAmount,
            total: b.total,
            note: clean(d.note),
            items: { deleteMany: {}, create: b.lines },
          },
          include,
        });
      },
      { maxWait: 5000, timeout: 20000 }
    );
    await prisma.auditLog.create({ data: { userId: me.id, action: 'UPDATE_PURCHASE_ORDER', entity: 'PurchaseOrder', entityId: String(id) } });
    const [shaped] = await shapeMany([updated]);
    res.json(shaped);
  } catch (e) {
    return fail(res, e);
  }
});
async function changeState(req: any, res: any, mode: 'CANCELLED' | 'CLOSED') {
  const p = z.object({ reason: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Enter a reason (at least 3 letters)' });
  const id = Number(req.params.id);
  const me = req.user;
  try {
    await prisma.$transaction(async (tx) => {
      const po: any = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true, receipts: true } });
      if (!po) throw new PoError('Order not found', 404);
      if (po.state !== 'OPEN') throw new PoError('This order is already ' + po.state.toLowerCase());
      const pids: number[] = [];
      for (const r of po.receipts) if (!pids.includes(r.purchaseId)) pids.push(r.purchaseId);
      const purchases = pids.length ? await tx.purchase.findMany({ where: { id: { in: pids } }, select: { id: true, isVoid: true } }) : [];
      const pm: Record<number, any> = {};
      for (const x of purchases) pm[x.id] = x;
      const got = liveReceived(po, pm);
      const receivedAny = Object.keys(got).some((k) => got[Number(k)] > 0.0005);
      const allDone = po.items.every((i: any) => num(i.qty) - (got[i.id] || 0) <= 0.0005);
      if (mode === 'CANCELLED' && receivedAny) {
        throw new PoError('Goods were already received against this order. Use Close order instead.');
      }
      if (mode === 'CLOSED' && !receivedAny) throw new PoError('Nothing was received yet. Use Cancel order instead.');
      if (mode === 'CLOSED' && allDone) throw new PoError('This order is fully received, so there is nothing to close');
      await tx.purchaseOrder.update({
        where: { id },
        data: { state: mode, stateReason: p.data.reason.trim(), stateAt: new Date(), stateById: me.id },
      });
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: mode === 'CANCELLED' ? 'CANCEL_PURCHASE_ORDER' : 'CLOSE_PURCHASE_ORDER', entity: 'PurchaseOrder', entityId: String(id) },
    });
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include });
    const [shaped] = await shapeMany([po]);
    res.json(shaped);
  } catch (e) {
    return fail(res, e);
  }
}
router.post('/:id/cancel', (req, res) => changeState(req, res, 'CANCELLED'));
router.post('/:id/close', (req, res) => changeState(req, res, 'CLOSED'));
const receiveSchema = z.object({
  billNo: z.string().optional(),
  billDate: z.coerce.date().optional(),
  lines: z
    .array(
      z.object({
        poItemId: z.number().int(),
        qty: z.number().positive().max(1000000),
        rate: z.number().nonnegative().max(10000000),
        gstRate: z.number().min(0).max(28).optional(),
      })
    )
    .min(1)
    .max(100),
  payments: z
    .array(z.object({ mode: z.enum(['CASH', 'UPI', 'CARD', 'BANK']), amount: z.number().positive(), reference: z.string().optional() }))
    .optional(),
  note: z.string().optional(),
  updateCost: z.boolean().optional(),
});
router.post('/:id/receive', async (req, res) => {
  const p = receiveSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const d = p.data;
  const id = Number(req.params.id);
  const me = (req as any).user;
  const payments = d.payments ?? [];
  const billDate = d.billDate ?? new Date();
  if (billDate.getTime() > Date.now() + DAY) return res.status(400).json({ message: 'Bill date cannot be in the future' });
  try {
    const out = await prisma.$transaction(
      async (tx) => {
        const po: any = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true, receipts: true, supplier: true } });
        if (!po) throw new PoError('Order not found', 404);
        if (po.state !== 'OPEN') throw new PoError('This order is ' + po.state.toLowerCase() + ', so goods cannot be received against it');
        const sup = po.supplier;
        if (!sup || !sup.isActive || sup.isDeleted) throw new PoError('The supplier is inactive or deleted');
        const pids: number[] = [];
        for (const r of po.receipts) if (!pids.includes(r.purchaseId)) pids.push(r.purchaseId);
        const old = pids.length ? await tx.purchase.findMany({ where: { id: { in: pids } }, select: { id: true, isVoid: true } }) : [];
        const pm: Record<number, any> = {};
        for (const x of old) pm[x.id] = x;
        const got = liveReceived(po, pm);
        const seen: number[] = [];
        const lines: { poItemId: number; productId: number; name: string; qty: number; rate: number; gstRate: number; gstAmount: number; amount: number }[] = [];
        for (const ln of d.lines) {
          if (seen.includes(ln.poItemId)) throw new PoError('The same item was added twice');
          seen.push(ln.poItemId);
          const it = po.items.find((x: any) => x.id === ln.poItemId);
          if (!it) throw new PoError('An item does not belong to this order');
          const remaining = round3(num(it.qty) - (got[it.id] || 0));
          if (ln.qty > remaining + 0.0005) {
            throw new PoError('You can receive at most ' + remaining + ' of ' + it.name + ' against this order');
          }
          const prod = await tx.product.findUnique({ where: { id: it.productId } });
          if (!prod || !prod.isActive) throw new PoError(it.name + ' is no longer available');
          if ((prod.unit === 'piece' || prod.unit === 'kit') && !Number.isInteger(ln.qty)) {
            throw new PoError('Quantity of ' + it.name + ' must be a whole number');
          }
          const gstRate = ln.gstRate ?? num(it.gstRate);
          const amount = round2(ln.qty * ln.rate);
          const gstAmount = round2((amount * gstRate) / 100);
          lines.push({ poItemId: it.id, productId: it.productId, name: it.name, qty: ln.qty, rate: ln.rate, gstRate, gstAmount, amount });
        }
        const billNo = clean(d.billNo);
        if (billNo) {
          const dup = await tx.purchase.findFirst({
            where: { supplierId: po.supplierId, isVoid: false, billNo: { equals: billNo, mode: 'insensitive' } },
          });
          if (dup) throw new PoError('Bill no ' + billNo + ' is already entered for this supplier (' + dup.purchaseNo + ')', 409);
        }
        const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
        const gstAmount = round2(lines.reduce((n, l) => n + l.gstAmount, 0));
        const total = round2(subtotal + gstAmount);
        const paid = round2(payments.reduce((n, x) => n + x.amount, 0));
        if (paid > total + 0.001) throw new PoError('Payment is more than the total of the goods received');
        const key = 'PUR-' + fyKey(new Date());
        const c = await tx.invoiceCounter.upsert({
          where: { key },
          update: { lastNo: { increment: 1 } },
          create: { key, lastNo: 1 },
        });
        const purchaseNo = 'PUR/' + key.slice(4) + '/' + String(c.lastNo).padStart(4, '0');
        const purchase = await tx.purchase.create({
          data: {
            purchaseNo,
            supplierId: po.supplierId,
            billNo,
            billDate,
            subtotal,
            gstAmount,
            total,
            paidAmount: paid,
            note: clean(d.note) || 'Received against order ' + po.poNo,
            branchId: me.branchId,
            createdById: me.id,
            items: {
              create: lines.map((l) => ({
                productId: l.productId, name: l.name, qty: l.qty, rate: l.rate, gstRate: l.gstRate, gstAmount: l.gstAmount, amount: l.amount,
              })),
            },
            payments: {
              create: payments.map((x) => ({
                supplierId: po.supplierId, mode: x.mode, amount: x.amount, reference: clean(x.reference), createdById: me.id,
              })),
            },
          },
        });
        for (const l of lines) {
          await tx.product.update({ where: { id: l.productId }, data: { stockQty: { increment: l.qty } } });
          const after = await tx.product.findUnique({ where: { id: l.productId } });
          await tx.stockMovement.create({
            data: {
              productId: l.productId,
              type: 'IN',
              qty: l.qty,
              balanceAfter: after!.stockQty,
              note: 'Purchase ' + purchaseNo + ' from ' + sup.name + ' (order ' + po.poNo + ')',
              createdById: me.id,
            },
          });
          if (d.updateCost) await tx.product.update({ where: { id: l.productId }, data: { costPrice: l.rate } });
        }
        await tx.purchaseOrderReceipt.createMany({
          data: lines.map((l) => ({ poId: id, poItemId: l.poItemId, purchaseId: purchase.id, qty: l.qty, createdById: me.id })),
        });
        return { purchaseNo, purchaseId: purchase.id };
      },
      { maxWait: 5000, timeout: 30000 }
    );
    await prisma.auditLog.create({ data: { userId: me.id, action: 'RECEIVE_AGAINST_ORDER', entity: 'PurchaseOrder', entityId: String(id) } });
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include });
    const [shaped] = await shapeMany([po]);
    res.status(201).json({ ...out, order: shaped });
  } catch (e) {
    return fail(res, e);
  }
});
export default router;
