export type ProjectRegistration = {
  created_at?: string | null;
  created_by?: string | null;
  registeredBy?: string | null;
};

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Baghdad', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit',
});

export function projectCreationMonth(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = monthFormatter.formatToParts(date);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
}

export function projectRegistrationOptions(projects: readonly ProjectRegistration[]) {
  const months = new Set<string>();
  const creators = new Map<string, string>();
  for (const project of projects) {
    const month = projectCreationMonth(project.created_at);
    if (month) months.add(month);
    if (project.created_by) creators.set(project.created_by, project.registeredBy || 'Employee');
  }
  return {
    months: [...months].sort().reverse(),
    creators: [...creators].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  };
}

export function matchesProjectRegistration(project: ProjectRegistration, month: string, creator: string) {
  return (!month || projectCreationMonth(project.created_at) === month) && (!creator || project.created_by === creator);
}
