import { useState } from 'react';
import { Ban } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from './Modal';
import { useToast } from './Toast';
import type { Invoice } from '../printing';
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const presets = ['Entered by mistake', 'Customer cancelled', 'Wrong customer', 'Wrong items or prices'];
const modes: [string, string][] = [['CASH', 'Cash'], ['UPI', 'UPI'], ['CARD', 'Card'], ['BANK', 'Bank transfer'], ['WALLET', 'E-Wallet']];
const chip = (on: boolean) =>
  'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
  (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
export default function CancelBillSection(props: { inv: Invoice; onUpdated: (i: Invoice) => void }) {
  const { inv } = props;
  const { user } = useAuth();
  const toast = useToast();
  const canCancel = ['OWNER', 'ADMIN', 'MANAGER'].includes(user ? user.role : '');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('CASH');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const x = inv as any;
  if (inv.status === 'CANCELLED') {
    return (
      <div className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
        <div className="font-semibold">This bill is cancelled</div>
        <div className="text-xs text-slate-500">
          {x.cancelReason || ''}
          {x.cancelledAt ? ' - ' + new Date(x.cancelledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </div>
      </div>
    );
  }
  if (!canCancel) return null;
  const paid = inv.payments.filter((p) => n(p.amount) > 0);
  const walletPaid = r2(paid.filter((p) => p.mode === 'WALLET').reduce((s, p) => s + n(p.amount), 0));
  const otherPaid = r2(paid.filter((p) => p.mode !== 'WALLET').reduce((s, p) => s + n(p.amount), 0));
  const options = inv.customer ? modes : modes.filter((m) => m[0] !== 'WALLET');
  const products = inv.items.filter((i) => i.itemType === 'PRODUCT');
  const sessions = inv.items.filter((i) => i.itemType === 'SESSION_USE');
  const bought = inv.items.filter((i) => i.itemType === 'PACKAGE' || i.itemType === 'MEMBERSHIP');
  const modeName = (m: string) => (modes.find((q) => q[0] === m) || [m, m])[1];
  async function confirm() {
    if (reason.trim().length < 3) {
      toast.show('error', 'Please choose or type a reason (at least 3 letters).');
      return;
    }
    setBusy(true);
    try {
      const upd = await api<Invoice>('/invoices/' + inv.id + '/cancel', {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim(), refundMode: mode, refundReference: ref.trim() || undefined }),
      });
      toast.show('success', 'Bill ' + inv.invoiceNo + ' cancelled.');
      props.onUpdated(upd);
      setOpen(false);
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
      >
        <Ban size={16} /> Cancel this bill
      </button>
      {open && (
        <Modal title="Cancel this bill?" subtitle={inv.invoiceNo + ' - ' + inr(n(inv.total))} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What will happen</div>
              {products.length > 0 && <div>Products go back to stock: {products.map((i) => i.name + ' x ' + n(i.qty)).join(', ')}</div>}
              {sessions.length > 0 && <div>{sessions.length} package session(s) are given back to the customer.</div>}
              {bought.length > 0 && <div>Packages or memberships bought on this bill are removed.</div>}
              {walletPaid > 0 && <div>{inr(walletPaid)} paid from the E-Wallet returns to the E-Wallet.</div>}
              {otherPaid > 0 && (
                <div>{inr(otherPaid)} received is refunded {mode === 'WALLET' ? 'to the E-Wallet' : 'by ' + modeName(mode)}.</div>
              )}
              {walletPaid + otherPaid <= 0.004 && <div>No payment was received, so no refund is needed.</div>}
              <div className="text-xs text-slate-500">This bill is removed from sales and profit. This cannot be undone.</div>
            </div>
            {otherPaid > 0.004 && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Refund the {inr(otherPaid)} by</div>
                <div className="flex flex-wrap gap-2">
                  {options.map((m) => (
                    <button type="button" key={m[0]} onClick={() => setMode(m[0])} className={chip(mode === m[0])}>{m[1]}</button>
                  ))}
                </div>
                {mode !== 'WALLET' && (
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Reference (UPI ID, transaction no.) - optional"
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                  />
                )}
              </div>
            )}
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">Why are you cancelling?</div>
              <div className="mb-2 flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button type="button" key={p} onClick={() => setReason(p)} className={chip(reason === p)}>{p}</button>
                ))}
              </div>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Or type your own reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Keep the bill</button>
              <button disabled={busy} onClick={confirm} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {busy ? 'Saving...' : 'Cancel bill'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
