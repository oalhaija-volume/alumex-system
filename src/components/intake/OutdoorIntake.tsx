"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";

export function OutdoorIntake() {
  const { t } = useI18n();
  const router = useRouter();
  const [clientType, setClientType] = useState<"individual" | "company">("individual");
  const [companyLocation, setCompanyLocation] = useState<{latitude:number|null;longitude:number|null}>({latitude:null,longitude:null});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const [readiness, setReadiness] = useState<"ready" | "not_ready" | "">("ready");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (saving) return;
    if (!name.trim() || !phone.trim() || !readiness || location.latitude === null || location.longitude === null) {
      setError(t("mobileIntake.required"));
      return;
    }
    if (clientType === "company" && (companyLocation.latitude === null || companyLocation.longitude === null)) {
      setError(t("registration.companyRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/sales-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationMode: "simple",
          client: { clientType, clientName: name.trim(), mobile: phone.trim(),
            locationLatitude: clientType === "company" ? companyLocation.latitude : null,
            locationLongitude: clientType === "company" ? companyLocation.longitude : null,
          },
          project: {
            projectName: name.trim(),
            locationLatitude: location.latitude,
            locationLongitude: location.longitude,
            structureReadiness: readiness,
          },
        }),
      });
      const result = await response.json() as { error?: string; projectId?: string; nextPath?: string };
      if (!response.ok || !result.projectId) throw new Error(result.error || t("intake.errors.save"));
      if (readiness === "ready") router.push(`/initial-measurements/${result.projectId}`);
      else setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("intake.errors.save"));
    } finally {
      setSaving(false);
    }
  }

  if (saved) return (
    <section className="mx-auto max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-5" role="status">
      <h1 className="text-xl font-bold text-slate-950">{t("registration.saved")}</h1>
      <p className="text-slate-600">{t("registration.savedHelp")}</p>
      <button type="button" onClick={() => { setClientType("individual"); setCompanyLocation({latitude:null,longitude:null}); setName(""); setPhone(""); setLocation({latitude:null,longitude:null}); setReadiness("ready"); setSaved(false); }} className="flex min-h-12 w-full items-center justify-center rounded-md bg-blue-600 px-4 font-semibold text-white">{t("registration.another")}</button>
    </section>
  );

  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("registration.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("registration.description")}</p>
      </header>
      <fieldset disabled={saving} className="min-w-0 space-y-6 rounded-lg bg-white sm:border sm:border-slate-200 sm:p-7">
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-800">{t("registration.clientType")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(["individual", "company"] as const).map(type => <label key={type} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 text-sm ${clientType === type ? "border-blue-600 bg-blue-50/60" : "border-slate-300 bg-white"}`}>
              <input type="radio" name="clientType" value={type} checked={clientType === type} onChange={() => { setClientType(type); setCompanyLocation({latitude:null,longitude:null}); setError(""); }} className="h-4 w-4 accent-blue-600" />
              {t(`registration.${type}`)}
            </label>)}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            {clientType === "company" ? t("registration.companyName") : t("mobileIntake.name")}
            <input required autoComplete={clientType === "company" ? "organization" : "name"} placeholder={clientType === "company" ? t("registration.companyNamePlaceholder") : t("registration.namePlaceholder")} value={name} onChange={event => setName(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            {t("mobileIntake.phone")}
            <input required type="tel" autoComplete="tel" placeholder="07xx xxx xxxx" value={phone} onChange={event => setPhone(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>
        {clientType === "company" ? <ProjectLocationPicker key="company-location"
          latitude={companyLocation.latitude} longitude={companyLocation.longitude} onChange={nextLocation => { setCompanyLocation(nextLocation); setError(""); }}
          compact enableSearch allowRadiusChange={false} showGeofence={false}
          title={t("registration.companyLocation")} editableDescription={t("registration.companyLocationHelp")}
          currentLocationLabel={t("registration.useLocation")}
          searchLabel={t("registration.companyLocation")} searchPlaceholder={t("registration.searchPlaceholder")}
          searchButtonLabel={t("registration.search")} mapAriaLabel={t("registration.companyMap")}
          searchingLabel={t("common.loading")} locatingLabel={t("common.loading")}
          pinPrompt={t("registration.companyPinPrompt")}
        /> : null}
        <ProjectLocationPicker key="project-location" latitude={location.latitude} longitude={location.longitude} onChange={setLocation}
          compact enableSearch allowRadiusChange={false} showGeofence={false}
          title={t("registration.location")} editableDescription=""
          currentLocationLabel={t("registration.useLocation")}
          searchLabel={t("registration.location")} searchPlaceholder={t("registration.searchPlaceholder")}
          searchButtonLabel={t("registration.search")} mapAriaLabel={t("registration.map")}
          searchingLabel={t("common.loading")} locatingLabel={t("common.loading")}
          pinPrompt={t("registration.pinPrompt")}
        />
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-800">{t("registration.readiness")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["ready", "not_ready"] as const).map(value => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${readiness === value ? "border-blue-600 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-400"}`}>
                <input type="radio" name="readiness" value={value} checked={readiness === value} onChange={() => setReadiness(value)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <span><span className="block text-sm font-semibold text-slate-900">{t(`registration.${value}`)}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t(`registration.${value}Help`)}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><span aria-hidden="true">ⓘ</span>{t("registration.audit")}</p>
        {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
        <button type="button" onClick={() => void submit()} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:opacity-50">
          {saving ? t("common.loading") : readiness === "ready" ? t("registration.continue") : t("registration.save")}
          {!saving ? <span aria-hidden="true" className="rtl:rotate-180">→</span> : null}
        </button>
      </fieldset>
    </section>
  );
}
