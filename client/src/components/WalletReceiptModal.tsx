import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Modal from './Modal';
import { SALON } from '../salon';
import type { Paper } from '../printing';
import { buildWalletReceipt, printWalletReceipt, type WalletReceipt } from '../walletReceipt';
type Tx = {
  id: number;
  type: string;
  amount: number | string;
  paidAmount?: number | string | null;
  bonusAmount?: number | string | null;
  balanceAfter: number | string;
  mode: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
};
export function makeReceipt(tx: Tx, all: Tx[], customer: { name: string; phone: string }): WalletReceipt {
  const t0 = new Date(tx.createdAt).getTime();
  const bonusTx = all.find((x) => x.type === 'BONUS' && x.id === tx.id + 1 && Math.abs(new Date(x.createdAt).getTime() - t0) < 10000);
  const isNewFormat = tx.paidAmount != null;
  const paid = isNewFormat ? Number(tx.paidAmount) : Number(tx.amount);
  const bonus = tx.bonusAmount != null ? Number(tx.bonusAmount) : bonusTx ? Number(bonusTx.amount) : 0;
  const credit = isNewFormat ? Number(tx.amount) : Number(tx.amount) + bonus;
  const balanceAfter = isNewFormat ? Number(tx.balanceAfter) : bonusTx ? Number(bonusTx.balanceAfter) : Number(tx.balanceAfter);
  return {
    receiptNo: 'WR-' + String(tx.id).padStart(5, '0'),
    date: tx.createdAt,
    customerName: customer.name,
    phone: customer.phone,
    paid,
    bonus,
    credit,
    mode: tx.mode,
    reference: tx.reference,
    note: tx.note,
    balanceBefore: balanceAfter - credit,
    balanceAfter,
  };
}export default function WalletReceiptModal(props: {
  tx: Tx;
  all: Tx[];
  customer: { name: string; phone: string };
  onClose: () => void;
}) {
  let saved: Paper = SALON.defaultPaper === '58' || SALON.defaultPaper === 'A4' ? (SALON.defaultPaper as Paper) : '80';
  try {
    const s = localStorage.getItem('printPaper');
    if (s === '80' || s === '58' || s === 'A4') saved = s;
  } catch {
    saved = '80';
  }
  const [paper, setPaper] = useState<Paper>(saved);
  const receipt = useMemo(() => makeReceipt(props.tx, props.all, props.customer), [props.tx, props.all, props.customer]);
  const html = useMemo(() => buildWalletReceipt(receipt, paper, true), [receipt, paper]);
  function choose(p: Paper) {
    setPaper(p);
    try {
      localStorage.setItem('printPaper', p);
    } catch {
      /* ignore */
    }
  }
  const chip = (on: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium ' +
    (on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50');
  return (
    <Modal title="E-Wallet top-up receipt" subtitle={receipt.receiptNo + ' - ' + props.customer.name} onClose={props.onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paper</span>
          {(['80', '58', 'A4'] as Paper[]).map((p) => (
            <button key={p} onClick={() => choose(p)} className={chip(paper === p)}>{p === 'A4' ? 'A4' : p + ' mm'}</button>
          ))}
        </div>
        <iframe title="Receipt preview" srcDoc={html} className="h-[24rem] w-full rounded-lg border border-slate-200 bg-slate-100" />
        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
          <button onClick={() => printWalletReceipt(receipt, paper)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Printer size={16} /> Print receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
