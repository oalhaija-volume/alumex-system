export const projectBranches = ['Karkh', 'Rasafa', 'Governorates'] as const;
export type ProjectBranch = typeof projectBranches[number];
export const projectBranchLabels:Record<ProjectBranch,string> = {Karkh:'From Karkh',Rasafa:'From Rasafa',Governorates:'Governorates'};
export const projectGovernorates = ['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','النجف','الديوانية','الكوت','العمارة','الناصرية','السماوة'] as const;
export type ProjectGovernorate = typeof projectGovernorates[number];

export function normalizeProjectBranch(value: unknown): ProjectBranch {
 if (value !== 'Karkh' && value !== 'Rasafa' && value !== 'Governorates') {
  throw new Error('Choose the project branch: Karkh, Rasafa or Governorates.');
 }
 return value;
}

export function normalizeProjectGovernorate(branch:unknown,value:unknown):ProjectGovernorate|null {
 if(branch!=='Governorates')return null;
 const governorate=projectGovernorates.find(governorate=>governorate===value);
 if(!governorate)throw new Error('Choose the project governorate.');
 return governorate;
}
