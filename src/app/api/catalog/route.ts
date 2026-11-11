import { catalogKind, isCurtainWallArch, normalizeCatalogItem } from '@/lib/workflow/catalogRules';
import { leadershipRoles } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(){
 const auth=await requireRole(leadershipRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const {data,error}=await createAdminClient().from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').order('product_name');
 return error?NextResponse.json({error:'Unable to load catalog.'},{status:500}):NextResponse.json({items:(data??[]).map(normalizeCatalogItem).filter(item=>!isCurtainWallArch(item)&&!['removed','calculator'].includes(catalogKind(item)))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const auth=await requireRole(['Admin']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body:unknown=await request.json().catch(()=>null);
 const input=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
 const name=typeof input.name==='string'?input.name.trim().replace(/\s+/g,' '):'';
 if(!name||name.length>100)return NextResponse.json({error:'Enter an aluminum section name between 1 and 100 characters.',field:'name'},{status:400});
 const price=input.price;
 if(typeof price!=='number'||!Number.isFinite(price)||price<0.01||price>1e10)return NextResponse.json({error:'Enter a positive price up to 10,000,000,000 IQD.',field:'price'},{status:400});
 // Known product names have special behavior regardless of category. A new
 // section must remain an area-priced window/door system after normalization.
 if(catalogKind({name,category:'aluminum_section'})!=='system')return NextResponse.json({error:'Choose an aluminum section name that is not reserved for another catalog product.',field:'name'},{status:400});
 const admin=createAdminClient();
 const duplicate=()=>NextResponse.json({error:'An item with this name already exists in the catalog.',field:'name'},{status:409});
 // Include inactive products and page through the full catalog so names cannot
 // be reused merely because their row is hidden or beyond the API page limit.
 for(let offset=0;;offset+=1000){
  const {data,error}=await admin.from('product_price_settings').select('product_name').order('id').range(offset,offset+999);
  if(error)return NextResponse.json({error:'Unable to check existing catalog sections. Try again.'},{status:500});
  if(data?.some(item=>item.product_name.trim().replace(/\s+/g,' ').toLowerCase()===name.toLowerCase()))return duplicate();
  if(!data||data.length<1000)break;
 }
 const {data,error}=await admin.from('product_price_settings').insert({product_name:name,category:'aluminum_section',unit:'sqm',unit_price:price,is_active:true,created_by:auth.user.id}).select('id,name:product_name,category,unit,unit_price,is_active').single();
 // The existing unique product_name constraint handles simultaneous exact-name
 // inserts; the preflight also detects existing case and whitespace variants.
 if(error||!data)return error?.code==='23505'?duplicate():NextResponse.json({error:'Unable to add the aluminum section. Try again.'},{status:500});
 return NextResponse.json({item:data},{status:201,headers:{'Cache-Control':'no-store'}});
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
