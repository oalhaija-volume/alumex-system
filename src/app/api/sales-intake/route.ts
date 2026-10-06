import { NextResponse } from "next/server";
import { notifyMeasurementAssignment, validateOutdoorAssignee } from "@/lib/measurements/assignment";
import { requireRole } from "@/lib/auth/adminServer";
import {
  friendlyDatabaseError,
  isDuplicateError,
  isOutdoorSiteDuplicateError,
} from "@/lib/friendlyErrors";
import { generateNextProjectNumber } from "@/lib/projects/numbering";
import { intakeCompanyName } from "@/lib/intake/companyName";
import {
  normalizeGeofenceRadius,
  outdoorSiteDuplicateRadiusMeters,
  parseProjectLocation,
} from "@/lib/location/coordinates";
import {
  readinessNeedsFollowUp,
  type StructureReadiness,
} from "@/lib/intake/nextStage";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const intakeRoles = ["Admin", "Indoor Sales", "Outdoor Sales"] as const;
const sourceValues = new Set([
  "outdoor_sales",
  "showroom_walk_in",
  "existing_client",
  "referral",
  "phone_inquiry",
  "website",
  "social_media",
  "management_referral",
  "other",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IntakeContact = {
  contactType?: unknown;
  contactName?: unknown;
  roleTitle?: unknown;
  mobile?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  isPrimary?: unknown;
};

type IntakeBody = {
  registrationMode?: unknown;
  existingClientId?: unknown;
  client?: {
    clientType?: unknown;
    clientName?: unknown;
    companyName?: unknown;
    mobile?: unknown;
    whatsapp?: unknown;
    email?: unknown;
    preferredLanguage?: unknown;
    address?: unknown;
    province?: unknown;
    city?: unknown;
    locationLatitude?: unknown;
    locationLongitude?: unknown;
    notes?: unknown;
  };
  contacts?: unknown;
  project?: {
    projectName?: unknown;
    outdoorSalesId?: unknown;
    branch?: unknown;
    projectType?: unknown;
    address?: unknown;
    locationLatitude?: unknown;
    locationLongitude?: unknown;
    geofenceRadiusMeters?: unknown;
    source?: unknown;
    structureReadiness?: unknown;
    followUpAt?: unknown;
    priority?: unknown;
    estimatedValue?: unknown;
    engineerName?: unknown;
    consultantName?: unknown;
    contractorName?: unknown;
    notes?: unknown;
  };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function nextProjectNumber() {
  const admin = createAdminClient();
  const date = new Date();
  const prefix = `PRJ-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-`;
  const { data, error } = await admin
    .from("projects")
    .select("project_number")
    .like("project_number", `${prefix}%`);

  if (error) throw error;
  return generateNextProjectNumber({
    projectNumbers: (data ?? []).map((row) => row.project_number),
  });
}

export async function GET() {
  const auth = await requireRole(["Admin", "Indoor Sales"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json({ error: supabaseServiceRoleError }, { status: 500 });
  }
  const { data, error } = await createAdminClient().from("profiles")
    .select("id, full_name, email, status")
    .eq("role", "Outdoor Sales").eq("is_active", true).order("full_name");
  if (error) return NextResponse.json({ error: "Unable to load Outdoor Sales employees." }, { status: 500 });
  return NextResponse.json({ assignees: (data ?? []).filter(person => person.status !== "Inactive")
    .map(person => ({ id: person.id, name: person.full_name?.trim() || person.email })) });
}

export async function POST(request: Request) {
  const auth = await requireRole(intakeRoles);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json({ error: supabaseServiceRoleError }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as IntakeBody | null;
  const project = body?.project;
  const existingClientId = text(body?.existingClientId);
  const client = body?.client;
  const isOutdoor = auth.role === "Outdoor Sales";
  const simpleRegistration = body?.registrationMode === "simple";
  const minimal = isOutdoor || simpleRegistration;
  const projectName = text(project?.projectName) || (minimal ? text(client?.clientName) : "");
  const branch = text(project?.branch);
  const projectType = text(project?.projectType);
  const address = text(project?.address) || (minimal ? `${project?.locationLatitude}, ${project?.locationLongitude}` : "");
  const source = isOutdoor ? "outdoor_sales" : text(project?.source) || (simpleRegistration ? "showroom_walk_in" : "");
  const readiness = text(project?.structureReadiness);
  const projectLocation = parseProjectLocation(
    project?.locationLatitude,
    project?.locationLongitude,
  );
  const clientType = text(client?.clientType) || (minimal ? "individual" : "");
  const companyLocation = parseProjectLocation(
    client?.locationLatitude,
    client?.locationLongitude,
  );

  if (
    !projectName ||
    (!minimal && !projectType) ||
    !address ||
    ((!minimal || branch) && !["Rasafa", "Karkh"].includes(branch)) ||
    !sourceValues.has(source) ||
    !["ready", "partially_ready", "not_ready"].includes(readiness)
  ) {
    return NextResponse.json(
      { error: "Complete all required project and readiness fields." },
      { status: 400 },
    );
  }
  if (minimal && !projectLocation.isValid) {
    return NextResponse.json(
      {
        error:
          "Save the project location using a map pin or current location.",
      },
      { status: 400 },
    );
  }

  if (!existingClientId) {
    if (
      !client ||
      !text(client.clientName) ||
      !text(client.mobile) ||
      !["individual", "company"].includes(clientType)
    ) {
      return NextResponse.json(
        { error: "Complete all required client fields." },
        { status: 400 },
      );
    }
    if (clientType === "company" && !companyLocation.isValid) {
      return NextResponse.json(
        {
          error:
            "Add the company location using a map pin or current location.",
        },
        { status: 400 },
      );
    }
  } else if (!uuidPattern.test(existingClientId)) {
    return NextResponse.json({ error: "Select a valid client." }, { status: 400 });
  }

  const typedReadiness = readiness as StructureReadiness;
  const needsReadinessFollowUp = readinessNeedsFollowUp(typedReadiness);
  const followUpAt = needsReadinessFollowUp
    ? text(project?.followUpAt) || (minimal ? new Date(Date.now() + 86400000).toISOString() : "")
    : "";
  const followUpTime = Date.parse(followUpAt);
  if (
    needsReadinessFollowUp &&
    (!followUpAt ||
      !Number.isFinite(followUpTime) ||
      followUpTime <= Date.now())
  ) {
    return NextResponse.json(
      { error: "Select a future Indoor Sales follow-up date and time." },
      { status: 400 },
    );
  }
  const followUpDueAt = needsReadinessFollowUp
    ? new Date(followUpTime).toISOString()
    : null;

  const admin = createAdminClient();
  const outdoorSalesId = isOutdoor ? auth.user.id : simpleRegistration ? "" : text(project?.outdoorSalesId);
  const assigneeError = simpleRegistration && !isOutdoor ? null : await validateOutdoorAssignee(admin, outdoorSalesId);
  if (assigneeError) return NextResponse.json({ error: assigneeError }, { status: 400 });
  let assignmentWarning: string | undefined;
  let clientId = existingClientId;
  let operation = "create-client";

  try {
    if (!clientId && client) {
      const emailKey = text(client.email).toLowerCase();
      const { data: savedClient, error: clientError } = await admin
        .from("clients")
        .insert({
          client_name: text(client.clientName),
          client_type: clientType as "individual" | "company",
          company_name: intakeCompanyName(
            clientType,
            text(client.clientName),
            text(client.companyName),
          ),
          mobile: text(client.mobile),
          whatsapp: text(client.whatsapp) || null,
          address: text(client.address) || null,
          province: text(client.province) || null,
          city: text(client.city) || null,
          location_latitude:
            clientType === "company" ? companyLocation.latitude : null,
          location_longitude:
            clientType === "company" ? companyLocation.longitude : null,
          email: emailKey || null,
          notes: text(client.notes) || null,
          preferred_language: text(client.preferredLanguage) === "en" ? "en" : "ar",
          created_by: auth.user.id,
        })
        .select("id")
        .single();

      if (clientError) throw clientError;
      clientId = savedClient.id;
    }

    const estimatedValueRaw = Number(project?.estimatedValue);
    const estimatedValue =
      Number.isFinite(estimatedValueRaw) && estimatedValueRaw >= 0
        ? estimatedValueRaw
        : null;
    operation = "generate-project-number";
    const projectNumber = await nextProjectNumber();
    const canMeasureNow = readiness !== "not_ready";
    const department =
      readiness === "not_ready"
        ? "indoor_sales"
        : auth.role === "Outdoor Sales"
        ? "outdoor_sales"
        : auth.role === "Sales Manager"
          ? "sales_management"
          : "indoor_sales";
    operation = "create-project";
    const { data: savedProject, error: projectError } = await admin
      .from("projects")
      .insert({
        project_number: projectNumber,
        project_name: projectName,
        client_id: clientId,
        address,
        location_latitude: projectLocation.latitude,
        location_longitude: projectLocation.longitude,
        geofence_radius_meters:
          auth.role === "Outdoor Sales"
            ? outdoorSiteDuplicateRadiusMeters
            : normalizeGeofenceRadius(project?.geofenceRadiusMeters),
        project_type: projectType || null,
        branch: (branch || null) as "Rasafa" | "Karkh" | null,
        status: canMeasureNow ? "Measuring" : "Draft",
        sales_status:
          canMeasureNow
            ? "measurement_required"
            : "waiting_for_follow_up",
        structure_readiness: typedReadiness,
        expected_structure_ready_date: null,
        next_follow_up_at: followUpDueAt,
        original_source: source as
          | "outdoor_sales"
          | "showroom_walk_in"
          | "existing_client"
          | "referral"
          | "phone_inquiry"
          | "website"
          | "social_media"
          | "management_referral"
          | "other",
        original_creator_id: auth.user.id,
        original_creator_role: auth.role,
        owner_id: auth.user.id,
        responsible_user_id:
          readiness === "not_ready" ? null : auth.user.id,
        responsible_department: department,
        priority: ["low", "normal", "high", "urgent"].includes(text(project?.priority))
          ? (text(project?.priority) as "low" | "normal" | "high" | "urgent")
          : "normal",
        estimated_value: estimatedValue,
        engineer_name: text(project?.engineerName) || null,
        consultant_name: text(project?.consultantName) || null,
        contractor_name: text(project?.contractorName) || null,
        project_notes: text(project?.notes) || null,
        sales_engineer_id: auth.user.id,
        created_by: auth.user.id,
      })
      .select("id, project_number")
      .single();

    if (projectError) throw projectError;

    if (needsReadinessFollowUp) {
      operation = "create-follow-up";
      const reminderAt = new Date(
        Math.max(Date.now(), followUpTime - 24 * 60 * 60 * 1000),
      ).toISOString();
      const { error: followUpError } = await admin
        .from("follow_up_tasks")
        .insert({
          client_id: clientId,
          project_id: savedProject.id,
          task_type: "structure_readiness",
          owner_id: auth.user.id,
          assigned_to: null,
          due_at: followUpDueAt!,
          reminder_at: reminderAt,
          interval_source: "structure_readiness",
          deduplication_key: `intake-structure-readiness:${savedProject.id}`,
          created_by: auth.user.id,
        });

      if (followUpError) throw followUpError;
    }

    operation = "assign-outdoor-sales";
    if (canMeasureNow && minimal) {
      const { error: requestError } = await admin.from("measurement_requests").insert({
        project_id: savedProject.id,
        requested_by: auth.user.id,
        assigned_to: auth.user.id,
        status: "assigned",
        instructions: "Capture initial structural opening measurements.",
        assigned_at: new Date().toISOString(),
      });
      if (requestError) throw requestError;
      const { error: statusError } = await admin.from("projects").update({
        sales_status: "measurement_assigned",
        responsible_user_id: auth.user.id,
        responsible_department: isOutdoor ? "outdoor_sales" : "indoor_sales",
      }).eq("id", savedProject.id);
      if (statusError) throw statusError;
    } else if (canMeasureNow) {
      const { data: measurementRequest, error: measurementError } = await admin.rpc(
        "create_measurement_request", {
          target_project_id: savedProject.id,
          target_assignee_id: outdoorSalesId,
          request_instructions: "Collect initial structural opening measurements.",
          actor_user_id: auth.user.id,
        },
      );
      if (measurementError) throw measurementError;
      if (measurementRequest) assignmentWarning = await notifyMeasurementAssignment(measurementRequest);
    } else if (outdoorSalesId) {
      const { error: assignmentError } = await admin.from("project_assignments").insert({
        project_id: savedProject.id,
        assignment_type: "measurement",
        assignee_id: outdoorSalesId,
        assigned_by: auth.user.id,
        reason: "Initial measurement assignee selected during intake; awaiting site readiness",
      });
      if (assignmentError) throw assignmentError;
    }

    const contacts = Array.isArray(body?.contacts)
      ? (body.contacts as IntakeContact[])
      : [];
    const contactRows = contacts
      .map((contact, index) => ({
        client_id: clientId,
        project_id: savedProject.id,
        contact_type: text(contact.contactType) || "other",
        contact_name: text(contact.contactName),
        role_title: text(contact.roleTitle) || null,
        mobile: text(contact.mobile) || null,
        whatsapp: text(contact.whatsapp) || null,
        email: text(contact.email).toLowerCase() || null,
        is_primary: contact.isPrimary === true || index === 0,
        created_by: auth.user.id,
      }))
      .filter(
        (contact) =>
          contact.contact_name &&
          (contact.mobile || contact.whatsapp || contact.email),
      )
      .map((contact, index) => ({ ...contact, is_primary: index === 0 }));

    if (contactRows.length > 0) {
      operation = "create-contacts";
      const { error: contactsError } = await admin
        .from("client_contacts")
        .insert(contactRows);
      if (contactsError) throw contactsError;
    }

    operation = "record-audit-event";
    await admin.from("audit_events").insert({
      actor_id: auth.user.id,
      actor_role: auth.role,
      action: "sales_intake_created",
      entity_type: "project",
      entity_id: savedProject.id,
      new_value: {
        client_id: clientId,
        project_number: savedProject.project_number,
        source,
        structure_readiness: readiness,
        outdoor_sales_id: outdoorSalesId,
        follow_up_at: followUpDueAt,
      },
    });

    return NextResponse.json(
      {
        clientId,
        projectId: savedProject.id,
        projectNumber: savedProject.project_number,
        warning: assignmentWarning,
        nextPath: minimal
          ? canMeasureNow ? `/site-measurements/${savedProject.id}` : "/dashboard?intake=crm"
          : `/projects/${savedProject.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    const databaseCode =
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && /^[A-Z0-9]+$/.test(error.code)
        ? error.code
        : "UNKNOWN";
    console.error("[api/sales-intake] save failed", {
      operation,
      code: databaseCode,
      message: error && typeof error === "object" && "message" in error ? error.message : "Unknown error",
    });
    if (isOutdoorSiteDuplicateError(error)) {
      return NextResponse.json(
        {
          error:
            "Outdoor Sales already registered an active project within 200 m of this site. Open the existing project or contact your manager.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          `Unable to save the sales intake. Reference: ${operation}/${databaseCode}.`,
          isDuplicateError(error) ? "A duplicate record already exists." : undefined,
        ),
      },
      { status: isDuplicateError(error) ? 409 : 500 },
    );
  }
}
