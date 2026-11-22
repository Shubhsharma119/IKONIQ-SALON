import { SALON } from './salon';
import type { Paper } from './printing';
export type WalletReceipt = {
  receiptNo: string;
  date: string;
  customerName: string;
  phone: string;
  paid: number;
  bonus: number;
  credit: number;
  mode: string | null;
  reference: string | null;
  note: string | null;
  balanceBefore: number;
  balanceAfter: number;
};
const RS = '&#8377;';
const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => r2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const modeText: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer' };
export function buildWalletReceipt(r: WalletReceipt, paper: Paper, preview = false) {
  const a4 = paper === 'A4';
  const w = paper === '80' ? '80mm' : paper === '58' ? '58mm' : '210mm';
  const fs = a4 ? 13 : paper === '58' ? 10 : 11.5;
  const date = new Date(r.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const locality = [SALON.city, SALON.state].filter(Boolean).join(', ') + (SALON.pincode ? ' - ' + SALON.pincode : '');
  const addrLines = [SALON.address, locality].filter((x) => x && x.trim()).map(esc);
  const contact = [SALON.phone ? 'Ph: ' + SALON.phone : '', SALON.email].filter(Boolean).map(esc);
  const bodyCss = a4
    ? preview ? 'zoom:.5;padding:14mm;width:210mm;margin:0 auto;background:#fff;' : 'margin:0;'
    : 'width:' + w + ';padding:3mm;margin:' + (preview ? '0 auto' : '0') + ';' + (preview ? 'background:#fff;' : '');
  const css =
    '@page { size: ' + (a4 ? 'A4' : w + ' auto') + '; margin: ' + (a4 ? '14mm' : '0') + '; }' +
    '* { box-sizing: border-box; } html { ' + (preview ? 'background:#e5e7eb;' : '') + ' }' +
    'body { font-family: Arial, Helvetica, sans-serif; color:#000; font-size:' + fs + 'px; line-height:1.4; ' + bodyCss + ' }' +
    '.c { text-align:center; } .b { font-weight:700; } .small { font-size:' + (fs - 1.5) + 'px; color:#333; }' +
    '.shop { font-size:' + (fs + 4) + 'px; font-weight:700; text-align:center; }' +
    '.logo { max-height:' + (a4 ? 22 : 14) + 'mm; max-width:100%; }' +
    '.hr { border-top:1px dashed #000; margin:6px 0; } .row { display:flex; justify-content:space-between; gap:6px; margin:2px 0; }' +
    '.big { font-size:' + (fs + 3) + 'px; }';
  const row = (l: string, v: string, bold = false) =>
    '<div class="row' + (bold ? ' b' : '') + '"><span>' + l + '</span><span>' + v + '</span></div>';
  const paidBy = (modeText[r.mode || ''] || r.mode || '-') + (r.reference ? ' (' + r.reference + ')' : '');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.receiptNo) + '</title><style>' + css + '</style></head><body>' +
    (SALON.logo ? '<div class="c"><img class="logo" src="' + SALON.logo + '"/></div>' : '') +
    '<div class="shop">' + esc(SALON.name) + '</div>' +
    (SALON.tagline ? '<div class="c small">' + esc(SALON.tagline) + '</div>' : '') +
    '<div class="c small">' + addrLines.concat(contact).join('<br/>') + '</div>' +
    '<div class="hr"></div><div class="c b">E-WALLET TOP-UP RECEIPT</div><div class="hr"></div>' +
    row('Receipt no', '<b>' + esc(r.receiptNo) + '</b>') +
    row('Date', esc(date)) +
    row('Customer', esc(r.customerName) + ' (+91 ' + esc(r.phone) + ')') +
    '<div class="hr"></div>' +
    row('Amount received', RS + ' ' + money(r.paid), true) +
    '<div class="small">Paid by ' + esc(paidBy) + '</div>' +
    (r.bonus > 0.004 ? row('Bonus credited', RS + ' ' + money(r.bonus)) : '') +
    row('Total added to wallet', RS + ' ' + money(r.credit), true) +
    '<div class="hr"></div>' +
    row('Balance before', RS + ' ' + money(r.balanceBefore)) +
    '<div class="row b big"><span>Balance now</span><span>' + RS + ' ' + money(r.balanceAfter) + '</span></div>' +
    (r.note ? '<div class="small" style="margin-top:4px">Note: ' + esc(r.note) + '</div>' : '') +
    '<div class="hr"></div><div class="c small">' + esc(SALON.footer || 'Thank you!') + '</div>' +
    '</body></html>'
  );
}
export function printWalletReceipt(r: WalletReceipt, paper: Paper) {
  const html = buildWalletReceipt(r, paper, false);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
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
