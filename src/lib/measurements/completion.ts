export type MeasurementCompletion = {note:string;photo:string};
export type MeasurementReport = {id:string;project_id:string;note:string;has_photo:boolean;photo?:string|null;recorded_by:string|null;recorded_by_name:string;recorded_at:string};
export function normalizeMeasurementCompletion(input:Record<string,unknown>):MeasurementCompletion {
 const note=input.note??'',photo=input.photo??'';
 if(typeof note!=='string'||note.trim().length>2000)throw Error('Keep the measurement note under 2,000 characters.');
 if(typeof photo!=='string'||photo.length>700000||(photo!==''&&!/^(?:data:image\/jpeg;base64,\/9j\/|data:image\/png;base64,iVBORw0KGgo)[A-Za-z0-9+/]*={0,2}$/.test(photo)))throw Error('Choose a valid measurement photo.');
 return {note:note.trim(),photo};
}
export function retainMeasurementReport(report:MeasurementReport,cached:MeasurementReport[]):MeasurementReport {
 const previous=cached.find(r=>r.id===report.id&&r.project_id===report.project_id);
 return report.has_photo&&previous?.photo?{...report,photo:previous.photo}:report;
}
