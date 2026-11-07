import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  const project='20000000-0000-0000-0000-000000000001', site='40000000-0000-0000-0000-000000000001';
  const value=async(q)=>scalar(await sql(q));
  const last=(out)=>out.split(/\r?\n/).slice(1).at(-1) ?? '';
  const summary=async()=>last(await as('admin',`select labor_cost||'|'||equipment_cost||'|'||additional_cost||'|'||total_cost from public.get_project_management_summary('${project}')`)).split('|').map(Number);

  // ---------- Receipt expenses tagged Labour / Equipment / Other ----------
  const receipt=async(amount,costType)=>{
    const key=randomUUID();
    await sql(`insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users.engineer}/${key}/receipt.webp')`);
    const args=`'${key}','${project}','${site}',${amount},'company_cash','Test receipt'${costType?`,'${costType}'`:''}`;
    return { key, call:`select public.submit_site_receipt_expense(${args})` };
  };
  const before=await summary();
  const labour=await receipt(1200,'labor'), equipment=await receipt(800,'equipment'), other=await receipt(300), legacy=await receipt(50);
  const posted=await Promise.all([as('engineer',labour.call),as('engineer',labour.call)]);
  assert.equal(result(posted[0]),result(posted[1]),'retry returns the same receipt');
  for(const r of [equipment,other,legacy]) await as('engineer',r.call);
  const category=(key)=>value(`select category||'|'||description from public.project_additional_expenses where idempotency_key='${key}'`);
  assert.match(await category(labour.key),/^labor\|Labour receipt/);
  assert.match(await category(equipment.key),/^equipment\|Equipment receipt/);
  assert.match(await category(other.key),/^other\|Site receipt expense/);
  assert.match(await category(legacy.key),/^other\|/,'calls without a cost type stay Other (installed clients)');
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${labour.key}'`),'1');
  await assert.rejects(as('engineer',labour.call.replace(`'labor'`,`'equipment'`)),/different receipt/);
  await assert.rejects(as('engineer',(await receipt(10,'payroll')).call),/Invalid receipt expense/);
  const after=await summary();
  assert.equal(after[0]-before[0],1200,'labour receipt counts in Labour');
  assert.equal(after[1]-before[1],800,'equipment receipt counts in Equipment');
  assert.equal(after[2]-before[2],350,'untagged receipts stay in Other');
  assert.equal(after[3]-before[3],2350,'project total counts each receipt once');
  const month=last(await as('admin',`select labor_cost||'|'||equipment_cost||'|'||other_cost from public.get_dashboard_monthly_project_costs(1)`)).split('|').map(Number);
  assert.ok(month[0]>=1200 && month[1]>=800 && month[2]>=350,'dashboard months use the same split');
  // Reversal removes it from Labour, once.
  const labourExpense=await value(`select id from public.project_additional_expenses where idempotency_key='${labour.key}'`);
  await as('admin',`select public.reverse_project_cost_entry('${randomUUID()}','expense','${labourExpense}','Wrong receipt')`);
  assert.equal((await summary())[0],after[0]-1200);
  // Above PHP 50,000 waits for Admin, then posts with its tag.
  const big=await receipt(60000,'equipment'); const bigId=result(await as('engineer',big.call));
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${big.key}'`),'0');
  await as('admin',`select public.approve_site_purchase('${bigId}')`);
  assert.match(await category(big.key),/^equipment\|/);
  console.log('PASS: receipt expenses post once as Labour/Equipment/Other; old clients default to Other; totals, dashboard, reversal and approval agree');

  // ---------- Departments ----------
  await assert.rejects(as('finance',`select public.save_department(null,'Office')`),/Admin access required/);
  const office=result(await as('admin',`select public.save_department(null,'Office')`));
  const field=result(await as('admin',`select public.save_department(null,'Field crew')`));
  await assert.rejects(as('admin',`select public.save_department(null,' office ')`),/already exists/);
  const emp1=await value(`select id from public.employees where code='EMP-001'`), emp2=await value(`select id from public.employees where code='EMP-002'`), emp3=await value(`select id from public.employees where code='EMP-003'`);
  await as('admin',`select public.set_employee_department('${emp1}','${field}')`);
  await as('admin',`select public.set_employee_department('${emp2}','${field}')`);
  await as('admin',`select public.set_employee_department('${emp3}','${office}')`);
  await assert.rejects(as('finance',`select public.set_employee_department('${emp3}',null)`),/Admin access required/);
  console.log('PASS: Admin-only departments with unique names and employee assignment');

  // ---------- Payroll ----------
  const assignment=await value(`select id from public.employee_project_assignments where employee_id='${emp1}' and status='active' limit 1`);
  await as('admin',`select public.set_employee_attendance_basis('${emp1}','daily')`);
  for(const day of ['2026-09-21','2026-09-22','2026-09-23'])
    await as('foreman',`select public.post_project_attendance('${randomUUID()}','${assignment}','${day}','present',8,'daily',1,'Payroll test')`);
  const reversedDay=result(await as('foreman',`select public.post_project_attendance('${randomUUID()}','${assignment}','2026-09-24','present',8,'daily',1,'Payroll test')`));
  const projectBefore=await summary();
  const create=(key,dept,start='2026-09-16',end='2026-09-30')=>`select public.create_payroll_run('${key}',${dept?`'${dept}'`:'null'},'${start}','${end}','2026-10-01','Second half September')`;
  for(const role of ['engineer','foreman','warehouse_staff']) await assert.rejects(as(role,create(randomUUID(),field)),/Payroll access required/);
  await assert.rejects(as('finance',create(randomUUID(),field,'2026-09-30','2026-09-01')),/Invalid payroll period/);
  const key=randomUUID();
  const runs=await Promise.all([as('finance',create(key,field)),as('finance',create(key,field))]);
  const run=result(runs[0]); assert.equal(result(runs[1]),run);
  assert.equal(await value(`select count(*) from public.payroll_lines where run_id='${run}'`),'2','field crew only');
  const line1=await value(`select id from public.payroll_lines where run_id='${run}' and employee_id='${emp1}'`);
  assert.equal(await value(`select days_worked||'|'||attendance_pay from public.payroll_lines where id='${line1}'`),'4|3000.00');
  // Overlapping payroll for the same employees is refused; another department is fine.
  await assert.rejects(as('admin',create(randomUUID(),null,'2026-09-20','2026-10-05')),/Overlapping payroll already includes: EMP-001/);
  const officeRun=result(await as('admin',create(randomUUID(),office)));
  // Edit draft lines.
  await as('finance',`select public.update_payroll_line('${line1}',500,250.50,'Allowance; SSS')`);
  assert.equal(await value(`select net_pay from public.payroll_lines where id='${line1}'`),'3249.50');
  await assert.rejects(as('finance',`select public.update_payroll_line('${line1}',0,99999,'')`),/cannot exceed gross/);
  await assert.rejects(as('finance',`select public.update_payroll_line('${line1}',0.001,0,'')`),/Invalid payroll amounts/);
  // Finalize recalculates attendance (a reversed day drops out) and locks the payroll.
  await as('admin',`select public.reverse_project_attendance('${randomUUID()}','${reversedDay}','Absent that day')`);
  await assert.rejects(as('finance',`select public.finalize_payroll_run('${run}')`),/Admin access required/);
  await assert.rejects(as('finance',`select public.mark_payroll_paid('${run}','2026-10-01','BANK-1')`),/Finalize the payroll/);
  await Promise.all([as('admin',`select public.finalize_payroll_run('${run}')`),as('admin',`select public.finalize_payroll_run('${run}')`)]);
  assert.equal(await value(`select status||'|'||(select days_worked||'|'||attendance_pay||'|'||net_pay from public.payroll_lines where id='${line1}') from public.payroll_runs where id='${run}'`),'finalized|3|2250.00|2499.50');
  await assert.rejects(as('finance',`select public.update_payroll_line('${line1}',0,0,'')`),/Only a draft/);
  await as('finance',`select public.mark_payroll_paid('${run}','2026-10-01','BANK-1')`);
  await as('finance',`select public.mark_payroll_paid('${run}','2026-10-01','BANK-1')`);
  assert.equal(await value(`select status||'|'||payment_reference from public.payroll_runs where id='${run}'`),'paid|BANK-1');
  assert.deepEqual(await summary(),projectBefore.map((v,i)=>i===0||i===3?v-750:v),'payroll never posts project cost; only the reversal changed labour');
  console.log('PASS: payroll from posted attendance, department scope, concurrent retries, overlap guard, manual earnings/deductions, finalize recalculation and lock, paid once, no project cost');

  // Void frees the period for a corrected payroll and keeps history.
  await assert.rejects(as('finance',`select public.void_payroll_run('${officeRun}','Wrong period')`),/Admin access required/);
  await as('admin',`select public.void_payroll_run('${officeRun}','Wrong period')`);
  await assert.rejects(as('admin',`select public.void_payroll_run('${officeRun}','Again')`),/already voided/);
  result(await as('admin',create(randomUUID(),office)));
  assert.equal(await value(`select count(*) from public.payroll_runs where department_id='${office}'`),'2');
  // Read boundaries: wage data is Admin/Finance only.
  for(const role of ['engineer','foreman','warehouse_staff'])
    assert.equal(last(await as(role,`select (select count(*) from public.payroll_runs)||'|'||(select count(*) from public.payroll_lines)`)),'0|0',`${role} reads payroll`);
  assert.notEqual(last(await as('finance',`select count(*) from public.payroll_lines`)),'0');
  for(const statement of [`update public.payroll_lines set deductions=0 where id='${line1}'`,`delete from public.payroll_runs where id='${run}'`,`insert into public.departments(name,created_by) values('X','${users.admin}')`])
    await assert.rejects(as('finance',statement),/permission denied/);
  assert.ok(Number(await value(`select count(*) from public.audit_logs where table_name in ('payroll_runs','payroll_lines','departments')`))>=8);
  console.log('PASS: void keeps history and frees the period; payroll hidden from site/warehouse roles; no direct writes; audited');
});
