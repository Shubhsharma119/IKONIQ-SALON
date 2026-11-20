import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useToast } from './Toast';
type Row = {
  id: number;
  customer: { id: number; name: string; phone: string };
  name: string;
  discountPercent: number;
  price: number;
  startsAt: string;
  expiresAt: string;
  daysLeft: number;
  state: string;
  invoiceNo: string | null;
};
const dt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN');
export default function ActiveMembers() {
  const toast = useToast();
  const [status, setStatus] = useState<'active' | 'expired' | 'all'>('active');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api<Row[]>('/history/memberships?status=' + status)
      .then(setRows)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }, [status]);
  const chip = (on: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Members ({rows.length})</h2>
        <div className="flex gap-2">
          <button onClick={() => setStatus('active')} className={chip(status === 'active')}>Active</button>
          <button onClick={() => setStatus('expired')} className={chip(status === 'expired')}>Expired</button>
          <button onClick={() => setStatus('all')} className={chip(status === 'all')}>All</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Valid from</th>
              <th className="px-4 py-3 font-semibold">Valid till</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Paid</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Bill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No members found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link to={'/customers/' + r.customer.id} className="font-medium text-indigo-700 hover:underline">{r.customer.name}</Link>
                  <div className="text-xs text-slate-400">+91 {r.customer.phone}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.name} <span className="text-xs text-slate-400">({r.discountPercent}% off)</span></td>
                <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{dt(r.startsAt)}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-700">{dt(r.expiresAt)}</div>
                  {r.state === 'EXPIRED' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Expired</span>}
                  {r.state === 'UPCOMING' && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Starts later</span>}
                  {r.state === 'ACTIVE' && (
                    <span className={'rounded-full px-2 py-0.5 text-xs ' + (r.daysLeft <= 30 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                      {r.daysLeft} days left
                    </span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-slate-700 md:table-cell">{inr(r.price)}</td>
                <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{r.invoiceNo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
