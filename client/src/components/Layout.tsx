import { useEffect, useState } from 'react';
import { api } from '../api';
import { applySettings } from '../salon';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarDays, Scissors, Receipt, UserCog,
  Boxes, Truck, Gift, Crown, Wallet, BarChart3, Settings, LogOut, Menu,
} from 'lucide-react';
import { useAuth } from '../auth';
const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, ready: true },
  { to: '/customers', label: 'Customers', icon: Users, ready: true },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays, ready: true },
  { to: '/billing', label: 'Billing / POS', icon: Receipt, ready: true },
  { to: '/wallet', label: 'E-Wallet', icon: Wallet, ready: true },
  { to: '/services', label: 'Services', icon: Scissors, ready: true },
  { to: '/staff', label: 'Staff', icon: UserCog, ready: true },
  { to: '/inventory', label: 'Inventory', icon: Boxes, ready: true },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, ready: true },
  { to: '/packages', label: 'Packages', icon: Gift, ready: true },
  { to: '/memberships', label: 'Memberships', icon: Crown, ready: true },
  { to: '/expenses', label: 'Expenses', icon: Wallet, ready: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, ready: true },
  { to: '/settings', label: 'Settings', icon: Settings, ready: true },
];
const MANAGERS = ['OWNER', 'ADMIN', 'MANAGER'];
const BILLERS = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'];
const access: Record<string, string[]> = {
  '/billing': BILLERS,
  '/wallet': BILLERS,
  '/expenses': MANAGERS,
  '/suppliers': MANAGERS,
  '/settings': ['OWNER', 'ADMIN'],
};
function canSee(path: string, role?: string) {
  const allowed = access[path];
  return !allowed || allowed.includes(role || '');
}
export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api('/settings').then(applySettings).catch(() => {});
  }, []);
  const sidebar = (
    <aside className="w-64 h-full bg-slate-900 text-slate-300 flex flex-col">
      <div className="px-6 py-[clamp(0.6rem,2vh,1.25rem)] text-xl font-bold text-white tracking-tight">SalonPro</div>
      <nav className="sp-nav flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">
        {nav.filter((n) => canSee(n.to, user ? user.role : '')).map((n) => {
          const Icon = n.icon;
          if (!n.ready) {
            return (
              <div
                key={n.to}
                className="flex items-center gap-3 rounded-lg px-3 py-[clamp(0.3rem,0.85vh,0.55rem)] text-sm opacity-40 cursor-not-allowed"
              >
                <Icon size={18} />
                <span className="flex-1">{n.label}</span>
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </div>
            );
          }
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                'flex items-center gap-3 rounded-lg px-3 py-[clamp(0.3rem,0.85vh,0.55rem)] text-sm ' +
                (isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800')
              }
            >
              <Icon size={18} />
              {n.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.role}</div>
          </div>
          <button onClick={logout} title="Log out" className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500 hover:text-white">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    </aside>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`.sp-nav{scrollbar-width:none}.sp-nav::-webkit-scrollbar{display:none}`}</style>
      <div className="hidden lg:block lg:fixed lg:inset-y-0 lg:w-64">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}
      <div className="lg:ml-64 min-w-0">
        <header className="lg:hidden flex items-center gap-3 bg-white border-b px-4 py-3">
          <button onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <span className="font-bold text-slate-800">SalonPro</span>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}






















