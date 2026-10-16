import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({ sql, as, scalar, users }) => {
  const value = async (query) => scalar(await sql(query));
  const project = randomUUID();
  const municipality = await value("select code from public.geo_municipalities where selectable order by code limit 1");
  const insert = (id, code, name = 'Automatic Project') => `insert into public.projects
    (id,code,name,client_name,address,city_province,municipality_code,start_date,target_completion_date,
     contract_amount,initial_budget,status,project_manager_id,created_by,updated_by)
    values('${id}','${code}','${name}','Test Client','Test project address','Test City','${municipality}',
      current_date,current_date+30,1000,0,'active','${users.engineer}','${users.admin}','${users.admin}')
    on conflict do nothing`;
  const oldSites = await value("select json_agg(s order by id)::text from public.project_sites s where project_id='20000000-0000-0000-0000-000000000001'");
  await Promise.all([as('admin', insert(project, 'AUTO-SITE-TEST')), as('admin', insert(project, 'AUTO-SITE-TEST'))]);
  assert.equal(await value(`select count(*) from public.project_sites where project_id='${project}'`), '1');
  const site = await value(`select id from public.project_sites where project_id='${project}'`);
  assert.equal(await value(`select s.name=p.name and s.address=p.address and s.engineer_id=p.project_manager_id
    and s.foreman_id is null and s.created_by=p.created_by from public.project_sites s
    join public.projects p on p.id=s.project_id where s.id='${site}'`), 't');
  assert.equal(await value(`select count(*) from public.inventory_locations where project_site_id='${site}'`), '1');
  assert.equal(await value(`select count(*) from public.qr_codes where entity_id='${site}' and status='active'`), '1');
  assert.equal(scalar(await as('engineer', `select count(*) from public.project_sites where id='${site}'`)), '1');
  for (const role of ['engineer','foreman','finance','warehouse_staff']) {
    await assert.rejects(as(role, insert(randomUUID(), `DENIED-${role.toUpperCase()}`)), /permission|policy|authorized/i);
  }
  await as('admin', `update public.project_sites set foreman_id='${users.foreman}',updated_by='${users.admin}' where id='${site}'`);
  assert.equal(scalar(await as('foreman', `select count(*) from public.project_sites where id='${site}'`)), '1');
  await assert.rejects(as('admin', `update public.project_sites set engineer_id='${users.foreman}' where id='${site}'`), /role|engineer/i);
  await as('admin', `update public.projects set description='Updated project' where id='${project}'`);
  assert.equal(await value(`select count(*) from public.project_sites where project_id='${project}'`), '1');
  await sql(`create function private.fail_test_initial_site() returns trigger language plpgsql as $$
    begin if new.name='Fail Initial Site' then raise exception 'Injected site failure'; end if; return new; end $$;
    create trigger fail_test_initial_site before insert on public.project_sites
    for each row execute function private.fail_test_initial_site()`);
  const failed = randomUUID();
  await assert.rejects(as('admin', insert(failed, 'AUTO-SITE-FAIL', 'Fail Initial Site')), /Injected site failure/);
  assert.equal(await value(`select count(*) from public.projects where id='${failed}'`), '0');
  await sql('drop trigger fail_test_initial_site on public.project_sites; drop function private.fail_test_initial_site()');
  await sql(readFileSync(new URL('../supabase/migrations/20261016100000_automatic_project_site.sql', import.meta.url), 'utf8'));
  assert.equal(await value(`select count(*) from public.project_sites where project_id='${project}'`), '1');
  assert.equal(await value("select json_agg(s order by id)::text from public.project_sites s where project_id='20000000-0000-0000-0000-000000000001'"), oldSites);
  console.log('PASS: atomic default site, inherited details/Engineer, stock location/QR, concurrent retry, staff role guards, failure rollback, safe rerun and existing-site preservation');
});
