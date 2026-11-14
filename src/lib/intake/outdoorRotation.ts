import { normalizeProjectBranch, type EmployeeBranch, type ProjectBranch } from './projectBranch';
import { canAccessProjectBranch, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';

export type OutdoorRotationStartBranch = 'Karkh' | 'Rasafa';
type RotationActor = { role: string; branch?: string | null; outdoorRotationStartBranch?: OutdoorRotationStartBranch | null };
const baghdadDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', day: 'numeric' });

// Both Baghdad outdoor salespeople share this calendar. The legacy start
// field remains compatible with old devices but cannot reverse the schedule.
export function outdoorSalesBranch(actor: RotationActor, date: Date = new Date()): EmployeeBranch | null {
 if (actor.role !== 'Outdoor Sales' || !Number.isFinite(date.getTime())) return null;
 if (actor.branch === 'Najaf') return 'Najaf';
 if (actor.branch !== 'Karkh' && actor.branch !== 'Rasafa') return null;
 return Number(baghdadDay.format(date)) <= 15 ? 'Karkh' : 'Rasafa';
}

export function outdoorProjectBranches(actor: RotationActor, date: Date = new Date()): ProjectBranch[] {
 if (actor.role === 'Outdoor Sales') {
  const branch = outdoorSalesBranch(actor, date);
  return branch === null ? [] : branch === 'Najaf' ? ['Najaf'] : [branch, 'Governorates'];
 }
 return (projectBranchesForActor(actor) ?? ['Karkh', 'Rasafa', 'Najaf', 'Governorates']) as ProjectBranch[];
}

export function normalizeOutdoorProjectBranch(actor: RotationActor, value: unknown, date: Date = new Date()): ProjectBranch {
 const branch = normalizeProjectBranch(value);
 if (actor.role === 'Outdoor Sales' ? !outdoorProjectBranches(actor, date).includes(branch) : !canAccessProjectBranch(actor, branch)) {
  if (actor.role === 'Outdoor Sales' && (actor.branch === 'Karkh' || actor.branch === 'Rasafa') && (branch === 'Karkh' || branch === 'Rasafa')) {
   throw new Error('You can only create projects for your assigned branch or Governorates during this half of the month.');
  }
  throw new Error('Choose a project from your branch.');
 }
 return branch;
}
