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
    <header className="swift-page-header flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {description}
        </p>
      </div>
      {action ? (
        <button className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover">
          {action}
        </button>
      ) : null}
    </header>
  );
}
