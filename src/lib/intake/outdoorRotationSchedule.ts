export type OutdoorRotationStartBranch = 'Karkh' | 'Rasafa';
export type OutdoorRotationActor = {
  role: string;
  branch?: string | null;
  outdoorRotationStartBranch?: OutdoorRotationStartBranch | null;
};

const baghdadDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', day: 'numeric' });

// Each Baghdad employee starts the month in their configured branch and
// switches on the 16th. Unconfigured employees keep the default Karkh start.
export function outdoorSalesBranch(
  actor: OutdoorRotationActor,
  date: Date = new Date(),
): OutdoorRotationStartBranch | 'Najaf' | null {
  if (actor.role !== 'Outdoor Sales' || !Number.isFinite(date.getTime())) return null;
  if (actor.branch === 'Najaf') return 'Najaf';
  if (actor.branch !== 'Karkh' && actor.branch !== 'Rasafa') return null;
  const start = actor.outdoorRotationStartBranch === 'Rasafa' ? 'Rasafa' : 'Karkh';
  return Number(baghdadDay.format(date)) <= 15 ? start : start === 'Karkh' ? 'Rasafa' : 'Karkh';
}
