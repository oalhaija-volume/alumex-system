type WorkflowListProps = {
  items: Array<{
    title: string;
    meta: string;
    value: string;
  }>;
};

export function WorkflowList({ items }: WorkflowListProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.title}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {item.title}
            </p>
            <p className="mt-1 text-xs text-muted">{item.meta}</p>
          </div>
          <p className="shrink-0 text-sm font-bold text-primary">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
