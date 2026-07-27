"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DashboardTask = {
  id: string;
  due_at: string;
  status: string;
  task_type: string;
  isMine: boolean;
  project: {
    project_number: string;
    project_name: string;
    priority: string;
  } | null;
  client: { client_name: string } | null;
};

function taskTypeLabel(value: string) {
  return value === "structure_readiness"
    ? "Structure readiness"
    : "Quotation";
}

export function CrmDashboardPriority() {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCurrentTime(new Date().getTime());
      void fetch("/api/crm", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as { tasks?: DashboardTask[] };
          setTasks(body.tasks ?? []);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const ownOpenTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.isMine && task.status === "open")
        .toSorted(
          (left, right) =>
            Date.parse(left.due_at) - Date.parse(right.due_at),
        ),
    [tasks],
  );
  const teamOpenCount = tasks.filter(
    (task) => !task.isMine && task.status === "open",
  ).length;
  const overdueCount = ownOpenTasks.filter(
    (task) => currentTime > 0 && Date.parse(task.due_at) < currentTime,
  ).length;

  return (
    <section className="material-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-material-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Your next sales actions
          </h2>
          <p className="mt-1 text-sm text-muted">
            {overdueCount} overdue · {ownOpenTasks.length} open ·{" "}
            {teamOpenCount} team support
          </p>
        </div>
        <Link href="/crm" className="material-button-filled min-h-11">
          Open follow-ups
        </Link>
      </div>
      {ownOpenTasks.length ? (
        <div className="divide-y divide-material-outline-variant">
          {ownOpenTasks.slice(0, 5).map((task) => {
            const overdue =
              currentTime > 0 && Date.parse(task.due_at) < currentTime;
            return (
              <Link
                key={task.id}
                href={`/crm?taskId=${task.id}`}
                className="grid gap-2 p-4 transition hover:bg-material-surface-container-lowest sm:grid-cols-[150px_minmax(0,1fr)_180px_auto] sm:items-center"
              >
                <p
                  className={`text-xs font-bold ${
                    overdue ? "text-red-700" : "text-muted"
                  }`}
                >
                  {overdue ? "Overdue · " : ""}
                  {new Date(task.due_at).toLocaleString()}
                </p>
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground">
                    {task.client?.client_name ?? "Unknown client"}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {task.project?.project_name ?? "Unknown project"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-muted-strong">
                  {taskTypeLabel(task.task_type)}
                </p>
                <span className="text-sm font-bold text-material-primary">
                  Open
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="p-5 text-sm font-semibold text-muted">
          No personal follow-up tasks are open.
        </p>
      )}
    </section>
  );
}
