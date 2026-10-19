'use client';
import { useMemo, useState } from 'react';
import { matchesProjectRegistration, projectRegistrationOptions, type ProjectRegistration } from '@/lib/dashboard/projectRegistrationFilters';

export function useProjectRegistrationFilters<T extends ProjectRegistration>(projects: readonly T[]) {
  const [month, setMonth] = useState('');
  const [creator, setCreator] = useState('');
  const options = useMemo(() => projectRegistrationOptions(projects), [projects]);
  const filteredProjects = useMemo(() => projects.filter(project => matchesProjectRegistration(project, month, creator)), [projects, month, creator]);
  return { ...options, month, setMonth, creator, setCreator, filteredProjects, reset: () => { setMonth(''); setCreator(''); } };
}
