const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const defaults = {
  salon: { name: 'SalonPro', tagline: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', gstin: '', logo: '' },
  invoice: {
    prefix: 'SP',
    footer: 'Thank you! Visit again.',
    terms: '',
    showGstin: true,
    defaultGst: false,
    defaultGstRate: 18,
    defaultPaper: '80',
    upiId: '',
    bankDetails: '',
  },
  hours: {
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '10:00', to: '20:00' })),
  },
  holidays: { list: [] as { date: string; reason: string }[] },
  whatsapp: { enabled: false, phoneNumberId: '', businessAccountId: '', accessToken: '', graphVersion: 'v21.0' },
};
export async function getSettings(db: any) {
  const rows = await db.setting.findMany();
  const m: any = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    salon: { ...defaults.salon, ...(m.salon || {}) },
    invoice: { ...defaults.invoice, ...(m.invoice || {}) },
    hours: { days: (m.hours && m.hours.days) || defaults.hours.days },
    holidays: { list: (m.holidays && m.holidays.list) || [] },
    whatsapp: { ...defaults.whatsapp, ...(m.whatsapp || {}) },
  };
}
const pad = (n: number) => String(n).padStart(2, '0');
export async function checkOpen(db: any, start: Date, end: Date): Promise<string | null> {
  const cfg = await getSettings(db);
  const ds = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate());
  const hol = cfg.holidays.list.find((h: any) => h.date === ds);
  if (hol) return 'The salon is closed on ' + ds + (hol.reason ? ' (' + hol.reason + ')' : '');
  const day = cfg.hours.days.find((d: any) => d.day === start.getDay());
  if (!day || !day.open) return 'The salon is closed on ' + dayNames[start.getDay()] + 's';
  const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const [fh, fm] = day.from.split(':').map(Number);
  const [th, tm] = day.to.split(':').map(Number);
  const openAt = fh * 60 + fm;
  const closeAt = th * 60 + tm;
  if (mins(start) < openAt) return 'The salon opens at ' + day.from + ' on ' + dayNames[start.getDay()] + 's';
  const sameDay = end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth() && end.getDate() === start.getDate();
  if (!sameDay || mins(end) > closeAt) return 'This appointment ends after the closing time (' + day.to + ')';
  return null;
}
