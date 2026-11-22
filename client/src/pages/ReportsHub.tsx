import { useState } from 'react';
import { useAuth } from '../auth';
import MasterReport from './MasterReport';
import Detailed from './Reports';
export default function ReportsHub() {
  const { user } = useAuth();
  const canMaster = ['OWNER', 'ADMIN', 'MANAGER'].includes(user ? user.role : '');
  const [tab, setTab] = useState<'master' | 'detailed'>(canMaster ? 'master' : 'detailed');
  const chip = (on: boolean) =>
    'rounded-full border px-4 py-2 text-sm font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <div className="space-y-6">
      {canMaster && (
        <div className="sp-noprint flex gap-2">
          <button onClick={() => setTab('master')} className={chip(tab === 'master')}>Master report</button>
          <button onClick={() => setTab('detailed')} className={chip(tab === 'detailed')}>Detailed reports</button>
        </div>
      )}
      {tab === 'master' && canMaster ? <MasterReport /> : <Detailed />}
    </div>
  );
}
