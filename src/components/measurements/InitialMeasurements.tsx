"use client";
import { ClientCancellation } from './ClientCancellation';
import { MeasurementDelayNotice } from './MeasurementDelayNotice';
import type { FieldProject } from '@/lib/offline/types';
import { canPrepareQuotation } from '@/lib/auth/permissions';
import { useMobileOutdoor } from "@/components/workflow/MobileOutdoorContext";
import { ProjectRecord } from '@/components/workflow/ProjectRecord';
import Link from "next/link";
import { readFieldState } from "@/lib/offline/store";
import { fieldFetch,isDeviceWorkspace } from "@/lib/offline/client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { normalizeRegistrationOpening, registrationRoomTypes, registrationStructureTypes, type RegistrationOpening, type RegistrationStructure } from "@/lib/measurements/registrationOpening";

const field = "mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
export function InitialMeasurements({projectId,role}:{projectId:string;role?:string}) {
  const mobileOutdoor = useMobileOutdoor();
  const canQuote = canPrepareQuotation(role);
  const {t,term,errorMessage,formatNumber} = useI18n();
  const [project,setProject] = useState<FieldProject|null>(null);
  const [openings,setOpenings] = useState<RegistrationOpening[]>([]);
  const [floor,setFloor] = useState("");
  const [room,setRoom] = useState("");
  const [otherRoom,setOtherRoom] = useState("");
  const [width,setWidth] = useState("");
  const [quantity,setQuantity] = useState("1");
  const [height,setHeight] = useState("");
  const [structuralType,setStructuralType] = useState<RegistrationStructure|"">("");
  const [openingType,setOpeningType] = useState("");
  const [draftId,setDraftId] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [canDelay,setCanDelay] = useState(false);
  const [canCancel,setCanCancel] = useState(false);
  const [delayNote,setDelayNote] = useState('');
  const [finished,setFinished] = useState(false);
  const endpoint = `/api/initial-measurements/${projectId}`;
  useEffect(()=>{
    const controller = new AbortController();
    let version=0;
    async function refresh(){
      const current=++version;
      try{
        const response=await fieldFetch(endpoint,{signal:controller.signal});
        const data=await response.json();
        if(controller.signal.aborted||current!==version)return;
        if(!response.ok)throw new Error(data.error);
        setProject(data.project);setCanDelay(data.canDelayMeasurements===true);setCanCancel(data.canCancelProject===true);setOpenings(data.openings);setFinished(data.project.sales_status!=="new_lead");
        setDraftId(existing=>existing||crypto.randomUUID());setError("");
      }catch(cause){if(!controller.signal.aborted&&current===version)setError(cause instanceof Error?cause.message:"Unable to load measurements.");}
      finally{if(!controller.signal.aborted&&current===version)setLoading(false);}
    }
    void refresh();
    // Saved records may refresh after the form opens. Keep unsaved form inputs intact.
    if(isDeviceWorkspace())window.addEventListener('field-change',refresh);
    return()=>{controller.abort();window.removeEventListener('field-change',refresh);};
  },[endpoint]);
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const opening = normalizeRegistrationOpening({id:draftId,quantity:Number(quantity),width:Number(width),height:Number(height),structuralType,openingType,floor,room,otherRoom});
    if (!opening) {setError(t("initialStep.invalid"));return;}
    setSaving(true);setError("");setNotice("");
    try {
      const response=await fieldFetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(opening)});
      const data=await response.json();if(!response.ok) throw new Error(data.error);
      setOpenings(current=>current.some(row=>row.id===opening.id)?current:[...current,opening]);
      setQuantity("1");setFloor("");setRoom("");setOtherRoom("");setWidth("");setHeight("");setStructuralType("");setOpeningType("");setDraftId(crypto.randomUUID());
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
  async function updateVisit(action:'delay-measurements'|'cancel-project',note=delayNote) {
    if(saving)return;
    setSaving(true);setError('');setNotice('');
    try {
      const response=await fieldFetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,note,...(action==='cancel-project'?{confirmed:true}:{})})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const refreshed=await fieldFetch(endpoint);const data=await refreshed.json();if(!refreshed.ok)throw new Error(data.error);
      setProject(data.project);setCanCancel(data.canCancelProject===true);setFinished(data.project.sales_status!=='new_lead');setDelayNote('');
    }catch(cause){setError(cause instanceof Error?cause.message:t('initialStep.failed'));}
    finally{setSaving(false);}
  }
  const cancelled = project?.sales_status === 'cancelled';
  const dirty = Boolean(quantity !== "1" || width || height || structuralType || floor || room || otherRoom);
  return <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-8 sm:py-10">
    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("initialStep.title")}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{project ? `${project.project_name} · ${term(project.project_number)}` : t("initialStep.description")}</p>
    {loading ? <p className="mt-6" role="status">{t("common.loading")}</p> : null}
    {error ? <p role="alert" className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage(error)}</p> : null}
    <ProjectRecord projectId={projectId} inactive={project?.measurement_delayed||cancelled}/>
    {project && <MeasurementDelayNotice project={project}/>}
    {project?.measurement_delayed && <div className="mt-4 space-y-3 text-sm"><p>{term('Returned to CRM. Indoor Sales will arrange and assign the next measurement visit.')}</p><Link href={canQuote?`/mini-crm#project-${projectId}`:'/dashboard'} className="inline-flex min-h-11 items-center font-semibold text-blue-700">{term(canQuote?'Open CRM':'Back to assignments')}</Link></div>}
    {cancelled && <Link href="/dashboard" className="mt-4 inline-flex min-h-11 items-center font-semibold text-blue-700">{term('Back to dashboard')}</Link>}
    {project && canCancel && <ClientCancellation busy={saving} onSubmit={form=>void updateVisit('cancel-project',String(new FormData(form).get('note')??''))}/>}
    {project && !finished && !project.measurement_delayed && (canDelay && <details className="mt-5 rounded-lg border border-amber-200 bg-white p-4">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-amber-900">{term('Client asked to visit later')}</summary>
      <form aria-label={term('Report client delay')} onSubmit={event=>{event.preventDefault();void updateVisit('delay-measurements');}} className="mt-3">
        <fieldset disabled={saving}>
          <label className="block text-sm font-medium">{term('Client delay note')}<textarea required maxLength={2000} value={delayNote} onChange={event=>setDelayNote(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border border-slate-300 p-3 text-base"/></label>
          <p className="mt-2 text-xs leading-5 text-slate-600">{term('The project returns to CRM. Indoor Sales will assign the next measurement visit.')}</p>
          <button className="mt-4 min-h-12 rounded-md bg-amber-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{term('Mark delayed by client')}</button>
        </fieldset>
      </form>
    </details>)}
    {project && !finished && !project.measurement_delayed ? <>
      <form onSubmit={save} className="mt-7 rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="mb-5 text-lg font-semibold text-slate-900">{t("initialStep.opening",{number:formatNumber(openings.length+1)})}</legend>
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
          <label className="block text-sm font-medium text-slate-800">{term('Number of identical openings')}<input required type="number" inputMode="numeric" min="1" max="10000" step="1" className={field} value={quantity} onChange={event=>setQuantity(event.target.value)} aria-describedby="opening-quantity-help"/></label>
          <p id="opening-quantity-help" className="text-xs leading-5 text-slate-500">{term('Use one entry for openings with the same dimensions, type, floor and room. Record different openings separately.')}</p>
          <button type="submit" className="min-h-12 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving?t("common.loading"):t("initialStep.add")}</button>
        </fieldset>
      </form>
      {notice ? <p role="status" className="mt-4 text-sm text-green-800">{errorMessage(notice)}</p>:null}
    </> : null}
    {openings.length ? <div className="mt-7">
      <h2 id="saved-openings-heading" className="text-base font-semibold text-slate-900">{t("initialStep.list",{count:formatNumber(openings.length)})}</h2>
      <p className="mt-2 text-sm text-slate-600">{term("Total openings")}: {formatNumber(openings.reduce((sum,opening)=>sum+(opening.quantity??1),0))}</p>
      <p id="saved-openings-scroll-hint" className="mt-2 text-xs text-slate-500 sm:hidden">{t("initialStep.tableScrollHint")}</p>
      <div role="region" aria-labelledby="saved-openings-heading" tabIndex={0} className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table className="w-full min-w-[640px] border-collapse text-start text-sm">
          <caption className="sr-only">{t("initialStep.list",{count:formatNumber(openings.length)})}</caption>
          <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
            <tr>
              <th scope="col" className="sticky start-0 z-10 border-e border-slate-200 bg-slate-100 px-3 py-3 text-start">{t("initialStep.number")}</th>
              {["floor","room","structure","movement","width","height","quantity"].map(column=><th key={column} scope="col" className="whitespace-nowrap px-3 py-3 text-start">{t(`initialStep.${column}`)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {openings.map((opening,index)=><tr key={opening.id} className="odd:bg-white even:bg-slate-50">
              <th scope="row" className={`sticky start-0 border-e border-slate-200 px-3 py-3 text-start font-semibold tabular-nums text-slate-700 ${index%2===0?"bg-white":"bg-slate-50"}`}>{formatNumber(index+1)}</th>
              <td className="max-w-40 break-words px-3 py-3 text-slate-700">{term(opening.floor)}</td>
              <td className="max-w-48 break-words px-3 py-3 text-slate-700">{opening.room === "Other" ? opening.otherRoom : t(`initialStep.rooms.${opening.room}`)}</td>
              <td className="px-3 py-3 text-slate-900">{t(`initialStep.types.${opening.structuralType}`)}</td>
              <td className="px-3 py-3 text-slate-700">{opening.openingType ? t(`initialStep.${opening.openingType}`) : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-slate-900"><bdi>{formatNumber(opening.width)}</bdi></td>
              <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-slate-900"><bdi>{formatNumber(opening.height)}</bdi></td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-slate-900">{formatNumber(opening.quantity??1)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!finished && !project?.measurement_delayed ? <><button type="button" disabled={saving || dirty} onClick={()=>void updateMeasurementStatus("finish")} className="mt-5 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">{saving ? t("common.loading") : t("initialStep.finish")}</button>{dirty ? <p className="mt-2 text-xs text-slate-500">{t("initialStep.unsaved")}</p>:null}</>:null}
    </div>:null}
    {!finished&&!cancelled&&!project?.measurement_delayed&&!openings.length&&canQuote&&<Link href={`/quotation/${projectId}`} className="mt-6 block rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{term('Quote facade services or standalone products without window and door openings')}</Link>}
    {finished && !cancelled ? <div role="status" className="mt-6 space-y-4"><p className="text-slate-700">{canQuote ? t("initialStep.done") : term("Measurements submitted. Indoor Sales will prepare the quotation.")}</p><button disabled={saving} onClick={()=>void updateMeasurementStatus("reopen")} className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold">{saving ? t("common.loading") : t("initialStep.reopen")}</button>{!canQuote ? <Link href="/dashboard" className="block min-h-12 rounded-md bg-blue-600 px-5 py-3 text-center font-semibold text-white">{term(mobileOutdoor?"Back to assignments":"Back to dashboard")}</Link> : <Link href={`/quotation/${projectId}`} onClick={async event=>{event.preventDefault();const state=await readFieldState();if(!navigator.onLine || state?.queue.some(c=>c.projectId===projectId)){setError("Your measurements are saved on this device. Wait for synchronization before preparing a quotation.");return;}window.location.assign(`/quotation/${projectId}`);}} className="block min-h-12 rounded-md bg-blue-600 px-5 py-3 text-center font-semibold text-white">{term("Continue to quotation")}</Link>}<Link href="/intake" className="block text-sm font-semibold text-blue-600">{t("registration.another")}</Link></div>:null}
  </section>;
}
