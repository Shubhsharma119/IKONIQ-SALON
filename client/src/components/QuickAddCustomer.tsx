import { useState, type FormEvent } from 'react';
import { api } from '../api';
import Modal from './Modal';
import Field, { inputCls } from './Field';
import { useToast } from './Toast';
export type NewCust = { id: number; name: string; phone: string; isActive: boolean };
export default function QuickAddCustomer(props: {
  initial?: string;
  onClose: () => void;
  onCreated: (c: NewCust) => void;
}) {
  const toast = useToast();
  const start = (props.initial || '').trim();
  const allDigits = /^\d+$/.test(start);
  const [name, setName] = useState(allDigits ? '' : start);
  const [phone, setPhone] = useState(allDigits ? start.slice(0, 10) : '');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: { name?: string; phone?: string; email?: string } = {};
    if (name.trim().length < 2) errs.name = 'Enter the full name (at least 2 letters).';
    if (!/^[6-9]\d{9}$/.test(phone)) errs.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = { name: name.trim(), phone };
      if (email.trim()) body.email = email.trim();
      if (gender) body.gender = gender;
      const c = await api<any>('/customers', { method: 'POST', body: JSON.stringify(body) });
      toast.show('success', 'Customer added successfully.');
      props.onCreated({ id: c.id, name: c.name, phone: c.phone, isActive: true });
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add new customer" subtitle="The customer will be selected for this bill." onClose={props.onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" required error={errors.name}>
          <input className={inputCls} autoFocus placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mobile number" required error={errors.phone} hint="10 digits, without country code.">
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
            <input
              className={inputCls + ' rounded-l-none'}
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email address" error={errors.email} hint="Optional.">
            <input className={inputCls} type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Gender" hint="Optional.">
            <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : 'Save and select'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
