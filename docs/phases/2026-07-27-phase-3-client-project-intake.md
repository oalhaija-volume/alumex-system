# Phase 3 — Client and Project Intake

Date: 2026-07-27

Status: implementation complete in the repository; database migration prepared
but not applied to the live Supabase project.

## Delivered

- A role-focused `/intake` workspace for Admin, Sales Manager, Indoor Sales,
  Outdoor Sales, and legacy Sales Rep accounts.
- One five-step flow: Client, Contacts, Project, Readiness, and Review.
- New or existing client selection.
- Duplicate-candidate warnings based on phone and email.
- Individual/company client types, WhatsApp, preferred language, and company
  name.
- Multiple project contacts with primary-contact handling.
- Source, readiness, expected-ready date, priority, estimated value, engineer,
  consultant, contractor, and internal notes.
- Mobile/tablet project mapping with address search, tap-to-pin, high-accuracy
  current location, reverse address lookup, and saved geofence radius.
- A valid map pin is mandatory for Outdoor Sales intake and is revalidated by
  the server before the project can be created.
- Local versioned draft saving.
- Project attachment upload for PDF, Office, JPG, PNG, and WebP files up to
  25 MB.
- Role-derived creator, owner, and responsibility attribution.
- Outdoor Sales client/project scoping through direct ownership and active
  assignments.
- English and Arabic interface copy.
- A project sales profile showing source, original creator, owner, current
  responsibility, readiness, priority, contacts, status history, and ownership
  history.

## Database

Migration: `supabase/migrations/20260727130000_sales_intake.sql`

It adds:

- client type, company, WhatsApp, preferred language, normalized phone keys,
  and archive fields;
- normalized `client_contacts`;
- project engineer, consultant, and contractor names;
- document attachment category and archive fields;
- private `project-attachments` storage bucket configuration;
- lookup indexes and contact row-level security.

## Authorization

- Outdoor Sales can use intake but only sees its own clients and projects or
  projects to which it has an active assignment.
- Outdoor Sales receives `outdoor_sales` as its intake source default.
- Other sales roles receive `showroom_walk_in` as the default.
- Intake never grants Outdoor Sales quotation, contract, or pricing access.
- Duplicate creation is rejected for normal sales users. Admin and Sales
  Manager overrides require a reason at the API boundary.

## Verification

Passed:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:sales-foundation`
- `npm run build`
- English and Arabic JSON validation
- `git diff --check`

The production build includes `/intake`, `/api/sales-intake`, the project
attachment API, and the project sales-profile API.

## Rendered QA limitation

The Browser plugin is not installed. The regular Playwright fallback was
attempted, but its Chromium executable is not installed. Repository policy
prevents installing browser binaries outside the repository, and no test login
is available. Consequently, the generated desktop/mobile design concepts were
used as the implementation specification, but final screenshot-based fidelity
comparison and authenticated submission against a migrated database remain
pending.

## Deployment dependency

Apply the Phase 2 migrations first, then
`20260727130000_sales_intake.sql`. The intake APIs require the new client,
contact, project, document, audit, and ownership structures.
