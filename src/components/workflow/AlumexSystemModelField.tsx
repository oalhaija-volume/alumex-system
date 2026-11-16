"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import type { AlumexSystemModel } from '@/lib/workflow/alumexModels';
import { field } from './ui';

export function AlumexSystemModelField({options,value,onChange}:{options:readonly AlumexSystemModel[];value?:AlumexSystemModel;onChange:(value:AlumexSystemModel|undefined)=>void}) {
 const {term}=useI18n();
 return <label className="block text-sm">{term('Alumex model')}
  <select dir="ltr" aria-label={term('Alumex model')} className={`${field} block sm:max-w-xs`} value={value??''} onChange={event=>onChange(options.find(option=>option===event.target.value))}>
   <option value="">{term('Not specified')}</option>
   {options.map(option=><option key={option} value={option}>{option}</option>)}
  </select>
 </label>;
}
