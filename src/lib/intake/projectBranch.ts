export const employeeBranches = ['Karkh', 'Rasafa', 'Najaf'] as const;
export type EmployeeBranch = typeof employeeBranches[number];
export const projectBranches = [...employeeBranches, 'Governorates'] as const;
export type ProjectBranch = typeof projectBranches[number];
export const projectBranchLabels:Record<ProjectBranch,string> = {Karkh:'From Karkh',Rasafa:'From Rasafa',Najaf:'From Najaf',Governorates:'Governorates'};
export const projectGovernorates = ['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','الديوانية','الكوت','العمارة','الناصرية','السماوة'] as const;
// Existing projects can retain the retired province without offering it again.
export type ProjectGovernorate = typeof projectGovernorates[number] | 'النجف';

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

export function normalizeProjectGovernorate(branch:unknown,value:unknown):ProjectGovernorate|null {
 if(branch!=='Governorates')return null;
 const governorate=projectGovernorates.find(governorate=>governorate===value);
 if(!governorate)throw new Error('Choose the project governorate.');
 return governorate;
}
