"use client";

import {useI18n} from '@/components/i18n/I18nProvider';
import type {OutdoorSalesCoverageData} from '@/lib/dashboard/outdoorSalesCoverage';
import {useResource} from './ui';

export function OutdoorSalesCoverage(){
 const {t,term,formatDate}=useI18n();
 const {data,error,loading}=useResource<OutdoorSalesCoverageData>('/api/outdoor-sales-coverage');
 const unconfigured=data?.staff.filter(employee=>employee.branch===null)??[];

 return <section aria-labelledby="outdoor-sales-coverage-title" className="mb-6 overflow-hidden rounded-lg border border-t-2 border-slate-200 border-t-blue-600 bg-white">
  <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2 px-4 pt-4 sm:px-5">
   <h2 id="outdoor-sales-coverage-title" className="text-base font-semibold text-slate-950">{t('dashboard.outdoorCoverage.title')}</h2>
   {data&&!error&&<p className="text-xs leading-6 text-slate-500">{t('dashboard.outdoorCoverage.asOf')} <time dateTime={data.asOf} dir="ltr">{formatDate(data.asOf)}</time> · {t('dashboard.outdoorCoverage.baghdadTime')}</p>}
  </header>
  <div className="px-4 py-4 sm:px-5">
   {loading&&!data&&<p role="status" className="text-sm text-slate-500">{t('dashboard.outdoorCoverage.loading')}</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{t('dashboard.outdoorCoverage.loadError')}</p>}
   {data&&!error&&<>
    <div className="grid gap-3 sm:grid-cols-2">
     {(['Karkh','Rasafa'] as const).map(branch=>{
      const employees=data.staff.filter(employee=>employee.branch===branch);
      const headingId=`outdoor-sales-coverage-${branch.toLowerCase()}`;
      return <section key={branch} aria-labelledby={headingId} className="min-w-0 rounded-md border border-blue-100 bg-blue-50/40 px-4 py-3">
       <h3 id={headingId} className="text-sm font-semibold text-blue-900">{term(branch)}</h3>
       {employees.length?<ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm leading-6 text-slate-800">{employees.map(employee=><li key={employee.id} className="min-w-0 break-words [overflow-wrap:anywhere]"><bdi>{employee.name==='Employee'?term('Employee'):employee.name}</bdi></li>)}</ul>:<p className="mt-2 text-sm leading-6 text-slate-500">{t('dashboard.outdoorCoverage.noAssignedStaff')}</p>}
      </section>;
     })}
    </div>
    {unconfigured.length>0&&<section aria-labelledby="outdoor-sales-coverage-unconfigured" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
     <h3 id="outdoor-sales-coverage-unconfigured" className="text-sm font-semibold text-amber-900">{t('dashboard.outdoorCoverage.unconfigured')}</h3>
     <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm leading-6 text-amber-900">{unconfigured.map(employee=><li key={employee.id} className="min-w-0 break-words [overflow-wrap:anywhere]"><bdi>{employee.name==='Employee'?term('Employee'):employee.name}</bdi></li>)}</ul>
    </section>}
   </>}
  </div>
  <p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 sm:px-5">{t('dashboard.outdoorCoverage.governorates')}</p>
 </section>;
}
