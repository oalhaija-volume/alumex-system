import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");

function readMigration(name) {
  return readFileSync(join(migrationsDirectory, name), "utf8");
}

function leafKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("migration ledger has unique, monotonically ordered filenames", () => {
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  assert.equal(new Set(migrations).size, migrations.length);
  assert.deepEqual(migrations, migrations.toSorted());
  assert.ok(
    migrations.includes("20260606124000_app_role_baseline.sql"),
    "blank-database role baseline is required",
  );
  assert.ok(
    migrations.includes("20260727180000_phase8_rls_hardening.sql"),
    "final RLS hardening migration is required",
  );
});

test("blank-database role baseline precedes every migration that casts roles", () => {
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  const baselineIndex = migrations.indexOf(
    "20260606124000_app_role_baseline.sql",
  );
  const firstLegacyRoleCast = migrations.findIndex(
    (name, index) =>
      index > baselineIndex &&
      readMigration(name).includes("'Sales Rep'::public.app_role"),
  );
  assert.ok(baselineIndex > 0);
  assert.ok(firstLegacyRoleCast > baselineIndex);
  const initialSchemaIndex = migrations.indexOf(
    "20260606123000_initial_schema_and_rls.sql",
  );
  assert.ok(initialSchemaIndex < baselineIndex);
  const baseline = readMigration("20260606124000_app_role_baseline.sql");
  assert.match(baseline, /add value if not exists 'Sales Rep'/);
  assert.match(baseline, /add value if not exists 'Branch Manager'/);
});

test("quotation and contract database invariants remain transactional", () => {
  const sql = readMigration(
    "20260727160000_quotation_contract_versions.sql",
  );
  assert.match(sql, /create table if not exists public\.quotation_versions/);
  assert.match(sql, /unique \(quotation_id, version_number\)/);
  assert.match(
    sql,
    /Only an approved quotation version can create a contract/,
  );
  assert.match(sql, /sign_contract_and_create_handoff/);
  assert.match(sql, /operations_handoffs_contract_unique/);
  assert.match(
    sql,
    /on conflict on constraint operations_handoffs_contract_unique do update/,
  );
  assert.doesNotMatch(sql, /on conflict \(contract_id\) do update/);
  assert.match(sql, /contract_signed_operations_handoff_created/);
  assert.match(sql, /where public\.profiles\.id = p_created_by/);
  assert.match(sql, /where public\.projects\.id = p_project_id/);
  assert.doesNotMatch(sql, /where id = p_created_by/);
  assert.doesNotMatch(
    sql,
    /where id = p_project_id and client_id = p_client_id/,
  );
  const contractSigningRepair = readMigration(
    "20260822140000_fix_contract_signing_rpc_ambiguous_contract_id.sql",
  );
  assert.match(
    contractSigningRepair,
    /on conflict on constraint operations_handoffs_contract_unique do update/,
  );
});

test("unquoted measured projects enter CRM without changing project ownership", () => {
  const sql = readMigration(
    "20260728140000_unquoted_projects_crm_followup.sql",
  );
  assert.match(sql, /ensure_unquoted_project_follow_up/);
  assert.match(sql, /'unquoted-project:' \|\| new\.id::text/);
  assert.match(sql, /claim_sales_follow_up_task/);
  assert.match(sql, /responsible_user_id = actor_profile\.id/);
  assert.match(
    sql,
    /'project_owner_id', task_row\.owner_id,[\s\S]*'followed_by', actor_profile\.id/,
  );
  assert.doesNotMatch(sql, /set\s+owner_id = actor_profile\.id/);
});

test("RLS hardening excludes Outdoor Sales from commercial documents", () => {
  const sql = readMigration("20260727180000_phase8_rls_hardening.sql");
  const commercialPolicyBlocks = [
    /create policy "quotations_select_project_access"[\s\S]*?using \(([\s\S]*?)\n\);/,
    /create policy "contracts_select_project_access"[\s\S]*?using \(([\s\S]*?)\n\);/,
    /create policy "quotation_versions_read_project"[\s\S]*?using \(([\s\S]*?)\n\);/,
  ];
  for (const pattern of commercialPolicyBlocks) {
    const match = sql.match(pattern);
    assert.ok(match, `missing commercial policy ${pattern}`);
    assert.doesNotMatch(match[1], /Outdoor Sales/);
    assert.match(match[1], /Indoor Sales/);
  }
  assert.match(
    sql,
    /projects_select_related"[\s\S]*can_view_sales_project\(id\)/,
  );
});

test("English and Arabic catalogs expose identical message leaves", () => {
  const english = JSON.parse(
    readFileSync(join(repositoryRoot, "messages", "en.json"), "utf8"),
  );
  const arabic = JSON.parse(
    readFileSync(join(repositoryRoot, "messages", "ar.json"), "utf8"),
  );
  assert.deepEqual(leafKeys(english).toSorted(), leafKeys(arabic).toSorted());
});

test("all rebuilt phase migrations enable RLS on their new tables", () => {
  const foundation = readMigration("20260727111000_sales_crm_foundation.sql");
  const measurements = readMigration("20260727140000_sales_measurements.sql");
  const versions = readMigration(
    "20260727160000_quotation_contract_versions.sql",
  );
  for (const table of [
    "follow_up_tasks",
    "follow_up_activities",
    "notifications",
    "audit_events",
  ]) {
    assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const table of [
    "measurement_requests",
    "measurement_visits",
    "measurement_submissions",
  ]) {
    assert.match(measurements, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const table of [
    "quotation_versions",
    "quotation_version_items",
    "operations_handoffs",
  ]) {
    assert.match(versions, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("Admin remains an unrestricted system testing role", () => {
  const permissions = readFileSync(
    join(repositoryRoot, "src", "lib", "auth", "permissions.ts"),
    "utf8",
  );
  const adminServer = readFileSync(
    join(repositoryRoot, "src", "lib", "auth", "adminServer.ts"),
    "utf8",
  );
  const appShell = readFileSync(
    join(repositoryRoot, "src", "components", "AppShell.tsx"),
    "utf8",
  );

  assert.match(
    permissions,
    /if \(role === "Admin"\) \{\s+return true;\s+\}\s+if \(!role \|\| !isActiveSystemRoute\(pathname\)\)/,
  );
  assert.match(
    adminServer,
    /role !== "Admin" && !allowedRoles\.includes\(role\)/,
  );
  assert.match(
    appShell,
    /role === "Admin" && previewRole \? previewRole : role/,
  );
  assert.match(
    appShell,
    /effectiveRole === "Admin" \? navItems : activeNavItems/,
  );
  assert.doesNotMatch(
    appShell,
    /role === "Admin" && item\.href === "\/hr"/,
  );
  assert.match(
    appShell,
    /gridTemplateColumns: `repeat\(\$\{visibleNavItems\.length\}, minmax\(0, 1fr\)\)`/,
  );
  assert.doesNotMatch(appShell, /max-w-full truncate/);
});

test("project deletion is Admin-only and transactional", () => {
  const sql = readMigration("20260728160000_admin_project_deletion.sql");
  const projectsRoute = readFileSync(
    join(repositoryRoot, "src", "app", "api", "projects", "route.ts"),
    "utf8",
  );
  const projectDetails = readFileSync(
    join(
      repositoryRoot,
      "src",
      "components",
      "projects",
      "ProjectDetails.tsx",
    ),
    "utf8",
  );

  assert.match(sql, /create or replace function public\.delete_projects_as_admin/);
  assert.match(sql, /security definer/);
  assert.match(
    sql,
    /actor_role_value is distinct from 'Admin'::public\.app_role/,
  );
  assert.match(sql, /insert into public\.audit_events/);
  assert.match(sql, /'project_deleted'/);
  assert.match(sql, /delete from public\.measurement_submissions/);
  assert.match(sql, /delete from public\.quotation_versions/);
  assert.match(sql, /delete from public\.projects as project/);
  assert.match(
    sql,
    /revoke all on function public\.delete_projects_as_admin\(uuid\[\], uuid\)[\s\S]*from authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.delete_projects_as_admin\(uuid\[\], uuid\)[\s\S]*to service_role/,
  );
  assert.match(
    projectsRoute,
    /export async function DELETE[\s\S]*requireRole\(\["Admin"\]\)[\s\S]*delete_projects_as_admin/,
  );
  assert.match(projectDetails, /const \{ role, isAdmin \} = useCurrentRole\(\)/);
  assert.match(projectDetails, /\{isAdmin \? \([\s\S]*setIsDeleteDialogOpen\(true\)/);
  assert.match(projectDetails, /<ProjectDeleteDialog/);
});

test("partial projects preserve unmeasured openings and CRM follow-up", () => {
  const sql = readMigration(
    "20260810140000_partial_opening_readiness.sql",
  );
  const intakeRoute = readFileSync(
    join(repositoryRoot, "src", "app", "api", "sales-intake", "route.ts"),
    "utf8",
  );
  const measurementRoute = readFileSync(
    join(
      repositoryRoot,
      "src",
      "app",
      "api",
      "measurements",
      "[requestId]",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(sql, /add column if not exists site_readiness/);
  assert.match(sql, /site_readiness in \('ready', 'not_ready'\)/);
  assert.match(intakeRoute, /if \(needsReadinessFollowUp\)/);
  assert.match(measurementRoute, /opening\.site_readiness !== "ready"/);
  assert.match(measurementRoute, /completion_outcome: "all_openings_ready"/);
});
