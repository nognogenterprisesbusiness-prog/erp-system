import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({ sql, as, users, scalar }) => {
  const project='20000000-0000-0000-0000-000000000001', site='40000000-0000-0000-0000-000000000001';
  const otherProject='20000000-0000-0000-0000-000000000003', otherSite='40000000-0000-0000-0000-000000000003';
  const value=async(q)=>scalar(await sql(q));
  const last=(out)=>out.split(/\r?\n/).slice(1).at(-1) ?? '';
  const json=(out)=>JSON.parse(last(out));
  const today=await value(`select (now() at time zone 'Asia/Manila')::date`);

  // ---------- Cards: issued automatically, Admin-only, replaceable ----------
  assert.equal(await value(`select count(*) from public.employees e where not exists (select 1 from public.employee_id_cards c where c.employee_id=e.id and c.status='active')`),'0','existing employees get a card');
  const worker=randomUUID(), assignment=randomUUID(), unassigned=randomUUID();
  for(const [id,code] of [[worker,'QR-001'],[unassigned,'QR-002']])
    await sql(`insert into public.employees(id,code,first_name,last_name,category_id,employment_type,hire_date,created_by,updated_by)
      select '${id}','${code}','Juan','Dela Cruz',category_id,employment_type,'2026-01-01','${users.admin}','${users.admin}' from public.employees where code='EMP-001'`);
  await sql(`insert into public.employee_project_assignments(id,employee_id,project_id,project_site_id,position_title,start_date,assigned_by)
    values('${assignment}','${worker}','${project}','${site}','Mason','2026-01-01','${users.admin}')`);
  await as('admin',`select public.post_labor_rate('${worker}','hourly',100,'2026-01-01',null)`);
  const card=async(employee)=>value(`select public_identifier from public.employee_id_cards where employee_id='${employee}' and status='active'`);
  const first=await card(worker);
  assert.match(first,/^NW-[A-F0-9]{32}$/,'new employee gets a card automatically');
  for(const role of ['foreman','engineer','finance','warehouse_staff']) {
    assert.equal(last(await as(role,`select count(*) from public.employee_id_cards`)),'0',`${role} cannot read card codes`);
    await assert.rejects(as(role,`select public.replace_employee_id_card('${worker}','Lost card')`),/Only an administrator/);
  }
  await assert.rejects(as('admin',`select public.replace_employee_id_card('${worker}','x')`),/reason/);
  await as('admin',`select public.replace_employee_id_card('${worker}','Lost card')`);
  const second=await card(worker);
  assert.notEqual(second,first);
  assert.equal(await value(`select count(*)||'|'||count(*) filter (where status='active') from public.employee_id_cards where employee_id='${worker}'`),'2|1');
  for(const statement of [`update public.employee_id_cards set status='active'`,`insert into public.employee_id_cards(employee_id,issued_by) values('${worker}','${users.admin}')`])
    await assert.rejects(as('admin',statement),/permission denied/);
  assert.ok(Number(await value(`select count(*) from public.audit_logs where table_name='employee_id_cards' and record_id in (select id from public.employee_id_cards where employee_id='${worker}')`))>=3,'issue and replacement are audited');
  console.log('PASS: every employee gets a card automatically; Admin-only read and replacement with reason; old card retired; audited; no direct writes');

  // ---------- Scans: Foreman of the site only, card must be valid and assigned ----------
  const scan=(card,key=randomUUID(),p=project,s=site)=>`select public.record_attendance_scan('${key}','${p}','${s}','${card}')`;
  for(const role of ['engineer','warehouse_staff','finance'])
    await assert.rejects(as(role,scan(second)),/Only the assigned Foreman/,`${role} cannot scan`);
  await assert.rejects(as('foreman',scan(second,randomUUID(),otherProject,otherSite)),/Only the assigned Foreman/,'other project is denied');
  await assert.rejects(as('foreman',scan(first)),/was replaced/,'retired card is refused');
  await assert.rejects(as('foreman',scan('NQ-'+'A'.repeat(32))),/not a worker ID card/,'material/asset QR is refused');
  await assert.rejects(as('foreman',scan('NW-'+'B'.repeat(32))),/not recognised/);
  await assert.rejects(as('foreman',scan(await card(unassigned))),/not assigned to this site today/);

  // Time-in: concurrent retries of one scan and a double scan count once.
  const key=randomUUID();
  const [a,b]=await Promise.all([as('foreman',scan(second,key)),as('foreman',scan(second,key))]);
  assert.deepEqual(json(a),json(b),'same-key retry returns the same scan');
  const timeIn=json(a);
  assert.equal(timeIn.scan_type,'in'); assert.equal(timeIn.name,'Juan Dela Cruz'); assert.equal(timeIn.assignment_id,assignment);
  assert.equal(timeIn.basis,'hourly'); assert.equal(timeIn.time_out,null); assert.equal(timeIn.work_date,today);
  const again=json(await as('foreman',scan(second.toLowerCase())));
  assert.equal(again.repeated,true,'a second scan within five minutes is ignored');
  assert.equal(await value(`select count(*) from public.attendance_scans where employee_id='${worker}'`),'1');
  await assert.rejects(as('foreman',scan(second.replace(/.$/,c=>c==='A'?'B':'A'),key)),/already used/,'key reuse with another card is refused');

  // Time-out: move the time-in back 9h15m (superuser fixture only) and scan again.
  await sql(`alter table public.attendance_scans disable trigger attendance_scans_append_only;
    update public.attendance_scans set scanned_at=now()-interval '9 hours 15 minutes' where employee_id='${worker}';
    alter table public.attendance_scans enable trigger attendance_scans_append_only;`);
  const timeOut=json(await as('foreman',scan(second)));
  assert.equal(timeOut.scan_type,'out'); assert.ok(timeOut.time_out); assert.equal(Number(timeOut.hours),9.25);
  const list=(await as('foreman',`select * from public.get_attendance_scans('${project}','${site}')`)).split(/\r?\n/).slice(1).filter(Boolean).map((line)=>JSON.parse(line));
  assert.equal(list.length,1); assert.equal(list[0].employee_id,worker); assert.equal(Number(list[0].hours),9.25); assert.equal(list[0].recorded,false);
  await assert.rejects(as('engineer',`select * from public.get_attendance_scans('${project}','${site}')`),/Only the assigned Foreman/);
  await assert.rejects(as('foreman',`select * from public.get_attendance_scans('${otherProject}','${otherSite}')`),/Only the assigned Foreman/);
  for(const statement of [`update public.attendance_scans set scan_type='in'`,`delete from public.attendance_scans`,`insert into public.attendance_scans(idempotency_key,card_id,employee_id,assignment_id,project_id,project_site_id,work_date,scan_type,scanned_by) select gen_random_uuid(),card_id,employee_id,assignment_id,project_id,project_site_id,work_date,'in',scanned_by from public.attendance_scans limit 1`])
    await assert.rejects(as('foreman',statement),/permission denied/);
  await assert.rejects(sql(`delete from public.attendance_scans`),/cannot be changed/,'scans are append-only even for the owner');
  assert.equal(last(await as('engineer',`select count(*) from public.attendance_scans`)),'0','engineer cannot read scans');
  console.log('PASS: Foreman-only scanning for their site; replaced, foreign and unassigned cards refused; retries and double scans count once; time-out hours; append-only');

  // ---------- Scans post no cost; the Foreman posts attendance once ----------
  assert.equal(await value(`select count(*) from public.project_attendance where employee_id='${worker}'`),'0','scanning posts no labour cost');
  const entry={ idempotencyKey: randomUUID(), assignmentId: assignment, status:'present', hours:String(timeOut.hours), dayFraction:'', note:'QR in 7:00 AM · out 4:15 PM' };
  await as('foreman',`select public.post_project_attendance_batch('${project}','${site}','${today}','${JSON.stringify([entry])}'::jsonb)`);
  assert.equal(await value(`select hours_worked||'|'||cost_total from public.project_attendance where employee_id='${worker}'`),'9.25|925.00');
  await assert.rejects(as('foreman',scan(second)),/already recorded today/,'no scans after attendance is posted');
  const after=(await as('foreman',`select * from public.get_attendance_scans('${project}','${site}')`)).split(/\r?\n/).slice(1).filter(Boolean).map((line)=>JSON.parse(line));
  assert.equal(after[0].recorded,true);
  console.log('PASS: scans post no cost; attendance posted once from scanned hours; scanning stops once recorded');
});
