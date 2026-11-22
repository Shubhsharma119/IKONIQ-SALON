import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from './Modal';
import Field, { inputCls } from './Field';
import { useToast } from './Toast';
import WalletReceiptModal from './WalletReceiptModal';
type TopUpTransaction = {
  id: number;
  type: string;
  amount: number | string;
  paidAmount: number | string;
  bonusAmount: number | string;
  balanceAfter: number | string;
  mode: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
};
export type Offer = {
  id: number;
  name: string;
  payAmount: string | number;
  creditAmount: string | number;
  isActive: boolean;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const inr = (x: number) => '\u20B9' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function WalletTopUp(props: {
  customer: { id: number; name: string; phone: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const isManager = ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOfferId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [bonus, setBonus] = useState('');
  const [mode, setMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptTx, setReceiptTx] = useState<TopUpTransaction | null>(null);
  useEffect(() => {
    api<Offer[]>('/wallet/offers')
      .then((o) => setOffers(o.filter((x) => x.isActive)))
      .catch((e) => toast.show('error', e.message));
  }, []);
  const offer = offers.find((o) => o.id === offerId) || null;
  const paid = offer ? Number(offer.payAmount) : Number(amount) || 0;
  const extra = offer ? r2(Number(offer.creditAmount) - Number(offer.payAmount)) : isManager ? Number(bonus) || 0 : 0;
  const credit = r2(paid + extra);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(paid > 0)) {
      toast.show('error', 'Enter the amount received from the customer.');
      return;
    }
    if (!offer && bonus !== '' && !(Number(bonus) >= 0)) {
      toast.show('error', 'Enter a valid extra amount.');
      return;
    }
    const common = { mode, reference: reference.trim() || undefined, note: note.trim() || undefined };
    const body = offer ? { offerId: offer.id, ...common } : { paidAmount: paid, bonusAmount: extra, ...common };
    setBusy(true);
    try {
      const result = await api<{ txn: TopUpTransaction; balance: number }>(
        '/wallet/customer/' + props.customer.id + '/topup',
        { method: 'POST', body: JSON.stringify(body) }
      );
      toast.show('success', inr(credit) + ' added to the E-Wallet successfully.');
      props.onDone();
      setReceiptTx(result.txn);
    } catch (err: any) {
      toast.show('error', err.message === 'Invalid data' ? 'Please check the details and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  if (receiptTx) {
    return (
      <WalletReceiptModal
        tx={receiptTx}
        all={[]}
        customer={props.customer}
        onClose={() => {
          setReceiptTx(null);
          props.onClose();
        }}
      />
    );
  }
  const card = (on: boolean) =>
    'rounded-xl border p-3 text-left ' +
    (on ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300');
  return (
    <Modal
      title="Add money to E-Wallet"
      subtitle={props.customer.name + ' (+91 ' + props.customer.phone + ')'}
      onClose={props.onClose}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Choose an offer</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {offers.map((o) => (
              <button type="button" key={o.id} onClick={() => setOfferId(o.id)} className={card(offerId === o.id)}>
                <div className="text-sm font-semibold text-slate-800">{o.name}</div>
                <div className="text-xs text-slate-500">
                  Pay {inr(Number(o.payAmount))} and get {inr(Number(o.creditAmount))}
                </div>
                <div className="mt-1 text-xs font-medium text-emerald-700">
                  Extra {inr(r2(Number(o.creditAmount) - Number(o.payAmount)))}
                </div>
              </button>
            ))}
            <button type="button" onClick={() => setOfferId(null)} className={card(offerId === null)}>
              <div className="text-sm font-semibold text-slate-800">Custom amount</div>
              <div className="text-xs text-slate-500">Enter the amount yourself</div>
            </button>
          </div>
        </div>
        {!offer && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={'Amount received (\u20B9)'} required hint="Money the customer pays now.">
              <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {isManager && (
              <Field label={'Extra amount (\u20B9)'} hint="Bonus added on top. Optional.">
                <input className={inputCls} type="number" min="0" step="any" placeholder="e.g. 5000" value={bonus} onChange={(e) => setBonus(e.target.value)} />
              </Field>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment mode" required>
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank transfer</option>
            </select>
          </Field>
          <Field label="Reference" hint="UPI ID, card last 4... Optional.">
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        <Field label="Note" hint="Optional.">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Customer pays</span><span>{inr(paid)}</span></div>
          <div className="flex justify-between text-emerald-700"><span>Extra added</span><span>{inr(extra)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-800">
            <span>Wallet credit</span><span>{inr(credit)}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={props.onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : 'Add to wallet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
