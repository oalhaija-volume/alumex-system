import "server-only";

import type { AppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type AuditEventInput = {
  actorId: string | null;
  actorRole: AppRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: Json | null;
  newValue?: Json | null;
  reason?: string | null;
  correlationId?: string;
};

export async function appendAuditEvent(input: AuditEventInput) {
  const { error } = await createAdminClient().from("audit_events").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason?.trim() || null,
    correlation_id: input.correlationId,
  });

  if (error) {
    throw new Error(`Unable to append audit event: ${error.message}`);
  }
}
