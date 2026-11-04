export type OutdoorTeamActor = { id: string; role: string; outdoorTeamMemberIds?: readonly string[] };
type Assignment = { assigned_outdoor_sales_id?: string | null };

export function outdoorAssignmentIds(actor: OutdoorTeamActor) {
  return [...new Set([actor.id, ...(actor.role === 'Outdoor Sales' ? actor.outdoorTeamMemberIds ?? [] : [])])];
}

export function isOutdoorAssignmentMember(project: Assignment, actor: OutdoorTeamActor) {
  return actor.role === 'Outdoor Sales' && !!project.assigned_outdoor_sales_id
    && outdoorAssignmentIds(actor).includes(project.assigned_outdoor_sales_id);
}

export function canAccessOutdoorProject(project: Assignment & { created_by: string | null }, actor: OutdoorTeamActor) {
  return actor.role === 'Outdoor Sales' && (project.created_by === actor.id || isOutdoorAssignmentMember(project, actor));
}

// Only server-resolved IDs may be passed when this is used in a database query.
export function outdoorProjectFilter(actor: OutdoorTeamActor, includeLegacy = false) {
  return [`created_by.eq.${actor.id}`, ...outdoorAssignmentIds(actor).map(id => `assigned_outdoor_sales_id.eq.${id}`),
    ...(includeLegacy ? [`legacy_outdoor_sales_id.eq.${actor.id}`] : [])].join(',');
}
