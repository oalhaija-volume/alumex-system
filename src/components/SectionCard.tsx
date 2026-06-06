export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
