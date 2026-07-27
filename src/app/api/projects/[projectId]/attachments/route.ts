import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { loadOutdoorSalesProjectIds } from "@/lib/projects/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const attachmentRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
] as const;
const allowedExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);
const allowedCategories = new Set([
  "general",
  "site_photo",
  "drawing",
  "client_document",
  "scope",
  "correspondence",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAttachmentAccess(projectId: string) {
  const auth = await requireRole(attachmentRoles);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }
  if (!uuidPattern.test(projectId)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "A valid project id is required." },
        { status: 400 },
      ),
    };
  }
  if (!hasSupabaseServiceRoleKey()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: supabaseServiceRoleError }, { status: 500 }),
    };
  }
  if (auth.role === "Outdoor Sales") {
    const scope = await loadOutdoorSalesProjectIds(auth.user.id);
    if (scope.error || !scope.ids.has(projectId)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: scope.error ? "Unable to verify project access." : "Assigned project access is required." },
          { status: scope.error ? 500 : 403 },
        ),
      };
    }
  }
  return { ok: true as const, auth };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireAttachmentAccess(projectId);
  if (!access.ok) return access.response;

  const { data, error } = await createAdminClient()
    .from("documents")
    .select("id, file_name, file_type, file_size_bytes, attachment_category, created_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load attachments.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireAttachmentAccess(projectId);
  if (!access.ok) return access.response;

  const formData = await request.formData();
  const file = formData.get("file");
  const requestedCategory = String(formData.get("category") ?? "general");
  const category = allowedCategories.has(requestedCategory)
    ? requestedCategory
    : "general";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Select a file to upload." }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Project attachments must be 25 MB or smaller." },
      { status: 400 },
    );
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) {
    return NextResponse.json(
      { error: "Use a PDF, Office document, JPG, PNG, or WebP file." },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("project-attachments")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: friendlyDatabaseError(uploadError, "Unable to upload attachment.") },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("documents")
    .insert({
      owner_type: "project",
      project_id: projectId,
      file_name: file.name,
      file_type: file.type || extension,
      file_size_bytes: file.size,
      storage_bucket: "project-attachments",
      storage_path: storagePath,
      attachment_category: category as
        | "general"
        | "site_photo"
        | "drawing"
        | "client_document"
        | "scope"
        | "correspondence",
      uploaded_by: access.auth.user.id,
    })
    .select("id, file_name, file_type, file_size_bytes, attachment_category, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to record attachment.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ attachment: data }, { status: 201 });
}
