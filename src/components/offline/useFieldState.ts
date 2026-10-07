"use client";
import { useEffect,useState } from 'react';
import { readFieldState } from '@/lib/offline/store';
import type { FieldState } from '@/lib/offline/types';

export function useFieldState(){
 const [state,setState]=useState<FieldState|null>(null);
 useEffect(()=>{
  let active=true;
  async function refresh(){const saved=await readFieldState().catch(()=>null);if(active)setState(saved);}
  void refresh();window.addEventListener('field-change',refresh);
  return()=>{active=false;window.removeEventListener('field-change',refresh);};
 },[]);
 return state;
}
