begin;

-- Each saved correction keeps the dimensions that existed before Indoor Sales
-- changed them. Earlier quotation and contract snapshots remain untouched.
create table public.opening_size_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  opening_id uuid not null,
  source_opening_id uuid not null,
  previous_width numeric(12,3) not null check (previous_width > 0),
  previous_height numeric(12,3) not null check (previous_height > 0),
  previous_quantity integer not null check (previous_quantity between 1 and 10000),
  width numeric(12,3) not null check (width between 0.01 and 100000),
  height numeric(12,3) not null check (height between 0.01 and 100000),
  quantity integer not null check (quantity between 1 and previous_quantity),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  quotation_version integer not null check (quotation_version > 0)
);
create index opening_size_history_project_version_idx
  on public.opening_size_history(project_id,quotation_version desc,changed_at desc);
alter table public.opening_size_history enable row level security;
revoke all on public.opening_size_history from public,anon,authenticated,service_role;
grant select on public.opening_size_history to service_role;

-- No API role can create these short-lived intents. The security-definer save
-- transaction creates an exact OLD/NEW pair and removes it before returning.
-- This avoids disabling triggers or introducing a client-settable bypass flag.
create table public.quotation_opening_size_write_intents (
  transaction_id bigint not null,
  opening_id uuid not null,
  previous_row jsonb,
  next_row jsonb not null,
  primary key(transaction_id,opening_id)
);
alter table public.quotation_opening_size_write_intents enable row level security;
revoke all on public.quotation_opening_size_write_intents from public,anon,authenticated,service_role;

do $size_guard$
declare
  definition text;
  anchor text := ' current_status=project.sales_status;';
  replacement text := $guard$ current_status=project.sales_status;
 -- Exact writes authorized by save_quotation_with_opening_sizes only. Computed
 -- area and updated_at are populated by the existing downstream row triggers.
 if TG_OP in ('INSERT','UPDATE') and exists(
   select 1 from public.quotation_opening_size_write_intents intent
   where intent.transaction_id=txid_current() and intent.opening_id=NEW.id
    and intent.next_row-array['area_sqm','updated_at','has_skylight_capture','has_curtain_wall_capture']
      =to_jsonb(NEW)-array['area_sqm','updated_at','has_skylight_capture','has_curtain_wall_capture']
    and ((TG_OP='INSERT' and intent.previous_row is null)
      or (TG_OP='UPDATE' and intent.previous_row=to_jsonb(OLD)))
 ) then return NEW; end if;$guard$;
begin
  select pg_get_functiondef('public.lock_quoted_openings()'::regprocedure) into definition;
  if position('save_quotation_with_opening_sizes only' in definition)>0 then return; end if;
  if cardinality(string_to_array(definition,anchor))<>2
    or position('Measurements are locked after quotation creation' in definition)=0
    or position('Permit only newly quoted facade dimensions' in definition)=0 then
    raise exception 'Unexpected quoted-opening lock; size correction migration was not applied.';
  end if;
  execute replace(definition,anchor,replacement);
end;
$size_guard$;

create function public.save_quotation_with_opening_sizes(
  p_project uuid,p_revision integer,p_payload jsonb,p_actor uuid
) returns public.sales_workflows
language plpgsql security definer set search_path=public as $$
declare
  project public.projects;
  flow public.sales_workflows;
  saved_flow public.sales_workflows;
  original public.openings;
  changed public.openings;
  entry jsonb;
  candidate jsonb;
  changes jsonb;
  actor_role text;
  affected integer;
  new_width numeric;
  new_height numeric;
  split_id uuid;
  edited_ids uuid[] := '{}';
  clone_columns text;
begin
  perform public.require_indoor_project_branch(p_project,p_actor);
  select public.sales_permission_role(role)::text into actor_role
    from public.profiles where id=p_actor and is_active and status='Active';
  if actor_role is null or actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then
    raise exception using errcode='42501',message='Quotations and contracts are handled by Indoor Sales and company leadership.';
  end if;
  select * into project from public.projects where id=p_project for update;
  select * into flow from public.sales_workflows where project_id=p_project for update;
  if coalesce(flow.revision,0) is distinct from p_revision then
    raise exception 'This project changed. Reload before continuing.';
  end if;
  if project.sales_status in ('cancelled','lost','closed') then
    raise exception 'This project is closed. Its quotation and contract history is read-only.';
  end if;
  if project.sales_status in ('contract_signed','transferred_to_operations')
    or flow.signed_at is not null or flow.evidence is not null
    or flow.accepted_at is not null or flow.accepted_by is not null
    or (flow.stage is not null and flow.stage not in ('quotation','approved','contract')) then
    raise exception 'Signed contracts cannot be changed.';
  end if;
  if flow.stage='contract' and p_payload->'replaceUnsignedContract' is distinct from 'true'::jsonb then
    raise exception 'Confirm that this revision replaces the unsigned contract and requires new client approval.';
  end if;
  if project.additional_openings_state is not null then
    raise exception 'Complete the additional measurements and save a quotation revision before continuing.';
  end if;
  if project.structure_readiness is distinct from 'ready' or project.measurement_delayed then
    raise exception 'Complete measurements first.';
  end if;
  if project.sales_status not in ('ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated') then
    raise exception 'Complete measurements first.';
  end if;
  changes:=p_payload->'openingSizeChanges';
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid opening size changes.';
  end if;
  if jsonb_array_length(changes) not between 1 and 100
    or jsonb_typeof(p_payload->'lines') is distinct from 'array'
    or (p_payload ? 'excludedOpeningIds' and jsonb_typeof(p_payload->'excludedOpeningIds') is distinct from 'array') then
    raise exception using errcode='22023',message='Invalid opening size changes.';
  end if;

  -- Validate every change before writing. All opening writers acquire this same
  -- project lock, and exact previous dimensions detect stale editors/devices.
  for entry in select value from jsonb_array_elements(changes) loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'openingId') is distinct from 'string'
      or entry->>'openingId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'previousWidth') is distinct from 'number'
      or jsonb_typeof(entry->'previousHeight') is distinct from 'number'
      or jsonb_typeof(entry->'previousQuantity') is distinct from 'number'
      or jsonb_typeof(entry->'width') is distinct from 'number'
      or jsonb_typeof(entry->'height') is distinct from 'number'
      or jsonb_typeof(entry->'quantity') is distinct from 'number'
      or jsonb_typeof(entry->'reason') is distinct from 'string'
      or length(btrim(entry->>'reason')) not between 1 and 500 then
      raise exception using errcode='22023',message='Invalid opening size changes.';
    end if;
    if (entry->>'openingId')::uuid=any(edited_ids) then
      raise exception using errcode='22023',message='An opening can be resized only once per revision.';
    end if;
    select * into original from public.openings
      where id=(entry->>'openingId')::uuid and project_id=p_project for update;
    if not found then raise exception 'Opening not found in this project.'; end if;
    if original.opening_type is null or original.opening_type not in ('Window','Door','Louver','Curtain Wall')
      or original.site_readiness is distinct from 'ready' then
      raise exception using errcode='22023',message='Only measured quotation openings can be resized.';
    end if;
    if row(original.width,original.height,original.quantity) is distinct from
      row((entry->>'previousWidth')::numeric,(entry->>'previousHeight')::numeric,(entry->>'previousQuantity')::numeric) then
      raise exception 'This opening changed on another device. Reload the quotation before editing its size.';
    end if;
    new_width:=(entry->>'width')::numeric;
    new_height:=(entry->>'height')::numeric;
    if new_width not between 0.01 and 100000 or new_height not between 0.01 and 100000
      or new_width<>round(new_width,2) or new_height<>round(new_height,2) then
      raise exception using errcode='22023',message='Enter valid opening dimensions in cm, with up to two decimal places.';
    end if;
    if new_width=original.width and new_height=original.height then
      raise exception using errcode='22023',message='Change the width or height before applying the new size.';
    end if;
    if (entry->>'quantity')::numeric not between 1 and original.quantity
      or (entry->>'quantity')::numeric<>trunc((entry->>'quantity')::numeric) then
      raise exception using errcode='22023',message='Choose a whole-number quantity within this opening group.';
    end if;
    affected:=(entry->>'quantity')::integer;
    edited_ids:=array_append(edited_ids,original.id);
    if affected<original.quantity then
      if jsonb_typeof(entry->'splitOpeningId') is distinct from 'string'
        or entry->>'splitOpeningId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode='22023',message='Invalid resized opening identifier.';
      end if;
      split_id:=(entry->>'splitOpeningId')::uuid;
      if split_id=any(edited_ids) or exists(select 1 from public.openings where id=split_id)
        or exists(select 1 from jsonb_array_elements(changes) c where c->>'openingId'=split_id::text) then
        raise exception using errcode='22023',message='Invalid resized opening identifier.';
      end if;
      edited_ids:=array_append(edited_ids,split_id);
    elsif entry ? 'splitOpeningId' then
      raise exception using errcode='22023',message='Invalid resized opening identifier.';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'excludedOpeningIds','[]'::jsonb)) excluded
    where excluded=any(edited_ids::text[])) then
    raise exception using errcode='22023',message='Restore the opening to the quotation before editing its size.';
  end if;

  for entry in select value from jsonb_array_elements(changes) loop
    select * into original from public.openings where id=(entry->>'openingId')::uuid and project_id=p_project for update;
    affected:=(entry->>'quantity')::integer;
    if affected=original.quantity then
      candidate:=to_jsonb(original)||jsonb_build_object('width',(entry->>'width')::numeric,'height',(entry->>'height')::numeric);
      insert into public.quotation_opening_size_write_intents(transaction_id,opening_id,previous_row,next_row)
        values(txid_current(),original.id,to_jsonb(original),candidate);
      update public.openings set width=(entry->>'width')::numeric,height=(entry->>'height')::numeric where id=original.id;
    else
      candidate:=to_jsonb(original)||jsonb_build_object('quantity',original.quantity-affected);
      insert into public.quotation_opening_size_write_intents(transaction_id,opening_id,previous_row,next_row)
        values(txid_current(),original.id,to_jsonb(original),candidate);
      update public.openings set quantity=original.quantity-affected where id=original.id;
      split_id:=(entry->>'splitOpeningId')::uuid;
      candidate:=to_jsonb(original)||jsonb_build_object('id',split_id,'opening_code','OP-'||split_id,
        'width',(entry->>'width')::numeric,'height',(entry->>'height')::numeric,'quantity',affected,'created_at',now(),'updated_at',now());
      insert into public.quotation_opening_size_write_intents(transaction_id,opening_id,previous_row,next_row)
        values(txid_current(),split_id,null,candidate);
      -- Generated media-presence flags must be computed by PostgreSQL. Copy
      -- every ordinary column so captures and other site details stay intact.
      select string_agg(quote_ident(attname),',' order by attnum) into clone_columns
        from pg_attribute where attrelid='public.openings'::regclass
          and attnum>0 and not attisdropped and attgenerated='';
      execute format('insert into public.openings (%1$s) select %1$s from jsonb_populate_record(null::public.openings,$1)',clone_columns)
        using candidate;
    end if;
  end loop;
  delete from public.quotation_opening_size_write_intents where transaction_id=txid_current();

  -- Require every affected group (including the remainder of a split) to be
  -- present with its exact resulting measured fields in this quotation.
  for changed in select * from public.openings where project_id=p_project and id=any(edited_ids) loop
    if not exists(select 1 from jsonb_array_elements(p_payload->'lines') line
      where line->'opening' @> jsonb_build_object('id',changed.id,'floor',changed.floor,'room',changed.room,
        'width',changed.width,'height',changed.height,'quantity',changed.quantity,'opening_type',changed.opening_type,
        'opening_direction',changed.opening_direction,'has_arch',changed.has_arch,'has_roller_shutter',changed.has_roller_shutter,
        'work_area',changed.work_area,'facade_number',changed.facade_number)) then
      raise exception 'Measurements changed. Reload the quotation.';
    end if;
  end loop;

  saved_flow:=public.advance_sales_flow(p_project,'save',p_revision,p_payload-'replaceUnsignedContract',p_actor);
  for entry in select value from jsonb_array_elements(changes) loop
    insert into public.opening_size_history(project_id,opening_id,source_opening_id,
      previous_width,previous_height,previous_quantity,width,height,quantity,reason,changed_by,quotation_version)
    values(p_project,coalesce((entry->>'splitOpeningId')::uuid,(entry->>'openingId')::uuid),(entry->>'openingId')::uuid,
      (entry->>'previousWidth')::numeric,(entry->>'previousHeight')::numeric,(entry->>'previousQuantity')::integer,
      (entry->>'width')::numeric,(entry->>'height')::numeric,(entry->>'quantity')::integer,btrim(entry->>'reason'),p_actor,
      (saved_flow.quotation->>'version')::integer);
  end loop;
  return saved_flow;
end;
$$;
revoke all on function public.save_quotation_with_opening_sizes(uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_quotation_with_opening_sizes(uuid,integer,jsonb,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
