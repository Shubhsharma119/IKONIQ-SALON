import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ClipboardList, Plus, Search, Trash2, ArrowLeft, Printer, MessageCircle, Pencil, Ban } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
import { SALON } from '../salon';
import { cleanPhone, openWhatsApp } from '../whatsapp';
type PoItem = { id: number; productId: number; name: string; qty: number; rate: number; gstRate: number; gstAmount: number; amount: number; received: number; remaining: number };
type SupInfo = { id: number; name: string; phone: string | null; gstin: string | null; address: string | null };
type Po = {
  id: number;
  poNo: string;
  supplier: SupInfo;
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  gstAmount: number;
  total: number;
  note: string | null;
  state: string;
  status: string;
  stateReason: string | null;
  createdByName: string | null;
  stateByName: string | null;
  items: PoItem[];
  purchases: { id: number; purchaseNo: string }[];
};
type Prod = { id: number; name: string; sku: string | null; category: string | null; unit: string; stockQty: string | number; costPrice: string | number | null; isActive: boolean; isLow?: boolean };
type SupRow = { id: number; name: string; phone: string | null; isActive: boolean; due: number };
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const pad = (x: number) => String(x).padStart(2, '0');
const localDate = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer' };
const statusLabel: Record<string, string> = { ORDERED: 'Ordered', PARTIAL: 'Partly received', RECEIVED: 'Received', CANCELLED: 'Cancelled', CLOSED: 'Closed' };
const statusTone: Record<string, string> = {
  ORDERED: 'bg-blue-50 text-blue-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  RECEIVED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  CLOSED: 'bg-slate-100 text-slate-500',
};
const chip = (on: boolean) =>
  'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
  (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
function isOverdue(po: Po) {
  return !!po.expectedDate && (po.status === 'ORDERED' || po.status === 'PARTIAL') && localDate(new Date(po.expectedDate)) < localDate(new Date());
}
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function printOrder(po: Po) {
  const money = (x: number) => x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = po.items
    .map(
      (i, k) =>
        '<tr><td>' + (k + 1) + '</td><td>' + esc(i.name) + '</td><td class="r">' + i.qty + '</td><td class="r">' + money(i.rate) +
        '</td><td class="r">' + (i.gstRate > 0 ? i.gstRate + '%' : '-') + '</td><td class="r">' + money(i.amount + i.gstAmount) + '</td></tr>'
    )
    .join('');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(po.poNo) + '</title><style>' +
    '@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:13px;line-height:1.4}' +
    'h1{font-size:22px;margin:0}.muted{color:#444}.row{display:flex;justify-content:space-between;gap:20px}' +
    'table{width:100%;border-collapse:collapse;margin:14px 0}th,td{padding:7px 6px;border-bottom:1px solid #bbb;text-align:left}th{background:#f2f2f2}.r{text-align:right}' +
    '.tot{width:45%;margin-left:auto}.tot div{display:flex;justify-content:space-between;padding:3px 0}.sign{margin-top:60px;display:flex;justify-content:space-between}' +
    '.sign div{border-top:1px solid #000;padding-top:4px;width:200px;text-align:center}</style></head><body>' +
    '<div class="row"><div><h1>' + esc(SALON.name) + '</h1><div class="muted">' + esc(SALON.address) + '<br/>' + esc(SALON.phone) +
    (SALON.gstin ? '<br/>GSTIN: ' + esc(SALON.gstin) : '') + '</div></div>' +
    '<div style="text-align:right"><h1>PURCHASE ORDER</h1><div><b>' + esc(po.poNo) + '</b></div><div>Date: ' + esc(dt(po.orderDate)) + '</div>' +
    (po.expectedDate ? '<div>Expected by: ' + esc(dt(po.expectedDate)) + '</div>' : '') + '</div></div>' +
    '<div style="margin-top:14px"><b>To:</b> ' + esc(po.supplier.name) + '<div class="muted">' +
    esc([po.supplier.address, po.supplier.phone ? 'Mobile: ' + po.supplier.phone : '', po.supplier.gstin ? 'GSTIN: ' + po.supplier.gstin : ''].filter(Boolean).join(' | ')) + '</div></div>' +
    '<table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="tot"><div><span>Subtotal</span><span>\u20B9 ' + money(po.subtotal) + '</span></div><div><span>GST</span><span>\u20B9 ' + money(po.gstAmount) +
    '</span></div><div style="border-top:1px solid #000;font-weight:bold;font-size:15px"><span>Total</span><span>\u20B9 ' + money(po.total) + '</span></div></div>' +
    (po.note ? '<p><b>Note:</b> ' + esc(po.note) + '</p>' : '') +
    '<div class="sign"><div>Supplier</div><div>Authorised signature</div></div></body></html>';
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
  }, 300);
}
function waMessage(po: Po) {
  const L: string[] = [];
  L.push('Hello ' + po.supplier.name + ',');
  L.push('');
  L.push('Please supply the following items. Order no: *' + po.poNo + '*');
  L.push('Date: ' + dt(po.orderDate) + (po.expectedDate ? ' | Needed by: ' + dt(po.expectedDate) : ''));
  L.push('');
  po.items.forEach((i, k) => {
    L.push((k + 1) + '. ' + i.name + ' - ' + i.qty + ' x ' + inr(i.rate) + (i.gstRate > 0 ? ' + GST ' + i.gstRate + '%' : '') + ' = ' + inr(i.amount + i.gstAmount));
  });
  L.push('');
  L.push('*Total: ' + inr(po.total) + '*');
  if (po.note) L.push('Note: ' + po.note);
  L.push('');
  L.push('Thank you,');
  L.push(SALON.name);
  if (SALON.phone) L.push(SALON.phone);
  return L.join('\n');
}
function ReasonDialog(props: { title: string; subtitle?: string; note?: string; presets: string[]; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    if (reason.trim().length < 3) {
      toast.show('error', 'Please choose or type a reason (at least 3 letters).');
      return;
    }
    setBusy(true);
    try {
      await props.onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={props.title} subtitle={props.subtitle} onClose={props.onClose}>
      <div className="space-y-3">
        {props.note && <p className="text-sm text-slate-600">{props.note}</p>}
        <div className="flex flex-wrap gap-2">
          {props.presets.map((p) => (
            <button type="button" key={p} onClick={() => setReason(p)} className={chip(reason === p)}>{p}</button>
          ))}
        </div>
        <input className={inputCls} placeholder="Or type your own reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Keep it</button>
          <button disabled={busy} onClick={go} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
            {busy ? 'Saving...' : props.confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}
type Row = { key: number; productId: number; name: string; unit: string; stock: number; qty: string; rate: string; gstRate: string };
function PoForm(props: { po: Po | null; onCancel: () => void; onSaved: (id: number) => void }) {
  const toast = useToast();
  const editing = props.po;
  const [sup, setSup] = useState<{ id: number; name: string } | null>(editing ? { id: editing.supplier.id, name: editing.supplier.name } : null);
  const [supList, setSupList] = useState<SupRow[]>([]);
  const [supQ, setSupQ] = useState('');
  const [products, setProducts] = useState<Prod[]>([]);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>(() =>
    editing
      ? editing.items.map((i) => ({ key: i.id, productId: i.productId, name: i.name, unit: '', stock: 0, qty: String(i.qty), rate: String(i.rate), gstRate: String(i.gstRate) }))
      : []
  );
  const [gstOn, setGstOn] = useState(editing ? editing.items.some((i) => i.gstRate > 0) : false);
  const [orderDate, setOrderDate] = useState(editing ? localDate(new Date(editing.orderDate)) : localDate(new Date()));
  const [expected, setExpected] = useState(editing && editing.expectedDate ? localDate(new Date(editing.expectedDate)) : '');
  const [note, setNote] = useState(editing && editing.note ? editing.note : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Prod[]>('/products')
      .then((p) => {
        const list = p.filter((x) => x.isActive);
        setProducts(list);
        setRows((l) =>
          l.map((r) => {
            const f = list.find((x) => x.id === r.productId);
            return f ? { ...r, unit: f.unit, stock: n(f.stockQty) } : r;
          })
        );
      })
      .catch((e) => toast.show('error', e.message));
  }, []);
  useEffect(() => {
    if (sup) return;
    const t = setTimeout(() => {
      api<SupRow[]>('/suppliers?q=' + encodeURIComponent(supQ.trim()))
        .then((r) => setSupList(r.filter((x) => x.isActive)))
        .catch(() => setSupList([]));
    }, 250);
    return () => clearTimeout(t);
  }, [supQ, sup]);
  function addProduct(p: Prod) {
    const ex = rows.find((r) => r.productId === p.id);
    if (ex) setRows((l) => l.map((r) => (r.key === ex.key ? { ...r, qty: String(n(r.qty) + 1) } : r)));
    else setRows((l) => [...l, { key: Date.now() + Math.random(), productId: p.id, name: p.name, unit: p.unit, stock: n(p.stockQty), qty: '1', rate: String(n(p.costPrice)), gstRate: '18' }]);
    setQ('');
  }
  function setRow(key: number, patch: Partial<Row>) {
    setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const r of rows) {
      const amt = r2(n(r.qty) * n(r.rate));
      subtotal += amt;
      if (gstOn) gst += r2((amt * n(r.gstRate)) / 100);
    }
    return { subtotal: r2(subtotal), gst: r2(gst), total: r2(subtotal + gst) };
  }, [rows, gstOn]);
  const qq = q.trim().toLowerCase();
  const matches = qq ? products.filter((p) => p.name.toLowerCase().includes(qq) || (p.sku || '').toLowerCase().includes(qq) || (p.category || '').toLowerCase().includes(qq)).slice(0, 8) : [];
  const lowStock = products.filter((p) => p.isLow).slice(0, 8);
  async function save() {
    if (!sup) return toast.show('error', 'Choose the supplier first.');
    if (rows.length === 0) return toast.show('error', 'Add at least one product to the order.');
    for (const r of rows) {
      if (!(n(r.qty) > 0)) return toast.show('error', 'Enter the quantity for ' + r.name + '.');
      if ((r.unit === 'piece' || r.unit === 'kit') && !Number.isInteger(n(r.qty))) return toast.show('error', 'Quantity of ' + r.name + ' must be a whole number.');
      if (r.rate === '' || isNaN(Number(r.rate)) || Number(r.rate) < 0) return toast.show('error', 'Enter the cost per unit for ' + r.name + '.');
      if (gstOn && (isNaN(Number(r.gstRate)) || Number(r.gstRate) < 0 || Number(r.gstRate) > 28)) return toast.show('error', 'GST for ' + r.name + ' must be between 0 and 28.');
    }
    if (!orderDate) return toast.show('error', 'Select the order date.');
    if (orderDate > localDate(new Date())) return toast.show('error', 'The order date cannot be in the future.');
    if (expected && expected < orderDate) return toast.show('error', 'The expected date cannot be before the order date.');
    const body: any = {
      orderDate: new Date(orderDate + 'T12:00:00').toISOString(),
      expectedDate: expected ? new Date(expected + 'T12:00:00').toISOString() : null,
      items: rows.map((r) => ({ productId: r.productId, qty: Number(r.qty), rate: Number(r.rate), gstRate: gstOn ? Number(r.gstRate) || 0 : 0 })),
      note: note.trim() || undefined,
    };
    if (!editing) body.supplierId = sup.id;
    setBusy(true);
    try {
      const out = await api<Po>(editing ? '/purchase-orders/' + editing.id : '/purchase-orders', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      toast.show('success', editing ? 'Order ' + out.poNo + ' updated successfully.' : 'Order ' + out.poNo + ' created successfully.');
      props.onSaved(out.id);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ClipboardList size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{editing ? 'Edit order ' + editing.poNo : 'New purchase order'}</h1>
            <p className="text-sm text-slate-500">Ask your supplier for goods. Stock is added only when the goods arrive.</p>
          </div>
        </div>
        <button onClick={props.onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">1. Supplier</div>
            {sup ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{sup.name}</span>
                {!editing && <button onClick={() => setSup(null)} className="text-indigo-600 hover:underline">Change</button>}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={inputCls + ' pl-9'} placeholder="Search supplier by name or mobile" value={supQ} onChange={(e) => setSupQ(e.target.value)} />
                </div>
                <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {supList.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">No supplier found. Add the supplier first in the Suppliers tab.</li>}
                  {supList.slice(0, 8).map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setSup({ id: s.id, name: s.name })} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                        <span className="font-medium text-slate-800">{s.name}</span>
                        <span className="text-xs text-slate-500">{s.phone ? '+91 ' + s.phone : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">2. What do you want to order?</div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputCls + ' pl-9'} placeholder="Search product by name, SKU or category" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {matches.length > 0 && (
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <span className="text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-500">Stock {n(p.stockQty)} {p.unit}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {qq && matches.length === 0 && <div className="mt-2 text-sm text-slate-400">No product found. Add it in Inventory first.</div>}
            {!qq && lowStock.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-amber-700">Running low - tap to add</div>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((p) => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
                      {p.name} ({n(p.stockQty)} left)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {rows.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Search and tap a product to add it here.</div>}
            {rows.map((r) => (
              <div key={r.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">In stock now: {r.stock} {r.unit}</div>
                  </div>
                  <button onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={16} /></button>
                </div>
                <div className={'mt-3 grid gap-3 ' + (gstOn ? 'grid-cols-3' : 'grid-cols-2')}>
                  <Field label={'How many' + (r.unit ? ' (' + r.unit + ')' : '')}>
                    <input className={inputCls} type="number" min="0" step="any" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} />
                  </Field>
                  <Field label={'Rate per unit (\u20B9)'}>
                    <input className={inputCls} type="number" min="0" step="any" value={r.rate} onChange={(e) => setRow(r.key, { rate: e.target.value })} />
                  </Field>
                  {gstOn && (
                    <Field label="GST (%)">
                      <input className={inputCls} type="number" min="0" max="28" step="any" value={r.gstRate} onChange={(e) => setRow(r.key, { gstRate: e.target.value })} />
                    </Field>
                  )}
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-slate-800">{inr(r2(n(r.qty) * n(r.rate)))}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div className="text-sm font-semibold text-slate-800">3. Dates and total</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order date" required>
                <input className={inputCls} type="date" max={localDate(new Date())} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
              <Field label="Expected by" hint="Optional.">
                <input className={inputCls} type="date" min={orderDate} value={expected} onChange={(e) => setExpected(e.target.value)} />
              </Field>
            </div>
            <input className={inputCls} placeholder="Note for the supplier (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={gstOn} onChange={(e) => setGstOn(e.target.checked)} /> This order includes GST
            </label>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Items ({rows.length})</span><span>{inr(totals.subtotal)}</span></div>
              {gstOn && <div className="flex justify-between text-slate-600"><span>GST</span><span>{inr(totals.gst)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800"><span>Order total</span><span>{inr(totals.total)}</span></div>
            </div>
            <button disabled={busy} onClick={save} className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? 'Saving...' : editing ? 'Update order' : 'Save order'}
            </button>
            <p className="text-center text-xs text-slate-400">No stock or payment changes until the goods are received.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function ReceiveModal(props: { po: Po; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const open = props.po.items.filter((i) => i.remaining > 0.0005);
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(open.map((i) => [i.id, String(i.remaining)])));
  const [rate, setRate] = useState<Record<number, string>>(() => Object.fromEntries(open.map((i) => [i.id, String(i.rate)])));
  const [gst, setGst] = useState<Record<number, string>>(() => Object.fromEntries(open.map((i) => [i.id, String(i.gstRate)])));
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(localDate(new Date()));
  const [payType, setPayType] = useState<'FULL' | 'PART' | 'LATER'>('LATER');
  const [mode, setMode] = useState('CASH');
  const [partAmt, setPartAmt] = useState('');
  const [ref, setRef] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [busy, setBusy] = useState(false);
  const lines = open.map((i) => {
    const q = n(qty[i.id]);
    const amt = r2(q * n(rate[i.id]));
    return { it: i, q, amt, gstAmt: r2((amt * n(gst[i.id])) / 100) };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.amt, 0));
  const gstTotal = r2(lines.reduce((s, l) => s + l.gstAmt, 0));
  const total = r2(subtotal + gstTotal);
  const paid = payType === 'FULL' ? total : payType === 'PART' ? r2(Number(partAmt) || 0) : 0;
  const due = r2(total - paid);
  async function save() {
    const picked = lines.filter((l) => l.q > 0);
    if (picked.length === 0) return toast.show('error', 'Enter the quantity received for at least one item.');
    for (const l of picked) {
      if (l.q > l.it.remaining + 0.0005) return toast.show('error', 'You can receive at most ' + l.it.remaining + ' of ' + l.it.name + '.');
      const r = rate[l.it.id];
      if (r === '' || isNaN(Number(r)) || Number(r) < 0) return toast.show('error', 'Enter the cost per unit for ' + l.it.name + '.');
      const g = Number(gst[l.it.id]);
      if (isNaN(g) || g < 0 || g > 28) return toast.show('error', 'GST for ' + l.it.name + ' must be between 0 and 28.');
    }
    if (!billDate) return toast.show('error', 'Select the bill date.');
    if (billDate > localDate(new Date())) return toast.show('error', 'The bill date cannot be in the future.');
    if (payType === 'PART' && !(Number(partAmt) > 0)) return toast.show('error', 'Enter the amount you are paying now.');
    if (paid > total + 0.001) return toast.show('error', 'The payment is more than the total.');
    setBusy(true);
    try {
      const out = await api<{ purchaseNo: string }>('/purchase-orders/' + props.po.id + '/receive', {
        method: 'POST',
        body: JSON.stringify({
          billNo: billNo.trim() || undefined,
          billDate: new Date(billDate + 'T12:00:00').toISOString(),
          lines: picked.map((l) => ({ poItemId: l.it.id, qty: l.q, rate: Number(rate[l.it.id]), gstRate: Number(gst[l.it.id]) || 0 })),
          payments: paid > 0 ? [{ mode, amount: paid, reference: ref.trim() || undefined }] : [],
          updateCost,
        }),
      });
      toast.show('success', 'Goods received. Purchase ' + out.purchaseNo + ' saved and stock updated.');
      props.onDone();
      props.onClose();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  const seg = (on: boolean) =>
    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <Modal title="Receive goods" subtitle={props.po.poNo + ' - ' + props.po.supplier.name} onClose={props.onClose}>
      <div className="space-y-4">
        <div className="text-xs text-slate-500">Enter what actually arrived. Leave 0 or empty for items that did not come. Stock is added when you save.</div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {open.map((i) => (
            <div key={i.id} className="space-y-2 px-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{i.name}</div>
                <div className="text-xs text-slate-400">Ordered {i.qty} - already received {i.received} - still to come {i.remaining}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Received now">
                  <input className={inputCls} type="number" min="0" step="any" value={qty[i.id] || ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
                </Field>
                <Field label={'Rate (\u20B9)'}>
                  <input className={inputCls} type="number" min="0" step="any" value={rate[i.id] || ''} onChange={(e) => setRate({ ...rate, [i.id]: e.target.value })} />
                </Field>
                <Field label="GST (%)">
                  <input className={inputCls} type="number" min="0" max="28" step="any" value={gst[i.id] || ''} onChange={(e) => setGst({ ...gst, [i.id]: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier bill number" hint="Optional.">
            <input className={inputCls} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          </Field>
          <Field label="Bill date">
            <input className={inputCls} type="date" max={localDate(new Date())} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Goods received</span><span>{inr(subtotal)}</span></div>
          <div className="flex justify-between text-slate-600"><span>GST</span><span>{inr(gstTotal)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-800"><span>Total</span><span>{inr(total)}</span></div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Did you pay the supplier?</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPayType('FULL')} className={seg(payType === 'FULL')}>Paid in full</button>
            <button type="button" onClick={() => setPayType('PART')} className={seg(payType === 'PART')}>Part payment</button>
            <button type="button" onClick={() => setPayType('LATER')} className={seg(payType === 'LATER')}>Pay later</button>
          </div>
        </div>
        {payType !== 'LATER' && (
          <div className="space-y-3">
            {payType === 'PART' && (
              <Field label={'Amount paid now (\u20B9)'}>
                <input className={inputCls} type="number" min="0" step="any" value={partAmt} onChange={(e) => setPartAmt(e.target.value)} />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              {['CASH', 'UPI', 'CARD', 'BANK'].map((m) => (
                <button type="button" key={m} onClick={() => setMode(m)} className={chip(mode === m)}>{modeLabel[m]}</button>
              ))}
            </div>
            <input className={inputCls} placeholder="Reference (UPI ID, cheque no.) - optional" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Paid now {inr(paid)}</span>
          <span className={due > 0.004 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{due > 0.004 ? 'Still due ' + inr(due) : 'Nothing due'}</span>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
          <span>Also update each product cost price to the new cost</span>
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={busy} onClick={save} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : 'Save and add to stock'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function PoDetail(props: { id: number; onBack: () => void; onEdit: (po: Po) => void }) {
  const toast = useToast();
  const [po, setPo] = useState<Po | null>(null);
  const [loading, setLoading] = useState(true);
  const [recv, setRecv] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [close, setClose] = useState(false);
  function load() {
    api<Po>('/purchase-orders/' + props.id)
      .then(setPo)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [props.id]);
  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!po) return <div className="text-rose-600">Order not found.</div>;
  const live = po.state === 'OPEN';
  const canEdit = po.status === 'ORDERED' && po.purchases.length === 0;
  const canReceive = live && po.status !== 'RECEIVED';
  function whatsapp() {
    if (!po) return;
    const p = cleanPhone(po.supplier.phone || '');
    if (!p) {
      toast.show('error', 'This supplier has no valid mobile number. Add it by editing the supplier.');
      return;
    }
    openWhatsApp(p, waMessage(po));
  }
  return (
    <div className="space-y-6">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Back to orders
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{po.poNo}</h1>
            <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + statusTone[po.status]}>{statusLabel[po.status]}</span>
            {isOverdue(po) && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">Overdue</span>}
          </div>
          <p className="text-sm text-slate-500">
            {po.supplier.name} - ordered {dt(po.orderDate)}{po.expectedDate ? ' - expected by ' + dt(po.expectedDate) : ''}
          </p>
          <p className="text-xs text-slate-400">{po.createdByName ? 'Created by ' + po.createdByName : ''}{po.note ? ' - ' + po.note : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={whatsapp} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"><MessageCircle size={16} /> WhatsApp</button>
          <button onClick={() => printOrder(po)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer size={16} /> Print</button>
          {canEdit && <button onClick={() => props.onEdit(po)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil size={16} /> Edit</button>}
          {canReceive && <button onClick={() => setRecv(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Receive goods</button>}
        </div>
      </div>
      {!live && (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold">{po.state === 'CANCELLED' ? 'This order was cancelled.' : 'This order was closed.'}</span>{' '}
          {po.stateReason}{po.stateByName ? ' (' + po.stateByName + ')' : ''}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 text-right font-semibold">Ordered</th>
              <th className="px-4 py-3 text-right font-semibold">Received</th>
              <th className="px-4 py-3 text-right font-semibold">Still to come</th>
              <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">Rate</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{i.name}</td>
                <td className="px-4 py-3 text-right text-slate-700">{i.qty}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{i.received}</td>
                <td className={'px-4 py-3 text-right font-medium ' + (i.remaining > 0 ? 'text-amber-700' : 'text-slate-400')}>{i.remaining}</td>
                <td className="hidden px-4 py-3 text-right text-slate-600 md:table-cell">{inr(i.rate)}{i.gstRate > 0 ? ' + ' + i.gstRate + '%' : ''}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(i.amount + i.gstAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{inr(po.subtotal)}</span></div>
          <div className="flex justify-between text-slate-600"><span>GST</span><span>{inr(po.gstAmount)}</span></div>
          <div className="flex justify-between text-base font-bold text-slate-800"><span>Order total</span><span>{inr(po.total)}</span></div>
        </div>
      </div>
      {po.purchases.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 text-sm font-semibold text-slate-800">Goods received against this order</div>
          <div className="flex flex-wrap gap-2">
            {po.purchases.map((p) => (
              <span key={p.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{p.purchaseNo}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">See the full bill, payments and returns of these purchases in the supplier page.</p>
        </div>
      )}
      {live && (
        <div className="flex flex-wrap gap-2">
          {po.status === 'ORDERED' && (
            <button onClick={() => setCancel(true)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"><Ban size={14} /> Cancel order</button>
          )}
          {po.status === 'PARTIAL' && (
            <button onClick={() => setClose(true)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50">Close order (rest will not come)</button>
          )}
        </div>
      )}
      {recv && <ReceiveModal po={po} onClose={() => setRecv(false)} onDone={load} />}
      {cancel && (
        <ReasonDialog
          title="Cancel this order?"
          subtitle={po.poNo + ' - ' + inr(po.total)}
          note="No stock or payment is affected. The order stays in the list as cancelled."
          presets={['Ordered by mistake', 'Supplier cannot supply', 'Price not agreed', 'Changed my mind']}
          confirm="Cancel order"
          onClose={() => setCancel(false)}
          onConfirm={async (reason) => {
            try {
              await api('/purchase-orders/' + po.id + '/cancel', { method: 'POST', body: JSON.stringify({ reason }) });
              toast.show('success', 'Order cancelled.');
              setCancel(false);
              load();
            } catch (err: any) {
              toast.show('error', err.message);
            }
          }}
        />
      )}
      {close && (
        <ReasonDialog
          title="Close this order?"
          subtitle={po.poNo}
          note="The quantity that has not arrived is dropped from this order. Goods already received stay as they are."
          presets={['Supplier cannot send the rest', 'Rest not needed now', 'Ordered elsewhere']}
          confirm="Close order"
          onClose={() => setClose(false)}
          onConfirm={async (reason) => {
            try {
              await api('/purchase-orders/' + po.id + '/close', { method: 'POST', body: JSON.stringify({ reason }) });
              toast.show('success', 'Order closed.');
              setClose(false);
              load();
            } catch (err: any) {
              toast.show('error', err.message);
            }
          }}
        />
      )}
    </div>
  );
}
function PoList(props: { onOpen: (id: number) => void; onNew: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'received' | 'closed' | 'all'>('active');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      api<Po[]>('/purchase-orders?q=' + encodeURIComponent(q.trim()))
        .then(setRows)
        .catch((e) => toast.show('error', e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'active' ? r.status === 'ORDERED' || r.status === 'PARTIAL' : filter === 'received' ? r.status === 'RECEIVED' : r.status === 'CANCELLED' || r.status === 'CLOSED'
  );
  const active = rows.filter((r) => r.status === 'ORDERED' || r.status === 'PARTIAL');
  const overdue = active.filter(isOverdue).length;
  const pendingValue = r2(
    active.reduce((s, r) => s + r.items.reduce((t, i) => t + (i.qty > 0 ? ((i.amount + i.gstAmount) * i.remaining) / i.qty : 0), 0), 0)
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ClipboardList size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Purchase orders</h1>
            <p className="text-sm text-slate-500">Order goods from suppliers and receive them when they arrive</p>
          </div>
        </div>
        <button onClick={props.onNew} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
          <Plus size={16} /> New purchase order
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Orders waiting for goods</div><div className="text-xl font-bold text-slate-800">{active.length}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Value still to arrive</div><div className="text-xl font-bold text-slate-800">{inr(pendingValue)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Overdue</div><div className={'text-xl font-bold ' + (overdue > 0 ? 'text-rose-600' : 'text-slate-800')}>{overdue}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('active')} className={chip(filter === 'active')}>Waiting</button>
          <button onClick={() => setFilter('received')} className={chip(filter === 'received')}>Received</button>
          <button onClick={() => setFilter('closed')} className={chip(filter === 'closed')}>Cancelled / closed</button>
          <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search order no or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Supplier</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Ordered</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Expected</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No orders here. Tap New purchase order to create one.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} onClick={() => props.onOpen(r.id)} className="cursor-pointer hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-800">{r.poNo}</td>
                <td className="px-4 py-3 text-slate-700">{r.supplier.name}</td>
                <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{dt(r.orderDate)}</td>
                <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                  {r.expectedDate ? dt(r.expectedDate) : '-'}
                  {isOverdue(r) && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Overdue</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(r.total)}</td>
                <td className="px-4 py-3"><span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + statusTone[r.status]}>{statusLabel[r.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'form'; po: Po | null };
export default function PurchaseOrders() {
  const [view, setView] = useState<View>({ kind: 'list' });
  if (view.kind === 'form') {
    const back = view.po ? { kind: 'detail' as const, id: view.po.id } : { kind: 'list' as const };
    return <PoForm po={view.po} onCancel={() => setView(back)} onSaved={(id) => setView({ kind: 'detail', id })} />;
  }
  if (view.kind === 'detail') {
    return <PoDetail id={view.id} onBack={() => setView({ kind: 'list' })} onEdit={(po) => setView({ kind: 'form', po })} />;
  }
  return <PoList onOpen={(id) => setView({ kind: 'detail', id })} onNew={() => setView({ kind: 'form', po: null })} />;
}
