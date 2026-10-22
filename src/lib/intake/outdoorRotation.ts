import { normalizeProjectBranch, projectBranches, type ProjectBranch } from './projectBranch';

export type OutdoorRotationStartBranch = 'Karkh' | 'Rasafa';
type RotationActor = { role: string; outdoorRotationStartBranch?: OutdoorRotationStartBranch | null };

const baghdadDay = new Intl.DateTimeFormat('en-GB', {
 timeZone: 'Asia/Baghdad', calendar: 'gregory', numberingSystem: 'latn', day: 'numeric',
});

// Store the first-half assignment once; derive each month's active branch in Baghdad.
export function outdoorSalesBranch(actor: RotationActor, date: Date = new Date()): OutdoorRotationStartBranch | null {
 const start = actor.outdoorRotationStartBranch;
 if (actor.role !== 'Outdoor Sales' || (start !== 'Karkh' && start !== 'Rasafa') || !Number.isFinite(date.getTime())) return null;
 return Number(baghdadDay.format(date)) <= 15 ? start : start === 'Karkh' ? 'Rasafa' : 'Karkh';
}

export function outdoorProjectBranches(actor: RotationActor, date: Date = new Date()): ProjectBranch[] {
 if (actor.role !== 'Outdoor Sales') return [...projectBranches];
 const branch = outdoorSalesBranch(actor, date);
 return branch ? [branch, 'Governorates'] : ['Governorates'];
}

export function normalizeOutdoorProjectBranch(actor: RotationActor, value: unknown, date: Date = new Date()): ProjectBranch {
 const branch = normalizeProjectBranch(value);
 if (actor.role !== 'Outdoor Sales' || branch === 'Governorates') return branch;
 const assigned = outdoorSalesBranch(actor, date);
 if (!assigned) throw new Error('Ask Admin to assign your monthly Outdoor Sales rotation before creating a Karkh or Rasafa project.');
 if (branch !== assigned) throw new Error('You can only create projects for your assigned branch or Governorates during this half of the month.');
 return branch;
}
