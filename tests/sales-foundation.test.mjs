import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedProjectSalesTransitions,
  canTransitionProjectSalesStatus,
  measurementStatuses,
  projectSalesStatuses,
} from "../src/lib/workflow/salesStatuses.ts";
import {
  addCalendarDays,
  defaultQuotationFollowUpIntervalDays,
  followUpDeduplicationKey,
  quotationFollowUpDueAt,
} from "../src/lib/crm/followUps.ts";
import { roleHasCapability } from "../src/lib/auth/capabilities.ts";
import {
  normalizeGeofenceRadius,
  parseProjectLocation,
} from "../src/lib/location/coordinates.ts";
import { centimetersToSquareMeters } from "../src/lib/measurements/area.ts";
import {
  canCreateContractFromQuotationVersion,
  canRunQuotationVersionAction,
} from "../src/lib/quotations/versionWorkflow.ts";
import { salesDashboardKind } from "../src/lib/dashboard/salesDashboard.ts";
import { isMissingDatabaseObjectError } from "../src/lib/friendlyErrors.ts";

test("every configured project transition points to a known status", () => {
  const knownStatuses = new Set(projectSalesStatuses);

  for (const status of projectSalesStatuses) {
    for (const target of allowedProjectSalesTransitions(status)) {
      assert.equal(knownStatuses.has(target), true, `${status} -> ${target}`);
      assert.equal(canTransitionProjectSalesStatus(status, target), true);
    }
  }
});

test("terminal statuses cannot transition", () => {
  for (const status of [
    "quotation_rejected",
    "client_postponed",
    "client_not_interested",
    "lost",
    "cancelled",
    "transferred_to_operations",
  ]) {
    assert.deepEqual(allowedProjectSalesTransitions(status), []);
  }
});

test("capabilities keep Outdoor Sales away from quotation and contract values", () => {
  assert.equal(roleHasCapability("Outdoor Sales", "projects:create"), true);
  assert.equal(roleHasCapability("Outdoor Sales", "measurements:record"), true);
  assert.equal(roleHasCapability("Outdoor Sales", "quotations:manage"), false);
  assert.equal(roleHasCapability("Outdoor Sales", "contracts:manage"), false);
});

test("Admin is a superuser across every workflow capability", () => {
  for (const capability of [
    "clients:create",
    "clients:update",
    "projects:create",
    "projects:view-team",
    "projects:reassign",
    "measurements:request",
    "measurements:record",
    "measurements:review",
    "quotations:manage",
    "contracts:manage",
    "follow-ups:perform",
    "audit:view",
    "workflow:configure",
  ]) {
    assert.equal(roleHasCapability("Admin", capability), true, capability);
  }
});

test("quotation follow-up uses the configured five-calendar-day default", () => {
  const sharedAt = new Date("2026-07-27T09:30:00.000Z");
  assert.equal(defaultQuotationFollowUpIntervalDays, 5);
  assert.equal(
    quotationFollowUpDueAt(sharedAt).toISOString(),
    "2026-08-01T09:30:00.000Z",
  );
  assert.throws(() => addCalendarDays(sharedAt, 0), RangeError);
  assert.equal(
    followUpDeduplicationKey({
      taskType: "quotation",
      projectId: "project-1",
      quotationId: "quotation-2",
      status: "quotation_sent",
    }),
    "quotation:project-1:quotation-2:quotation_sent",
  );
});

test("project pins reject missing or out-of-range coordinates", () => {
  assert.deepEqual(parseProjectLocation(null, null), {
    isValid: false,
    latitude: null,
    longitude: null,
  });
  assert.equal(parseProjectLocation(33.3152, 44.3661).isValid, true);
  assert.equal(parseProjectLocation(95, 44.3661).isValid, false);
  assert.equal(normalizeGeofenceRadius(undefined), 100);
  assert.equal(normalizeGeofenceRadius(5), 25);
  assert.equal(normalizeGeofenceRadius(1500), 1000);
});

test("measurement handoff separates field capture from Indoor Sales review", () => {
  assert.deepEqual(
    [
      "requested",
      "assigned",
      "appointment_scheduled",
      "employee_en_route",
      "in_progress",
      "draft_saved",
      "submitted",
      "under_review",
      "correction_required",
      "approved",
    ].filter((status) => !measurementStatuses.includes(status)),
    [],
  );
  assert.equal(roleHasCapability("Outdoor Sales", "measurements:record"), true);
  assert.equal(roleHasCapability("Outdoor Sales", "measurements:review"), false);
  assert.equal(roleHasCapability("Indoor Sales", "measurements:record"), false);
  assert.equal(roleHasCapability("Indoor Sales", "measurements:review"), true);
});

test("opening dimensions convert from centimeters to exact square meters", () => {
  assert.equal(
    centimetersToSquareMeters({ width: 100, height: 100, quantity: 1 }),
    1,
  );
  assert.equal(
    centimetersToSquareMeters({ width: 50, height: 50, quantity: 1 }),
    0.25,
  );
  assert.equal(
    centimetersToSquareMeters({ width: 120, height: 200, quantity: 2 }),
    4.8,
  );
});

test("mini CRM follow-ups stay with Indoor Sales and sales management", () => {
  assert.equal(roleHasCapability("Admin", "follow-ups:perform"), true);
  assert.equal(roleHasCapability("Sales Manager", "follow-ups:perform"), true);
  assert.equal(roleHasCapability("Indoor Sales", "follow-ups:perform"), true);
  assert.equal(roleHasCapability("Branch Manager", "follow-ups:perform"), true);
  assert.equal(roleHasCapability("Outdoor Sales", "follow-ups:perform"), false);
});

test("quotation versions preserve approval as the contract boundary", () => {
  assert.equal(canRunQuotationVersionAction("draft", "mark_ready"), true);
  assert.equal(canRunQuotationVersionAction("ready_for_review", "send"), true);
  assert.equal(canRunQuotationVersionAction("sent", "approve"), true);
  assert.equal(canRunQuotationVersionAction("approved", "send"), false);
  assert.equal(canCreateContractFromQuotationVersion("sent"), false);
  assert.equal(canCreateContractFromQuotationVersion("approved"), true);
});

test("sales roles receive the correct owner-first dashboard", () => {
  assert.equal(salesDashboardKind("Admin"), "manager");
  assert.equal(salesDashboardKind("Sales Manager"), "manager");
  assert.equal(salesDashboardKind("Indoor Sales"), "indoor");
  assert.equal(salesDashboardKind("Sales Rep"), "indoor");
  assert.equal(salesDashboardKind("Branch Manager"), "indoor");
  assert.equal(salesDashboardKind("Outdoor Sales"), "outdoor");
  assert.equal(salesDashboardKind("Finance / Accountant"), null);
});

test("pre-migration database objects degrade to empty workflow states", () => {
  assert.equal(
    isMissingDatabaseObjectError({
      code: "PGRST205",
      message:
        "Could not find the table 'public.follow_up_tasks' in the schema cache",
    }),
    true,
  );
  assert.equal(
    isMissingDatabaseObjectError({
      code: "42703",
      message: 'column projects.sales_status does not exist',
    }),
    true,
  );
  assert.equal(
    isMissingDatabaseObjectError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }),
    false,
  );
});
