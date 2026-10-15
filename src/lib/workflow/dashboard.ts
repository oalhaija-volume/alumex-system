import type { ProjectProgress } from './stages';

export type DashboardProject = ProjectProgress & {
  id: string;
  project_name: string;
  project_number: string;
  updated_at: string;
};
export type EmployeeDashboardData = { projects: DashboardProject[] };
