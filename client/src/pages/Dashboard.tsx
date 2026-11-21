import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee, Wallet, Banknote, TrendingUp, TrendingDown, Users, UserPlus, Scissors,
  UserCog, CalendarDays, PackageX, Receipt, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
type Stats = {
  customers: number;
  newCustomersToday: number;
  services: number;
  activeStaff: number;
  recentCustomers: { id: number; name: string; phone: string; createdAt: string }[];
  staff: {
    id: number;
    name: string;
    role: string;
    staffProfile: { designation: string | null } | null;
    todayRevenue: number;
  }[];
  lowStock: { id: number; name: string; unit: string; stockQty: number; lowStockLevel: number }[];
  week: { date: string; customers: number; sales: number }[];
  todaySales: number;
  todayCollection: number;
  todayExpenses: number;
  estimatedProfit: number;
  todayAppointments: number;
  billingReady: boolean;
};
type Tone = 'emerald' | 'blue' | 'amber' | 'violet' | 'rose' | 'indigo';
const tones: Record<Tone, { bg: string; fg: string; bar: string }> = {
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600', bar: '#10b981' },
  blue: { bg: 'bg-blue-50', fg: 'text-blue-600', bar: '#3b82f6' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-600', bar: '#f59e0b' },
  violet: { bg: 'bg-violet-50', fg: 'text-violet-600', bar: '#8b5cf6' },
  rose: { bg: 'bg-rose-50', fg: 'text-rose-600', bar: '#f43f5e' },
  indigo: { bg: 'bg-indigo-50', fg: 'text-indigo-600', bar: '#6366f1' },
};
const fmt = (n: number) =>
  (n < 0 ? '-' : '') + '\u20B9' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const axisFmt = (v: number) => (v >= 100000 ? v / 100000 + 'L' : v >= 1000 ? v / 1000 + 'k' : String(v));
const tipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 };
function Kpi(props: { label: string; value: string; icon: LucideIcon; tone: Tone; hint?: string; valueClass?: string }) {
  const t = tones[props.tone];
  const Icon = props.icon;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.bar }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{props.label}</div>
          <div className={'mt-1 truncate text-2xl font-bold sm:text-[26px] ' + (props.valueClass || 'text-slate-800')}>{props.value}</div>
          {props.hint && <div className="mt-1 text-xs text-slate-400">{props.hint}</div>}
        </div>
        <div className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' + t.bg + ' ' + t.fg}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}
function Mini(props: { label: string; value: number; icon: LucideIcon; tone: Tone; to?: string }) {
  const t = tones[props.tone];
  const Icon = props.icon;
  const body = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 sm:p-4">
      <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + t.bg + ' ' + t.fg}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight text-slate-800">{props.value}</div>
        <div className="truncate text-xs text-slate-500">{props.label}</div>
      </div>
    </div>
  );
  return props.to ? <Link to={props.to} className="block min-w-0">{body}</Link> : <div className="min-w-0">{body}</div>;
}
function Panel(props: { title: string; children: ReactNode; to?: string; action?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">{props.title}</h2>
        {props.to && (
          <Link to={props.to} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
            {props.action || 'View all'} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      {props.children}
    </div>
  );
}
function Empty(props: { icon: LucideIcon; text: string }) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      <Icon size={24} />
      <span className="text-sm">{props.text}</span>
    </div>
  );
}
function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-44 rounded-3xl bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-slate-200" />
    </div>
  );
}
export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  function load() {
    setError('');
    api<Stats>('/dashboard').then(setS).catch((e) => setError(e.message));
  }
  useEffect(load, []);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (!s && error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <div className="font-semibold text-slate-800">Could not load the dashboard</div>
        <div className="mt-1 text-sm text-rose-600">{error}</div>
        <button onClick={load} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Try again</button>
      </div>
    );
  }
  if (!s) return <Loading />;
  const weekSales = s.week.reduce((n, d) => n + d.sales, 0);
  const weekCustomers = s.week.reduce((n, d) => n + d.customers, 0);
  const profitNegative = s.estimatedProfit < 0;
  const maxRev = Math.max(1, ...s.staff.map((m) => m.todayRevenue));
  const quick: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/billing', label: 'New bill', icon: Receipt },
    { to: '/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/customers', label: 'Add customer', icon: UserPlus },
    { to: '/expenses', label: 'Add expense', icon: Banknote },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-3xl p-5 text-white shadow-sm sm:p-7" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-indigo-100">{today}</p>
            <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{greeting}, {user?.name}</h1>
            <p className="mt-2 text-sm text-indigo-100">
              This week: <span className="font-semibold text-white">{fmt(weekSales)}</span> sales
              {' - '}
              <span className="font-semibold text-white">{weekCustomers}</span> new customers
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quick.map((q) => {
            const Icon = q.icon;
            return (
              <Link key={q.to} to={q.to} className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25">
                <Icon size={16} /> {q.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Today's sales" value={fmt(s.todaySales)} icon={IndianRupee} tone="emerald" hint="All bills made today" />
        <Kpi label="Collection" value={fmt(s.todayCollection)} icon={Wallet} tone="blue" hint="Money received today" />
        <Kpi label="Expenses" value={fmt(s.todayExpenses)} icon={Banknote} tone="amber" hint="Today's expenses" />
        <Kpi
          label="Estimated profit"
          value={fmt(s.estimatedProfit)}
          icon={profitNegative ? TrendingDown : TrendingUp}
          tone={profitNegative ? 'rose' : 'violet'}
          hint="Sales (without GST) minus expenses"
          valueClass={profitNegative ? 'text-rose-600' : 'text-slate-800'}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Mini label="Customers" value={s.customers} icon={Users} tone="indigo" to="/customers" />
        <Mini label="New today" value={s.newCustomersToday} icon={UserPlus} tone="emerald" to="/customers" />
        <Mini label="Services" value={s.services} icon={Scissors} tone="rose" to="/services" />
        <Mini label="Active staff" value={s.activeStaff} icon={UserCog} tone="blue" />
        <Mini label="Appointments today" value={s.todayAppointments} icon={CalendarDays} tone="violet" to="/appointments" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Panel title="Sales - last 7 days">
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.week} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} tickFormatter={axisFmt} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => [fmt(Number(v)), 'Sales'] as [string, string]} />
                  <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <Panel title="New customers - last 7 days">
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.week} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} allowDecimals={false} />
                <Tooltip contentStyle={tipStyle} formatter={(v) => [String(v), 'New customers'] as [string, string]} />
                <Bar dataKey="customers" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Today's appointments" to="/appointments" action="Open">
          <div className="flex items-center gap-4 py-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <CalendarDays size={26} />
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-800">{s.todayAppointments}</div>
              <div className="text-sm text-slate-500">{s.todayAppointments === 1 ? 'appointment' : 'appointments'} scheduled today</div>
            </div>
          </div>
        </Panel>
        <Panel title="Low stock alerts" to="/inventory" action="Open inventory">
          {s.lowStock.length === 0 ? (
            <Empty icon={PackageX} text="All products are well stocked" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">Alert level: {p.lowStockLevel} {p.unit}</div>
                  </div>
                  <span className={'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ' + (p.stockQty <= 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700')}>
                    {p.stockQty <= 0 ? 'Out of stock' : p.stockQty + ' ' + p.unit + ' left'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent customers" to="/customers">
          {s.recentCustomers.length === 0 ? (
            <Empty icon={Users} text="No customers yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.recentCustomers.map((c) => (
                <li key={c.id}>
                  <Link to={'/customers/' + c.id} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-500">+91 {c.phone}</div>
                    </div>
                    <div className="shrink-0 text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Staff - today's billing">
          {s.staff.length === 0 ? (
            <Empty icon={UserCog} text="No staff yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.staff.map((m) => (
                <li key={m.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.staffProfile?.designation || m.role}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-slate-800">{fmt(m.todayRevenue)}</div>
                  </div>
                  <div className="ml-12 mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: (m.todayRevenue / maxRev) * 100 + '%' }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
