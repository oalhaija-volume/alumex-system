import { normalizeProjectBranch, type ProjectBranch } from './projectBranch';
import { canAccessProjectBranch, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { outdoorSalesBranch, type OutdoorRotationActor as RotationActor } from './outdoorRotationSchedule';

export { outdoorSalesBranch } from './outdoorRotationSchedule';
export type { OutdoorRotationStartBranch } from './outdoorRotationSchedule';

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
