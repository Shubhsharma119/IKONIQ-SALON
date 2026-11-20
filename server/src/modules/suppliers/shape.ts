import { prisma } from '../../utils/prisma';
const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
export async function userMap(ids: (number | null | undefined)[]) {
  const list = Array.from(new Set(ids.filter((x): x is number => typeof x === 'number')));
  const rows = list.length
    ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })
    : [];
  const m: Record<number, string> = {};
  for (const r of rows) m[r.id] = r.name;
  return m;
}
export function purchaseUserIds(p: any): (number | null | undefined)[] {
  const out: (number | null | undefined)[] = [p.createdById, p.voidedById];
  for (const x of p.payments || []) out.push(x.createdById, x.voidedById);
  return out;
}
export function shapePayment(p: any, names: Record<number, string>, purchaseNo: string | null = null) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    purchaseId: p.purchaseId,
    purchaseNo,
    amount: num(p.amount),
    mode: p.mode,
    reference: p.reference,
    note: p.note,
    isVoid: p.isVoid,
    voidReason: p.voidReason,
    voidedAt: p.voidedAt,
    createdAt: p.createdAt,
    createdByName: p.createdById != null ? names[p.createdById] || null : null,
    voidedByName: p.voidedById != null ? names[p.voidedById] || null : null,
  };
}
export function shapePurchase(p: any, names: Record<number, string>) {
  const total = num(p.total);
  const paid = num(p.paidAmount);
  return {
    id: p.id,
    purchaseNo: p.purchaseNo,
    supplierId: p.supplierId,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : undefined,
    billNo: p.billNo,
    billDate: p.billDate,
    subtotal: num(p.subtotal),
    gstAmount: num(p.gstAmount),
    total,
    paidAmount: paid,
    due: p.isVoid ? 0 : round2(total - paid),
    note: p.note,
    isVoid: p.isVoid,
    voidReason: p.voidReason,
    voidedAt: p.voidedAt,
    createdAt: p.createdAt,
    createdByName: p.createdById != null ? names[p.createdById] || null : null,
    voidedByName: p.voidedById != null ? names[p.voidedById] || null : null,
    items: (p.items || []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      qty: num(i.qty),
      rate: num(i.rate),
      gstRate: num(i.gstRate),
      gstAmount: num(i.gstAmount),
      amount: num(i.amount),
    })),
    payments: (p.payments || []).map((x: any) => shapePayment(x, names, p.purchaseNo)),
  };
}
