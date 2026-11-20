import { SALON } from './salon';
import { sectionTotals, scopeTypes, type Invoice, type PrintScope } from './printing';
export type WaKind = 'full' | 'summary' | 'due' | 'services' | 'products' | 'packages' | 'membership';
export const waKindLabel: Record<WaKind, string> = {
  full: 'Full bill',
  summary: 'Short summary',
  due: 'Due reminder',
  services: 'Services only',
  products: 'Products only',
  packages: 'Packages only',
  membership: 'Membership only',
};
const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) =>
  '\u20B9' + r2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dueOf = (inv: Invoice) => r2(n(inv.total) - n(inv.paidAmount));
function walletNote(inv: Invoice, L: string[]) {
  const w = inv.payments.filter((p) => p.mode === 'WALLET');
  if (w.length === 0) return;
  const used = w.reduce((s, p) => s + n(p.amount), 0);
  const left = w[w.length - 1].balanceAfter;
  L.push('Paid from E-Wallet: ' + money(used) + (left != null ? ' (balance left: ' + money(n(left)) + ')' : ''));
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function waKinds(inv: Invoice): WaKind[] {
  const out: WaKind[] = ['full', 'summary'];
  const parts = (Object.keys(scopeTypes) as PrintScope[]).filter((k) =>
    inv.items.some((i) => scopeTypes[k].includes(i.itemType))
  );
  if (parts.length > 1) out.push(...(parts as WaKind[]));
  if (inv.status !== 'CANCELLED' && dueOf(inv) > 0.004) out.push('due');
  return out;
}
// Returns the number with country code (91XXXXXXXXXX) or null if it is not a valid Indian mobile number.
export function cleanPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? '91' + d : null;
}
export function openWhatsApp(phone91: string, text: string) {
  const url = 'https://wa.me/' + phone91 + '?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener,noreferrer');
}
export function buildWaMessage(inv: Invoice, kind: WaKind): string {
  const name = inv.customer ? inv.customer.name : inv.guestName || '';
  const hello = name ? 'Hello ' + name + ',' : 'Hello,';
  const paid = n(inv.paidAmount);
  const due = dueOf(inv);
  const shop = '*' + SALON.name + '*';
  const L: string[] = [];
  if (kind === 'due') {
    L.push(hello, '');
    L.push('This is a friendly reminder from ' + shop + '.');
    L.push('A balance of *' + money(due) + '* is pending on bill ' + inv.invoiceNo + ' dated ' + fmtDate(inv.createdAt) + '.');
    L.push('');
    L.push('Bill total: ' + money(n(inv.total)));
    L.push('Paid: ' + money(paid));
    L.push('Balance due: ' + money(due));
    L.push('');
    L.push('Please pay at your earliest convenience. Thank you!');
    if (SALON.phone) L.push('For any query: ' + SALON.phone);
    return L.join('\n');
  }
  if (kind === 'summary') {
    L.push(hello, '');
    L.push('Thank you for visiting ' + shop + '.');
    L.push('');
    L.push('Bill no: ' + inv.invoiceNo);
    L.push('Date: ' + fmtDate(inv.createdAt));
    L.push('Total: *' + money(n(inv.total)) + '*');
    L.push('Paid: ' + money(paid));
    L.push(due > 0.004 ? 'Balance due: *' + money(due) + '*' : 'Payment received in full.');
    walletNote(inv, L);
    L.push('');
    L.push('Thank you! Visit again.');
    return L.join('\n');
  }
  const scope: PrintScope = kind === 'full' ? 'full' : (kind as PrintScope);
  const t = sectionTotals(inv, scope);
  L.push(shop);
  if (SALON.address) L.push(SALON.address);
  if (SALON.phone) L.push(SALON.phone);
  if (inv.isGst && SALON.gstin) L.push('GSTIN: ' + SALON.gstin);
  L.push('');
  L.push('*' + (inv.isGst ? 'TAX INVOICE' : 'BILL') + (scope === 'full' ? '' : ' - ' + waKindLabel[kind].toUpperCase()) + '*');
  L.push('Bill no: ' + inv.invoiceNo);
  L.push('Date: ' + fmtDate(inv.createdAt));
  if (name) L.push('Customer: ' + name);
  L.push('');
  t.items.forEach((i, k) => {
    L.push((k + 1) + '. ' + i.name + ' - ' + n(i.qty) + ' x ' + money(n(i.price)) + ' = ' + money(n(i.amount)));
  });
  L.push('');
  L.push('Subtotal: ' + money(t.subtotal));
  if (t.membership > 0.004) L.push('Membership discount: - ' + money(t.membership));
  if (t.discount > 0.004) L.push('Discount: - ' + money(t.discount));
  if (inv.isGst) {
    const half = n(inv.gstRate) / 2;
    L.push('Taxable amount: ' + money(t.taxable));
    L.push('CGST @ ' + half + '%: ' + money(t.gst / 2));
    L.push('SGST @ ' + half + '%: ' + money(t.gst / 2));
  }
  L.push('*Total: ' + money(t.total) + '*');
  L.push('');
  if (scope === 'full') {
    L.push('Paid: ' + money(paid));
    L.push(due > 0.004 ? 'Balance due: *' + money(due) + '*' : 'Payment received in full.');
    walletNote(inv, L);
  } else {
    L.push('Part of bill ' + inv.invoiceNo + '. Combined bill total: ' + money(n(inv.total)));
  }
  L.push('');
  L.push('Thank you! Visit again.');
  return L.join('\n');
}


