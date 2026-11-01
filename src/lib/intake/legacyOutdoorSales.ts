export function canAssignLegacyOutdoorSales(role?: string | null): boolean {
  return role === 'Indoor Sales' || role === 'Sales Manager' || role === 'Admin';
}

export function normalizeLegacyOutdoorSalesId(value: unknown, role?: string | null): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  if (!canAssignLegacyOutdoorSales(role)) {
    throw new Error('Only Indoor Sales, Sales Managers, and Admin can assign ownership for a pre-system project.');
  }
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    throw new Error('Choose the Outdoor Sales employee who originally brought this project.');
  }
  return value.trim().toLowerCase();
}
