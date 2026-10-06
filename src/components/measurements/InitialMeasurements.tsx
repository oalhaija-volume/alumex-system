"use client";
import { ProjectRecord } from '@/components/workflow/ProjectRecord';
import Link from "next/link";
import { readFieldState } from "@/lib/offline/store";
import { fieldFetch } from "@/lib/offline/client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { normalizeRegistrationOpening, registrationRoomTypes, registrationStructureTypes, type RegistrationOpening, type RegistrationStructure } from "@/lib/measurements/registrationOpening";

const field = "mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
export function InitialMeasurements({projectId}:{projectId:string}) {
  const {t} = useI18n();
  const [project,setProject] = useState<{project_name:string;project_number:string}|null>(null);
  const [openings,setOpenings] = useState<RegistrationOpening[]>([]);
  const [floor,setFloor] = useState("");
  const [room,setRoom] = useState("");
  const [otherRoom,setOtherRoom] = useState("");
  const [width,setWidth] = useState("");
  const [height,setHeight] = useState("");
  const [structuralType,setStructuralType] = useState<RegistrationStructure|"">("");
  const [openingType,setOpeningType] = useState("");
  const [draftId,setDraftId] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [finished,setFinished] = useState(false);
  const endpoint = `/api/initial-measurements/${projectId}`;
  useEffect(()=>{
    const controller = new AbortController();
    fieldFetch(endpoint,{signal:controller.signal}).then(async response=>{
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProject(data.project);setOpenings(data.openings);setFinished(data.project.sales_status !== "new_lead");setDraftId(crypto.randomUUID());
    }).catch(cause=>{if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load measurements.");})
      .finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[endpoint]);
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const opening = normalizeRegistrationOpening({id:draftId,width:Number(width),height:Number(height),structuralType,openingType,floor,room,otherRoom});
    if (!opening) {setError(t("initialStep.invalid"));return;}
    setSaving(true);setError("");setNotice("");
    try {
      const response=await fieldFetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(opening)});
      const data=await response.json();if(!response.ok) throw new Error(data.error);
      setOpenings(current=>current.some(row=>row.id===opening.id)?current:[...current,opening]);
      setFloor("");setRoom("");setOtherRoom("");setWidth("");setHeight("");setStructuralType("");setOpeningType("");setDraftId(crypto.randomUUID());
      setNotice(t("initialStep.saved"));
    } catch(cause) {setError(cause instanceof Error?cause.message:t("initialStep.failed"));}
    finally {setSaving(false);}
  }
  async function updateMeasurementStatus(action: "finish" | "reopen") {
    if (saving) return;
    setSaving(true);setError("");
    try {
      const response = await fieldFetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFinished(data.salesStatus === "ready_for_quotation");setNotice("");
    } catch(cause) {setError(cause instanceof Error ? cause.message : t("initialStep.failed"));}
    finally {setSaving(false);}
  }
  const dirty = Boolean(width || height || structuralType || floor || room || otherRoom);
  return <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-8 sm:py-10">
    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("initialStep.title")}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{project ? `${project.project_name} · ${project.project_number}` : t("initialStep.description")}</p>
    {loading ? <p className="mt-6" role="status">{t("common.loading")}</p> : null}
    {error ? <p role="alert" className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <ProjectRecord projectId={projectId}/>{project && !finished ? <>
      <form onSubmit={save} className="mt-7 rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="mb-5 text-lg font-semibold text-slate-900">{t("initialStep.opening",{number:openings.length+1})}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800">{t("initialStep.floor")}
              <input required maxLength={100} value={floor} onChange={event=>setFloor(event.target.value)} placeholder={t("initialStep.floorPlaceholder")} className={field} />
            </label>
            <label className="block text-sm font-medium text-slate-800">{t("initialStep.room")}
              <select required aria-label={t("initialStep.room")} value={room} onChange={event=>{setRoom(event.target.value);setOtherRoom("");}} className={field}>
                <option value="">{t("initialStep.chooseRoom")}</option>
                {registrationRoomTypes.map(value=><option key={value} value={value}>{t(`initialStep.rooms.${value}`)}</option>)}
              </select>
            </label>
          </div>
          {room === "Other" ? <label className="block text-sm font-medium text-slate-800">{t("initialStep.otherRoom")}
            <input required maxLength={100} value={otherRoom} onChange={event=>setOtherRoom(event.target.value)} className={field} placeholder={t("initialStep.otherRoomPlaceholder")} />
          </label> : null}
          <label className="block text-sm font-medium text-slate-800">{t("initialStep.structure")}
            <select aria-label={t("initialStep.structure")} required className={field} value={structuralType} onChange={event=>{setStructuralType(event.target.value as RegistrationStructure);setOpeningType("");setNotice("");}}>
              <option value="">{t("initialStep.choose")}</option>
              {registrationStructureTypes.map(type=><option key={type} value={type}>{t(`initialStep.types.${type}`)}</option>)}
            </select>
          </label>
          {structuralType === "Window" || structuralType === "Door" ? <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">{t("initialStep.movement")}</legend>
            <div className="grid grid-cols-2 gap-3">{["Sliding","Hinged"].map(type=><label key={type} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${openingType===type?"border-blue-600 bg-blue-50 text-slate-900":"border-slate-300 text-slate-700"}`}>
              <input required type="radio" name="openingType" value={type} checked={openingType===type} onChange={()=>setOpeningType(type)} className="h-4 w-4 accent-blue-600" />{t(`initialStep.${type}`)}
            </label>)}</div>
          </fieldset> : structuralType === "Louver" ? <p className="text-sm text-slate-600">{t("initialStep.louverHelp")}</p> : null}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-800">{t("initialStep.width")}<input required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field} value={width} onChange={event=>setWidth(event.target.value)} /></label>
            <label className="block text-sm font-medium text-slate-800">{t("initialStep.height")}<input required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field} value={height} onChange={event=>setHeight(event.target.value)} /></label>
          </div>
          <button type="submit" className="min-h-12 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving?t("common.loading"):t("initialStep.add")}</button>
        </fieldset>
      </form>
      {notice ? <p role="status" className="mt-4 text-sm text-green-800">{notice}</p>:null}
    </> : null}
    {openings.length ? <div className="mt-7">
      <h2 className="text-base font-semibold text-slate-900">{t("initialStep.list",{count:openings.length})}</h2>
      <ol className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">{openings.map((opening,index)=><li key={opening.id} className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
        <span className="font-medium text-slate-900">{index+1}. {t(`initialStep.types.${opening.structuralType}`)}{opening.openingType ? ` · ${t(`initialStep.${opening.openingType}`)}`:""}</span>
        <span className="w-full text-slate-500">{opening.floor} · {opening.room === "Other" ? opening.otherRoom : t(`initialStep.rooms.${opening.room}`)}</span>
        <span className="text-slate-600">{opening.width} × {opening.height} {t("initialStep.cm")}</span>
      </li>)}</ol>
      {!finished ? <><button type="button" disabled={saving || dirty} onClick={()=>void updateMeasurementStatus("finish")} className="mt-5 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">{saving ? t("common.loading") : t("initialStep.finish")}</button>{dirty ? <p className="mt-2 text-xs text-slate-500">{t("initialStep.unsaved")}</p>:null}</>:null}
    </div>:null}
    {finished ? <div role="status" className="mt-6 space-y-4"><p className="text-slate-700">{t("initialStep.done")}</p><button disabled={saving} onClick={()=>void updateMeasurementStatus("reopen")} className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold">{saving ? t("common.loading") : t("initialStep.reopen")}</button><Link href={`/quotation/${projectId}`} onClick={async event=>{event.preventDefault();const state=await readFieldState();if(!navigator.onLine || state?.queue.some(c=>c.projectId===projectId)){setError("Your measurements are saved on this device. Wait for synchronization before preparing a quotation.");return;}window.location.assign(`/quotation/${projectId}`);}} className="block min-h-12 rounded-md bg-blue-600 px-5 py-3 text-center font-semibold text-white">Continue to quotation</Link><Link href="/intake" className="block text-sm font-semibold text-blue-600">{t("registration.another")}</Link></div>:null}
  </section>;
}
