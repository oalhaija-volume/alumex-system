export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="material-card p-5">
      <h2 className="text-base font-semibold text-material-on-surface">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
