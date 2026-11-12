'use client';
import { useMemo, useState } from 'react';
import {
  outdoorProjectOptions,
  projectOutdoorSalesOrigin,
  sortProjectsByRegistration,
  type OutdoorAttributedProject,
  type OutdoorSalesPerson,
} from '@/lib/dashboard/outdoorProjectFilters';

export function useOutdoorSalesProjectFilters<T extends OutdoorAttributedProject>(
  projects: readonly T[],
  directory?: readonly OutdoorSalesPerson[],
  candidates: readonly T[] = projects,
) {
  const [salesperson, setSalesperson] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const options = useMemo(() => outdoorProjectOptions(projects, directory), [projects, directory]);
  const filteredProjects = useMemo(() => sortProjectsByRegistration(
    candidates.filter(project => !salesperson || projectOutdoorSalesOrigin(project, directory)?.id === salesperson),
    order,
  ), [candidates, directory, salesperson, order]);

  return {
    options, salesperson, setSalesperson, order, setOrder, filteredProjects,
    total: projects.length,
    reset: () => { setSalesperson(''); setOrder('newest'); },
  };
}
