import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";

export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppDataProviders>
      <AppShell>{children}</AppShell>
    </AppDataProviders>
  );
}
