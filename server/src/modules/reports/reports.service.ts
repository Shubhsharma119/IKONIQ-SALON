import { prisma } from '../../utils/prisma';
export class ReportError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
export type ColType = 'text' | 'int' | 'money' | 'percent' | 'date' | 'datetime' | 'qty';
export type Col = { key: string; label: string; type: ColType };
export type SummaryItem = { label: string; value: number | string; type: 'text' | 'int' | 'money' | 'percent' };
export type Row = Record<string, any>;
export type ReportData = {
  id: string;
  title: string;
  subtitle: string;
  columns: Col[];
  rows: Row[];
  totals: Row | null;
  summary: SummaryItem[];
  chart: { type: 'bar' | 'line'; x: string; ys: { key: string; label: string }[] } | null;
};
export const catalog = [
  { id: 'sales', group: 'Sales', title: 'Sales report', desc: 'Daily, monthly or yearly sales with discounts and GST', range: true, grouping: true },
  { id: 'service-sales', group: 'Sales', title: 'Service-wise sales', desc: 'Revenue and count for every service', range: true, grouping: false },
  { id: 'product-sales', group: 'Sales', title: 'Product-wise sales', desc: 'Products sold with cost and margin', range: true, grouping: false },
  { id: 'package-sales', group: 'Sales', title: 'Packages and memberships sold', desc: 'Package and membership sales', range: true, grouping: false },
  { id: 'staff', group: 'Staff', title: 'Staff performance', desc: 'Revenue and estimated commission per staff member', range: true, grouping: false },
  { id: 'payments', group: 'Finance', title: 'Payment mode report', desc: 'Money received by cash, UPI, card and bank', range: true, grouping: false },
  { id: 'gst', group: 'Finance', title: 'GST report', desc: 'Taxable value, CGST and SGST on GST invoices', range: true, grouping: false },
  { id: 'dues', group: 'Finance', title: 'Pending dues', desc: 'All unpaid and partly paid bills', range: false, grouping: false },
  { id: 'wallet', group: 'Finance', title: 'E-Wallet report', desc: 'Top-ups, bonus, usage and balances', range: true, grouping: false },
  { id: 'profit', group: 'Finance', title: 'Profit and loss (estimate)', desc: 'Net sales, product cost and commission', range: true, grouping: false },
  { id: 'appointments', group: 'Operations', title: 'Appointments report', desc: 'Bookings, walk-ins, completed, cancelled and no-shows', range: true, grouping: false },
  { id: 'customers', group: 'Operations', title: 'Customer report', desc: 'Top customers, visits and new customers', range: true, grouping: false },
  { id: 'stock', group: 'Inventory', title: 'Stock report', desc: 'Current stock with value, low stock and expiry', range: false, grouping: false },
  { id: 'stock-moves', group: 'Inventory', title: 'Stock movements', desc: 'Every stock in, out, sale and adjustment', range: true, grouping: false },
];
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => Number(v) || 0;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtD = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export type Range = { from: Date; to: Date; label: string };
export function parseRange(q: any): Range {
  const today = ymd(new Date());
  const f = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from || '')) ? String(q.from) : today;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(String(q.to || '')) ? String(q.to) : f;
  const from = new Date(f + 'T00:00:00');
  const last = new Date(t + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(last.getTime())) throw new ReportError('Invalid date');
  if (last < from) throw new ReportError('The end date cannot be before the start date');
  const to = new Date(last);
  to.setDate(to.getDate() + 1);
  if ((to.getTime() - from.getTime()) / 86400000 > 1830) throw new ReportError('Choose a period of up to 5 years');
  return { from, to, label: f === t ? fmtD(from) : fmtD(from) + ' to ' + fmtD(last) };
}
const inv = (r: Range) => ({ createdAt: { gte: r.from, lt: r.to }, status: { not: 'CANCELLED' as const } });
function sums(rows: Row[], keys: string[]) {
  const t: Row = {};
  for (const k of keys) t[k] = r2(rows.reduce((s, x) => s + num(x[k]), 0));
  return t;
}
const roleLabel: Record<string, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', MANAGER: 'Manager', RECEPTIONIST: 'Receptionist', STAFF: 'Staff', ACCOUNTANT: 'Accountant',
};
async function sales(r: Range, q: any): Promise<ReportData> {
  const group = ['day', 'month', 'year'].includes(q.group) ? q.group : 'day';
  const list = await prisma.invoice.findMany({
    where: inv(r),
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, subtotal: true, membershipDiscount: true, discountAmount: true, taxableAmount: true, gstAmount: true, total: true, paidAmount: true },
  });
  const map = new Map<string, Row>();
  for (const v of list) {
    const d = v.createdAt;
    const key = group === 'day' ? ymd(d) : group === 'month' ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : String(d.getFullYear());
    const label = group === 'day' ? fmtD(d) : group === 'month' ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : String(d.getFullYear());
    let o = map.get(key);
    if (!o) {
      o = { key, period: label, bills: 0, subtotal: 0, discount: 0, taxable: 0, gst: 0, total: 0, paid: 0 };
      map.set(key, o);
    }
    o.bills += 1;
    o.subtotal += num(v.subtotal);
    o.discount += num(v.membershipDiscount) + num(v.discountAmount);
    o.taxable += num(v.taxableAmount);
    o.gst += num(v.gstAmount);
    o.total += num(v.total);
    o.paid += num(v.paidAmount);
  }
  const rows = Array.from(map.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((o) => ({
      period: o.period, bills: o.bills, subtotal: r2(o.subtotal), discount: r2(o.discount), taxable: r2(o.taxable),
      gst: r2(o.gst), total: r2(o.total), paid: r2(o.paid), due: r2(o.total - o.paid),
    }));
  const t = sums(rows, ['bills', 'subtotal', 'discount', 'taxable', 'gst', 'total', 'paid', 'due']);
  const gname = group === 'day' ? 'Daily' : group === 'month' ? 'Monthly' : 'Yearly';
  return {
    id: 'sales',
    title: gname + ' sales report',
    subtitle: r.label,
    columns: [
      { key: 'period', label: group === 'day' ? 'Date' : group === 'month' ? 'Month' : 'Year', type: 'text' },
      { key: 'bills', label: 'Bills', type: 'int' },
      { key: 'subtotal', label: 'Gross sales', type: 'money' },
      { key: 'discount', label: 'Discounts', type: 'money' },
      { key: 'taxable', label: 'Net sales', type: 'money' },
      { key: 'gst', label: 'GST', type: 'money' },
      { key: 'total', label: 'Bill total', type: 'money' },
      { key: 'paid', label: 'Received on bills', type: 'money' },
      { key: 'due', label: 'Due', type: 'money' },
    ],
    rows,
    totals: { period: 'Total', ...t },
    summary: [
      { label: 'Total sales', value: t.total, type: 'money' },
      { label: 'Bills', value: t.bills, type: 'int' },
      { label: 'Average bill', value: t.bills ? r2(t.total / t.bills) : 0, type: 'money' },
      { label: 'Discounts given', value: t.discount, type: 'money' },
      { label: 'GST collected', value: t.gst, type: 'money' },
      { label: 'Due on these bills', value: t.due, type: 'money' },
    ],
    chart: { type: group === 'day' ? 'line' : 'bar', x: 'period', ys: [{ key: 'total', label: 'Sales' }] },
  };
}
async function serviceSales(r: Range): Promise<ReportData> {
  const items = await prisma.invoiceItem.findMany({
    where: { itemType: { in: ['SERVICE', 'SESSION_USE'] as ('SERVICE' | 'SESSION_USE')[] }, invoice: inv(r) },
    select: { serviceId: true, name: true, itemType: true, qty: true, amount: true },
  });
  const svcs = await prisma.service.findMany({ include: { category: true } });
  const sm = new Map(svcs.map((s) => [s.id, s] as const));
  const agg = new Map<string, Row>();
  for (const it of items) {
    const s = it.serviceId ? sm.get(it.serviceId) : undefined;
    const key = it.serviceId ? 'id' + it.serviceId : 'n' + it.name;
    let o = agg.get(key);
    if (!o) {
      o = { service: s ? s.name : it.name, category: s && s.category ? s.category.name : '-', qty: 0, sessions: 0, revenue: 0 };
      agg.set(key, o);
    }
    if (it.itemType === 'SERVICE') {
      o.qty += num(it.qty);
      o.revenue += num(it.amount);
    } else {
      o.sessions += 1;
    }
  }
  const list = Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue);
  const total = list.reduce((s, x) => s + x.revenue, 0);
  const rows = list.map((o) => ({
    service: o.service, category: o.category, qty: o.qty, sessions: o.sessions, revenue: r2(o.revenue),
    share: total > 0 ? r2((o.revenue / total) * 100) : 0,
  }));
  const t = sums(rows, ['qty', 'sessions', 'revenue']);
  return {
    id: 'service-sales',
    title: 'Service-wise sales',
    subtitle: r.label + ' (amounts before bill-level discounts)',
    columns: [
      { key: 'service', label: 'Service', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'qty', label: 'Sold', type: 'int' },
      { key: 'sessions', label: 'Package sessions used', type: 'int' },
      { key: 'revenue', label: 'Revenue', type: 'money' },
      { key: 'share', label: 'Share', type: 'percent' },
    ],
    rows,
    totals: { service: 'Total', ...t, share: rows.length ? 100 : 0 },
    summary: [
      { label: 'Service revenue', value: t.revenue, type: 'money' },
      { label: 'Services sold', value: t.qty, type: 'int' },
      { label: 'Package sessions used', value: t.sessions, type: 'int' },
      { label: 'Top service', value: rows.length ? rows[0].service : '-', type: 'text' },
    ],
    chart: { type: 'bar', x: 'service', ys: [{ key: 'revenue', label: 'Revenue' }] },
  };
}
async function productSales(r: Range): Promise<ReportData> {
  const items = await prisma.invoiceItem.findMany({
    where: { itemType: 'PRODUCT', invoice: inv(r) },
    select: { productId: true, name: true, qty: true, amount: true },
  });
  const prods = await prisma.product.findMany();
  const pm = new Map(prods.map((p) => [p.id, p] as const));
  const agg = new Map<string, Row>();
  for (const it of items) {
    const p = it.productId ? pm.get(it.productId) : undefined;
    const key = it.productId ? 'id' + it.productId : 'n' + it.name;
    let o = agg.get(key);
    if (!o) {
      o = { product: p ? p.name : it.name, category: p && p.category ? p.category : '-', unit: p ? p.unit : '', qty: 0, revenue: 0, cost: 0 };
      agg.set(key, o);
    }
    o.qty += num(it.qty);
    o.revenue += num(it.amount);
    o.cost += p ? num(p.costPrice) * num(it.qty) : 0;
  }
  const rows = Array.from(agg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((o) => ({
      product: o.product, category: o.category, unit: o.unit, qty: r2(o.qty), revenue: r2(o.revenue), cost: r2(o.cost),
      margin: r2(o.revenue - o.cost), marginPct: o.revenue > 0 ? r2(((o.revenue - o.cost) / o.revenue) * 100) : 0,
    }));
  const t = sums(rows, ['qty', 'revenue', 'cost', 'margin']);
  return {
    id: 'product-sales',
    title: 'Product-wise sales',
    subtitle: r.label + ' (cost uses the current cost price)',
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'qty', label: 'Quantity sold', type: 'qty' },
      { key: 'revenue', label: 'Revenue', type: 'money' },
      { key: 'cost', label: 'Cost', type: 'money' },
      { key: 'margin', label: 'Margin', type: 'money' },
      { key: 'marginPct', label: 'Margin %', type: 'percent' },
    ],
    rows,
    totals: { product: 'Total', ...t, marginPct: t.revenue > 0 ? r2((t.margin / t.revenue) * 100) : 0 },
    summary: [
      { label: 'Product revenue', value: t.revenue, type: 'money' },
      { label: 'Product cost', value: t.cost, type: 'money' },
      { label: 'Gross margin', value: t.margin, type: 'money' },
      { label: 'Products sold', value: rows.length, type: 'int' },
    ],
    chart: { type: 'bar', x: 'product', ys: [{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Margin' }] },
  };
}
async function packageSales(r: Range): Promise<ReportData> {
  const items = await prisma.invoiceItem.findMany({
    where: { itemType: { in: ['PACKAGE', 'MEMBERSHIP'] as ('PACKAGE' | 'MEMBERSHIP')[] }, invoice: inv(r) },
    select: { itemType: true, name: true, qty: true, amount: true },
  });
  const agg = new Map<string, Row>();
  for (const it of items) {
    const key = it.itemType + '|' + it.name;
    let o = agg.get(key);
    if (!o) {
      o = { type: it.itemType === 'PACKAGE' ? 'Package' : 'Membership', name: it.name, sold: 0, revenue: 0 };
      agg.set(key, o);
    }
    o.sold += num(it.qty);
    o.revenue += num(it.amount);
  }
  const rows = Array.from(agg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((o) => ({ type: o.type, name: o.name, sold: o.sold, revenue: r2(o.revenue) }));
  const t = sums(rows, ['sold', 'revenue']);
  return {
    id: 'package-sales',
    title: 'Packages and memberships sold',
    subtitle: r.label,
    columns: [
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'sold', label: 'Sold', type: 'int' },
      { key: 'revenue', label: 'Revenue', type: 'money' },
    ],
    rows,
    totals: { type: 'Total', name: '', ...t },
    summary: [
      { label: 'Revenue', value: t.revenue, type: 'money' },
      { label: 'Packages sold', value: rows.filter((x) => x.type === 'Package').reduce((s, x) => s + x.sold, 0), type: 'int' },
      { label: 'Memberships sold', value: rows.filter((x) => x.type === 'Membership').reduce((s, x) => s + x.sold, 0), type: 'int' },
    ],
    chart: { type: 'bar', x: 'name', ys: [{ key: 'revenue', label: 'Revenue' }] },
  };
}
async function staffReport(r: Range): Promise<ReportData> {
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: inv(r) },
    select: { itemType: true, staffId: true, qty: true, amount: true },
  });
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, staffProfile: { select: { commissionPercent: true } } },
  });
  const um = new Map(users.map((u) => [u.id, u] as const));
  const agg = new Map<number, Row>();
  for (const it of items) {
    if (it.itemType === 'MEMBERSHIP') continue;
    const sid = it.staffId ?? 0;
    let o = agg.get(sid);
    if (!o) {
      o = { sid, services: 0, serviceRev: 0, productRev: 0, packageRev: 0, otherRev: 0 };
      agg.set(sid, o);
    }
    if (it.itemType === 'SERVICE') {
      o.services += num(it.qty);
      o.serviceRev += num(it.amount);
    } else if (it.itemType === 'SESSION_USE') {
      o.services += num(it.qty);
    } else if (it.itemType === 'PRODUCT') {
      o.productRev += num(it.amount);
    } else if (it.itemType === 'PACKAGE') {
      o.packageRev += num(it.amount);
    } else {
      o.otherRev += num(it.amount);
    }
  }
  const rows = Array.from(agg.values())
    .map((o) => {
      const u = o.sid ? um.get(o.sid) : undefined;
      const pct = u && u.staffProfile ? num(u.staffProfile.commissionPercent) : 0;
      const totalRev = o.serviceRev + o.productRev + o.packageRev + o.otherRev;
      return {
        staff: u ? u.name : 'Unassigned', role: u ? roleLabel[u.role] || u.role : '-', services: o.services,
        serviceRev: r2(o.serviceRev), productRev: r2(o.productRev), packageRev: r2(o.packageRev), totalRev: r2(totalRev),
        pct, commission: u ? r2((o.serviceRev * pct) / 100) : 0,
      };
    })
    .sort((a, b) => b.totalRev - a.totalRev);
  const t = sums(rows, ['services', 'serviceRev', 'productRev', 'packageRev', 'totalRev', 'commission']);
  return {
    id: 'staff',
    title: 'Staff performance and commission',
    subtitle: r.label + ' (commission = service revenue x staff commission %, before bill-level discounts)',
    columns: [
      { key: 'staff', label: 'Staff', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'services', label: 'Services done', type: 'int' },
      { key: 'serviceRev', label: 'Service revenue', type: 'money' },
      { key: 'productRev', label: 'Product sales', type: 'money' },
      { key: 'packageRev', label: 'Package sales', type: 'money' },
      { key: 'totalRev', label: 'Total billed', type: 'money' },
      { key: 'pct', label: 'Commission %', type: 'percent' },
      { key: 'commission', label: 'Commission (estimate)', type: 'money' },
    ],
    rows,
    totals: { staff: 'Total', role: '', ...t, pct: null },
    summary: [
      { label: 'Total billed by staff', value: t.totalRev, type: 'money' },
      { label: 'Services done', value: t.services, type: 'int' },
      { label: 'Estimated commission', value: t.commission, type: 'money' },
      { label: 'Top performer', value: rows.length ? rows[0].staff : '-', type: 'text' },
    ],
    chart: { type: 'bar', x: 'staff', ys: [{ key: 'totalRev', label: 'Total billed' }] },
  };
}
async function payments(r: Range): Promise<ReportData> {
  const bill = await prisma.payment.groupBy({
    by: ['mode'],
    where: { createdAt: { gte: r.from, lt: r.to }, invoice: { status: { not: 'CANCELLED' as const } } },
    _sum: { amount: true },
    _count: true,
  });
  const topup = await prisma.walletTransaction.groupBy({
    by: ['mode'],
    where: { type: 'TOPUP', createdAt: { gte: r.from, lt: r.to } },
    _sum: { amount: true },
    _count: true,
  });
  const labels: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer', WALLET: 'E-Wallet (spent from balance)' };
  const rows = ['CASH', 'UPI', 'CARD', 'BANK', 'WALLET'].map((m) => {
    const b = bill.find((x) => x.mode === m);
    const tp = topup.find((x) => x.mode === m);
    const billAmount = b ? num(b._sum.amount) : 0;
    const topupAmount = tp ? num(tp._sum.amount) : 0;
    return {
      mode: labels[m], billCount: b ? b._count : 0, billAmount: r2(billAmount),
      topupCount: tp ? tp._count : 0, topupAmount: r2(topupAmount),
      received: m === 'WALLET' ? 0 : r2(billAmount + topupAmount),
    };
  });
  const t = sums(rows, ['billCount', 'billAmount', 'topupCount', 'topupAmount', 'received']);
  const get = (name: string) => rows.find((x) => x.mode === name)?.received ?? 0;
  return {
    id: 'payments',
    title: 'Payment mode report',
    subtitle: r.label + ' (E-Wallet spending is not new money, so it is not counted as received)',
    columns: [
      { key: 'mode', label: 'Payment mode', type: 'text' },
      { key: 'billCount', label: 'Bill payments', type: 'int' },
      { key: 'billAmount', label: 'Bill payment amount', type: 'money' },
      { key: 'topupCount', label: 'Wallet top-ups', type: 'int' },
      { key: 'topupAmount', label: 'Wallet top-up amount', type: 'money' },
      { key: 'received', label: 'Total received', type: 'money' },
    ],
    rows,
    totals: { mode: 'Total', ...t },
    summary: [
      { label: 'Total money received', value: t.received, type: 'money' },
      { label: 'Cash', value: get('Cash'), type: 'money' },
      { label: 'UPI', value: get('UPI'), type: 'money' },
      { label: 'Card', value: get('Card'), type: 'money' },
      { label: 'Bank transfer', value: get('Bank transfer'), type: 'money' },
    ],
    chart: { type: 'bar', x: 'mode', ys: [{ key: 'received', label: 'Received' }] },
  };
}
async function gst(r: Range): Promise<ReportData> {
  const list = await prisma.invoice.findMany({
    where: { ...inv(r), isGst: true },
    orderBy: { createdAt: 'asc' },
    include: { customer: { select: { name: true } } },
  });
  const rows = list.map((v) => ({
    date: v.createdAt, invoiceNo: v.invoiceNo, customer: v.customer ? v.customer.name : v.guestName || 'Walk-in guest',
    taxable: r2(num(v.taxableAmount)), rate: num(v.gstRate), cgst: r2(num(v.gstAmount) / 2), sgst: r2(num(v.gstAmount) / 2),
    gst: r2(num(v.gstAmount)), total: r2(num(v.total)),
  }));
  const t = sums(rows, ['taxable', 'cgst', 'sgst', 'gst', 'total']);
  return {
    id: 'gst',
    title: 'GST report',
    subtitle: r.label + ' (GST invoices only)',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoiceNo', label: 'Invoice no', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'taxable', label: 'Taxable value', type: 'money' },
      { key: 'rate', label: 'GST rate', type: 'percent' },
      { key: 'cgst', label: 'CGST', type: 'money' },
      { key: 'sgst', label: 'SGST', type: 'money' },
      { key: 'gst', label: 'Total GST', type: 'money' },
      { key: 'total', label: 'Invoice total', type: 'money' },
    ],
    rows,
    totals: { date: null, invoiceNo: 'Total', customer: '', ...t, rate: null },
    summary: [
      { label: 'GST invoices', value: rows.length, type: 'int' },
      { label: 'Taxable value', value: t.taxable, type: 'money' },
      { label: 'CGST', value: t.cgst, type: 'money' },
      { label: 'SGST', value: t.sgst, type: 'money' },
      { label: 'Total GST', value: t.gst, type: 'money' },
    ],
    chart: null,
  };
}
async function dues(): Promise<ReportData> {
  const list = await prisma.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] as ('UNPAID' | 'PARTIAL')[] } },
    orderBy: { createdAt: 'asc' },
    include: { customer: { select: { name: true, phone: true } } },
  });
  const now = Date.now();
  const rows = list.map((v) => ({
    date: v.createdAt, invoiceNo: v.invoiceNo, customer: v.customer ? v.customer.name : v.guestName || 'Walk-in guest',
    phone: v.customer ? v.customer.phone : '-', total: r2(num(v.total)), paid: r2(num(v.paidAmount)),
    due: r2(num(v.total) - num(v.paidAmount)), age: Math.floor((now - v.createdAt.getTime()) / 86400000),
  }));
  const t = sums(rows, ['total', 'paid', 'due']);
  return {
    id: 'dues',
    title: 'Pending dues',
    subtitle: 'All unpaid and partly paid bills, as on ' + fmtD(new Date()),
    columns: [
      { key: 'date', label: 'Bill date', type: 'date' },
      { key: 'invoiceNo', label: 'Invoice no', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Mobile', type: 'text' },
      { key: 'total', label: 'Bill total', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'due', label: 'Due', type: 'money' },
      { key: 'age', label: 'Days pending', type: 'int' },
    ],
    rows,
    totals: { date: null, invoiceNo: 'Total', customer: '', phone: '', ...t, age: null },
    summary: [
      { label: 'Total due', value: t.due, type: 'money' },
      { label: 'Bills pending', value: rows.length, type: 'int' },
      { label: 'Oldest due (days)', value: rows.length ? rows[0].age : 0, type: 'int' },
    ],
    chart: null,
  };
}
async function walletReport(r: Range): Promise<ReportData> {
  const tx = await prisma.walletTransaction.findMany({
    where: { createdAt: { gte: r.from, lt: r.to } },
    select: { customerId: true, type: true, amount: true, paidAmount: true, bonusAmount: true },
  });
  const agg = new Map<number, Row>();
  for (const x of tx) {
    let o = agg.get(x.customerId);
    if (!o) {
      o = { added: 0, bonus: 0, used: 0, adjust: 0 };
      agg.set(x.customerId, o);
    }
    const a = num(x.amount);
    if (x.type === 'TOPUP') {
      o.added += num(x.paidAmount);
      o.bonus += num(x.bonusAmount);
    } else if (x.type === 'PAYMENT') o.used += -a;
    else o.adjust += a;
  }
  const custs = await prisma.customer.findMany({
    where: { id: { in: Array.from(agg.keys()) } },
    select: { id: true, name: true, phone: true, walletBalance: true },
  });
  const cm = new Map(custs.map((c) => [c.id, c] as const));
  const rows = Array.from(agg.entries())
    .map(([id, o]) => {
      const c = cm.get(id);
      return {
        customer: c ? c.name : 'Customer ' + id, phone: c ? c.phone : '-', added: r2(o.added), bonus: r2(o.bonus),
        used: r2(o.used), adjust: r2(o.adjust), balance: c ? r2(num(c.walletBalance)) : 0,
      };
    })
    .sort((a, b) => b.added - a.added);
  const t = sums(rows, ['added', 'bonus', 'used', 'adjust']);
  const all = await prisma.customer.aggregate({ _sum: { walletBalance: true } });
  return {
    id: 'wallet',
    title: 'E-Wallet report',
    subtitle: r.label + ' (balance is the current balance)',
    columns: [
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Mobile', type: 'text' },
      { key: 'added', label: 'Money added', type: 'money' },
      { key: 'bonus', label: 'Bonus given', type: 'money' },
      { key: 'used', label: 'Used in bills', type: 'money' },
      { key: 'adjust', label: 'Adjustments', type: 'money' },
      { key: 'balance', label: 'Current balance', type: 'money' },
    ],
    rows,
    totals: { customer: 'Total', phone: '', ...t, balance: r2(rows.reduce((s, x) => s + x.balance, 0)) },
    summary: [
      { label: 'Money added', value: t.added, type: 'money' },
      { label: 'Bonus given', value: t.bonus, type: 'money' },
      { label: 'Used in bills', value: t.used, type: 'money' },
      { label: 'Total wallet balance (all customers)', value: r2(num(all._sum.walletBalance)), type: 'money' },
    ],
    chart: null,
  };
}
async function profit(r: Range): Promise<ReportData> {
  const invs = await prisma.invoice.findMany({
    where: inv(r),
    select: { subtotal: true, membershipDiscount: true, discountAmount: true, taxableAmount: true, gstAmount: true },
  });
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: inv(r), itemType: { in: ['PRODUCT', 'SERVICE'] as ('PRODUCT' | 'SERVICE')[] } },
    select: { itemType: true, productId: true, staffId: true, qty: true, amount: true },
  });
  const prods = await prisma.product.findMany({ select: { id: true, costPrice: true } });
  const pm = new Map(prods.map((p) => [p.id, num(p.costPrice)] as const));
  const users = await prisma.user.findMany({ select: { id: true, staffProfile: { select: { commissionPercent: true } } } });
  const um = new Map(users.map((u) => [u.id, u.staffProfile ? num(u.staffProfile.commissionPercent) : 0] as const));
  const sub = invs.reduce((s, v) => s + num(v.subtotal), 0);
  const disc = invs.reduce((s, v) => s + num(v.membershipDiscount) + num(v.discountAmount), 0);
  const net = invs.reduce((s, v) => s + num(v.taxableAmount), 0);
  const gstAmt = invs.reduce((s, v) => s + num(v.gstAmount), 0);
  let cost = 0;
  let comm = 0;
  for (const it of items) {
    if (it.itemType === 'PRODUCT' && it.productId) cost += (pm.get(it.productId) || 0) * num(it.qty);
    if (it.itemType === 'SERVICE' && it.staffId) comm += (num(it.amount) * (um.get(it.staffId) || 0)) / 100;
  }
  const gross = net - cost;
  const prof = gross - comm;
  const rows: Row[] = [
    { line: 'Sales (before discounts)', amount: r2(sub) },
    { line: 'Less: discounts (membership and manual)', amount: -r2(disc) },
    { line: 'Net sales (excluding GST)', amount: r2(net), _bold: true },
    { line: 'Less: cost of products sold', amount: -r2(cost) },
    { line: 'Gross profit', amount: r2(gross), _bold: true },
    { line: 'Less: staff commission (estimated)', amount: -r2(comm) },
    { line: 'Profit before other expenses', amount: r2(prof), _bold: true },
    { line: 'Memo: GST collected (owed to the government, not income)', amount: r2(gstAmt) },
    { line: 'Rent, salaries, electricity and other expenses are not included yet. They will be added with the Expenses module.', amount: null },
  ];
  return {
    id: 'profit',
    title: 'Profit and loss (estimate)',
    subtitle: r.label,
    columns: [
      { key: 'line', label: 'Particulars', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
    ],
    rows,
    totals: null,
    summary: [
      { label: 'Net sales', value: r2(net), type: 'money' },
      { label: 'Gross profit', value: r2(gross), type: 'money' },
      { label: 'Profit before other expenses', value: r2(prof), type: 'money' },
      { label: 'Margin', value: net > 0 ? r2((prof / net) * 100) : 0, type: 'percent' },
    ],
    chart: null,
  };
}
const statusLabel: Record<string, string> = {
  SCHEDULED: 'Scheduled', CHECKED_IN: 'Waiting', IN_PROGRESS: 'In service', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No show',
};
async function appointmentsReport(r: Range): Promise<ReportData> {
  const list = await prisma.appointment.findMany({
    where: { startAt: { gte: r.from, lt: r.to } },
    orderBy: { startAt: 'asc' },
    take: 5000,
    include: {
      customer: { select: { name: true, phone: true } },
      staff: { select: { name: true } },
      services: { include: { service: { select: { name: true } } } },
    },
  });
  const rows = list.map((a) => ({
    start: a.startAt, customer: a.customer.name, phone: a.customer.phone, staff: a.staff ? a.staff.name : 'Unassigned',
    services: a.services.map((s) => s.service.name).join(', '), type: a.isWalkIn ? 'Walk-in' : 'Booked',
    status: statusLabel[a.status] || a.status,
  }));
  const count = (s: string) => list.filter((a) => a.status === s).length;
  const total = list.length;
  const done = count('COMPLETED');
  const noShow = count('NO_SHOW');
  const cancelled = count('CANCELLED');
  return {
    id: 'appointments',
    title: 'Appointments report',
    subtitle: r.label,
    columns: [
      { key: 'start', label: 'Date and time', type: 'datetime' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Mobile', type: 'text' },
      { key: 'staff', label: 'Staff', type: 'text' },
      { key: 'services', label: 'Services', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
    rows,
    totals: null,
    summary: [
      { label: 'Total appointments', value: total, type: 'int' },
      { label: 'Completed', value: done, type: 'int' },
      { label: 'Cancelled', value: cancelled, type: 'int' },
      { label: 'No-show', value: noShow, type: 'int' },
      { label: 'Walk-ins', value: list.filter((a) => a.isWalkIn).length, type: 'int' },
      { label: 'Completion rate', value: total ? r2((done / total) * 100) : 0, type: 'percent' },
      { label: 'No-show rate', value: total ? r2((noShow / total) * 100) : 0, type: 'percent' },
    ],
    chart: null,
  };
}
async function customersReport(r: Range): Promise<ReportData> {
  const list = await prisma.invoice.findMany({
    where: inv(r),
    select: { customerId: true, total: true, paidAmount: true, createdAt: true },
  });
  const agg = new Map<number, Row>();
  let guestBills = 0;
  for (const v of list) {
    if (!v.customerId) {
      guestBills += 1;
      continue;
    }
    let o = agg.get(v.customerId);
    if (!o) {
      o = { visits: 0, billed: 0, paid: 0, last: v.createdAt };
      agg.set(v.customerId, o);
    }
    o.visits += 1;
    o.billed += num(v.total);
    o.paid += num(v.paidAmount);
    if (v.createdAt > o.last) o.last = v.createdAt;
  }
  const custs = await prisma.customer.findMany({
    where: { id: { in: Array.from(agg.keys()) } },
    select: { id: true, name: true, phone: true, walletBalance: true },
  });
  const cm = new Map(custs.map((c) => [c.id, c] as const));
  const rows = Array.from(agg.entries())
    .map(([id, o]) => {
      const c = cm.get(id);
      return {
        customer: c ? c.name : 'Customer ' + id, phone: c ? c.phone : '-', visits: o.visits, billed: r2(o.billed),
        paid: r2(o.paid), due: r2(o.billed - o.paid), wallet: c ? r2(num(c.walletBalance)) : 0, last: o.last,
      };
    })
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 300);
  const newCount = await prisma.customer.count({ where: { createdAt: { gte: r.from, lt: r.to } } });
  const t = sums(rows, ['visits', 'billed', 'paid', 'due']);
  return {
    id: 'customers',
    title: 'Customer report',
    subtitle: r.label + ' (top 300 customers by billed amount)',
    columns: [
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Mobile', type: 'text' },
      { key: 'visits', label: 'Bills', type: 'int' },
      { key: 'billed', label: 'Billed', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'due', label: 'Due', type: 'money' },
      { key: 'wallet', label: 'Wallet balance', type: 'money' },
      { key: 'last', label: 'Last visit', type: 'date' },
    ],
    rows,
    totals: { customer: 'Total', phone: '', ...t, wallet: null, last: null },
    summary: [
      { label: 'Customers billed', value: agg.size, type: 'int' },
      { label: 'New customers', value: newCount, type: 'int' },
      { label: 'Repeat customers (2+ bills)', value: rows.filter((x) => x.visits >= 2).length, type: 'int' },
      { label: 'Average spend per customer', value: agg.size ? r2(t.billed / agg.size) : 0, type: 'money' },
      { label: 'Guest bills', value: guestBills, type: 'int' },
    ],
    chart: { type: 'bar', x: 'customer', ys: [{ key: 'billed', label: 'Billed' }] },
  };
}
async function stockReport(): Promise<ReportData> {
  const list = await prisma.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const usage: Record<string, string> = { SALE: 'For sale', SALON_USE: 'Salon use', BOTH: 'Sale + salon use' };
  const now = Date.now();
  const rows = list.map((p) => {
    const stock = num(p.stockQty);
    const low = num(p.lowStockLevel) > 0 && stock <= num(p.lowStockLevel);
    return {
      product: p.name, category: p.category || '-', usage: usage[p.usage] || p.usage, unit: p.unit, stock, cost: r2(num(p.costPrice)),
      costValue: r2(stock * num(p.costPrice)), price: p.usage === 'SALON_USE' ? null : r2(num(p.salePrice)),
      saleValue: p.usage === 'SALON_USE' ? null : r2(stock * num(p.salePrice)), status: low ? 'Low stock' : 'OK', expiry: p.expiryDate,
    };
  });
  const t = sums(rows, ['costValue', 'saleValue']);
  const expiring = list.filter((p) => p.expiryDate && p.expiryDate.getTime() - now <= 30 * 86400000).length;
  return {
    id: 'stock',
    title: 'Stock report',
    subtitle: 'Current stock, as on ' + fmtD(new Date()),
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'usage', label: 'Type', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'stock', label: 'In stock', type: 'qty' },
      { key: 'cost', label: 'Cost price', type: 'money' },
      { key: 'costValue', label: 'Stock value (cost)', type: 'money' },
      { key: 'price', label: 'Selling price', type: 'money' },
      { key: 'saleValue', label: 'Stock value (selling)', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'expiry', label: 'Expiry', type: 'date' },
    ],
    rows,
    totals: { product: 'Total', category: '', usage: '', unit: '', stock: null, cost: null, costValue: t.costValue, price: null, saleValue: t.saleValue, status: '', expiry: null },
    summary: [
      { label: 'Active products', value: rows.length, type: 'int' },
      { label: 'Stock value (at cost)', value: t.costValue, type: 'money' },
      { label: 'Stock value (at selling price)', value: t.saleValue, type: 'money' },
      { label: 'Low stock items', value: rows.filter((x) => x.status === 'Low stock').length, type: 'int' },
      { label: 'Expired or expiring in 30 days', value: expiring, type: 'int' },
    ],
    chart: null,
  };
}
async function stockMoves(r: Range): Promise<ReportData> {
  const list = await prisma.stockMovement.findMany({
    where: { createdAt: { gte: r.from, lt: r.to } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { product: { select: { name: true, unit: true } } },
  });
  const typeLabel: Record<string, string> = {
    IN: 'Stock in', OUT: 'Stock out', ADJUST: 'Correction', SALE: 'Sold', DAMAGED: 'Damaged / expired', USED: 'Used in salon',
  };
  const rows = list.map((m) => ({
    date: m.createdAt, product: m.product.name, type: typeLabel[m.type] || m.type, qty: num(m.qty),
    unit: m.product.unit, balance: num(m.balanceAfter), note: m.note || '',
  }));
  return {
    id: 'stock-moves',
    title: 'Stock movements',
    subtitle: r.label + (list.length === 5000 ? ' (latest 5000 entries)' : ''),
    columns: [
      { key: 'date', label: 'Date and time', type: 'datetime' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'type', label: 'Movement', type: 'text' },
      { key: 'qty', label: 'Quantity', type: 'qty' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'balance', label: 'Balance after', type: 'qty' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    rows,
    totals: null,
    summary: [
      { label: 'Movements', value: rows.length, type: 'int' },
      { label: 'Entries adding stock', value: rows.filter((x) => x.qty > 0).length, type: 'int' },
      { label: 'Entries reducing stock', value: rows.filter((x) => x.qty < 0).length, type: 'int' },
    ],
    chart: null,
  };
}
export async function runReport(id: string, q: any): Promise<ReportData> {
  const r = parseRange(q);
  switch (id) {
    case 'sales': return sales(r, q);
    case 'service-sales': return serviceSales(r);
    case 'product-sales': return productSales(r);
    case 'package-sales': return packageSales(r);
    case 'staff': return staffReport(r);
    case 'payments': return payments(r);
    case 'gst': return gst(r);
    case 'dues': return dues();
    case 'wallet': return walletReport(r);
    case 'profit': return profit(r);
    case 'appointments': return appointmentsReport(r);
    case 'customers': return customersReport(r);
    case 'stock': return stockReport();
    case 'stock-moves': return stockMoves(r);
    default: throw new ReportError('Report not found', 404);
  }
}

