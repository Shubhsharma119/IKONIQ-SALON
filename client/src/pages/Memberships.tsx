import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Power, Crown, Clock, Info } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Plan = {
  id: number;
  name: string;
  description: string | null;
  price: string | number;
  validityDays: number;
  discountPercent: string | number;
  isActive: boolean;
};
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
function validityLabel(d: number) {
  if (d === 30) return 'Monthly (30 days)';
  if (d === 90) return 'Quarterly (90 days)';
  if (d === 180) return 'Half-yearly (180 days)';
  if (d === 365) return 'Yearly (365 days)';
  return d + ' days';
}
const emptyForm = { name: '', description: '', price: '', validityDays: '365', discountPercent: '' };
type Errors = Partial<Record<keyof typeof emptyForm, string>>;
function validate(f: typeof emptyForm): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the plan name (at least 2 letters).';
  const p = Number(f.price);
  if (f.price === '' || isNaN(p) || p < 0) e.price = 'Enter a valid membership price.';
  const v = Number(f.validityDays);
  if (!/^\d+$/.test(f.validityDays) || v < 1) e.validityDays = 'Enter the validity in days (1 or more).';
  const d = Number(f.discountPercent);
  if (f.discountPercent === '' || isNaN(d) || d < 0 || d > 100) e.discountPercent = 'Enter a discount between 0 and 100.';
  return e;
}
export default function Memberships() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');
  const [list, setList] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  function load() {
    api<Plan[]>('/memberships')
      .then(setList)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setShowForm(true);
  }
  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || '',
      price: String(Number(p.price)),
      validityDays: String(p.validityDays),
      discountPercent: String(Number(p.discountPercent)),
    });
    setErrors({});
    setShowForm(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    setBusy(true);
    try {
      await api(editing ? '/memberships/' + editing.id : '/memberships', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          validityDays: Number(form.validityDays),
          discountPercent: Number(form.discountPercent),
        }),
      });
      toast.show('success', editing ? 'Membership plan updated successfully.' : 'Membership plan added successfully.');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Plan) {
    const word = p.isActive ? 'deactivate' : 'activate';
    if (!window.confirm('Do you want to ' + word + ' ' + p.name + '?')) return;
    try {
      await api('/memberships/' + p.id, { method: 'PUT', body: JSON.stringify({ isActive: !p.isActive }) });
      toast.show('success', 'Membership plan ' + word + 'd successfully.');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Crown size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Memberships</h1>
            <p className="text-sm text-slate-500">{list.length} membership plans</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add membership plan
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div>
          Memberships are given to customers from the Billing screen, so the payment is recorded on the bill.
          Customers who hold an active membership will be listed here once Billing is ready.
        </div>
      </div>
      {loading && <div className="text-slate-400">Loading...</div>}
      {!loading && list.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No membership plans yet.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className={'flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ' + (p.isActive ? '' : 'opacity-50')}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-slate-800">{p.name}</div>
              <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                {p.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {p.description && <p className="mt-2 text-sm text-slate-500">{p.description}</p>}
            <div className="mt-3">
              {Number(p.discountPercent) > 0 ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                  {Number(p.discountPercent)}% off on services
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">No discount (record only)</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <Clock size={13} /> Valid for {validityLabel(p.validityDays)}
            </div>
            <div className="mt-auto flex items-end justify-between pt-4">
              <div className="text-2xl font-bold text-slate-800">{inr(Number(p.price))}</div>
              {canManage && (
                <div className="flex gap-1 text-slate-400">
                  <button onClick={() => openEdit(p)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => toggle(p)} title={p.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600">
                    <Power size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Edit membership plan' : 'Add membership plan'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Plan name" required error={errors.name}>
              <input className={inputCls} placeholder="e.g. Gold Membership" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Description" hint="Optional. Shown on the plan card.">
              <textarea className={inputCls} rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={'Membership price (\u20B9)'} required error={errors.price} hint="Amount the customer pays for the plan.">
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 5000" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Discount on services (%)" required error={errors.discountPercent} hint="Applied on services while the membership is valid. Use 0 for no discount.">
                <input className={inputCls} type="number" min="0" max="100" step="any" placeholder="e.g. 10" value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
              </Field>
            </div>
            <Field label="Validity (days)" required error={errors.validityDays} hint="How long the membership stays active after purchase.">
              <input className={inputCls} type="number" min="1" step="1" placeholder="e.g. 365" value={form.validityDays}
                onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-2">
                {[['Monthly', '30'], ['Quarterly', '90'], ['Half-yearly', '180'], ['Yearly', '365']].map(([label, v]) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, validityDays: v })}
                    className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update plan' : 'Save plan'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
