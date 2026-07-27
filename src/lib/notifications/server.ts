import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type NotificationInput = {
  recipientId: string;
  kind?: "information" | "action_required" | "overdue";
  eventType: string;
  entityType: string;
  entityId?: string | null;
  titleKey: string;
  messageKey: string;
  linkPath?: string | null;
  payload?: Json;
  deduplicationKey?: string | null;
};

export async function createInternalNotification(input: NotificationInput) {
  const { error } = await createAdminClient().from("notifications").insert({
    recipient_id: input.recipientId,
    notification_kind: input.kind ?? "information",
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    title_key: input.titleKey,
    message_key: input.messageKey,
    link_path: input.linkPath ?? null,
    payload: input.payload ?? {},
    deduplication_key: input.deduplicationKey ?? null,
  });

  if (error && error.code !== "23505") {
    throw new Error(`Unable to create notification: ${error.message}`);
  }
}
