import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
type Kind = 'success' | 'error';
type Item = { id: number; kind: Kind; message: string };
const Ctx = createContext<{ show: (kind: Kind, message: string) => void }>({ show: () => {} });
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const remove = (id: number) => setItems((l) => l.filter((i) => i.id !== id));
  const show = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, kind, message }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] space-y-2 w-[calc(100%-2rem)] max-w-sm">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              'flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ' +
              (t.kind === 'success' ? 'border-emerald-200' : 'border-rose-200')
            }
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm">
              <div className="font-semibold text-slate-800">{t.kind === 'success' ? 'Success' : 'Error'}</div>
              <div className="text-slate-600">{t.message}</div>
            </div>
            <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
