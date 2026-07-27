import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.ALUMEX_TEST_SUPABASE_URL;
const serviceKey = process.env.ALUMEX_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.ALUMEX_TEST_ANON_KEY;
const destructiveEnabled =
  process.env.ALUMEX_ENABLE_DESTRUCTIVE_DB_TESTS === "true";
const canRun = Boolean(url && serviceKey && anonKey && destructiveEnabled);

test(
  "disposable Supabase enforces project visibility and commercial separation",
  { skip: canRun ? false : "Disposable Supabase credentials are not configured." },
  async (context) => {
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Alumex-E2E-${suffix}!`;
    const indoorEmail = `indoor-${suffix}@example.invalid`;
    const outdoorEmail = `outdoor-${suffix}@example.invalid`;
    const createdUserIds = [];
    let clientId = "";
    const projectIds = [];

    context.after(async () => {
      if (projectIds.length) {
        await service.from("projects").delete().in("id", projectIds);
      }
      if (clientId) {
        await service.from("clients").delete().eq("id", clientId);
      }
      for (const userId of createdUserIds) {
        await service.auth.admin.deleteUser(userId);
      }
    });

    const [{ data: indoorAuth, error: indoorError }, { data: outdoorAuth, error: outdoorError }] =
      await Promise.all([
        service.auth.admin.createUser({
          email: indoorEmail,
          password,
          email_confirm: true,
        }),
        service.auth.admin.createUser({
          email: outdoorEmail,
          password,
          email_confirm: true,
        }),
      ]);
    assert.ifError(indoorError);
    assert.ifError(outdoorError);
    const indoorId = indoorAuth.user.id;
    const outdoorId = outdoorAuth.user.id;
    createdUserIds.push(indoorId, outdoorId);

    const { error: profileError } = await service.from("profiles").upsert([
      {
        id: indoorId,
        email: indoorEmail,
        full_name: "Phase 8 Indoor",
        role: "Indoor Sales",
        is_active: true,
        status: "Active",
      },
      {
        id: outdoorId,
        email: outdoorEmail,
        full_name: "Phase 8 Outdoor",
        role: "Outdoor Sales",
        is_active: true,
        status: "Active",
      },
    ]);
    assert.ifError(profileError);

    const { data: client, error: clientError } = await service
      .from("clients")
      .insert({ client_name: `Phase 8 ${suffix}`, created_by: indoorId })
      .select("id")
      .single();
    assert.ifError(clientError);
    clientId = client.id;

    const { data: projects, error: projectError } = await service
      .from("projects")
      .insert([
        {
          project_number: `P8-I-${suffix}`,
          project_name: "Indoor owned",
          client_id: clientId,
          created_by: indoorId,
          owner_id: indoorId,
          responsible_user_id: indoorId,
        },
        {
          project_number: `P8-O-${suffix}`,
          project_name: "Outdoor originated",
          client_id: clientId,
          created_by: outdoorId,
          original_creator_id: outdoorId,
          sales_engineer_id: outdoorId,
          owner_id: indoorId,
          responsible_user_id: indoorId,
        },
      ])
      .select("id, project_name");
    assert.ifError(projectError);
    projectIds.push(...projects.map((project) => project.id));

    const indoor = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const outdoor = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    assert.ifError(
      (await indoor.auth.signInWithPassword({ email: indoorEmail, password }))
        .error,
    );
    assert.ifError(
      (await outdoor.auth.signInWithPassword({ email: outdoorEmail, password }))
        .error,
    );

    const { data: indoorProjects, error: indoorProjectError } = await indoor
      .from("projects")
      .select("project_name")
      .in("id", projectIds);
    assert.ifError(indoorProjectError);
    assert.equal(indoorProjects.length, 2);

    const { data: outdoorProjects, error: outdoorProjectError } = await outdoor
      .from("projects")
      .select("project_name")
      .in("id", projectIds);
    assert.ifError(outdoorProjectError);
    assert.deepEqual(
      outdoorProjects.map((project) => project.project_name),
      ["Outdoor originated"],
    );

    const { error: commercialError } = await outdoor.rpc(
      "save_quotation_version_with_items",
      {
        p_quotation_id: null,
        p_project_id: projectIds[1],
        p_client_id: clientId,
        p_quotation_discount_percent: 0,
        p_subtotal: 0,
        p_line_discount_total: 0,
        p_quotation_discount_total: 0,
        p_grand_total: 0,
        p_pricing_source: "catalog",
        p_notes: null,
        p_prepared_by_text: null,
        p_client_representative: null,
        p_created_by: outdoorId,
        p_items: [
          {
            opening_code: "W-01",
            width: 100,
            height: 100,
            quantity: 1,
            unit_price: 0,
            discount_percent: 0,
            line_type: "base",
            is_discountable: true,
          },
        ],
      },
    );
    assert.ok(commercialError);
    assert.match(
      commercialError.message,
      /permission denied|cannot create commercial quotations/i,
    );
  },
);
