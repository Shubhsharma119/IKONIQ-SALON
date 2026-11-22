import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Phone, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Scissors } from 'lucide-react';
import { useAuth } from '../auth';
import { LOGO_SRC } from '../brand';
const dust = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 7) % 100,
  delay: (i * 1.3) % 12,
  dur: 10 + ((i * 7) % 9),
  size: 2 + (i % 3),
}));
const css = `
.ik-root { background: #050505; color: #f5efe6; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.ik-glow { position: absolute; left: 50%; top: 34%; width: 78vmin; height: 78vmin; transform: translate(-50%, -50%); border-radius: 9999px; background: radial-gradient(circle, rgba(216, 195, 165, .20), rgba(216, 195, 165, 0) 65%); animation: ik-breathe 6s ease-in-out infinite; pointer-events: none; }
@keyframes ik-breathe { 0%, 100% { opacity: .55; transform: translate(-50%, -50%) scale(.95); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } }
.ik-dust { position: absolute; bottom: -12px; border-radius: 9999px; background: #e8d7bd; opacity: 0; animation: ik-dust linear infinite; pointer-events: none; }
@keyframes ik-dust { 0% { transform: translate3d(0, 0, 0); opacity: 0; } 12% { opacity: .75; } 85% { opacity: .25; } 100% { transform: translate3d(22px, -108vh, 0); opacity: 0; } }
.ik-logo-wrap { position: relative; isolation: isolate; width: 100%; aspect-ratio: 16 / 6.6; overflow: hidden; -webkit-mask-image: radial-gradient(ellipse 72% 78% at 50% 50%, #000 58%, transparent 100%); mask-image: radial-gradient(ellipse 72% 78% at 50% 50%, #000 58%, transparent 100%); }
.ik-logo { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; animation: ik-logo-in 1.6s cubic-bezier(.2, .7, .2, 1) both, ik-logo-glow 5s ease-in-out 1.6s infinite; }
@keyframes ik-logo-in { from { opacity: 0; transform: scale(.9); filter: blur(10px) brightness(.6); } to { opacity: 1; transform: none; filter: blur(0) brightness(1); } }
@keyframes ik-logo-glow { 0%, 100% { filter: drop-shadow(0 0 0 rgba(216, 195, 165, 0)) brightness(1); } 50% { filter: drop-shadow(0 0 14px rgba(216, 195, 165, .45)) brightness(1.08); } }
.ik-sheen { position: absolute; inset: 0; overflow: hidden; mix-blend-mode: color-dodge; pointer-events: none; }
.ik-sheen::after { content: ''; position: absolute; top: -10%; bottom: -10%; left: 0; width: 35%; background: linear-gradient(100deg, transparent, rgba(255, 235, 205, .65), transparent); transform: translateX(-150%) skewX(-12deg); animation: ik-sheen 6s ease-in-out 2s infinite; }
@keyframes ik-sheen { 0% { transform: translateX(-150%) skewX(-12deg); } 40%, 100% { transform: translateX(400%) skewX(-12deg); } }
.ik-fallback { text-align: center; padding: 28px 0; animation: ik-logo-in 1.6s cubic-bezier(.2, .7, .2, 1) both; }
.ik-fb-name { font-family: Georgia, 'Times New Roman', serif; font-size: 52px; letter-spacing: .22em; color: #e8d7bd; text-shadow: 0 0 24px rgba(216, 195, 165, .45); }
.ik-fb-sub { margin-top: 6px; font-size: 14px; letter-spacing: .6em; color: #d8c3a5; }
.ik-line { height: 1px; width: 160px; margin: 6px auto 0; background: linear-gradient(90deg, transparent, #d8c3a5, transparent); transform: scaleX(0); animation: ik-line 1.2s ease-out 1.1s forwards; }
@keyframes ik-line { to { transform: scaleX(1); } }
.ik-rise { opacity: 0; transform: translateY(18px); animation: ik-rise .8s cubic-bezier(.2, .7, .2, 1) forwards; }
@keyframes ik-rise { to { opacity: 1; transform: none; } }
.ik-card { position: relative; overflow: hidden; border-radius: 24px; border: 1px solid rgba(216, 195, 165, .20); background: rgba(255, 255, 255, .045); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); }
.ik-card::before { content: ''; position: absolute; top: 0; left: 0; height: 1px; width: 45%; background: linear-gradient(90deg, transparent, #e8d7bd, transparent); animation: ik-topline 5s ease-in-out infinite; }
@keyframes ik-topline { 0% { transform: translateX(-100%); } 100% { transform: translateX(240%); } }
.ik-label { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: rgba(245, 239, 230, .7); }
.ik-field { display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05); border-radius: 12px; padding: 0 14px; transition: border-color .2s, box-shadow .2s, background .2s; }
.ik-field:focus-within { border-color: #d8c3a5; box-shadow: 0 0 0 4px rgba(216, 195, 165, .15); background: rgba(255, 255, 255, .08); }
.ik-input { width: 100%; background: transparent; color: #f5efe6; padding: 13px 0; font-size: 14px; outline: none; border: 0; }
.ik-input::placeholder { color: rgba(245, 239, 230, .35); }
.ik-input:-webkit-autofill { -webkit-text-fill-color: #f5efe6; box-shadow: 0 0 0 1000px #17140f inset; transition: background-color 9999s ease-out 0s; }
.ik-icon { color: rgba(216, 195, 165, .8); flex-shrink: 0; }
.ik-prefix { flex-shrink: 0; padding-right: 10px; border-right: 1px solid rgba(255, 255, 255, .14); font-size: 13px; color: rgba(245, 239, 230, .6); }
.ik-eye { flex-shrink: 0; color: rgba(245, 239, 230, .5); transition: color .2s; }
.ik-eye:hover { color: #e8d7bd; }
.ik-btn { position: relative; overflow: hidden; display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 12px; padding: 13px 16px; font-size: 14px; font-weight: 600; letter-spacing: .04em; color: #1a1410; background: linear-gradient(135deg, #ecdcc3, #c9ab83); box-shadow: 0 10px 28px rgba(201, 171, 131, .28); transition: transform .2s, box-shadow .2s, opacity .2s; cursor: pointer; }
.ik-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(201, 171, 131, .38); }
.ik-btn:active { transform: translateY(0); }
.ik-btn:disabled { opacity: .7; cursor: not-allowed; transform: none; }
.ik-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, .55) 50%, transparent 70%); transform: translateX(-120%); animation: ik-btn-shine 3.4s ease-in-out infinite; }
@keyframes ik-btn-shine { 60%, 100% { transform: translateX(120%); } }
.ik-spinner { width: 17px; height: 17px; border: 2px solid rgba(26, 20, 16, .3); border-top-color: #1a1410; border-radius: 9999px; animation: ik-spin .7s linear infinite; }
@keyframes ik-spin { to { transform: rotate(360deg); } }
.ik-error { display: flex; gap: 8px; align-items: flex-start; border: 1px solid rgba(248, 113, 113, .35); background: rgba(127, 29, 29, .35); color: #fecaca; border-radius: 12px; padding: 10px 14px; font-size: 13px; animation: ik-shake .45s ease; }
@keyframes ik-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-6px); } 40%, 60% { transform: translateX(6px); } }
.ik-footer { text-align: center; font-size: 12px; color: rgba(245, 239, 230, .55); }
.ik-footer b { font-weight: 600; color: #d8c3a5; letter-spacing: .04em; }
.ik-brand { margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: .28em; text-transform: uppercase; color: rgba(216, 195, 165, .8); }
@media (prefers-reduced-motion: reduce) {
  .ik-glow, .ik-dust, .ik-logo, .ik-sheen::after, .ik-fallback, .ik-card::before, .ik-btn::after, .ik-error { animation: none !important; }
  .ik-rise { animation: none !important; opacity: 1; transform: none; }
  .ik-line { animation: none !important; transform: scaleX(1); }
}
`;
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
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    document.title = 'IKONIQ Salon - Sign in';
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
  const showLogo = !!LOGO_SRC && !logoFailed;
  return (
    <div className="ik-root relative flex min-h-screen flex-col overflow-hidden px-5">
      <style>{css}</style>
      <div className="ik-glow" />
      {dust.map((d, i) => (
        <span key={i} className="ik-dust" style={{ left: d.left + '%', width: d.size, height: d.size, animationDelay: d.delay + 's', animationDuration: d.dur + 's' }} />
      ))}
      <div className="relative z-10 flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-md">
          <div className="mx-auto w-full max-w-[520px]">
            {showLogo ? (
              <div className="ik-logo-wrap">
                <img src={LOGO_SRC} alt="IKONIQ Salon" className="ik-logo" draggable={false} onError={() => setLogoFailed(true)} />
                <span className="ik-sheen" />
              </div>
            ) : (
              <div className="ik-fallback">
                <div className="ik-fb-name">IKONIQ</div>
                <div className="ik-fb-sub">SALON</div>
              </div>
            )}
            <div className="ik-line" />
          </div>
          <div className="ik-rise mt-6" style={{ animationDelay: '.9s' }}>
            <div className="ik-card p-7 sm:p-8">
              <h1 className="text-xl font-semibold" style={{ color: '#f5efe6' }}>Welcome back</h1>
              <p className="mt-1 text-sm" style={{ color: 'rgba(245,239,230,.6)' }}>Sign in to continue to your salon.</p>
              {error && (
                <div key={shake} role="alert" className="ik-error mt-5">
                  <AlertCircle size={18} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}
              <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
                <div>
                  <label htmlFor="ik-phone" className="ik-label">Mobile number</label>
                  <div className="ik-field">
                    <Phone size={18} className="ik-icon" />
                    <span className="ik-prefix">+91</span>
                    <input
                      id="ik-phone"
                      className="ik-input"
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
                  <label htmlFor="ik-pass" className="ik-label">Password</label>
                  <div className="ik-field">
                    <Lock size={18} className="ik-icon" />
                    <input
                      id="ik-pass"
                      className="ik-input"
                      type={show ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      autoFocus={!!phone}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState('CapsLock'))}
                      onKeyDown={(e) => setCaps(e.getModifierState && e.getModifierState('CapsLock'))}
                    />
                    <button type="button" onClick={() => setShow(!show)} className="ik-eye" aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {caps && <p className="mt-1.5 text-xs font-medium" style={{ color: '#fbbf24' }}>Caps Lock is on.</p>}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'rgba(245,239,230,.7)' }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" style={{ accentColor: '#d8c3a5' }} />
                  Remember my number on this device
                </label>
                <button disabled={busy} className="ik-btn">
                  {busy ? (<><span className="ik-spinner" /> Signing in...</>) : 'Sign in'}
                </button>
              </form>
              <div className="mt-6 flex items-center justify-center gap-2 text-xs" style={{ color: 'rgba(245,239,230,.4)' }}>
                <ShieldCheck size={14} /> Your sign-in is protected
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ik-rise ik-footer relative z-10 pb-6" style={{ animationDelay: '1.6s' }}>
        <div>Powered by <b>Hopix Tech Solutions</b></div>
        <div className="ik-brand"><Scissors size={13} /> SalonPro</div>
      </div>
    </div>
  );
}
