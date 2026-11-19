import { useEffect, useState, type ReactNode } from 'react';
import {
  IndianRupee, Wallet, CalendarDays, TrendingUp, Users, UserPlus, Scissors, UserCog, PackageX,
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
  staff: { id: number; name: string; role: string; staffProfile: { designation: string | null } | null }[];
  week: { date: string; customers: number; sales: number }[];
  todaySales: number;
  todayCollection: number;
  todayExpenses: number;
  estimatedProfit: number;
  todayAppointments: number;
  billingReady: boolean;
};
const RS = '\u20B9';
const inr = (n: number) => RS + n.toLocaleString('en-IN');
const tones: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};
function StatCard(props: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: string;
  hint?: string;
}) {
  const Icon = props.icon;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between">
      <div>
        <div className="text-sm text-slate-500">{props.label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-800">{props.value}</div>
        {props.hint && <div className="mt-1 text-xs text-slate-400">{props.hint}</div>}
      </div>
      <div className={'h-10 w-10 rounded-xl flex items-center justify-center ' + tones[props.tone]}>
        <Icon size={20} />
      </div>
    </div>
  );
}
function Panel(props: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-slate-800">{props.title}</h2>
        {props.note && <span className="text-xs text-slate-400">{props.note}</span>}
      </div>
      {props.children}
    </div>
  );
}
function Empty(props: { text: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{props.text}</div>;
}
export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Stats>('/dashboard').then(setS).catch((e) => setError(e.message));
  }, []);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  if (error) return <div className="text-red-600">{error}</div>;
  if (!s) return <div className="text-slate-500">Loading dashboard...</div>;
  const pending = s.billingReady ? undefined : 'Billing ke baad data aayega';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          {greeting}, {user?.name}
        </h1>
        <p className="text-sm text-slate-500">{today}</p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Today's sales" value={inr(s.todaySales)} icon={IndianRupee} tone="emerald" hint={pending} />
        <StatCard label="Collection" value={inr(s.todayCollection)} icon={Wallet} tone="blue" hint={pending} />
        <StatCard label="Expenses" value={inr(s.todayExpenses)} icon={TrendingUp} tone="amber" hint={pending} />
        <StatCard label="Estimated profit" value={inr(s.estimatedProfit)} icon={TrendingUp} tone="violet" hint={pending} />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Customers" value={s.customers} icon={Users} tone="indigo" />
        <StatCard label="New today" value={s.newCustomersToday} icon={UserPlus} tone="emerald" />
        <StatCard label="Services" value={s.services} icon={Scissors} tone="rose" />
        <StatCard label="Active staff" value={s.activeStaff} icon={UserCog} tone="blue" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Panel title="Sales - last 7 days" note={pending}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.week}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                  <Tooltip />
                  <Area type="monotone" dataKey="sales" stroke="#6366f1" fill="#c7d2fe" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <Panel title="New customers - last 7 days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.week}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={30} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="customers" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Today's appointments">
          <div className="flex items-center gap-3 text-slate-400 py-6 justify-center">
            <CalendarDays size={22} />
            <span className="text-sm">{s.todayAppointments} appointments</span>
          </div>
        </Panel>
        <Panel title="Low stock alerts" note="Inventory ke baad data aayega">
          <div className="flex items-center gap-3 text-slate-400 py-6 justify-center">
            <PackageX size={22} />
            <span className="text-sm">No alerts</span>
          </div>
        </Panel>
        <Panel title="Recent customers">
          {s.recentCustomers.length === 0 ? (
            <Empty text="No customers yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.recentCustomers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone}</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Staff" note="Performance billing ke baad">
          {s.staff.length === 0 ? (
            <Empty text="No staff yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.staff.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.staffProfile?.designation || m.role}</div>
                  </div>
                  <div className="text-xs text-slate-400">{inr(0)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

