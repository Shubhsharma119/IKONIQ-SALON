import type { ReactNode } from 'react';
export default function Field(props: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {props.label}
        {props.required && <span className="text-rose-500"> *</span>}
      </label>
      {props.children}
      {props.error ? (
        <p className="mt-1 text-xs text-rose-600">{props.error}</p>
      ) : (
        props.hint && <p className="mt-1 text-xs text-slate-400">{props.hint}</p>
      )}
    </div>
  );
}
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500';
