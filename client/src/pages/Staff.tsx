import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Power, UserCog, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Profile = {
  designation: string | null;
  joiningDate: string | null;
  baseSalary: string | number;
  commissionPercent: string | number;
};
type Staff = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  isActive: boolean;
  staffProfile: Profile | null;
};
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
const roleLabel: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  STAFF: 'Staff',
  ACCOUNTANT: 'Accountant',
};
const roleTone: Record<string, string> = {
  OWNER: 'bg-violet-50 text-violet-700',
  ADMIN: 'bg-indigo-50 text-indigo-700',
  MANAGER: 'bg-blue-50 text-blue-700',
  RECEPTIONIST: 'bg-amber-50 text-amber-700',
  STAFF: 'bg-emerald-50 text-emerald-700',
  ACCOUNTANT: 'bg-rose-50 text-rose-700',
};
const emptyForm = {
  name: '',
  phone: '',
  email: '',
  password: '',
  role: 'STAFF',
  designation: '',
  joiningDate: '',
  baseSalary: '0',
  commissionPercent: '0',
};
type Errors = Partial<Record<keyof typeof emptyForm, string>>;
function validate(f: typeof emptyForm, isEdit: boolean): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the full name (at least 2 letters).';
  if (!isEdit && !/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!isEdit && f.password.length < 6) e.password = 'Password must be at least 6 characters.';
  if (isEdit && f.password && f.password.length < 6) e.password = 'New password must be at least 6 characters.';
  if (f.baseSalary === '' || isNaN(Number(f.baseSalary)) || Number(f.baseSalary) < 0) e.baseSalary = 'Enter a valid salary (0 or more).';
  const c = Number(f.commissionPercent);
  if (f.commissionPercent === '' || isNaN(c) || c < 0 || c > 100) e.commissionPercent = 'Commission must be between 0 and 100.';
  return e;
}
export default function StaffPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  function load() {
    api<Staff[]>('/staff')
      .then(setList)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setShowPw(false);
    setShowForm(true);
  }
  function openEdit(s: Staff) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone,
      email: s.email || '',
      password: '',
      role: s.role,
      designation: s.staffProfile?.designation || '',
      joiningDate: s.staffProfile?.joiningDate ? s.staffProfile.joiningDate.slice(0, 10) : '',
      baseSalary: String(Number(s.staffProfile?.baseSalary ?? 0)),
      commissionPercent: String(Number(s.staffProfile?.commissionPercent ?? 0)),
    });
    setErrors({});
    setShowPw(false);
    setShowForm(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const isEdit = !!editing;
    const errs = validate(form, isEdit);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      designation: form.designation.trim(),
      baseSalary: Number(form.baseSalary),
      commissionPercent: Number(form.commissionPercent),
    };
    if (form.email.trim()) body.email = form.email.trim();
    if (form.joiningDate) body.joiningDate = form.joiningDate;
    if (form.password) body.password = form.password;
    if (!isEdit) body.phone = form.phone;
    if (!(isEdit && editing!.role === 'OWNER')) body.role = form.role;
    setBusy(true);
    try {
      await api(isEdit ? '/staff/' + editing!.id : '/staff', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show('success', isEdit ? 'Staff member updated successfully.' : 'Staff member added successfully.');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(s: Staff) {
    const word = s.isActive ? 'deactivate' : 'activate';
    if (!window.confirm('Do you want to ' + word + ' ' + s.name + '?')) return;
    try {
      await api('/staff/' + s.id, { method: 'PUT', body: JSON.stringify({ isActive: !s.isActive }) });
      toast.show('success', 'Staff member ' + word + 'd successfully.');
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  const isOwnerRow = editing?.role === 'OWNER';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserCog size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Staff</h1>
            <p className="text-sm text-slate-500">{list.length} team members</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add staff
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Mobile</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Designation</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Base salary</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Commission</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            )}
            {!loading && list.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No staff found.</td></tr>
            )}
            {list.map((s) => {
              const canEdit = canManage && !(s.role === 'OWNER' && user?.role !== 'OWNER');
              const canToggle = canManage && s.role !== 'OWNER' && s.id !== user?.id;
              return (
                <tr key={s.id} className={'hover:bg-slate-50/60 ' + (s.isActive ? '' : 'opacity-50')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-medium text-slate-800">{s.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (roleTone[s.role] || 'bg-slate-100 text-slate-600')}>
                      {roleLabel[s.role] || s.role}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3 text-slate-600 md:table-cell">+91 {s.phone}</td>
                  <td className="hidden px-5 py-3 text-slate-600 lg:table-cell">{s.staffProfile?.designation || '-'}</td>
                  <td className="hidden px-5 py-3 text-slate-800 lg:table-cell">{inr(Number(s.staffProfile?.baseSalary ?? 0))}</td>
                  <td className="hidden px-5 py-3 text-slate-600 lg:table-cell">{Number(s.staffProfile?.commissionPercent ?? 0)}%</td>
                  <td className="px-5 py-3">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1 text-slate-400">
                      {canEdit && (
                        <button onClick={() => openEdit(s)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600">
                          <Pencil size={16} />
                        </button>
                      )}
                      {canToggle && (
                        <button onClick={() => toggle(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600">
                          <Power size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Edit staff member' : 'Add new staff member'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Full name" required error={errors.name}>
              <input className={inputCls} placeholder="e.g. Rahul Verma" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field
              label="Mobile number"
              required={!editing}
              error={errors.phone}
              hint={editing ? 'Mobile number is the login ID and cannot be changed.' : '10 digits, without country code. This is the login ID.'}
            >
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                <input
                  className={inputCls + ' rounded-l-none disabled:bg-slate-50 disabled:text-slate-500'}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  disabled={!!editing}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </div>
            </Field>
            <Field label="Email address" error={errors.email} hint="Optional.">
              <input className={inputCls} type="email" placeholder="name@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field
              label={editing ? 'New password' : 'Password'}
              required={!editing}
              error={errors.password}
              hint={editing ? 'Leave blank to keep the current password.' : 'At least 6 characters.'}
            >
              <div className="relative">
                <input
                  className={inputCls + ' pr-10'}
                  type={showPw ? 'text' : 'password'}
                  placeholder={editing ? 'Enter only to reset' : 'Create a password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Show or hide password"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Role" required hint="Decides what this person can access.">
                <select
                  className={inputCls + ' disabled:bg-slate-50'}
                  disabled={isOwnerRow}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {isOwnerRow && <option value="OWNER">Owner</option>}
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="RECEPTIONIST">Receptionist</option>
                  <option value="STAFF">Staff (stylist)</option>
                  <option value="ACCOUNTANT">Accountant</option>
                </select>
              </Field>
              <Field label="Designation" hint="e.g. Senior Stylist, Beautician">
                <input className={inputCls} placeholder="Enter designation" value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Joining date">
                <input className={inputCls} type="date" value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
              </Field>
              <Field label={'Base salary (\u20B9)'} required error={errors.baseSalary} hint="Per month.">
                <input className={inputCls} type="number" min="0" step="1" placeholder="e.g. 15000" value={form.baseSalary}
                  onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} />
              </Field>
              <Field label="Commission (%)" required error={errors.commissionPercent} hint="On services done.">
                <input className={inputCls} type="number" min="0" max="100" step="0.5" placeholder="e.g. 10" value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update staff' : 'Save staff'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
