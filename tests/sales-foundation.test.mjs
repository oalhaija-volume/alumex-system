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
  hasNearbyProjectSite,
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
  canCreateQuotationForRole,
  isProjectReadyForQuotation,
} from "../src/lib/quotations/creation.ts";
import {
  contractKindFromProjectType,
  firstPartyTermsInDocumentOrder,
  paymentTermsForContractKind,
  specificationsForContractKind,
  splitContractTermsForDocument,
} from "../src/lib/contracts/documentOrder.ts";
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
import {
  intakeMovesDirectlyToMeasurements,
  readinessNeedsFollowUp,
} from "../src/lib/intake/nextStage.ts";
import {
  canAttachAddonToOpening,
  openingAddonProducts,
  projectServiceProducts,
  standaloneQuotationProducts,
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

test("Outdoor Sales blocks a repeated site but allows different locations", () => {
  const existingSites = [{ latitude: 33.3152, longitude: 44.3661 }];

  assert.equal(
    hasNearbyProjectSite(
      { latitude: 33.3152, longitude: 44.3661 },
      existingSites,
    ),
    true,
  );
  assert.equal(
    hasNearbyProjectSite(
      { latitude: 33.316, longitude: 44.3661 },
      existingSites,
    ),
    true,
  );
  assert.equal(
    hasNearbyProjectSite(
      { latitude: 33.318, longitude: 44.3661 },
      existingSites,
    ),
    false,
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

test("Indoor Sales owns quotation creation with an Admin override", () => {
  assert.equal(canCreateQuotationForRole("Indoor Sales"), true);
  assert.equal(canCreateQuotationForRole("Admin"), true);
  assert.equal(canCreateQuotationForRole("Outdoor Sales"), false);
  assert.equal(canCreateQuotationForRole("Sales Rep"), false);

  assert.equal(
    isProjectReadyForQuotation({
      salesStatus: "ready_for_quotation",
      structureReadiness: "ready",
      openingCount: 2,
    }),
    true,
  );
  assert.equal(
    isProjectReadyForQuotation({
      salesStatus: "measurement_required",
      structureReadiness: "ready",
      openingCount: 2,
    }),
    false,
  );
  assert.equal(
    isProjectReadyForQuotation({
      salesStatus: "ready_for_quotation",
      structureReadiness: "partially_ready",
      openingCount: 1,
    }),
    false,
  );
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
    "Louver",
  ]);
  assert.equal(isStructuralOpeningType("Door"), true);
  assert.equal(isStructuralOpeningType("Louver"), true);
  assert.equal(isStructuralOpeningType("Sliding"), false);
  assert.equal(isStructuralOpeningType("Clear glass"), false);
});

test("structural opening codes use the selected opening type", () => {
  assert.equal(openingCodePrefix("Window"), "W");
  assert.equal(openingCodePrefix("Door"), "D");
  assert.equal(openingCodePrefix("Curtain Wall"), "CW");
  assert.equal(openingCodePrefix("Skylight"), "SK");
  assert.equal(openingCodePrefix("Louver"), "L");
  assert.equal(nextStructuralOpeningCode("Window", ["W-01", "D-02"]), "W-02");
  assert.equal(nextStructuralOpeningCode("Door", ["D-01", "D-03"]), "D-04");
  assert.equal(nextStructuralOpeningCode("Curtain Wall", []), "CW-01");
  assert.equal(nextStructuralOpeningCode("Skylight", ["SK-09"]), "SK-10");
  assert.equal(nextStructuralOpeningCode("Louver", ["L-01"]), "L-02");
});

test("measurable Outdoor Sales intake skips confirmation for measurements", () => {
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
      readiness: "partially_ready",
    }),
    true,
  );
  assert.equal(
    intakeMovesDirectlyToMeasurements({
      role: "Outdoor Sales",
      source: "outdoor_sales",
      readiness: "not_ready",
    }),
    false,
  );
  assert.equal(readinessNeedsFollowUp("ready"), false);
  assert.equal(readinessNeedsFollowUp("partially_ready"), true);
  assert.equal(readinessNeedsFollowUp("not_ready"), true);
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

test("generated contracts follow residential and commercial source documents", () => {
  assert.equal(contractKindFromProjectType("Commercial"), "commercial");
  assert.equal(contractKindFromProjectType("مشروع تجاري"), "commercial");
  assert.equal(contractKindFromProjectType("Villa"), "residential");
  assert.match(
    paymentTermsForContractKind("commercial", "residential payments"),
    /25%/,
  );
  assert.equal(
    paymentTermsForContractKind("residential", "residential payments"),
    "residential payments",
  );
  assert.doesNotMatch(
    specificationsForContractKind(
      "commercial",
      "ALUMEX 16\nTHE ADDRESS AS18",
    ),
    /THE ADDRESS/,
  );
  assert.match(
    specificationsForContractKind("commercial", "ALUMEX 16"),
    /كاب او سيليكون/,
  );
  assert.equal(
    firstPartyTermsInDocumentOrder(
      "مدة التنفيذ 60 يوما.",
      "الكفالة عشر سنوات.",
      "يلتزم الطرف الاول بالمباشرة بالعمل.\nيلتزم الطرف الاول بتوريد وتركيب الاعمال.",
    ),
    "مدة التنفيذ 60 يوما.\nالكفالة عشر سنوات.\nيلتزم الطرف الاول بتوريد وتركيب الاعمال.",
  );

  assert.deepEqual(
    splitContractTermsForDocument(
      [
        "تعتبر مقدمة هذا العقد جزءا لا يتجزأ منه.",
        "اتفق الطرف الاول على توريد اعمال الالمنيوم.",
        "مقطع السحاب (ALUMEX 16).",
        "يحسب القياس بالمتر المربع.",
        "اسعار الاضافيات في حال طلبها الزبون لاحقا.",
        "يتم تجهيز بضاعة المشروع بناء على الموافقة.",
        "هذا العقد غير خاضع لأي تخفيض.",
        "يتكون هذا العقد من ستة بنود.",
      ].join("\n"),
    ),
    {
      introduction: "تعتبر مقدمة هذا العقد جزءا لا يتجزأ منه.",
      specifications:
        "اتفق الطرف الاول على توريد اعمال الالمنيوم.\nمقطع السحاب (ALUMEX 16).\nاسعار الاضافيات في حال طلبها الزبون لاحقا.",
      measurementNotes: "يحسب القياس بالمتر المربع.",
      generalTerms:
        "يتم تجهيز بضاعة المشروع بناء على الموافقة.\nهذا العقد غير خاضع لأي تخفيض.",
    },
  );
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
  assert.deepEqual(
    standaloneQuotationProducts([
      ...products,
      {
        product_name: "Spider System",
        category: "service",
        is_active: true,
      },
      {
        product_name: "Curtain Wall",
        category: "service",
        is_active: true,
      },
    ]).map((item) => item.product_name),
    ["Cladding", "Spider System"],
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
