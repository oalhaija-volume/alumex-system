"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";
import { useProjects } from "@/components/projects/ProjectsProvider";

type ContactDraft = {
  contactName: string;
  roleTitle: string;
  mobile: string;
  email: string;
  isPrimary: boolean;
};

type IntakeDraft = {
  mode: "new" | "existing";
  existingClientId: string;
  clientType: "individual" | "company";
  clientName: string;
  companyName: string;
  mobile: string;
  whatsapp: string;
  email: string;
  preferredLanguage: "ar" | "en";
  address: string;
  province: string;
  city: string;
  contacts: ContactDraft[];
  projectName: string;
  branch: "" | "Rasafa" | "Karkh";
  projectType: string;
  projectAddress: string;
  projectLatitude: number | null;
  projectLongitude: number | null;
  geofenceRadiusMeters: number;
  source: string;
  readiness: "ready" | "not_ready";
  expectedReadyDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  estimatedValue: string;
  engineerName: string;
  consultantName: string;
  contractorName: string;
  notes: string;
};

const emptyContact: ContactDraft = {
  contactName: "",
  roleTitle: "",
  mobile: "",
  email: "",
  isPrimary: true,
};

const initialDraft: IntakeDraft = {
  mode: "new",
  existingClientId: "",
  clientType: "individual",
  clientName: "",
  companyName: "",
  mobile: "",
  whatsapp: "",
  email: "",
  preferredLanguage: "ar",
  address: "",
  province: "",
  city: "",
  contacts: [{ ...emptyContact }],
  projectName: "",
  branch: "",
  projectType: "",
  projectAddress: "",
  projectLatitude: null,
  projectLongitude: null,
  geofenceRadiusMeters: 100,
  source: "",
  readiness: "ready",
  expectedReadyDate: "",
  priority: "normal",
  estimatedValue: "",
  engineerName: "",
  consultantName: "",
  contractorName: "",
  notes: "",
};

const steps = ["client", "contacts", "project", "readiness", "review"] as const;
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100";
const labelClass = "text-sm font-bold text-slate-700";
const draftKey = "alumex:sales-intake:draft:v1";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\D/g, "");
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export function SalesIntakeWizard() {
  const router = useRouter();
  const { clients, refreshClients } = useClients();
  const { refreshProjects } = useProjects();
  const { role } = useCurrentRole();
  const { t, term } = useI18n();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(() => {
    if (typeof window === "undefined") return initialDraft;
    try {
      const saved = window.localStorage.getItem(draftKey);
      return saved ? { ...initialDraft, ...JSON.parse(saved) } : initialDraft;
    } catch {
      return initialDraft;
    }
  });
  const [files, setFiles] = useState<File[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedClient = clients.find(
    (client) => client.id === draft.existingClientId,
  );
  const sourceDefault =
    role === "Outdoor Sales" ? "outdoor_sales" : "showroom_walk_in";
  const isOutdoorSales = role === "Outdoor Sales";
  const hasProjectPin =
    typeof draft.projectLatitude === "number" &&
    Number.isFinite(draft.projectLatitude) &&
    typeof draft.projectLongitude === "number" &&
    Number.isFinite(draft.projectLongitude);

  const candidates = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    const mobile = normalize(draft.mobile);
    const email = draft.email.trim().toLowerCase();
    return clients
      .filter((client) => {
        if (draft.mode === "existing" && query) {
          return [client.clientName, client.mobile, client.email]
            .join(" ")
            .toLowerCase()
            .includes(query);
        }
        return (
          (mobile && normalize(client.mobile) === mobile) ||
          (email && client.email.toLowerCase() === email)
        );
      })
      .slice(0, 4);
  }, [clientSearch, clients, draft.email, draft.mobile, draft.mode]);

  function update<K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    setError("");
  }

  function validateCurrentStep() {
    if (
      step === 0 &&
      ((draft.mode === "existing" && !draft.existingClientId) ||
        (draft.mode === "new" &&
          (!draft.clientName.trim() ||
            !draft.mobile.trim() ||
            !draft.address.trim() ||
            (draft.clientType === "company" && !draft.companyName.trim()))))
    ) {
      return t("intake.errors.client");
    }
    if (
      step === 1 &&
      draft.contacts.some(
        (contact) =>
          contact.contactName &&
          !contact.mobile &&
          !contact.email,
      )
    ) {
      return t("intake.errors.contact");
    }
    if (
      step === 2 &&
      (!draft.projectName.trim() ||
        !draft.branch ||
        !draft.projectType.trim() ||
        !draft.projectAddress.trim())
    ) {
      return t("intake.errors.project");
    }
    if (step === 2 && isOutdoorSales && !hasProjectPin) {
      return t("intake.errors.location");
    }
    if (
      step === 3 &&
      draft.readiness === "not_ready" &&
      !draft.expectedReadyDate
    ) {
      return t("intake.errors.readiness");
    }
    return "";
  }

  function continueStep() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/sales-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingClientId:
            draft.mode === "existing" ? draft.existingClientId : null,
          client:
            draft.mode === "new"
              ? {
                  clientType: draft.clientType,
                  clientName: draft.clientName,
                  companyName: draft.companyName,
                  mobile: draft.mobile,
                  whatsapp: draft.whatsapp,
                  email: draft.email,
                  preferredLanguage: draft.preferredLanguage,
                  address: draft.address,
                  province: draft.province,
                  city: draft.city,
                }
              : null,
          contacts: draft.contacts,
          project: {
            projectName: draft.projectName,
            branch: draft.branch,
            projectType: draft.projectType,
            address: draft.projectAddress,
            locationLatitude: draft.projectLatitude,
            locationLongitude: draft.projectLongitude,
            geofenceRadiusMeters: draft.geofenceRadiusMeters,
            source: draft.source || sourceDefault,
            structureReadiness: draft.readiness,
            expectedReadyDate: draft.expectedReadyDate,
            priority: draft.priority,
            estimatedValue: draft.estimatedValue,
            engineerName: draft.engineerName,
            consultantName: draft.consultantName,
            contractorName: draft.contractorName,
            notes: draft.notes,
          },
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        projectId?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.projectId) {
        throw new Error(result?.error ?? t("intake.errors.save"));
      }

      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("category", "general");
        const upload = await fetch(
          `/api/projects/${result.projectId}/attachments`,
          { method: "POST", body: formData },
        );
        if (!upload.ok) {
          const uploadResult = (await upload.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(uploadResult?.error ?? t("intake.errors.attachment"));
        }
      }

      window.localStorage.removeItem(draftKey);
      await Promise.all([refreshClients(), refreshProjects()]);
      router.push(`/projects/${result.projectId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("intake.errors.save"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const ownerLabel = role ? term(role) : t("common.notAdded");
  const sourceLabel = t(`intake.sources.${draft.source || sourceDefault}`);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          {t("intake.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {t("intake.description")}
        </p>
      </header>

      <ol className="grid grid-cols-5 border-b border-slate-200 pb-4">
        {steps.map((item, index) => (
          <li key={item} className="relative text-center">
            {index < steps.length - 1 ? (
              <span className="absolute left-1/2 right-[-50%] top-4 h-px bg-slate-300" />
            ) : null}
            <button
              type="button"
              onClick={() => index <= step && setStep(index)}
              className="relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-extrabold transition"
              style={{
                background: index <= step ? "var(--alumex-blue)" : "white",
                borderColor: index <= step ? "var(--alumex-blue)" : "#cbd5e1",
                color: index <= step ? "white" : "#475569",
              }}
              aria-current={index === step ? "step" : undefined}
            >
              {index + 1}
            </button>
            <span className="mt-2 block truncate text-[11px] font-bold text-slate-700 sm:text-sm">
              {t(`intake.steps.${item}`)}
            </span>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_270px]">
        <section className="min-w-0">
          {step === 0 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.client")}</h2>
              <div className="flex gap-6 border-b border-slate-200 pb-4">
                {(["new", "existing"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <input
                      type="radio"
                      checked={draft.mode === mode}
                      onChange={() => update("mode", mode)}
                    />
                    {t(`intake.clientMode.${mode}`)}
                  </label>
                ))}
              </div>
              {draft.mode === "existing" ? (
                <div>
                  <Field label={t("intake.fields.searchClient")} value={clientSearch} onChange={setClientSearch} />
                  <div className="mt-3 divide-y divide-slate-200 border border-slate-200">
                    {candidates.map((client) => (
                      <button
                        type="button"
                        key={client.id}
                        onClick={() => update("existingClientId", client.id)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm ${
                          draft.existingClientId === client.id ? "bg-blue-50" : "bg-white"
                        }`}
                      >
                        <span className="font-bold text-slate-900">{term(client.clientName)}</span>
                        <span className="text-slate-500">{client.mobile}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-6">
                    {(["individual", "company"] as const).map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <input type="radio" checked={draft.clientType === type} onChange={() => update("clientType", type)} />
                        {t(`intake.clientType.${type}`)}
                      </label>
                    ))}
                  </div>
                  {candidates.length > 0 ? (
                    <div className="border border-amber-300 bg-amber-50 p-4">
                      <p className="text-sm font-extrabold text-amber-900">{t("intake.duplicates.title", { count: candidates.length })}</p>
                      {candidates.map((client) => (
                        <button
                          type="button"
                          key={client.id}
                          onClick={() => setDraft((current) => ({ ...current, mode: "existing", existingClientId: client.id }))}
                          className="mt-3 flex w-full justify-between border-t border-amber-200 pt-3 text-start text-sm"
                        >
                          <span className="font-bold">{term(client.clientName)}</span>
                          <span>{client.mobile}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field required label={t("intake.fields.clientName")} value={draft.clientName} onChange={(value) => update("clientName", value)} />
                    {draft.clientType === "company" ? <Field required label={t("intake.fields.companyName")} value={draft.companyName} onChange={(value) => update("companyName", value)} /> : null}
                    <Field required type="tel" label={t("intake.fields.mobile")} value={draft.mobile} onChange={(value) => update("mobile", value)} />
                    <Field type="tel" label={t("intake.fields.whatsapp")} value={draft.whatsapp} onChange={(value) => update("whatsapp", value)} />
                    <Field type="email" label={t("intake.fields.email")} value={draft.email} onChange={(value) => update("email", value)} />
                    <label className={labelClass}>{t("intake.fields.language")}<select value={draft.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value as "ar" | "en")} className={inputClass}><option value="ar">العربية</option><option value="en">English</option></select></label>
                    <div className="md:col-span-2"><Field required label={t("intake.fields.address")} value={draft.address} onChange={(value) => update("address", value)} /></div>
                    <Field label={t("intake.fields.province")} value={draft.province} onChange={(value) => update("province", value)} />
                    <Field label={t("intake.fields.city")} value={draft.city} onChange={(value) => update("city", value)} />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.contacts")}</h2>
              {draft.contacts.map((contact, index) => (
                <div key={index} className="grid gap-4 border-b border-slate-200 pb-5 md:grid-cols-2">
                  <Field label={t("intake.fields.contactName")} value={contact.contactName} onChange={(value) => update("contacts", draft.contacts.map((item, itemIndex) => itemIndex === index ? { ...item, contactName: value } : item))} />
                  <Field label={t("intake.fields.roleTitle")} value={contact.roleTitle} onChange={(value) => update("contacts", draft.contacts.map((item, itemIndex) => itemIndex === index ? { ...item, roleTitle: value } : item))} />
                  <Field type="tel" label={t("intake.fields.mobile")} value={contact.mobile} onChange={(value) => update("contacts", draft.contacts.map((item, itemIndex) => itemIndex === index ? { ...item, mobile: value } : item))} />
                  <Field type="email" label={t("intake.fields.email")} value={contact.email} onChange={(value) => update("contacts", draft.contacts.map((item, itemIndex) => itemIndex === index ? { ...item, email: value } : item))} />
                  <button type="button" onClick={() => update("contacts", draft.contacts.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-start text-sm font-bold text-red-700">{t("intake.removeContact")}</button>
                </div>
              ))}
              <button type="button" onClick={() => update("contacts", [...draft.contacts, { ...emptyContact, isPrimary: false }])} className="h-11 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">+ {t("intake.addContact")}</button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.project")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field required label={t("intake.fields.projectName")} value={draft.projectName} onChange={(value) => update("projectName", value)} />
                <label className={labelClass}>{t("intake.fields.branch")} *<select value={draft.branch} onChange={(event) => update("branch", event.target.value as IntakeDraft["branch"])} className={inputClass}><option value="">{t("intake.select")}</option><option value="Rasafa">{term("Rasafa")}</option><option value="Karkh">{term("Karkh")}</option></select></label>
                <Field required label={t("intake.fields.projectType")} value={draft.projectType} onChange={(value) => update("projectType", value)} />
                <label className={labelClass}>{t("intake.fields.source")} *<select value={draft.source || sourceDefault} onChange={(event) => update("source", event.target.value)} className={inputClass}>{["outdoor_sales","showroom_walk_in","existing_client","referral","phone_inquiry","website","social_media","management_referral","other"].map((source) => <option key={source} value={source}>{t(`intake.sources.${source}`)}</option>)}</select></label>
                <div className="md:col-span-2"><Field required label={t("intake.fields.projectAddress")} value={draft.projectAddress} onChange={(value) => update("projectAddress", value)} /></div>
                <Field label={t("intake.fields.engineer")} value={draft.engineerName} onChange={(value) => update("engineerName", value)} />
                <Field label={t("intake.fields.consultant")} value={draft.consultantName} onChange={(value) => update("consultantName", value)} />
                <Field label={t("intake.fields.contractor")} value={draft.contractorName} onChange={(value) => update("contractorName", value)} />
              </div>
              <div className={isOutdoorSales && !hasProjectPin ? "rounded-lg border-2 border-amber-400" : ""}>
                <ProjectLocationPicker
                  latitude={draft.projectLatitude}
                  longitude={draft.projectLongitude}
                  geofenceRadiusMeters={draft.geofenceRadiusMeters}
                  onChange={({ latitude, longitude }) =>
                    setDraft((current) => ({
                      ...current,
                      projectLatitude: latitude,
                      projectLongitude: longitude,
                    }))
                  }
                  onRadiusChange={(radius) => update("geofenceRadiusMeters", radius)}
                  enableSearch
                  title={t("intake.location.title")}
                  editableDescription={
                    isOutdoorSales
                      ? t("intake.location.outdoorRequired")
                      : t("intake.location.description")
                  }
                  mapAriaLabel={t("intake.location.mapAriaLabel")}
                  searchLabel={t("intake.location.searchLabel")}
                  searchPlaceholder={t("intake.location.searchPlaceholder")}
                  searchButtonLabel={t("common.search")}
                  searchingLabel={t("intake.location.searching")}
                  noResultsLabel={t("intake.location.noResults")}
                  searchErrorLabel={t("intake.location.searchError")}
                  currentLocationLabel={t("intake.location.useCurrentLocation")}
                  locatingLabel={t("intake.location.locating")}
                  currentLocationErrorLabel={t("intake.location.currentLocationError")}
                  onSearchSelect={(address) => update("projectAddress", address)}
                  onCurrentLocationSelect={({ latitude, longitude }) =>
                    setDraft((current) => ({
                      ...current,
                      projectAddress:
                        current.projectAddress.trim() ||
                        `${t("intake.location.gpsAddress")} ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.readiness")}</h2>
              <fieldset><legend className={labelClass}>{t("intake.fields.readiness")}</legend><div className="mt-2 grid grid-cols-2">{(["ready","not_ready"] as const).map((value) => <button key={value} type="button" onClick={() => update("readiness", value)} className={`h-11 border text-sm font-bold ${draft.readiness === value ? "border-[var(--alumex-blue)] bg-blue-50 text-[var(--alumex-blue)]" : "border-slate-300 bg-white text-slate-700"}`}>{t(`intake.readiness.${value}`)}</button>)}</div></fieldset>
              <div className="grid gap-4 md:grid-cols-2">
                {draft.readiness === "not_ready" ? <Field required type="date" label={t("intake.fields.expectedDate")} value={draft.expectedReadyDate} onChange={(value) => update("expectedReadyDate", value)} /> : null}
                <label className={labelClass}>{t("intake.fields.priority")}<select value={draft.priority} onChange={(event) => update("priority", event.target.value as IntakeDraft["priority"])} className={inputClass}>{["low","normal","high","urgent"].map((priority) => <option key={priority} value={priority}>{t(`intake.priority.${priority}`)}</option>)}</select></label>
                <Field type="number" label={t("intake.fields.estimatedValue")} value={draft.estimatedValue} onChange={(value) => update("estimatedValue", value)} />
                <label className={`${labelClass} md:col-span-2`}>{t("intake.fields.notes")}<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={4} className={`${inputClass} h-auto py-3`} /></label>
              </div>
              <label className="block border border-dashed border-slate-400 p-5 text-sm text-slate-700">
                <span className="font-extrabold text-[var(--alumex-blue)]">{t("intake.attachments.title")}</span>
                <span className="mt-1 block text-xs text-slate-500">{t("intake.attachments.help")}</span>
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} className="mt-3 block w-full text-sm" />
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.review")}</h2>
              <dl className="divide-y divide-slate-200 border-y border-slate-200">
                {[
                  [t("intake.steps.client"), selectedClient?.clientName || draft.companyName || draft.clientName],
                  [t("intake.fields.mobile"), selectedClient?.mobile || draft.mobile],
                  [t("intake.fields.projectName"), draft.projectName],
                  [t("intake.fields.branch"), draft.branch],
                  [t("intake.fields.source"), sourceLabel],
                  [t("intake.location.pin"), hasProjectPin ? `${draft.projectLatitude?.toFixed(6)}, ${draft.projectLongitude?.toFixed(6)}` : t("common.notAdded")],
                  [t("intake.fields.readiness"), t(`intake.readiness.${draft.readiness}`)],
                  [t("intake.attachments.title"), String(files.length)],
                ].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-bold text-slate-500">{label}</dt><dd className="text-sm font-semibold text-slate-950">{term(value || t("common.notAdded"))}</dd></div>)}
              </dl>
            </div>
          ) : null}
        </section>

        <aside className="h-fit border-l border-slate-200 pl-0 xl:pl-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{t("intake.summary.title")}</h2>
          <dl className="mt-4 divide-y divide-slate-200 text-sm">
            <div className="py-3"><dt className="text-slate-500">{t("intake.summary.creator")}</dt><dd className="mt-1 font-bold text-slate-900">{ownerLabel}</dd></div>
            <div className="py-3"><dt className="text-slate-500">{t("intake.summary.owner")}</dt><dd className="mt-1 font-bold text-slate-900">{ownerLabel}</dd></div>
            <div className="py-3"><dt className="text-slate-500">{t("intake.fields.source")}</dt><dd className="mt-1 font-bold text-slate-900">{sourceLabel}</dd></div>
            <div className="py-3"><dt className="text-slate-500">{t("intake.fields.readiness")}</dt><dd className="mt-1 font-bold text-slate-900">{t(`intake.readiness.${draft.readiness}`)}</dd></div>
          </dl>
        </aside>
      </div>

      <footer className="sticky bottom-[72px] z-10 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 py-4 backdrop-blur lg:bottom-0">
        <button type="button" onClick={saveDraft} className="h-11 px-2 text-sm font-bold text-[var(--alumex-blue)]">{t("intake.actions.saveDraft")}</button>
        <div className="flex gap-3">
          <button type="button" disabled={step === 0 || isSubmitting} onClick={() => setStep((current) => Math.max(0, current - 1))} className="h-11 min-w-24 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40">{t("intake.actions.back")}</button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={continueStep} className="h-11 min-w-28 bg-[var(--alumex-blue)] px-5 text-sm font-bold text-white">{t("intake.actions.continue")}</button>
          ) : (
            <button type="button" disabled={isSubmitting} onClick={() => void submit()} className="h-11 min-w-32 bg-[var(--alumex-blue)] px-5 text-sm font-bold text-white disabled:opacity-50">{isSubmitting ? t("common.loading") : t("intake.actions.create")}</button>
          )}
        </div>
      </footer>
    </div>
  );
}
