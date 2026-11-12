export type OutdoorSalesPerson = { id: string; name: string };

export type OutdoorAttributedProject = {
  created_at?: string | null;
  created_by?: string | null;
  registeredBy?: string | null;
  original_creator_role?: string | null;
  legacy_outdoor_sales_id?: string | null;
  legacyOutdoorSalesOwner?: string | null;
};

// Original sales credit stays with the person who brought the project, even
// when another employee registers it or receives the measurement assignment.
export function projectOutdoorSalesOrigin(
  project: OutdoorAttributedProject,
  directory: readonly OutdoorSalesPerson[] = [],
): OutdoorSalesPerson | null {
  if (project.legacy_outdoor_sales_id) {
    return {
      id: project.legacy_outdoor_sales_id,
      name: project.legacyOutdoorSalesOwner || directory.find(person => person.id === project.legacy_outdoor_sales_id)?.name || 'Employee',
    };
  }

  if (!project.created_by) return null;
  const creator = directory.find(person => person.id === project.created_by);
  if (project.original_creator_role !== 'Outdoor Sales' && (project.original_creator_role || !creator)) return null;
  return { id: project.created_by, name: project.registeredBy || creator?.name || 'Employee' };
}

export function outdoorProjectOptions(
  projects: readonly OutdoorAttributedProject[],
  directory: readonly OutdoorSalesPerson[] = [],
): (OutdoorSalesPerson & { count: number })[] {
  const people = new Map<string, OutdoorSalesPerson & { count: number }>();
  for (const project of projects) {
    const person = projectOutdoorSalesOrigin(project, directory);
    if (!person) continue;
    const existing = people.get(person.id);
    if (existing) {
      existing.count += 1;
      if (existing.name === 'Employee' && person.name !== 'Employee') existing.name = person.name;
    } else {
      people.set(person.id, { ...person, count: 1 });
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function sortProjectsByRegistration<T extends OutdoorAttributedProject>(
  projects: readonly T[],
  order: 'newest' | 'oldest',
): T[] {
  return [...projects].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : NaN;
    const right = b.created_at ? Date.parse(b.created_at) : NaN;
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return order === 'oldest' ? left - right : right - left;
  });
}
