"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  canAccessRoute,
  type AppRole,
} from "@/lib/auth/permissions";
import { pageAccessItems } from "@/lib/auth/pageAccess";
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

type PageAccessRow = {
  id?: string;
  user_id: string;
  route_path: string;
  can_access: boolean;
};

type PageAccessMode = "role" | "grant" | "deny";

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

async function fetchPageAccess() {
  const response = await fetch("/api/hr/page-access", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to load page access."));
  }

  const body = (await response.json()) as { access?: PageAccessRow[] };
  return body.access ?? [];
}

export function HRModule({ embedded = false }: { embedded?: boolean }) {
  const { formatDate, t, term } = useI18n();
  const { isAdmin } = useCurrentRole();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pageAccessRows, setPageAccessRows] = useState<PageAccessRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const [employeeResult, nextPageAccess] = await Promise.all([
        fetchEmployees(),
        fetchPageAccess(),
      ]);
      setEmployees(employeeResult.employees);
      setSetupWarning(employeeResult.warning);
      setPageAccessRows(nextPageAccess);
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

    if (!username.trim() || !password.trim()) {
      setError(t("settings.emailRequired"));
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
        body: JSON.stringify({ username, password, role, fullName }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, t("settings.createUserError")));
      }

      setFullName("");
      setUsername("");
      setPassword("");
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

  async function updateEmployeePageAccess(
    employeeId: string,
    access: Array<{ route_path: string; can_access: boolean }>,
  ) {
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/hr/page-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: employeeId, access }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to save page access."));
      }

      setNotice("Page access updated.");
      await loadHRData();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to save page access.",
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

      <SectionCard title="Add employee">
        <form onSubmit={createEmployee} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_220px_auto]">
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Employee name
            </span>
            <input
              value={fullName}
              disabled={Boolean(setupWarning)}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              placeholder="Employee name"
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.loginUsername")}
            </span>
            <input
              value={username}
              disabled={Boolean(setupWarning)}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              placeholder={t("auth.usernamePlaceholder")}
            />
          </label>
          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.temporaryPassword")}
            </span>
            <input
              type="password"
              value={password}
              disabled={Boolean(setupWarning)}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              placeholder={t("settings.temporaryPassword")}
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
              {appRoles.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {term(roleOption)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isCreating || Boolean(setupWarning)}
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
                key={`${employee.id}-${employee.full_name ?? ""}-${employee.role}-${pageAccessRows
                  .filter((access) => access.user_id === employee.id)
                  .map((access) => `${access.route_path}:${access.can_access}`)
                  .join("|")}`}
                employee={employee}
                isAdminUser={isAdmin}
                pageAccessRows={pageAccessRows.filter(
                  (access) => access.user_id === employee.id,
                )}
                formatDate={formatDate}
                term={term}
                t={t}
                onUpdate={updateEmployee}
                onUpdatePageAccess={updateEmployeePageAccess}
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
  pageAccessRows,
  formatDate,
  term,
  t,
  onUpdate,
  onUpdatePageAccess,
}: {
  employee: Employee;
  isAdminUser: boolean;
  pageAccessRows: PageAccessRow[];
  formatDate: (value: Date | string | number) => string;
  term: (value: string | null | undefined) => string;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  onUpdate: (
    employeeId: string,
    payload: { role?: AppRole; isActive?: boolean; fullName?: string },
  ) => Promise<void>;
  onUpdatePageAccess: (
    employeeId: string,
    access: Array<{ route_path: string; can_access: boolean }>,
  ) => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(
    normalizeAppRole(employee.role) ?? "Indoor Sales",
  );
  const [selectedName, setSelectedName] = useState(employee.full_name ?? "");
  const [pageAccessModes, setPageAccessModes] = useState<
    Record<string, PageAccessMode>
  >(() =>
    Object.fromEntries(
      pageAccessRows.map((access) => [
        access.route_path,
        access.can_access ? "grant" : "deny",
      ]),
    ),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
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

  async function savePageAccess() {
    setIsSavingAccess(true);

    const access = pageAccessItems.flatMap((item) => {
      const mode = pageAccessModes[item.routePath] ?? "role";

      if (mode === "role") {
        return [];
      }

      return [{ route_path: item.routePath, can_access: mode === "grant" }];
    });

    await onUpdatePageAccess(employee.id, access);
    setIsSavingAccess(false);
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

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              Page permissions
            </p>
            <p className="mt-1 text-xs font-semibold text-muted">
              Role default applies unless HR grants or denies a page here.
            </p>
          </div>
          <button
            type="button"
            disabled={isSavingAccess || isEmployeeAdmin}
            onClick={() => void savePageAccess()}
            className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
          >
            {isSavingAccess ? t("common.loading") : "Save page access"}
          </button>
        </div>

        {isEmployeeAdmin ? (
          <p className="mt-4 rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
            Admin users always have access to every page.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageAccessItems.map((item) => {
              const roleDefault = canAccessRoute(item.routePath, selectedRole);
              const mode = pageAccessModes[item.routePath] ?? "role";

              return (
                <label key={item.routePath}>
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t(item.labelKey)}
                  </span>
                  <select
                    value={mode}
                    onChange={(event) =>
                      setPageAccessModes((current) => ({
                        ...current,
                        [item.routePath]: event.target.value as PageAccessMode,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                  >
                    <option value="role">
                      Role default: {roleDefault ? "Allowed" : "Blocked"}
                    </option>
                    <option value="grant">Grant access</option>
                    <option value="deny">Deny access</option>
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </div>

    </article>
  );
}
