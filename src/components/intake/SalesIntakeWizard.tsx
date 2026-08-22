"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";
import { useProjects } from "@/components/projects/ProjectsProvider";
import {
  intakeMovesDirectlyToMeasurements,
  readinessNeedsFollowUp,
  type StructureReadiness,
} from "@/lib/intake/nextStage";
import { outdoorSiteDuplicateRadiusMeters } from "@/lib/location/coordinates";

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
  companyLatitude: number | null;
  companyLongitude: number | null;
  projectName: string;
  branch: "" | "Rasafa" | "Karkh";
  projectType: string;
  projectAddress: string;
  projectLatitude: number | null;
  projectLongitude: number | null;
  geofenceRadiusMeters: number;
  source: string;
  readiness: StructureReadiness;
  followUpAt: string;
  priority: "low" | "normal" | "high" | "urgent";
  estimatedValue: string;
  engineerName: string;
  consultantName: string;
  contractorName: string;
  notes: string;
};

const initialDraft: IntakeDraft = {
  mode: "existing",
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
  companyLatitude: null,
  companyLongitude: null,
  projectName: "",
  branch: "",
  projectType: "",
  projectAddress: "",
  projectLatitude: null,
  projectLongitude: null,
  geofenceRadiusMeters: outdoorSiteDuplicateRadiusMeters,
  source: "",
  readiness: "ready",
  followUpAt: "",
  priority: "normal",
  estimatedValue: "",
  engineerName: "",
  consultantName: "",
  contractorName: "",
  notes: "",
};

const steps = ["client", "project", "review"] as const;
const measurementSteps = ["client", "project", "measurements"] as const;
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100";
const labelClass = "text-sm font-bold text-slate-700";
const draftKey = "alumex:sales-intake:draft:v2";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\D/g, "");
}

function nextAvailableLocalDateTime() {
  const date = new Date(Date.now() + 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: string;
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
        min={min}
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
  const [clientSearch, setClientSearch] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSite, setIsCheckingSite] = useState(false);
  const selectedClient = clients.find(
    (client) => client.id === draft.existingClientId,
  );
  const sourceDefault =
    role === "Outdoor Sales" ? "outdoor_sales" : "showroom_walk_in";
  const isOutdoorSales = role === "Outdoor Sales";
  const isDirectMeasurement = intakeMovesDirectlyToMeasurements({
    role,
    source: draft.source || sourceDefault,
    readiness: draft.readiness,
  });
  const displayedSteps = isDirectMeasurement ? measurementSteps : steps;
  const hasProjectPin =
    typeof draft.projectLatitude === "number" &&
    Number.isFinite(draft.projectLatitude) &&
    typeof draft.projectLongitude === "number" &&
    Number.isFinite(draft.projectLongitude);
  const hasCompanyPin =
    typeof draft.companyLatitude === "number" &&
    Number.isFinite(draft.companyLatitude) &&
    typeof draft.companyLongitude === "number" &&
    Number.isFinite(draft.companyLongitude);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [draft]);

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

  function validateCurrentStep() {
    if (
      step === 0 &&
      ((draft.mode === "existing" && !draft.existingClientId) ||
        (draft.mode === "new" &&
          (!draft.clientName.trim() ||
            !draft.mobile.trim())))
    ) {
      return t("intake.errors.client");
    }
    if (
      step === 0 &&
      draft.mode === "new" &&
      draft.clientType === "company" &&
      !hasCompanyPin
    ) {
      return t("intake.errors.companyLocation");
    }
    if (
      step === 1 &&
      (!draft.projectName.trim() ||
        !draft.branch ||
        !draft.projectType.trim() ||
        !draft.projectAddress.trim())
    ) {
      return t("intake.errors.project");
    }
    if (step === 1 && isOutdoorSales && !hasProjectPin) {
      return t("intake.errors.location");
    }
    if (
      step === 1 &&
      readinessNeedsFollowUp(draft.readiness) &&
      !draft.followUpAt
    ) {
      return t("intake.errors.readiness");
    }
    return "";
  }

  async function continueStep() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (
      step === 1 &&
      isOutdoorSales &&
      hasProjectPin
    ) {
      setIsCheckingSite(true);
      try {
        const response = await fetch("/api/sales-intake/site-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: draft.projectLatitude,
            longitude: draft.projectLongitude,
          }),
        });
        const result = (await response.json().catch(() => null)) as
          | { duplicate?: boolean; error?: string }
          | null;

        if (!response.ok) {
          setError(result?.error ?? t("intake.errors.locationCheck"));
          return;
        }
        if (result?.duplicate) {
          setError(t("intake.errors.siteDuplicate"));
          return;
        }
      } catch {
        setError(t("intake.errors.locationCheck"));
        return;
      } finally {
        setIsCheckingSite(false);
      }
    }

    if (step === 1 && isDirectMeasurement) {
      await submit();
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
                  locationLatitude: draft.companyLatitude,
                  locationLongitude: draft.companyLongitude,
                }
              : null,
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
            followUpAt:
              readinessNeedsFollowUp(draft.readiness) && draft.followUpAt
                ? new Date(draft.followUpAt).toISOString()
                : null,
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
        nextPath?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.projectId) {
        throw new Error(result?.error ?? t("intake.errors.save"));
      }

      window.localStorage.removeItem(draftKey);
      await Promise.all([refreshClients(), refreshProjects()]);
      router.push(result.nextPath ?? `/projects/${result.projectId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("intake.errors.save"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const sourceLabel = t(`intake.sources.${draft.source || sourceDefault}`);
  const customerName =
    selectedClient?.clientName || draft.companyName || draft.clientName;
  const locationPicker = (
    <ProjectLocationPicker
      latitude={draft.projectLatitude}
      longitude={draft.projectLongitude}
      geofenceRadiusMeters={
        isOutdoorSales
          ? outdoorSiteDuplicateRadiusMeters
          : draft.geofenceRadiusMeters
      }
      onChange={({ latitude, longitude }) =>
        setDraft((current) => ({
          ...current,
          projectLatitude: latitude,
          projectLongitude: longitude,
        }))
      }
      onRadiusChange={
        isOutdoorSales
          ? undefined
          : (radius) => update("geofenceRadiusMeters", radius)
      }
      allowRadiusChange={!isOutdoorSales}
      enableSearch
      title={t("intake.location.title")}
      editableDescription={
        isOutdoorSales
          ? t("intake.location.outdoorRequired")
          : t("intake.location.description")
      }
      radiusDescription={
        isOutdoorSales ? t("intake.location.duplicateRadius") : undefined
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
  );
  const companyLocationPicker = (
    <ProjectLocationPicker
      latitude={draft.companyLatitude}
      longitude={draft.companyLongitude}
      onChange={({ latitude, longitude }) =>
        setDraft((current) => ({
          ...current,
          companyLatitude: latitude,
          companyLongitude: longitude,
        }))
      }
      allowRadiusChange={false}
      showGeofence={false}
      enableSearch
      title={t("intake.companyLocation.title")}
      editableDescription={t("intake.companyLocation.description")}
      mapAriaLabel={t("intake.companyLocation.mapAriaLabel")}
      searchLabel={t("intake.companyLocation.searchLabel")}
      searchPlaceholder={t("intake.location.searchPlaceholder")}
      searchButtonLabel={t("common.search")}
      searchingLabel={t("intake.location.searching")}
      noResultsLabel={t("intake.location.noResults")}
      searchErrorLabel={t("intake.location.searchError")}
      currentLocationLabel={t("intake.location.useCurrentLocation")}
      locatingLabel={t("intake.location.locating")}
      currentLocationErrorLabel={t("intake.location.currentLocationError")}
      onSearchSelect={(address) => update("address", address)}
      onCurrentLocationSelect={({ latitude, longitude }) =>
        setDraft((current) => ({
          ...current,
          address:
            current.address.trim() ||
            `${t("intake.location.gpsAddress")} ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        }))
      }
    />
  );

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          {t("intake.title")}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <strong className="text-slate-900">
            {t("intake.progress.step", {
              current: step + 1,
              total: steps.length,
            })}
          </strong>
          <span aria-hidden="true">•</span>
          <span>{t("intake.progress.time")}</span>
        </div>
      </header>

      {error ? (
        <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_270px]">
        <section className="min-w-0">
          {step === 0 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-950">
                  {t("intake.guided.customerQuestion")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("intake.guided.customerHelp")}
                </p>
              </div>
              <div className="grid overflow-hidden rounded-md border border-slate-300 sm:grid-cols-2">
                {(["existing", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update("mode", mode)}
                    aria-pressed={draft.mode === mode}
                    className={`min-h-12 px-4 text-sm font-bold transition ${
                      draft.mode === mode
                        ? "bg-[var(--alumex-blue)] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {t(`intake.clientMode.${mode}`)}
                  </button>
                ))}
              </div>
              {draft.mode === "existing" ? (
                <div>
                  <Field
                    required
                    label={t("intake.fields.searchClient")}
                    placeholder={t("intake.guided.searchPlaceholder")}
                    value={clientSearch}
                    onChange={setClientSearch}
                  />
                  <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                    {candidates.map((client) => (
                      <button
                        type="button"
                        key={client.id}
                        onClick={() => update("existingClientId", client.id)}
                        className={`flex min-h-14 w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-start text-sm last:border-b-0 ${
                          draft.existingClientId === client.id
                            ? "bg-blue-50 ring-2 ring-inset ring-[var(--alumex-blue)]"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold text-slate-900">{term(client.clientName)}</span>
                        <span className="text-slate-500">{client.mobile}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => update("mode", "new")}
                    className="mt-4 min-h-11 text-sm font-bold text-[var(--alumex-blue)]"
                  >
                    {t("intake.guided.createInstead")}
                  </button>
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
                    <Field required type="tel" label={t("intake.fields.mobile")} value={draft.mobile} onChange={(value) => update("mobile", value)} />
                  </div>
                  {draft.clientType === "company" ? (
                    <div
                      className={
                        hasCompanyPin
                          ? ""
                          : "rounded-lg border-2 border-amber-400"
                      }
                    >
                      {companyLocationPicker}
                    </div>
                  ) : null}
                  <details className="border-y border-slate-200 py-4">
                    <summary className="cursor-pointer text-sm font-bold text-[var(--alumex-blue)]">
                      {t("intake.guided.moreCustomer")}
                    </summary>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {draft.clientType === "company" ? <Field label={t("intake.fields.companyName")} value={draft.companyName} onChange={(value) => update("companyName", value)} /> : null}
                      <Field type="tel" label={t("intake.fields.whatsapp")} value={draft.whatsapp} onChange={(value) => update("whatsapp", value)} />
                      <Field type="email" label={t("intake.fields.email")} value={draft.email} onChange={(value) => update("email", value)} />
                      <label className={labelClass}>{t("intake.fields.language")}<select value={draft.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value as "ar" | "en")} className={inputClass}><option value="ar">العربية</option><option value="en">English</option></select></label>
                      <div className="md:col-span-2"><Field label={t("intake.fields.address")} value={draft.address} onChange={(value) => update("address", value)} /></div>
                      <Field label={t("intake.fields.province")} value={draft.province} onChange={(value) => update("province", value)} />
                      <Field label={t("intake.fields.city")} value={draft.city} onChange={(value) => update("city", value)} />
                    </div>
                  </details>
                </>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("intake.steps.client")}
                  </p>
                  <p className="mt-1 font-extrabold text-slate-950">
                    {term(customerName)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="min-h-11 px-2 text-sm font-bold text-[var(--alumex-blue)]"
                >
                  {t("common.edit")}
                </button>
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-950">
                  {t("intake.guided.opportunityQuestion")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("intake.guided.opportunityHelp")}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field required label={t("intake.fields.projectName")} value={draft.projectName} onChange={(value) => update("projectName", value)} />
                <label className={labelClass}>{t("intake.fields.branch")} *<select value={draft.branch} onChange={(event) => update("branch", event.target.value as IntakeDraft["branch"])} className={inputClass}><option value="">{t("intake.select")}</option><option value="Rasafa">{term("Rasafa")}</option><option value="Karkh">{term("Karkh")}</option></select></label>
                <Field required label={t("intake.fields.projectType")} value={draft.projectType} onChange={(value) => update("projectType", value)} />
                <label className={labelClass}>{t("intake.fields.source")} *<select value={draft.source || sourceDefault} onChange={(event) => update("source", event.target.value)} className={inputClass}>{["outdoor_sales","showroom_walk_in","existing_client","referral","phone_inquiry","website","social_media","management_referral","other"].map((source) => <option key={source} value={source}>{t(`intake.sources.${source}`)}</option>)}</select></label>
                <div className="md:col-span-2"><Field required label={t("intake.fields.projectAddress")} value={draft.projectAddress} onChange={(value) => update("projectAddress", value)} /></div>
              </div>
              <div className={isOutdoorSales && !hasProjectPin ? "rounded-lg border-2 border-amber-400" : ""}>
                {locationPicker}
              </div>
              <fieldset>
                <legend className={labelClass}>
                  {t("intake.guided.siteReady")} *
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  {(["ready", "partially_ready", "not_ready"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update("readiness", value)}
                      aria-pressed={draft.readiness === value}
                      className={`min-h-12 rounded-md border px-4 text-start text-sm font-bold ${
                        draft.readiness === value
                          ? "border-[var(--alumex-blue)] bg-blue-50 text-[var(--alumex-blue)] ring-2 ring-blue-100"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {t(`intake.readiness.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
              {readinessNeedsFollowUp(draft.readiness) ? (
                <div className="max-w-md">
                  <Field required type="datetime-local" min={nextAvailableLocalDateTime()} label={t("intake.fields.followUpAt")} value={draft.followUpAt} onChange={(value) => update("followUpAt", value)} />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {t("intake.guided.followUpHelp")}
                  </p>
                </div>
              ) : null}
              <details className="border-y border-slate-200 py-4">
                <summary className="cursor-pointer text-sm font-bold text-[var(--alumex-blue)]">
                  {t("intake.guided.moreOpportunity")}
                </summary>
                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={labelClass}>{t("intake.fields.priority")}<select value={draft.priority} onChange={(event) => update("priority", event.target.value as IntakeDraft["priority"])} className={inputClass}>{["low","normal","high","urgent"].map((priority) => <option key={priority} value={priority}>{t(`intake.priority.${priority}`)}</option>)}</select></label>
                    <Field type="number" label={t("intake.fields.estimatedValue")} value={draft.estimatedValue} onChange={(value) => update("estimatedValue", value)} />
                    <Field label={t("intake.fields.engineer")} value={draft.engineerName} onChange={(value) => update("engineerName", value)} />
                    <Field label={t("intake.fields.consultant")} value={draft.consultantName} onChange={(value) => update("consultantName", value)} />
                    <Field label={t("intake.fields.contractor")} value={draft.contractorName} onChange={(value) => update("contractorName", value)} />
                    <label className={`${labelClass} md:col-span-2`}>{t("intake.fields.notes")}<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={4} className={`${inputClass} h-auto py-3`} /></label>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <h2 className="text-lg font-extrabold text-slate-950">{t("intake.sections.review")}</h2>
              <dl className="divide-y divide-slate-200 border-y border-slate-200">
                {[
                  [t("intake.steps.client"), selectedClient?.clientName || draft.companyName || draft.clientName],
                  [t("intake.fields.mobile"), selectedClient?.mobile || draft.mobile],
                  [t("intake.fields.projectName"), draft.projectName],
                  [t("intake.fields.branch"), draft.branch],
                  [t("intake.fields.source"), sourceLabel],
                  ...(draft.mode === "new" &&
                  draft.clientType === "company"
                    ? [[
                        t("intake.companyLocation.pin"),
                        hasCompanyPin
                          ? `${draft.companyLatitude?.toFixed(6)}, ${draft.companyLongitude?.toFixed(6)}`
                          : t("common.notAdded"),
                      ]]
                    : []),
                  [t("intake.location.pin"), hasProjectPin ? `${draft.projectLatitude?.toFixed(6)}, ${draft.projectLongitude?.toFixed(6)}` : t("common.notAdded")],
                  [t("intake.fields.readiness"), t(`intake.readiness.${draft.readiness}`)],
                  ...(readinessNeedsFollowUp(draft.readiness)
                    ? [[t("intake.fields.followUpAt"), draft.followUpAt.replace("T", " ")]]
                    : []),
                ].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-bold text-slate-500">{label}</dt><dd className="text-sm font-semibold text-slate-950">{term(value || t("common.notAdded"))}</dd></div>)}
              </dl>
            </div>
          ) : null}
        </section>

        <aside className="h-fit border-t border-slate-200 pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">
            {t("intake.progress.title")}
          </h2>
          <ol className="mt-5 space-y-1">
            {displayedSteps.map((item, index) => (
              <li key={item} className="relative flex gap-3 pb-7 last:pb-0">
                {index < displayedSteps.length - 1 ? (
                  <span className="absolute bottom-0 left-[21px] top-11 w-px bg-slate-200 rtl:left-auto rtl:right-[21px]" />
                ) : null}
                <button
                  type="button"
                  onClick={() => index <= step && setStep(index)}
                  aria-current={index === step ? "step" : undefined}
                  disabled={index > step}
                  className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold ${
                    index <= step
                      ? "border-[var(--alumex-blue)] bg-[var(--alumex-blue)] text-white"
                      : "border-slate-300 bg-white text-slate-500"
                  }`}
                >
                  {index + 1}
                </button>
                <div className="pt-1">
                  <p className="text-sm font-extrabold text-slate-900">
                    {t(`intake.steps.${item}`)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {t(`intake.progress.${item}`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <footer className="fixed bottom-[64px] left-0 right-0 z-20 flex gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:sticky lg:bottom-4 lg:z-10 lg:mb-2 lg:items-center lg:justify-between lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white lg:px-5 lg:py-4 lg:shadow-sm">
        <div aria-live="polite" className="hidden min-w-0 lg:block">
          <p className="text-sm font-bold text-emerald-700">
            {t("intake.actions.autosaved")}
          </p>
          <p className="text-xs text-slate-500">
            {t("intake.actions.autosavedHelp")}
          </p>
        </div>
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 lg:flex lg:w-auto lg:shrink-0 lg:justify-end">
          <button type="button" disabled={step === 0 || isSubmitting} onClick={() => setStep((current) => Math.max(0, current - 1))} className="h-11 min-w-24 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40">{t("intake.actions.back")}</button>
          {step < displayedSteps.length - 1 ? (
            <button type="button" disabled={isCheckingSite || isSubmitting} onClick={() => void continueStep()} className="h-11 min-w-48 rounded-md bg-[var(--alumex-blue)] px-5 text-sm font-bold text-white disabled:opacity-50">
              {isSubmitting
                ? t("common.loading")
                : isCheckingSite
                ? t("intake.actions.checkingLocation")
                : step === 0
                ? t("intake.actions.continueOpportunity")
                : isDirectMeasurement
                ? t("intake.actions.startMeasurements")
                : t("intake.actions.reviewOpportunity")}
            </button>
          ) : (
            <button type="button" disabled={isSubmitting} onClick={() => void submit()} className="h-11 min-w-32 rounded-md bg-[var(--alumex-blue)] px-5 text-sm font-bold text-white disabled:opacity-50">{isSubmitting ? t("common.loading") : t("intake.actions.create")}</button>
          )}
        </div>
      </footer>
    </div>
  );
}
