import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Field, { inputCls } from './Field';
import { useToast } from './Toast';
export default function ChangeLoginId() {
  const toast = useToast();
  const { user, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; pw?: string }>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: { phone?: string; pw?: string } = {};
    if (!/^[6-9]\d{9}$/.test(phone)) errs.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
    else if (user && user.phone === phone) errs.phone = 'This is already your login mobile number.';
    if (!pw) errs.pw = 'Enter your current password to confirm.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    setBusy(true);
    try {
      await api('/auth/change-login-id', { method: 'POST', body: JSON.stringify({ currentPassword: pw, newPhone: phone }) });
      toast.show('success', 'Login ID changed. Please sign in again with the new mobile number.');
      setTimeout(logout, 1800);
    } catch (err: any) {
      toast.show('error', err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Login ID</h2>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">
          Your login ID is your mobile number{user ? ' (currently +91 ' + user.phone + ')' : ''}. After changing it you will be signed out and must sign in with the new number.
        </p>
        <div className="grid max-w-md grid-cols-1 gap-4">
          <Field label="New login mobile number" required error={errors.phone} hint="10 digits, without country code.">
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
          <Field label="Current password" required error={errors.pw} hint="Needed to confirm it is you.">
            <input className={inputCls} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end">
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? 'Saving...' : 'Change login ID'}
        </button>
      </div>
    </form>
  );
}
