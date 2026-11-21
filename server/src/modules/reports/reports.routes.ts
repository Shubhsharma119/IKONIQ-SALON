import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { getSettings } from '../settings/settings.service';
import { catalog, runReport, ReportError, type ReportData, type ColType } from './reports.service';
const router = Router();
router.use(authenticate, authorize('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'));
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function fail(res: any, e: any) {
  if (e instanceof ReportError) return res.status(e.code).json({ message: e.message });
  throw e;
}
function numFmt(t: ColType) {
  if (t === 'money') return '#,##0.00;[Red]-#,##0.00';
  if (t === 'int') return '#,##0';
  if (t === 'qty') return '#,##0.###';
  if (t === 'percent') return '0.0"%"';
  if (t === 'date') return 'dd-mmm-yyyy';
  if (t === 'datetime') return 'dd-mmm-yyyy hh:mm';
  return undefined;
}
function cellValue(v: any, t: ColType) {
  if (v === null || v === undefined || v === '') return null;
  if (t === 'date' || t === 'datetime') return new Date(v);
  if (t === 'money' || t === 'int' || t === 'qty' || t === 'percent') return Number(v);
  return String(v);
}
async function toXlsx(d: ReportData, salonName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = salonName;
  const ws = wb.addWorksheet(d.title.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31));
  const widths: number[] = d.columns.map((c) => c.label.length + 2);
  ws.addRow([salonName]).font = { bold: true, size: 14 };
  ws.addRow([d.title]).font = { bold: true, size: 12 };
  ws.addRow([d.subtitle]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  for (const s of d.summary) {
    const row = ws.addRow([s.label, s.type === 'text' ? s.value : Number(s.value)]);
    row.getCell(1).font = { bold: true };
    const f = numFmt(s.type as ColType);
    if (f) row.getCell(2).numFmt = f;
    row.getCell(2).alignment = { horizontal: 'left' };
    widths[0] = Math.max(widths[0], s.label.length + 2);
  }
  if (d.summary.length) ws.addRow([]);
  const header = ws.addRow(d.columns.map((c) => c.label));
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  const headerNo = header.number;
  const put = (rowData: any, bold: boolean) => {
    const row = ws.addRow(d.columns.map((c) => cellValue(rowData[c.key], c.type)));
    d.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const f = numFmt(c.type);
      if (f) cell.numFmt = f;
      if (c.type === 'text') cell.alignment = { vertical: 'top', wrapText: true };
      if (bold) cell.font = { bold: true };
      const raw = rowData[c.key];
      const len = raw === null || raw === undefined ? 0 : c.type === 'date' ? 12 : c.type === 'datetime' ? 20 : String(raw).length + (c.type === 'money' ? 3 : 0);
      widths[i] = Math.max(widths[i], len + 2);
    });
    return row;
  };
  for (const r of d.rows) put(r, !!r._bold);
  if (d.totals) {
    const row = put(d.totals, true);
    row.eachCell((c) => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });
  }
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(w, 12), 46);
  });
  ws.views = [{ state: 'frozen', ySplit: headerNo }];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
function csvCell(v: any, t: ColType) {
  if (v === null || v === undefined) return '';
  let s: string;
  if (t === 'date') s = ymd(new Date(v));
  else if (t === 'datetime') {
    const x = new Date(v);
    s = ymd(x) + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes());
  } else s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(d: ReportData) {
  const lines = [d.columns.map((c) => csvCell(c.label, 'text')).join(',')];
  for (const r of d.rows) lines.push(d.columns.map((c) => csvCell(r[c.key], c.type)).join(','));
  if (d.totals) lines.push(d.columns.map((c) => csvCell(d.totals![c.key], c.type)).join(','));
  return '\uFEFF' + lines.join('\r\n');
}
router.get('/', (_req, res) => {
  res.json(catalog);
});
router.get('/:id', async (req, res) => {
  try {
    res.json(await runReport(req.params.id, req.query));
  } catch (e) {
    return fail(res, e);
  }
});
router.get('/:id/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx');
    if (format !== 'xlsx' && format !== 'csv') return res.status(400).json({ message: 'Format must be xlsx or csv' });
    const data = await runReport(req.params.id, req.query);
    const name = req.params.id + '_' + ymd(new Date()) + '.' + format;
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.send(toCsv(data));
    }
    const cfg = await getSettings(prisma);
    const buf = await toXlsx(data, cfg.salon.name || 'SalonPro');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (e) {
    return fail(res, e);
  }
});
export default router;
