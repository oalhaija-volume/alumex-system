type MetricTone = "blue" | "green" | "amber" | "red";

const toneStyles: Record<MetricTone, string> = {
  blue: "border-border bg-info-surface text-info-text",
  green: "border-border bg-success-surface text-success-text",
  amber: "border-border bg-warning-surface text-warning-text",
  red: "border-border bg-danger-surface text-danger-text",
};

type MetricCardStat = {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
};

export function MetricCard({ stat }: { stat: MetricCardStat }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div
        className={`mb-4 inline-flex rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${toneStyles[stat.tone]}`}
      >
        {stat.label}
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">
        {stat.value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{stat.detail}</p>
    </article>
  );
}
