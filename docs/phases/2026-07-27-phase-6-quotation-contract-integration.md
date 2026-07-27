# Phase 6 — Quotation and Contract Integration

Implemented on 2026-07-27.

## Completed

- A saved quotation now creates an immutable numbered snapshot instead of
  replacing its commercial history.
- Each snapshot preserves its header totals, pricing source, client-facing
  fields, and complete line schedule.
- Quotation workflow actions cover draft, ready, presented, sent, and approved
  states.
- Presenting or sending a quotation creates one active quotation follow-up and
  records the activity.
- Printing a quotation records an attributed timeline/audit event.
- The contract source lists approved quotation versions only.
- A contract stores the exact approved `quotation_version_id`; a database
  trigger prevents contracts from using an unapproved or mismatched source.
- Contract creation records project status history and an audit event in the
  same transaction.
- Saving both digital signatures activates the contract and creates one
  operations handoff in the same transaction.
- The signed handoff moves project responsibility to operations and preserves a
  package snapshot containing the contract and quotation version references.
- Versioned quotations can no longer be physically deleted through the API.

## Database rollout

Apply:

`supabase/migrations/20260727160000_quotation_contract_versions.sql`

The migration backfills version 1 for existing quotations and links existing
contracts to that snapshot. Existing quotations already used by a contract are
treated as approved migration history.

## Verification

- ESLint passed.
- TypeScript `--noEmit` passed.
- Sales workflow tests passed (9 tests).
- Next.js production build passed.
