"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { AppRole } from "@/lib/auth/permissions";
import { appRoles, normalizeAppRole } from "@/lib/auth/roles";

type Employee = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | "Sales User";
  status?: "Active" | "Inactive";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

async function fetchEmployees() {
  const response = await fetch("/api/admin/users", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to load employees."));
  }

  const body = (await response.json()) as { users?: Employee[] };
  return body.users ?? [];
}

export function HRModule() {
  const { formatDate, t, term } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("Sales Rep");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const loadHRData = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const nextEmployees = await fetchEmployees();
      setEmployees(nextEmployees);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load HR data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHRData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadHRData]);

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!email.trim() || !password.trim()) {
      setError(t("settings.emailRequired"));
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role, fullName }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, t("settings.createUserError")));
      }

      setFullName("");
      setEmail("");
      setPassword("");
      setRole("Sales Rep");
      setNotice("Employee created.");
      await loadHRData();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("settings.createUserError"),
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function updateEmployee(
    employeeId: string,
    payload: { role?: AppRole; isActive?: boolean; fullName?: string },
  ) {
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readError(response, t("settings.updateUserError")));
      }

      setNotice("Employee updated.");
      await loadHRData();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("settings.updateUserError"),
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="HR"
        description="Add employees, assign roles, and manage active access for the system."
      />

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      <SectionCard title="Add employee">
        <form onSubmit={createEmployee} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_220px_auto]">
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Employee name
            </span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
              placeholder="Employee name"
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.loginEmail")}
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
              placeholder={t("auth.emailPlaceholder")}
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.temporaryPassword")}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
              placeholder={t("settings.temporaryPassword")}
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.role")}
            </span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
            >
              {appRoles.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {term(roleOption)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isCreating}
            className="h-11 self-end rounded-md bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? t("common.loading") : "Add Employee"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Employees">
        {isLoading ? (
          <p className="text-sm font-semibold text-muted">{t("common.loading")}</p>
        ) : employees.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            No employees found.
          </p>
        ) : (
          <div className="grid gap-4">
            {employees.map((employee) => (
              <EmployeeAccessCard
                key={`${employee.id}-${employee.full_name ?? ""}-${employee.role}`}
                employee={employee}
                formatDate={formatDate}
                term={term}
                t={t}
                onUpdate={updateEmployee}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function EmployeeAccessCard({
  employee,
  formatDate,
  term,
  t,
  onUpdate,
}: {
  employee: Employee;
  formatDate: (value: Date | string | number) => string;
  term: (value: string | null | undefined) => string;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  onUpdate: (
    employeeId: string,
    payload: { role?: AppRole; isActive?: boolean; fullName?: string },
  ) => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(
    normalizeAppRole(employee.role) ?? "Sales Rep",
  );
  const [selectedName, setSelectedName] = useState(employee.full_name ?? "");
  const [isUpdating, setIsUpdating] = useState(false);

  async function runUpdate(payload: {
    role?: AppRole;
    isActive?: boolean;
    fullName?: string;
  }) {
    setIsUpdating(true);
    await onUpdate(employee.id, payload);
    setIsUpdating(false);
  }

  return (
    <article className="rounded-lg border border-border bg-surface-muted p-4">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_220px_220px_auto_auto] xl:items-end">
        <div>
          <p className="text-sm font-bold text-foreground">
            {employee.full_name || employee.email}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-strong">
            {employee.email}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">
            Created {formatDate(employee.created_at)}
          </p>
          <span
            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
              employee.is_active
                ? "bg-success-surface text-success-text"
                : "bg-danger-surface text-danger-text"
            }`}
          >
            {employee.is_active ? t("settings.active") : t("settings.inactive")}
          </span>
        </div>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            Employee name
          </span>
          <input
            value={selectedName}
            onChange={(event) => setSelectedName(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          />
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.role")}
          </span>
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as AppRole)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          >
            {appRoles.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {term(roleOption)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={
            isUpdating ||
            (selectedRole === normalizeAppRole(employee.role) &&
              selectedName.trim() === (employee.full_name ?? ""))
          }
          onClick={() =>
            void runUpdate({
              role: selectedRole,
              fullName: selectedName,
            })
          }
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:text-muted"
        >
          Save profile
        </button>
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => void runUpdate({ isActive: !employee.is_active })}
          className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {employee.is_active ? t("settings.deactivate") : t("settings.activate")}
        </button>
      </div>

    </article>
  );
}
