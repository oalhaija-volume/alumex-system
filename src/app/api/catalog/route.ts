import { catalogKind, normalizeCatalogItem } from '@/lib/workflow/catalogRules';
import { leadershipRoles } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(){
 const auth=await requireRole(leadershipRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const {data,error}=await createAdminClient().from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').order('product_name');
 return error?NextResponse.json({error:'Unable to load catalog.'},{status:500}):NextResponse.json({items:(data??[]).map(normalizeCatalogItem).filter(item=>!['removed','calculator'].includes(catalogKind(item)))},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request){
 const auth=await requireRole(['Admin']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 // Keep the old single-price payload working for already-open catalog tabs.
 const input=body?.changes??(body?.id?[{id:body.id,price:body.price}]:null);
 if(!Array.isArray(input)||!input.length||input.length>1000||input.some(change=>!change||typeof change.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(change.id)||typeof change.price!=='number'||!Number.isFinite(change.price)||change.price<0.01||change.price>1e10)||new Set(input.map(change=>change.id.toLowerCase())).size!==input.length)return NextResponse.json({error:'Enter a positive price for every changed item.'},{status:400});
 const changes=input.map(change=>({id:change.id,price:change.price}));
 const {data,error}=await createAdminClient().rpc('save_catalog_prices',{p_changes:changes});
 if(error)return NextResponse.json({error:error.code==='22023'?'One or more catalog items are unavailable. Reload the catalog and try again.':'Unable to save catalog prices. Your changes have not been saved.'},{status:error.code==='22023'?400:500});
 return NextResponse.json({ok:true,prices:data},{headers:{'Cache-Control':'no-store'}});
}
