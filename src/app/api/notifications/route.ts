import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createClient } from "@/lib/supabase/server";
import { salesRoles } from "@/lib/workflow/access";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const auth = await requireRole(salesRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const client = await createClient();
  // The authenticated RPC delivers only this employee's due reminders and
  // uses the existing unique recipient/deduplication key to handle parallel tabs.
  const reminder = await client.rpc("deliver_due_follow_up_notifications");
  const [items, unread] = await Promise.all([
    client.from("notifications").select("id,title_key,link_path,payload,read_at,created_at")
      .eq("recipient_id", auth.user.id).order("created_at", { ascending: false }).limit(50),
    client.from("notifications").select("id", { count: "exact", head: true })
      .eq("recipient_id", auth.user.id).is("read_at", null),
  ]);
  if (items.error || unread.error) return NextResponse.json({ error: "Unable to load notifications." }, { status: 503, headers });
  return NextResponse.json({ userId: auth.user.id, role: auth.role, notifications: items.data ?? [], unreadCount: unread.count ?? 0, remindersAvailable: !reminder.error }, { headers });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(salesRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const body = await request.json().catch(() => null);
  const validId = typeof body?.notificationId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.notificationId);
  if (!(body?.all === true && body.notificationId === undefined) && !(validId && body.all !== true)) {
    return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400, headers });
  }
  const client = await createClient();
  let query = client.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("recipient_id", auth.user.id).is("read_at", null);
  if (validId) query = query.eq("id", body.notificationId);
  const result = await query;
  return result.error ? NextResponse.json({ error: "Unable to update notifications." }, { status: 503, headers }) : NextResponse.json({ ok: true }, { headers });
}
