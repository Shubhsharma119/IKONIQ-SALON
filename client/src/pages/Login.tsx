import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(phone, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 text-center">SalonPro</h1>
        <p className="text-sm text-slate-500 text-center">Sign in to continue</p>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2">{error}</div>}
        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="numeric"
          required
        />
        <input
          className="w-full border rounded-lg px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          disabled={busy}
          className="w-full bg-slate-800 text-white rounded-lg py-2 font-medium disabled:opacity-60"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
