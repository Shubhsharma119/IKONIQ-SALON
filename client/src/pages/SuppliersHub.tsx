import { useState } from 'react';
import Suppliers from './Suppliers';
import PurchaseOrders from './PurchaseOrders';
export default function SuppliersHub() {
  const [tab, setTab] = useState<'suppliers' | 'orders'>('suppliers');
  const chip = (on: boolean) =>
    'rounded-full border px-4 py-2 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button onClick={() => setTab('suppliers')} className={chip(tab === 'suppliers')}>Suppliers and purchases</button>
        <button onClick={() => setTab('orders')} className={chip(tab === 'orders')}>Purchase orders</button>
      </div>
      {tab === 'suppliers' ? <Suppliers /> : <PurchaseOrders />}
    </div>
  );
}
