type Actor = { id: string; role: string };

export function canEditOpeningEntry(opening: { createdBy?: string | null }, actor?: Actor, role?: string) {
  const employeeRole = actor?.role ?? role;
  if (employeeRole === 'Outdoor Sales') return !!actor?.id && opening.createdBy === actor.id;
  return ['Admin', 'Sales Director', 'CEO', 'Company Owner', 'Indoor Sales', 'Sales Manager'].includes(employeeRole ?? '');
}
