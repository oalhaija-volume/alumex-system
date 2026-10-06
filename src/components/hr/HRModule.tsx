"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { AppRole } from "@/lib/auth/permissions";
import { appRoles, normalizeAppRole } from "@/lib/auth/roles";

type Employee = {
  id: string;
  email: string;
  username: string | null;
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

  const body = (await response.json()) as {
    users?: Employee[];
    warning?: string;
  };

  return {
    employees: body.users ?? [],
    warning: body.warning ?? "",
  };
}

export function HRModule({ embedded = false }: { embedded?: boolean }) {
  const { formatDate, t, term } = useI18n();
  const { isAdmin } = useCurrentRole();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fullName, setFullName] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [role, setRole] = useState<AppRole>("Indoor Sales");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [setupWarning, setSetupWarning] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const loadHRData = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const employeeResult = await fetchEmployees();
      setEmployees(employeeResult.employees);
      setSetupWarning(employeeResult.warning);
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

    if (!fullName.trim()) {
      setError("Employee name is required.");
      return;
    }

    if (setupWarning) {
      setError(setupWarning);
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, fullName }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, t("settings.createUserError")));
      }

      const result = await response.json() as { credentials: { username: string; temporaryPassword: string } };
      setCredentials(result.credentials);
      setFullName("");
      setRole("Indoor Sales");
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
      {embedded ? null : (
        <PageHeader
          eyebrow="People"
          title="HR"
          description="Add employees, assign roles, and manage active access for the system."
        />
      )}

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      {setupWarning ? (
        <p className="rounded-md border border-border bg-warning-surface px-3 py-2 text-sm font-semibold text-warning-text">
          {setupWarning}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      {credentials ? (
        <SectionCard title="Employee login details">
          <p className="mb-3 text-sm text-muted">Save these details and share them with the employee. The temporary password is shown only here and must be changed after sign-in.</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm font-bold">Username</dt><dd className="mt-1 break-all font-mono select-all">{credentials.username}</dd></div>
            <div><dt className="text-sm font-bold">Temporary password</dt><dd className="mt-1 break-all font-mono select-all">{credentials.temporaryPassword}</dd></div>
          </dl>
          <button type="button" onClick={() => setCredentials(null)} className="mt-4 min-h-11 rounded-md border border-border px-4 text-sm font-bold">I have saved the login details</button>
        </SectionCard>
      ) : null}

      <SectionCard title="Add employee">
        <form onSubmit={createEmployee} className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Employee name
            </span>
            <input
              required
              value={fullName}
              disabled={Boolean(setupWarning)}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              placeholder="Employee name"
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.role")}
            </span>
            <select
              value={role}
              disabled={Boolean(setupWarning)}
              onChange={(event) => setRole(event.target.value as AppRole)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
            >
              {appRoles.filter(roleOption => isAdmin || roleOption !== "Admin").map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {term(roleOption)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isCreating || Boolean(setupWarning) || Boolean(credentials)}
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
                key={`${employee.id}-${employee.full_name}-${employee.role}`}
                employee={employee}
                isAdminUser={isAdmin}
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
  isAdminUser,
  formatDate,
  term,
  t,
  onUpdate,
}: {
  employee: Employee;
  isAdminUser: boolean;
  formatDate: (value: Date | string | number) => string;
  term: (value: string | null | undefined) => string;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  onUpdate: (
    employeeId: string,
    payload: { role?: AppRole; isActive?: boolean; fullName?: string },
  ) => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(
    normalizeAppRole(employee.role) ?? "Indoor Sales",
  );
  const [selectedName, setSelectedName] = useState(employee.full_name ?? "");
  const [isUpdating, setIsUpdating] = useState(false);
  const normalizedEmployeeRole = normalizeAppRole(employee.role);
  const isEmployeeAdmin = normalizedEmployeeRole === "Admin";
  const roleOptions = isAdminUser || isEmployeeAdmin
    ? appRoles
    : appRoles.filter((roleOption) => roleOption !== "Admin");

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
            {employee.full_name || employee.username || "No username"}
          </p>
          <p className="mt-1 text-xs font-bold text-foreground">
            {employee.username ?? "No username"}
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
            disabled={isEmployeeAdmin && !isAdminUser}
            onChange={(event) => setSelectedRole(event.target.value as AppRole)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
          >
            {roleOptions.map((roleOption) => (
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
            (isEmployeeAdmin && !isAdminUser) ||
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
          disabled={isUpdating || (isEmployeeAdmin && !isAdminUser)}
          onClick={() => void runUpdate({ isActive: !employee.is_active })}
          className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {employee.is_active ? t("settings.deactivate") : t("settings.activate")}
        </button>
      </div>

      <p className="mt-4 text-sm text-muted">System access is assigned automatically from the employee’s role.</p>

    </article>
  );
}
