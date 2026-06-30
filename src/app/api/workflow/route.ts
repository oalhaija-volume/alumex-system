import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import {
  normalizeAppRole,
  type AppRole,
} from "@/lib/auth/roles";
import { lifecycleStageForWorkflowStatus } from "@/lib/workflow/lifecycle";
import {
  commercialVisibilityForRole,
  isWorkflowStatus,
  workflowNextAction,
  workflowStatusLabel,
  type CommercialVisibility,
} from "@/lib/workflow/display";
import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

const seedAdminEmail = "admin@alumex.com";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role?: AppRole | "Sales User" | null;
  is_active?: boolean | null;
  status?: string | null;
};

type ClientRow = {
  id: string;
  client_name: string;
  mobile: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  email: string | null;
};

type ProjectRow = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string;
  address: string | null;
  location_latitude?: number | string | null;
  location_longitude?: number | string | null;
  geofence_radius_meters?: number | string | null;
  project_type: string | null;
  sales_engineer_id: string | null;
  status: string;
  workflow_status?: string | null;
  operations_manager_id?: string | null;
  project_manager_id?: string | null;
  project_engineer_id?: string | null;
  site_engineer_id?: string | null;
  created_by: string | null;
  created_at: string;
};

type OpeningRow = {
  id: string;
  project_id: string;
  floor: string | null;
  room: string | null;
  opening_code: string;
  width: number | string;
  height: number | string;
  solid_panel_height?: number | string | null;
  fixed_height?: number | string | null;
  quantity: number;
  area_sqm: number | string;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  shape?: string | null;
  opening_type?: string | null;
  bottom_frame?: string | null;
  opening_direction?: string | null;
  glass_color?: string | null;
  notes: string | null;
};

type QuotationRow = {
  id: string;
  quotation_number: string;
  project_id: string;
  status: string;
  subtotal: number | string;
  line_discount_total: number | string;
  quotation_discount_total: number | string;
  grand_total: number | string;
  created_at: string;
};

type QuotationItemRow = {
  id: string;
  quotation_id: string;
  opening_code: string;
  product_system: string | null;
  glass_type: string | null;
  quantity: number;
  area_sqm: number | string;
  unit_price: number | string;
  discount_percent: number | string;
  net_total: number | string;
};

type ContractRow = {
  id: string;
  contract_number: string;
  project_id: string;
  quotation_id: string | null;
  status: string;
  contract_value: number | string;
  contract_date: string | null;
  created_at: string;
};

type FinanceRow = {
  project_id: string;
  contract_id: string | null;
  down_payment_required: number | string;
  down_payment_received: number | string;
  payment_status: string;
  exception_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  updated_at: string;
};

type ProjectDescriptionRow = {
  project_id: string;
  aluminum_system_summary: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  opening_notes: string | null;
  technical_notes: string | null;
  site_notes: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type AuditReviewRow = {
  id: string;
  project_id: string;
  auditor_id: string | null;
  decision: string;
  comments: string | null;
  created_at: string;
};

type WorkflowCommercial = {
  visibility: CommercialVisibility;
  quotation?: {
    id: string;
    quotationNumber: string;
    status: string;
    subtotal?: number;
    lineDiscountTotal?: number;
    quotationDiscountTotal?: number;
    grandTotal?: number;
    items?: Array<{
      id: string;
      openingCode: string;
      productSystem: string;
      glassType: string;
      quantity: number;
      areaSqm: number;
      unitPrice: number;
      discountPercent: number;
      netTotal: number;
    }>;
  } | null;
  contract?: {
    id: string;
    contractNumber: string;
    status: string;
    contractValue: number;
    contractDate: string | null;
    downPaymentRequired: number;
    downPaymentReceived: number;
    remainingBalance: number;
    paymentStatus: string;
    finalPaymentStatus: string;
    exceptionReason: string;
  } | null;
};

type WorkflowProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  client: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    province: string;
    city: string;
  };
  address: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
  geofenceRadiusMeters: number;
  projectType: string;
  projectStatus: string;
  workflowStatus: ProjectWorkflowStatus;
  workflowStatusLabel: string;
  nextRequiredAction: string;
  assignments: {
    operationsManagerId: string;
    operationsManager: string;
    projectManagerId: string;
    projectManager: string;
    projectEngineerId: string;
    projectEngineer: string;
    siteEngineerId: string;
    siteEngineer: string;
    salesEngineerId: string;
    salesEngineer: string;
  };
  openings: Array<{
    id: string;
    openingCode: string;
    floor: string;
    room: string;
    width: number;
    height: number;
    solidPanelHeight: number;
    fixedHeight: number;
    quantity: number;
    areaSqm: number;
    productSystem: string;
    glassType: string;
    aluminumColor: string;
    shape: string;
    openingType: string;
    bottomFrame: string;
    openingDirection: string;
    glassColor: string;
    notes: string;
  }>;
  commercial: WorkflowCommercial;
  projectDescription: {
    aluminumSystemSummary: string;
    glassType: string;
    aluminumColor: string;
    openingNotes: string;
    technicalNotes: string;
    siteNotes: string;
    submittedAt: string;
    updatedAt: string;
  } | null;
  latestAuditReview: {
    id: string;
    auditor: string;
    decision: string;
    comments: string;
    createdAt: string;
  } | null;
};

type AssignableUser = {
  id: string;
  name: string;
  role: AppRole;
};

type WorkflowEventPayload = {
  project_id: string;
  event_type: string;
  from_workflow_status: ProjectWorkflowStatus;
  to_workflow_status: ProjectWorkflowStatus;
  actor_id: string;
  assigned_user_id?: string | null;
  assignment_field?: string | null;
  notes: string;
  metadata?: Record<string, unknown>;
};

type AssignmentType =
  | "projectManager"
  | "projectEngineer"
  | "siteEngineer";
type FinanceAction =
  | "confirmDownPayment"
  | "markPaymentException"
  | "startFinanceFinalCheck"
  | "requestFinalPayment"
  | "confirmFinalPayment"
  | "completeFinanceCheck";
type WorkflowAction =
  | "startMeasurement"
  | "completeMeasurement"
  | "saveProjectDescription"
  | "sendDescriptionToAudit"
  | "approveAudit"
  | "rejectAudit"
  | "approveForFactory"
  | "markSentToFactory"
  | "markFactoryInProgress"
  | "markFactoryCompleted"
  | "markDeliveryPending"
  | "markDelivered"
  | "markInstallationInProgress"
  | "markInstallationCompleted";

type AssignmentConfig = {
  assignmentField:
    | "project_manager_id"
    | "project_engineer_id"
    | "site_engineer_id";
  assignmentType: AssignmentType;
  allowedRoles: AppRole[];
  targetRole: AppRole;
  nextStatus: ProjectWorkflowStatus;
};

const assignmentConfigs: Record<AssignmentType, AssignmentConfig> = {
  projectManager: {
    assignmentField: "project_manager_id",
    assignmentType: "projectManager",
    allowedRoles: ["Admin", "Operations Manager"],
    targetRole: "Project Manager",
    nextStatus: "project_manager_assigned",
  },
  projectEngineer: {
    assignmentField: "project_engineer_id",
    assignmentType: "projectEngineer",
    allowedRoles: ["Admin", "Project Manager"],
    targetRole: "Project Engineer",
    nextStatus: "project_engineer_assigned",
  },
  siteEngineer: {
    assignmentField: "site_engineer_id",
    assignmentType: "siteEngineer",
    allowedRoles: ["Admin", "Project Engineer"],
    targetRole: "Site Engineer",
    nextStatus: "site_engineer_assigned",
  },
};

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function profileName(profile: ProfileRow | undefined) {
  return profile?.full_name || profile?.email || "";
}

function isInactive(profile: ProfileRow | null | undefined) {
  return profile?.is_active === false || profile?.status === "Inactive";
}

function profileRole(profile: ProfileRow | undefined) {
  return normalizeAppRole(profile?.role);
}

function activeAssignableUsers(
  profiles: ProfileRow[],
  role: AppRole,
): AssignableUser[] {
  return profiles
    .filter((profile) => !isInactive(profile) && profileRole(profile) === role)
    .map((profile) => ({
      id: profile.id,
      name: profileName(profile) || profile.email || "Unnamed user",
      role,
    }));
}

function workflowStatusForProject(
  project: ProjectRow,
  quotation: QuotationRow | undefined,
  contract: ContractRow | undefined,
): ProjectWorkflowStatus {
  if (isWorkflowStatus(project.workflow_status)) {
    return project.workflow_status;
  }

  if (contract) {
    return "sales_contract_created";
  }

  if (quotation) {
    return "sales_quotation_created";
  }

  return "sales_client_created";
}

function paymentStatus(status: ProjectWorkflowStatus) {
  if (
    status === "finance_payment_exception" ||
    status === "operations_manager_review"
  ) {
    return "Payment exception";
  }

  const paidStatuses: ProjectWorkflowStatus[] = [
    "finance_down_payment_confirmed",
    "project_manager_assigned",
    "project_engineer_assigned",
    "site_engineer_assigned",
    "measurement_pending",
    "project_description_draft",
    "audit_pending",
    "audit_rejected",
    "audit_approved",
    "finance_final_check",
    "branch_manager_review",
    "approved_for_factory",
    "sent_to_factory",
    "factory_in_progress",
    "factory_completed",
    "final_payment_requested",
    "final_payment_received",
    "delivery_pending",
    "delivered",
    "installation_in_progress",
    "installation_completed",
  ];

  return paidStatuses.includes(status)
    ? "Down payment received"
    : "Down payment pending";
}

function financePaymentStatus(
  status: ProjectWorkflowStatus,
  finance: FinanceRow | undefined,
) {
  if (finance?.payment_status) {
    return finance.payment_status;
  }

  return paymentStatus(status);
}

async function loadFinanceRows(admin: ReturnType<typeof createAdminClient>) {
  const result = await admin
    .from("project_finance")
    .select(
      "project_id, contract_id, down_payment_required, down_payment_received, payment_status, exception_reason, confirmed_by, confirmed_at, updated_at",
    );

  if (!result.error) {
    return (result.data ?? []) as FinanceRow[];
  }

  const message = result.error.message?.toLowerCase() ?? "";

  if (
    message.includes("project_finance") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    console.warn("[api/workflow] project_finance table is missing; using finance fallback", result.error);
    return [];
  }

  throw result.error;
}

async function loadProjectDescriptionRows(
  admin: ReturnType<typeof createAdminClient>,
) {
  const result = await admin
    .from("project_descriptions")
    .select(
      "project_id, aluminum_system_summary, glass_type, aluminum_color, opening_notes, technical_notes, site_notes, submitted_at, updated_at",
    );

  if (!result.error) {
    return (result.data ?? []) as ProjectDescriptionRow[];
  }

  const message = result.error.message?.toLowerCase() ?? "";

  if (
    message.includes("project_descriptions") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    console.warn("[api/workflow] project_descriptions table is missing", result.error);
    return [];
  }

  throw result.error;
}

async function loadAuditReviewRows(admin: ReturnType<typeof createAdminClient>) {
  const result = await admin
    .from("project_audit_reviews")
    .select("id, project_id, auditor_id, decision, comments, created_at")
    .order("created_at", { ascending: false });

  if (!result.error) {
    return (result.data ?? []) as AuditReviewRow[];
  }

  const message = result.error.message?.toLowerCase() ?? "";

  if (
    message.includes("project_audit_reviews") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    console.warn("[api/workflow] project_audit_reviews table is missing", result.error);
    return [];
  }

  throw result.error;
}

async function loadOpeningRows(admin: ReturnType<typeof createAdminClient>) {
  const extendedResult = await admin
    .from("openings")
    .select("id, project_id, floor, room, opening_code, width, height, solid_panel_height, fixed_height, quantity, area_sqm, product_system, glass_type, aluminum_color, shape, opening_type, bottom_frame, opening_direction, glass_color, notes");

  if (!extendedResult.error) {
    return (extendedResult.data ?? []) as OpeningRow[];
  }

  const message = extendedResult.error.message?.toLowerCase() ?? "";
  if (
    !message.includes("fixed_height") &&
    !message.includes("shape") &&
    !message.includes("opening_type") &&
    !message.includes("bottom_frame") &&
    !message.includes("opening_direction") &&
    !message.includes("glass_color") &&
    !message.includes("schema cache")
  ) {
    throw extendedResult.error;
  }

  console.warn(
    "[api/workflow] site engineer opening detail columns are missing; using legacy openings fallback",
    extendedResult.error,
  );

  const fallbackResult = await admin
    .from("openings")
    .select("id, project_id, floor, room, opening_code, width, height, solid_panel_height, quantity, area_sqm, product_system, glass_type, aluminum_color, notes");

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return (fallbackResult.data ?? []) as OpeningRow[];
}

function finalPaymentStatus(status: ProjectWorkflowStatus) {
  if (
    status === "final_payment_received" ||
    status === "delivery_pending" ||
    status === "delivered" ||
    status === "installation_in_progress" ||
    status === "installation_completed"
  ) {
    return "Final payment received";
  }

  if (status === "final_payment_requested") {
    return "Final payment requested";
  }

  return "Not requested";
}

function canRoleSeeProject({
  role,
  userId,
  project,
  status,
}: {
  role: AppRole;
  userId: string;
  project: ProjectRow;
  status: ProjectWorkflowStatus;
}) {
  if (role === "Admin") {
    return true;
  }

  if (role === "Sales Manager") {
    return Boolean(project.sales_engineer_id || project.created_by);
  }

  if (role === "Sales Rep") {
    return project.sales_engineer_id === userId || project.created_by === userId;
  }

  if (role === "Finance / Accountant") {
    return [
      "sales_contract_created",
      "finance_down_payment_pending",
      "finance_down_payment_confirmed",
      "finance_payment_exception",
      "operations_manager_review",
      "audit_approved",
      "finance_final_check",
      "factory_completed",
      "final_payment_requested",
      "final_payment_received",
      "delivery_pending",
      "delivered",
      "installation_in_progress",
      "installation_completed",
    ].includes(status);
  }

  if (role === "Operations Manager") {
    return [
      "finance_down_payment_confirmed",
      "finance_payment_exception",
      "operations_manager_review",
      "project_manager_assigned",
      "project_engineer_assigned",
      "site_engineer_assigned",
      "measurement_pending",
      "project_description_draft",
      "audit_pending",
      "audit_rejected",
      "audit_approved",
      "finance_final_check",
      "branch_manager_review",
      "approved_for_factory",
      "sent_to_factory",
      "factory_in_progress",
      "factory_completed",
      "final_payment_requested",
      "final_payment_received",
      "delivery_pending",
      "delivered",
      "installation_in_progress",
      "installation_completed",
    ].includes(status);
  }

  if (role === "Project Manager") {
    return project.project_manager_id === userId;
  }

  if (role === "Project Engineer") {
    return project.project_engineer_id === userId;
  }

  if (role === "Site Engineer") {
    return project.site_engineer_id === userId;
  }

  if (role === "Auditor" || role === "Audit Team") {
    return status === "audit_pending";
  }

  if (role === "Branch Manager") {
    return status === "branch_manager_review";
  }

  if (role === "Factory") {
    return [
      "approved_for_factory",
      "sent_to_factory",
      "factory_in_progress",
      "factory_completed",
    ].includes(status);
  }

  if (role === "Glass Department") {
    return ["sent_to_factory", "factory_in_progress"].includes(status);
  }

  if (role === "Delivery Head" || role === "Delivery Team") {
    return ["final_payment_received", "delivery_pending", "delivered"].includes(status);
  }

  if (role === "Installation Head" || role === "Installation Team") {
    return ["delivered", "installation_in_progress", "installation_completed"].includes(status);
  }

  if (role === "Quality Control") {
    return ["installation_completed", "quality_control", "project_handover"].includes(status);
  }

  return false;
}

async function recordProjectStageHistory({
  admin,
  projectId,
  previousStatus,
  nextStatus,
  userId,
  eventId,
  notes,
  metadata,
}: {
  admin: ReturnType<typeof createAdminClient>;
  projectId: string;
  previousStatus: ProjectWorkflowStatus;
  nextStatus: ProjectWorkflowStatus;
  userId: string;
  eventId: string;
  notes: string;
  metadata?: Record<string, unknown>;
}) {
  const nextStage = lifecycleStageForWorkflowStatus(nextStatus);

  if (!nextStage) {
    return;
  }

  const previousStage = lifecycleStageForWorkflowStatus(previousStatus);
  const { data: openStages, error: openStageError } = await admin
    .from("project_stage_history")
    .select("id, stage_key")
    .eq("project_id", projectId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1);

  if (openStageError) {
    throw openStageError;
  }

  const currentOpenStage = (openStages ?? [])[0] as
    | { id: string; stage_key: string }
    | undefined;
  const stageChanged =
    previousStage?.key !== nextStage.key ||
    currentOpenStage?.stage_key !== nextStage.key;

  if (!stageChanged && currentOpenStage?.stage_key === nextStage.key) {
    return;
  }

  const now = new Date().toISOString();

  if (currentOpenStage) {
    const { error: closeError } = await admin
      .from("project_stage_history")
      .update({ exited_at: now })
      .eq("project_id", projectId)
      .is("exited_at", null);

    if (closeError) {
      throw closeError;
    }
  }

  const { error: historyError } = await admin
    .from("project_stage_history")
    .insert({
      project_id: projectId,
      stage_key: nextStage.key,
      workflow_status: nextStatus,
      entered_at: now,
      responsible_user_id: userId,
      source_event_id: eventId,
      notes,
      metadata: {
        ...metadata,
        stageSequence: nextStage.sequence,
        stageName: nextStage.label,
      },
    });

  if (historyError) {
    throw historyError;
  }
}

async function insertWorkflowEventWithStage({
  admin,
  payload,
}: {
  admin: ReturnType<typeof createAdminClient>;
  payload: WorkflowEventPayload;
}) {
  const { data, error } = await admin
    .from("project_workflow_events")
    .insert({
      ...payload,
      metadata: payload.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const event = data as { id: string };

  try {
    await recordProjectStageHistory({
      admin,
      projectId: payload.project_id,
      previousStatus: payload.from_workflow_status,
      nextStatus: payload.to_workflow_status,
      userId: payload.actor_id,
      eventId: event.id,
      notes: payload.notes,
      metadata: payload.metadata,
    });
  } catch (stageHistoryError) {
    console.error("[api/workflow] stage history update failed", stageHistoryError);
  }

  return event;
}

async function requireWorkflowUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, status: 401, error: "Authentication is required." };
  }

  if (!hasSupabaseServiceRoleKey()) {
    return { ok: false as const, status: 500, error: supabaseServiceRoleError };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name, role, is_active, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[api/workflow] profile lookup failed", profileError);
    return { ok: false as const, status: 500, error: "Unable to verify permissions." };
  }

  const profileData = profile as ProfileRow | null;
  const role =
    isInactive(profileData)
      ? null
      : user.email?.toLowerCase() === seedAdminEmail
        ? "Admin"
        : normalizeAppRole(profileData?.role);

  if (!role) {
    return { ok: false as const, status: 403, error: "Workflow access is not available for this role." };
  }

  return { ok: true as const, user, role, admin };
}

async function loadProjects(admin: ReturnType<typeof createAdminClient>) {
  const workflowSelect =
    "id, project_number, project_name, client_id, address, location_latitude, location_longitude, geofence_radius_meters, project_type, sales_engineer_id, status, workflow_status, operations_manager_id, project_manager_id, project_engineer_id, site_engineer_id, created_by, created_at";
  const basicSelect =
    "id, project_number, project_name, client_id, address, project_type, sales_engineer_id, status, created_by, created_at";
  const workflowResult = await admin
    .from("projects")
    .select(workflowSelect)
    .order("created_at", { ascending: false });

  if (!workflowResult.error) {
    return workflowResult.data as ProjectRow[];
  }

  const isMissingWorkflowColumn =
    workflowResult.error.message?.includes("workflow_status") ||
    workflowResult.error.message?.includes("operations_manager_id") ||
    workflowResult.error.message?.includes("project_manager_id") ||
    workflowResult.error.message?.includes("project_engineer_id") ||
    workflowResult.error.message?.includes("site_engineer_id");

  if (!isMissingWorkflowColumn) {
    throw workflowResult.error;
  }

  console.warn("[api/workflow] workflow columns are missing; using project fallback", workflowResult.error);
  const basicResult = await admin
    .from("projects")
    .select(basicSelect)
    .order("created_at", { ascending: false });

  if (basicResult.error) {
    throw basicResult.error;
  }

  return basicResult.data as ProjectRow[];
}

export async function GET(request: Request) {
  const authCheck = await requireWorkflowUser();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedProjectId = searchParams.get("projectId");
  const { admin, role, user } = authCheck;
  const visibility = commercialVisibilityForRole(role);
  const canLoadQuotationItems = visibility === "full";

  try {
    const [
      projects,
      { data: clients, error: clientsError },
      { data: profiles, error: profilesError },
      openings,
      { data: quotations, error: quotationsError },
      quotationItemsResult,
      { data: contracts, error: contractsError },
      financeRows,
      descriptionRows,
      auditRows,
    ] = await Promise.all([
      loadProjects(admin),
      admin
        .from("clients")
        .select("id, client_name, mobile, address, province, city, email"),
      admin
        .from("profiles")
        .select("id, email, full_name, role, is_active, status"),
      loadOpeningRows(admin),
      admin
        .from("quotations")
        .select("id, quotation_number, project_id, status, subtotal, line_discount_total, quotation_discount_total, grand_total, created_at")
        .order("created_at", { ascending: false }),
      canLoadQuotationItems
        ? admin
            .from("quotation_items")
            .select("id, quotation_id, opening_code, product_system, glass_type, quantity, area_sqm, unit_price, discount_percent, net_total")
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("contracts")
        .select("id, contract_number, project_id, quotation_id, status, contract_value, contract_date, created_at")
        .order("created_at", { ascending: false }),
      loadFinanceRows(admin),
      loadProjectDescriptionRows(admin),
      loadAuditReviewRows(admin),
    ]);

    const firstError =
      clientsError ??
      profilesError ??
      quotationsError ??
      quotationItemsResult.error ??
      contractsError;

    if (firstError) {
      throw firstError;
    }

    const clientsById = new Map(
      ((clients ?? []) as ClientRow[]).map((client) => [client.id, client]),
    );
    const profilesById = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const openingsByProject = new Map<string, OpeningRow[]>();
    ((openings ?? []) as OpeningRow[]).forEach((opening) => {
      openingsByProject.set(opening.project_id, [
        ...(openingsByProject.get(opening.project_id) ?? []),
        opening,
      ]);
    });
    const quotationsByProject = new Map<string, QuotationRow>();
    ((quotations ?? []) as QuotationRow[]).forEach((quotation) => {
      if (!quotationsByProject.has(quotation.project_id)) {
        quotationsByProject.set(quotation.project_id, quotation);
      }
    });
    const contractsByProject = new Map<string, ContractRow>();
    ((contracts ?? []) as ContractRow[]).forEach((contract) => {
      if (!contractsByProject.has(contract.project_id)) {
        contractsByProject.set(contract.project_id, contract);
      }
    });
    const financeByProject = new Map(
      financeRows.map((finance) => [finance.project_id, finance]),
    );
    const descriptionsByProject = new Map(
      descriptionRows.map((description) => [description.project_id, description]),
    );
    const latestAuditByProject = new Map<string, AuditReviewRow>();
    auditRows.forEach((review) => {
      if (!latestAuditByProject.has(review.project_id)) {
        latestAuditByProject.set(review.project_id, review);
      }
    });
    const quotationItemsByQuotation = new Map<string, QuotationItemRow[]>();
    ((quotationItemsResult.data ?? []) as QuotationItemRow[]).forEach((item) => {
      quotationItemsByQuotation.set(item.quotation_id, [
        ...(quotationItemsByQuotation.get(item.quotation_id) ?? []),
        item,
      ]);
    });

    const workflowProjects = projects.reduce<WorkflowProject[]>((list, project) => {
      const quotation = quotationsByProject.get(project.id);
      const contract = contractsByProject.get(project.id);
      const workflowStatus = workflowStatusForProject(project, quotation, contract);

      if (
        requestedProjectId &&
        project.id !== requestedProjectId
      ) {
        return list;
      }

      if (
        !canRoleSeeProject({
          role,
          userId: user.id,
          project,
          status: workflowStatus,
        })
      ) {
        return list;
      }

      const client = clientsById.get(project.client_id);
      const contractValue = numberValue(contract?.contract_value);
      const finance = financeByProject.get(project.id);
      const description = descriptionsByProject.get(project.id);
      const latestAudit = latestAuditByProject.get(project.id);
      const finalStatus = finalPaymentStatus(workflowStatus);
      const downPaymentRequired =
        numberValue(finance?.down_payment_required) || contractValue * 0.5;
      const downPaymentReceived = numberValue(finance?.down_payment_received);
      const remainingBalance =
        finalStatus === "Final payment received"
          ? 0
          : Math.max(contractValue - downPaymentReceived, 0);

      list.push({
        id: project.id,
        projectNumber: project.project_number,
        projectName: project.project_name,
        client: {
          id: project.client_id,
          name: client?.client_name ?? "",
          mobile: client?.mobile ?? "",
          email: client?.email ?? "",
          address: client?.address ?? project.address ?? "",
          province: client?.province ?? "",
          city: client?.city ?? "",
        },
        address: project.address ?? "",
        locationLatitude:
          project.location_latitude === null || project.location_latitude === undefined
            ? null
            : numberValue(project.location_latitude),
        locationLongitude:
          project.location_longitude === null || project.location_longitude === undefined
            ? null
            : numberValue(project.location_longitude),
        geofenceRadiusMeters:
          project.geofence_radius_meters === null ||
          project.geofence_radius_meters === undefined
            ? 100
            : numberValue(project.geofence_radius_meters),
        projectType: project.project_type ?? "",
        projectStatus: project.status,
        workflowStatus,
        workflowStatusLabel: workflowStatusLabel(workflowStatus),
        nextRequiredAction: workflowNextAction(workflowStatus),
        assignments: {
          operationsManagerId: project.operations_manager_id ?? "",
          operationsManager: profileName(profilesById.get(project.operations_manager_id ?? "")),
          projectManagerId: project.project_manager_id ?? "",
          projectManager: profileName(profilesById.get(project.project_manager_id ?? "")),
          projectEngineerId: project.project_engineer_id ?? "",
          projectEngineer: profileName(profilesById.get(project.project_engineer_id ?? "")),
          siteEngineerId: project.site_engineer_id ?? "",
          siteEngineer: profileName(profilesById.get(project.site_engineer_id ?? "")),
          salesEngineerId: project.sales_engineer_id ?? "",
          salesEngineer: profileName(profilesById.get(project.sales_engineer_id ?? "")),
        },
        openings: (openingsByProject.get(project.id) ?? []).map((opening) => ({
          id: opening.id,
          openingCode: opening.opening_code,
          floor: opening.floor ?? "",
          room: opening.room ?? "",
          width: numberValue(opening.width),
          height: numberValue(opening.height),
          solidPanelHeight: numberValue(opening.solid_panel_height),
          fixedHeight: numberValue(opening.fixed_height),
          quantity: opening.quantity,
          areaSqm: numberValue(opening.area_sqm),
          productSystem: opening.product_system ?? "",
          glassType: opening.glass_type ?? "",
          aluminumColor: opening.aluminum_color ?? "",
          shape: opening.shape ?? "",
          openingType: opening.opening_type ?? opening.product_system ?? "",
          bottomFrame: opening.bottom_frame ?? "",
          openingDirection: opening.opening_direction ?? "",
          glassColor: opening.glass_color ?? opening.aluminum_color ?? "",
          notes: opening.notes ?? "",
        })),
        commercial: {
          visibility,
          quotation:
            quotation && visibility === "full"
              ? {
                  id: quotation.id,
                  quotationNumber: quotation.quotation_number,
                  status: quotation.status,
                  subtotal: numberValue(quotation.subtotal),
                  lineDiscountTotal: numberValue(quotation.line_discount_total),
                  quotationDiscountTotal: numberValue(quotation.quotation_discount_total),
                  grandTotal: numberValue(quotation.grand_total),
                  items: (quotationItemsByQuotation.get(quotation.id) ?? []).map((item) => ({
                    id: item.id,
                    openingCode: item.opening_code,
                    productSystem: item.product_system ?? "",
                    glassType: item.glass_type ?? "",
                    quantity: item.quantity,
                    areaSqm: numberValue(item.area_sqm),
                    unitPrice: numberValue(item.unit_price),
                    discountPercent: numberValue(item.discount_percent),
                    netTotal: numberValue(item.net_total),
                  })),
                }
              : null,
          contract:
            contract && visibility !== "hidden"
              ? {
                  id: contract.id,
                  contractNumber: contract.contract_number,
                  status: contract.status,
                  contractValue,
                  contractDate: contract.contract_date,
                  downPaymentRequired,
                  downPaymentReceived,
                  remainingBalance,
                  paymentStatus: financePaymentStatus(workflowStatus, finance),
                  finalPaymentStatus: finalStatus,
                  exceptionReason: finance?.exception_reason ?? "",
                }
              : null,
        },
        projectDescription: description
          ? {
              aluminumSystemSummary: description.aluminum_system_summary ?? "",
              glassType: description.glass_type ?? "",
              aluminumColor: description.aluminum_color ?? "",
              openingNotes: description.opening_notes ?? "",
              technicalNotes: description.technical_notes ?? "",
              siteNotes: description.site_notes ?? "",
              submittedAt: description.submitted_at ?? "",
              updatedAt: description.updated_at,
            }
          : null,
        latestAuditReview: latestAudit
          ? {
              id: latestAudit.id,
              auditor: profileName(profilesById.get(latestAudit.auditor_id ?? "")),
              decision: latestAudit.decision,
              comments: latestAudit.comments ?? "",
              createdAt: latestAudit.created_at,
            }
          : null,
      });

      return list;
    }, []);

    return NextResponse.json({
      role,
      commercialVisibility: visibility,
      assignableUsers: {
        projectManagers: activeAssignableUsers((profiles ?? []) as ProfileRow[], "Project Manager"),
        projectEngineers: activeAssignableUsers((profiles ?? []) as ProfileRow[], "Project Engineer"),
        siteEngineers: activeAssignableUsers((profiles ?? []) as ProfileRow[], "Site Engineer"),
      },
      projects: workflowProjects,
      project: requestedProjectId ? workflowProjects[0] ?? null : null,
    });
  } catch (error) {
    console.error("[api/workflow] load failed", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load workflow.") },
      { status: 500 },
    );
  }
}

async function rollbackProjectWorkflowStatus({
  admin,
  projectId,
  previousStatus,
}: {
  admin: ReturnType<typeof createAdminClient>;
  projectId: string;
  previousStatus: ProjectWorkflowStatus;
}) {
  const { error } = await admin
    .from("projects")
    .update({ workflow_status: previousStatus })
    .eq("id", projectId);

  if (error) {
    console.error("[api/workflow] finance rollback failed", error);
  }
}

async function rollbackProjectFinance({
  admin,
  projectId,
  previousFinance,
}: {
  admin: ReturnType<typeof createAdminClient>;
  projectId: string;
  previousFinance: {
    project_id: string;
    contract_id: string | null;
    down_payment_required: number | string;
    down_payment_received: number | string;
    payment_status: string;
    exception_reason: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
  } | null;
}) {
  if (!previousFinance) {
    const { error } = await admin
      .from("project_finance")
      .delete()
      .eq("project_id", projectId);

    if (error) {
      console.error("[api/workflow] finance row rollback failed", error);
    }

    return;
  }

  const { error } = await admin
    .from("project_finance")
    .upsert(previousFinance, { onConflict: "project_id" });

  if (error) {
    console.error("[api/workflow] finance row rollback failed", error);
  }
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function descriptionPayload(value: unknown) {
  const payload =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    aluminum_system_summary: textField(payload.aluminumSystemSummary),
    glass_type: textField(payload.glassType),
    aluminum_color: textField(payload.aluminumColor),
    opening_notes: textField(payload.openingNotes),
    technical_notes: textField(payload.technicalNotes),
    site_notes: textField(payload.siteNotes),
  };
}

function hasDescriptionContent(
  description: ReturnType<typeof descriptionPayload> | ProjectDescriptionRow | null,
) {
  if (!description) {
    return false;
  }

  return [
    "aluminum_system_summary",
    "glass_type",
    "aluminum_color",
    "opening_notes",
    "technical_notes",
    "site_notes",
  ].some((field) => {
    const value = description[field as keyof typeof description];
    return typeof value === "string" && value.trim().length > 0;
  });
}

async function handleWorkflowAction({
  authCheck,
  projectId,
  workflowAction,
  projectDescription,
  auditComments,
}: {
  authCheck: Awaited<ReturnType<typeof requireWorkflowUser>> & { ok: true };
  projectId: string;
  workflowAction: WorkflowAction;
  projectDescription: unknown;
  auditComments: unknown;
}) {
  const { admin, role, user } = authCheck;

  try {
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, workflow_status, project_manager_id, project_engineer_id, site_engineer_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      );
    }

    const projectData = project as {
      id: string;
      workflow_status: ProjectWorkflowStatus | null;
      project_manager_id: string | null;
      project_engineer_id: string | null;
      site_engineer_id: string | null;
    };
    const previousStatus = isWorkflowStatus(projectData.workflow_status)
      ? projectData.workflow_status
      : "sales_client_created";
    const isAssignedProjectEngineer =
      role === "Project Engineer" && projectData.project_engineer_id === user.id;
    const isAssignedSiteEngineer =
      role === "Site Engineer" && projectData.site_engineer_id === user.id;
    const canEditDescription = role === "Admin" || isAssignedProjectEngineer;
    const canManageMeasurement = canEditDescription || isAssignedSiteEngineer;
    const canManageFactory =
      role === "Admin" ||
      role === "Factory" ||
      role === "Glass Department" ||
      isAssignedProjectEngineer;
    const isAssignedProjectManager =
      role === "Project Manager" && projectData.project_manager_id === user.id;
    const canManageInstallation = role === "Admin" || isAssignedProjectManager;

    async function transitionWorkflow({
      nextStatus,
      eventType,
      notes,
      metadata,
    }: {
      nextStatus: ProjectWorkflowStatus;
      eventType: string;
      notes: string;
      metadata?: Record<string, unknown>;
    }) {
      const { error: updateError } = await admin
        .from("projects")
        .update({ workflow_status: nextStatus })
        .eq("id", projectId);

      if (updateError) {
        throw updateError;
      }

      try {
        await insertWorkflowEventWithStage({
          admin,
          payload: {
            project_id: projectId,
            event_type: eventType,
            from_workflow_status: previousStatus,
            to_workflow_status: nextStatus,
            actor_id: user.id,
            notes,
            metadata,
          },
        });
      } catch (eventError) {
        await rollbackProjectWorkflowStatus({
          admin,
          projectId,
          previousStatus,
        });
        throw eventError;
      }

      return NextResponse.json({
        workflow: { projectId, workflowStatus: nextStatus },
      });
    }

    if (
      (workflowAction === "startMeasurement" ||
        workflowAction === "completeMeasurement") &&
      !canManageMeasurement
    ) {
      return NextResponse.json(
        { error: "Assigned project engineer or site engineer access is required." },
        { status: 403 },
      );
    }

    if (
      (workflowAction === "saveProjectDescription" ||
        workflowAction === "sendDescriptionToAudit") &&
      !canEditDescription
    ) {
      return NextResponse.json(
        { error: "Project engineer access is required." },
        { status: 403 },
      );
    }

    if (
      (workflowAction === "approveAudit" || workflowAction === "rejectAudit") &&
      role !== "Auditor"
    ) {
      return NextResponse.json(
        { error: "Auditor access is required." },
        { status: 403 },
      );
    }

    if (workflowAction === "approveForFactory" && role !== "Admin" && role !== "Branch Manager") {
      return NextResponse.json(
        { error: "Branch manager access is required." },
        { status: 403 },
      );
    }

    if (
      (workflowAction === "markSentToFactory" ||
        workflowAction === "markFactoryInProgress" ||
        workflowAction === "markFactoryCompleted") &&
      !canManageFactory
    ) {
      return NextResponse.json(
        { error: "Project engineer access is required." },
        { status: 403 },
      );
    }

    if (
      (workflowAction === "markDeliveryPending" ||
        workflowAction === "markDelivered") &&
      role !== "Admin" &&
      role !== "Delivery Head" &&
      role !== "Delivery Team"
    ) {
      return NextResponse.json(
        { error: "Delivery head access is required." },
        { status: 403 },
      );
    }

    if (
      (workflowAction === "markInstallationInProgress" ||
        workflowAction === "markInstallationCompleted") &&
      !canManageInstallation
    ) {
      return NextResponse.json(
        { error: "Project manager access is required." },
        { status: 403 },
      );
    }

    if (workflowAction === "startMeasurement") {
      if (previousStatus !== "site_engineer_assigned") {
        return NextResponse.json(
          { error: "Measurement can only start after a site engineer is assigned." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "measurement_pending",
        eventType: "measurement_started",
        notes: "Detailed measurement started",
      });
    }

    if (workflowAction === "completeMeasurement") {
      if (previousStatus !== "measurement_pending") {
        return NextResponse.json(
          { error: "Measurement can only be completed from the measurement stage." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "project_description_draft",
        eventType: "measurement_completed",
        notes: "Detailed measurement completed",
      });
    }

    if (
      workflowAction === "saveProjectDescription" ||
      workflowAction === "sendDescriptionToAudit"
    ) {
      const allowedStatuses: ProjectWorkflowStatus[] =
        workflowAction === "saveProjectDescription"
          ? ["project_description_draft", "audit_rejected"]
          : ["project_description_draft", "audit_rejected"];

      if (!allowedStatuses.includes(previousStatus)) {
        return NextResponse.json(
          {
            error:
              "Project description can only be updated during draft or audit rework.",
          },
          { status: 400 },
        );
      }

      const description = descriptionPayload(projectDescription);

      if (!hasDescriptionContent(description)) {
        return NextResponse.json(
          { error: "Project description details are required." },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();
      const nextStatus: ProjectWorkflowStatus =
        workflowAction === "sendDescriptionToAudit"
          ? "audit_pending"
          : previousStatus;
      const { error: descriptionError } = await admin
        .from("project_descriptions")
        .upsert(
          {
            project_id: projectId,
            ...description,
            updated_by: user.id,
            created_by: user.id,
            submitted_at:
              workflowAction === "sendDescriptionToAudit" ? now : null,
          },
          { onConflict: "project_id" },
        );

      if (descriptionError) {
        throw descriptionError;
      }

      if (nextStatus !== previousStatus) {
        const { error: updateError } = await admin
          .from("projects")
          .update({ workflow_status: nextStatus })
          .eq("id", projectId);

        if (updateError) {
          throw updateError;
        }
      }

      try {
        await insertWorkflowEventWithStage({
          admin,
          payload: {
            project_id: projectId,
            event_type:
              workflowAction === "sendDescriptionToAudit"
                ? "description_sent_to_audit"
                : "description_saved",
            from_workflow_status: previousStatus,
            to_workflow_status: nextStatus,
            actor_id: user.id,
            notes:
              workflowAction === "sendDescriptionToAudit"
                ? "Project description sent to audit"
                : "Project description saved",
          },
        });
      } catch (eventError) {
        if (nextStatus !== previousStatus) {
          await rollbackProjectWorkflowStatus({
            admin,
            projectId,
            previousStatus,
          });
        }
        throw eventError;
      }

      return NextResponse.json({
        workflow: { projectId, workflowStatus: nextStatus },
      });
    }

    if (workflowAction === "approveAudit" || workflowAction === "rejectAudit") {
      if (previousStatus !== "audit_pending") {
        return NextResponse.json(
          { error: "Audit actions are only available while audit is pending." },
          { status: 400 },
        );
      }

      const comments = textField(auditComments);

      if (workflowAction === "rejectAudit" && !comments) {
        return NextResponse.json(
          { error: "Rejection comments are required." },
          { status: 400 },
        );
      }

      const nextStatus: ProjectWorkflowStatus =
        workflowAction === "approveAudit" ? "audit_approved" : "audit_rejected";
      const decision =
        workflowAction === "approveAudit" ? "approved" : "rejected";
      const { error: reviewError } = await admin
        .from("project_audit_reviews")
        .insert({
          project_id: projectId,
          auditor_id: user.id,
          decision,
          comments: comments || null,
        });

      if (reviewError) {
        throw reviewError;
      }

      const { error: updateError } = await admin
        .from("projects")
        .update({ workflow_status: nextStatus })
        .eq("id", projectId);

      if (updateError) {
        throw updateError;
      }

      try {
        await insertWorkflowEventWithStage({
          admin,
          payload: {
            project_id: projectId,
            event_type:
              workflowAction === "approveAudit"
                ? "audit_approved"
                : "audit_rejected",
            from_workflow_status: previousStatus,
            to_workflow_status: nextStatus,
            actor_id: user.id,
            notes:
              workflowAction === "approveAudit"
                ? "Audit approved"
                : "Audit rejected",
            metadata: { comments },
          },
        });
      } catch (eventError) {
        await rollbackProjectWorkflowStatus({
          admin,
          projectId,
          previousStatus,
        });
        throw eventError;
      }

      return NextResponse.json({
        workflow: { projectId, workflowStatus: nextStatus },
      });
    }

    if (workflowAction === "approveForFactory") {
      if (previousStatus !== "branch_manager_review") {
        return NextResponse.json(
          { error: "Factory approval is only available during branch review." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "approved_for_factory",
        eventType: "branch_approved",
        notes: "Branch manager approved sending to factory",
      });
    }

    if (workflowAction === "markSentToFactory") {
      if (previousStatus !== "approved_for_factory") {
        return NextResponse.json(
          { error: "Project can only be sent to factory after branch approval." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "sent_to_factory",
        eventType: "sent_to_factory",
        notes: "Project sent to factory",
      });
    }

    if (workflowAction === "markFactoryInProgress") {
      if (previousStatus !== "sent_to_factory") {
        return NextResponse.json(
          { error: "Factory progress can only start after sending to factory." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "factory_in_progress",
        eventType: "factory_in_progress",
        notes: "Factory marked in progress",
      });
    }

    if (workflowAction === "markFactoryCompleted") {
      if (previousStatus !== "factory_in_progress") {
        return NextResponse.json(
          { error: "Factory completion is only available while production is in progress." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "factory_completed",
        eventType: "factory_completed",
        notes: "Factory marked completed",
      });
    }

    if (workflowAction === "markDeliveryPending") {
      if (previousStatus !== "final_payment_received") {
        return NextResponse.json(
          { error: "Delivery preparation is only available after final payment is received." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "delivery_pending",
        eventType: "delivery_pending",
        notes: "Delivery is pending",
      });
    }

    if (workflowAction === "markDelivered") {
      if (previousStatus !== "delivery_pending") {
        return NextResponse.json(
          { error: "Delivery can only be completed while delivery is pending." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "delivered",
        eventType: "delivered",
        notes: "Project delivered",
      });
    }

    if (workflowAction === "markInstallationInProgress") {
      if (previousStatus !== "delivered") {
        return NextResponse.json(
          { error: "Installation can only start after delivery." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "installation_in_progress",
        eventType: "installation_in_progress",
        notes: "Installation marked in progress",
      });
    }

    if (workflowAction === "markInstallationCompleted") {
      if (previousStatus !== "installation_in_progress") {
        return NextResponse.json(
          { error: "Installation can only be completed while it is in progress." },
          { status: 400 },
        );
      }

      return transitionWorkflow({
        nextStatus: "installation_completed",
        eventType: "installation_completed",
        notes: "Installation completed",
      });
    }

    return NextResponse.json(
      { error: "Unsupported workflow action." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[api/workflow] workflow action failed", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save workflow action.") },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authCheck = await requireWorkflowUser();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
    assignmentType?: unknown;
    assigneeId?: unknown;
    financeAction?: unknown;
    workflowAction?: unknown;
    projectDescription?: unknown;
    auditComments?: unknown;
    downPaymentReceived?: unknown;
    exceptionReason?: unknown;
  } | null;
  const workflowAction = body?.workflowAction;

  if (
    body &&
    typeof body.projectId === "string" &&
    (workflowAction === "startMeasurement" ||
      workflowAction === "completeMeasurement" ||
      workflowAction === "saveProjectDescription" ||
      workflowAction === "sendDescriptionToAudit" ||
      workflowAction === "approveAudit" ||
      workflowAction === "rejectAudit" ||
      workflowAction === "approveForFactory" ||
      workflowAction === "markSentToFactory" ||
      workflowAction === "markFactoryInProgress" ||
      workflowAction === "markFactoryCompleted" ||
      workflowAction === "markDeliveryPending" ||
      workflowAction === "markDelivered" ||
      workflowAction === "markInstallationInProgress" ||
      workflowAction === "markInstallationCompleted")
  ) {
    return handleWorkflowAction({
      authCheck,
      projectId: body.projectId,
      workflowAction,
      projectDescription: body.projectDescription,
      auditComments: body.auditComments,
    });
  }

  const financeAction = body?.financeAction;

  if (
    body &&
    typeof body.projectId === "string" &&
    (financeAction === "confirmDownPayment" ||
      financeAction === "markPaymentException" ||
      financeAction === "startFinanceFinalCheck" ||
      financeAction === "requestFinalPayment" ||
      financeAction === "confirmFinalPayment" ||
      financeAction === "completeFinanceCheck")
  ) {
    return handleFinanceAction({
      authCheck,
      projectId: body.projectId,
      financeAction,
      downPaymentReceived: body.downPaymentReceived,
      exceptionReason: body.exceptionReason,
    });
  }

  const assignmentType = body?.assignmentType;
  const config =
    assignmentType === "projectManager" ||
    assignmentType === "projectEngineer" ||
    assignmentType === "siteEngineer"
      ? assignmentConfigs[assignmentType]
      : null;

  if (
    !body ||
    typeof body.projectId !== "string" ||
    typeof body.assigneeId !== "string" ||
    !config
  ) {
    return NextResponse.json(
      { error: "A valid assignment payload is required." },
      { status: 400 },
    );
  }

  const { admin, role, user } = authCheck;

  if (!config.allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: "You do not have permission to update this assignment." },
      { status: 403 },
    );
  }

  try {
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, workflow_status, project_manager_id, project_engineer_id, site_engineer_id")
      .eq("id", body.projectId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      );
    }

    const projectData = project as {
      id: string;
      workflow_status: ProjectWorkflowStatus | null;
      project_manager_id: string | null;
      project_engineer_id: string | null;
      site_engineer_id: string | null;
    };

    if (
      role === "Project Manager" &&
      projectData.project_manager_id !== user.id
    ) {
      return NextResponse.json(
        { error: "You can only assign engineers for your own projects." },
        { status: 403 },
      );
    }

    if (
      role === "Project Engineer" &&
      projectData.project_engineer_id !== user.id
    ) {
      return NextResponse.json(
        { error: "You can only assign site engineers for your own projects." },
        { status: 403 },
      );
    }

    const { data: assignee, error: assigneeError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, is_active, status")
      .eq("id", body.assigneeId)
      .maybeSingle();

    if (assigneeError) {
      throw assigneeError;
    }

    const assigneeData = assignee as ProfileRow | null;

    if (
      !assigneeData ||
      isInactive(assigneeData) ||
      profileRole(assigneeData) !== config.targetRole
    ) {
      return NextResponse.json(
        { error: `Select an active ${config.targetRole}.` },
        { status: 400 },
      );
    }

    const previousStatus = isWorkflowStatus(projectData.workflow_status)
      ? projectData.workflow_status
      : "sales_contract_created";
    const previousAssigneeId = projectData[config.assignmentField];
    const allowedAssignmentStatuses: Record<AssignmentType, ProjectWorkflowStatus[]> = {
      projectManager: [
        "finance_down_payment_confirmed",
        "finance_payment_exception",
        "operations_manager_review",
      ],
      projectEngineer: ["project_manager_assigned"],
      siteEngineer: ["project_engineer_assigned"],
    };

    if (!allowedAssignmentStatuses[config.assignmentType].includes(previousStatus)) {
      return NextResponse.json(
        { error: "This assignment is not available for the current workflow stage." },
        { status: 400 },
      );
    }

    const { data: updatedProject, error: updateError } = await admin
      .from("projects")
      .update({
        [config.assignmentField]: body.assigneeId,
        workflow_status: config.nextStatus,
      })
      .eq("id", body.projectId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updatedProject) {
      return NextResponse.json(
        { error: "Project assignment was not saved." },
        { status: 404 },
      );
    }

    try {
      await insertWorkflowEventWithStage({
        admin,
        payload: {
          project_id: body.projectId,
          event_type: "assignment",
          from_workflow_status: previousStatus,
          to_workflow_status: config.nextStatus,
          actor_id: user.id,
          assigned_user_id: body.assigneeId,
          assignment_field: config.assignmentField,
          notes: `${config.targetRole} assigned`,
          metadata: {
            assignmentType: config.assignmentType,
            assignedRole: config.targetRole,
          },
        },
      });
    } catch (eventError) {
      console.error("[api/workflow] assignment event log failed", eventError);

      const { error: rollbackError } = await admin
        .from("projects")
        .update({
          [config.assignmentField]: previousAssigneeId,
          workflow_status: previousStatus,
        })
        .eq("id", body.projectId);

      if (rollbackError) {
        console.error("[api/workflow] assignment rollback failed", rollbackError);
      }

      return NextResponse.json(
        {
          error:
            "Assignment was not saved because the workflow event log is not available.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      assignment: {
        projectId: body.projectId,
        assignmentType: config.assignmentType,
        assigneeId: body.assigneeId,
        workflowStatus: config.nextStatus,
      },
    });
  } catch (error) {
    console.error("[api/workflow] assignment failed", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save assignment.") },
      { status: 500 },
    );
  }
}

async function handleFinanceAction({
  authCheck,
  projectId,
  financeAction,
  downPaymentReceived,
  exceptionReason,
}: {
  authCheck: Awaited<ReturnType<typeof requireWorkflowUser>> & { ok: true };
  projectId: string;
  financeAction: FinanceAction;
  downPaymentReceived: unknown;
  exceptionReason: unknown;
}) {
  const { admin, role, user } = authCheck;

  if (role !== "Admin" && role !== "Finance / Accountant") {
    return NextResponse.json(
      { error: "Finance access is required." },
      { status: 403 },
    );
  }

  try {
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, workflow_status")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      );
    }

    const projectData = project as {
      id: string;
      workflow_status: ProjectWorkflowStatus | null;
    };
    const previousStatus = isWorkflowStatus(projectData.workflow_status)
      ? projectData.workflow_status
      : "finance_down_payment_pending";

    const { data: contract, error: contractError } = await admin
      .from("contracts")
      .select("id, contract_value")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contractError) {
      throw contractError;
    }

    if (!contract) {
      return NextResponse.json(
        { error: "A contract is required before finance approval." },
        { status: 400 },
      );
    }

    const contractData = contract as {
      id: string;
      contract_value: number | string;
    };
    const contractValue = numberValue(contractData.contract_value);
    const requiredDownPayment = contractValue * 0.5;

    const { data: existingFinance, error: existingFinanceError } = await admin
      .from("project_finance")
      .select("project_id, contract_id, down_payment_required, down_payment_received, payment_status, exception_reason, confirmed_by, confirmed_at")
      .eq("project_id", projectId)
      .maybeSingle();

    if (existingFinanceError) {
      throw existingFinanceError;
    }

    const financeData = existingFinance as {
      project_id: string;
      contract_id: string | null;
      down_payment_required: number | string;
      down_payment_received: number | string;
      payment_status: string;
      exception_reason: string | null;
      confirmed_by: string | null;
      confirmed_at: string | null;
    } | null;
    const receivedAmount =
      financeAction === "confirmDownPayment"
        ? numberValue(downPaymentReceived)
        : numberValue(financeData?.down_payment_received);

    if (
      financeAction === "confirmDownPayment" &&
      receivedAmount <= 0
    ) {
      return NextResponse.json(
        { error: "Down payment received amount is required." },
        { status: 400 },
      );
    }

    const financeActionConfig: Record<
      FinanceAction,
      {
        eventType: string;
        nextStatus: ProjectWorkflowStatus;
        paymentStatus: string;
        note: string;
        allowedStatuses: ProjectWorkflowStatus[];
      }
    > = {
      confirmDownPayment: {
        eventType: "finance_down_payment",
        nextStatus: "finance_down_payment_confirmed",
        paymentStatus: "Down payment received",
        note: "Down payment confirmed",
        allowedStatuses: [
          "sales_contract_created",
          "finance_down_payment_pending",
          "finance_payment_exception",
        ],
      },
      markPaymentException: {
        eventType: "finance_down_payment",
        nextStatus: "finance_payment_exception",
        paymentStatus: "Payment exception",
        note: "Payment exception marked",
        allowedStatuses: [
          "sales_contract_created",
          "finance_down_payment_pending",
          "finance_payment_exception",
        ],
      },
      startFinanceFinalCheck: {
        eventType: "finance_final_check_started",
        nextStatus: "finance_final_check",
        paymentStatus: "Finance final check started",
        note: "Finance final check started",
        allowedStatuses: ["audit_approved"],
      },
      requestFinalPayment: {
        eventType: "finance_final_payment",
        nextStatus: "final_payment_requested",
        paymentStatus: "Final payment requested",
        note: "Final payment requested",
        allowedStatuses: ["factory_completed", "final_payment_requested"],
      },
      confirmFinalPayment: {
        eventType: "finance_final_payment",
        nextStatus: "final_payment_received",
        paymentStatus: "Final payment received",
        note: "Final payment received",
        allowedStatuses: ["final_payment_requested"],
      },
      completeFinanceCheck: {
        eventType: "finance_check_completed",
        nextStatus: "branch_manager_review",
        paymentStatus: "Finance check completed",
        note: "Finance check completed",
        allowedStatuses: ["finance_final_check"],
      },
    };
    const actionConfig = financeActionConfig[financeAction];

    if (!actionConfig.allowedStatuses.includes(previousStatus)) {
      return NextResponse.json(
        {
          error:
            "This finance action is not available for the current workflow stage.",
        },
        { status: 400 },
      );
    }

    const { error: financeError } = await admin
      .from("project_finance")
      .upsert(
        {
          project_id: projectId,
          contract_id: contractData.id,
          down_payment_required:
            numberValue(financeData?.down_payment_required) || requiredDownPayment,
          down_payment_received: receivedAmount,
          payment_status: actionConfig.paymentStatus,
          exception_reason:
            financeAction === "markPaymentException" &&
            typeof exceptionReason === "string"
              ? exceptionReason.trim() || null
              : financeData?.exception_reason ?? null,
          confirmed_by: user.id,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );

    if (financeError) {
      throw financeError;
    }

    const { error: workflowError } = await admin
      .from("projects")
      .update({ workflow_status: actionConfig.nextStatus })
      .eq("id", projectId);

    if (workflowError) {
      console.error("[api/workflow] finance workflow update failed", workflowError);
      await rollbackProjectFinance({
        admin,
        projectId,
        previousFinance: financeData
          ? {
              project_id: projectId,
              contract_id: financeData.contract_id,
              down_payment_required: financeData.down_payment_required,
              down_payment_received: financeData.down_payment_received,
              payment_status: financeData.payment_status,
              exception_reason: financeData.exception_reason,
              confirmed_by: financeData.confirmed_by,
              confirmed_at: financeData.confirmed_at,
            }
          : null,
      });

      return NextResponse.json(
        { error: friendlyDatabaseError(workflowError, "Unable to save finance update.") },
        { status: 500 },
      );
    }

    try {
      await insertWorkflowEventWithStage({
        admin,
        payload: {
          project_id: projectId,
          event_type: actionConfig.eventType,
          from_workflow_status: previousStatus,
          to_workflow_status: actionConfig.nextStatus,
          actor_id: user.id,
          notes: actionConfig.note,
          metadata: {
            financeAction,
            contractId: contractData.id,
            contractValue,
            downPaymentRequired: requiredDownPayment,
            downPaymentReceived: receivedAmount,
          },
        },
      });
    } catch (eventError) {
      console.error("[api/workflow] finance event log failed", eventError);

      return NextResponse.json({
        finance: {
          projectId,
          workflowStatus: actionConfig.nextStatus,
          paymentStatus: actionConfig.paymentStatus,
          eventLogWarning: true,
        },
      });
    }

    return NextResponse.json({
      finance: {
        projectId,
        workflowStatus: actionConfig.nextStatus,
        paymentStatus: actionConfig.paymentStatus,
      },
    });
  } catch (error) {
    console.error("[api/workflow] finance action failed", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save finance update.") },
      { status: 500 },
    );
  }
}
