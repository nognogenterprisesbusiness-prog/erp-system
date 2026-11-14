import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({sql,as,users,scalar}) => {
  const hr=randomUUID();
  await sql(`insert into auth.users(id,email,raw_user_meta_data) values('${hr}','hr@fixture.local','{"full_name":"HR User"}'); insert into public.user_roles(user_id,role) values('${hr}','hr'); update public.profiles set onboarding_required=false where id='${hr}';`);
  const asHr=q=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${hr}',true);${q};commit;`);
  const value=async q=>scalar(await asHr(q));
  const category=await value("select public.save_employee_category(null,'Staff support','Office and site support')");
  const department=await value("select public.save_department(null,'Office support')");
  const save=(id,profile=null)=>`select public.save_employee_with_email(${id?`'${id}'`:'null'},'EMP-HR-01','Maria','','Santos','09170000001','maria@fixture.local','${category}','Regular','active',current_date,${profile?`'${profile}'`:'null'})`;
  const employee=await value(save());
  await asHr(`select public.set_employee_department('${employee}','${department}')`);
  assert.equal(await value(`select contact_number from public.employee_private_contacts where employee_id='${employee}'`),'09170000001');
  assert.equal(await value(`select department_id from public.employees where id='${employee}'`),department);
  assert.equal(await value(`select count(*) from public.employee_id_cards where employee_id='${employee}' and status='active'`),'1');
  await asHr(`select public.replace_employee_id_card('${employee}','Lost worker card')`);
  assert.equal(await value(`select count(*) from public.employee_id_cards where employee_id='${employee}' and status='active'`),'1');
  await assert.rejects(asHr(save(employee,users.finance)),/Only Admin can link employee accounts/);
  assert.equal(await value(`select profile_id is null from public.employees where id='${employee}'`),'t');
  const rate=scalar(await as('admin',`select public.post_labor_rate('${employee}','daily',1000,current_date,null)`));
  assert.equal(await value(`select rate_amount from public.labor_rates where id='${rate}'`),'1000.00');
  for(const command of [
    `select public.post_labor_rate('${employee}','daily',2000,current_date,null)`,
    `select public.close_labor_rate('${rate}',current_date)`,
    `select public.set_employee_attendance_basis('${employee}','hourly')`,
    `select public.assign_initial_user_role('${users.foreman}','finance')`,
    `select public.set_managed_user_active('${users.foreman}',false)`,
    `select public.prepare_web_inventory_movement('${randomUUID()}','stock-in')`,
    `select public.issue_client_invoice('${randomUUID()}',null,'Unauthorized invoice',current_date,current_date,100)`,
  ]) await assert.rejects(asHr(command),/not authorized|Admin|administrator/i);
  const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
  const assignment=await value(`select public.assign_employee_to_project('${employee}','${project}','${site}','Site clerk',current_date,'Initial assignment')`);
  const references=JSON.parse(await value(`select jsonb_agg(to_jsonb(r)) from public.get_hr_workforce_references('project',array['${project}']::uuid[]) r`));
  assert.equal(references[0].id,project);
  assert.deepEqual(Object.keys(references[0]).sort(),['id','name','code','project_id','total_count'].sort());
  assert.equal(await value(`select count(*) from public.get_hr_workforce_references('site',array['${site}']::uuid[])`),'1');
  const scan=randomUUID(),scanKey=randomUUID(),photoPath=`${users.foreman}/${scanKey}/face.webp`;
  const card=await value(`select id from public.employee_id_cards where employee_id='${employee}' and status='active'`);
  await sql(`insert into public.attendance_scans(id,idempotency_key,card_id,employee_id,assignment_id,project_id,project_site_id,work_date,scan_type,scanned_by) values('${scan}','${scanKey}','${card}','${employee}','${assignment}','${project}','${site}',current_date,'in','${users.foreman}');
    insert into public.attendance_scan_photos(scan_id,photo_path,photo_sha256) values('${scan}','${photoPath}',repeat('a',64));
    insert into storage.objects(bucket_id,name) values('erp-attendance-evidence','${photoPath}');`);
  assert.equal(await value(`select count(*) from public.attendance_scan_photos where scan_id='${scan}'`),'1','HR can read saved photo metadata through RLS');
  assert.equal(await value(`select count(*) from storage.objects where name='${photoPath}'`),'1','HR can read supporting evidence through private storage RLS');
  for(const role of ['finance','engineer','warehouse_staff']) {
    assert.equal(scalar(await as(role,`select count(*) from public.attendance_scan_photos where scan_id='${scan}'`)),'0');
    assert.equal(scalar(await as(role,`select count(*) from storage.objects where name='${photoPath}'`)),'0');
  }
  await assert.rejects(asHr("select * from public.get_hr_workforce_references('actor')"),/Invalid workforce/);
  await assert.rejects(asHr("select * from public.get_hr_workforce_references('project',null,'',null,0,501)"),/Invalid workforce/);
  const period=scalar(await sql("select current_date::text"));
  const runKey=randomUUID();
  const createRun=`select public.create_payroll_run('${runKey}','${department}','${period}','${period}','${period}','Prepared by HR')`;
  const run=await value(createRun);
  assert.equal(await value(createRun),run,'payroll retry returns the same run');
  const line=await value(`select id from public.payroll_lines where run_id='${run}' and employee_id='${employee}'`);
  await asHr(`select public.update_payroll_line('${line}',1000,100,'Allowance and deduction')`);
  assert.equal(await value(`select net from public.get_payroll_totals(array['${run}']::uuid[])`),'900.00');
  const overview=JSON.parse(await value(`select public.search_attendance_overview(current_date,'${project}','Maria','all',1)`));
  assert.equal(overview.rows[0].employee.first_name,'Maria');
  for(const command of [
    `select public.finalize_payroll_run('${run}')`,
    `select public.mark_payroll_paid('${run}',current_date,'PAY-01')`,
    `select public.void_payroll_run('${run}','Wrong period')`,
  ])await assert.rejects(asHr(command),/Admin|not authorized|Payroll access/i);
  await as('admin',`select public.finalize_payroll_run('${run}')`);
  await assert.rejects(asHr(`select public.update_payroll_line('${line}',2000,100,'Late change')`),/draft/i);
  await as('finance',`select public.mark_payroll_paid('${run}',current_date,'PAY-01')`);
  assert.equal(await value(`select status from public.payroll_runs where id='${run}'`),'paid');
  for(const table of ['projects','project_sites','assets','inventory_balances','inventory_transactions','client_invoices','client_payments','project_additional_expenses','project_budget_changes','equipment_hour_rates','audit_logs','user_roles']) {
    const rows=await value(`select count(*) from public.${table}`);
    // user_roles retains the existing own-role read policy.
    assert.equal(rows,table==='user_roles'?'1':'0',`HR cannot read unrelated ${table}`);
  }
  await assert.rejects(asHr(`update public.payroll_lines set other_earnings=9999 where id='${line}'`),/permission denied/);
  for(const role of ['engineer','foreman','warehouse_staff']) {
    await assert.rejects(as(role,"select * from public.get_hr_workforce_references('project')"),/HR access required/);
    await assert.rejects(as(role,`select public.update_payroll_line('${line}',500,0,'Unauthorized')`),/Payroll access required/);
  }
  await asHr(`select public.end_employee_project_assignment('${assignment}',current_date,'Assignment completed')`);
  await asHr(`select public.archive_employee('${employee}','Employment completed')`);
  assert.equal(await value(`select status from public.employees where id='${employee}'`),'separated');
  await sql(`update public.profiles set is_active=false where id='${hr}'`);
  await assert.rejects(asHr("select public.save_department(null,'Inactive attempt')"),/management access required/);
  assert.equal(await value('select count(*) from public.employees'),'0');
  assert.equal(await value('select count(*) from public.payroll_runs'),'0');
  console.log('PASS: HR employee/contact/department/assignment/card management and payroll preparation; payroll retry and locked-state rules; safe project labels; Admin-only rates/finalization/corrections/accounts; Finance-only payment; unrelated-data and disabled-account denial.');
});
