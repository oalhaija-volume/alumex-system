"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type SalesProfile = {
  project: {
    original_source: string;
    original_creator_id: string | null;
    original_creator_role: string | null;
    owner_id: string | null;
    responsible_user_id: string | null;
    responsible_department: string;
    sales_status: string;
    structure_readiness: string;
    expected_structure_ready_date: string | null;
    priority: string;
    estimated_value: number | null;
    engineer_name: string | null;
    consultant_name: string | null;
    contractor_name: string | null;
  };
  contacts: Array<{
    id: string;
    contact_name: string;
    role_title: string | null;
    mobile: string | null;
    email: string | null;
    is_primary: boolean;
  }>;
  statusHistory: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    changed_by: string | null;
    reason: string | null;
    created_at: string;
  }>;
  ownershipHistory: Array<{
    id: string;
    previous_owner_id: string | null;
    new_owner_id: string | null;
    changed_by: string | null;
    reason: string;
    created_at: string;
  }>;
  profileNames: Record<string, string>;
};

export function ProjectSalesProfile({ projectId }: { projectId: string }) {
  const { formatDate, t, term } = useI18n();
  const [profile, setProfile] = useState<SalesProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/sales-profile`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | (SalesProfile & { error?: string })
          | null;
        if (!response.ok || !body) throw new Error(body?.error ?? "Unable to load.");
        setProfile(body);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load.");
      });
    return () => controller.abort();
  }, [projectId]);

  if (error) {
    return <p className="border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</p>;
  }
  if (!profile) {
    return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  }
  const project = profile.project;
  const name = (id: string | null) =>
    id ? profile.profileNames[id] ?? id : t("common.notAdded");

  return (
    <section className="space-y-5 border-t border-slate-200 pt-6">
      <h2 className="text-xl font-extrabold text-slate-950">{t("intake.profile.title")}</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t("intake.summary.creator"), name(project.original_creator_id)],
          [t("intake.summary.owner"), name(project.owner_id)],
          [t("intake.profile.responsibility"), name(project.responsible_user_id)],
          [t("intake.fields.source"), t(`intake.sources.${project.original_source}`)],
          [t("intake.fields.readiness"), t(`intake.readiness.${project.structure_readiness}`)],
          [t("intake.profile.salesStatus"), term(project.sales_status)],
          [t("intake.fields.priority"), t(`intake.priority.${project.priority}`)],
          [t("intake.fields.estimatedValue"), project.estimated_value?.toLocaleString() ?? t("common.notAdded")],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-slate-200 pb-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 text-sm font-bold text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">{t("intake.profile.contacts")}</h3>
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {profile.contacts.length ? profile.contacts.map((contact) => (
              <div key={contact.id} className="py-3 text-sm">
                <p className="font-bold text-slate-950">{contact.contact_name}{contact.is_primary ? ` — ${t("intake.profile.primary")}` : ""}</p>
                <p className="mt-1 text-slate-500">{[contact.role_title, contact.mobile, contact.email].filter(Boolean).join(" · ")}</p>
              </div>
            )) : <p className="py-3 text-sm text-slate-500">{t("common.notAdded")}</p>}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">{t("intake.profile.history")}</h3>
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {[...profile.statusHistory, ...profile.ownershipHistory]
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .slice(0, 8)
              .map((item) => (
                <div key={item.id} className="py-3 text-sm">
                  <p className="font-bold text-slate-950">{"new_status" in item ? term(item.new_status) : `${name(item.previous_owner_id)} → ${name(item.new_owner_id)}`}</p>
                  <p className="mt-1 text-slate-500">{formatDate(new Date(item.created_at))}{item.reason ? ` · ${item.reason}` : ""}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
