import type { ProjectProgress } from './stages';

export type DashboardProject = ProjectProgress & {
  id: string;
  project_name: string;
  project_number: string;
  updated_at: string;
  created_at: string;
  created_by: string | null;
  registeredBy: string;
};
export type EmployeeDashboardData = { projects: DashboardProject[] };
