import { SALON, applySettings as applySalon } from './salon';
// Kept so older imports keep working. Salon and bill details now come from Settings through salon.ts.
export const BILL = {
  get footer() {
    return SALON.footer || 'Thank you! Visit again.';
  },
};
export function applySettings(s: any) {
  applySalon(s);
}
