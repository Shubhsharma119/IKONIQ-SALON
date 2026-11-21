import { useEffect, useState } from 'react';
import { BarChart3, Printer, FileSpreadsheet, FileText } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import { inputCls } from '../components/Field';
import { useToast } from '../components/Toast';
import { SALON } from '../salon';
type CatItem = { id: string; group: string; title: string; desc: string; range: boolean; grouping: boolean };
type Col = { key: string; label: string; type: string };
type Summary = { label: string; value: number | string; type: string };
type ReportData = {
  id: string;
  title: string;
  subtitle: string;
  columns: Col[];
  rows: Record<string, any>[];
  totals: Record<string, any> | null;
  summary: Summary[];
  chart: { type: 'bar' | 'line'; x: string; ys: { key: string; label: string }[] } | null;
};
const RS = '\u20B9';
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];
const pad = (n: number) => String(n).padStart(2, '0');
const ds = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function fmt(type: string, v: any): string {
  if (v === null || v === undefined || v === '') return '-';
  switch (type) {
    case 'money': {
      const x = Number(v);
      return (x < 0 ? '-' : '') + RS + Math.abs(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case 'int': return Number(v).toLocaleString('en-IN');
    case 'qty': return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
    case 'percent': return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%';
    case 'date': return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'datetime':
      return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    default: return String(v);
  }
}
const isNum = (t: string) => ['money', 'int', 'qty', 'percent'].includes(t);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function preset(p: string): [string, string] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const back = (n: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (p) {
    case 'yesterday': return [ds(back(1)), ds(back(1))];
    case 'week': return [ds(back((t.getDay() + 6) % 7)), ds(t)];
    case 'last7': return [ds(back(6)), ds(t)];
    case 'last30': return [ds(back(29)), ds(t)];
    case 'month': return [ds(new Date(t.getFullYear(), t.getMonth(), 1)), ds(t)];
    case 'lastmonth': return [ds(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ds(new Date(t.getFullYear(), t.getMonth(), 0))];
    case 'fy': {
      const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
      return [ds(new Date(y, 3, 1)), ds(t)];
    }
    default: return [ds(t), ds(t)];
  }
}
const presets = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['last7', 'Last 7 days'], ['month', 'This month'],
  ['lastmonth', 'Last month'], ['last30', 'Last 30 days'], ['fy', 'This financial year'],
];
function buildPrintHtml(d: ReportData, userName: string) {
  const landscape = d.columns.length > 7;
  const locality = [SALON.city, SALON.state].filter(Boolean).join(', ') + (SALON.pincode ? ' - ' + SALON.pincode : '');
  const addr = [SALON.address, locality, SALON.phone ? 'Ph: ' + SALON.phone : '', SALON.gstin ? 'GSTIN: ' + SALON.gstin : '']
    .filter((x) => x && x.trim())
    .map(esc)
    .join(' | ');
  const css =
    '@page { size: A4 ' + (landscape ? 'landscape' : 'portrait') + '; margin: 12mm; }' +
    '* { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:11px; margin:0; }' +
    '.head { display:flex; align-items:center; gap:12px; border-bottom:2px solid #111; padding-bottom:8px; }' +
    '.head img { max-height:48px; max-width:120px; } .shop { font-size:18px; font-weight:700; } .addr { color:#444; font-size:10px; }' +
    'h1 { font-size:15px; margin:12px 0 2px; } .sub { color:#555; margin-bottom:10px; }' +
    '.sum { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }' +
    '.box { border:1px solid #bbb; border-radius:4px; padding:6px 10px; min-width:120px; } .box .l { color:#555; font-size:10px; } .box .v { font-size:13px; font-weight:700; }' +
    'table { width:100%; border-collapse:collapse; } thead { display: table-header-group; } tr { page-break-inside: avoid; }' +
    'th { background:#e5e7eb; text-align:left; padding:5px 6px; border:1px solid #999; font-size:10px; }' +
    'td { padding:4px 6px; border:1px solid #ccc; vertical-align:top; } .r { text-align:right; } .b td { font-weight:700; }' +
    '.tot td { font-weight:700; background:#f3f4f6; border-top:2px solid #111; } .foot { margin-top:12px; color:#666; font-size:10px; }';
  const head = d.columns.map((c) => '<th' + (isNum(c.type) ? ' class="r"' : '') + '>' + esc(c.label) + '</th>').join('');
  const cells = (r: Record<string, any>) =>
    d.columns.map((c) => '<td' + (isNum(c.type) ? ' class="r"' : '') + '>' + esc(fmt(c.type, r[c.key])) + '</td>').join('');
  const body = d.rows.map((r) => '<tr' + (r._bold ? ' class="b"' : '') + '>' + cells(r) + '</tr>').join('');
  const tot = d.totals ? '<tr class="tot">' + cells(d.totals) + '</tr>' : '';
  const sum = d.summary
    .map((s) => '<div class="box"><div class="l">' + esc(s.label) + '</div><div class="v">' + esc(fmt(s.type, s.value)) + '</div></div>')
    .join('');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(d.title) + '</title><style>' + css + '</style></head><body>' +
    '<div class="head">' + (SALON.logo ? '<img src="' + SALON.logo + '"/>' : '') +
    '<div><div class="shop">' + esc(SALON.name) + '</div><div class="addr">' + addr + '</div></div></div>' +
    '<h1>' + esc(d.title) + '</h1><div class="sub">' + esc(d.subtitle) + '</div>' +
    '<div class="sum">' + sum + '</div>' +
    '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + tot + '</tbody></table>' +
    '<div class="foot">Generated on ' + esc(new Date().toLocaleString('en-IN')) + ' by ' + esc(userName) + '. ' + d.rows.length + ' rows.</div>' +
    '</body></html>'
  );
}
function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 60000);
  }, 400);
}
async function download(path: string, name: string) {
  const token = localStorage.getItem('token');
  const res = await fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error((j && j.message) || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export default function Reports() {
  const toast = useToast();
  const { user } = useAuth();
  const allowed = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user?.role || '');
  const [cat, setCat] = useState<CatItem[]>([]);
  const [id, setId] = useState('sales');
  const [pre, setPre] = useState('month');
  const [from, setFrom] = useState(preset('month')[0]);
  const [to, setTo] = useState(preset('month')[1]);
  const [group, setGroup] = useState('day');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const cur = cat.find((c) => c.id === id);
  useEffect(() => {
    if (!allowed) return;
    api<CatItem[]>('/reports').then(setCat).catch((e) => toast.show('error', e.message));
  }, [allowed]);
  const qs = () => {
    const p = new URLSearchParams();
    if (!cur || cur.range) {
      p.set('from', from);
      p.set('to', to);
    }
    if (cur && cur.grouping) p.set('group', group);
    return p.toString();
  };
  useEffect(() => {
    if (!allowed || !cur) return;
    if (cur.range && from > to) return;
    let stale = false;
    setLoading(true);
    api<ReportData>('/reports/' + id + '?' + qs())
      .then((d) => {
        if (!stale) setData(d);
      })
      .catch((e) => {
        if (!stale) {
          setData(null);
          toast.show('error', e.message);
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [id, from, to, group, cat.length]);
  function choosePreset(p: string) {
    const [f, t] = preset(p);
    setPre(p);
    setFrom(f);
    setTo(t);
  }
  async function exportAs(format: 'xlsx' | 'csv') {
    setExporting(format);
    try {
      await download('/reports/' + id + '/export?format=' + format + '&' + qs(), id + '_' + ds(new Date()) + '.' + format);
      toast.show('success', (format === 'xlsx' ? 'Excel' : 'CSV') + ' file downloaded.');
    } catch (e: any) {
      toast.show('error', e.message);
    } finally {
      setExporting('');
    }
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        Reports are available to the Owner, Admin, Manager and Accountant only.
      </div>
    );
  }
  const groups = Array.from(new Set(cat.map((c) => c.group)));
  const chip = (active: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium ' +
    (active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  const actBtn = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  const chartRows = data && data.chart ? (data.chart.type === 'bar' ? data.rows.slice(0, 15) : data.rows) : [];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><BarChart3 size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Analyse sales, staff, finance, customers and stock</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
            <select className={inputCls} value={id} onChange={(e) => setId(e.target.value)}>
              {cat.map((c) => (
                <option key={c.id} value={c.id}>{c.group + ' - ' + c.title}</option>
              ))}
            </select>
          </div>
          <div className="hidden space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
            {groups.map((g) => (
              <div key={g}>
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</div>
                {cat.filter((c) => c.group === g).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setId(c.id)}
                    className={'block w-full rounded-lg px-3 py-2 text-left text-sm ' + (id === c.id ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50')}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {cur && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <div className="font-semibold text-slate-800">{cur.title}</div>
                <div className="text-sm text-slate-500">{cur.desc}</div>
              </div>
              {cur.range ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {presets.map(([k, label]) => (
                      <button key={k} onClick={() => choosePreset(k)} className={chip(pre === k)}>{label}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
                      <input type="date" className={inputCls + ' !w-auto'} value={from} onChange={(e) => { setPre('custom'); setFrom(e.target.value); }} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
                      <input type="date" className={inputCls + ' !w-auto'} value={to} onChange={(e) => { setPre('custom'); setTo(e.target.value); }} />
                    </div>
                    {cur.grouping && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Group by</label>
                        <select className={inputCls + ' !w-auto'} value={group} onChange={(e) => setGroup(e.target.value)}>
                          <option value="day">Daily</option>
                          <option value="month">Monthly</option>
                          <option value="year">Yearly</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {from > to && <div className="text-sm text-rose-600">The end date cannot be before the start date.</div>}
                </div>
              ) : (
                <div className="text-sm text-slate-500">This report always shows the position as on today.</div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button disabled={!data || loading} onClick={() => data && printHtml(buildPrintHtml(data, user?.name || ''))} className={actBtn}>
                  <Printer size={16} /> Print / Save as PDF
                </button>
                <button disabled={!data || loading || exporting !== ''} onClick={() => exportAs('xlsx')} className={actBtn}>
                  <FileSpreadsheet size={16} /> {exporting === 'xlsx' ? 'Preparing...' : 'Export Excel'}
                </button>
                <button disabled={!data || loading || exporting !== ''} onClick={() => exportAs('csv')} className={actBtn}>
                  <FileText size={16} /> {exporting === 'csv' ? 'Preparing...' : 'Export CSV'}
                </button>
              </div>
            </div>
          )}
          {loading && <div className="text-slate-400">Loading report...</div>}
          {data && !loading && (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{data.title}</h2>
                <p className="text-sm text-slate-500">{data.subtitle}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {data.summary.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className="mt-1 text-xl font-bold text-slate-800">{fmt(s.type, s.value)}</div>
                  </div>
                ))}
              </div>
              {data.chart && chartRows.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {data.chart.type === 'line' ? (
                        <LineChart data={chartRows}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey={data.chart.x} tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} tickFormatter={(v: any) => (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                          <Tooltip formatter={(v: any) => RS + Number(v).toLocaleString('en-IN')} />
                          {data.chart.ys.length > 1 && <Legend />}
                          {data.chart.ys.map((y, i) => (
                            <Line key={y.key} type="monotone" dataKey={y.key} name={y.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                          ))}
                        </LineChart>
                      ) : (
                        <BarChart data={chartRows}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey={data.chart.x} tickLine={false} axisLine={false} fontSize={11} interval={0} angle={chartRows.length > 6 ? -25 : 0} textAnchor={chartRows.length > 6 ? 'end' : 'middle'} height={chartRows.length > 6 ? 60 : 30} />
                          <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} tickFormatter={(v: any) => (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                          <Tooltip formatter={(v: any) => RS + Number(v).toLocaleString('en-IN')} />
                          {data.chart.ys.length > 1 && <Legend />}
                          {data.chart.ys.map((y, i) => (
                            <Bar key={y.key} dataKey={y.key} name={y.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                          ))}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {data.columns.map((c) => (
                        <th key={c.key} className={'whitespace-nowrap px-4 py-3 font-semibold ' + (isNum(c.type) ? 'text-right' : '')}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.length === 0 && (
                      <tr><td colSpan={data.columns.length} className="px-4 py-10 text-center text-slate-400">No data for this period.</td></tr>
                    )}
                    {data.rows.map((r, i) => (
                      <tr key={i} className={r._bold ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50/60'}>
                        {data.columns.map((c) => (
                          <td key={c.key} className={'px-4 py-2.5 text-slate-700 ' + (isNum(c.type) ? 'whitespace-nowrap text-right' : '')}>{fmt(c.type, r[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                    {data.totals && data.rows.length > 0 && (
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                        {data.columns.map((c) => (
                          <td key={c.key} className={'px-4 py-3 text-slate-800 ' + (isNum(c.type) ? 'whitespace-nowrap text-right' : '')}>{fmt(c.type, data.totals![c.key])}</td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-400">{data.rows.length} rows</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
