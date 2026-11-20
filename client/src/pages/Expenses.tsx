import { useEffect, useState, type FormEvent } from 'react';
import { Banknote, Plus, Pencil, Ban, Search, Tag } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Cat = { id: number; name: string };
type Exp = {
  id: number;
  categoryId: number;
  category: Cat;
  amount: number;
  mode: string;
  expenseDate: string;
  payee: string | null;
  reference: string | null;
  note: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdByName: string | null;
  voidedByName: string | null;
};
type Resp = {
  total: number;
  count: number;
  byCategory: { name: string; total: number }[];
  byMode: { mode: string; total: number }[];
  rows: Exp[];
};
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer' };
const emptyForm = () => ({ date: localDate(new Date()), categoryId: '', amount: '', mode: 'CASH', payee: '', reference: '', note: '' });
type Form = ReturnType<typeof emptyForm>;
type Errors = Partial<Record<keyof Form, string>>;
function validate(f: Form): Errors {
  const e: Errors = {};
  if (!f.date) e.date = 'Select the expense date.';
  else if (f.date > localDate(new Date())) e.date = 'The date cannot be in the future.';
  if (!f.categoryId) e.categoryId = 'Select a category.';
  if (f.amount === '' || isNaN(Number(f.amount)) || Number(f.amount) <= 0) e.amount = 'Enter a valid amount (more than 0).';
  return e;
}
export default function Expenses() {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [catFilter, setCatFilter] = useState(0);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Exp | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<Exp | null>(null);
  const [reason, setReason] = useState('');
  const [showCat, setShowCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState('');
  function loadCats() {
    api<Cat[]>('/expenses/categories').then(setCats).catch((e) => toast.show('error', e.message));
  }
  function load() {
    const qs = new URLSearchParams();
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    if (range === 'today') {
      qs.set('from', s.toISOString());
      qs.set('to', e.toISOString());
    }
    if (range === 'week') {
      const f = new Date(s);
      f.setDate(f.getDate() - 6);
      qs.set('from', f.toISOString());
      qs.set('to', e.toISOString());
    }
    if (range === 'month') {
      const f = new Date(s.getFullYear(), s.getMonth(), 1);
      qs.set('from', f.toISOString());
      qs.set('to', e.toISOString());
    }
    if (catFilter) qs.set('categoryId', String(catFilter));
    if (q.trim()) qs.set('q', q.trim());
    api<Resp>('/expenses?' + qs.toString())
      .then(setData)
      .catch((err) => toast.show('error', err.message))
      .finally(() => setLoading(false));
  }
  useEffect(loadCats, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [range, catFilter, q]);
  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setErrors({});
  }
  function openEdit(r: Exp) {
    setEditing(r);
    setForm({
      date: localDate(new Date(r.expenseDate)),
      categoryId: String(r.categoryId),
      amount: String(r.amount),
      mode: r.mode,
      payee: r.payee || '',
      reference: r.reference || '',
      note: r.note || '',
    });
    setErrors({});
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    const body = {
      categoryId: Number(form.categoryId),
      amount: Number(form.amount),
      mode: form.mode,
      expenseDate: new Date(form.date + 'T12:00:00').toISOString(),
      payee: form.payee,
      reference: form.reference,
      note: form.note,
    };
    setBusy(true);
    try {
      await api(editing ? '/expenses/' + editing.id : '/expenses', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show('success', editing ? 'Expense updated successfully.' : 'Expense added successfully.');
      setForm(null);
      load();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function doVoid() {
    if (!voiding) return;
    if (reason.trim().length < 3) {
      toast.show('error', 'Enter a reason (at least 3 letters).');
      return;
    }
    setBusy(true);
    try {
      await api('/expenses/' + voiding.id + '/void', { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      toast.show('success', 'Expense voided.');
      setVoiding(null);
      setReason('');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (catName.trim().length < 2) {
      setCatError('Enter the category name (at least 2 letters).');
      return;
    }
    try {
      await api('/expenses/categories', { method: 'POST', body: JSON.stringify({ name: catName.trim() }) });
      toast.show('success', 'Category added successfully.');
      setCatName('');
      setShowCat(false);
      loadCats();
    } catch (err: any) {
      setCatError(err.message);
      toast.show('error', err.message);
    }
  }
  const chip = (on: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  const maxCat = data && data.byCategory.length ? data.byCategory[0].total : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Banknote size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
            <p className="text-sm text-slate-500">Rent, salary, supplies and every other salon expense</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setCatName(''); setCatError(''); setShowCat(true); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Tag size={16} /> Add category
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button onClick={() => setRange('today')} className={chip(range === 'today')}>Today</button>
          <button onClick={() => setRange('week')} className={chip(range === 'week')}>Last 7 days</button>
          <button onClick={() => setRange('month')} className={chip(range === 'month')}>This month</button>
          <button onClick={() => setRange('all')} className={chip(range === 'all')}>All</button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search paid to, note or reference" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCatFilter(0)} className={chip(catFilter === 0)}>All categories</button>
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCatFilter(c.id)} className={chip(catFilter === c.id)}>{c.name}</button>
        ))}
      </div>
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-500">Total expenses ({data.count} entries)</div>
            <div className="text-2xl font-bold text-amber-600">{inr(data.total)}</div>
            <div className="mt-2 space-y-0.5 text-xs text-slate-500">
              {data.byMode.map((m) => (
                <div key={m.mode} className="flex justify-between"><span>{modeLabel[m.mode] || m.mode}</span><span>{inr(m.total)}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
            <div className="mb-2 text-sm font-semibold text-slate-800">By category</div>
            {data.byCategory.length === 0 && <div className="text-sm text-slate-400">No expenses in this period.</div>}
            <div className="space-y-2">
              {data.byCategory.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-sm"><span className="text-slate-700">{c.name}</span><span className="font-medium text-slate-800">{inr(c.total)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: (maxCat ? (c.total / maxCat) * 100 : 0) + '%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Details</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Mode</th>
              <th className="px-5 py-3 text-right font-semibold">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>}
            {!loading && data && data.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No expenses found.</td></tr>}
            {data && data.rows.map((r) => (
              <tr key={r.id} className={'hover:bg-slate-50/60 ' + (r.isVoid ? 'opacity-50' : '')}>
                <td className="px-5 py-3 text-slate-600">{dt(r.expenseDate)}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{r.category.name}</span>
                  {r.isVoid && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Voided</span>}
                </td>
                <td className="hidden px-5 py-3 text-slate-600 md:table-cell">
                  <div className="text-slate-800">{r.payee || '-'}</div>
                  <div className="text-xs text-slate-400">
                    {[r.note, r.reference ? 'Ref: ' + r.reference : null, r.createdByName ? 'by ' + r.createdByName : null].filter(Boolean).join(' - ')}
                  </div>
                  {r.isVoid && <div className="text-xs text-rose-600">Reason: {r.voidReason}{r.voidedByName ? ' (' + r.voidedByName + ')' : ''}</div>}
                </td>
                <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{modeLabel[r.mode] || r.mode}</td>
                <td className={'px-5 py-3 text-right font-semibold text-slate-800 ' + (r.isVoid ? 'line-through' : '')}>{inr(r.amount)}</td>
                <td className="px-5 py-3">
                  {!r.isVoid && (
                    <div className="flex justify-end gap-1 text-slate-400">
                      <button onClick={() => openEdit(r)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={16} /></button>
                      <button onClick={() => { setVoiding(r); setReason(''); }} title="Void" className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600"><Ban size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal title={editing ? 'Edit expense' : 'Add expense'} subtitle="Fields marked with * are required." onClose={() => setForm(null)}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Date" required error={errors.date}>
                <input className={inputCls} type="date" max={localDate(new Date())} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label={'Amount (\u20B9)'} required error={errors.amount}>
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 5000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
            </div>
            <Field label="Category" required error={errors.categoryId} hint='Use "Add category" at the top if the category is missing.'>
              <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select category</option>
                {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Payment mode" required>
                <select className={inputCls} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="BANK">Bank transfer</option>
                </select>
              </Field>
              <Field label="Paid to" hint="Person or shop. Optional.">
                <input className={inputCls} placeholder="e.g. Landlord, Sharma Traders" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
              </Field>
            </div>
            <Field label="Reference" hint="UPI ID, cheque or receipt number. Optional.">
              <input className={inputCls} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
            <Field label="Note" hint="Optional.">
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update expense' : 'Save expense'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {voiding && (
        <Modal title="Void this expense?" subtitle={voiding.category.name + ' - ' + inr(voiding.amount) + ' - ' + dt(voiding.expenseDate)} onClose={() => setVoiding(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">A voided expense stays in the list for the record but is not counted in totals or on the dashboard.</p>
            <Field label="Reason" required>
              <input className={inputCls} placeholder="e.g. Entered twice by mistake" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => setVoiding(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={busy} onClick={doVoid} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {busy ? 'Saving...' : 'Void expense'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showCat && (
        <Modal title="Add category" subtitle="e.g. Equipment, Laundry, Travel." onClose={() => setShowCat(false)}>
          <form onSubmit={addCategory} className="space-y-4" noValidate>
            <Field label="Category name" required error={catError}>
              <input className={inputCls} placeholder="Enter category name" value={catName} onChange={(e) => setCatName(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowCat(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save category</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
