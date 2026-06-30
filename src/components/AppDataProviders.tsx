"use client";

import { ClientsProvider } from "@/components/clients/ClientsProvider";
import { ProjectsProvider } from "@/components/projects/ProjectsProvider";

export function AppDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClientsProvider>
      <ProjectsProvider>{children}</ProjectsProvider>
    </ClientsProvider>
  );
}
