# Phase 8 — Testing and Validation

Implemented on 2026-07-27.

## Automated coverage

### Unit and invariant suite

Run:

`npm test`

Coverage includes:

- project and measurement status transitions;
- role capabilities and dashboard routing;
- centimeter-to-square-meter conversion;
- quotation version approval as the contract boundary;
- migration filename ordering and blank-database role prerequisites;
- immutable quotation/contract/handoff SQL invariants;
- final RLS commercial separation;
- RLS enablement on rebuilt workflow tables;
- exact English/Arabic message-key parity.

### Disposable Supabase RLS integration

Run:

`npm run test:database`

The test is intentionally skipped unless all of these are supplied for a
disposable environment:

- `ALUMEX_TEST_SUPABASE_URL`
- `ALUMEX_TEST_ANON_KEY`
- `ALUMEX_TEST_SERVICE_ROLE_KEY`
- `ALUMEX_ENABLE_DESTRUCTIVE_DB_TESTS=true`

The test creates temporary Indoor and Outdoor Sales identities and project
records, verifies team/attribution visibility, verifies the Outdoor commercial
boundary, and removes its temporary records. Never point it at production.

### Browser and responsive flows

Install the Chromium runtime once:

`npx playwright install chromium`

List or run:

- `npm run test:e2e:list`
- `npm run test:e2e`

Configured viewports:

- desktop Chromium;
- Pixel 7 mobile Chromium;
- iPad Pro 11 tablet Chromium.

Public login smoke coverage runs without credentials. Authenticated role tests
activate when these account pairs are supplied:

- `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`
- `E2E_INDOOR_USERNAME` / `E2E_INDOOR_PASSWORD`
- `E2E_OUTDOOR_USERNAME` / `E2E_OUTDOOR_PASSWORD`

Coverage includes manager filters, Indoor owner-first queues, Outdoor mobile
measurement actions, commercial-value separation, RTL/LTR switching, console
errors, horizontal overflow, and a three-page quotation print preview.

## Migration validation repairs

- `20260606124000_app_role_baseline.sql` makes a blank migration replay
  reproducible by defining legacy roles before later migrations cast them.
- `20260727180000_phase8_rls_hardening.sql` aligns direct database reads with
  the rebuilt project visibility rules and prevents Outdoor Sales from reading
  quotation, quotation-version, and contract values.

## Combined command

`npm run test:phase8`

The browser and database portions require the external prerequisites described
above. The repository does not store test credentials.
