import { outdoorSalesBranch, type OutdoorRotationStartBranch } from '@/lib/intake/outdoorRotation';

type CoverageProfile = {
 id: string;
 full_name: string | null;
 username: string | null;
 outdoor_rotation_start_branch: OutdoorRotationStartBranch | null;
};

export type OutdoorSalesCoverageData = {
 asOf: string;
 staff: { id: string; name: string; branch: OutdoorRotationStartBranch | null }[];
};

// The timestamp and assignments share one server instant and the intake calendar.
export function outdoorSalesCoverage(profiles: CoverageProfile[], date: Date = new Date()): OutdoorSalesCoverageData {
 return {
  asOf: date.toISOString(),
  staff: profiles.map(profile => ({
   id: profile.id,
   name: profile.full_name?.trim() || profile.username?.trim() || 'Employee',
   branch: outdoorSalesBranch({ role: 'Outdoor Sales', outdoorRotationStartBranch: profile.outdoor_rotation_start_branch }, date),
  })),
 };
}
