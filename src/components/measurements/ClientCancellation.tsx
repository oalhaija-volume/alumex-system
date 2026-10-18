"use client";
import { useI18n } from '@/components/i18n/I18nProvider';

export function ClientCancellation({busy,onSubmit}:{busy:boolean;onSubmit:(form:HTMLFormElement)=>void}) {
  const {term}=useI18n();
  return <details className="mt-4 rounded-lg border border-red-200 bg-white p-4">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-red-800">{term('Client cancelled project')}</summary>
    <form aria-label={term('Client cancellation')} onSubmit={event=>{event.preventDefault();onSubmit(event.currentTarget);}} className="mt-3">
      <fieldset disabled={busy}>
        <label className="block text-sm font-medium">{term('Cancellation reason')}<textarea name="note" required maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3 text-base"/></label>
        <p className="mt-2 text-xs leading-5 text-slate-600">{term('Confirm the client has cancelled. Active work will stop; the project and its history will be kept.')}</p>
        <button className="mt-4 min-h-12 rounded-md bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{term('Confirm client cancellation')}</button>
      </fieldset>
    </form>
  </details>;
}
