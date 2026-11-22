import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { inputCls } from './Field';
import { useToast } from './Toast';
import type { Invoice } from '../printing';
import { waKinds, waKindLabel, buildWaMessage, cleanPhone, openWhatsApp, type WaKind } from '../whatsapp';
export default function WhatsAppShare(props: { inv: Invoice }) {
  const { inv } = props;
  const toast = useToast();
  const kinds = waKinds(inv);
  const [kind, setKind] = useState<WaKind>('full');
  const [phone, setPhone] = useState(inv.customer ? inv.customer.phone : '');
  const active: WaKind = kinds.includes(kind) ? kind : 'full';
  const [text, setText] = useState(() => buildWaMessage(inv, active));
  useEffect(() => {
    setText(buildWaMessage(inv, active));
  }, [inv, active]);
  function send() {
    const p = cleanPhone(phone);
    if (!p) {
      toast.show('error', 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.');
      return;
    }
    if (!text.trim()) {
      toast.show('error', 'The message is empty.');
      return;
    }
    openWhatsApp(p, text);
  }
  const chip = (on: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium ' +
    (on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
        <MessageCircle size={16} className="text-emerald-600" /> Send on WhatsApp
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={chip(active === k)}>
            {waKindLabel[k]}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-xs font-medium text-slate-600">WhatsApp number</label>
      <div className="flex">
        <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
        <input
          className={inputCls + ' rounded-l-none'}
          placeholder="9876543210"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))}
        />
      </div>
      <label className="mb-1 mt-2 block text-xs font-medium text-slate-600">Message (you can edit it before sending)</label>
      <textarea className={inputCls + ' font-mono text-xs'} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        onClick={send}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        <MessageCircle size={16} /> Open WhatsApp
      </button>
      <p className="mt-2 text-xs text-slate-400">
        The number does not need to be saved in your phone. WhatsApp opens the chat directly; press Send there. The number must be on WhatsApp.
      </p>
    </div>
  );
}
