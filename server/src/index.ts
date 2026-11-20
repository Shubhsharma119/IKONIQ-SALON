import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './modules/auth/auth.routes';
import customerRoutes from './modules/customers/customers.routes';
import serviceRoutes from './modules/services/services.routes';
import staffRoutes from './modules/staff/staff.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import appointmentRoutes from './modules/appointments/appointments.routes';
import productRoutes from './modules/products/products.routes';
import packageRoutes from './modules/packages/packages.routes';
import membershipRoutes from './modules/memberships/memberships.routes';
import invoiceRoutes from './modules/invoices/invoices.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import historyRoutes from './modules/history/history.routes';
import expenseRoutes from './modules/expenses/expenses.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import purchaseRoutes from './modules/suppliers/purchases.routes';
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'SalonPro' }));
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`SalonPro API running on ${port}`));













