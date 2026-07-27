# Alumex Sales Workflow and Mini CRM — Phase 1 Audit

Date: 2026-07-27  
Scope: current repository state and migration files only  
Requested outcome: preserve reliable measurement, quotation, printing, and contract features while rebuilding the sales workflow around Outdoor Sales, Indoor Sales, durable ownership, assignments, CRM follow-ups, and an operations handoff.

## Executive summary

The application is a Next.js 16 App Router application with React 19, TypeScript, Tailwind CSS 4, Supabase Auth/Postgres/Storage, and Vercel deployment assumptions.

It already contains useful production-oriented capabilities:

- authenticated users and a broad employee-role enum;
- client and project CRUD with project numbering and duplicate-client checks;
- client/project map coordinates and project geofencing;
- two structural-opening editors, including a mobile step wizard;
- quotation building, catalog/costing pricing, discounts, persistence, preview, print, and PDF export;
- contract generation from a quotation, legal templates, signatures, preview, and print;
- a later operations lifecycle with finance, assignment, audit, factory, delivery, installation, and stage-history concepts;
- centralized English/Arabic message files and runtime RTL/LTR switching.

The requested sales workflow cannot safely be represented by the current schema. The present design has one general `Sales Rep` role, a mutable `sales_engineer_id`, a coarse project status, and a separate downstream workflow status. It has no durable distinction between original creator, owner, current responsible employee, measurement assignee, or follow-up performer. It also has no normalized follow-up tasks, follow-up activities, appointments, measurement visits, notifications, quotation versions, or operations handoff package.

The foundation should therefore be additive. Existing IDs and records should remain in place while new ownership, CRM, measurement-request, versioning, notification, and audit structures are introduced and backfilled.

## 1. Current application architecture

### Runtime and framework

| Area | Current implementation |
| --- | --- |
| Framework | Next.js 16.2.7 App Router |
| UI | React 19.2.4 client components |
| Language | TypeScript with `strict: true` |
| Styling | Tailwind CSS 4 plus global design tokens |
| Data/auth | Supabase SSR, browser client, server client, and service-role client |
| Documents | Browser print, `html-to-image`, and `jspdf` |
| Localization | `messages/en.json`, `messages/ar.json`, `I18nProvider`, local-storage locale |
| Deployment | Vercel-oriented Next.js build |
| Tests | No test runner, test files, or test script currently present |

### Layer map

1. `src/app/**/page.tsx` provides thin App Router entry points.
2. `src/components/**` contains most screen state, forms, workflow UI, and document builders.
3. `src/app/api/**/route.ts` is the server boundary for most writes and several reads.
4. `src/lib/auth/*` defines role normalization, route permissions, and API role guards.
5. `src/lib/workflow/*` defines the downstream workflow statuses, labels, lifecycle stages, and display mapping.
6. `src/lib/supabase/*` creates browser, request-scoped, proxy, and service-role Supabase clients.
7. `supabase/migrations/*` contains the formal migration chain.
8. `supabase/manual_sql/*` contains important schema changes that are not fully represented by the formal chain.

### Authentication and authorization

- Supabase Auth provides the session.
- `src/proxy.ts` protects pages, loads `profiles`, normalizes the role, and applies optional `employee_page_access` overrides.
- API routes call `requireRole()` or route-specific equivalents.
- Most business API routes then use a service-role Supabase client. This bypasses RLS, so correctness depends on every route applying complete object-level authorization itself.
- The email `admin@alumex.com` is treated as an administrator in application code even if the database role differs.
- Page access is not equivalent to data access. For example, an allowed Sales user can load broad client/project collections through service-role API routes.

### Current route/page map

| Area | Routes | Main component |
| --- | --- | --- |
| Authentication | `/login`, `/auth/callback`, `/auth/logout` | production login and profile bootstrap |
| Dashboard | `/`, `/dashboard` | `DashboardView` |
| Clients | `/clients`, `/clients/[clientId]` | `ClientsModule`, `ClientDetails` |
| Projects | `/projects`, `/projects/[projectId]` | `ProjectsModule`, `ProjectDetails` |
| Quotations | `/quotations`, `/quotations/preview` | `QuotationBuilder`, `QuotationPreview` |
| Contracts | `/contracts`, `/contracts/preview` | `ContractGenerator`, `ContractPreview` |
| Commercial | `/commercial` | `CommercialWorkspace` |
| Workflow | `/workflow`, `/workflow/[projectId]` | `WorkflowModule` |
| Measurements | `/site-measurements`, `/site-measurements/[projectId]` | `WorkflowModule`, `SiteMeasurementModule` |
| Finance/costing | `/finance`, `/costing`, `/pricing` | finance/costing/settings modules |
| Downstream operations | operations manager, project manager, project engineer, factory, delivery, installation, quality control | role-specific modules |
| Administration | `/settings`, `/hr` | user, role-page access, pricing, template, vehicle, driver, and team settings |

`postOperationsWorkflowEnabled` is currently `false`. The active navigation is intentionally limited and workflow mutation endpoints reject downstream workflow actions while this switch is off. Several pages remain in the repository but are not currently active system routes.

### State and data-loading pattern

- Clients and projects use React context providers and API requests.
- Projects are returned together with openings and profile-derived sales-owner display names.
- The quotation and contract builders are large client components and use local storage to pass a draft to preview pages.
- The mobile measurement wizard does not persist its unsaved draft locally; only saved openings survive a reload.
- The dashboard is role-aware only for price visibility. Its project and deadline sections are not owner/task-specific.

## 2. Current database schema map

The following map combines the formal migration chain, generated types, and tables referenced by runtime code. The generated `database.types.ts` is not authoritative because it omits several runtime tables and newer columns.

### Core sales tables

| Table | Current purpose | Important current fields |
| --- | --- | --- |
| `profiles` | employee profile and application role | email, username, full name, role, active/status |
| `clients` | client master | name, phones, address, province/city, email, notes, map coordinates, created_by |
| `projects` | project master and mixed assignment state | number, name, client, address/coordinates/geofence, type, branch, sales_engineer_id, coarse status, workflow_status, downstream assignees, created_by |
| `openings` | structural openings directly under a project | location/code, dimensions, quantity, system/glass/color, site-detail fields, notes, created_by |
| `quotations` | mutable quotation header | number, project/client, status, totals, discounts, pricing source, prepared-by fields, validity, notes |
| `quotation_items` | mutable quotation lines | opening reference/snapshot fields, dimensions, pricing, discount, line type |
| `contracts` | contract generated from a quotation | number, project/client/quotation, status/value, discount, legal text, language, signatures, dates |
| `documents` | metadata for client/project/quotation/contract files | polymorphic owner columns, storage location, uploader, print metadata |
| `activity_logs` | generic audit-like records | actor, constrained entity type, entity ID, action, JSON metadata |

### Workflow and operations tables

| Table | Current purpose | Migration status |
| --- | --- | --- |
| `project_workflow_events` | assignment and status events | referenced by runtime; created in repair/manual SQL, but the formal chain depends on a workflow enum not created by the initial migration |
| `lifecycle_stages` | 20-stage downstream lifecycle catalog | formal migration plus repair migration |
| `project_stage_history` | entered/exited stage history and SLA metadata | formal migration plus repair migration |
| `project_finance` | down/final payment state | manual SQL only |
| `project_descriptions` | engineering definition | manual SQL only |
| `project_audit_reviews` | audit decisions | manual SQL only |
| `project_costings` | procurement costing and handoff to sales | formal migration |
| `delivery_assignments`, `delivery_vehicles` | delivery scheduling | formal migration |
| `installation_assignments` | installation scheduling | formal migration |
| `vehicles`, `drivers`, `installation_teams` | operations resources | formal migration |

### Settings tables

- `employee_page_access`
- `contract_templates`
- `project_price_settings`
- `product_price_settings`
- `discount_policy_settings`
- `opening_dropdown_options`

### Current enums/status fields

- `app_role`: broad company roles, including `Sales Manager` and `Sales Rep`, but no Indoor/Outdoor Sales distinction.
- `project_status`: `Draft`, `Measuring`, `Quotation`, `Contract`, `Production`, `Completed`.
- `project_workflow_status`: downstream process from sales creation through finance/operations and eventual closure.
- `quotation_status`: `Draft`, `Sent`, `Approved`, `Rejected`, `Expired`.
- `contract_status`: `Draft`, `Review`, `Active`, `Completed`, `Cancelled`.

### Schema and migration risks

1. The formal migration chain is not reproducible from an empty database as written. It alters and references `project_workflow_status` and `project_workflow_events`, but their original foundation exists in `manual_sql`.
2. Runtime workflow code queries `project_finance`, `project_descriptions`, and `project_audit_reviews`, which are also manual-only.
3. `database.types.ts` omits workflow/history/operations/settings tables and is therefore stale.
4. Several routes contain compatibility fallbacks for missing columns. This is useful for survival but masks database drift.
5. `activity_logs` allows administrators to update and delete history. It is not an immutable audit ledger.
6. Project deletion is exposed to all current project-write roles and performs hard deletion/cleanup. The requested model requires archival/soft deletion for important sales records.
7. Existing foreign-key cascades can delete openings, documents, and history along with projects or parent records.

## 3. Current client-to-contract workflow

### Current happy path

1. A Sales user creates a client from `/clients`.
2. The API performs duplicate checks against normalized phone, email, and similar client name.
3. The user separately creates a project and selects the client.
4. The project API assigns both `created_by` and `sales_engineer_id` to the logged-in user.
5. Structural openings may be entered from the project screen or through the assigned site-measurement screen.
6. A quotation can be created for a project with line items and persisted through `save_quotation_with_items`.
7. On first quotation creation, the downstream workflow may move from `sales_client_created` to `sales_quotation_created`.
8. Any saved quotation returned by the contract-source endpoint can be used to create a contract; approval is not required.
9. Contract creation advances the project to `finance_down_payment_pending`.
10. Signatures can be stored later, but signature completion does not create a dedicated sales handoff record or automatically enforce a signed/operations transition.

### Current behavior that bypasses the requested controls

- Client and project creation are separate generic forms rather than role/source-specific flows.
- Project status is user-selectable in the project form.
- Project updates accept a status without a centralized sales transition service.
- Measurement data is stored directly as project openings; there is no request/visit/review/version boundary.
- Quotation revisions update the existing quotation; there is no preserved version history.
- Contract creation does not verify an approved quotation/version.
- The contract-source endpoint returns all quotations.
- No CRM follow-up is created when a quotation is sent.
- No long-term follow-up exists for structure-not-ready projects.
- No operations handoff package is created when a contract is signed.

## 4. Current roles and permissions

### Current roles

`Admin`, `Sales Manager`, `Sales Rep`, `Finance / Accountant`, `Operations Manager`, `Procurement Engineer`, `Project Manager`, `Project Engineer`, `Site Engineer`, `Auditor`/`Audit Team`, `Branch Manager`, `Factory`, `Glass Department`, `Delivery Head`/`Delivery Team`, `Installation Head`/`Installation Team`, `Quality Control`, and `HR`.

### Current sales access

- Sales workspace roles are Admin, Sales Manager, Sales Rep, and Branch Manager.
- These roles can access clients, projects, quotations, and commercial pages.
- Finance can access contracts but not quotations.
- Quotation write access is based on sales-price visibility, not Indoor Sales ownership.
- Contract creation is available to Admin, Sales Manager, Sales Rep, Branch Manager, and Finance.
- Site measurement access is limited to Admin, assigned Project Engineer, or assigned Site Engineer.

### Permission gaps against the requested workflow

- No `Outdoor Sales` or `Indoor Sales` role.
- No department concept for current responsibility.
- No owner-scoped default read model for Indoor Sales.
- No original-creator immutability.
- No separation between “assist with follow-up” and “take ownership.”
- No object-level check that a Sales user owns or is assigned to the project before service-role writes.
- No permission dedicated to measurement review/approval.
- No manager-only correction/reopen service.
- No append-only audit enforcement.

## 5. Reusable measurement functionality

### Strong reusable pieces

- `SiteMeasurementModule` provides a phone-friendly four-step flow: location, dimensions, details, review.
- It supports multiple openings, add/edit/delete, area calculation, validation, and project/client context.
- Opening types include windows, doors, sliding/fixed systems, curtain walls, and skylights.
- Site-specific fields include shape, bottom frame, direction, glass color, solid-panel height, and fixed height.
- Opening dropdown options are centrally configurable.
- `StructuralOpenings` provides a richer project-side spreadsheet/family editor and integrates product catalogs/pricing.
- Server routes validate assignment for Project Engineer/Site Engineer before exposing a measurement project.

### Required adaptation

- Place the existing opening editor inside a `measurement_visit` or `measurement_submission` context.
- Preserve `openings.project_id` for compatibility, then add a visit/submission reference.
- Add explicit draft, submitted, under-review, correction-required, and approved states.
- Add assignment/appointment context and return-to-owner behavior.
- Add attachment support for site photos/drawings.
- Add durable draft recovery (local storage or IndexedDB plus server drafts).
- Do not allow delete/edit after submission except through correction workflow.

## 6. Reusable quotation and contract functionality

### Quotation

Reusable:

- project/opening selection;
- product and service lines;
- catalog pricing and project-costing pricing;
- line and document discount enforcement;
- atomic header/item save RPC;
- generated quotation numbering;
- bilingual preview;
- print and PDF export;
- document layout and totals.

Required adaptation:

- separate logical quotation from immutable versions;
- snapshot every client-facing revision;
- record presented/printed/sent events and performer;
- limit creation to measurement-approved or manager-overridden projects;
- create one active quotation follow-up task when shared;
- prevent Outdoor Sales from changing commercial values.

### Contract

Reusable:

- quotation/project/client hydration;
- contract numbering;
- legal-template settings;
- discount controls;
- Arabic/English contract rendering;
- client and sales signatures;
- print/export layout.

Required adaptation:

- only approved quotation versions can be selected;
- `contracts` must reference `quotation_version_id`;
- record approval receiver/date and contract creator;
- use a controlled contract status machine;
- create the operations handoff atomically when signing requirements are met.

## 7. Conflicts with the requested workflow

| Requested behavior | Current state | Severity |
| --- | --- | --- |
| Durable original creator and owner | only `created_by` and mutable `sales_engineer_id` | Critical |
| Outdoor vs Indoor Sales | one `Sales Rep` role | Critical |
| Long-term structure follow-up | absent | Critical |
| Quotation follow-up task/history | absent | Critical |
| Appointment/measurement request | absent | Critical |
| Separate measurement lifecycle | openings plus project workflow status | Critical |
| Quotation versions | mutable quotation/items | Critical |
| Approved version required for contract | all saved quotations selectable | Critical |
| Notification inbox with deduplication | absent | High |
| Operations handoff package | absent | High |
| Immutable audit history | generic mutable/deletable logs | High |
| Central sales transition service | status mutations occur in forms/routes/RPC | High |
| Owner-first dashboards | generic global aggregates | High |
| Attachment UI for sales/site | metadata table exists; no generic upload flow | High |
| Soft deletion | hard-delete paths and cascades exist | High |
| Combined search/filtering | basic module filtering only | Medium |
| Full bilingual UI | strong base, but hard-coded English remains | Medium |
| Offline measurement draft | absent | Medium |
| Reproducible schema | manual/formal migration split | Critical |
| Critical automated tests | none | Critical |

## 8. Proposed future database schema

The proposal keeps existing core IDs and adds normalized structures.

### Identity and authorization

- Keep `profiles`.
- Add `departments` and `profile_departments` if employees can work across departments.
- Prefer capability/permission rows or a role-permission map for server authorization.
- Add explicit `Indoor Sales` and `Outdoor Sales` roles, or add a sales-channel/department attribute if business wants the same role with different assignments. This requires confirmation.

### Clients and contacts

- Extend `clients`: client type, company name, WhatsApp, preferred language, archived fields.
- Add `client_contacts`: client, project (optional), contact type, name, role/title, phones, email, primary flag.
- Store normalized phone/search keys in dedicated generated or maintained columns.

### Projects and ownership

- Extend `projects`: source, original_creator_id, original_creator_role, owner_id, responsible_department, responsible_user_id, sales_status, structure_readiness, expected_ready_date, priority, estimated_value, engineer/consultant/contractor fields, archived fields.
- Add `project_assignments`: project, assignment type, assignee, assigned_by, start/end timestamps, reason, active flag.
- Add `project_ownership_history`: previous/new owner, actor, reason, timestamp.
- Keep `created_by` permanently and add a trigger that rejects changes to original attribution.

### Measurements and appointments

- Add `measurement_requests`: project, requester, owner-to-return-to, assignee, status, instructions, requested/preferred times.
- Add `measurement_visits`: request, appointment, performer, started/completed/submitted timestamps, outcome, notes.
- Add `measurement_submissions`: visit, version, status, submitted/reviewed by/at, review note.
- Link existing `openings` to a submission/version while retaining `project_id`.
- Add `appointments`: project/client, type, assignee, creator, schedule, duration, location, status, completion result, related task/request.

### CRM

- Add `follow_up_tasks`: project/client/quotation, type, owner/assignee, due time, state, interval source, deduplication key, completion/reschedule fields.
- Add `follow_up_activities`: task/project/client, performer and role, method, response, notes, outcome, answered flag, prior/new statuses, next due time, appointment reference, correction linkage.
- Activities should be append-only for normal users.
- Add `workflow_settings`: quotation follow-up default days, timezone, reminder behavior.

### Quotations and contracts

- Keep `quotations` as the logical sales document.
- Add `quotation_versions`: quotation, version number, status, complete totals/terms snapshot, created_by/at, approved_by/at.
- Add `quotation_version_items` copied from current quotation items.
- Retain existing `quotation_items` temporarily for compatibility, then make the builder version-aware.
- Add `contracts.quotation_version_id` as a required future reference while preserving `quotation_id`.

### Notifications, attachments, history, and handoff

- Add `notifications`: recipient, type, entity link, read time, action requirement, deduplication key.
- Add `notification_recipients` only if one notification event can target many users.
- Extend/replace `documents` with attachment category, archive fields, and optional follow-up/appointment/measurement/handoff references.
- Add `project_status_history` specifically for the new sales status machine.
- Add append-only `audit_events` with actor role, entity, action, previous/new values, correlation ID, and reason.
- Add `operations_handoffs`: project, contract, approved quotation version, status, created_by/at, accepted_by/at, snapshot/package metadata.

### Required indexes

- projects: owner, responsible employee, original creator, sales status, source, structure readiness, next relevant date, created date;
- assignments: project/type/active and assignee/type/active;
- appointments: assignee/status/start time and project/start time;
- follow-up tasks: assignee/state/due time, owner/state/due time, project/type/state, unique open deduplication key;
- activities: project/activity time and task/activity time;
- notifications: recipient/read/action-required/created time and unique deduplication key;
- quotation versions: quotation/version unique and approval status;
- normalized client phone/WhatsApp and text-search support.

## 9. Proposed status-transition map

Project, measurement, quotation, contract, follow-up, appointment, and handoff states must remain separate. A project sales stage summarizes the process; it must not replace child entity states.

### Project sales status

```text
new_lead
  -> client_registered
  -> structure_not_ready | measurement_required | measurement_in_progress

structure_not_ready
  -> waiting_for_follow_up
  -> structure_not_ready | measurement_required
  -> postponed | not_interested | lost | cancelled

measurement_required
  -> measurement_scheduled
  -> measurement_assigned
  -> measurement_in_progress
  -> measurements_submitted
  -> measurements_under_review
  -> measurements_need_correction -> measurement_in_progress
  -> ready_for_quotation

ready_for_quotation
  -> quotation_in_progress
  -> quotation_ready
  -> quotation_presented | quotation_sent
  -> quotation_follow_up
  -> negotiation
  -> quotation_approved | quotation_rejected | postponed | lost | cancelled

quotation_approved
  -> contract_preparation
  -> contract_generated
  -> contract_sent
  -> contract_signed
  -> transferred_to_operations
```

### Measurement status

```text
not_required_yet -> requested -> unassigned -> assigned
assigned -> appointment_scheduled -> en_route -> in_progress -> draft_saved
draft_saved | in_progress -> submitted -> under_review
under_review -> approved | correction_required
correction_required -> in_progress
requested | assigned | appointment_scheduled -> postponed | cancelled | client_unavailable
```

### Quotation status

```text
draft -> under_preparation -> ready_for_review -> approved_internally
approved_internally -> presented_to_client | printed | sent_to_client
presented_to_client | printed | sent_to_client -> follow_up
follow_up -> under_negotiation | approved_by_client | rejected | expired | cancelled
under_negotiation -> revised
revised -> new immutable version under_preparation
approved_by_client -> converted_to_contract
```

Printing is preferably an activity, not a mutually exclusive lifecycle state. If retained as a status for reporting, it should not erase “sent” or “follow-up.”

### Contract and handoff status

```text
draft -> under_review -> generated -> sent -> signed -> handed_off
draft | under_review | generated | sent -> cancelled
```

The transition service must:

1. authenticate the actor;
2. load the current row and related ownership/assignment;
3. authorize the action;
4. validate the transition;
5. update the entity;
6. append status and audit history;
7. create/complete related task and notification rows;
8. commit atomically.

## 10. File-by-file implementation plan

### Phase 2 — foundation

New:

- `supabase/migrations/<timestamp>_sales_crm_foundation.sql`
- `supabase/migrations/<timestamp>_sales_crm_backfill.sql`
- `src/lib/workflow/salesStatuses.ts`
- `src/lib/workflow/salesTransitions.ts`
- `src/lib/auth/capabilities.ts`
- `src/lib/audit/server.ts`
- `src/lib/notifications/server.ts`
- `src/lib/crm/followUps.ts`
- focused unit tests for transitions, capabilities, ownership, and dates

Modify:

- `src/lib/auth/roles.ts` — add/normalize confirmed sales roles.
- `src/lib/auth/permissions.ts` — route defaults for Indoor/Outdoor Sales.
- `src/lib/supabase/database.types.ts` — regenerate after migrations.
- `src/proxy.ts` — preserve page gating, but avoid treating page access as object authorization.
- affected API routes — call capability/object guards instead of relying on coarse route roles.

### Phase 3 — client/project intake

New:

- role-focused intake route/page and a shared multi-step intake component;
- contact editor, source/readiness step, duplicate-candidate view, project attachment API.

Modify:

- `ClientForm`, `ProjectForm`, clients/projects APIs and providers;
- project details to show creator, owner, current responsibility, readiness, contacts, source, and history.

### Phase 4 — measurements

New:

- measurement request/appointment APIs;
- assignment queue cards and review/correction UI;
- measurement draft persistence hook.

Modify:

- `SiteMeasurementModule` to work within a measurement visit/submission;
- `StructuralOpenings` to remain the shared opening editor;
- site-measurement API and workflow actions to submit/review/return atomically.

### Phase 5 — mini CRM

New:

- CRM task list, activity composer, chronological timeline;
- follow-up APIs and due/overdue queries;
- internal notification center.

Modify:

- dashboard to prioritize own projects/tasks and expose team support separately;
- project details to show complete follow-up history.

### Phase 6 — quotation/contract integration

Modify:

- quotation save RPC and API to create immutable versions;
- quotation builder/preview to select and display versions;
- contract-source API to return only approved versions;
- contract API/generator to store `quotation_version_id`;
- signature action to create an operations handoff transactionally.

### Phase 7 — role dashboards and UX

New/modify:

- Indoor Sales dashboard sections from the specification;
- Outdoor Sales mobile dashboard and measurement tasks;
- manager overview, filters, and audit access;
- central message keys for all new UI/status/validation/notification text.

### Phase 8 — testing and validation

- Introduce the smallest suitable TypeScript test runner.
- Add database/RLS integration tests against a disposable Supabase environment.
- Add browser tests for role flows, RTL/LTR, mobile/tablet layouts, and print documents.
- Add migration verification from a blank database and from a sanitized production-like snapshot.

## 11. Safe database migration strategy

1. **Establish a reproducible baseline.** Compare the live database schema/migration ledger with formal migrations. Convert required manual-only workflow SQL into an idempotent repair/baseline migration before adding CRM tables.
2. **Back up and stage.** Take a recoverable database/storage backup and test against a sanitized copy. No production data rewrite should be the first execution of a migration.
3. **Add before changing.** Create new tables, nullable foreign keys, indexes, policies, and functions without renaming or dropping current columns.
4. **Backfill deterministically.**
   - `original_creator_id = projects.created_by` where present.
   - fallback to `sales_engineer_id` only when `created_by` is null.
   - unresolved ownership/source rows go to an exception report, not a guessed employee.
   - create quotation version 1 from every current quotation and its current items.
   - link each current contract to the matching version 1 only after project/client consistency checks.
5. **Protect attribution.** Add a trigger preventing changes to original creator/source except a narrowly controlled repair function that requires a reason and writes audit history.
6. **Dual read/write during rollout.** Keep current fields populated while new APIs use the normalized records. Compatibility views can prevent a big-bang UI rewrite.
7. **Move business actions into transactions.** Use security-definer RPCs with explicit authorization or server transactions for status change + audit + task + notification operations.
8. **Tighten RLS and service-role routes.** Add owner/assignment/team policies and mirror them in API object guards. Service-role access must never turn a page-level role check into unrestricted row mutation.
9. **Validate counts and invariants.** Compare clients, projects, openings, quotations/items, and contracts before/after; verify every contract resolves to one quotation version and every project has traceable attribution.
10. **Cut over in phases.** Enable new intake, measurements, CRM, then versioned quotations/contracts behind controlled release flags.
11. **Retire legacy paths later.** Only after production validation should coarse status writes, mutable quotation items, or destructive delete paths be disabled. Dropping columns/tables is a separate, explicitly approved migration.

## 12. Critical ambiguities and business decisions

1. Should existing `Sales Rep` users become Indoor Sales, Outdoor Sales, or be assigned individually?
2. Should existing `Site Engineer` remain an engineering role, or is Outdoor Sales expected to perform all sales-stage measurements?
3. For an Outdoor-originated project, who becomes `project_owner_id` when submitted: the Outdoor creator, a selected Indoor employee, a round-robin Indoor queue, or a manager-assigned employee?
4. Who may review and approve measurements: the owning Indoor Sales employee, any Indoor Sales employee, Sales Manager, or a technical role?
5. Is the default quotation follow-up interval four days or five days, and are they calendar or business days?
6. What event means “quotation shared”: explicit Sent/Presented action, PDF download, print, WhatsApp action, or a manual confirmation?
7. What constitutes a signed contract: both captured signatures, uploaded signed PDF, an authorized manual status, or any of these?
8. Does operations handoff occur immediately on signing or only after finance/down-payment confirmation?
9. Should the existing post-contract finance/operations lifecycle remain paused, be re-enabled after handoff, or be replaced?
10. Which employees may view all team projects and client contact details?
11. Which roles may override a suspected duplicate, and what justification is required?
12. What file types, maximum sizes, retention rules, and storage buckets are approved for project/site/CRM attachments?
13. Are notification channels internal-only for the first release, or should email/WhatsApp be included?
14. Should dates and due times always use Asia/Baghdad, including future branches outside Iraq?
15. Are the existing Arabic contract clauses and print layouts the approved legal source of truth?

## Phase 1 deliverable status

- Application architecture mapped: complete.
- Repository database schema mapped: complete.
- Live database drift verification: pending; no production schema or data was modified during this audit.
- Current client-to-contract flow mapped: complete.
- Roles and permissions mapped: complete.
- Reusable measurement/quotation/contract features identified: complete.
- Conflicts and risks documented: complete.
- Future schema and status maps proposed: complete.
- File plan and safe migration strategy proposed: complete.
- Implementation changes: intentionally not started before review of this audit and the critical business decisions.
