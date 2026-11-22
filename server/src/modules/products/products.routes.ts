import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
const canManage = authorize('OWNER', 'ADMIN', 'MANAGER');
const createSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1).optional(),
  category: z.string().optional(),
  unit: z.enum(['piece', 'ml', 'gram', 'kit']).optional(),
  usage: z.enum(['SALE', 'SALON_USE', 'BOTH']).optional(),
  costPrice: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().optional(),
  openingStock: z.number().nonnegative().optional(),
  lowStockLevel: z.number().nonnegative().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
});
const updateSchema = createSchema
  .omit({ openingStock: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
const stockSchema = z.object({
  type: z.enum(['IN', 'OUT', 'DAMAGED', 'USED', 'ADJUST']),
  qty: z.number().nonnegative(),
  note: z.string().optional(),
});
const r3 = (n: number) => Math.round(n * 1000) / 1000;
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.product.findMany({ where, orderBy: { name: 'asc' } });
  res.json(
    rows.map((p) => ({
      ...p,
      isLow: Number(p.lowStockLevel) > 0 && Number(p.stockQty) <= Number(p.lowStockLevel),
    }))
  );
});
router.post('/', canManage, async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  const { openingStock, ...data } = p.data;
  const me = (req as any).user;
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...data, stockQty: openingStock ?? 0, branchId: me.branchId },
      });
      if (openingStock && openingStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: 'IN',
            qty: openingStock,
            balanceAfter: openingStock,
            note: 'Opening stock',
            createdById: me.id,
          },
        });
      }
      return created;
    });
    await prisma.auditLog.create({
      data: { userId: me.id, action: 'CREATE_PRODUCT', entity: 'Product', entityId: String(product.id) },
    });
    res.status(201).json(product);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'This SKU / barcode already exists' });
    throw e;
  }
});
router.put('/:id', canManage, async (req, res) => {
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  try {
    const product = await prisma.product.update({ where: { id: Number(req.params.id) }, data: p.data });
    res.json(product);
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Product not found' });
    if (e.code === 'P2002') return res.status(409).json({ message: 'This SKU / barcode already exists' });
    throw e;
  }
});
router.post('/:id/stock', canManage, async (req, res) => {
  const p = stockSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: 'Invalid data' });
  if (p.data.type !== 'ADJUST' && p.data.qty <= 0) {
    return res.status(400).json({ message: 'Quantity must be more than 0' });
  }
  const id = Number(req.params.id);
  const me = (req as any).user;
  const out = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.findUnique({ where: { id } });
    if (!prod) return { code: 404, message: 'Product not found' };
    const cur = Number(prod.stockQty);
    let change = 0;
    if (p.data.type === 'IN') change = p.data.qty;
    else if (p.data.type === 'ADJUST') change = p.data.qty - cur;
    else change = -p.data.qty;
    const next = r3(cur + change);
    if (next < 0) return { code: 400, message: 'Not enough stock. Available: ' + cur };
    const updated = await tx.product.update({ where: { id }, data: { stockQty: next } });
    await tx.stockMovement.create({
      data: {
        productId: id,
        type: p.data.type,
        qty: r3(change),
        balanceAfter: next,
        note: p.data.note,
        createdById: me.id,
      },
    });
    return { product: updated };
  });
  if ('code' in out) return res.status(out.code as number).json({ message: out.message });
  res.json(out.product);
});
export default router;
