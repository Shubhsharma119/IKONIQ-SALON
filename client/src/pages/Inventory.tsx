import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, Pencil, Power, Boxes, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Field, { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
type Product = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  usage: string;
  costPrice: string | number;
  salePrice: string | number;
  stockQty: string | number;
  lowStockLevel: string | number;
  expiryDate: string | null;
  isActive: boolean;
  isLow: boolean;
};
const inr = (n: number) => '\u20B9' + n.toLocaleString('en-IN');
const usageLabel: Record<string, string> = { SALE: 'For sale', SALON_USE: 'Salon use', BOTH: 'Sale + salon use' };
const usageTone: Record<string, string> = {
  SALE: 'bg-emerald-50 text-emerald-700',
  SALON_USE: 'bg-violet-50 text-violet-700',
  BOTH: 'bg-blue-50 text-blue-700',
};
const stockActions: { value: string; label: string }[] = [
  { value: 'IN', label: 'Stock in (purchase / received)' },
  { value: 'OUT', label: 'Stock out (manual)' },
  { value: 'USED', label: 'Used in salon' },
  { value: 'DAMAGED', label: 'Damaged / expired' },
  { value: 'ADJUST', label: 'Set exact count (stock correction)' },
];
const emptyForm = {
  name: '', sku: '', category: '', unit: 'piece', usage: 'SALE',
  costPrice: '', salePrice: '', openingStock: '', lowStockLevel: '', expiryDate: '',
};
type Errors = Partial<Record<keyof typeof emptyForm, string>>;
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
const isWhole = (unit: string) => unit === 'piece' || unit === 'kit';
function validate(f: typeof emptyForm, isEdit: boolean): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the product name (at least 2 letters).';
  const sp = num(f.salePrice);
  if (isNaN(sp) || sp < 0) e.salePrice = 'Enter a valid selling price.';
  else if (f.usage !== 'SALON_USE' && sp <= 0) e.salePrice = 'Enter the selling price (more than 0).';
  const cp = num(f.costPrice);
  if (isNaN(cp) || cp < 0) e.costPrice = 'Enter a valid cost price.';
  if (!isEdit) {
    const o = num(f.openingStock);
    if (isNaN(o) || o < 0) e.openingStock = 'Enter a valid quantity.';
    else if (isWhole(f.unit) && !Number.isInteger(o)) e.openingStock = 'Use a whole number for this unit.';
  }
  const l = num(f.lowStockLevel);
  if (isNaN(l) || l < 0) e.lowStockLevel = 'Enter a valid quantity.';
  return e;
}
function expiryInfo(d: string | null) {
  if (!d) return { text: '-', cls: 'text-slate-400' };
  const dt = new Date(d);
  const days = Math.floor((dt.getTime() - Date.now()) / 86400000);
  const text = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days < 0) return { text: text + ' (expired)', cls: 'text-rose-600 font-medium' };
  if (days <= 30) return { text: text + ' (' + days + 'd left)', cls: 'text-amber-600 font-medium' };
  return { text, cls: 'text-slate-600' };
}
function stockPreview(type: string, cur: number, qtyStr: string, unit: string) {
  const q = Number(qtyStr);
  if (qtyStr === '' || isNaN(q)) return 'Enter the quantity.';
  const next = type === 'IN' ? cur + q : type === 'ADJUST' ? q : cur - q;
  return 'New stock will be ' + Math.round(next * 1000) / 1000 + ' ' + unit;
}
export default function Inventory() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');
  const [list, setList] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'sale' | 'salon' | 'low'>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ type: 'IN', qty: '', note: '' });
  const [stockErr, setStockErr] = useState('');
  function load(search: string) {
    api<Product[]>('/products?q=' + encodeURIComponent(search))
      .then(setList)
      .catch((e) => toast.show('error', e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setShowForm(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku || '',
      category: p.category || '',
      unit: p.unit,
      usage: p.usage,
      costPrice: String(Number(p.costPrice)),
      salePrice: String(Number(p.salePrice)),
      openingStock: '',
      lowStockLevel: String(Number(p.lowStockLevel)),
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : '',
    });
    setErrors({});
    setShowForm(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const isEdit = !!editing;
    const errs = validate(form, isEdit);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.show('error', Object.values(errs)[0] as string);
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      unit: form.unit,
      usage: form.usage,
      costPrice: num(form.costPrice),
      salePrice: num(form.salePrice),
      lowStockLevel: num(form.lowStockLevel),
    };
    if (form.sku.trim()) body.sku = form.sku.trim();
    if (form.category.trim()) body.category = form.category.trim();
    if (isEdit) body.expiryDate = form.expiryDate || null;
    else {
      if (form.expiryDate) body.expiryDate = form.expiryDate;
      body.openingStock = num(form.openingStock);
    }
    setBusy(true);
    try {
      await api(isEdit ? '/products/' + editing!.id : '/products', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show('success', isEdit ? 'Product updated successfully.' : 'Product added successfully.');
      setShowForm(false);
      load(q);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Product) {
    const word = p.isActive ? 'deactivate' : 'activate';
    if (!window.confirm('Do you want to ' + word + ' ' + p.name + '?')) return;
    try {
      await api('/products/' + p.id, { method: 'PUT', body: JSON.stringify({ isActive: !p.isActive }) });
      toast.show('success', 'Product ' + word + 'd successfully.');
      load(q);
    } catch (err: any) {
      toast.show('error', err.message);
    }
  }
  function openStock(p: Product) {
    setStockFor(p);
    setStockForm({ type: 'IN', qty: '', note: '' });
    setStockErr('');
  }
  async function submitStock(e: FormEvent) {
    e.preventDefault();
    if (!stockFor) return;
    const qty = Number(stockForm.qty);
    const cur = Number(stockFor.stockQty);
    let err = '';
    if (stockForm.qty === '' || isNaN(qty) || qty < 0) err = 'Enter a valid quantity.';
    else if (stockForm.type !== 'ADJUST' && qty <= 0) err = 'Quantity must be more than 0.';
    else if (isWhole(stockFor.unit) && !Number.isInteger(qty)) err = 'Use a whole number for this unit.';
    else if (stockForm.type !== 'IN' && stockForm.type !== 'ADJUST' && qty > cur) err = 'Not enough stock. Available: ' + cur;
    setStockErr(err);
    if (err) {
      toast.show('error', err);
      return;
    }
    setBusy(true);
    try {
      await api('/products/' + stockFor.id + '/stock', {
        method: 'POST',
        body: JSON.stringify({ type: stockForm.type, qty, note: stockForm.note.trim() || undefined }),
      });
      toast.show('success', 'Stock updated successfully.');
      setStockFor(null);
      load(q);
    } catch (e2: any) {
      toast.show('error', e2.message);
    } finally {
      setBusy(false);
    }
  }
  const lowCount = list.filter((p) => p.isActive && p.isLow).length;
  const shown = list.filter((p) =>
    filter === 'all' ? true
    : filter === 'sale' ? p.usage !== 'SALON_USE'
    : filter === 'salon' ? p.usage !== 'SALE'
    : p.isLow
  );
  const chip = (active: boolean) =>
    'rounded-full border px-3.5 py-1.5 text-sm font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Boxes size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
            <p className="text-sm text-slate-500">{shown.length} products</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add product
          </button>
        )}
      </div>
      {lowCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} />
          {lowCount} {lowCount === 1 ? 'product is' : 'products are'} running low on stock.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search by name, SKU or category" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
          <button onClick={() => setFilter('sale')} className={chip(filter === 'sale')}>For sale</button>
          <button onClick={() => setFilter('salon')} className={chip(filter === 'salon')}>Salon use</button>
          <button onClick={() => setFilter('low')} className={chip(filter === 'low')}>Low stock</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Product</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">Type</th>
              <th className="px-5 py-3 font-semibold">Stock</th>
              <th className="px-5 py-3 font-semibold">Selling price</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Cost price</th>
              <th className="hidden px-5 py-3 font-semibold lg:table-cell">Expiry</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No products found.</td></tr>
            )}
            {shown.map((p) => {
              const ex = expiryInfo(p.expiryDate);
              return (
                <tr key={p.id} className={'hover:bg-slate-50/60 ' + (p.isActive ? '' : 'opacity-50')}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      {[p.sku, p.category].filter(Boolean).join(' - ') || '-'}
                    </div>
                  </td>
                  <td className="hidden px-5 py-3 md:table-cell">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + usageTone[p.usage]}>
                      {usageLabel[p.usage]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={p.isLow ? 'font-semibold text-rose-600' : 'text-slate-800'}>
                      {Number(p.stockQty).toLocaleString('en-IN')} {p.unit}
                    </span>
                    {p.isLow && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <AlertTriangle size={11} /> Low
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-800">{p.usage === 'SALON_USE' ? '-' : inr(Number(p.salePrice))}</td>
                  <td className="hidden px-5 py-3 text-slate-600 lg:table-cell">{inr(Number(p.costPrice))}</td>
                  <td className={'hidden px-5 py-3 lg:table-cell ' + ex.cls}>{ex.text}</td>
                  <td className="px-5 py-3">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {canManage && (
                      <div className="flex justify-end gap-1 text-slate-400">
                        <button onClick={() => openStock(p)} title="Update stock" className="rounded-lg p-2 hover:bg-emerald-50 hover:text-emerald-600">
                          <ArrowLeftRight size={16} />
                        </button>
                        <button onClick={() => openEdit(p)} title="Edit" className="rounded-lg p-2 hover:bg-indigo-50 hover:text-indigo-600">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => toggle(p)} title={p.isActive ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600">
                          <Power size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal
          title={editing ? 'Edit product' : 'Add new product'}
          subtitle="Fields marked with * are required."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Product name" required error={errors.name}>
              <input className={inputCls} placeholder="e.g. Keratin Shampoo 250 ml" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="SKU / Barcode" hint="Optional. Must be unique.">
                <input className={inputCls} placeholder="e.g. SH-001" value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
              <Field label="Category" hint="e.g. Hair care, Skin care">
                <input className={inputCls} placeholder="Enter category" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product type" required hint="Is it sold to customers or used inside the salon?">
                <select className={inputCls} value={form.usage} onChange={(e) => setForm({ ...form, usage: e.target.value })}>
                  <option value="SALE">For sale to customers</option>
                  <option value="SALON_USE">Salon use only</option>
                  <option value="BOTH">Both (sale + salon use)</option>
                </select>
              </Field>
              <Field label="Unit" required hint="How the stock is counted.">
                <select className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  <option value="piece">Piece</option>
                  <option value="ml">Millilitre (ml)</option>
                  <option value="gram">Gram</option>
                  <option value="kit">Kit</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={'Cost price (\u20B9)'} error={errors.costPrice} hint="Purchase price per unit.">
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 250" value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
              </Field>
              <Field
                label={'Selling price (\u20B9)'}
                required={form.usage !== 'SALON_USE'}
                error={errors.salePrice}
                hint={form.usage === 'SALON_USE' ? 'Not needed for salon-use products.' : 'Price charged to the customer per unit.'}
              >
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 450" value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!editing && (
                <Field label="Opening stock" error={errors.openingStock} hint="Quantity available right now.">
                  <input className={inputCls} type="number" min="0" step={isWhole(form.unit) ? 1 : 'any'} placeholder="e.g. 20" value={form.openingStock}
                    onChange={(e) => setForm({ ...form, openingStock: e.target.value })} />
                </Field>
              )}
              <Field label="Low stock alert level" error={errors.lowStockLevel} hint="Alert when stock falls to this quantity.">
                <input className={inputCls} type="number" min="0" step={isWhole(form.unit) ? 1 : 'any'} placeholder="e.g. 5" value={form.lowStockLevel}
                  onChange={(e) => setForm({ ...form, lowStockLevel: e.target.value })} />
              </Field>
            </div>
            <Field label="Expiry date" hint="Optional.">
              <input className={inputCls} type="date" value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : editing ? 'Update product' : 'Save product'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {stockFor && (
        <Modal
          title="Update stock"
          subtitle={stockFor.name + ' - current stock: ' + Number(stockFor.stockQty) + ' ' + stockFor.unit}
          onClose={() => setStockFor(null)}
        >
          <form onSubmit={submitStock} className="space-y-4" noValidate>
            <Field label="Action" required>
              <select className={inputCls} value={stockForm.type} onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}>
                {stockActions.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </Field>
            <Field
              label={stockForm.type === 'ADJUST' ? 'Counted quantity' : 'Quantity'}
              required
              error={stockErr}
              hint={stockPreview(stockForm.type, Number(stockFor.stockQty), stockForm.qty, stockFor.unit)}
            >
              <input className={inputCls} type="number" min="0" step={isWhole(stockFor.unit) ? 1 : 'any'} placeholder="Enter quantity" value={stockForm.qty}
                onChange={(e) => setStockForm({ ...stockForm, qty: e.target.value })} />
            </Field>
            <Field label="Note" hint="Optional. e.g. supplier name or reason.">
              <input className={inputCls} placeholder="Enter note" value={stockForm.note}
                onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setStockFor(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {busy ? 'Saving...' : 'Update stock'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
