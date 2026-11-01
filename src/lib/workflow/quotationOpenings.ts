import { normalizeRegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { MeasuredOpening } from './pricing';

// New openings stay in the quotation draft until a single database transaction
// saves both the measurements and the freshly priced quotation.
export function quotationOpenings(existing:MeasuredOpening[], input:unknown):MeasuredOpening[] {
 if(!Array.isArray(input)||input.length>100)throw new Error('Add up to 100 openings per revision.');
 const ids=new Set(existing.map(o=>o.id));
 const facadeNumbers=new Set(existing.filter(o=>o.opening_type==='Facade').map(o=>o.facade_number));
 const additions=input.map(value=>{
  const o=normalizeRegistrationOpening(value);
  if(!o)throw new Error('Complete the floor, room, dimensions and types for each new opening.');
  if(ids.has(o.id))throw new Error('Each opening must be registered separately. Reload and try again.');
  ids.add(o.id);
  if(o.structuralType==='Facade'){
   if(Number(o.width.toFixed(3))!==o.width||Number(o.height.toFixed(3))!==o.height)throw new Error('Enter a facade number and valid width and length.');
   if(facadeNumbers.has(o.facadeNumber))throw new Error('This facade number is already saved. Edit it or choose another number.');
   facadeNumbers.add(o.facadeNumber);
  }
  return {...(o.workArea?{work_area:o.workArea,...(o.workArea==='facade'?{facade_number:o.facadeNumber}:{})}:{}),has_roller_shutter:o.hasRollerShutter??false,has_arch:o.hasArch??false,id:o.id,floor:o.floor,room:o.room==='Other'?o.otherRoom:o.room,width:o.width,height:o.height,quantity:o.quantity??1,opening_type:o.structuralType,opening_direction:o.openingType};
 });
 return [...existing,...additions];
}
