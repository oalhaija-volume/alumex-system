"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import type { CurtainWallGlassType } from '@/lib/workflow/pricing';
import { field } from './ui';

export function CurtainWallGlassTypeField({value,onChange}:{value?:CurtainWallGlassType;onChange:(value:CurtainWallGlassType|undefined)=>void}) {
 const {term}=useI18n();
 return <label className="block text-sm">{term('Curtain Wall glass type')}
  <select aria-label={term('Curtain Wall glass type')} className={`${field} block sm:max-w-xs`} value={value??''} onChange={event=>{
   const selected=event.target.value;
   onChange(selected==='single'||selected==='double'?selected:undefined);
  }}>
   <option value="">{term('Not specified')}</option>
   <option value="single">{term('Single Glass')}</option>
   <option value="double">{term('Double Glass')}</option>
  </select>
 </label>;
}
