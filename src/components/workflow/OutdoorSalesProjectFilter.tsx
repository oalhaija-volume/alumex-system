'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { field } from './ui';

type Props = {
  filter: {
    options: { id: string; name: string; count: number }[];
    salesperson: string;
    setSalesperson: (id: string) => void;
    order: 'newest' | 'oldest';
    setOrder: (order: 'newest' | 'oldest') => void;
    total: number;
  };
};

export function OutdoorSalesProjectFilter({ filter }: Props) {
  const { term, formatNumber } = useI18n();
  const options = [{ id: '', name: term('All salespeople'), count: filter.total }, ...filter.options];

  return <section aria-label={term('Projects by Outdoor Sales')} className="mb-5 min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-950">{term('Projects by Outdoor Sales')}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{term('Choose a name to see the projects they brought in.')}</p>
      </div>
      <label className="w-full text-sm font-medium text-slate-700 sm:w-auto">{term('Registration date order')}
        <select value={filter.order} onChange={event => filter.setOrder(event.target.value as 'newest' | 'oldest')} className={field}>
          <option value="newest">{term('Newest first')}</option>
          <option value="oldest">{term('Oldest first')}</option>
        </select>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {options.map(person => <button key={person.id} type="button" aria-label={person.name === 'Employee' ? term('Employee') : person.name} aria-pressed={filter.salesperson === person.id} onClick={() => filter.setSalesperson(person.id)}
        className={`inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-start text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${filter.salesperson === person.id ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-slate-50'}`}>
        <bdi className="min-w-0 break-words [overflow-wrap:anywhere]">{person.name === 'Employee' ? term('Employee') : person.name}</bdi>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-700">{formatNumber(person.count)}</span>
      </button>)}
    </div>
  </section>;
}
