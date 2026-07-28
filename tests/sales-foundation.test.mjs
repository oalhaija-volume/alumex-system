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
  distanceBetweenCoordinatesMeters,
  normalizeGeofenceRadius,
  outdoorSiteDuplicateRadiusMeters,
  parseProjectLocation,
} from "../src/lib/location/coordinates.ts";
import { centimetersToSquareMeters } from "../src/lib/measurements/area.ts";
import {
  isStructuralOpeningType,
  nextStructuralOpeningCode,
  openingCodePrefix,
  structuralOpeningTypes,
} from "../src/lib/measurements/structuralOpenings.ts";
import {
  canCreateContractFromQuotationVersion,
  canRunQuotationVersionAction,
} from "../src/lib/quotations/versionWorkflow.ts";
import {
  normalizeDashboardPreviewRole,
  salesDashboardKind,
} from "../src/lib/dashboard/salesDashboard.ts";
import {
  isMissingDatabaseObjectError,
  isOutdoorSiteDuplicateError,
} from "../src/lib/friendlyErrors.ts";
import { intakeMovesDirectlyToMeasurements } from "../src/lib/intake/nextStage.ts";
import {
  canAttachAddonToOpening,
  openingAddonProducts,
  projectServiceProducts,
} from "../src/lib/quotations/openingAddons.ts";

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
  assert.equal(outdoorSiteDuplicateRadiusMeters, 200);
  assert.equal(
    distanceBetweenCoordinatesMeters(
      { latitude: 33.3152, longitude: 44.3661 },
      { latitude: 33.3152, longitude: 44.3661 },
    ),
    0,
  );
  assert.equal(
    distanceBetweenCoordinatesMeters(
      { latitude: 33.3152, longitude: 44.3661 },
      { latitude: 33.3175, longitude: 44.3661 },
    ) > outdoorSiteDuplicateRadiusMeters,
    true,
  );
  assert.equal(
    isOutdoorSiteDuplicateError({
      code: "23505",
      message: "projects_outdoor_site_200m_duplicate",
    }),
    true,
  );
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

test("structural measurement only accepts broad opening types", () => {
  assert.deepEqual([...structuralOpeningTypes], [
    "Window",
    "Door",
    "Curtain Wall",
    "Skylight",
  ]);
  assert.equal(isStructuralOpeningType("Door"), true);
  assert.equal(isStructuralOpeningType("Sliding"), false);
  assert.equal(isStructuralOpeningType("Clear glass"), false);
});

test("structural opening codes use the selected opening type", () => {
  assert.equal(openingCodePrefix("Window"), "W");
  assert.equal(openingCodePrefix("Door"), "D");
  assert.equal(openingCodePrefix("Curtain Wall"), "CW");
  assert.equal(openingCodePrefix("Skylight"), "SK");
  assert.equal(nextStructuralOpeningCode("Window", ["W-01", "D-02"]), "W-02");
  assert.equal(nextStructuralOpeningCode("Door", ["D-01", "D-03"]), "D-04");
  assert.equal(nextStructuralOpeningCode("Curtain Wall", []), "CW-01");
  assert.equal(nextStructuralOpeningCode("Skylight", ["SK-09"]), "SK-10");
});

test("ready Outdoor Sales intake skips confirmation for measurements", () => {
  assert.equal(
    intakeMovesDirectlyToMeasurements({
      role: "Outdoor Sales",
      source: "outdoor_sales",
      readiness: "ready",
    }),
    true,
  );
  assert.equal(
    intakeMovesDirectlyToMeasurements({
      role: "Admin",
      source: "outdoor_sales",
      readiness: "ready",
    }),
    true,
  );
  assert.equal(
    intakeMovesDirectlyToMeasurements({
      role: "Indoor Sales",
      source: "showroom_walk_in",
      readiness: "ready",
    }),
    false,
  );
  assert.equal(
    intakeMovesDirectlyToMeasurements({
      role: "Outdoor Sales",
      source: "outdoor_sales",
      readiness: "not_ready",
    }),
    false,
  );
});

test("completed field measurements can move directly to quotation", () => {
  assert.equal(
    canTransitionProjectSalesStatus(
      "measurement_in_progress",
      "ready_for_quotation",
    ),
    true,
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

test("quotation add-ons attach only to eligible aluminum openings", () => {
  assert.equal(
    canAttachAddonToOpening({
      openingCode: "W-01",
      openingType: "Window",
      lineType: "base",
    }),
    true,
  );
  assert.equal(
    canAttachAddonToOpening({
      openingCode: "CW-01",
      openingType: "Curtain Wall",
      lineType: "base",
    }),
    true,
  );
  assert.equal(
    canAttachAddonToOpening({
      openingCode: "SK-01",
      openingType: "Skylight",
      lineType: "base",
    }),
    false,
  );
  assert.equal(
    canAttachAddonToOpening({
      openingCode: "SRV",
      openingType: "Door",
      lineType: "service",
    }),
    false,
  );
});

test("opening add-on catalog excludes migrated items from project services", () => {
  const products = [
    {
      product_name: "Cladding",
      category: "service",
      is_active: true,
    },
    {
      product_name: "A Swing Door",
      category: "service",
      is_active: true,
    },
    {
      product_name: "Georgian Bars",
      category: "addon",
      is_active: true,
    },
  ];

  assert.deepEqual(
    projectServiceProducts(products).map((item) => item.product_name),
    ["Cladding"],
  );
  assert.deepEqual(
    openingAddonProducts(products).map((item) => item.product_name),
    ["A Swing Door", "Georgian Bars"],
  );
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

test("Admin dashboard preview accepts only supported sales roles", () => {
  assert.equal(
    normalizeDashboardPreviewRole("Sales Manager"),
    "Sales Manager",
  );
  assert.equal(normalizeDashboardPreviewRole("Indoor Sales"), "Indoor Sales");
  assert.equal(normalizeDashboardPreviewRole("Outdoor Sales"), "Outdoor Sales");
  assert.equal(normalizeDashboardPreviewRole("Finance / Accountant"), null);
  assert.equal(normalizeDashboardPreviewRole(null), null);
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

test("missing Supabase RPC functions are recognized as unapplied migrations", () => {
  assert.equal(
    isMissingDatabaseObjectError({
      code: "PGRST202",
      message: "Could not find the function public.delete_projects_as_admin",
    }),
    true,
  );
});
