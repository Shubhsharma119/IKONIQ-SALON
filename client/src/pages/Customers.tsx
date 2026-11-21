import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, Pencil, Power, Users, History } from 'lucide-react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  dob: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};
const emptyForm = { name: '', phone: '', email: '', gender: '', dob: '', notes: '' };
type Errors = Partial<Record<keyof typeof emptyForm, string>>;
function validate(f: typeof emptyForm): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the full name (at least 2 letters).';
  if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  return e;
}
export default function Customers() {
  const toast = useToast();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  function load(search: string) {
    api<Customer[]>('/customers?q=' + encodeURIComponent(search))
      .then(setList)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setShowForm(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      gender: c.gender || '',
      dob: c.dob ? c.dob.slice(0, 10) : '',
      notes: c.notes || '',
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
    const body: Record<string, string> = { name: form.name.trim(), phone: form.phone };
    if (form.email.trim()) body.email = form.email.trim();
    if (form.gender) body.gender = form.gender;
    if (form.dob) body.dob = form.dob;
    if (form.notes.trim()) body.notes = form.notes.trim();
    setBusy(true);
    try {
      await api(editing ? '/customers/' + editing.id : '/customers', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show('success', editing ? 'Customer updated successfully.' : 'Customer added successfully.');
      setShowForm(false);
      load(q);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(c: Customer) {
    const word = c.isActive ? 'deactivate' : 'activate';
    if (!window.confirm('Do you want to ' + word + ' ' + c.name + '?')) return;
    try {
      await api('/customers/' + c.id, { method: 'PUT', body: JSON.stringify({ isActive: !c.isActive }) });
      toast.show('success', 'Customer ' + word + 'd successfully.');
      load(q);
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
            <p className="text-sm text-slate-500">{list.length} customers found</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus size={16} /> Add customer
        </button>
      </div>
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={inputCls + ' pl-9'}
          placeholder="Search by name or mobile number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Mobile</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Email</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Joined</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            )}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No customers found.</td></tr>
            )}
            {list.map((c) => (
              <tr key={c.id} className={'hover:bg-slate-50/60 ' + (c.isActive ? '' : 'opacity-50')}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <Link to={'/customers/' + c.id} className="font-medium text-indigo-700 hover:underline">{c.name}</Link>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600">+91 {c.phone}</td>
                <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{c.email || '-'}</td>
                <td className="hidden px-5 py-3 text-slate-500 md:table-cell">
                  {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                      (c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')
                    }
                  >
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1 text-slate-400">
                    <Link to={'/customers/' + c.id} title="View history" className="rounded-lg p-2 hover:bg-emerald-50 hover:text-emerald-600"><History size={16} /></Link>
                    <button onClick={() => openEdit(c)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => toggle(c)} title={c.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600">
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
          title={editing ? 'Edit customer' : 'Add new customer'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Full name" required error={errors.name}>
              <input className={inputCls} placeholder="e.g. Priya Sharma" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Mobile number" required error={errors.phone} hint="10 digits, without country code.">
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                <input
                  className={inputCls + ' rounded-l-none'}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </div>
            </Field>
            <Field label="Email address" error={errors.email} hint="Optional.">
              <input className={inputCls} type="email" placeholder="name@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Gender">
                <select className={inputCls} value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input className={inputCls} type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" hint="Allergies, preferences, anything staff should know.">
              <textarea className={inputCls} rows={3} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update customer' : 'Save customer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}




