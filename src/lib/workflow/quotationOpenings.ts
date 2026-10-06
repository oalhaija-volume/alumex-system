import { normalizeRegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { MeasuredOpening } from './pricing';

// New openings stay in the quotation draft until a single database transaction
// saves both the measurements and the freshly priced quotation.
export function quotationOpenings(existing:MeasuredOpening[], input:unknown):MeasuredOpening[] {
 if(!Array.isArray(input)||input.length>100)throw new Error('Add up to 100 openings per revision.');
 const ids=new Set(existing.map(o=>o.id));
 const additions=input.map(value=>{
  const o=normalizeRegistrationOpening(value);
  if(!o)throw new Error('Complete the floor, room, dimensions and types for each new opening.');
  if(ids.has(o.id))throw new Error('Each opening must be registered separately. Reload and try again.');
  ids.add(o.id);
  return {id:o.id,floor:o.floor,room:o.room==='Other'?o.otherRoom:o.room,width:o.width,height:o.height,opening_type:o.structuralType,opening_direction:o.openingType};
 });
 return [...existing,...additions];
}
