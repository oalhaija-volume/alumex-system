# Phase 2 — Sales Workflow Foundation

Date: 2026-07-27

Status: implementation complete in the repository; database migrations are
prepared but have not been applied to the live Supabase project.

## Outcome

This phase adds the durable data and authorization foundation required by the
Alumex workflow specification without replacing the existing measurement,
quotation, contract, or printing interfaces.

## Decisions used

- `Indoor Sales` owns commercial preparation, follow-up, quotations, and
  contracts.
- `Outdoor Sales` can register clients/projects and work only with its own or
  assigned projects. It cannot access quotation or contract values.
- `Sales Rep` remains recognized only as a compatibility role. New employees
  must be assigned one of the explicit Indoor/Outdoor roles.
- Existing projects with no surviving employee remain unassigned. Ownership is
  never guessed.
- The default quotation follow-up interval is five calendar days.
- The business timezone is `Asia/Baghdad`.
- Measurement review belongs to Indoor Sales or Sales Manager; Outdoor Sales
  records and submits field measurements.

## Database foundation

Migrations:

- `20260727110000_sales_roles.sql`
- `20260727111000_sales_crm_foundation.sql`

The migrations add:

- immutable original source, creator, and creator-role attribution;
- current owner, current responsible employee/department, readiness, priority,
  next follow-up, archive, and sales-status fields on projects;
- a centralized catalog of 29 sales statuses and their permitted transitions;
- reason-required terminal and correction transitions;
- normalized assignments and ownership history;
- appointments, follow-up tasks, and follow-up activities;
- internal notifications and append-only audit events;
- project status history and workflow settings;
- manager-only owner reassignment and centralized status-transition functions;
- indexes and row-level security policies for owner/assignment-scoped access.

Original creator references are restrictive: an employee who created a project
must be deactivated rather than deleted so historical attribution remains
intact.

## Application foundation

- Added Indoor/Outdoor roles to employee creation and role normalization.
- Added a centralized capability matrix.
- Added shared sales-status and role-transition definitions.
- Added follow-up date and deduplication helpers.
- Added server-only audit and notification writers.
- Updated relevant client, project, quotation, and contract route guards.
- Scoped Outdoor Sales project and client reads/updates to records it owns.
- Added English and Arabic labels for all new sales statuses and roles.
- Updated local Supabase TypeScript definitions for the foundation schema.

## Verification

Completed successfully:

- `npm run test:sales-foundation`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- JSON validation for English and Arabic message catalogs
- `git diff --check`

The focused tests cover:

- transition targets and terminal-state behavior;
- Outdoor Sales commercial restrictions;
- Indoor/Outdoor capability separation;
- five-calendar-day quotation follow-up calculation;
- follow-up task deduplication keys.

## Deliberately deferred

- The pricing UI and price-table model were not changed.
- No live database migration was attempted without a safe SQL migration runner.
- The intake wizard is Phase 3.
- Measurement request/assignment/review UI is Phase 4.
- CRM timeline and notification center UI are Phase 5.
- Immutable quotation/contract versioning and operations handoff are Phase 6.
