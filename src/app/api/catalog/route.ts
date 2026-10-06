import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(){
 const auth=await requireRole(['Admin']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const {data,error}=await createAdminClient().from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').order('product_name');
 return error?NextResponse.json({error:'Unable to load catalog.'},{status:500}):NextResponse.json({items:data},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request){
 const auth=await requireRole(['Admin']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(typeof body?.id!=='string'||typeof body?.price!=='number'||!Number.isFinite(body.price)||body.price<=0||body.price>1e10)return NextResponse.json({error:'Enter a positive catalog price.'},{status:400});
 const {data,error}=await createAdminClient().from('product_price_settings').update({unit_price:body.price}).eq('id',body.id).select('id').single();
 return error||!data?NextResponse.json({error:'Unable to save catalog price.'},{status:500}):NextResponse.json({ok:true});
}
