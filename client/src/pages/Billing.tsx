import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Receipt, Plus, Minus, Trash2, Search, X, Printer } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { inputCls } from '../components/Field';
import QuickAddCustomer from '../components/QuickAddCustomer';
import { useToast } from '../components/Toast';
import WhatsAppShare from '../components/WhatsAppShare';
import CancelBillSection from '../components/CancelBill';
import { buildReceipt, printInvoice, scopeTypes, scopeLabel, type Invoice, type PrintScope, type Paper } from '../printing';
import { SALON } from '../salon';
type Cust = { id: number; name: string; phone: string; isActive: boolean };
type Svc = { id: number; name: string; price: string | number; durationMin: number; isActive: boolean; category: { name: string } };
type Prod = { id: number; name: string; sku: string | null; unit: string; usage: string; salePrice: string | number; stockQty: string | number; isActive: boolean };
type Pkg = { id: number; name: string; kind: string; price: string | number; validityDays: number; sessionCount: number | null; isActive: boolean };
type Plan = { id: number; name: string; price: string | number; validityDays: number; discountPercent: string | number; isActive: boolean };
type StaffRow = { id: number; name: string; role: string; isActive: boolean };
type SessPkg = { id: number; name: string; sessionsTotal: number; sessionsUsed: number; expiresAt: string; services: { id: number; name: string }[] };
type CustInfo = { membership: { name: string; discountPercent: number; expiresAt: string } | null; sessionPackages: SessPkg[]; walletBalance: number };
type CartType = 'SERVICE' | 'PRODUCT' | 'PACKAGE' | 'MEMBERSHIP' | 'SESSION_USE' | 'CUSTOM';
type CartItem = { key: number; type: CartType; refId: number; serviceId?: number; name: string; price: number; qty: number; staffId: number | null };
type Preview = {
  subtotal: number; membershipDiscount: number; membership: { name: string; discountPercent: number } | null;
  discountAmount: number; taxableAmount: number; gstRate: number; gstAmount: number; total: number;
};
type PayRow = { mode: string; amount: string; reference: string };
const round2 = (x: number) => Math.round(x * 100) / 100;
const n = (v: unknown) => Number(v) || 0;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const typeLabel: Record<string, string> = {
  SERVICE: 'Service', PRODUCT: 'Product', PACKAGE: 'Package', MEMBERSHIP: 'Membership', SESSION_USE: 'Session', CUSTOM: 'Other',
};
const statusTone: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700', PARTIAL: 'bg-amber-50 text-amber-700',
  UNPAID: 'bg-rose-50 text-rose-700', CANCELLED: 'bg-slate-100 text-slate-500',
};
const statusLabel: Record<string, string> = { PAID: 'Paid', PARTIAL: 'Partly paid', UNPAID: 'Unpaid', CANCELLED: 'Cancelled' };
const modeLabel: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank transfer', WALLET: 'E-Wallet' };
function toItem(c: CartItem) {
  switch (c.type) {
    case 'SERVICE': return { type: 'SERVICE', serviceId: c.refId, qty: c.qty, staffId: c.staffId };
    case 'PRODUCT': return { type: 'PRODUCT', productId: c.refId, qty: c.qty, staffId: c.staffId };
    case 'PACKAGE': return { type: 'PACKAGE', packageId: c.refId, staffId: c.staffId };
    case 'MEMBERSHIP': return { type: 'MEMBERSHIP', planId: c.refId };
    case 'SESSION_USE': return { type: 'SESSION_USE', customerPackageId: c.refId, serviceId: c.serviceId, staffId: c.staffId };
    default: return { type: 'CUSTOM', name: c.name, price: c.price, qty: c.qty, staffId: c.staffId };
  }
}
function Tile(props: { title: string; sub?: string; price?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-indigo-400 hover:bg-indigo-50/40 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white"
    >
      <div className="text-sm font-medium text-slate-800">{props.title}</div>
      {props.sub && <div className="text-xs text-slate-400">{props.sub}</div>}
      {props.price && <div className="mt-1 text-sm font-semibold text-slate-700">{props.price}</div>}
    </button>
  );
}
function InvoiceView(props: { inv: Invoice; canBill: boolean; onClose: () => void; onUpdated: (i: Invoice) => void }) {
  const { inv } = props;
  const toast = useToast();
  let savedPaper: Paper = SALON.defaultPaper === '58' || SALON.defaultPaper === 'A4' ? (SALON.defaultPaper as Paper) : '80';
  try {
    const s = localStorage.getItem('printPaper');
    if (s === '80' || s === '58' || s === 'A4') savedPaper = s;
  } catch {
    savedPaper = '80';
  }
  const [paper, setPaper] = useState<Paper>(savedPaper);
  const [scope, setScope] = useState<PrintScope>('full');
  const due = round2(n(inv.total) - n(inv.paidAmount));
  const [mode, setMode] = useState('CASH');
  const [amt, setAmt] = useState(String(due));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const sections = (Object.keys(scopeTypes) as PrintScope[]).filter((k) =>
    inv.items.some((i) => scopeTypes[k].includes(i.itemType))
  );
  const multi = sections.length > 1;
  const html = useMemo(() => buildReceipt(inv, scope, paper, true), [inv, scope, paper]);
  function choosePaper(p: Paper) {
    setPaper(p);
    try {
      localStorage.setItem('printPaper', p);
    } catch {
      /* ignore */
    }
  }
  async function addPayment() {
    const a = Number(amt);
    if (!(a > 0)) return toast.show('error', 'Enter a valid payment amount.');
    if (a > due + 0.001) return toast.show('error', 'Amount is more than the due balance.');
    setBusy(true);
    try {
      const updated = await api<Invoice>('/invoices/' + inv.id + '/payments', {
        method: 'POST',
        body: JSON.stringify({ mode, amount: a, reference: ref.trim() || undefined }),
      });
      toast.show('success', 'Payment added successfully.');
      props.onUpdated(updated);
      setAmt(String(round2(n(updated.total) - n(updated.paidAmount))));
      setRef('');
    } catch (e: any) {
      toast.show('error', e.message);
    } finally {
      setBusy(false);
    }
  }
  const scopeBtn = (active: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={props.onClose} />
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Bill {inv.invoiceNo}</h2>
            <p className="text-sm text-slate-500">
              {new Date(inv.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' - '}
              {inv.customer ? inv.customer.name : inv.guestName || 'Walk-in guest'}
            </p>
          </div>
          <button onClick={props.onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + statusTone[inv.status]}>{statusLabel[inv.status]}</span>
              {inv.isGst && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">GST invoice</span>}
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {inv.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-slate-800">{i.name}</div>
                    <div className="text-xs text-slate-400">{typeLabel[i.itemType]} - {n(i.qty)} x {inr(n(i.price))}</div>
                  </div>
                  <div className="font-medium text-slate-800">{inr(n(i.amount))}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{inr(n(inv.subtotal))}</span></div>
              {n(inv.membershipDiscount) > 0 && (
                <div className="flex justify-between text-emerald-700"><span>Membership discount</span><span>- {inr(n(inv.membershipDiscount))}</span></div>
              )}
              {n(inv.discountAmount) > 0 && (
                <div className="flex justify-between text-emerald-700"><span>Discount</span><span>- {inr(n(inv.discountAmount))}</span></div>
              )}
              {inv.isGst && (
                <div className="flex justify-between text-slate-600"><span>GST @ {n(inv.gstRate)}%</span><span>{inr(n(inv.gstAmount))}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-800"><span>Total</span><span>{inr(n(inv.total))}</span></div>
              <div className="flex justify-between text-slate-600"><span>Paid</span><span>{inr(n(inv.paidAmount))}</span></div>
              {due > 0.004 && inv.status !== 'CANCELLED' && <div className="flex justify-between font-semibold text-rose-600"><span>Balance due</span><span>{inr(due)}</span></div>}
            </div>
            {(() => {
              const w = inv.payments.filter((p) => p.mode === 'WALLET');
              if (w.length === 0) return null;
              const used = w.reduce((s, p) => s + n(p.amount), 0);
              const left = w[w.length - 1].balanceAfter;
              return (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Paid from E-Wallet: {inr(used)}
                  {left !== null && left !== undefined ? ' - Balance left: ' + inr(n(left)) : ''}
                </div>
              );
            })()}
            {inv.payments.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</div>
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex justify-between py-0.5 text-slate-600">
                    <span>
                      {modeLabel[p.mode] || p.mode}
                      {p.reference ? ' (' + p.reference + ')' : ''} - {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span>{inr(n(p.amount))}</span>
                  </div>
                ))}
              </div>
            )}
            <CancelBillSection inv={inv} onUpdated={props.onUpdated} />

            {inv.status !== 'CANCELLED' && <WhatsAppShare inv={inv} />}

            {props.canBill && due > 0.004 && inv.status !== 'CANCELLED' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                <div className="mb-2 text-sm font-medium text-slate-800">Receive payment</div>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK">Bank transfer</option>
                    {inv.customer && <option value="WALLET">E-Wallet</option>}
                  </select>
                  <input className={inputCls} type="number" min="0" step="any" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
                </div>
                <input className={inputCls + ' mt-2'} placeholder="Reference (UPI ID, card last 4...) - optional" value={ref} onChange={(e) => setRef(e.target.value)} />
                <button disabled={busy} onClick={addPayment} className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                  {busy ? 'Saving...' : 'Add payment'}
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paper</span>
              {(['80', '58', 'A4'] as Paper[]).map((p) => (
                <button key={p} onClick={() => choosePaper(p)} className={scopeBtn(paper === p)}>
                  {p === 'A4' ? 'A4' : p + ' mm'}
                </button>
              ))}
            </div>
            {multi && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Print</span>
                {(['full', ...sections] as PrintScope[]).map((s) => (
                  <button key={s} onClick={() => setScope(s)} className={scopeBtn(scope === s)}>
                    {scopeLabel[s]}
                  </button>
                ))}
              </div>
            )}
            <iframe title="Bill preview" srcDoc={html} className="h-[26rem] w-full rounded-lg border border-slate-200 bg-slate-100" />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => printInvoice(inv, scope, paper)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Printer size={16} /> Print {scope === 'full' ? 'full bill' : scopeLabel[scope].toLowerCase() + ' slip'}
              </button>
              {multi && (
                <button
                  onClick={() => sections.forEach((s) => printInvoice(inv, s, paper))}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Printer size={16} /> Print each type separately
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Tip: in the print window choose your thermal printer. To test without a printer, choose "Save as PDF".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
function NewBill(props: { apptId: number | null; onCancel: () => void; onDone: (inv: Invoice) => void }) {
  const toast = useToast();
  const { apptId } = props;
  const keyRef = useRef(1);
  const applied = useRef(false);
  const [services, setServices] = useState<Svc[]>([]);
  const [products, setProducts] = useState<Prod[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [customer, setCustomer] = useState<Cust | null>(null);
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [custQ, setCustQ] = useState('');
  const [custResults, setCustResults] = useState<Cust[]>([]);
  const [showAddCust, setShowAddCust] = useState(false);
  const [info, setInfo] = useState<CustInfo | null>(null);
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [tab, setTab] = useState<'SERVICE' | 'PRODUCT' | 'PACKAGE' | 'MEMBERSHIP' | 'SESSION' | 'CUSTOM'>('SERVICE');
  const [itemQ, setItemQ] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discType, setDiscType] = useState<'NONE' | 'FLAT' | 'PERCENT'>('NONE');
  const [discValue, setDiscValue] = useState('');
  const [isGst, setIsGst] = useState(SALON.defaultGst);
  const [gstRate, setGstRate] = useState(String(SALON.defaultGstRate));
  const [notes, setNotes] = useState('');
  const [pays, setPays] = useState<PayRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api<Svc[]>('/services'), api<Prod[]>('/products'), api<Pkg[]>('/packages'),
      api<Plan[]>('/memberships'), api<StaffRow[]>('/staff'),
    ])
      .then(([s, p, k, m, st]) => {
        setServices(s);
        setProducts(p);
        setPackages(k);
        setPlans(m);
        setStaff(st.filter((x) => x.isActive));
        setLoaded(true);
      })
      .catch((e) => toast.show('error', e.message));
  }, []);
  useEffect(() => {
    if (customer || guest) return;
    const t = setTimeout(() => {
      api<Cust[]>('/customers?q=' + encodeURIComponent(custQ))
        .then((r) => setCustResults(r.filter((c) => c.isActive).slice(0, 6)))
        .catch(() => setCustResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [custQ, customer, guest]);
  function chooseCustomer(c: Cust) {
    setCustomer(c);
    setGuest(false);
    setCustQ('');
    setInfo(null);
    setCart((l) => l.filter((x) => x.type !== 'SESSION_USE'));
    api<CustInfo>('/invoices/customer-info/' + c.id).then(setInfo).catch(() => setInfo(null));
  }
  function chooseGuest() {
    setCustomer(null);
    setInfo(null);
    setGuest(true);
    setAppointmentId(null);
    setCart((l) => l.filter((x) => !['PACKAGE', 'MEMBERSHIP', 'SESSION_USE'].includes(x.type)));
  }
  function clearCustomer() {
    setCustomer(null);
    setGuest(false);
    setInfo(null);
    setAppointmentId(null);
    setCart((l) => l.filter((x) => x.type !== 'SESSION_USE'));
  }
  useEffect(() => {
    if (!apptId || !loaded || applied.current) return;
    applied.current = true;
    api<any>('/invoices/from-appointment/' + apptId)
      .then((d) => {
        if (d.billedInvoiceNo) {
          toast.show('error', 'This appointment is already billed (' + d.billedInvoiceNo + ').');
          return;
        }
        chooseCustomer({ id: d.customer.id, name: d.customer.name, phone: d.customer.phone, isActive: true });
        setAppointmentId(d.appointmentId);
        const lines: CartItem[] = [];
        for (const it of d.items) {
          const s = services.find((x) => x.id === it.serviceId);
          if (s) lines.push({ key: keyRef.current++, type: 'SERVICE', refId: s.id, name: s.name, price: Number(s.price), qty: 1, staffId: it.staffId ?? null });
        }
        setCart(lines);
      })
      .catch((e) => toast.show('error', e.message));
  }, [apptId, loaded]);
  function addService(s: Svc) {
    const ex = cart.find((x) => x.type === 'SERVICE' && x.refId === s.id && x.staffId === null);
    if (ex) setCart((l) => l.map((x) => (x.key === ex.key ? { ...x, qty: x.qty + 1 } : x)));
    else setCart((l) => [...l, { key: keyRef.current++, type: 'SERVICE', refId: s.id, name: s.name, price: Number(s.price), qty: 1, staffId: null }]);
  }
  function addProduct(p: Prod) {
    const stock = Number(p.stockQty);
    const ex = cart.find((x) => x.type === 'PRODUCT' && x.refId === p.id);
    const inCart = ex ? ex.qty : 0;
    if (inCart + 1 > stock) {
      toast.show('error', stock <= 0 ? p.name + ' is out of stock.' : 'Only ' + stock + ' in stock.');
      return;
    }
    if (ex) setCart((l) => l.map((x) => (x.key === ex.key ? { ...x, qty: x.qty + 1 } : x)));
    else setCart((l) => [...l, { key: keyRef.current++, type: 'PRODUCT', refId: p.id, name: p.name, price: Number(p.salePrice), qty: 1, staffId: null }]);
  }
  function needCustomer(what: string) {
    if (customer) return false;
    toast.show('error', 'Select a customer first. ' + what + ' cannot be billed to a guest.');
    return true;
  }
  function addPackage(k: Pkg) {
    if (needCustomer('Packages')) return;
    setCart((l) => [...l, { key: keyRef.current++, type: 'PACKAGE', refId: k.id, name: k.name, price: Number(k.price), qty: 1, staffId: null }]);
  }
  function addPlan(p: Plan) {
    if (needCustomer('Memberships')) return;
    setCart((l) => [...l, { key: keyRef.current++, type: 'MEMBERSHIP', refId: p.id, name: p.name + ' (membership)', price: Number(p.price), qty: 1, staffId: null }]);
  }
  function addSession(pk: SessPkg, svc: { id: number; name: string }) {
    const inCart = cart.filter((x) => x.type === 'SESSION_USE' && x.refId === pk.id).length;
    if (pk.sessionsUsed + inCart >= pk.sessionsTotal) {
      toast.show('error', 'No sessions left in ' + pk.name + '.');
      return;
    }
    setCart((l) => [...l, { key: keyRef.current++, type: 'SESSION_USE', refId: pk.id, serviceId: svc.id, name: svc.name + ' (session - ' + pk.name + ')', price: 0, qty: 1, staffId: null }]);
  }
  function addCustom() {
    const price = Number(customPrice);
    if (customName.trim().length < 2) return toast.show('error', 'Enter the item name (at least 2 letters).');
    if (customPrice === '' || isNaN(price) || price < 0) return toast.show('error', 'Enter a valid price.');
    setCart((l) => [...l, { key: keyRef.current++, type: 'CUSTOM', refId: 0, name: customName.trim(), price, qty: 1, staffId: null }]);
    setCustomName('');
    setCustomPrice('');
  }
  function changeQty(key: number, delta: number) {
    const c = cart.find((x) => x.key === key);
    if (!c) return;
    const next = c.qty + delta;
    if (next < 1) return;
    if (c.type === 'PRODUCT') {
      const p = products.find((x) => x.id === c.refId);
      if (p && next > Number(p.stockQty)) {
        toast.show('error', 'Only ' + Number(p.stockQty) + ' in stock.');
        return;
      }
    }
    setCart((l) => l.map((x) => (x.key === key ? { ...x, qty: next } : x)));
  }
  const body = useMemo(
    () => ({
      customerId: customer ? customer.id : null,
      guestName: guest ? guestName.trim() || undefined : undefined,
      appointmentId: appointmentId ?? undefined,
      items: cart.map(toItem),
      isGst,
      gstRate: Number(gstRate) || 0,
      discountType: discType === 'NONE' ? null : discType,
      discountValue: discType === 'NONE' ? 0 : Number(discValue) || 0,
      notes: notes.trim() || undefined,
    }),
    [customer, guest, guestName, appointmentId, cart, isGst, gstRate, discType, discValue, notes]
  );
  useEffect(() => {
    if (cart.length === 0) {
      setPreview(null);
      setPreviewErr('');
      return;
    }
    const t = setTimeout(() => {
      api<Preview>('/invoices/preview', { method: 'POST', body: JSON.stringify(body) })
        .then((p) => {
          setPreview(p);
          setPreviewErr('');
        })
        .catch((e) => {
          setPreview(null);
          setPreviewErr(e.message === 'Invalid data' ? 'Check the discount and GST values.' : e.message);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [body]);
  const total = preview ? preview.total : 0;
  const paid = round2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const due = round2(total - paid);
  async function save() {
    if (cart.length === 0) return toast.show('error', 'Add at least one item to the bill.');
    if (cart.some((c) => c.type !== 'MEMBERSHIP' && !c.staffId)) return toast.show('error', 'Select who served each item (Served by).');
    if (!customer && !guest) return toast.show('error', 'Select a customer or choose Walk-in guest.');
    if (!preview) return toast.show('error', previewErr || 'The bill total is not ready yet.');
    if (isGst && (isNaN(Number(gstRate)) || Number(gstRate) < 0 || Number(gstRate) > 28)) {
      return toast.show('error', 'GST rate must be between 0 and 28.');
    }
    if (discType !== 'NONE') {
      const v = Number(discValue);
      if (!(v > 0)) return toast.show('error', 'Enter the discount value.');
      if (discType === 'PERCENT' && v > 100) return toast.show('error', 'Discount cannot be more than 100%.');
    }
    if (pays.some((p) => p.amount !== '' && !(Number(p.amount) > 0))) {
      return toast.show('error', 'Enter valid payment amounts.');
    }
    if (paid > total + 0.001) return toast.show('error', 'Payment is more than the bill total.');
    const walletPaid = round2(pays.filter((p) => p.mode === 'WALLET').reduce((s, p) => s + (Number(p.amount) || 0), 0));
    if (walletPaid > 0 && info && walletPaid > info.walletBalance + 0.001) {
      return toast.show('error', 'Not enough E-Wallet balance. Available: ' + inr(info.walletBalance));
    }
    if (!customer && paid < total - 0.001) return toast.show('error', 'Guest bills must be paid in full.');
    const payments = pays
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.reference.trim() || undefined }));
    setBusy(true);
    try {
      const inv = await api<Invoice>('/invoices', { method: 'POST', body: JSON.stringify({ ...body, payments }) });
      toast.show('success', 'Bill ' + inv.invoiceNo + ' created successfully.');
      props.onDone(inv);
    } catch (e: any) {
      toast.show('error', e.message === 'Invalid data' ? 'Please check the details and try again.' : e.message);
    } finally {
      setBusy(false);
    }
  }
  const q2 = itemQ.trim().toLowerCase();
  const fSvc = services.filter((s) => s.isActive && (!q2 || s.name.toLowerCase().includes(q2)));
  const fProd = products.filter(
    (p) => p.isActive && p.usage !== 'SALON_USE' && (!q2 || p.name.toLowerCase().includes(q2) || (p.sku || '').toLowerCase().includes(q2))
  );
  const fPkg = packages.filter((p) => p.isActive && (!q2 || p.name.toLowerCase().includes(q2)));
  const fPlan = plans.filter((p) => p.isActive && (!q2 || p.name.toLowerCase().includes(q2)));
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'SERVICE', label: 'Services' },
    { id: 'PRODUCT', label: 'Products' },
    { id: 'PACKAGE', label: 'Packages' },
    { id: 'MEMBERSHIP', label: 'Memberships' },
    { id: 'SESSION', label: 'Use session' + (info && info.sessionPackages.length ? ' (' + info.sessionPackages.length + ')' : '') },
    { id: 'CUSTOM', label: 'Other' },
  ];
  const tabBtn = (active: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Receipt size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">New bill</h1>
            <p className="text-sm text-slate-500">Services, products, packages and memberships in one bill</p>
          </div>
        </div>
        <button onClick={props.onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to bills
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {showAddCust && (<QuickAddCustomer initial={custQ} onClose={() => setShowAddCust(false)} onCreated={(c) => { setShowAddCust(false); chooseCustomer(c); }} />)}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">Customer</div>
            {customer ? (
              <div>
                <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{customer.name}</span>
                    <span className="ml-2 text-slate-500">+91 {customer.phone}</span>
                  </div>
                  <button onClick={clearCustomer} className="text-slate-400 hover:text-slate-700" aria-label="Change customer"><X size={16} /></button>
                </div>
                {info && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    E-Wallet balance: {inr(info.walletBalance)}
                  </div>
                )}
                {info && info.membership && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {info.membership.name}: {info.membership.discountPercent}% off on services (valid till{' '}
                    {new Date(info.membership.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})
                  </div>
                )}
                {info && info.sessionPackages.map((p) => (
                  <div key={p.id} className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
                    {p.name}: {p.sessionsTotal - p.sessionsUsed} of {p.sessionsTotal} sessions left
                  </div>
                ))}
              </div>
            ) : guest ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">Walk-in guest</span>
                  <button onClick={clearCustomer} className="text-slate-400 hover:text-slate-700" aria-label="Change customer"><X size={16} /></button>
                </div>
                <input className={inputCls} placeholder="Guest name (optional)" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                <p className="text-xs text-slate-400">Guest bills are for services and products only, and must be paid in full.</p>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={inputCls + ' pl-9'} placeholder="Search customer by name or mobile" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                </div>
                {custResults.length > 0 && (
                  <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
                    {custResults.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => chooseCustomer(c)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                          <span className="text-slate-800">{c.name}</span>
                          <span className="text-slate-500">+91 {c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => setShowAddCust(true)} className="mr-4 mt-2 text-sm font-medium text-indigo-600 hover:underline">+ Add new customer</button>
                <button type="button" onClick={chooseGuest} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
                  Or continue as Walk-in guest
                </button>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => { setTab(t.id); setItemQ(''); }} className={tabBtn(tab === t.id)}>{t.label}</button>
              ))}
            </div>
            {tab !== 'SESSION' && tab !== 'CUSTOM' && (
              <div className="relative mb-3 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={inputCls + ' pl-9'} placeholder="Search" value={itemQ} onChange={(e) => setItemQ(e.target.value)} />
              </div>
            )}
            {!loaded && <div className="text-sm text-slate-400">Loading...</div>}
            {tab === 'SERVICE' && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {fSvc.map((s) => (
                  <Tile key={s.id} title={s.name} sub={s.category?.name + ' - ' + s.durationMin + ' min'} price={inr(Number(s.price))} onClick={() => addService(s)} />
                ))}
                {loaded && fSvc.length === 0 && <div className="col-span-full text-sm text-slate-400">No services found.</div>}
              </div>
            )}
            {tab === 'PRODUCT' && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {fProd.map((p) => (
                  <Tile
                    key={p.id}
                    title={p.name}
                    sub={'Stock: ' + Number(p.stockQty) + ' ' + p.unit}
                    price={inr(Number(p.salePrice))}
                    disabled={Number(p.stockQty) <= 0}
                    onClick={() => addProduct(p)}
                  />
                ))}
                {loaded && fProd.length === 0 && <div className="col-span-full text-sm text-slate-400">No products found.</div>}
              </div>
            )}
            {tab === 'PACKAGE' && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {fPkg.map((k) => (
                  <Tile
                    key={k.id}
                    title={k.name}
                    sub={(k.kind === 'SESSION' ? k.sessionCount + ' sessions' : 'Group of services') + ' - ' + k.validityDays + ' days'}
                    price={inr(Number(k.price))}
                    disabled={!customer}
                    onClick={() => addPackage(k)}
                  />
                ))}
                {loaded && fPkg.length === 0 && <div className="col-span-full text-sm text-slate-400">No packages found.</div>}
                {!customer && <div className="col-span-full text-xs text-slate-400">Select a customer to sell a package.</div>}
              </div>
            )}
            {tab === 'MEMBERSHIP' && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {fPlan.map((p) => (
                  <Tile
                    key={p.id}
                    title={p.name}
                    sub={n(p.discountPercent) + '% off on services - ' + p.validityDays + ' days'}
                    price={inr(Number(p.price))}
                    disabled={!customer}
                    onClick={() => addPlan(p)}
                  />
                ))}
                {loaded && fPlan.length === 0 && <div className="col-span-full text-sm text-slate-400">No membership plans found.</div>}
                {!customer && <div className="col-span-full text-xs text-slate-400">Select a customer to give a membership.</div>}
              </div>
            )}
            {tab === 'SESSION' && (
              <div className="space-y-3">
                {!customer && <div className="text-sm text-slate-400">Select a customer to use their package sessions.</div>}
                {customer && info && info.sessionPackages.length === 0 && (
                  <div className="text-sm text-slate-400">This customer has no active session packages.</div>
                )}
                {info && info.sessionPackages.map((p) => (
                  <div key={p.id} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                    <div className="text-sm font-medium text-slate-800">
                      {p.name} - {p.sessionsTotal - p.sessionsUsed} of {p.sessionsTotal} sessions left
                    </div>
                    <div className="text-xs text-slate-500">
                      Valid till {new Date(p.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Tap a service to use one session.
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.services.map((s) => (
                        <button key={s.id} onClick={() => addSession(p, s)} className="rounded-full border border-violet-300 bg-white px-3 py-1 text-sm text-violet-700 hover:bg-violet-50">
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'CUSTOM' && (
              <div className="grid max-w-md grid-cols-1 gap-2">
                <input className={inputCls} placeholder="Item name (e.g. Extra charge)" value={customName} onChange={(e) => setCustomName(e.target.value)} />
                <input className={inputCls} type="number" min="0" step="any" placeholder={'Price (\u20B9)'} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
                <button onClick={addCustom} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Add item</button>
              </div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Bill items ({cart.length})</div>
              {cart.length > 1 && (
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : 0;
                    if (v) setCart((l) => l.map((x) => (x.type === 'MEMBERSHIP' ? x : { ...x, staffId: v })));
                  }}
                >
                  <option value="">Set served by for all</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
            {cart.length === 0 && <div className="py-4 text-center text-sm text-slate-400">No items added yet.</div>}
            <div className="divide-y divide-slate-100">
              {cart.map((c) => (
                <div key={c.key} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-400">{typeLabel[c.type]}{c.type !== 'SESSION_USE' ? ' - ' + inr(c.price) : ''}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{c.type === 'SESSION_USE' ? 'Session' : inr(c.price * c.qty)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {(c.type === 'SERVICE' || c.type === 'PRODUCT' || c.type === 'CUSTOM') && (
                      <div className="flex items-center rounded-lg border border-slate-300">
                        <button onClick={() => changeQty(c.key, -1)} className="px-2 py-1 text-slate-500 hover:text-slate-800" aria-label="Decrease"><Minus size={14} /></button>
                        <span className="w-8 text-center text-sm">{c.qty}</span>
                        <button onClick={() => changeQty(c.key, 1)} className="px-2 py-1 text-slate-500 hover:text-slate-800" aria-label="Increase"><Plus size={14} /></button>
                      </div>
                    )}
                    {c.type !== 'MEMBERSHIP' && (
                      <select
                        className={'min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs ' + (c.staffId ? 'border-slate-300 text-slate-600' : 'border-rose-400 bg-rose-50 text-rose-700')}
                        value={c.staffId ?? ''}
                        onChange={(e) => setCart((l) => l.map((x) => (x.key === c.key ? { ...x, staffId: e.target.value ? Number(e.target.value) : null } : x)))}
                      >
                        <option value="">Served by *</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => setCart((l) => l.filter((x) => x.key !== c.key))} className="ml-auto text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Discount</label>
                    <select className={inputCls} value={discType} onChange={(e) => setDiscType(e.target.value as 'NONE' | 'FLAT' | 'PERCENT')}>
                      <option value="NONE">No discount</option>
                      <option value="PERCENT">Percent (%)</option>
                      <option value="FLAT">Flat amount</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Discount value</label>
                    <input className={inputCls} type="number" min="0" step="any" disabled={discType === 'NONE'} placeholder={discType === 'PERCENT' ? 'e.g. 10' : 'e.g. 100'} value={discValue} onChange={(e) => setDiscValue(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={isGst} onChange={(e) => setIsGst(e.target.checked)} /> GST invoice
                  </label>
                  {isGst && (
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      Rate <input className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm" type="number" min="0" max="28" step="any" value={gstRate} onChange={(e) => setGstRate(e.target.value)} /> %
                    </div>
                  )}
                </div>
                {previewErr && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{previewErr}</div>}
                {preview && (
                  <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{inr(preview.subtotal)}</span></div>
                    {preview.membershipDiscount > 0 && preview.membership && (
                      <div className="flex justify-between text-emerald-700">
                        <span>{preview.membership.name} ({preview.membership.discountPercent}%)</span>
                        <span>- {inr(preview.membershipDiscount)}</span>
                      </div>
                    )}
                    {preview.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700"><span>Discount</span><span>- {inr(preview.discountAmount)}</span></div>
                    )}
                    {isGst && (
                      <div className="flex justify-between text-slate-600"><span>GST @ {preview.gstRate}%</span><span>{inr(preview.gstAmount)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800"><span>Total</span><span>{inr(preview.total)}</span></div>
                  </div>
                )}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-800">Payment</div>
                    <div className="flex gap-3 text-xs">
                      <button type="button" disabled={!preview} onClick={() => setPays([{ mode: 'CASH', amount: String(total), reference: '' }])} className="font-medium text-indigo-600 hover:underline disabled:opacity-40">Pay full</button>
                      <button type="button" onClick={() => setPays((l) => [...l, { mode: 'CASH', amount: '', reference: '' }])} className="font-medium text-indigo-600 hover:underline">Add payment</button>
                    </div>
                  </div>
                  {pays.length === 0 && <div className="text-xs text-slate-400">No payment added. The full amount will stay as due.</div>}
                  {pays.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <select className={inputCls + ' col-span-4'} value={p.mode} onChange={(e) => setPays((l) => l.map((x, k) => (k === i ? { ...x, mode: e.target.value } : x)))}>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK">Bank</option>
                      {customer && <option value="WALLET">E-Wallet</option>}
                      </select>
                      <input className={inputCls + ' col-span-4'} type="number" min="0" step="any" placeholder="Amount" value={p.amount} onChange={(e) => setPays((l) => l.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                      <input className={inputCls + ' col-span-3'} placeholder="Ref" value={p.reference} onChange={(e) => setPays((l) => l.map((x, k) => (k === i ? { ...x, reference: e.target.value } : x)))} />
                      <button onClick={() => setPays((l) => l.filter((_, k) => k !== i))} className="col-span-1 text-slate-400 hover:text-rose-600" aria-label="Remove payment"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {preview && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Paid {inr(paid)}</span>
                      <span className={due > 0.004 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                        {due > 0.004 ? 'Due ' + inr(due) : due < -0.004 ? 'Extra ' + inr(-due) : 'Fully paid'}
                      </span>
                    </div>
                  )}
                </div>
                <input className={inputCls} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button disabled={busy} onClick={save} className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                  {busy ? 'Saving...' : 'Save bill'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Billing() {
  const toast = useToast();
  const { user } = useAuth();
  const canBill = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user?.role || '');
  const [params, setParams] = useSearchParams();
  const apptParam = params.get('appointment');
  const apptId = apptParam ? Number(apptParam) : null;
  const [view, setView] = useState<'list' | 'new'>(apptId ? 'new' : 'list');
  const [list, setList] = useState<Invoice[]>([]);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'today' | 'week' | 'all'>('today');
  const [loading, setLoading] = useState(true);
  const [take, setTake] = useState(200);
  const [open, setOpen] = useState<Invoice | null>(null);
  function load() {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    if (range === 'today') {
      qs.set('from', s.toISOString());
      qs.set('to', e.toISOString());
    }
    if (range === 'week') {
      const f = new Date(s);
      f.setDate(f.getDate() - 6);
      qs.set('from', f.toISOString());
      qs.set('to', e.toISOString());
    }
    qs.set('take', String(take));
    api<Invoice[]>('/invoices?' + qs.toString())
      .then(setList)
      .catch((err) => toast.show('error', err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    if (view !== 'list') return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q, range, view, take]);
  function leaveNew() {
    setParams({});
    setView('list');
  }
  if (view === 'new') {
    return (
      <NewBill
        apptId={apptId}
        onCancel={leaveNew}
        onDone={(inv) => {
          leaveNew();
          setOpen(inv);
        }}
      />
    );
  }
  const live = list.filter((i) => i.status !== 'CANCELLED');
  const billed = round2(live.reduce((s, i) => s + n(i.total), 0));
  const collected = round2(live.reduce((s, i) => s + n(i.paidAmount), 0));
  const chip = (active: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Receipt size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Billing</h1>
            <p className="text-sm text-slate-500">{list.length} bills</p>
          </div>
        </div>
        {canBill && (
          <button onClick={() => setView('new')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            <Plus size={16} /> New bill
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Billed</div><div className="text-2xl font-bold text-slate-800">{inr(billed)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Collected</div><div className="text-2xl font-bold text-emerald-600">{inr(collected)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">Due</div><div className="text-2xl font-bold text-rose-600">{inr(round2(billed - collected))}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search by bill no, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRange('today')} className={chip(range === 'today')}>Today</button>
          <button onClick={() => setRange('week')} className={chip(range === 'week')}>Last 7 days</button>
          <button onClick={() => setRange('all')} className={chip(range === 'all')}>All</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Bill no</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Date</th>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Items</th>
              <th className="px-5 py-3 font-semibold">Total</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Due</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>}
            {!loading && list.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No bills found.</td></tr>}
            {list.map((i) => {
              const d = round2(n(i.total) - n(i.paidAmount));
              const kinds = Array.from(new Set(i.items.map((x) => typeLabel[x.itemType]))).join(', ');
              return (
                <tr key={i.id} onClick={() => setOpen(i)} className="cursor-pointer hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-800">{i.invoiceNo}</td>
                  <td className="hidden px-5 py-3 text-slate-500 md:table-cell">
                    {new Date(i.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{i.customer ? i.customer.name : i.guestName || 'Walk-in guest'}</td>
                  <td className="hidden px-5 py-3 text-slate-500 lg:table-cell">{kinds}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{inr(n(i.total))}</td>
                  <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{d > 0.004 && i.status !== 'CANCELLED' ? inr(d) : '-'}</td>
                  <td className="px-5 py-3">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + statusTone[i.status]}>{statusLabel[i.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length >= take && (
        <div className="text-center">
          <button onClick={() => setTake(take + 200)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Load more bills
          </button>
        </div>
      )}
      {open && (
        <InvoiceView
          inv={open}
          canBill={canBill}
          onClose={() => setOpen(null)}
          onUpdated={(upd) => {
            setOpen(upd);
            setList((l) => l.map((x) => (x.id === upd.id ? upd : x)));
          }}
        />
      )}
    </div>
  );
}



























