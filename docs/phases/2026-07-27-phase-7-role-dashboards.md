# Phase 7 — Role Dashboards and UX

Implemented on 2026-07-27.

## Indoor Sales

- Owner-first project list.
- Personal follow-ups due today and overdue.
- Recently submitted measurements requiring review.
- Active quotation follow-ups.
- Appointments for owned projects.
- Separate team-support follow-ups and all-projects sections.
- Performing team support does not change project ownership.

## Outdoor Sales

- Mobile-first two-column metrics and stacked action cards.
- Newly created projects and projects awaiting structure readiness.
- Assigned, overdue, draft, submitted, returned, and completed measurement
  queues.
- Today's and upcoming measurement appointments.
- Direct project, phone, location, start, and resume actions.
- Controlled appointment results: completed, postponed, cancelled, and client
  unavailable.

## Sales Management

- Team project, overdue follow-up, measurement, and appointment metrics.
- Search plus project-status and owner filters.
- Team follow-up queue.
- Recent attributed audit activity.

## Data and authorization

- Added the role-aware `/api/dashboard/sales` endpoint.
- Outdoor Sales reads only attributed projects and assigned field work.
- Appointment status changes use a permission-checked transactional RPC and
  create audit records.
- Added dashboard query indexes for creator/status, measurement assignee/status,
  and appointment assignee/status.
- New dashboard UI, status, action, validation, and empty-state text is stored
  in the English and Arabic message catalogs.

## Database rollout

Apply:

`supabase/migrations/20260727170000_role_dashboards.sql`
