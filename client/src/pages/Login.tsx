import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Scissors, Phone, Lock, Eye, EyeOff, Sparkles, ShieldCheck, CalendarCheck, TrendingUp, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth';
const features = [
  { icon: CalendarCheck, title: 'Appointments and billing', text: 'Book, bill and print in a few taps.' },
  { icon: Wallet, title: 'E-Wallet, packages and memberships', text: 'Prepaid balance, offers and loyalty in one place.' },
  { icon: TrendingUp, title: 'Reports and insights', text: 'Know your sales, profit and dues every day.' },
  { icon: ShieldCheck, title: 'Safe and traceable', text: 'Every bill, refund and change is recorded.' },
];
const sparks = [
  { l: '8%', t: '14%', d: '0s', s: 6 }, { l: '22%', t: '72%', d: '1.1s', s: 4 }, { l: '36%', t: '30%', d: '0.6s', s: 5 },
  { l: '58%', t: '12%', d: '1.8s', s: 4 }, { l: '70%', t: '58%', d: '0.3s', s: 6 }, { l: '86%', t: '26%', d: '2.2s', s: 5 },
  { l: '92%', t: '80%', d: '1.4s', s: 4 }, { l: '48%', t: '88%', d: '2.6s', s: 5 },
];
const css = `
.sp-gradient { background: linear-gradient(120deg, #312e81, #4338ca, #7c3aed, #be185d, #4338ca); background-size: 300% 300%; animation: sp-grad 16s ease infinite; }
@keyframes sp-grad { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
.sp-blob { position: absolute; border-radius: 9999px; filter: blur(60px); opacity: .45; animation: sp-float 14s ease-in-out infinite; }
@keyframes sp-float { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 33% { transform: translate3d(30px, -40px, 0) scale(1.12); } 66% { transform: translate3d(-30px, 25px, 0) scale(.92); } }
.sp-rise { opacity: 0; transform: translateY(18px); animation: sp-rise .7s cubic-bezier(.2, .7, .2, 1) forwards; }
@keyframes sp-rise { to { opacity: 1; transform: none; } }
.sp-shake { animation: sp-shake .45s ease; }
@keyframes sp-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-6px); } 40%, 60% { transform: translateX(6px); } }
.sp-orbit { animation: sp-spin 18s linear infinite; }
.sp-orbit-rev { animation: sp-spin 26s linear infinite reverse; }
@keyframes sp-spin { to { transform: rotate(360deg); } }
.sp-twinkle { position: absolute; border-radius: 9999px; background: #fff; animation: sp-twinkle 3s ease-in-out infinite; }
@keyframes sp-twinkle { 0%, 100% { opacity: .15; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.25); } }
.sp-shine { position: relative; overflow: hidden; }
.sp-shine::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, .35) 50%, transparent 70%); transform: translateX(-120%); animation: sp-shine 3.2s ease-in-out infinite; }
@keyframes sp-shine { 60%, 100% { transform: translateX(120%); } }
.sp-spinner { width: 18px; height: 18px; border: 2px solid rgba(255, 255, 255, .4); border-top-color: #fff; border-radius: 9999px; animation: sp-spin .7s linear infinite; }
.sp-logo-pulse { animation: sp-pulse 2.8s ease-in-out infinite; }
@keyframes sp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, .45); } 50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); } }
@media (prefers-reduced-motion: reduce) {
  .sp-gradient, .sp-blob, .sp-shake, .sp-orbit, .sp-orbit-rev, .sp-twinkle, .sp-shine::after, .sp-logo-pulse { animation: none !important; }
  .sp-rise { animation: none !important; opacity: 1; transform: none; }
}
`;
const wrap = 'flex items-center rounded-xl border border-slate-300 bg-white px-3.5 transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/15';
const field = 'w-full bg-transparent py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none';
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('lastPhone') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'Sign in - SalonPro';
  }, []);
  if (user) return <Navigate to="/" replace />;
  function fail(msg: string) {
    setError(msg);
    setShake((n) => n + 1);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (phone.length !== 10) return fail('Enter your 10-digit mobile number.');
    if (!password) return fail('Enter your password.');
    setBusy(true);
    try {
      await login(phone, password);
      try {
        if (remember) localStorage.setItem('lastPhone', phone);
        else localStorage.removeItem('lastPhone');
      } catch {
        /* ignore */
      }
      navigate('/');
    } catch (err: any) {
      fail(err && err.message ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sp-gradient relative flex min-h-screen overflow-hidden">
      <style>{css}</style>
      <span className="sp-blob lg:hidden" style={{ width: 300, height: 300, left: '-20%', top: '-8%', background: '#a78bfa' }} />
      <span className="sp-blob lg:hidden" style={{ width: 280, height: 280, right: '-18%', bottom: '-6%', background: '#f472b6', animationDelay: '-6s' }} />
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <span className="sp-blob" style={{ width: 420, height: 420, left: '-8%', top: '-10%', background: '#a78bfa' }} />
        <span className="sp-blob" style={{ width: 360, height: 360, right: '-6%', bottom: '4%', background: '#f472b6', animationDelay: '-5s' }} />
        <span className="sp-blob" style={{ width: 300, height: 300, left: '38%', top: '42%', background: '#38bdf8', animationDelay: '-9s' }} />
        {sparks.map((s, i) => (
          <span key={i} className="sp-twinkle" style={{ left: s.l, top: s.t, width: s.s, height: s.s, animationDelay: s.d }} />
        ))}
        <div className="sp-rise relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur"><Scissors size={22} /></div>
          <span className="text-2xl font-bold tracking-tight">SalonPro</span>
        </div>
        <div className="relative z-10 max-w-xl">
          <div className="relative mb-8 h-40 w-40">
            <div className="sp-orbit absolute inset-0 rounded-full border border-white/30">
              <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white" />
            </div>
            <div className="sp-orbit-rev absolute inset-4 rounded-full border border-white/20">
              <span className="absolute -bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-pink-300" />
            </div>
            <div className="absolute inset-9 flex items-center justify-center rounded-full bg-white/15 backdrop-blur"><Scissors size={34} /></div>
          </div>
          <h1 className="sp-rise text-4xl font-bold leading-tight xl:text-5xl" style={{ animationDelay: '.1s' }}>
            Run your salon <span className="text-pink-200">smarter</span>.
          </h1>
          <p className="sp-rise mt-3 text-lg text-indigo-100" style={{ animationDelay: '.2s' }}>
            Billing, appointments, stock and reports in one simple system.
          </p>
          <ul className="mt-8 space-y-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="sp-rise flex items-start gap-3" style={{ animationDelay: 0.35 + i * 0.12 + 's' }}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><Icon size={20} /></span>
                  <span>
                    <span className="block font-semibold">{f.title}</span>
                    <span className="block text-sm text-indigo-100">{f.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-xs text-indigo-100/80">
          <Sparkles size={14} /> Made for salons that want to grow
        </div>
      </div>
      <div className="relative z-10 flex w-full items-center justify-center p-5 sm:p-8 lg:w-[480px] lg:shrink-0 lg:bg-slate-50 xl:w-[540px]">
        <div className="w-full max-w-md">
          <div className="sp-rise rounded-3xl bg-white/95 p-7 shadow-2xl shadow-indigo-900/20 backdrop-blur sm:p-9">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="sp-logo-pulse flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Scissors size={22} /></div>
              <span className="text-xl font-bold text-slate-800">SalonPro</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue to your salon.</p>
            {error && (
              <div key={shake} role="alert" className="sp-shake mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="sp-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Mobile number</label>
                <div className={wrap}>
                  <Phone size={18} className="shrink-0 text-slate-400" />
                  <span className="ml-3 shrink-0 border-r border-slate-200 pr-3 text-sm text-slate-500">+91</span>
                  <input
                    id="sp-phone"
                    className={field + ' pl-3'}
                    placeholder="9876543210"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    autoFocus={!phone}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="sp-pass" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                <div className={wrap}>
                  <Lock size={18} className="shrink-0 text-slate-400" />
                  <input
                    id="sp-pass"
                    className={field + ' pl-3'}
                    type={show ? 'text' : 'password'}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    autoFocus={!!phone}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState('CapsLock'))}
                    onKeyDown={(e) => setCaps(e.getModifierState && e.getModifierState('CapsLock'))}
                  />
                  <button type="button" onClick={() => setShow(!show)} className="ml-2 shrink-0 text-slate-400 transition hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {caps && <p className="mt-1.5 text-xs font-medium text-amber-600">Caps Lock is on.</p>}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Remember my number on this device
              </label>
              <button
                disabled={busy}
                className="sp-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? (<><span className="sp-spinner" /> Signing in...</>) : 'Sign in'}
              </button>
            </form>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={14} /> Your sign-in is protected
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-white/80 lg:text-slate-400">&copy; {new Date().getFullYear()} SalonPro. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
