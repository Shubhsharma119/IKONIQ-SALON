import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Power, Gift, Clock } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Svc = { id: number; name: string; price: string | number; durationMin: number; isActive: boolean; category: { name: string } };
type Pkg = {
  id: number;
  name: string;
  kind: string;
  description: string | null;
  price: string | number;
  validityDays: number;
  sessionCount: number | null;
  isActive: boolean;
  services: { id: number; serviceId: number; service: { id: number; name: string; price: string | number; durationMin: number } }[];
};
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
const kindLabel: Record<string, string> = { COMBO: 'Group of services', SESSION: 'Session package' };
const kindTone: Record<string, string> = { COMBO: 'bg-indigo-50 text-indigo-700', SESSION: 'bg-violet-50 text-violet-700' };
function validityLabel(d: number) {
  if (d === 30) return 'Monthly (30 days)';
  if (d === 90) return 'Quarterly (90 days)';
  if (d === 180) return 'Half-yearly (180 days)';
  if (d === 365) return 'Yearly (365 days)';
  return d + ' days';
}
const emptyForm = {
  name: '', kind: 'COMBO', description: '', price: '', validityDays: '30', sessionCount: '',
  serviceIds: [] as number[],
};
type Errors = { name?: string; price?: string; validityDays?: string; serviceIds?: string; sessionCount?: string };
function validate(f: typeof emptyForm): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the package name (at least 2 letters).';
  if (f.serviceIds.length === 0) e.serviceIds = 'Select at least one service.';
  if (f.kind === 'SESSION' && (!/^\d+$/.test(f.sessionCount) || Number(f.sessionCount) < 1)) {
    e.sessionCount = 'Enter the number of sessions (1 or more).';
  }
  const p = Number(f.price);
  if (f.price === '' || isNaN(p) || p < 0) e.price = 'Enter a valid package price.';
  const v = Number(f.validityDays);
  if (!/^\d+$/.test(f.validityDays) || v < 1) e.validityDays = 'Enter the validity in days (1 or more).';
  return e;
}
export default function Packages() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');
  const [list, setList] = useState<Pkg[]>([]);
  const [services, setServices] = useState<Svc[]>([]);
  const [filter, setFilter] = useState<'all' | 'COMBO' | 'SESSION'>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  function load() {
    Promise.all([api<Pkg[]>('/packages'), api<Svc[]>('/services')])
      .then(([p, s]) => {
        setList(p);
        setServices(s);
      })
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
  function openEdit(p: Pkg) {
    setEditing(p);
    setForm({
      name: p.name,
      kind: p.kind,
      description: p.description || '',
      price: String(Number(p.price)),
      validityDays: String(p.validityDays),
      sessionCount: p.sessionCount ? String(p.sessionCount) : '',
      serviceIds: p.services.map((s) => s.serviceId),
    });
    setErrors({});
    setShowForm(true);
  }
  function toggleService(id: number) {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id],
    }));
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
      await api(editing ? '/packages/' + editing.id : '/packages', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          description: form.description.trim(),
          price: Number(form.price),
          validityDays: Number(form.validityDays),
          sessionCount: form.kind === 'SESSION' ? Number(form.sessionCount) : undefined,
          serviceIds: form.serviceIds,
        }),
      });
      toast.show('success', editing ? 'Package updated successfully.' : 'Package added successfully.');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Pkg) {
    const word = p.isActive ? 'deactivate' : 'activate';
    if (!window.confirm('Do you want to ' + word + ' ' + p.name + '?')) return;
    try {
      await api('/packages/' + p.id, { method: 'PUT', body: JSON.stringify({ isActive: !p.isActive }) });
      toast.show('success', 'Package ' + word + 'd successfully.');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  const selectable = services.filter((s) => s.isActive || form.serviceIds.includes(s.id));
  const chosen = services.filter((s) => form.serviceIds.includes(s.id));
  const regular = chosen.reduce((n, s) => n + Number(s.price), 0);
  const priceNum = Number(form.price);
  const sessionsNum = Number(form.sessionCount);
  let priceHint = 'The price the customer pays for the whole package.';
  if (form.kind === 'SESSION') {
    priceHint =
      form.price !== '' && !isNaN(priceNum) && sessionsNum >= 1
        ? 'That is about ' + inr(Math.round(priceNum / sessionsNum)) + ' per session.'
        : 'Total price for all sessions.';
  } else if (chosen.length > 0) {
    priceHint = 'Regular price of selected services: ' + inr(regular);
    if (form.price !== '' && !isNaN(priceNum)) {
      priceHint +=
        priceNum < regular
          ? ' - customer saves ' + inr(regular - priceNum)
          : priceNum > regular
          ? ' - note: package price is higher than the regular price'
          : '';
    }
  }
  const shown = list.filter((p) => filter === 'all' || p.kind === filter);
  const chip = (active: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Gift size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Packages</h1>
            <p className="text-sm text-slate-500">{shown.length} packages</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add package
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
        <button onClick={() => setFilter('COMBO')} className={chip(filter === 'COMBO')}>Group of services</button>
        <button onClick={() => setFilter('SESSION')} className={chip(filter === 'SESSION')}>Session packages</button>
      </div>
      {loading && <div className="text-slate-400">Loading...</div>}
      {!loading && shown.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No packages found.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => {
          const reg = p.services.reduce((n, s) => n + Number(s.service.price), 0);
          const price = Number(p.price);
          const pct = reg > 0 ? Math.round(((reg - price) / reg) * 100) : 0;
          const isSession = p.kind === 'SESSION';
          return (
            <div key={p.id} className={'flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ' + (p.isActive ? '' : 'opacity-50')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{p.name}</div>
                  <span className={'mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ' + kindTone[p.kind]}>
                    {kindLabel[p.kind]}
                  </span>
                </div>
                <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  {p.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {p.description && <p className="mt-2 text-sm text-slate-500">{p.description}</p>}
              {isSession && p.sessionCount && (
                <div className="mt-3 text-sm font-semibold text-violet-700">{p.sessionCount} sessions</div>
              )}
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <Clock size={13} /> Valid for {validityLabel(p.validityDays)}
              </div>
              {p.services.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.services.map((s) => (
                    <span key={s.id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {s.service.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-end justify-between pt-4">
                <div>
                  <div className="text-2xl font-bold text-slate-800">{inr(price)}</div>
                  {isSession && p.sessionCount ? (
                    <div className="text-xs text-slate-400">about {inr(Math.round(price / p.sessionCount))} per session</div>
                  ) : (
                    reg > price && (
                      <div className="text-xs text-slate-400">
                        <span className="line-through">{inr(reg)}</span>{' '}
                        <span className="font-medium text-emerald-600">Save {inr(reg - price)} ({pct}%)</span>
                      </div>
                    )
                  )}
                </div>
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
          );
        })}
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Edit package' : 'Add new package'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Package name" required error={errors.name}>
              <input className={inputCls} placeholder="e.g. Bridal Glow Package" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field
              label="Package type"
              required
              hint={form.kind === 'COMBO' ? 'A bundle of services sold together at one price.' : 'A fixed number of visits the customer can use over time.'}
            >
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="COMBO">Group of services</option>
                <option value="SESSION">Session package</option>
              </select>
            </Field>
            <Field label="Description" hint="Optional. Shown on the package card.">
              <textarea className={inputCls} rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field
              label="Included services"
              required
              error={errors.serviceIds}
              hint={
                chosen.length
                  ? chosen.length + ' selected'
                  : form.kind === 'SESSION' ? 'Any of these services can be used in a session.' : 'Select one or more services.'
              }
            >
              <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-300">
                {selectable.length === 0 && <div className="p-3 text-sm text-slate-400">No services found. Add services first.</div>}
                {selectable.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={form.serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                    <span className="flex-1 text-slate-800">
                      {s.name} <span className="text-xs text-slate-400">({s.category?.name})</span>
                    </span>
                    <span className="text-slate-600">{inr(Number(s.price))}</span>
                  </label>
                ))}
              </div>
            </Field>
            {form.kind === 'SESSION' && (
              <Field label="Number of sessions" required error={errors.sessionCount} hint="Total visits included in this package.">
                <input className={inputCls} type="number" min="1" step="1" placeholder="e.g. 6" value={form.sessionCount}
                  onChange={(e) => setForm({ ...form, sessionCount: e.target.value })} />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={'Package price (\u20B9)'} required error={errors.price} hint={priceHint}>
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 1500" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field
                label="Validity (days)"
                required
                error={errors.validityDays}
                hint={form.kind === 'SESSION' ? 'Unused sessions expire after this many days.' : 'How long the package stays valid after purchase.'}
              >
                <input className={inputCls} type="number" min="1" step="1" placeholder="e.g. 90" value={form.validityDays}
                  onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[['Monthly', '30'], ['Quarterly', '90'], ['Yearly', '365']].map(([label, v]) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, validityDays: v })}
                      className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update package' : 'Save package'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
