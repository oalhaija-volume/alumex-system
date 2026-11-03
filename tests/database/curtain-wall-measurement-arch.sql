begin;
do $$
declare
  indoor uuid := gen_random_uuid(); outdoor uuid := gen_random_uuid(); site uuid := gen_random_uuid();
  opening_id uuid := gen_random_uuid(); legacy_id uuid := gen_random_uuid(); added_id uuid := gen_random_uuid();
  operation uuid := gen_random_uuid(); edit_operation uuid := gen_random_uuid();
  payload jsonb; changed jsonb; bad jsonb; measured jsonb; quote jsonb; flow sales_workflows;
  structural_type text; failed_constraint text;
begin
  -- Omitted flags retain legacy defaults; explicit flags stay strictly boolean.
  foreach structural_type in array array['Window', 'Door', 'Curtain Wall'] loop
    assert normalize_opening_arch('true', structural_type);
    assert not normalize_opening_arch('false', structural_type);
    assert not normalize_opening_arch(null, structural_type);
    foreach bad in array array['null'::jsonb, '0'::jsonb, '1'::jsonb, '"true"'::jsonb, '{}'::jsonb] loop
      begin
        perform normalize_opening_arch(bad, structural_type);
        raise exception using errcode = 'ZX001', message = 'Nonboolean arch flag accepted';
      exception when sqlstate 'P0001' then null; end;
    end loop;
  end loop;
  foreach structural_type in array array['Louver', 'Skylight', 'Facade', null] loop
    assert not normalize_opening_arch('false', structural_type);
    begin
      perform normalize_opening_arch('true', structural_type);
      raise exception using errcode = 'ZX001', message = 'Arch accepted on an unrelated structural type';
    exception when sqlstate 'P0001' then null; end;
  end loop;

  insert into auth.users(id, email)
  values (indoor, indoor::text || '@example.invalid'), (outdoor, outdoor::text || '@example.invalid');
  update profiles set role = 'Indoor Sales', branch = 'Karkh', is_active = true, status = 'Active' where id = indoor;
  update profiles set role = 'Outdoor Sales', is_active = true, status = 'Active' where id = outdoor;
  perform sync_field_change(gen_random_uuid(), indoor, site, 'register', jsonb_build_object(
    'client', jsonb_build_object('clientName', 'Curtain wall measurement arch test', 'clientType', 'individual', 'mobile', '00000000000'),
    'project', jsonb_build_object('address', 'Baghdad', 'structureReadiness', 'ready', 'assignedOutdoorSalesId', outdoor)
  ), now(), null);
  payload := jsonb_build_object('id', opening_id, 'floor', 'Ground', 'room', 'Office', 'width', 300, 'height', 200,
    'structuralType', 'Curtain Wall', 'openingType', null, 'quantity', 2, 'hasArch', true,
    'curtainWall', jsonb_build_object('note', 'Arched curtain wall'));
  perform sync_field_change(operation, outdoor, site, 'opening', payload, now(), null);
  perform sync_field_change(operation, outdoor, site, 'opening', payload, now(), null);
  assert (select count(*) = 1 and bool_and(has_arch) from openings where project_id = site), 'Retried capture must preserve one arched curtain wall';
  perform sync_field_change(gen_random_uuid(), outdoor, site, 'opening',
    (payload - 'hasArch' - 'curtainWall') || jsonb_build_object('id', legacy_id), now(), null);
  assert (select not has_arch from openings where id = legacy_id), 'Older curtain wall uploads default to no arch';

  -- The table constraint also protects writes that do not call the normalizer.
  begin
    insert into openings(id, project_id, opening_code, floor, room, width, height, quantity,
      opening_type, opening_direction, site_readiness, created_by, has_arch)
    values (gen_random_uuid(), site, 'ARCH-CONSTRAINT-TEST', 'Ground', 'Office', 100, 100, 1,
      'Louver', 'Hinged', 'ready', outdoor, true);
    raise exception using errcode = 'ZX001', message = 'Direct incompatible arch insert accepted';
  exception when check_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    assert failed_constraint = 'openings_arch_compatible_type';
  end;

  changed := payload || '{"hasArch":false}'::jsonb;
  perform sync_field_change(edit_operation, outdoor, site, 'edit-opening', jsonb_build_object('opening', changed, 'previous', payload), now(), null);
  perform sync_field_change(edit_operation, outdoor, site, 'edit-opening', jsonb_build_object('opening', changed, 'previous', payload), now(), null);
  assert (select not has_arch and curtain_wall_capture->>'note' = 'Arched curtain wall' from openings where id = opening_id), 'Arch edits must preserve curtain wall notes';
  begin
    perform sync_field_change(gen_random_uuid(), outdoor, site, 'edit-opening', jsonb_build_object('opening', changed, 'previous', payload), now(), null);
    raise exception using errcode = 'ZX001', message = 'A stale curtain wall arch edit was accepted';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'This opening changed on another device. Reload measurements before editing it again.';
  end;
  perform sync_field_change(gen_random_uuid(), outdoor, site, 'edit-opening', jsonb_build_object('opening', payload, 'previous', changed), now(), null);
  perform sync_field_change(gen_random_uuid(), outdoor, site, 'finish', '{}', now(), null);

  select jsonb_agg(jsonb_build_object('opening', jsonb_build_object(
    'id', id, 'floor', floor, 'room', room, 'width', width, 'height', height, 'quantity', quantity,
    'opening_type', opening_type, 'opening_direction', opening_direction, 'has_arch', has_arch
  )) order by has_arch desc) into measured from openings where project_id = site;
  quote := jsonb_build_object('lines', measured, 'total', 100000, 'currency', 'IQD');
  begin
    perform advance_sales_flow(site, 'save', 0, jsonb_set(quote, '{lines,0,opening,has_arch}', 'false'), indoor);
    raise exception using errcode = 'ZX001', message = 'Quotation lost a measured curtain wall arch';
  exception when sqlstate 'P0001' then assert sqlerrm = 'Measurements changed. Reload the quotation.'; end;
  flow := advance_sales_flow(site, 'save', 0, quote, indoor);
  assert flow.quotation#>>'{lines,0,opening,has_arch}' = 'true';

  -- Quotation-created arched curtain walls use the same helper and insertion lock.
  measured := measured || jsonb_build_array(jsonb_build_object('opening', jsonb_build_object(
    'id', added_id, 'floor', 'First', 'room', 'Office', 'width', 200, 'height', 200, 'quantity', 1,
    'opening_type', 'Curtain Wall', 'opening_direction', null, 'has_arch', true)));
  flow := advance_sales_flow(site, 'save', 1, jsonb_build_object('lines', measured, 'total', 200000, 'currency', 'IQD'), indoor);
  assert (select has_arch from openings where id = added_id);
  assert (select quotation#>>'{lines,0,opening,has_arch}' = 'true' from quotation_revisions where project_id = site and version = 1);
  flow := advance_sales_flow(site, 'approve', 2, '{}', indoor);
  flow := advance_sales_flow(site, 'contract', 3, '{"number":"TEST-CURTAIN-ARCH"}', indoor);
  assert flow.contract#>>'{quotation,lines,0,opening,has_arch}' = 'true';
  assert flow.contract#>>'{quotation,lines,2,opening,has_arch}' = 'true';
  raise notice 'PASS: curtain wall arch validation, legacy defaults, retry-safe capture and edits, stale protection, quotation revisions and contract snapshots';
end;
$$;
rollback;
