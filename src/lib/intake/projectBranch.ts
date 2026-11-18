export const employeeBranches = ['Karkh', 'Rasafa', 'Najaf'] as const;
export type EmployeeBranch = typeof employeeBranches[number];
export const projectBranches = [...employeeBranches, 'Governorates'] as const;
export type ProjectBranch = typeof projectBranches[number];
export const projectBranchLabels:Record<ProjectBranch,string> = {Karkh:'From Karkh',Rasafa:'From Rasafa',Najaf:'From Najaf',Governorates:'Governorates'};
export const projectGovernorates = ['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','الديوانية','الكوت','العمارة','الناصرية','السماوة'] as const;
// Najaf remains available for historical projects and Karkh Indoor registration.
export type ProjectGovernorate = typeof projectGovernorates[number] | 'النجف';
type ProjectGovernorateActor = { role: string; branch?: string | null };
const karkhIndoorProjectGovernorates = [...projectGovernorates.slice(0,6),'النجف',...projectGovernorates.slice(6)] as const;

export function projectGovernoratesForActor(actor?:ProjectGovernorateActor):readonly ProjectGovernorate[] {
 return actor?.role==='Indoor Sales'&&actor.branch==='Karkh' ? karkhIndoorProjectGovernorates : projectGovernorates;
}

export function normalizeProjectBranch(value: unknown): ProjectBranch {
 if (!projectBranches.some(branch => branch === value)) {
  throw new Error('Choose the project branch: Karkh, Rasafa, Najaf or Governorates.');
 }
 return value as ProjectBranch;
}

export function normalizeEmployeeBranch(value: unknown): EmployeeBranch {
 if (!employeeBranches.some(branch => branch === value)) throw new Error('Choose Karkh, Rasafa or Najaf.');
 return value as EmployeeBranch;
}

export function normalizeProjectGovernorate(branch:unknown,value:unknown,actor?:ProjectGovernorateActor):ProjectGovernorate|null {
 if(branch!=='Governorates')return null;
 const governorate=projectGovernoratesForActor(actor).find(governorate=>governorate===value);
 if(!governorate)throw new Error('Choose the project governorate.');
 return governorate;
}
