"use client";
import {useEffect,useRef,useState} from 'react';
import {useI18n} from '@/components/i18n/I18nProvider';

export function SkylightDrawingPad({value,onChange,disabled=false}:{value:string;onChange:(image:string)=>void;disabled?:boolean}){
 const {term}=useI18n();
 const canvas=useRef<HTMLCanvasElement>(null);
 const pointer=useRef<number|null>(null);
 const history=useRef<string[]>([]);
 const [canUndo,setCanUndo]=useState(false);
 useEffect(()=>{
  const node=canvas.current,ctx=node?.getContext('2d');if(!node||!ctx)return;
  ctx.fillStyle='white';ctx.fillRect(0,0,node.width,node.height);
  let active=true;
  if(value){const image=new Image();image.onload=()=>{if(active)ctx.drawImage(image,0,0,node.width,node.height);};image.src=value;}
  return()=>{active=false;};
 },[value]);
 function point(event:React.PointerEvent<HTMLCanvasElement>){const rect=event.currentTarget.getBoundingClientRect();return {x:(event.clientX-rect.left)*900/rect.width,y:(event.clientY-rect.top)*600/rect.height};}
 function begin(event:React.PointerEvent<HTMLCanvasElement>){
  if(disabled||pointer.current!==null||event.button!==0)return;
  event.preventDefault();const node=event.currentTarget,ctx=node.getContext('2d');if(!ctx)return;
  history.current=[...history.current.slice(-19),value];setCanUndo(true);pointer.current=event.pointerId;node.setPointerCapture(event.pointerId);
  const p=point(event);ctx.strokeStyle='#0f172a';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+0.1,p.y+0.1);ctx.stroke();
 }
 function move(event:React.PointerEvent<HTMLCanvasElement>){
  if(disabled||pointer.current!==event.pointerId)return;
  event.preventDefault();const ctx=event.currentTarget.getContext('2d'),p=point(event);if(ctx){ctx.lineTo(p.x,p.y);ctx.stroke();}
 }
 function end(event:React.PointerEvent<HTMLCanvasElement>){
  if(pointer.current!==event.pointerId)return;
  event.preventDefault();pointer.current=null;onChange(event.currentTarget.toDataURL('image/png'));
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 return <div>
  <p className="mb-2 text-sm text-slate-600">{term('Draw the skylight shape with your finger or stylus. You can write side labels on the sketch.')}</p>
  <canvas ref={canvas} width={900} height={600} aria-label={term('Draw skylight shape')} aria-disabled={disabled} className="block aspect-[3/2] w-full touch-none rounded-lg border-2 border-slate-300 bg-white" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/>
  <div className="mt-3 flex flex-wrap gap-3">
   <button type="button" disabled={disabled||!canUndo} onClick={()=>{onChange(history.current.pop()??'');setCanUndo(history.current.length>0);}} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm disabled:opacity-50">{term('Undo stroke')}</button>
   <button type="button" disabled={disabled||!value} onClick={()=>{history.current=[...history.current.slice(-19),value];setCanUndo(true);onChange('');}} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm disabled:opacity-50">{term('Clear drawing')}</button>
  </div>
 </div>;
}
