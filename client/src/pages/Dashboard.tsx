import { useEffect, useState } from 'react';
import { api } from '../api';
type Stats = {
  customers: number;
  newCustomersToday: number;
  services: number;
  activeStaff: number;
};
export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Stats>('/dashboard').then(setS).catch((e) => setError(e.message));
  }, []);
  const cards = s
    ? [
        { label: 'Customers', value: s.customers },
        { label: 'New today', value: s.newCustomersToday },
        { label: 'Services', value: s.services },
        { label: 'Active staff', value: s.activeStaff },
      ]
    : [];
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">Dashboard</h1>
      {error && <div className="text-red-600">{error}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="text-3xl font-bold text-slate-800">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
