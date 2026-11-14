import { normalizeProjectBranch, type EmployeeBranch, type ProjectBranch } from './projectBranch';
import { canAccessProjectBranch, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';

export type OutdoorRotationStartBranch = 'Karkh' | 'Rasafa';
type RotationActor = { role: string; branch?: string | null; outdoorRotationStartBranch?: OutdoorRotationStartBranch | null };

// Keep the legacy rotation field for old device payloads; office access is fixed.
export function outdoorSalesBranch(actor: RotationActor, date: Date = new Date()): EmployeeBranch | null {
 if (actor.role !== 'Outdoor Sales' || !Number.isFinite(date.getTime())) return null;
 return actor.branch === 'Karkh' || actor.branch === 'Rasafa' || actor.branch === 'Najaf' ? actor.branch : null;
}

export function outdoorProjectBranches(actor: RotationActor, date: Date = new Date()): ProjectBranch[] {
 void date;
 return (projectBranchesForActor(actor) ?? ['Karkh', 'Rasafa', 'Najaf', 'Governorates']) as ProjectBranch[];
}

export function normalizeOutdoorProjectBranch(actor: RotationActor, value: unknown, date: Date = new Date()): ProjectBranch {
 const branch = normalizeProjectBranch(value);
 void date;
 if (!canAccessProjectBranch(actor, branch)) throw new Error('Choose a project from your branch.');
 return branch;
}
