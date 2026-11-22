import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Truck, Plus, Search, Pencil, Power, ArrowLeft, Trash2, Ban } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type SupBase = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};
type Sup = SupBase & { purchaseCount: number; totalPurchased: number; totalPaid: number; due: number };
type PItem = { id: number; productId: number; name: string; qty: number; rate: number; gstRate: number; gstAmount: number; amount: number };
type SPay = {
  id: number;
  purchaseId: number | null;
  purchaseNo: string | null;
  amount: number;
  mode: string;
  reference: string | null;
  note: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdAt: string;
  createdByName: string | null;
  voidedByName: string | null;
};
type Pur = {
  id: number;
  purchaseNo: string;
  supplier?: { id: number; name: string };
  billNo: string | null;
  billDate: string;
  subtotal: number;
  gstAmount: number;
  total: number;
  paidAmount: number;
  due: number;
  note: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdByName: string | null;
  voidedByName: string | null;
  items: PItem[];
  payments: SPay[];
};
type Detail = {
  supplier: SupBase;
  summary: { purchaseCount: number; totalPurchased: number; totalPaid: number; due: number };
  purchases: Pur[];
  payments: SPay[];
};
type Prod = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  stockQty: string | number;
  costPrice: string | number | null;
  isActive: boolean;
  isLow?: boolean;
};
type SupRef = { id: number; name: string };
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const pad = (x: number) => String(x).padStart(2, '0');
const localDate = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer' };
function statusOf(p: Pur) {
  if (p.isVoid) return { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500' };
  if (p.due <= 0.004) return { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700' };
  if (p.paidAmount > 0) return { label: 'Partly paid', tone: 'bg-amber-50 text-amber-700' };
  return { label: 'Unpaid', tone: 'bg-rose-50 text-rose-700' };
}
const chip = (on: boolean) =>
  'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
  (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
function Stat(props: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{props.label}</div>
      <div className={'text-xl font-bold ' + (props.tone || 'text-slate-800')}>{props.value}</div>
    </div>
  );
}
function ModeChips(props: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['CASH', 'UPI', 'CARD', 'BANK'].map((m) => (
        <button type="button" key={m} onClick={() => props.onChange(m)} className={chip(props.value === m)}>
          {modeLabel[m]}
        </button>
      ))}
    </div>
  );
}
function ReasonInput(props: { presets: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {props.presets.map((p) => (
          <button type="button" key={p} onClick={() => props.onChange(p)} className={chip(props.value === p)}>
            {p}
          </button>
        ))}
      </div>
      <input className={inputCls} placeholder="Or type your own reason" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
function ReasonModal(props: {
  title: string;
  subtitle?: string;
  note?: string;
  presets: string[];
  confirm: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
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
        <div className="text-sm font-medium text-slate-700">Why are you cancelling?</div>
        <ReasonInput presets={props.presets} value={reason} onChange={setReason} />
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
function CancelPurchaseModal(props: { purchase: Pur; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [stock, setStock] = useState<Record<number, number> | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Prod[]>('/products')
      .then((list) => {
        const m: Record<number, number> = {};
        for (const p of list) m[p.id] = n(p.stockQty);
        setStock(m);
      })
      .catch((e) => toast.show('error', e.message));
  }, []);
  const checks = props.purchase.items.map((i) => ({ ...i, now: stock ? stock[i.productId] ?? 0 : 0 }));
  const blocked = stock ? checks.some((c) => c.now + 0.0001 < c.qty) : true;
  async function confirm() {
    if (reason.trim().length < 3) {
      toast.show('error', 'Please choose or type a reason (at least 3 letters).');
      return;
    }
    setBusy(true);
    try {
      await api('/purchases/' + props.purchase.id + '/void', { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      toast.show('success', 'Purchase cancelled. The stock has been reduced again.');
      props.onDone();
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Cancel this purchase?" subtitle={props.purchase.purchaseNo + ' - ' + inr(props.purchase.total)} onClose={props.onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stock that will be removed</div>
          {!stock && <div className="px-3 py-3 text-sm text-slate-400">Checking stock...</div>}
          {stock && checks.map((c) => {
            const ok = c.now + 0.0001 >= c.qty;
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-400">Came in: {c.qty} - In stock now: {c.now}</div>
                </div>
                <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                  {ok ? 'OK' : 'Not enough'}
                </span>
              </div>
            );
          })}
        </div>
        {stock && blocked && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            This purchase cannot be cancelled because part of this stock is already used or sold. Correct the stock in Inventory first, or leave this purchase as it is.
          </div>
        )}
        {stock && !blocked && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            The stock above will be reduced, and any payments on this purchase will be cancelled too. This cannot be undone.
          </div>
        )}
        <div className="text-sm font-medium text-slate-700">Why are you cancelling?</div>
        <ReasonInput presets={['Entered by mistake', 'Wrong supplier', 'Duplicate entry', 'Goods not received']} value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Keep it</button>
          <button disabled={busy || blocked} onClick={confirm} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            {busy ? 'Saving...' : 'Cancel purchase'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function SupplierForm(props: { editing: SupBase | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const e0 = props.editing;
  const [f, setF] = useState({
    name: e0 ? e0.name : '',
    contactPerson: e0 ? e0.contactPerson || '' : '',
    phone: e0 ? e0.phone || '' : '',
    email: e0 ? e0.email || '' : '',
    gstin: e0 ? e0.gstin || '' : '',
    address: e0 ? e0.address || '' : '',
    notes: e0 ? e0.notes || '' : '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    const gstin = f.gstin.trim().toUpperCase();
    if (f.name.trim().length < 2) e.name = 'Enter the supplier name (at least 2 letters).';
    if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) e.gstin = 'Enter a valid 15-character GSTIN.';
    setErrs(e);
    if (Object.keys(e).length > 0) {
      toast.show('error', Object.values(e)[0]);
      return;
    }
    const body = {
      name: f.name.trim(),
      contactPerson: f.contactPerson.trim(),
      phone: f.phone,
      email: f.email.trim(),
      gstin,
      address: f.address.trim(),
      notes: f.notes.trim(),
    };
    setBusy(true);
    try {
      await api(e0 ? '/suppliers/' + e0.id : '/suppliers', { method: e0 ? 'PUT' : 'POST', body: JSON.stringify(body) });
      toast.show('success', e0 ? 'Supplier updated successfully.' : 'Supplier added successfully.');
      props.onSaved();
      props.onClose();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={e0 ? 'Edit supplier' : 'Add new supplier'} subtitle="Only the name is required." onClose={props.onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Supplier name" required error={errs.name}>
          <input className={inputCls} placeholder="e.g. Sharma Beauty Traders" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact person">
            <input className={inputCls} value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} />
          </Field>
          <Field label="Mobile number" error={errs.phone} hint="10 digits. Optional.">
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
              <input className={inputCls + ' rounded-l-none'} inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email address" error={errs.email} hint="Optional.">
            <input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="GSTIN" error={errs.gstin} hint="15 characters. Optional.">
            <input className={inputCls} maxLength={15} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />
          </Field>
        </div>
        <Field label="Address" hint="Optional.">
          <input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="Notes" hint="Payment terms, delivery days... Optional.">
          <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : e0 ? 'Update supplier' : 'Save supplier'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PayModal(props: {
  supplier: SupRef;
  purchases: Pur[];
  presetId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const open = props.purchases.filter((p) => !p.isVoid && p.due > 0.004);
  const dueFor = (t: string) => (t ? (open.find((p) => String(p.id) === t) || { due: 0 }).due : r2(open.reduce((s, p) => s + p.due, 0)));
  const [target, setTarget] = useState(props.presetId ? String(props.presetId) : '');
  const [amount, setAmount] = useState(String(dueFor(props.presetId ? String(props.presetId) : '')));
  const [mode, setMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const due = dueFor(target);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = Number(amount);
    if (!(a > 0)) {
      toast.show('error', 'Enter the amount you are paying.');
      return;
    }
    if (a > due + 0.001) {
      toast.show('error', 'You cannot pay more than the due amount (' + inr(due) + ').');
      return;
    }
    setBusy(true);
    try {
      await api('/suppliers/' + props.supplier.id + '/payments', {
        method: 'POST',
        body: JSON.stringify({ amount: a, mode, reference: reference.trim() || undefined, purchaseId: target ? Number(target) : undefined }),
      });
      toast.show('success', 'Payment of ' + inr(a) + ' recorded successfully.');
      props.onDone();
      props.onClose();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Pay supplier" subtitle={props.supplier.name} onClose={props.onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="rounded-xl bg-rose-50 px-4 py-3">
          <div className="text-xs text-rose-700">Due to this supplier</div>
          <div className="text-2xl font-bold text-rose-700">{inr(due)}</div>
        </div>
        {open.length > 1 && (
          <Field label="Which bill are you paying?" hint="If you do not choose, the oldest bills are paid first.">
            <select
              className={inputCls}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setAmount(String(dueFor(e.target.value)));
              }}
            >
              <option value="">All bills (oldest first)</option>
              {open.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.purchaseNo}{p.billNo ? ' / ' + p.billNo : ''} - due {inr(p.due)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={'Amount you are paying (\u20B9)'} required hint="Already filled with the full due. Change it for a part payment.">
          <input className={inputCls} type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Paid by</div>
          <ModeChips value={mode} onChange={setMode} />
        </div>
        <Field label="Reference" hint="UPI ID, cheque or transaction number. Optional.">
          <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={busy || due <= 0.004} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : 'Record payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SupplierPicker(props: { onPick: (s: SupRef) => void; onCancel: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Sup[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      api<Sup[]>('/suppliers?q=' + encodeURIComponent(q.trim()))
        .then((r) => setList(r.filter((x) => x.isActive)))
        .catch((e) => toast.show('error', e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function addNew(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.show('error', 'Enter the supplier name (at least 2 letters).');
      return;
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      toast.show('error', 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.');
      return;
    }
    setBusy(true);
    try {
      const s = await api<any>('/suppliers', { method: 'POST', body: JSON.stringify({ name: name.trim(), phone }) });
      toast.show('success', 'Supplier added successfully.');
      props.onPick({ id: s.id, name: s.name });
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Truck size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">New purchase</h1>
            <p className="text-sm text-slate-500">Step 1 of 2: choose the supplier</p>
          </div>
        </div>
        <button onClick={props.onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</button>
      </div>
      <div className="max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search supplier by name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {list.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">No supplier found.</li>}
          {list.slice(0, 8).map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => props.onPick({ id: s.id, name: s.name })} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-800">{s.name}</span>
                <span className="text-xs text-slate-500">{s.due > 0.004 ? 'Due ' + inr(s.due) : s.phone ? '+91 ' + s.phone : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
            <Plus size={14} /> Supplier not in the list? Add new supplier
          </button>
        )}
        {adding && (
          <form onSubmit={addNew} className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3" noValidate>
            <div className="text-sm font-medium text-slate-800">Add new supplier</div>
            <Field label="Supplier name" required>
              <input className={inputCls} placeholder="e.g. Sharma Beauty Traders" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Mobile number" hint="10 digits. Optional.">
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                <input className={inputCls + ' rounded-l-none'} inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              </div>
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white">Cancel</button>
              <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : 'Save and continue'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
type Row = { key: number; productId: number; name: string; unit: string; stock: number; qty: string; rate: string; gstRate: string };
function NewPurchase(props: { supplier: SupRef | null; onCancel: () => void; onDone: (supplierId: number) => void }) {
  const toast = useToast();
  const [sup, setSup] = useState<SupRef | null>(props.supplier);
  const [products, setProducts] = useState<Prod[]>([]);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [gstOn, setGstOn] = useState(false);
  const [payType, setPayType] = useState<'FULL' | 'PART' | 'LATER'>('FULL');
  const [payMode, setPayMode] = useState('CASH');
  const [partAmount, setPartAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(localDate(new Date()));
  const [note, setNote] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Prod[]>('/products')
      .then((p) => setProducts(p.filter((x) => x.isActive)))
      .catch((e) => toast.show('error', e.message));
  }, []);
  function addProduct(p: Prod) {
    const ex = rows.find((r) => r.productId === p.id);
    if (ex) {
      setRows((l) => l.map((r) => (r.key === ex.key ? { ...r, qty: String(n(r.qty) + 1) } : r)));
    } else {
      setRows((l) => [
        ...l,
        { key: Date.now() + Math.random(), productId: p.id, name: p.name, unit: p.unit, stock: n(p.stockQty), qty: '1', rate: String(n(p.costPrice)), gstRate: '18' },
      ]);
    }
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
  const paid = payType === 'FULL' ? totals.total : payType === 'PART' ? r2(Number(partAmount) || 0) : 0;
  const due = r2(totals.total - paid);
  const qq = q.trim().toLowerCase();
  const matches = qq
    ? products.filter((p) => p.name.toLowerCase().includes(qq) || (p.sku || '').toLowerCase().includes(qq) || (p.category || '').toLowerCase().includes(qq)).slice(0, 8)
    : [];
  const lowStock = products.filter((p) => p.isLow).slice(0, 8);
  async function save() {
    if (!sup) return;
    if (rows.length === 0) return toast.show('error', 'Add at least one product to the purchase.');
    for (const r of rows) {
      if (!(n(r.qty) > 0)) return toast.show('error', 'Enter the quantity for ' + r.name + '.');
      if ((r.unit === 'piece' || r.unit === 'kit') && !Number.isInteger(n(r.qty))) {
        return toast.show('error', 'Quantity of ' + r.name + ' must be a whole number.');
      }
      if (r.rate === '' || isNaN(Number(r.rate)) || Number(r.rate) < 0) return toast.show('error', 'Enter the cost per unit for ' + r.name + '.');
      if (gstOn && (isNaN(Number(r.gstRate)) || Number(r.gstRate) < 0 || Number(r.gstRate) > 28)) {
        return toast.show('error', 'GST for ' + r.name + ' must be between 0 and 28.');
      }
    }
    if (!billDate) return toast.show('error', 'Select the bill date.');
    if (billDate > localDate(new Date())) return toast.show('error', 'The bill date cannot be in the future.');
    if (payType === 'PART' && !(Number(partAmount) > 0)) return toast.show('error', 'Enter the amount you are paying now.');
    if (paid > totals.total + 0.001) return toast.show('error', 'The payment is more than the purchase total.');
    setBusy(true);
    try {
      const pu = await api<Pur>('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: sup.id,
          billNo: billNo.trim() || undefined,
          billDate: new Date(billDate + 'T12:00:00').toISOString(),
          items: rows.map((r) => ({ productId: r.productId, qty: Number(r.qty), rate: Number(r.rate), gstRate: gstOn ? Number(r.gstRate) || 0 : 0 })),
          payments: paid > 0 ? [{ mode: payMode, amount: paid, reference: payRef.trim() || undefined }] : [],
          note: note.trim() || undefined,
          updateCost,
        }),
      });
      toast.show('success', 'Purchase ' + pu.purchaseNo + ' saved. Stock has been updated.');
      props.onDone(sup.id);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  if (!sup) return <SupplierPicker onPick={setSup} onCancel={props.onCancel} />;
  const seg = (on: boolean) =>
    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Truck size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">New purchase</h1>
            <p className="text-sm text-slate-500">
              From <span className="font-medium text-slate-700">{sup.name}</span>{' '}
              <button onClick={() => setSup(null)} className="text-indigo-600 hover:underline">Change</button>
            </p>
          </div>
        </div>
        <button onClick={props.onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">1. What did you buy?</div>
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
                  <Field label={'How many (' + r.unit + ')'}>
                    <input className={inputCls} type="number" min="0" step="any" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} />
                  </Field>
                  <Field label={'Cost per ' + r.unit + ' (\u20B9)'}>
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
          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">More details (optional)</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Supplier bill number" hint="Helps stop the same bill being entered twice.">
                  <input className={inputCls} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
                </Field>
                <Field label="Bill date">
                  <input className={inputCls} type="date" max={localDate(new Date())} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Note">
                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
                <span>Also update the product cost price to the new cost</span>
              </label>
            </div>
          </details>
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div className="text-sm font-semibold text-slate-800">2. Payment and total</div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={gstOn} onChange={(e) => setGstOn(e.target.checked)} /> This bill has GST
            </label>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Items ({rows.length})</span><span>{inr(totals.subtotal)}</span></div>
              {gstOn && <div className="flex justify-between text-slate-600"><span>GST</span><span>{inr(totals.gst)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800"><span>Total</span><span>{inr(totals.total)}</span></div>
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
                    <input className={inputCls} type="number" min="0" step="any" value={partAmount} onChange={(e) => setPartAmount(e.target.value)} />
                  </Field>
                )}
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">Paid by</div>
                  <ModeChips value={payMode} onChange={setPayMode} />
                </div>
                <input className={inputCls} placeholder="Reference (UPI ID, cheque no.) - optional" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Paid now {inr(paid)}</span>
              <span className={due > 0.004 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                {due > 0.004 ? 'Still due ' + inr(due) : due < -0.004 ? 'Extra ' + inr(-due) : 'Nothing due'}
              </span>
            </div>
            <button disabled={busy} onClick={save} className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? 'Saving...' : 'Save purchase'}
            </button>
            <p className="text-center text-xs text-slate-400">Stock is added to Inventory as soon as you save.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function SupplierDetail(props: { id: number; onBack: () => void; onNewPurchase: (s: SupRef) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'purchases' | 'payments'>('purchases');
  const [pay, setPay] = useState<{ presetId: number | null } | null>(null);
  const [cancelP, setCancelP] = useState<Pur | null>(null);
  const [cancelPay, setCancelPay] = useState<SPay | null>(null);
  const [edit, setEdit] = useState(false);
  function load() {
    api<Detail>('/suppliers/' + props.id)
      .then(setD)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [props.id]);
  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!d) return <div className="text-rose-600">Supplier not found.</div>;
  const s = d.supplier;
  const sm = d.summary;
  return (
    <div className="space-y-6">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Back to suppliers
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{s.name}</h1>
          <p className="text-sm text-slate-500">
            {[s.contactPerson, s.phone ? '+91 ' + s.phone : null, s.email, s.gstin ? 'GSTIN ' + s.gstin : null].filter(Boolean).join(' - ') || 'No contact details'}
          </p>
          {s.address && <p className="text-xs text-slate-400">{s.address}</p>}
          {s.notes && <p className="text-xs italic text-slate-500">{s.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEdit(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil size={16} /> Edit</button>
          {sm.due > 0.004 && (
            <button onClick={() => setPay({ presetId: null })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Pay supplier</button>
          )}
          {s.isActive && (
            <button onClick={() => props.onNewPurchase({ id: s.id, name: s.name })} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={16} /> New purchase</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Purchases" value={String(sm.purchaseCount)} />
        <Stat label="Total purchased" value={inr(sm.totalPurchased)} />
        <Stat label="Total paid" value={inr(sm.totalPaid)} tone="text-emerald-600" />
        <Stat label="Due to supplier" value={inr(sm.due)} tone={sm.due > 0.004 ? 'text-rose-600' : 'text-slate-800'} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab('purchases')} className={chip(tab === 'purchases')}>Purchases ({d.purchases.length})</button>
        <button onClick={() => setTab('payments')} className={chip(tab === 'payments')}>Payments ({d.payments.length})</button>
      </div>
      {tab === 'purchases' && (
        <div className="space-y-3">
          {d.purchases.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No purchases yet. Tap New purchase to add the first one.</div>}
          {d.purchases.map((p, idx) => {
            const st = statusOf(p);
            return (
              <details key={p.id} open={idx === 0} className={'rounded-2xl border border-slate-200 bg-white shadow-sm ' + (p.isVoid ? 'opacity-60' : '')}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <span className="font-medium text-slate-800">{p.purchaseNo}</span>
                    <span className="ml-2 text-sm text-slate-500">{dt(p.billDate)}{p.billNo ? ' - Bill ' + p.billNo : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={'font-semibold text-slate-800 ' + (p.isVoid ? 'line-through' : '')}>{inr(p.total)}</span>
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + st.tone}>{st.label}</span>
                  </div>
                </summary>
                <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                  {p.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="truncate text-slate-800">{i.name}</div>
                        <div className="text-xs text-slate-400">{i.qty} x {inr(i.rate)}{i.gstRate > 0 ? ' + GST ' + i.gstRate + '%' : ''}</div>
                      </div>
                      <div className="font-medium text-slate-800">{inr(i.amount + i.gstAmount)}</div>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                    Items {inr(p.subtotal)} - GST {inr(p.gstAmount)} - Paid {inr(p.paidAmount)}{!p.isVoid && p.due > 0.004 ? ' - Due ' + inr(p.due) : ''}
                    {p.createdByName ? ' - entered by ' + p.createdByName : ''}
                    {p.note ? ' - ' + p.note : ''}
                  </div>
                  {p.payments.length > 0 && (
                    <div className="space-y-0.5 text-xs text-slate-500">
                      {p.payments.map((x) => (
                        <div key={x.id} className={x.isVoid ? 'line-through opacity-60' : ''}>
                          {dt(x.createdAt)}: {inr(x.amount)} by {modeLabel[x.mode] || x.mode}{x.reference ? ' (' + x.reference + ')' : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {p.isVoid && <div className="text-xs text-rose-600">Cancelled: {p.voidReason}{p.voidedByName ? ' (' + p.voidedByName + ')' : ''}</div>}
                  {!p.isVoid && (
                    <div className="flex gap-2 pt-1">
                      {p.due > 0.004 && (
                        <button onClick={() => setPay({ presetId: p.id })} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Pay this bill</button>
                      )}
                      <button onClick={() => setCancelP(p)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"><Ban size={12} /> Cancel purchase</button>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {tab === 'payments' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Bill</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Details</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.payments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No payments yet.</td></tr>}
              {d.payments.map((x) => (
                <tr key={x.id} className={x.isVoid ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 text-slate-600">{dt(x.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{x.purchaseNo || '-'}{x.isVoid && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Cancelled</span>}</td>
                  <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">
                    {[modeLabel[x.mode] || x.mode, x.reference ? 'Ref ' + x.reference : null, x.note, x.createdByName ? 'by ' + x.createdByName : null].filter(Boolean).join(' - ')}
                    {x.isVoid && <div className="text-rose-600">Reason: {x.voidReason}{x.voidedByName ? ' (' + x.voidedByName + ')' : ''}</div>}
                  </td>
                  <td className={'px-4 py-3 text-right font-semibold text-slate-800 ' + (x.isVoid ? 'line-through' : '')}>{inr(x.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    {!x.isVoid && (
                      <button onClick={() => setCancelPay(x)} title="Cancel this payment" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Ban size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SupplierForm editing={s} onClose={() => setEdit(false)} onSaved={load} />}
      {pay && <PayModal supplier={{ id: s.id, name: s.name }} purchases={d.purchases} presetId={pay.presetId} onClose={() => setPay(null)} onDone={load} />}
      {cancelP && (
        <CancelPurchaseModal
          purchase={cancelP}
          onClose={() => setCancelP(null)}
          onDone={() => {
            setCancelP(null);
            load();
          }}
        />
      )}
      {cancelPay && (
        <ReasonModal
          title="Cancel this payment?"
          subtitle={inr(cancelPay.amount) + ' on ' + dt(cancelPay.createdAt)}
          note="The amount will be added back to the supplier due balance."
          presets={['Wrong amount', 'Entered by mistake', 'Wrong supplier', 'Payment failed']}
          confirm="Cancel payment"
          onClose={() => setCancelPay(null)}
          onConfirm={async (reason) => {
            try {
              await api('/suppliers/payments/' + cancelPay.id + '/void', { method: 'POST', body: JSON.stringify({ reason }) });
              toast.show('success', 'Payment cancelled.');
              setCancelPay(null);
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
function AllPurchases(props: { onOpen: (id: number) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Pur[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      if (range === 'week') {
        const f = new Date(s);
        f.setDate(f.getDate() - 6);
        qs.set('from', f.toISOString());
        qs.set('to', e.toISOString());
      }
      if (range === 'month') {
        qs.set('from', new Date(s.getFullYear(), s.getMonth(), 1).toISOString());
        qs.set('to', e.toISOString());
      }
      if (q.trim()) qs.set('q', q.trim());
      api<Pur[]>('/purchases?' + qs.toString())
        .then(setRows)
        .catch((err) => toast.show('error', err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [range, q]);
  const live = rows.filter((r) => !r.isVoid);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Purchased" value={inr(r2(live.reduce((s, r) => s + r.total, 0)))} />
        <Stat label="Paid" value={inr(r2(live.reduce((s, r) => s + r.paidAmount, 0)))} tone="text-emerald-600" />
        <Stat label="Due" value={inr(r2(live.reduce((s, r) => s + r.due, 0)))} tone="text-rose-600" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button onClick={() => setRange('week')} className={chip(range === 'week')}>Last 7 days</button>
          <button onClick={() => setRange('month')} className={chip(range === 'month')}>This month</button>
          <button onClick={() => setRange('all')} className={chip(range === 'all')}>All</button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search purchase no, bill no or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Purchase</th>
              <th className="px-4 py-3 font-semibold">Supplier</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Bill date</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">Due</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No purchases found.</td></tr>}
            {rows.map((r) => {
              const st = statusOf(r);
              return (
                <tr key={r.id} onClick={() => r.supplier && props.onOpen(r.supplier.id)} className={'cursor-pointer hover:bg-slate-50/60 ' + (r.isVoid ? 'opacity-50' : '')}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.purchaseNo}{r.billNo && <div className="text-xs font-normal text-slate-400">Bill {r.billNo}</div>}</td>
                  <td className="px-4 py-3 text-slate-700">{r.supplier ? r.supplier.name : '-'}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{dt(r.billDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(r.total)}</td>
                  <td className="hidden px-4 py-3 text-right text-slate-600 md:table-cell">{r.due > 0.004 ? inr(r.due) : '-'}</td>
                  <td className="px-4 py-3"><span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + st.tone}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function SupplierList(props: { onOpen: (id: number) => void; onNewPurchase: (s: SupRef | null) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<'suppliers' | 'purchases'>('suppliers');
  const [list, setList] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ editing: Sup | null } | null>(null);
  function load() {
    api<Sup[]>('/suppliers?q=' + encodeURIComponent(q.trim()))
      .then(setList)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q]);
  async function toggle(s: Sup) {
    try {
      await api('/suppliers/' + s.id, { method: 'PUT', body: JSON.stringify({ isActive: !s.isActive }) });
      toast.show('success', s.isActive ? 'Supplier deactivated.' : 'Supplier activated.');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  const totalDue = r2(list.reduce((s, x) => s + x.due, 0));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Truck size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Suppliers</h1>
            <p className="text-sm text-slate-500">Buy stock, pay suppliers and see what is due</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setForm({ editing: null })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={16} /> Add supplier
          </button>
          <button onClick={() => props.onNewPurchase(null)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            <Plus size={16} /> New purchase
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab('suppliers')} className={chip(tab === 'suppliers')}>Suppliers</button>
        <button onClick={() => setTab('purchases')} className={chip(tab === 'purchases')}>All purchases</button>
      </div>
      {tab === 'purchases' && <AllPurchases onOpen={props.onOpen} />}
      {tab === 'suppliers' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Suppliers" value={String(list.length)} />
            <Stat label="Total purchased" value={inr(r2(list.reduce((s, x) => s + x.totalPurchased, 0)))} />
            <Stat label="Total due to suppliers" value={inr(totalDue)} tone={totalDue > 0.004 ? 'text-rose-600' : 'text-slate-800'} />
          </div>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + ' pl-9'} placeholder="Search by name, contact person or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Supplier</th>
                  <th className="hidden px-5 py-3 font-semibold md:table-cell">Contact</th>
                  <th className="hidden px-5 py-3 text-right font-semibold md:table-cell">Purchased</th>
                  <th className="px-5 py-3 text-right font-semibold">Due</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>}
                {!loading && list.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No suppliers found. Tap Add supplier or New purchase to start.</td></tr>}
                {list.map((s) => (
                  <tr key={s.id} className={'hover:bg-slate-50/60 ' + (s.isActive ? '' : 'opacity-50')}>
                    <td className="px-5 py-3">
                      <button onClick={() => props.onOpen(s.id)} className="font-medium text-indigo-700 hover:underline">{s.name}</button>
                      <div className="text-xs text-slate-400">{s.purchaseCount} purchases</div>
                    </td>
                    <td className="hidden px-5 py-3 text-slate-600 md:table-cell">
                      <div>{s.contactPerson || '-'}</div>
                      <div className="text-xs text-slate-400">{s.phone ? '+91 ' + s.phone : ''}</div>
                    </td>
                    <td className="hidden px-5 py-3 text-right text-slate-700 md:table-cell">{inr(s.totalPurchased)}</td>
                    <td className={'px-5 py-3 text-right font-semibold ' + (s.due > 0.004 ? 'text-rose-600' : 'text-slate-700')}>{inr(s.due)}</td>
                    <td className="px-5 py-3">
                      <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{s.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1 text-slate-400">
                        {s.isActive && (
                          <button onClick={() => props.onNewPurchase({ id: s.id, name: s.name })} className="rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">New purchase</button>
                        )}
                        <button onClick={() => setForm({ editing: s })} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={16} /></button>
                        <button onClick={() => toggle(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600"><Power size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {form && <SupplierForm editing={form.editing} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  );
}
type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'purchase'; supplier: SupRef | null };
export default function Suppliers() {
  const [view, setView] = useState<View>({ kind: 'list' });
  if (view.kind === 'detail') {
    return (
      <SupplierDetail
        id={view.id}
        onBack={() => setView({ kind: 'list' })}
        onNewPurchase={(s) => setView({ kind: 'purchase', supplier: s })}
      />
    );
  }
  if (view.kind === 'purchase') {
    return (
      <NewPurchase
        supplier={view.supplier}
        onCancel={() => setView(view.supplier ? { kind: 'detail', id: view.supplier.id } : { kind: 'list' })}
        onDone={(sid) => setView({ kind: 'detail', id: sid })}
      />
    );
  }
  return (
    <SupplierList
      onOpen={(id) => setView({ kind: 'detail', id })}
      onNewPurchase={(s) => setView({ kind: 'purchase', supplier: s })}
    />
  );
}
