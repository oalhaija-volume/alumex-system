"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AppRole } from "@/lib/auth/permissions";
import { appRoles, normalizeAppRole } from "@/lib/auth/roles";
import { useI18n } from "@/components/i18n/I18nProvider";

type ManagedUser = {
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

const roles = appRoles;

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function UsersSettings() {
  const { t, term, formatDate } = useI18n();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("Sales Rep");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsersList = useCallback(async () => {
    const response = await fetch("/api/admin/users", {
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await readError(response, t("settings.loadUsersError"));
      throw new Error(
        message.includes("SUPABASE_SERVICE_ROLE_KEY")
          ? t("settings.serviceRoleMissing")
          : message,
      );
    }

    const body = (await response.json()) as { users?: ManagedUser[] };
    return body.users ?? [];
  }, [t]);

  async function loadUsers() {
    setError("");
    setIsLoading(true);

    try {
      setUsers(await fetchUsersList());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("settings.loadUsersError"),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialUsers() {
      try {
        const nextUsers = await fetchUsersList();

        if (isMounted) {
          setUsers(nextUsers);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("settings.loadUsersError"),
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialUsers();

    return () => {
      isMounted = false;
    };
  }, [fetchUsersList, t]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!username.trim() || !password.trim()) {
      setError(t("settings.emailRequired"));
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });

      if (!response.ok) {
        const message = await readError(response, t("settings.createUserError"));
        setError(
          message.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? t("settings.serviceRoleMissing")
            : message,
        );
        return;
      }

      setUsername("");
      setPassword("");
      setRole("Sales Rep");
      setNotice(t("settings.userCreated"));
      await loadUsers();
    } catch {
      setError(t("settings.createUserError"));
    } finally {
      setIsCreating(false);
    }
  }

  async function updateUser(
    userId: string,
    payload: { role?: AppRole; isActive?: boolean; password?: string },
  ) {
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await readError(response, t("settings.updateUserError"));
        setError(
          message.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? t("settings.serviceRoleMissing")
            : message,
        );
        return;
      }

      setNotice(t("settings.userUpdated"));
      await loadUsers();
    } catch {
      setError(t("settings.updateUserError"));
    }
  }

  async function deleteUser() {
    if (!deleteTarget) {
      return;
    }

    setError("");
    setNotice("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await readError(response, t("settings.deleteUserError"));
        setError(
          message.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? t("settings.serviceRoleMissing")
            : message,
        );
        return;
      }

      setNotice(t("settings.userDeleted"));
      setDeleteTarget(null);
      await loadUsers();
    } catch {
      setError(t("settings.deleteUserError"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-strong">{t("settings.usersDescription")}</p>

      <form onSubmit={createUser} className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_auto]">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.loginUsername")}
          </span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
            placeholder={t("auth.usernamePlaceholder")}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.temporaryPassword")}
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
            placeholder={t("settings.temporaryPassword")}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.role")}
          </span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole)}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
          >
            {roles.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {term(roleOption)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isCreating}
          className="h-11 self-end rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
        >
          {isCreating ? t("common.loading") : t("settings.addUser")}
        </button>
      </form>

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

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm font-semibold text-muted">{t("common.loading")}</p>
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            {t("settings.noUsers")}
          </p>
        ) : (
          users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              roles={roles}
              onUpdate={updateUser}
              term={term}
              t={t}
              formatDate={formatDate}
              onDelete={setDeleteTarget}
            />
          ))
        )}
      </div>

      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 id="delete-user-title" className="text-lg font-bold text-foreground">
              {t("settings.deleteUser")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("settings.deleteUserConfirm", {
                username: deleteTarget.username ?? deleteTarget.email,
              })}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={deleteUser}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("settings.deleteUser")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserRow({
  user,
  roles,
  onUpdate,
  term,
  t,
  formatDate,
  onDelete,
}: {
  user: ManagedUser;
  roles: AppRole[];
  onUpdate: (
    userId: string,
    payload: { role?: AppRole; isActive?: boolean; password?: string },
  ) => Promise<void>;
  term: (value: string | null | undefined) => string;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  formatDate: (value: Date | string | number) => string;
  onDelete: (user: ManagedUser) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(
    normalizeAppRole(user.role) ?? "Sales Rep",
  );
  const [password, setPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  async function runUpdate(
    payload: { role?: AppRole; isActive?: boolean; password?: string },
    clearPassword = false,
  ) {
    setIsUpdating(true);
    await onUpdate(user.id, payload);
    setIsUpdating(false);

    if (clearPassword) {
      setPassword("");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <div className="grid gap-4 xl:grid-cols-[1.4fr_180px_170px_1.6fr] xl:items-end">
        <div>
          <p className="text-sm font-bold text-foreground">
            {user.username ?? user.email}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {t("settings.created")} {formatDate(user.created_at)}
          </p>
          <span
            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
              user.is_active
                ? "bg-success-surface text-success-text"
                : "bg-danger-surface text-danger-text"
            }`}
          >
            {user.is_active ? t("settings.active") : t("settings.inactive")}
          </span>
        </div>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.role")}
          </span>
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as AppRole)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
          >
            {roles.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {term(roleOption)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={isUpdating || selectedRole === normalizeAppRole(user.role)}
          onClick={() => runUpdate({ role: selectedRole })}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:text-muted"
        >
          {t("settings.saveRole")}
        </button>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("settings.newPassword")}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
              placeholder={t("settings.newPassword")}
            />
          </label>
          <button
            type="button"
            disabled={isUpdating || !password.trim()}
            onClick={() => runUpdate({ password }, true)}
            className="h-10 self-end rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:text-muted"
          >
            {t("settings.resetPassword")}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => runUpdate({ isActive: !user.is_active })}
          className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
        >
          {user.is_active ? t("settings.deactivate") : t("settings.activate")}
        </button>
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => onDelete(user)}
          className="rounded-md border border-danger-text bg-transparent px-3 py-2 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white disabled:cursor-not-allowed disabled:text-muted"
        >
          {t("settings.deleteUser")}
        </button>
      </div>
    </div>
  );
}
