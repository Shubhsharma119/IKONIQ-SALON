import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
const nav = [
  { to: '/', label: 'Dashboard' },
];
export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-56 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 text-xl font-bold text-white">SalonPro</div>
        <nav className="flex-1 px-2 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                'block rounded-lg px-3 py-2 text-sm ' +
                (isActive ? 'bg-slate-700 text-white' : 'hover:bg-slate-800')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700 text-sm">
          <div className="font-medium text-white">{user?.name}</div>
          <div className="text-slate-400 text-xs mb-2">{user?.role}</div>
          <button onClick={logout} className="text-xs underline text-slate-300">
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
