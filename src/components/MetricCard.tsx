type MetricTone = "blue" | "green" | "amber" | "red";

type MetricCardStat = {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
};

export function MetricCard({ stat }: { stat: MetricCardStat }) {
  return (
    <article className="material-card px-5 py-5 sm:py-6">
      <div
        className="mb-4 text-sm font-medium text-muted"
      >
        {stat.label}
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-material-on-surface">
        {stat.value}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted">{stat.detail}</p>
    </article>
  );
}
