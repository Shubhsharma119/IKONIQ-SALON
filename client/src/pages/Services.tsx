import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Power, Tag, Scissors } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Category = { id: number; name: string };
type Service = {
  id: number;
  name: string;
  categoryId: number;
  price: string | number;
  durationMin: number;
  isActive: boolean;
  category: Category;
};
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
const emptyForm = { name: '', categoryId: '', price: '', durationMin: '30' };
type Errors = Partial<Record<keyof typeof emptyForm, string>>;
function validate(f: typeof emptyForm): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the service name (at least 2 letters).';
  if (!f.categoryId) e.categoryId = 'Select a category. Use "Add category" if none exists.';
  if (f.price === '' || isNaN(Number(f.price)) || Number(f.price) < 0) e.price = 'Enter a valid price (0 or more).';
  if (!/^\d+$/.test(f.durationMin) || Number(f.durationMin) < 1) e.durationMin = 'Enter the duration in minutes (1 or more).';
  return e;
}
export default function Services() {
  const toast = useToast();
  const [list, setList] = useState<Service[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState('');
  function load() {
    Promise.all([api<Service[]>('/services'), api<Category[]>('/services/categories')])
      .then(([s, c]) => {
        setList(s);
        setCats(c);
      })
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: filter ? String(filter) : '' });
    setErrors({});
    setShowForm(true);
  }
  function openEdit(s: Service) {
    setEditing(s);
    setForm({
      name: s.name,
      categoryId: String(s.categoryId),
      price: String(Number(s.price)),
      durationMin: String(s.durationMin),
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
      await api(editing ? '/services/' + editing.id : '/services', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          categoryId: Number(form.categoryId),
          price: Number(form.price),
          durationMin: Number(form.durationMin),
        }),
      });
      toast.show('success', editing ? 'Service updated successfully.' : 'Service added successfully.');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(s: Service) {
    try {
      await api('/services/' + s.id, { method: 'PUT', body: JSON.stringify({ isActive: !s.isActive }) });
      toast.show('success', s.isActive ? 'Service deactivated.' : 'Service activated.');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (catName.trim().length < 2) {
      setCatError('Enter the category name (at least 2 letters).');
      return;
    }
    try {
      await api('/services/categories', { method: 'POST', body: JSON.stringify({ name: catName.trim() }) });
      toast.show('success', 'Category added successfully.');
      setCatName('');
      setShowCat(false);
      load();
    } catch (err: any) {
      setCatError(err.message);
      toast.show('error', err.message);
    }
  }
  const shown = filter ? list.filter((s) => s.categoryId === filter) : list;
  const chip = (active: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Scissors size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Services</h1>
            <p className="text-sm text-slate-500">{shown.length} services listed</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setCatName(''); setCatError(''); setShowCat(true); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Tag size={16} /> Add category
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add service
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter(0)} className={chip(filter === 0)}>All</button>
        {cats.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} className={chip(filter === c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Service</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Category</th>
              <th className="px-5 py-3 font-semibold">Price</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Duration</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No services found.</td></tr>
            )}
            {shown.map((s) => (
              <tr key={s.id} className={'hover:bg-slate-50/60 ' + (s.isActive ? '' : 'opacity-50')}>
                <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="hidden px-5 py-3 sm:table-cell">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{s.category?.name}</span>
                </td>
                <td className="px-5 py-3 font-semibold text-slate-800">{inr(Number(s.price))}</td>
                <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{s.durationMin} min</td>
                <td className="px-5 py-3">
                  <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1 text-slate-400">
                    <button onClick={() => openEdit(s)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => toggle(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600">
                      <Power size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Edit service' : 'Add new service'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Service name" required error={errors.name} hint="e.g. Haircut, Facial, Hair Spa">
              <input className={inputCls} placeholder="Enter service name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              <select className={inputCls} value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select category</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={'Price (\u20B9)'} required error={errors.price} hint="Price in rupees.">
                <input className={inputCls} type="number" min="0" step="1" placeholder="e.g. 500" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Duration (minutes)" required error={errors.durationMin} hint="Time needed for this service.">
                <input className={inputCls} type="number" min="1" step="1" placeholder="e.g. 30" value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update service' : 'Save service'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {showCat && (
        <Modal title="Add category" subtitle="Group your services, e.g. Hair, Skin, Nails." onClose={() => setShowCat(false)}>
          <form onSubmit={addCategory} className="space-y-4" noValidate>
            <Field label="Category name" required error={catError}>
              <input className={inputCls} placeholder="Enter category name" value={catName}
                onChange={(e) => setCatName(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowCat(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Save category
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
