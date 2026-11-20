import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Services from './pages/Services';
import Staff from './pages/Staff';
import Appointments from './pages/Appointments';
import Inventory from './pages/Inventory';
import Packages from './pages/Packages';
import Memberships from './pages/Memberships';
import MembershipsPage from './pages/MembershipsPage';
import WalletPage from './pages/Wallet';
import Expenses from './pages/Expenses';
import Suppliers from './pages/Suppliers';
import CustomerProfile from './pages/CustomerProfile';
import Billing from './pages/Billing';
function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerProfile />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/services" element={<Services />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/memberships" element={<MembershipsPage />} />
        <Route path="/billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}













