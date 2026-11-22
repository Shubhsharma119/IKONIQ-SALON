import { useEffect, useState } from 'react';
import {
  IndianRupee, Wallet, Banknote, TrendingUp, TrendingDown, Receipt, Users, Printer, RefreshCw,
  ArrowUpRight, ArrowDownRight, Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import { SALON } from '../salon';
type Kpi = {
  bills: number; billed: number; netSales: number; gst: number; discounts: number; collection: number; expenses: number;
  cogs: number; profit: number; newCustomers: number; cancelledBills: number; cancelledAmount: number; avgBill: number;
};
type Named = { name: string; amount: number };
type Data = {
  range: { from: string; to: string; days: number; bucket: string };
  current: Kpi;
  previous: Kpi;
  trend: { label: string; sales: number; collection: number; expenses: number }[];
  salesMix: Named[];
  payModes: { mode: string; amount: number }[];
  walletUsed: number;
  services: { name: string; count: number; amount: number }[];
  products: { name: string; qty: number; revenue: number; profit: number }[];
  staff: { name: string; amount: number; items: number }[];
  customers: { served: number; newCustomers: number; top: { id: number; name: string; phone: string; bills: number; amount: number }[] };
  expensesByCategory: Named[];
  appointments: { total: number; byStatus: { status: string; count: number }[] };
  purchasing: { purchased: number; paidToSuppliers: number };
  cashFlow: { in: number; out: number; net: number };
  snapshot: {
    customersTotal: number;
    receivable: { total: number; count: number; top: Named[] };
    supplierDue: { total: number; top: Named[] };
    stock: { value: number; products: number; low: number; out: number; lowList: { name: string; qty: number; unit: string }[] };
    wallet: { balance: number; customers: number };
    members: number;
    packages: { active: number; sessionsLeft: number };
  };
};
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastmonth' | 'year' | 'custom';
const presets: [Preset, string][] = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'],
  ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom'],
];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'];
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer', OTHER: 'Other' };
const inr = (x: number) => (x < 0 ? '-' : '') + '\u20B9' + Math.abs(x).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const axisFmt = (v: number) => (v >= 100000 ? v / 100000 + 'L' : v >= 1000 ? v / 1000 + 'k' : String(v));
const pad = (x: number) => String(x).padStart(2, '0');
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
function rangeFor(p: Preset, cFrom: string, cTo: string) {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  const day = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  if (p === 'today') return { from: s, to: day(s, 1) };
  if (p === 'yesterday') return { from: day(s, -1), to: s };
  if (p === 'week') return { from: day(s, -6), to: day(s, 1) };
  if (p === 'month') return { from: new Date(s.getFullYear(), s.getMonth(), 1), to: day(s, 1) };
  if (p === 'lastmonth') return { from: new Date(s.getFullYear(), s.getMonth() - 1, 1), to: new Date(s.getFullYear(), s.getMonth(), 1) };
  if (p === 'year') {
    const y = s.getMonth() >= 3 ? s.getFullYear() : s.getFullYear() - 1;
    return { from: new Date(y, 3, 1), to: day(s, 1) };
  }
  if (!cFrom || !cTo || cTo < cFrom) return null;
  const f = new Date(cFrom + 'T00:00:00');
  const t = new Date(cTo + 'T00:00:00');
  return { from: f, to: day(t, 1) };
}
function Delta(props: { cur: number; prev: number; invert?: boolean }) {
  const { cur, prev } = props;
  if (prev === 0 && cur === 0) return <span className="text-xs text-slate-400">no change</span>;
  if (prev === 0) return <span className="text-xs font-medium text-indigo-600">New</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const good = props.invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={'inline-flex items-center gap-0.5 text-xs font-medium ' + (good ? 'text-emerald-600' : 'text-rose-600')}>
      <Icon size={14} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
function KpiCard(props: { label: string; value: string; cur: number; prev: number; icon: LucideIcon; tone: string; invert?: boolean; sub?: string; negative?: boolean }) {
  const Icon = props.icon;
  return (
    <div className="sp-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{props.label}</div>
          <div className={'mt-1 truncate text-2xl font-bold ' + (props.negative ? 'text-rose-600' : 'text-slate-800')}>{props.value}</div>
        </div>
        <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + props.tone}>
          <Icon size={20} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Delta cur={props.cur} prev={props.prev} invert={props.invert} />
        <span className="text-xs text-slate-400">{props.sub || 'vs previous period'}</span>
      </div>
    </div>
  );
}
function Card(props: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="sp-card min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3">
        <h2 className="font-semibold text-slate-800">{props.title}</h2>
        {props.note && <p className="text-xs text-slate-400">{props.note}</p>}
      </div>
      {props.children}
    </div>
  );
}
function Empty(props: { text: string }) {
  return <div className="py-6 text-center text-sm text-slate-400">{props.text}</div>;
}
function BarList(props: { rows: { label: string; value: number; right: string; sub?: string }[]; color?: string; empty: string }) {
  if (props.rows.length === 0) return <Empty text={props.empty} />;
  const max = Math.max(1, ...props.rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-3">
      {props.rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-medium text-slate-800">{r.right}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: Math.max(2, (Math.abs(r.value) / max) * 100) + '%', background: props.color || '#6366f1' }} />
          </div>
          {r.sub && <div className="mt-0.5 text-xs text-slate-400">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}
function Row(props: { label: string; value: string; bold?: boolean; tone?: string; line?: boolean }) {
  return (
    <div className={'flex justify-between gap-3 py-1.5 text-sm ' + (props.line ? 'border-t border-slate-200 pt-2' : '') + (props.bold ? ' font-bold' : '')}>
      <span className="text-slate-600">{props.label}</span>
      <span className={props.tone || 'text-slate-800'}>{props.value}</span>
    </div>
  );
}
function Stat(props: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="sp-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{props.label}</div>
      <div className={'mt-1 text-xl font-bold ' + (props.tone || 'text-slate-800')}>{props.value}</div>
      {props.sub && <div className="text-xs text-slate-400">{props.sub}</div>}
    </div>
  );
}
function buildInsights(d: Data): string[] {
  const c = d.current;
  const p = d.previous;
  const out: string[] = [];
  if (p.billed > 0) {
    const pct = ((c.billed - p.billed) / p.billed) * 100;
    out.push('Sales are ' + (pct >= 0 ? 'up ' : 'down ') + Math.abs(pct).toFixed(1) + '% compared with the previous period (' + inr(c.billed) + ' against ' + inr(p.billed) + ').');
  } else if (c.billed > 0) {
    out.push('You billed ' + inr(c.billed) + ' in this period. The previous period had no sales to compare with.');
  } else {
    out.push('There are no sales in this period.');
  }
  if (d.services.length > 0) {
    const s = d.services[0];
    out.push(s.name + ' is your top service: done ' + s.count + ' time(s), worth ' + inr(s.amount) + '.');
  }
  if (c.netSales > 0) {
    const margin = (c.profit / c.netSales) * 100;
    out.push(c.profit >= 0 ? 'Net profit is ' + inr(c.profit) + ', a margin of ' + margin.toFixed(1) + '% on net sales.' : 'Product cost and expenses are higher than sales, so there is a loss of ' + inr(-c.profit) + ' in this period.');
  } else if (c.expenses > 0) {
    out.push('Expenses of ' + inr(c.expenses) + ' were made with no sales in this period.');
  }
  if (d.staff.length > 0) out.push(d.staff[0].name + ' billed the most: ' + inr(d.staff[0].amount) + ' across ' + d.staff[0].items + ' item(s).');
  if (d.snapshot.receivable.total > 0.004) out.push(inr(d.snapshot.receivable.total) + ' is still to be collected from ' + d.snapshot.receivable.count + ' bill(s).');
  if (d.snapshot.supplierDue.total > 0.004) out.push('You owe ' + inr(d.snapshot.supplierDue.total) + ' to suppliers.');
  if (d.snapshot.stock.low + d.snapshot.stock.out > 0) out.push(d.snapshot.stock.low + ' product(s) are running low and ' + d.snapshot.stock.out + ' are out of stock.');
  if (d.snapshot.wallet.balance > 0.004) out.push('Customers hold ' + inr(d.snapshot.wallet.balance) + ' in their E-Wallets. This is service you still owe them.');
  if (c.cancelledBills > 0) out.push(c.cancelledBills + ' bill(s) worth ' + inr(c.cancelledAmount) + ' were cancelled in this period.');
  if (d.cashFlow.net < 0) out.push('More cash went out than came in this period (' + inr(d.cashFlow.net) + ').');
  return out;
}
export default function MasterReport() {
  const { user } = useAuth();
  const allowed = ['OWNER', 'ADMIN', 'MANAGER'].includes(user ? user.role : '');
  const [preset, setPreset] = useState<Preset>('month');
  const [cFrom, setCFrom] = useState(ymd(new Date()));
  const [cTo, setCTo] = useState(ymd(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const range = rangeFor(preset, cFrom, cTo);
  const rangeKey = range ? range.from.toISOString() + range.to.toISOString() : '';
  useEffect(() => {
    if (!allowed) return;
    if (!range) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<Data>('/master-report?from=' + encodeURIComponent(range.from.toISOString()) + '&to=' + encodeURIComponent(range.to.toISOString()))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, tick, allowed]);
  if (!allowed) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Only the owner, an admin or a manager can see the master report.</div>;
  }
  const lastDay = range ? new Date(range.to.getTime() - 86400000) : null;
  const periodText = range && lastDay ? (ymd(range.from) === ymd(lastDay) ? fmtDay(range.from) : fmtDay(range.from) + ' to ' + fmtDay(lastDay)) : 'Choose a valid date range';
  const chip = (on: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  const c = data ? data.current : null;
  const p = data ? data.previous : null;
  const totalMode = data ? data.payModes.reduce((s, m) => s + m.amount, 0) : 0;
  return (
    <div className="space-y-6">
      <style>{`
@media print {
  div:has(> aside) { display: none !important; }
  header { display: none !important; }
  .lg\\:ml-64 { margin-left: 0 !important; }
  .sp-noprint { display: none !important; }
  .sp-card { break-inside: avoid; box-shadow: none !important; }
  body { background: #fff !important; }
}
      `}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Master report</h1>
          <p className="text-sm text-slate-500">{SALON.name} - {periodText}</p>
          <p className="hidden text-xs text-slate-400 print:block">Printed on {new Date().toLocaleString('en-IN')}</p>
        </div>
        <div className="sp-noprint flex gap-2">
          <button onClick={() => setTick(tick + 1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>
      <div className="sp-noprint space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((x) => (
            <button key={x[0]} onClick={() => setPreset(x[0])} className={chip(preset === x[0])}>{x[1]}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            From <input type="date" max={ymd(new Date())} value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5" />
            to <input type="date" max={ymd(new Date())} value={cTo} onChange={(e) => setCTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5" />
            {!range && <span className="text-rose-600">The end date must not be before the start date.</span>}
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center">
          <div className="text-sm text-rose-600">{error}</div>
          <button onClick={() => setTick(tick + 1)} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Try again</button>
        </div>
      )}
      {loading && !data && !error && range && <div className="animate-pulse space-y-4"><div className="h-28 rounded-2xl bg-slate-200" /><div className="h-72 rounded-2xl bg-slate-200" /></div>}
      {data && c && p && (
        <div className={'space-y-6 transition-opacity ' + (loading ? 'opacity-50' : '')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total sales" value={inr(c.billed)} cur={c.billed} prev={p.billed} icon={IndianRupee} tone="bg-emerald-50 text-emerald-600" sub="all bills, with GST" />
            <KpiCard label="Net sales" value={inr(c.netSales)} cur={c.netSales} prev={p.netSales} icon={Receipt} tone="bg-blue-50 text-blue-600" sub="without GST" />
            <KpiCard label="Collection" value={inr(c.collection)} cur={c.collection} prev={p.collection} icon={Wallet} tone="bg-indigo-50 text-indigo-600" sub="money received" />
            <KpiCard label="Expenses" value={inr(c.expenses)} cur={c.expenses} prev={p.expenses} icon={Banknote} tone="bg-amber-50 text-amber-600" invert />
            <KpiCard label="Net profit" value={inr(c.profit)} cur={c.profit} prev={p.profit} icon={c.profit < 0 ? TrendingDown : TrendingUp} tone={c.profit < 0 ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'} negative={c.profit < 0} />
            <KpiCard label="Bills" value={String(c.bills)} cur={c.bills} prev={p.bills} icon={Receipt} tone="bg-sky-50 text-sky-600" />
            <KpiCard label="Average bill" value={inr(c.avgBill)} cur={c.avgBill} prev={p.avgBill} icon={IndianRupee} tone="bg-teal-50 text-teal-600" />
            <KpiCard label="New customers" value={String(c.newCustomers)} cur={c.newCustomers} prev={p.newCustomers} icon={Users} tone="bg-pink-50 text-pink-600" sub={data.customers.served + ' customers served'} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Card title="Sales, collection and expenses" note={data.range.bucket === 'day' ? 'Day by day' : 'Month by month'}>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tickMargin={8} minTickGap={16} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} tickFormatter={axisFmt} />
                      <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="sales" name="Sales" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="collection" name="Collection" stroke="#10b981" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <Card title="Profit at a glance" note="How the net profit is worked out">
              <Row label="Net sales (without GST)" value={inr(c.netSales)} />
              <Row label="Cost of products sold" value={'- ' + inr(c.cogs)} tone="text-rose-600" />
              <Row label="Expenses" value={'- ' + inr(c.expenses)} tone="text-rose-600" />
              <Row label="Net profit" value={inr(c.profit)} bold line tone={c.profit < 0 ? 'text-rose-600' : 'text-emerald-600'} />
              <div className="mt-3 space-y-0 rounded-xl bg-slate-50 p-3">
                <Row label="Discounts given" value={inr(c.discounts)} />
                <Row label="GST collected (not income)" value={inr(c.gst)} />
                <Row label="Cancelled bills" value={c.cancelledBills + ' (' + inr(c.cancelledAmount) + ')'} />
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Where the sales come from" note="Before discounts">
              {data.salesMix.length === 0 ? (
                <Empty text="No sales in this period." />
              ) : (
                <div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.salesMix} dataKey="amount" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                          {data.salesMix.map((m, i) => (<Cell key={m.name} fill={COLORS[i % COLORS.length]} />))}
                        </Pie>
                        <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {data.salesMix.map((m, i) => (
                      <li key={m.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{m.name}</span>
                        <span className="font-medium text-slate-800">{inr(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            <Card title="How money was received" note="Refunds are already taken off">
              <BarList
                empty="No money received in this period."
                color="#10b981"
                rows={data.payModes.map((m) => ({ label: modeLabel[m.mode] || m.mode, value: m.amount, right: inr(m.amount), sub: totalMode > 0 ? ((m.amount / totalMode) * 100).toFixed(0) + '% of collection' : undefined }))}
              />
              {Math.abs(data.walletUsed) > 0.004 && (
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Paid from E-Wallet balance: {inr(data.walletUsed)} (not new money, so it is not in the collection).</div>
              )}
            </Card>
            <Card title="Cash flow" note="Money in and out in this period">
              <Row label="Collection (money in)" value={inr(data.cashFlow.in)} tone="text-emerald-600" />
              <Row label="Expenses paid" value={'- ' + inr(c.expenses)} />
              <Row label="Paid to suppliers" value={'- ' + inr(data.purchasing.paidToSuppliers)} />
              <Row label="Net cash movement" value={inr(data.cashFlow.net)} bold line tone={data.cashFlow.net < 0 ? 'text-rose-600' : 'text-emerald-600'} />
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <Row label="Stock purchased" value={inr(data.purchasing.purchased)} />
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Top services">
              <BarList empty="No services billed in this period." rows={data.services.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount), sub: s.count + ' time(s)' }))} />
            </Card>
            <Card title="Top products" note="Profit = sale minus the product cost price">
              <BarList color="#f59e0b" empty="No products sold in this period." rows={data.products.map((s) => ({ label: s.name, value: s.revenue, right: inr(s.revenue), sub: s.qty + ' sold - profit ' + inr(s.profit) }))} />
            </Card>
            <Card title="Staff performance" note="Billed against each staff member">
              <BarList color="#10b981" empty="No staff were selected on bills in this period." rows={data.staff.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount), sub: s.items + ' item(s)' }))} />
            </Card>
            <Card title="Top customers">
              <BarList color="#ec4899" empty="No customer bills in this period." rows={data.customers.top.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount), sub: s.bills + ' bill(s)' }))} />
            </Card>
            <Card title="Expenses by category">
              <BarList color="#f59e0b" empty="No expenses in this period." rows={data.expensesByCategory.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount) }))} />
            </Card>
            <Card title="Appointments" note="Booked for this period">
              {data.appointments.total === 0 ? (
                <Empty text="No appointments in this period." />
              ) : (
                <div className="space-y-3">
                  <div className="text-3xl font-bold text-slate-800">{data.appointments.total}</div>
                  <div className="flex flex-wrap gap-2">
                    {data.appointments.byStatus.map((s) => (
                      <span key={s.status} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{s.status.replace(/_/g, ' ')}: {s.count}</span>
                    ))}
                  </div>
                  {(() => {
                    const done = data.appointments.byStatus.filter((s) => s.status === 'COMPLETED').reduce((n, s) => n + s.count, 0);
                    return <div className="text-xs text-slate-500">Completed: {((done / data.appointments.total) * 100).toFixed(0)}% of all appointments</div>;
                  })()}
                </div>
              )}
            </Card>
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Where the business stands today</h2>
            <p className="mb-3 -mt-2 text-xs text-slate-400">These numbers are as of now and do not change with the period you chose.</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="To collect from customers" value={inr(data.snapshot.receivable.total)} sub={data.snapshot.receivable.count + ' pending bill(s)'} tone={data.snapshot.receivable.total > 0.004 ? 'text-rose-600' : 'text-slate-800'} />
              <Stat label="To pay to suppliers" value={inr(data.snapshot.supplierDue.total)} tone={data.snapshot.supplierDue.total > 0.004 ? 'text-rose-600' : 'text-slate-800'} />
              <Stat label="Stock value (at cost)" value={inr(data.snapshot.stock.value)} sub={data.snapshot.stock.products + ' products'} />
              <Stat label="E-Wallet held by customers" value={inr(data.snapshot.wallet.balance)} sub={data.snapshot.wallet.customers + ' customer(s)'} tone="text-amber-600" />
              <Stat label="Customers" value={String(data.snapshot.customersTotal)} sub="active customers" />
              <Stat label="Active members" value={String(data.snapshot.members)} sub="valid memberships" />
              <Stat label="Package sessions left" value={String(data.snapshot.packages.sessionsLeft)} sub={data.snapshot.packages.active + ' active packages'} />
              <Stat label="Low or out of stock" value={String(data.snapshot.stock.low + data.snapshot.stock.out)} sub={data.snapshot.stock.out + ' out of stock'} tone={data.snapshot.stock.low + data.snapshot.stock.out > 0 ? 'text-amber-600' : 'text-slate-800'} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Customers with the most due">
                <BarList color="#ef4444" empty="Nothing is due from customers." rows={data.snapshot.receivable.top.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount) }))} />
              </Card>
              <Card title="Suppliers with the most due">
                <BarList color="#ef4444" empty="Nothing is due to suppliers." rows={data.snapshot.supplierDue.top.map((s) => ({ label: s.name, value: s.amount, right: inr(s.amount) }))} />
              </Card>
              <Card title="Products to reorder">
                {data.snapshot.stock.lowList.length === 0 ? (
                  <Empty text="No product is running low." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.snapshot.stock.lowList.map((s) => (
                      <li key={s.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-slate-700">{s.name}</span>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{s.qty} {s.unit} left</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
          <Card title="Key points">
            <ul className="space-y-2">
              {buildInsights(data).map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
