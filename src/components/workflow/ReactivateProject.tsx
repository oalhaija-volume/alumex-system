'use client';
import { useI18n } from '@/components/i18n/I18nProvider';

export function ReactivateProject({ busy, onSubmit }: { busy: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  const { term } = useI18n();
  return <details className="mt-3 rounded-lg border border-blue-200 bg-white p-4">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-blue-700">{term('Reactivate project')}</summary>
    <form aria-label={term('Reactivate project')} className="mt-3" onSubmit={event => { event.preventDefault(); onSubmit(event.currentTarget); }}>
      <fieldset disabled={busy}>
        <p className="text-sm leading-6 text-slate-600">{term('Confirm the client wants to continue. The project will return to its previous stage, with its measurements and history kept.')}</p>
        <label className="mt-3 block text-sm font-medium">{term('Reactivation note')}<textarea name="note" required maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3 text-base" /></label>
        <button className="mt-4 min-h-12 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{term(busy ? 'Please wait…' : 'Confirm reactivation')}</button>
      </fieldset>
    </form>
  </details>;
}
