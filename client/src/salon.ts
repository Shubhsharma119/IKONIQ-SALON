// Live salon settings. Filled from the server after login (see Layout) and after saving in Settings.
export const SALON = {
  name: 'SalonPro',
  tagline: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  gstin: '',
  logo: '',
  invoicePrefix: 'SP',
  footer: 'Thank you! Visit again.',
  terms: '',
  showGstin: true,
  defaultGst: false,
  defaultGstRate: 18,
  defaultPaper: '80',
  upiId: '',
  bankDetails: '',
};
export function applySettings(s: any) {
  if (!s) return;
  if (s.salon) Object.assign(SALON, s.salon);
  if (s.invoice) {
    const i = s.invoice;
    Object.assign(SALON, {
      invoicePrefix: i.prefix,
      footer: i.footer,
      terms: i.terms,
      showGstin: i.showGstin,
      defaultGst: i.defaultGst,
      defaultGstRate: i.defaultGstRate,
      defaultPaper: i.defaultPaper,
      upiId: i.upiId,
      bankDetails: i.bankDetails,
    });
  }
}
