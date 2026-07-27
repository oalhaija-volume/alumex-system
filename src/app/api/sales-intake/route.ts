import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError, isDuplicateError } from "@/lib/friendlyErrors";
import { generateNextProjectNumber } from "@/lib/projects/numbering";
import {
  normalizeGeofenceRadius,
  parseProjectLocation,
} from "@/lib/location/coordinates";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const intakeRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
] as const;
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
  existingClientId?: unknown;
  duplicateOverrideReason?: unknown;
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
    notes?: unknown;
  };
  contacts?: unknown;
  project?: {
    projectName?: unknown;
    branch?: unknown;
    projectType?: unknown;
    address?: unknown;
    locationLatitude?: unknown;
    locationLongitude?: unknown;
    geofenceRadiusMeters?: unknown;
    source?: unknown;
    structureReadiness?: unknown;
    expectedReadyDate?: unknown;
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

function normalizedPhone(value: unknown) {
  return text(value).replace(/\D/g, "");
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
  const projectName = text(project?.projectName);
  const branch = text(project?.branch);
  const projectType = text(project?.projectType);
  const address = text(project?.address);
  const source = text(project?.source);
  const readiness = text(project?.structureReadiness);
  const projectLocation = parseProjectLocation(
    project?.locationLatitude,
    project?.locationLongitude,
  );

  if (
    !projectName ||
    !projectType ||
    !address ||
    !["Rasafa", "Karkh"].includes(branch) ||
    !sourceValues.has(source) ||
    !["ready", "not_ready"].includes(readiness)
  ) {
    return NextResponse.json(
      { error: "Complete all required project and readiness fields." },
      { status: 400 },
    );
  }
  if (auth.role === "Outdoor Sales" && !projectLocation.isValid) {
    return NextResponse.json(
      {
        error:
          "Outdoor Sales must save the project location using a map pin or current location.",
      },
      { status: 400 },
    );
  }

  if (!existingClientId) {
    if (
      !client ||
      !text(client.clientName) ||
      !text(client.mobile) ||
      !text(client.address) ||
      !["individual", "company"].includes(text(client.clientType)) ||
      (text(client.clientType) === "company" && !text(client.companyName))
    ) {
      return NextResponse.json(
        { error: "Complete all required client fields." },
        { status: 400 },
      );
    }
  } else if (!uuidPattern.test(existingClientId)) {
    return NextResponse.json({ error: "Select a valid client." }, { status: 400 });
  }

  const expectedReadyDate =
    readiness === "not_ready" ? text(project?.expectedReadyDate) : null;
  if (readiness === "not_ready" && !expectedReadyDate) {
    return NextResponse.json(
      { error: "Expected structure-ready date is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  let clientId = existingClientId;

  try {
    if (!clientId && client) {
      const mobileKey = normalizedPhone(client.mobile);
      const emailKey = text(client.email).toLowerCase();
      const { data: candidates, error: duplicateError } = await admin
        .from("clients")
        .select("id, client_name, mobile, email")
        .is("archived_at", null);

      if (duplicateError) throw duplicateError;
      const duplicate = (candidates ?? []).find(
        (candidate) =>
          (mobileKey &&
            normalizedPhone(candidate.mobile) === mobileKey) ||
          (emailKey && text(candidate.email).toLowerCase() === emailKey),
      );
      const overrideReason = text(body?.duplicateOverrideReason);
      const mayOverride =
        auth.role === "Admin" || auth.role === "Sales Manager";

      if (duplicate && (!mayOverride || !overrideReason)) {
        return NextResponse.json(
          {
            error: "A possible duplicate client already exists.",
            duplicateClient: duplicate,
          },
          { status: 409 },
        );
      }

      const { data: savedClient, error: clientError } = await admin
        .from("clients")
        .insert({
          client_name: text(client.clientName),
          client_type: text(client.clientType) as "individual" | "company",
          company_name: text(client.companyName) || null,
          mobile: text(client.mobile),
          whatsapp: text(client.whatsapp) || null,
          address: text(client.address),
          province: text(client.province) || null,
          city: text(client.city) || null,
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
    const projectNumber = await nextProjectNumber();
    const department =
      auth.role === "Outdoor Sales"
        ? "outdoor_sales"
        : auth.role === "Sales Manager"
          ? "sales_management"
          : "indoor_sales";
    const { data: savedProject, error: projectError } = await admin
      .from("projects")
      .insert({
        project_number: projectNumber,
        project_name: projectName,
        client_id: clientId,
        address,
        location_latitude: projectLocation.latitude,
        location_longitude: projectLocation.longitude,
        geofence_radius_meters: normalizeGeofenceRadius(
          project?.geofenceRadiusMeters,
        ),
        project_type: projectType,
        branch: branch as "Rasafa" | "Karkh",
        status: readiness === "ready" ? "Measuring" : "Draft",
        sales_status:
          readiness === "ready" ? "measurement_required" : "structure_not_ready",
        structure_readiness: readiness as "ready" | "not_ready",
        expected_structure_ready_date: expectedReadyDate,
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
        responsible_user_id: auth.user.id,
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
      const { error: contactsError } = await admin
        .from("client_contacts")
        .insert(contactRows);
      if (contactsError) throw contactsError;
    }

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
      },
    });

    return NextResponse.json(
      {
        clientId,
        projectId: savedProject.id,
        projectNumber: savedProject.project_number,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to save the sales intake.",
          isDuplicateError(error) ? "A duplicate record already exists." : undefined,
        ),
      },
      { status: isDuplicateError(error) ? 409 : 500 },
    );
  }
}
