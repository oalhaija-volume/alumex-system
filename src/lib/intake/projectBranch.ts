export const projectBranches = ['Karkh', 'Rasafa'] as const;
export type ProjectBranch = typeof projectBranches[number];

export function normalizeProjectBranch(value: unknown): ProjectBranch {
 if (value !== 'Karkh' && value !== 'Rasafa') {
  throw new Error('Choose the project branch: Karkh or Rasafa.');
 }
 return value;
}
