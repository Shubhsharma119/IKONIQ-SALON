import { useEffect, useState, type FormEvent } from 'react';
import { Plus, ChevronLeft, ChevronRight, Clock, Search, X, UserPlus, CalendarDays } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Cust = { id: number; name: string; phone: string; isActive: boolean };
type Svc = { id: number; name: string; price: string | number; durationMin: number; isActive: boolean; category: { name: string } };
type StaffRow = { id: number; name: string; role: string; isActive: boolean; staffProfile: { designation: string | null } | null };
type ApptService = { id: number; serviceId: number; price: string | number; durationMin: number; service: { id: number; name: string } };
type Appt = {
  id: number;
  startAt: string;
  endAt: string;
  status: string;
  isWalkIn: boolean;
  notes: string | null;
  staffId: number | null;
  customer: { id: number; name: string; phone: string };
  staff: { id: number; name: string } | null;
  services: ApptService[];
};
const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const toTimeStr = (d: Date) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
const statusMeta: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' },
  CHECKED_IN: { label: 'Waiting', cls: 'bg-amber-50 text-amber-700' },
  IN_PROGRESS: { label: 'In service', cls: 'bg-violet-50 text-violet-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
  NO_SHOW: { label: 'No show', cls: 'bg-rose-50 text-rose-700' },
};
type Form = { customer: Cust | null; staffId: string; date: string; time: string; serviceIds: number[]; notes: string };
const emptyForm = (): Form => ({ customer: null, staffId: '', date: toDateStr(new Date()), time: '10:00', serviceIds: [], notes: '' });
type Errors = { customer?: string; services?: string; date?: string; time?: string };
function ApptCard(props: {
  a: Appt;
  canWrite: boolean;
  onStatus: (a: Appt, s: string) => void;
  onEdit: (a: Appt) => void;
}) {
  const { a } = props;
  const meta = statusMeta[a.status];
  const total = a.services.reduce((n, s) => n + Number(s.price), 0);
  const btn = 'rounded-md border px-2 py-1 text-xs font-medium ';
  const dim = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
  return (
    <div className={'rounded-xl border border-slate-200 bg-white p-3 shadow-sm ' + (dim ? 'opacity-60' : '')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <Clock size={12} /> {fmtTime(a.startAt)} - {fmtTime(a.endAt)}
        </div>
        <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + meta.cls}>{meta.label}</span>
      </div>
      <div className="mt-1 font-medium text-slate-800">
        {a.customer.name}
        {a.isWalkIn && <span className="ml-2 text-[11px] font-medium text-amber-600">Walk-in</span>}
      </div>
      <div className="text-xs text-slate-500">+91 {a.customer.phone}</div>
      <div className="mt-1 text-sm text-slate-600">{a.services.map((s) => s.service.name).join(', ')}</div>
      <div className="text-xs text-slate-400">{inr(total)}</div>
      {a.notes && <div className="mt-1 text-xs italic text-slate-500">{a.notes}</div>}
      {props.canWrite && ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.status === 'SCHEDULED' && (
            <button className={btn + 'border-amber-300 text-amber-700 hover:bg-amber-50'} onClick={() => props.onStatus(a, 'CHECKED_IN')}>
              Check in
            </button>
          )}
          {a.status === 'CHECKED_IN' && (
            <button className={btn + 'border-violet-300 text-violet-700 hover:bg-violet-50'} onClick={() => props.onStatus(a, 'IN_PROGRESS')}>
              Start service
            </button>
          )}
          {a.status === 'IN_PROGRESS' && (
            <button className={btn + 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'} onClick={() => props.onStatus(a, 'COMPLETED')}>
              Complete
            </button>
          )}
          {(a.status === 'SCHEDULED' || a.status === 'CHECKED_IN') && (
            <button className={btn + 'border-slate-300 text-slate-600 hover:bg-slate-50'} onClick={() => props.onEdit(a)}>
              Reschedule
            </button>
          )}
          {a.status === 'SCHEDULED' && (
            <button className={btn + 'border-rose-300 text-rose-700 hover:bg-rose-50'} onClick={() => props.onStatus(a, 'NO_SHOW')}>
              No-show
            </button>
          )}
          {(a.status === 'SCHEDULED' || a.status === 'CHECKED_IN') && (
            <button className={btn + 'border-slate-300 text-slate-600 hover:bg-slate-50'} onClick={() => props.onStatus(a, 'CANCELLED')}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default function Appointments() {
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user?.role || '');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [services, setServices] = useState<Svc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [editing, setEditing] = useState<Appt | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [custQ, setCustQ] = useState('');
  const [custResults, setCustResults] = useState<Cust[]>([]);
  const stylists = staff.filter((s) => s.isActive && (s.role === 'STAFF' || s.role === 'MANAGER'));
  const activeServices = services.filter((s) => s.isActive);
  function load() {
    const from = new Date(date + 'T00:00:00');
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    api<Appt[]>('/appointments?from=' + encodeURIComponent(from.toISOString()) + '&to=' + encodeURIComponent(to.toISOString()))
      .then(setAppts)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, [date]);
  useEffect(() => {
    Promise.all([api<StaffRow[]>('/staff'), api<Svc[]>('/services')])
      .then(([st, sv]) => {
        setStaff(st);
        setServices(sv);
      })
      .catch((e) => toast.show('error', e.message));
  }, []);
  useEffect(() => {
    if (!showForm || form.customer) return;
    const t = setTimeout(() => {
      api<Cust[]>('/customers?q=' + encodeURIComponent(custQ))
        .then((r) => setCustResults(r.filter((c) => c.isActive).slice(0, 6)))
        .catch(() => setCustResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [custQ, showForm, form.customer]);
  function shift(n: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    setDate(toDateStr(d));
  }
  function openNew(isWalkIn: boolean) {
    setEditing(null);
    setWalkIn(isWalkIn);
    setForm({ ...emptyForm(), date: date < toDateStr(new Date()) ? toDateStr(new Date()) : date });
    setErrors({});
    setCustQ('');
    setCustResults([]);
    setShowForm(true);
  }
  function openEdit(a: Appt) {
    const s = new Date(a.startAt);
    setEditing(a);
    setWalkIn(false);
    setForm({
      customer: { id: a.customer.id, name: a.customer.name, phone: a.customer.phone, isActive: true },
      staffId: a.staffId ? String(a.staffId) : '',
      date: toDateStr(s),
      time: toTimeStr(s),
      serviceIds: a.services.map((x) => x.serviceId),
      notes: a.notes || '',
    });
    setErrors({});
    setCustQ('');
    setShowForm(true);
  }
  function toggleService(id: number) {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id],
    }));
  }
  const chosen = activeServices.filter((s) => form.serviceIds.includes(s.id));
  const totalPrice = chosen.reduce((n, s) => n + Number(s.price), 0);
  const totalMin = chosen.reduce((n, s) => n + s.durationMin, 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!form.customer) errs.customer = 'Select a customer.';
    if (form.serviceIds.length === 0) errs.services = 'Select at least one service.';
    let start = new Date();
    if (!walkIn) {
      if (!form.date) errs.date = 'Select the appointment date.';
      if (!form.time) errs.time = 'Select the appointment time.';
      if (form.date && form.time) {
        start = new Date(form.date + 'T' + form.time + ':00');
        if (start.getTime() < Date.now() - 5 * 60000) errs.time = 'Appointment time cannot be in the past.';
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    setBusy(true);
    try {
      const body = {
        customerId: form.customer!.id,
        staffId: form.staffId ? Number(form.staffId) : null,
        startAt: start.toISOString(),
        serviceIds: form.serviceIds,
        notes: form.notes.trim(),
        isWalkIn: walkIn,
      };
      await api(editing ? '/appointments/' + editing.id : '/appointments', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show(
        'success',
        editing ? 'Appointment updated successfully.' : walkIn ? 'Walk-in customer added to the queue.' : 'Appointment booked successfully.'
      );
      setShowForm(false);
      const newDate = walkIn ? toDateStr(new Date()) : form.date;
      if (newDate === date) load();
      else setDate(newDate);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(a: Appt, status: string) {
    let cancelReason: string | undefined;
    if (status === 'CANCELLED') {
      const r = window.prompt('Reason for cancellation (optional):', '');
      if (r === null) return;
      cancelReason = r.trim() || undefined;
    }
    if (status === 'NO_SHOW' && !window.confirm('Mark ' + a.customer.name + ' as a no-show?')) return;
    try {
      await api('/appointments/' + a.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status, cancelReason }),
      });
      const msgs: Record<string, string> = {
        CHECKED_IN: 'Customer checked in and added to the waiting queue.',
        IN_PROGRESS: 'Service started.',
        COMPLETED: 'Appointment marked as completed.',
        CANCELLED: 'Appointment cancelled.',
        NO_SHOW: 'Appointment marked as no-show.',
      };
      toast.show('success', msgs[status]);
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  const count = (...st: string[]) => appts.filter((a) => st.includes(a.status)).length;
  const chips = [
    { label: 'Scheduled', value: count('SCHEDULED'), cls: 'text-blue-700 bg-blue-50' },
    { label: 'Waiting', value: count('CHECKED_IN'), cls: 'text-amber-700 bg-amber-50' },
    { label: 'In service', value: count('IN_PROGRESS'), cls: 'text-violet-700 bg-violet-50' },
    { label: 'Completed', value: count('COMPLETED'), cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Cancelled / No-show', value: count('CANCELLED', 'NO_SHOW'), cls: 'text-slate-600 bg-slate-100' },
  ];
  const queue = appts.filter((a) => a.status === 'CHECKED_IN');
  const unassigned = appts.filter((a) => !a.staffId);
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const cardProps = { canWrite, onStatus: setStatus, onEdit: openEdit };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
            <p className="text-sm text-slate-500">{dateLabel}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={() => openNew(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <UserPlus size={16} /> Walk-in
            </button>
            <button
              onClick={() => openNew(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus size={16} /> New appointment
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <input type="date" className={inputCls + ' !w-auto'} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button onClick={() => shift(1)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Next day">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setDate(toDateStr(new Date()))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Today
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <div key={c.label} className={'rounded-full px-3 py-1 text-xs font-medium ' + c.cls}>
            {c.label}: {c.value}
          </div>
        ))}
      </div>
      {loading && <div className="text-slate-400">Loading...</div>}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="mb-3 font-semibold text-slate-800">Waiting queue ({queue.length})</h2>
        {queue.length === 0 ? (
          <div className="py-2 text-sm text-slate-400">No customers waiting.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((a, i) => (
              <div key={a.id} className="relative">
                <div className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <ApptCard a={a} {...cardProps} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="mb-3 font-semibold text-slate-800">Staff-wise schedule</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stylists.map((s) => {
            const mine = appts.filter((a) => a.staffId === s.id);
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.staffProfile?.designation || 'Staff'}</div>
                  </div>
                  <div className="text-xs text-slate-400">{mine.length} bookings</div>
                </div>
                <div className="space-y-2">
                  {mine.length === 0 && <div className="py-4 text-center text-xs text-slate-400">No appointments</div>}
                  {mine.map((a) => (
                    <ApptCard key={a.id} a={a} {...cardProps} />
                  ))}
                </div>
              </div>
            );
          })}
          {unassigned.length > 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
              <div className="mb-3 text-sm font-medium text-slate-700">Unassigned ({unassigned.length})</div>
              <div className="space-y-2">
                {unassigned.map((a) => (
                  <ApptCard key={a.id} a={a} {...cardProps} />
                ))}
              </div>
            </div>
          )}
        </div>
        {stylists.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            No active stylists found. Add staff with role Staff or Manager first.
          </div>
        )}
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Reschedule appointment' : walkIn ? 'Add walk-in customer' : 'New appointment'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Customer" required error={errors.customer} hint="Search by name or mobile. Customer not listed? Add them in Customers first.">
              {form.customer ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{form.customer.name}</span>
                    <span className="ml-2 text-slate-500">+91 {form.customer.phone}</span>
                  </div>
                  {!editing && (
                    <button type="button" onClick={() => setForm({ ...form, customer: null })} className="text-slate-400 hover:text-slate-700" aria-label="Change customer">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className={inputCls + ' pl-9'} placeholder="Type name or mobile number" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                  </div>
                  {custResults.length > 0 && (
                    <ul className="mt-1 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                      {custResults.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => setForm({ ...form, customer: c })} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                            <span className="text-slate-800">{c.name}</span>
                            <span className="text-slate-500">+91 {c.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Field>
            <Field
              label="Services"
              required
              error={errors.services}
              hint={chosen.length ? chosen.length + ' selected - ' + inr(totalPrice) + ' - ' + totalMin + ' min' : 'Select one or more services.'}
            >
              <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-300">
                {activeServices.length === 0 && <div className="p-3 text-sm text-slate-400">No active services. Add services first.</div>}
                {activeServices.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={form.serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                    <span className="flex-1 text-slate-800">
                      {s.name} <span className="text-xs text-slate-400">({s.category?.name})</span>
                    </span>
                    <span className="text-slate-600">{inr(Number(s.price))}</span>
                    <span className="w-14 text-right text-xs text-slate-400">{s.durationMin} min</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Staff" hint="Leave as 'Any available' to assign later.">
              <select className={inputCls} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                <option value="">Any available</option>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.staffProfile?.designation ? ' - ' + s.staffProfile.designation : ''}
                  </option>
                ))}
              </select>
            </Field>
            {walkIn ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Walk-in customers start now and are added to the waiting queue.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Date" required error={errors.date}>
                  <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Time" required error={errors.time} hint="End time is calculated from the services.">
                  <input className={inputCls} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label="Notes" hint="Anything the staff should know for this visit.">
              <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update appointment' : walkIn ? 'Add to queue' : 'Book appointment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
