type PageHeaderProps = {
  title: string;
  eyebrow: string;
  description: string;
  action?: string;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="swift-page-header flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {description}
        </p>
      </div>
      {action ? (
        <button className="material-button-filled">
          {action}
        </button>
      ) : null}
    </header>
  );
}
