import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { inputCls } from '../components/Field';
import Modal from '../components/Modal';
import WalletTopUp from '../components/WalletTopUp';
import { useToast } from '../components/Toast';
type Item = { id: number; itemType: string; name: string; qty: string | number; price: string | number; amount: string | number; staffName: string | null };
type Pay = { id: number; mode: string; amount: string | number; reference: string | null; createdAt: string; balanceAfter: string | number | null };
type Bill = { id: number; invoiceNo: string; createdAt: string; status: string; total: string | number; paidAmount: string | number; isGst: boolean; items: Item[]; payments: Pay[] };
type WTxn = { id: number; type: string; amount: string | number; paidAmount: string | number; bonusAmount: string | number; mode: string | null; offerName: string | null; invoiceNo: string | null; balanceAfter: string | number; note: string | null; createdAt: string };
type Pkg = { id: number; name: string; sessionsTotal: number | null; sessionsUsed: number; purchasedAt: string; expiresAt: string; invoiceNo: string | null; uses: { id: number; serviceName: string; staffName: string | null; usedAt: string; invoiceNo: string | null }[] };
type Mem = { id: number; name: string; discountPercent: string | number; price: string | number; startsAt: string; expiresAt: string; invoiceNo: string | null };
type Profile = {
  customer: { id: number; name: string; phone: string; email: string | null; gender: string | null; dob: string | null; notes: string | null; isActive: boolean; createdAt: string };
  summary: { visits: number; totalBilled: number; totalDue: number; lastVisit: string | null; walletBalance: number; walletPaid: number; walletBonus: number; walletSpent: number };
  services: { name: string; count: number; lastDate: string }[];
  bills: Bill[];
  wallet: WTxn[];
  packages: Pkg[];
  memberships: Mem[];
};
const n = (v: unknown) => Number(v) || 0;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dtm = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer', WALLET: 'E-Wallet' };
const typeLabel: Record<string, string> = { SERVICE: 'Service', PRODUCT: 'Product', PACKAGE: 'Package', MEMBERSHIP: 'Membership', SESSION_USE: 'Session', CUSTOM: 'Other' };
const statusTone: Record<string, string> = { PAID: 'bg-emerald-50 text-emerald-700', PARTIAL: 'bg-amber-50 text-amber-700', UNPAID: 'bg-rose-50 text-rose-700', CANCELLED: 'bg-slate-100 text-slate-500' };
const statusLabel: Record<string, string> = { PAID: 'Paid', PARTIAL: 'Partly paid', UNPAID: 'Unpaid', CANCELLED: 'Cancelled' };
const wtypeLabel: Record<string, string> = { TOPUP: 'Recharge', PAYMENT: 'Used on bill', ADJUSTMENT: 'Adjustment' };
function walletDetail(t: WTxn) {
  if (t.type === 'TOPUP') {
    let s = 'Received ' + inr(n(t.paidAmount)) + (t.mode ? ' by ' + (modeLabel[t.mode] || t.mode) : '');
    if (n(t.bonusAmount) > 0) s += ' + ' + inr(n(t.bonusAmount)) + ' extra' + (t.offerName ? ' (' + t.offerName + ')' : '');
    return s + (t.note ? ' - ' + t.note : '');
  }
  if (t.type === 'PAYMENT') return 'Bill ' + (t.invoiceNo || '') + (t.note && !t.invoiceNo ? ' - ' + t.note : '');
  return t.note || 'Manual adjustment';
}
export default function CustomerProfile() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const canAdjust = ['OWNER', 'ADMIN'].includes(user?.role || '');
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bills' | 'wallet' | 'packages' | 'memberships'>('bills');
  const [topUp, setTopUp] = useState(false);
  const [adj, setAdj] = useState<{ amount: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  function load() {
    api<Profile>('/history/customer/' + id)
      .then(setP)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);
  async function saveAdjust() {
    if (!adj) return;
    const amount = Number(adj.amount);
    if (!amount) return toast.show('error', 'Enter the amount. Use a minus sign to deduct.');
    if (adj.note.trim().length < 3) return toast.show('error', 'Enter a reason (at least 3 letters).');
    setBusy(true);
    try {
      await api('/wallet/customer/' + id + '/adjust', { method: 'POST', body: JSON.stringify({ amount, note: adj.note.trim() }) });
      toast.show('success', 'E-Wallet adjusted successfully.');
      setAdj(null);
      load();
    } catch (err: any) {
      toast.show('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!p) return <div className="text-rose-600">Customer not found.</div>;
  const c = p.customer;
  const s = p.summary;
  const tabBtn = (on: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  const stat = (label: string, value: string, tone = 'text-slate-800') => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={'text-xl font-bold ' + tone}>{value}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Back to customers
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{c.name}</h1>
            <p className="text-sm text-slate-500">
              +91 {c.phone}{c.email ? ' - ' + c.email : ''} - Customer since {dt(c.createdAt)}
            </p>
            {c.notes && <p className="text-xs italic text-slate-500">{c.notes}</p>}
          </div>
        </div>
        <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          {c.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {stat('Total billed', inr(s.totalBilled))}
        {stat('Visits (bills)', String(s.visits))}
        {stat('Last visit', s.lastVisit ? dt(s.lastVisit) : '-')}
        {stat('Due', inr(s.totalDue), s.totalDue > 0.004 ? 'text-rose-600' : 'text-slate-800')}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-sm text-slate-500">E-Wallet balance</div>
          <div className="text-xl font-bold text-emerald-700">{inr(s.walletBalance)}</div>
          {c.isActive && (
            <button onClick={() => setTopUp(true)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
              <Plus size={12} /> Add money
            </button>
          )}
        </div>
      </div>
      {p.services.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">Services taken</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {p.services.map((x) => (
              <div key={x.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800">{x.name}</div>
                  <div className="text-xs text-slate-400">Last: {dt(x.lastDate)}</div>
                </div>
                <div className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{x.count} times</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('bills')} className={tabBtn(tab === 'bills')}>Bills and services ({p.bills.length})</button>
        <button onClick={() => setTab('wallet')} className={tabBtn(tab === 'wallet')}>E-Wallet history ({p.wallet.length})</button>
        <button onClick={() => setTab('packages')} className={tabBtn(tab === 'packages')}>Packages ({p.packages.length})</button>
        <button onClick={() => setTab('memberships')} className={tabBtn(tab === 'memberships')}>Memberships ({p.memberships.length})</button>
      </div>
      {tab === 'bills' && (
        <div className="space-y-3">
          {p.bills.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No bills yet.</div>}
          {p.bills.map((b, idx) => (
            <details key={b.id} open={idx === 0} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <span className="font-medium text-slate-800">{b.invoiceNo}</span>
                  <span className="ml-2 text-sm text-slate-500">{dtm(b.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800">{inr(n(b.total))}</span>
                  <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + statusTone[b.status]}>{statusLabel[b.status]}</span>
                </div>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                {b.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-slate-800">{it.name}</div>
                      <div className="text-xs text-slate-400">
                        {typeLabel[it.itemType]} - {n(it.qty)} x {inr(n(it.price))}{it.staffName ? ' - by ' + it.staffName : ''}
                      </div>
                    </div>
                    <div className="font-medium text-slate-800">{inr(n(it.amount))}</div>
                  </div>
                ))}
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {b.payments.length === 0 && 'No payment received.'}
                  {b.payments.map((x) => (
                    <div key={x.id}>
                      {dt(x.createdAt)}: {inr(n(x.amount))} by {modeLabel[x.mode] || x.mode}
                      {x.mode === 'WALLET' && x.balanceAfter != null ? ' (wallet balance left ' + inr(n(x.balanceAfter)) + ')' : ''}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
      {tab === 'wallet' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stat('Total recharged', inr(s.walletPaid))}
            {stat('Extra received', inr(s.walletBonus), 'text-amber-600')}
            {stat('Spent from wallet', inr(s.walletSpent))}
          </div>
          {canAdjust && (
            <button onClick={() => setAdj({ amount: '', note: '' })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Manual adjustment
            </button>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.wallet.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No wallet activity yet.</td></tr>}
                {p.wallet.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-slate-500">{dtm(t.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{wtypeLabel[t.type] || t.type}</td>
                    <td className="px-4 py-3 text-slate-600">{walletDetail(t)}</td>
                    <td className={'px-4 py-3 text-right font-semibold ' + (n(t.amount) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {n(t.amount) >= 0 ? '+ ' : '- '}{inr(Math.abs(n(t.amount)))}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800">{inr(n(t.balanceAfter))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'packages' && (
        <div className="space-y-3">
          {p.packages.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No packages bought yet.</div>}
          {p.packages.map((k) => (
            <div key={k.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-800">{k.name}</div>
                  <div className="text-xs text-slate-400">Bought {dt(k.purchasedAt)}{k.invoiceNo ? ' (bill ' + k.invoiceNo + ')' : ''} - valid till {dt(k.expiresAt)}</div>
                </div>
                {k.sessionsTotal ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                    {k.sessionsTotal - k.sessionsUsed} of {k.sessionsTotal} sessions left
                  </span>
                ) : null}
              </div>
              {k.uses.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {k.uses.map((u) => (
                    <div key={u.id}>
                      {dt(u.usedAt)}: {u.serviceName.replace(/ \(session - .*\)$/, '')}{u.staffName ? ' by ' + u.staffName : ''}{u.invoiceNo ? ' (bill ' + u.invoiceNo + ')' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === 'memberships' && (
        <div className="space-y-3">
          {p.memberships.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No membership yet.</div>}
          {p.memberships.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <div className="font-medium text-slate-800">{m.name} - {n(m.discountPercent)}% off on services</div>
                <div className="text-xs text-slate-400">{dt(m.startsAt)} to {dt(m.expiresAt)}{m.invoiceNo ? ' (bill ' + m.invoiceNo + ')' : ''}</div>
              </div>
              <div className="font-semibold text-slate-800">{inr(n(m.price))}</div>
            </div>
          ))}
        </div>
      )}
      {topUp && <WalletTopUp customer={{ id: c.id, name: c.name, phone: c.phone }} onClose={() => setTopUp(false)} onDone={load} />}
      {adj && (
        <Modal title="Manual wallet adjustment" subtitle="Use a minus sign to deduct, for example -500. Every adjustment is recorded." onClose={() => setAdj(null)}>
          <div className="space-y-3">
            <input className={inputCls} type="number" step="any" placeholder="Amount (e.g. 500 or -500)" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
            <input className={inputCls} placeholder="Reason (required)" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => setAdj(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={busy} onClick={saveAdjust} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Saving...' : 'Save adjustment'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
