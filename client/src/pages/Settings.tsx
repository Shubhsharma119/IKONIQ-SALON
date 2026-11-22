import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Settings as SettingsIcon, Trash2, Upload } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
import { applySettings } from '../salon';
type Day = { day: number; open: boolean; from: string; to: string };
type Cfg = {
  salon: any;
  invoice: any;
  hours: { days: Day[] };
  holidays: { list: { date: string; reason: string }[] };
  whatsapp?: { enabled: boolean; phoneNumberId: string; businessAccountId: string; graphVersion: string; tokenSet: boolean };
};
type Saved = (key: string, value: any) => void;
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ic = inputCls + ' disabled:bg-slate-50 disabled:text-slate-500';
const saveBtn = 'rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60';
function Card(props: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-800">{props.title}</h2>
      {props.desc && <p className="mb-4 mt-0.5 text-sm text-slate-500">{props.desc}</p>}
      {!props.desc && <div className="mb-3" />}
      {props.children}
    </div>
  );
}
function SaveRow(props: { canEdit: boolean; busy: boolean; label?: string }) {
  if (!props.canEdit) {
    return <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Only the Owner or an Admin can change these settings.</div>;
  }
  return (
    <div className="flex justify-end border-t border-slate-100 pt-4">
      <button disabled={props.busy} className={saveBtn}>{props.busy ? 'Saving...' : props.label || 'Save changes'}</button>
    </div>
  );
}
function SalonTab(props: { cfg: Cfg; canEdit: boolean; onSaved: Saved }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ ...props.cfg.salon });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setF((s: any) => ({ ...s, [k]: v }));
  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.show('error', 'Logo must be a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size > 300 * 1024) {
      toast.show('error', 'Logo must be smaller than 300 KB.');
      return;
    }
    const r = new FileReader();
    r.onload = () => set('logo', String(r.result));
    r.readAsDataURL(file);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = 'Enter the salon name (at least 2 letters).';
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) errs.pincode = 'Enter a valid 6-digit pincode.';
    if (f.phone && !/^[0-9+\- ]{8,15}$/.test(f.phone)) errs.phone = 'Enter a valid phone number.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = 'Enter a valid email address.';
    if (f.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gstin)) errs.gstin = 'Enter a valid 15-character GSTIN.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0]);
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: f.name.trim(), tagline: f.tagline.trim(), address: f.address.trim(), city: f.city.trim(),
        state: f.state.trim(), pincode: f.pincode, phone: f.phone.trim(), email: f.email.trim(), gstin: f.gstin, logo: f.logo,
      };
      const saved = await api('/settings/salon', { method: 'PUT', body: JSON.stringify(body) });
      props.onSaved('salon', saved);
      toast.show('success', 'Salon profile saved successfully.');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  const d = !props.canEdit;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="Salon details" desc="These details appear on every printed bill.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Salon name" required error={errors.name}>
            <input className={ic} disabled={d} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Glow Beauty Salon" />
          </Field>
          <Field label="Tagline" hint="Optional. Shown under the name.">
            <input className={ic} disabled={d} value={f.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="e.g. Unisex Salon and Spa" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address" hint="Street and area.">
              <input className={ic} disabled={d} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Shop no, street, area" />
            </Field>
          </div>
          <Field label="City"><input className={ic} disabled={d} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State"><input className={ic} disabled={d} value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="Pincode" error={errors.pincode}>
            <input className={ic} disabled={d} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Phone" error={errors.phone} hint="Shown on the bill.">
            <input className={ic} disabled={d} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 9876543210" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className={ic} disabled={d} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="GSTIN" error={errors.gstin} hint="15 characters. Shown on GST invoices.">
            <input className={ic} disabled={d} maxLength={15} value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="e.g. 06ABCDE1234F1Z5" />
          </Field>
        </div>
      </Card>
      <Card title="Logo" desc="Printed at the top of the bill. PNG, JPG or WEBP, up to 300 KB. A simple black and white logo prints best on thermal paper.">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
            {f.logo ? <img src={f.logo} alt="Logo" className="max-h-full max-w-full" /> : <span className="text-xs text-slate-400">No logo</span>}
          </div>
          {props.canEdit && (
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Upload size={16} /> Upload logo
              </button>
              {f.logo && (
                <button type="button" onClick={() => set('logo', '')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                  <Trash2 size={16} /> Remove
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
      <SaveRow canEdit={props.canEdit} busy={busy} />
    </form>
  );
}
function InvoiceTab(props: { cfg: Cfg; canEdit: boolean; onSaved: Saved }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ ...props.cfg.invoice, defaultGstRate: String(props.cfg.invoice.defaultGstRate) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const dt = new Date();
  const sy = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
  const fy = sy + '-' + String((sy + 1) % 100).padStart(2, '0');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{1,8}$/.test(f.prefix)) errs.prefix = 'Prefix must be 1 to 8 letters or digits.';
    const g = Number(f.defaultGstRate);
    if (f.defaultGstRate === '' || isNaN(g) || g < 0 || g > 28) errs.defaultGstRate = 'GST rate must be between 0 and 28.';
    if (f.upiId && !/^[\w.\-]{2,}@\w{2,}$/.test(f.upiId)) errs.upiId = 'Enter a valid UPI ID (like name@bank).';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0]);
      return;
    }
    setBusy(true);
    try {
      const saved = await api('/settings/invoice', {
        method: 'PUT',
        body: JSON.stringify({
          prefix: f.prefix, footer: f.footer, terms: f.terms, showGstin: !!f.showGstin, defaultGst: !!f.defaultGst,
          defaultGstRate: g, defaultPaper: f.defaultPaper, upiId: f.upiId.trim(), bankDetails: f.bankDetails,
        }),
      });
      props.onSaved('invoice', saved);
      toast.show('success', 'Billing settings saved successfully.');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  const d = !props.canEdit;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="Invoice numbering" desc="New bills use this prefix. Old bills keep their numbers.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Invoice prefix" required error={errors.prefix} hint={'Next bill looks like: ' + (f.prefix || 'SP') + '/' + fy + '/0001 (the counter restarts every April)'}>
            <input className={ic} disabled={d} maxLength={8} value={f.prefix} onChange={(e) => set('prefix', e.target.value.toUpperCase())} />
          </Field>
        </div>
      </Card>
      <Card title="Tax (GST)" desc="Defaults for the New bill screen. You can still change them on each bill.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={d} checked={!!f.defaultGst} onChange={(e) => set('defaultGst', e.target.checked)} />
            Make GST invoice the default
          </label>
          <Field label="Default GST rate (%)" error={errors.defaultGstRate} hint="Split equally into CGST and SGST on the bill.">
            <input className={ic} disabled={d} type="number" min="0" max="28" step="any" value={f.defaultGstRate} onChange={(e) => set('defaultGstRate', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={d} checked={!!f.showGstin} onChange={(e) => set('showGstin', e.target.checked)} />
            Print my GSTIN on GST invoices
          </label>
        </div>
      </Card>
      <Card title="Printing" desc="The printer itself is chosen in the print window. This sets the default paper size.">
        <Field label="Default paper size" hint="Most billing thermal printers use 80 mm. Small receipt printers use 58 mm.">
          <select className={ic + ' max-w-xs'} disabled={d} value={f.defaultPaper} onChange={(e) => set('defaultPaper', e.target.value)}>
            <option value="80">Thermal 80 mm</option>
            <option value="58">Thermal 58 mm</option>
            <option value="A4">A4 (normal printer)</option>
          </select>
        </Field>
      </Card>
      <Card title="Bill footer and payment details" desc="Printed at the bottom of the bill.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Footer message" hint="Short thank-you line.">
            <input className={ic} disabled={d} maxLength={200} value={f.footer} onChange={(e) => set('footer', e.target.value)} />
          </Field>
          <Field label="UPI ID" error={errors.upiId} hint="Optional. Printed as 'Pay via UPI'.">
            <input className={ic} disabled={d} value={f.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="e.g. salon@okbank" />
          </Field>
          <Field label="Terms and conditions" hint="Optional. Printed in small text.">
            <textarea className={ic} disabled={d} rows={3} maxLength={500} value={f.terms} onChange={(e) => set('terms', e.target.value)} />
          </Field>
          <Field label="Bank details" hint="Optional. Printed on A4 bills only.">
            <textarea className={ic} disabled={d} rows={3} maxLength={300} value={f.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} placeholder={'Bank name\nA/C no\nIFSC'} />
          </Field>
        </div>
      </Card>
      <SaveRow canEdit={props.canEdit} busy={busy} />
    </form>
  );
}
function HoursTab(props: { cfg: Cfg; canEdit: boolean; onSaved: Saved }) {
  const toast = useToast();
  const [days, setDays] = useState<Day[]>(props.cfg.hours.days.map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const upd = (i: number, p: Partial<Day>) => setDays((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const order = [1, 2, 3, 4, 5, 6, 0];
  async function submit(e: FormEvent) {
    e.preventDefault();
    for (const x of days) {
      if (x.open && x.to <= x.from) {
        toast.show('error', 'Closing time must be after opening time (' + dayNames[x.day] + ').');
        return;
      }
    }
    setBusy(true);
    try {
      const saved = await api('/settings/hours', { method: 'PUT', body: JSON.stringify({ days }) });
      props.onSaved('hours', saved);
      toast.show('success', 'Business hours saved successfully.');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  const d = !props.canEdit;
  const monday = days.find((x) => x.day === 1)!;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Card title="Weekly business hours" desc="Appointments cannot be booked on closed days or outside these hours. Walk-ins are not blocked.">
        <div className="divide-y divide-slate-100">
          {order.map((dayNo) => {
            const i = days.findIndex((x) => x.day === dayNo);
            const x = days[i];
            return (
              <div key={dayNo} className="flex flex-wrap items-center gap-3 py-3">
                <div className="w-28 text-sm font-medium text-slate-800">{dayNames[dayNo]}</div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" disabled={d} checked={x.open} onChange={(e) => upd(i, { open: e.target.checked })} /> Open
                </label>
                {x.open ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="time" className={ic + ' !w-auto'} disabled={d} value={x.from} onChange={(e) => upd(i, { from: e.target.value })} />
                    to
                    <input type="time" className={ic + ' !w-auto'} disabled={d} value={x.to} onChange={(e) => upd(i, { to: e.target.value })} />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Closed all day</span>
                )}
              </div>
            );
          })}
        </div>
        {props.canEdit && (
          <button
            type="button"
            onClick={() => setDays((l) => l.map((x) => ({ ...x, open: monday.open, from: monday.from, to: monday.to })))}
            className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
          >
            Apply Monday's timing to all days
          </button>
        )}
      </Card>
      <SaveRow canEdit={props.canEdit} busy={busy} />
    </form>
  );
}
function HolidaysTab(props: { cfg: Cfg; canEdit: boolean; onSaved: Saved }) {
  const toast = useToast();
  const [list, setList] = useState(props.cfg.holidays.list.map((x) => ({ ...x })));
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  function add() {
    if (!date) return toast.show('error', 'Select the holiday date.');
    if (list.some((h) => h.date === date)) return toast.show('error', 'This date is already in the list.');
    setList((l) => l.concat({ date, reason: reason.trim() }).sort((a, b) => (a.date < b.date ? -1 : 1)));
    setDate('');
    setReason('');
  }
  async function save() {
    setBusy(true);
    try {
      const saved = await api('/settings/holidays', { method: 'PUT', body: JSON.stringify({ list }) });
      props.onSaved('holidays', saved);
      toast.show('success', 'Holidays saved successfully.');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card title="Holidays" desc="Appointments cannot be booked on these dates.">
        {props.canEdit && (
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Date"><input className={ic + ' !w-auto'} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="min-w-[14rem] flex-1">
              <Field label="Reason" hint="Optional, e.g. Diwali"><input className={ic} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} /></Field>
            </div>
            <button type="button" onClick={add} className="mb-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add holiday</button>
          </div>
        )}
        {list.length === 0 && <div className="py-4 text-center text-sm text-slate-400">No holidays added.</div>}
        <div className="divide-y divide-slate-100">
          {list.map((h) => (
            <div key={h.date} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-800">
                  {new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {h.reason && <span className="ml-3 text-slate-500">{h.reason}</span>}
              </div>
              {props.canEdit && (
                <button onClick={() => setList((l) => l.filter((x) => x.date !== h.date))} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      </Card>
      {props.canEdit ? (
        <div className="flex justify-end">
          <button disabled={busy} onClick={save} className={saveBtn}>{busy ? 'Saving...' : 'Save holidays'}</button>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Only the Owner or an Admin can change these settings.</div>
      )}
    </div>
  );
}
function WhatsAppTab(props: { cfg: Cfg; onSaved: Saved }) {
  const toast = useToast();
  const w = props.cfg.whatsapp!;
  const [f, setF] = useState({
    enabled: w.enabled, phoneNumberId: w.phoneNumberId, businessAccountId: w.businessAccountId,
    graphVersion: w.graphVersion, accessToken: '',
  });
  const [tokenSet, setTokenSet] = useState(w.tokenSet);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.phoneNumberId && !/^\d{1,20}$/.test(f.phoneNumberId)) errs.phoneNumberId = 'Phone number ID must be digits only.';
    if (f.businessAccountId && !/^\d{1,20}$/.test(f.businessAccountId)) errs.businessAccountId = 'Business account ID must be digits only.';
    if (!/^v\d+\.\d+$/.test(f.graphVersion)) errs.graphVersion = 'Use a version like v21.0.';
    if (f.enabled && (!f.phoneNumberId || !f.businessAccountId || (!tokenSet && !f.accessToken.trim()))) {
      errs.enabled = 'Enter the phone number ID, business account ID and access token to turn WhatsApp on.';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0]);
      return;
    }
    setBusy(true);
    try {
      const saved = await api<any>('/settings/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: f.enabled, phoneNumberId: f.phoneNumberId, businessAccountId: f.businessAccountId,
          graphVersion: f.graphVersion, accessToken: f.accessToken.trim() || undefined,
        }),
      });
      setTokenSet(saved.tokenSet);
      set('accessToken', '');
      props.onSaved('whatsapp', saved);
      toast.show('success', 'WhatsApp settings saved successfully.');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="WhatsApp Cloud API" desc="Used to send bills to customers from the Billing screen. Sending bills is added in the next phase; here you only store the connection details.">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Turn on WhatsApp bill sharing
          </label>
          {errors.enabled && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errors.enabled}</div>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Phone number ID" error={errors.phoneNumberId} hint="From Meta for Developers, WhatsApp, API setup.">
              <input className={ic} value={f.phoneNumberId} onChange={(e) => set('phoneNumberId', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="WhatsApp business account ID" error={errors.businessAccountId}>
              <input className={ic} value={f.businessAccountId} onChange={(e) => set('businessAccountId', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Access token" hint={tokenSet ? 'A token is saved. Leave blank to keep it, or paste a new one to replace it.' : 'Permanent token from Meta. It is stored on the server and never shown again.'}>
              <input className={ic} type="password" autoComplete="new-password" value={f.accessToken} onChange={(e) => set('accessToken', e.target.value)} placeholder={tokenSet ? 'Saved' : 'Paste token'} />
            </Field>
            <Field label="API version" error={errors.graphVersion} hint="Example: v21.0">
              <input className={ic} value={f.graphVersion} onChange={(e) => set('graphVersion', e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>
      <SaveRow canEdit={true} busy={busy} />
    </form>
  );
}
function AccountTab() {
  const toast = useToast();
  const { user } = useAuth();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cur) return toast.show('error', 'Enter your current password.');
    if (pw.length < 6) return toast.show('error', 'New password must be at least 6 characters.');
    if (pw !== pw2) return toast.show('error', 'New password and confirm password do not match.');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: pw }) });
      toast.show('success', 'Password changed successfully.');
      setCur('');
      setPw('');
      setPw2('');
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="My account" desc={'Signed in as ' + (user?.name || '') + ' (' + (user?.role || '') + ', +91 ' + (user?.phone || '') + ')'}>
        <div className="grid max-w-md grid-cols-1 gap-4">
          <Field label="Current password" required>
            <input className={ic} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password" required hint="At least 6 characters.">
            <input className={ic} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Confirm new password" required>
            <input className={ic} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <button disabled={busy} className={saveBtn}>{busy ? 'Saving...' : 'Change password'}</button>
      </div>
    </form>
  );
}
export default function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [tab, setTab] = useState('salon');
  useEffect(() => {
    api<Cfg>('/settings').then(setCfg).catch((e) => toast.show('error', e.message));
  }, []);
  function onSaved(key: string, value: any) {
    setCfg((c) => {
      if (!c) return c;
      const next = { ...c, [key]: value } as Cfg;
      applySettings(next);
      return next;
    });
  }
  const tabs = [
    { id: 'salon', label: 'Salon profile' },
    { id: 'invoice', label: 'Billing and invoice' },
    { id: 'hours', label: 'Business hours' },
    { id: 'holidays', label: 'Holidays' },
    ...(canEdit ? [{ id: 'whatsapp', label: 'WhatsApp' }] : []),
    { id: 'account', label: 'My account' },
  ];
  const tabBtn = (active: boolean) =>
    'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><SettingsIcon size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500">Salon, billing and system preferences</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tabBtn(tab === t.id)}>{t.label}</button>
        ))}
      </div>
      {!cfg && <div className="text-slate-400">Loading...</div>}
      {cfg && tab === 'salon' && <SalonTab cfg={cfg} canEdit={canEdit} onSaved={onSaved} />}
      {cfg && tab === 'invoice' && <InvoiceTab cfg={cfg} canEdit={canEdit} onSaved={onSaved} />}
      {cfg && tab === 'hours' && <HoursTab cfg={cfg} canEdit={canEdit} onSaved={onSaved} />}
      {cfg && tab === 'holidays' && <HolidaysTab cfg={cfg} canEdit={canEdit} onSaved={onSaved} />}
      {cfg && tab === 'whatsapp' && cfg.whatsapp && <WhatsAppTab cfg={cfg} onSaved={onSaved} />}
      {tab === 'account' && <AccountTab />}
    </div>
  );
}
