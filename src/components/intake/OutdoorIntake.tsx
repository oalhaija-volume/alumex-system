"use client";

import { buildingTypes,buildingTypeLabels,normalizeBuildingType,type BuildingType } from '@/lib/intake/buildingType';
import { useMobileOutdoor } from "@/components/workflow/MobileOutdoorContext";
import { fieldFetch,isFieldOnline,isDeviceWorkspace,prepareOffline } from "@/lib/offline/client";
import { readFieldState } from "@/lib/offline/store";
import type { FieldState } from "@/lib/offline/types";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";
import { canAccessCRM } from '@/lib/auth/permissions';
import Link from "next/link";
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';


export function OutdoorIntake() {
  const mobileOutdoor = useMobileOutdoor();
  const { t, term,errorMessage,formatDateTime } = useI18n();

  const [buildingType,setBuildingType] = useState<BuildingType|''>('');
  const [clientType, setClientType] = useState<"individual" | "company">("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [offlineAddressStarted,setOfflineAddressStarted]=useState(false);
  const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const [readiness, setReadiness] = useState<"ready" | "not_ready" | "">("ready");
  const [readinessNote, setReadinessNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{projectId:string;pending:boolean;registeredBy:string;createdAt?:string}|null>(null);
  const [offline,setOffline]=useState(false);
  const [employeeState,setEmployeeState]=useState<FieldState|null>(null);
  const [assignedOutdoorSalesId,setAssignedOutdoorSalesId]=useState('');
  const addressOnly = employeeState?.actor.role === 'Outdoor Sales' && (offline || offlineAddressStarted);
  const needsReadinessNote = employeeState?.actor.role === 'Outdoor Sales' && readiness === 'not_ready';
  const canAssignMeasurements = canAccessCRM(employeeState?.actor.role);
  const outdoorAssignee = canAssignMeasurements ? assignedOutdoorSalesId || (employeeState?.actor.role === 'Indoor Sales' && employeeState.outdoorSales?.length === 1 ? employeeState.outdoorSales[0].id : '') : '';
  const selfAssigned = employeeState?.actor.role === 'Indoor Sales' && outdoorAssignee === employeeState.actor.id;
  const assignedEmployee = selfAssigned ? employeeState.actor : employeeState?.outdoorSales?.find(employee => employee.id === outdoorAssignee);
  const collectsMeasurements = employeeState?.actor.role === 'Outdoor Sales' || selfAssigned;
  useEffect(()=>{let live=true;const refresh=async()=>{const state=await readFieldState().catch(()=>null);if(live)setEmployeeState(state);};if(isDeviceWorkspace())void refresh();else void prepareOffline().then(refresh).catch(()=>{void refresh();});window.addEventListener('field-change',refresh);return()=>{live=false;window.removeEventListener('field-change',refresh);};},[]);

  useEffect(()=>{const update=()=>setOffline(!isFieldOnline());const timer=setTimeout(update,0);window.addEventListener('field-connection',update);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{clearTimeout(timer);window.removeEventListener('field-connection',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);

  async function submit() {
    if (saving) return;
    if (!employeeState) {
      setError('Employee workspace is still loading. Please try again.');
      return;
    }
    try{normalizeBuildingType(buildingType,employeeState.actor.role==='Outdoor Sales');}catch(cause){setError((cause as Error).message);return;}
    if (!name.trim() || !phone.trim() || !readiness || (!addressOnly && (location.latitude === null || location.longitude === null))) {
      setError(t("mobileIntake.required"));
      return;
    }
    if(addressOnly && !siteAddress.trim()){setError('Enter the project site address.');return;}
    if(employeeState.actor.role==='Indoor Sales'&&!employeeState.actor.branch){setError('Ask Admin to assign your Karkh or Rasafa branch before creating a project.');return;}
    if(employeeState.actor.role==='Indoor Sales'&&!outdoorAssignee){setError('Choose yourself or an Outdoor Sales employee to collect the initial measurements.');return;}
    setSaving(true);
    setError("");
    try {
      const note = normalizeReadinessNote(employeeState.actor.role, readiness, readinessNote);
      const response = await fieldFetch("/api/sales-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationMode: "simple",
          client: { clientType, clientName: name.trim(), mobile: phone.trim() },
          project: {
            projectName: name.trim(),
            ...(employeeState.actor.role==='Outdoor Sales'?{buildingType}:{}),
            assignedOutdoorSalesId: outdoorAssignee||null,
            address: siteAddress.trim(),
            locationLatitude: location.latitude,
            locationLongitude: location.longitude,
            structureReadiness: readiness,
            readinessNote: note,
          },
        }),
      });
      const result = await response.json() as { error?: string; projectId?: string; pending?: boolean };
      if (!response.ok || !result.projectId) throw new Error(result.error || t("intake.errors.save"));
      if ((readiness === 'ready' && !collectsMeasurements) || (readiness === 'not_ready' && !canAccessCRM(employeeState.actor.role))) {
        const registered=(await readFieldState().catch(()=>null))?.projects.find(project=>project.id===result.projectId);
        setSaved({projectId:result.projectId,pending:!!result.pending,registeredBy:registered?.registeredBy??employeeState.actor.name,createdAt:registered?.created_at});
        return;
      }
      if (!result.pending && isFieldOnline() && !isDeviceWorkspace()) window.location.assign(readiness === "ready" ? `/initial-measurements/${result.projectId}` : "/mini-crm");
      else window.location.assign(readiness === "ready" ? `/offline?project=${result.projectId}` : "/offline?path=/mini-crm");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("intake.errors.save"));
    } finally {
      setSaving(false);
    }
  }

  if (saved) return (
    <section className="mx-auto my-8 max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-5" role="status">
      <h1 className="text-xl font-bold text-slate-950">{t("registration.saved")}</h1>
      <p className="text-slate-600">{readiness === 'not_ready' ? term('The project is in the CRM queue. Indoor Sales will follow up until the site is ready for measurements.') : assignedEmployee ? term('The project is assigned to {name} for initial measurements.',{name:assignedEmployee.name}) : term('The project is ready. Outdoor Sales will collect the initial measurements.')}</p>
      <p className="text-sm text-slate-600">{term('Created by')} <bdi>{saved.registeredBy==='Employee'?term('Employee'):saved.registeredBy}</bdi>{saved.createdAt&&<time dateTime={saved.createdAt} dir="ltr" className="mt-1 block w-fit max-w-full">{formatDateTime(saved.createdAt)}</time>}</p>
      {saved.pending && <p className="text-sm text-amber-800">{term('Saved on device · Pending sync')}</p>}
      <Link href={!canAccessCRM(employeeState?.actor.role) ? (saved.pending || offline ? "/offline?path=/dashboard" : "/dashboard") : saved.pending || offline ? '/offline?path=/mini-crm' : `/mini-crm#project-${saved.projectId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">{term(canAccessCRM(employeeState?.actor.role)?'Open follow-ups':mobileOutdoor?'Measurement assignments':'Dashboard')}</Link>
      <button type="button" onClick={() => { setBuildingType(''); setClientType("individual"); setName(""); setPhone(""); setLocation({latitude:null,longitude:null}); setSiteAddress(""); setOfflineAddressStarted(false); setReadiness("ready"); setReadinessNote(''); setAssignedOutdoorSalesId(''); setSaved(null); }} className="flex min-h-12 w-full items-center justify-center rounded-md bg-blue-600 px-4 font-semibold text-white">{t("registration.another")}</button>
    </section>
  );

  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("registration.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("registration.description")}</p>
      </header>
      <fieldset disabled={saving} className="min-w-0 space-y-6 rounded-lg bg-white sm:border sm:border-slate-200 sm:p-7">
        {employeeState?.actor.role==='Outdoor Sales'&&<fieldset>
          <legend className="mb-3 text-sm font-semibold text-slate-900">{term('Building type')} {term('(required)')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">{buildingTypes.map(type=><label key={type} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${buildingType===type?'border-blue-600 bg-blue-50/60 text-slate-900':'border-slate-300 bg-white text-slate-700'}`}>
            <input required type="radio" name="buildingType" value={type} checked={buildingType===type} onChange={()=>{setBuildingType(type);setError('');}} className="h-4 w-4 shrink-0 accent-blue-600"/>
            <span>{term(buildingTypeLabels[type])}</span>
          </label>)}</div>
        </fieldset>}
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-800">{t("registration.clientType")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(["individual", "company"] as const).map(type => <label key={type} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 text-sm ${clientType === type ? "border-blue-600 bg-blue-50/60" : "border-slate-300 bg-white"}`}>
              <input type="radio" name="clientType" value={type} checked={clientType === type} onChange={() => { setClientType(type); setError(""); }} className="h-4 w-4 accent-blue-600" />
              {t(`registration.${type}`)}
            </label>)}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            {clientType === "company" ? t("registration.companyName") : t("mobileIntake.name")}
            <input required maxLength={150} autoComplete={clientType === "company" ? "organization" : "name"} placeholder={clientType === "company" ? t("registration.companyNamePlaceholder") : t("registration.namePlaceholder")} value={name} onChange={event => setName(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            {t("mobileIntake.phone")}
            <input required maxLength={80} type="tel" dir="ltr" autoComplete="tel" placeholder="07xx xxx xxxx" value={phone} onChange={event => setPhone(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>
        {!addressOnly && <ProjectLocationPicker key="project-location" latitude={location.latitude} longitude={location.longitude} onChange={setLocation} onSearchSelect={setSiteAddress}
          compact enableSearch={!offline} allowRadiusChange={false} showGeofence={false}
          title={t("registration.location")} editableDescription=""
          currentLocationLabel={t("registration.useLocation")}
          searchLabel={t("registration.location")} searchPlaceholder={t("registration.searchPlaceholder")}
          searchButtonLabel={t("registration.search")} mapAriaLabel={t("registration.map")}
          searchingLabel={t("common.loading")} locatingLabel={t("common.loading")}
          pinPrompt={t("registration.pinPrompt")}
        />}
        {addressOnly && <div>
          <label className="block text-sm font-medium text-slate-800">{term("Project site address")} {term("(required)")}<input required maxLength={2000} autoComplete="street-address" dir="auto" value={siteAddress} onChange={event=>{setSiteAddress(event.target.value);setOfflineAddressStarted(true);}} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base"/></label>
          <p className="mt-2 text-xs leading-5 text-slate-500">{term("Enter the address or area name. Coordinates are not required for offline registration.")}</p>
        </div>}
        {offline && !addressOnly && <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{term("Offline: map search needs internet. Use device location above, or enter coordinates below.")}</p>
          {[{label:"Project site",value:location,set:setLocation}].map(item=><fieldset key={item.label}><legend className="text-sm font-semibold">{term('{site} coordinates',{site:term(item.label)})}</legend><div className="mt-2 grid grid-cols-2 gap-3">{(["latitude","longitude"] as const).map(axis=><label key={axis} className="text-xs capitalize">{term(axis)}<input aria-label={term('{site} {axis}',{site:term(item.label),axis:term(axis)})} type="number" step="any" min={axis === "latitude"?-90:-180} max={axis === "latitude"?90:180} value={item.value[axis]??""} onChange={event=>item.set(current=>({...current,[axis]:event.target.value===""?null:Number(event.target.value)}))} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base"/></label>)}</div></fieldset>)}
          <label className="block text-sm">{term("Project site address")}<input value={siteAddress} onChange={event=>setSiteAddress(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3"/></label>
        </div>}
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-800">{t("registration.readiness")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["ready", "not_ready"] as const).map(value => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${readiness === value ? "border-blue-600 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-400"}`}>
                <input type="radio" name="readiness" value={value} checked={readiness === value} onChange={() => setReadiness(value)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <span><span className="block text-sm font-semibold text-slate-900">{t(`registration.${value}`)}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{value === 'ready' && employeeState?.actor.role === 'Indoor Sales' ? term(selfAssigned ? 'You will enter the initial measurements.' : 'The assigned employee will collect the initial measurements.') : t(`registration.${value}Help`)}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {needsReadinessNote && <div>
          <label htmlFor="readiness-note" className="block text-sm font-medium text-slate-800">{term('Reason not ready for measurement')} {term('(required)')}</label>
          <p id="readiness-note-help" className="mt-2 text-xs leading-5 text-slate-500">{term('Explain what needs to be completed before measurements can start.')}</p>
          <textarea id="readiness-note" required aria-describedby="readiness-note-help" maxLength={2000} rows={3} dir="auto" value={readinessNote} onChange={event => setReadinessNote(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </div>}
        {canAssignMeasurements && <div><label className="block text-sm font-medium text-slate-800" htmlFor="outdoor-assignee">{term("Measurements by")} {employeeState?.actor.role==='Indoor Sales'?term("(required)"):term("(optional)")}</label>
          <select id="outdoor-assignee" value={outdoorAssignee} onChange={event=>setAssignedOutdoorSalesId(event.target.value)} required={employeeState?.actor.role==='Indoor Sales'} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base"><option value="">{employeeState?.actor.role==='Indoor Sales'?term("Choose who will record the initial measurements."):term("Not assigned")}</option>{employeeState?.actor.role==='Indoor Sales'&&<option value={employeeState.actor.id}>{term('Myself — {name}',{name:employeeState.actor.name==='Employee'?term('Employee'):employeeState.actor.name})}</option>}{employeeState?.outdoorSales?.map(employee=><option key={employee.id} value={employee.id}>{employee.name==='Employee'?term('Employee'):employee.name}</option>)}</select>
          <p className="mt-2 text-xs leading-5 text-slate-500">{employeeState?.actor.role==='Indoor Sales'?term("Choose yourself to enter measurements, or assign an Outdoor Sales employee."):term("Choose an Outdoor Sales employee if someone else will collect the measurements.")}</p>
          {employeeState&&!employeeState.outdoorSales?.length&&<p className="mt-2 text-xs text-amber-800">{term(employeeState.actor.role==='Indoor Sales'?'No active Outdoor Sales employees available. You can enter the measurements yourself.':'No active Outdoor Sales employees available. Add one in Employees and reconnect to refresh this list.')}</p>}
        </div>}
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><span aria-hidden="true">ⓘ</span>{t("registration.audit")}</p>
        {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage(error)}</p> : null}
        <button type="button" disabled={saving || !employeeState} onClick={() => void submit()} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:opacity-50">
          {saving || !employeeState ? t("common.loading") : readiness === "ready" && collectsMeasurements ? t("registration.continue") : t("registration.save")}
          {!saving ? <span aria-hidden="true" className="rtl:rotate-180">→</span> : null}
        </button>
      </fieldset>
    </section>
  );
}
