import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({sql,as,users,scalar}) => {
  const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
  const worker=scalar(await sql("select employee_id from public.employee_project_assignments where project_id='"+project+"' and project_site_id='"+site+"' limit 1"));
  const card=scalar(await sql(`select public_identifier from public.employee_id_cards where employee_id='${worker}' and status='active'`));
  const prepare=(key,c=card,p=project,s=site)=>`select public.prepare_attendance_scan('${key}','${p}','${s}','${c}')`;
  const save=(key,c=card,hash='a'.repeat(64))=>`select public.record_attendance_scan_with_photo('${key}','${project}','${site}','${c}','${hash}')`;
  const path=key=>`${users.foreman}/${key}/face.webp`;
  const upload=(key,created='now()')=>`insert into storage.objects(bucket_id,name,owner,created_at) values('erp-attendance-evidence','${path(key)}','${users.foreman}',${created})`;
  const count=async(table)=>Number(scalar(await sql(`select count(*) from public.${table}`)));
  const initial=await count('attendance_scans');
  const key=randomUUID();
  await assert.rejects(as('foreman',upload(key)),/row-level security/,'cannot upload before QR verification');
  await assert.rejects(as('foreman',save(key)),/Verify the worker ID/);
  await assert.rejects(as('foreman',`select public.record_attendance_scan('${key}','${project}','${site}','${card}')`),/permission denied/,'legacy scan cannot bypass the photo');
  for(const role of ['engineer','finance','warehouse_staff']) await assert.rejects(as(role,prepare(randomUUID())),/Only the assigned Foreman/);
  const preview=JSON.parse(scalar(await as('foreman',prepare(key))));
  assert.equal(preview.employee_id,worker); assert.equal(preview.recently_scanned,false); assert.equal(preview.scan_type,'in');
  assert.equal(await count('attendance_scans'),initial,'QR verification and cancellation post no scan');
  await assert.rejects(as('foreman',save(key)),/Take a new face photo/,'photo is required');
  await as('foreman',upload(key));
  const attempts=await Promise.all([as('foreman',save(key)),as('foreman',save(key))]);
  assert.deepEqual(JSON.parse(scalar(attempts[0])),JSON.parse(scalar(attempts[1])));
  assert.equal(await count('attendance_scans'),initial+1); assert.equal(await count('attendance_scan_photos'),1);
  await assert.rejects(as('foreman',save(key,card,'b'.repeat(64))),/does not match/,'changed photo retry refused');
  const scanId=scalar(await sql(`select id from public.attendance_scans where idempotency_key='${key}'`));
  for(const role of ['admin','foreman']) {
    assert.equal(scalar(await as(role,`select count(*) from public.attendance_scan_photos where scan_id='${scanId}'`)),'1');
    assert.equal(scalar(await as(role,`select count(*) from storage.objects where bucket_id='erp-attendance-evidence' and name='${path(key)}'`)),'1');
  }
  for(const role of ['engineer','finance','warehouse_staff']) {
    assert.equal(scalar(await as(role,`select count(*) from public.attendance_scan_photos`)),'0');
    assert.equal(scalar(await as(role,`select count(*) from storage.objects where bucket_id='erp-attendance-evidence'`)),'0');
  }
  users.other_foreman=randomUUID();
  await sql(`insert into auth.users(id,email,raw_user_meta_data) values('${users.other_foreman}','other-foreman@erp-test.local','{"full_name":"Other site Foreman"}');
    insert into public.user_roles(user_id,role) values('${users.other_foreman}','foreman');
    update public.profiles set onboarding_required=false where id='${users.other_foreman}';`);
  assert.equal(scalar(await as('other_foreman','select count(*) from public.attendance_scan_photos')),'0','unassigned Foreman cannot read another site photo');
  assert.equal(scalar(await as('other_foreman',"select count(*) from storage.objects where bucket_id='erp-attendance-evidence'")),'0');
  await assert.rejects(as('other_foreman',prepare(randomUUID())),/Only the assigned Foreman/);
  await assert.rejects(as('foreman',`update public.attendance_scan_photos set photo_sha256='${'b'.repeat(64)}'`),/permission denied/);
  await as('foreman',`update storage.objects set name='changed' where bucket_id='erp-attendance-evidence'`);
  assert.equal(scalar(await sql(`select count(*) from storage.objects where name='${path(key)}'`)),'1','posted photo cannot be overwritten');
  const expired=randomUUID(); await as('foreman',prepare(expired));
  await sql(`update public.attendance_scan_attempts set verified_at=now()-interval '11 minutes' where id='${expired}'`);
  await assert.rejects(as('foreman',upload(expired)),/row-level security/);
  await assert.rejects(as('foreman',save(expired)),/expired/);
  const stalePhoto=randomUUID(); await as('foreman',prepare(stalePhoto));
  await as('foreman',upload(stalePhoto,"now()-interval '1 hour'"));
  await assert.rejects(as('foreman',save(stalePhoto)),/Take a new face photo/);
  const changed=randomUUID(); await as('foreman',prepare(changed)); await as('foreman',upload(changed));
  await as('admin',`select public.replace_employee_id_card('${worker}','Lost employee card')`);
  await assert.rejects(as('foreman',save(changed)),/was replaced/);
  const newCard=scalar(await sql(`select public_identifier from public.employee_id_cards where employee_id='${worker}' and status='active'`));
  const reassigned=randomUUID(); await as('foreman',prepare(reassigned,newCard)); await as('foreman',upload(reassigned));
  const assignment=scalar(await sql(`select id from public.employee_project_assignments where employee_id='${worker}' and project_id='${project}' and project_site_id='${site}' limit 1`));
  await as('admin',`select public.end_employee_project_assignment('${assignment}',(now() at time zone 'Asia/Manila')::date-1,'Worker moved to another site')`);
  await assert.rejects(as('foreman',save(reassigned,newCard)),/not assigned to this site today/,'reassignment while photo form is open is rejected');
  assert.equal(await count('attendance_scans'),initial+1,'failed captures never create time-in/out');
  console.log('PASS: QR verification before photo; cancellation/no-photo/expired/older-photo rejection; correct worker, private evidence, immutable photo, concurrent once-only scan, changed-photo retry and replaced-card denial.');
});
