import { useEffect, useState } from 'react';
export default function App() {
  const [status, setStatus] = useState('checking...');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.ok ? 'Backend connected' : 'Backend error'))
      .catch(() => setStatus('Backend not reachable'));
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <h1 className="text-4xl font-bold text-slate-800">SalonPro</h1>
      <p className="mt-3 text-slate-600">{status}</p>
    </div>
  );
}
