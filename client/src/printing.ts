import { SALON } from './salon';
export type InvItem = {
  id: number;
  itemType: string;
  name: string;
  qty: string | number;
  price: string | number;
  amount: string | number;
};
export type InvPayment = { id: number; mode: string; amount: string | number; reference: string | null; createdAt: string; balanceAfter?: string | number | null };
export type Invoice = {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  guestName: string | null;
  customer: { id: number; name: string; phone: string } | null;
  isGst: boolean;
  gstRate: string | number;
  subtotal: string | number;
  membershipDiscount: string | number;
  discountType: string | null;
  discountAmount: string | number;
  taxableAmount: string | number;
  gstAmount: string | number;
  total: string | number;
  paidAmount: string | number;
  walletUsed: string | number;
  walletBalanceAfter: string | number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  items: InvItem[];
  payments: InvPayment[];
};
export type PrintScope = 'full' | 'services' | 'products' | 'packages' | 'membership';
export type Paper = '80' | '58' | 'A4';
export const scopeTypes: Record<string, string[]> = {
  services: ['SERVICE', 'SESSION_USE', 'CUSTOM'],
  products: ['PRODUCT'],
  packages: ['PACKAGE'],
  membership: ['MEMBERSHIP'],
};
export const scopeLabel: Record<PrintScope, string> = {
  full: 'Full bill',
  services: 'Services',
  products: 'Products',
  packages: 'Packages',
  membership: 'Membership',
};
const modeText: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer', WALLET: 'E-Wallet' };
const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => r2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RS = '&#8377;';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function sectionTotals(inv: Invoice, scope: PrintScope) {
  const items = scope === 'full' ? inv.items : inv.items.filter((i) => scopeTypes[scope].includes(i.itemType));
  const amt = items.reduce((s, i) => s + n(i.amount), 0);
  const subAll = n(inv.subtotal);
  const memAll = n(inv.membershipDiscount);
  if (scope === 'full') {
    return {
      items, subtotal: subAll, membership: memAll, discount: n(inv.discountAmount),
      taxable: n(inv.taxableAmount), gst: n(inv.gstAmount), total: n(inv.total),
    };
  }
  const m = scope === 'services' ? memAll : 0;
  const base = subAll - memAll;
  const d = base > 0 ? (n(inv.discountAmount) * (amt - m)) / base : 0;
  const taxable = amt - m - d;
  const gst = inv.isGst ? (taxable * n(inv.gstRate)) / 100 : 0;
  return { items, subtotal: amt, membership: m, discount: d, taxable, gst, total: taxable + gst };
}
export function buildReceipt(inv: Invoice, scope: PrintScope, paper: Paper, preview = false) {
  const t = sectionTotals(inv, scope);
  const a4 = paper === 'A4';
  const w = paper === '80' ? '80mm' : paper === '58' ? '58mm' : '210mm';
  const fs = a4 ? 13 : paper === '58' ? 10 : 11.5;
  const who = inv.customer ? inv.customer.name + ' (+91 ' + inv.customer.phone + ')' : inv.guestName || 'Walk-in guest';
  const date = new Date(inv.createdAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const title = (inv.status === 'CANCELLED' ? 'CANCELLED ' : '') + (inv.isGst ? 'TAX INVOICE' : 'BILL') + (scope === 'full' ? '' : ' - ' + scopeLabel[scope].toUpperCase());
  const locality = [SALON.city, SALON.state].filter(Boolean).join(', ') + (SALON.pincode ? ' - ' + SALON.pincode : '');
  const addrLines = [SALON.address, locality].filter((x) => x && x.trim()).map(esc);
  const contact = [SALON.phone ? 'Ph: ' + SALON.phone : '', SALON.email].filter(Boolean).map(esc);
  const bodyCss = a4
    ? preview ? 'zoom:.5;padding:14mm;width:210mm;margin:0 auto;background:#fff;' : 'margin:0;'
    : 'width:' + w + ';padding:3mm;margin:' + (preview ? '0 auto' : '0') + ';' + (preview ? 'background:#fff;' : '');
  const css = `
@page { size: ${a4 ? 'A4' : w + ' auto'}; margin: ${a4 ? '14mm' : '0'}; }
* { box-sizing: border-box; }
html { ${preview ? 'background:#e5e7eb;' : ''} }
body { font-family: Arial, Helvetica, sans-serif; color:#000; font-size:${fs}px; line-height:1.35; ${bodyCss} }
.c { text-align:center; } .b { font-weight:700; } .small { font-size:${fs - 1.5}px; }
.shop { font-size:${fs + 4}px; font-weight:700; text-align:center; }
.logo { max-height:${a4 ? 22 : 14}mm; max-width:100%; }
.hr { border-top:1px dashed #000; margin:5px 0; }
.row { display:flex; justify-content:space-between; gap:6px; }
.big { font-size:${fs + 2}px; }
.it { margin-bottom:4px; } .nm { font-weight:600; }
table { width:100%; border-collapse:collapse; margin:6px 0; }
th, td { padding:5px 4px; border-bottom:1px solid #bbb; text-align:left; }
.r { text-align:right; }
.tot { ${a4 ? 'width:55%;margin-left:auto;' : ''} }
`;
  const itemsHtml = a4
    ? '<table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' +
      t.items
        .map((i, k) =>
          '<tr><td>' + (k + 1) + '</td><td>' + esc(i.name) + '</td><td class="r">' + n(i.qty) + '</td><td class="r">' +
          money(n(i.price)) + '</td><td class="r">' + money(n(i.amount)) + '</td></tr>')
        .join('') +
      '</tbody></table>'
    : t.items
        .map((i) =>
          '<div class="it"><div class="nm">' + esc(i.name) + '</div><div class="row"><span>' + n(i.qty) + ' x ' +
          money(n(i.price)) + '</span><span>' + money(n(i.amount)) + '</span></div></div>')
        .join('');
  const rows: string[] = [];
  const row = (l: string, v: string, bold = false) =>
    rows.push('<div class="row' + (bold ? ' b big' : '') + '"><span>' + l + '</span><span>' + v + '</span></div>');
  row('Subtotal', RS + ' ' + money(t.subtotal));
  if (t.membership > 0.004) row('Membership discount', '- ' + RS + ' ' + money(t.membership));
  if (t.discount > 0.004) row('Discount', '- ' + RS + ' ' + money(t.discount));
  if (inv.isGst) {
    const half = n(inv.gstRate) / 2;
    row('Taxable amount', RS + ' ' + money(t.taxable));
    row('CGST @ ' + half + '%', RS + ' ' + money(t.gst / 2));
    row('SGST @ ' + half + '%', RS + ' ' + money(t.gst / 2));
  }
  rows.push('<div class="hr"></div>');
  row('TOTAL', RS + ' ' + money(t.total), true);
  let pay = '';
  if (scope === 'full') {
    const paid = n(inv.paidAmount);
    const due = r2(n(inv.total) - paid);
    pay =
      '<div class="hr"></div>' +
      inv.payments
        .map((p) => '<div class="row"><span>' + (modeText[p.mode] || p.mode) + '</span><span>' + RS + ' ' + money(n(p.amount)) + '</span></div>')
        .join('') +
      '<div class="row b"><span>Paid</span><span>' + RS + ' ' + money(paid) + '</span></div>' +
      (due > 0.004
        ? '<div class="row b"><span>Balance due</span><span>' + RS + ' ' + money(due) + '</span></div>'
        : '<div class="c b" style="margin-top:4px">PAID IN FULL</div>') +
      (inv.walletBalanceAfter !== null && inv.walletBalanceAfter !== undefined
        ? '<div class="row"><span>E-Wallet balance</span><span>' + RS + ' ' + money(n(inv.walletBalanceAfter)) + '</span></div>'
        : '') +
      (inv.notes ? '<div class="small" style="margin-top:4px">Note: ' + esc(inv.notes) + '</div>' : '');
  } else {
    pay =
      '<div class="hr"></div><div class="c small">Part of bill ' + esc(inv.invoiceNo) +
      '<br/>Combined bill total: ' + RS + ' ' + money(n(inv.total)) + '</div>';
  }
  const gstLine = inv.isGst && SALON.gstin && SALON.showGstin ? '<div class="c small">GSTIN: ' + esc(SALON.gstin) + '</div>' : '';
  const footer =
    '<div class="hr"></div>' +
    '<div class="c small">' + esc(SALON.footer || 'Thank you!') + '</div>' +
    (SALON.upiId ? '<div class="c small" style="margin-top:3px">Pay via UPI: ' + esc(SALON.upiId) + '</div>' : '') +
    (a4 && SALON.bankDetails ? '<div class="small" style="margin-top:6px;white-space:pre-line">' + esc(SALON.bankDetails) + '</div>' : '') +
    (SALON.terms ? '<div class="small" style="margin-top:6px;white-space:pre-line">' + esc(SALON.terms) + '</div>' : '');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(inv.invoiceNo) + '</title><style>' + css + '</style></head><body>' +
    (SALON.logo ? '<div class="c"><img class="logo" src="' + SALON.logo + '"/></div>' : '') +
    '<div class="shop">' + esc(SALON.name) + '</div>' +
    (SALON.tagline ? '<div class="c small">' + esc(SALON.tagline) + '</div>' : '') +
    '<div class="c small">' + addrLines.concat(contact).join('<br/>') + '</div>' + gstLine +
    '<div class="hr"></div><div class="c b">' + title + '</div><div class="hr"></div>' +
    '<div class="row"><span>Bill no</span><span class="b">' + esc(inv.invoiceNo) + '</span></div>' +
    '<div class="row"><span>Date</span><span>' + esc(date) + '</span></div>' +
    '<div class="row"><span>Customer</span><span>' + esc(who) + '</span></div>' +
    '<div class="hr"></div>' + itemsHtml + '<div class="hr"></div>' +
    '<div class="tot">' + rows.join('') + '</div>' + pay + footer + '</body></html>';
  return html;
}
export function printInvoice(inv: Invoice, scope: PrintScope, paper: Paper) {
  const html = buildReceipt(inv, scope, paper, false);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 60000);
  }, 400);
}


