import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

// Driver truck assignments and the shared equipment/vehicle expense ledger.
await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  const project='20000000-0000-0000-0000-000000000001', site='40000000-0000-0000-0000-000000000001';
  const value=async(q)=>scalar(await sql(q));
  const drivers={ a:randomUUID(), b:randomUUID(), idle:randomUUID() };
  await sql(Object.entries(drivers).map(([name,id])=>`insert into auth.users(id,email,raw_user_meta_data) values('${id}','driver-${name}@erp-test.local','{"full_name":"Test Driver ${name.toUpperCase()}"}');
    insert into public.user_roles(user_id,role) values('${id}','driver');
    update public.profiles set onboarding_required=false where id='${id}';`).join('\n'));
  const asId=(id,statement)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${id}',true); ${statement}; commit;`);
  const asDriver=(name,statement)=>asId(drivers[name],statement);
  // The first output line is set_config's echo of the caller id; the rest is the query result.
  const last=(out)=>out.split(/\r?\n/).slice(1).at(-1) ?? '';

  const location=await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.project_site_id='${site}'`);
  const truck1=randomUUID(), truck2=randomUUID(), retired=randomUUID(), excavator=randomUUID();
  const asset=(id,kind,code,status='available')=>`insert into public.assets(id,asset_kind,code,name,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
    values('${id}','${kind}','${code}','${code} test','Test','Test',current_date,'company_owned','${status}','${location}','${users.admin}','${users.admin}');`;
  await sql(`begin; ${asset(truck1,'vehicle','TRUCK-EXP-1')} ${asset(truck2,'vehicle','TRUCK-EXP-2')} ${asset(retired,'vehicle','TRUCK-EXP-R','retired')} ${asset(excavator,'equipment','EXC-EXP-1')}
    insert into public.vehicle_details(asset_id,vehicle_type,plate_number) values('${truck1}','Truck','EXP-001'),('${truck2}','Truck','EXP-002'),('${retired}','Truck','EXP-003');
    insert into public.equipment_details(asset_id,equipment_type,serial_number,acquisition_cost) values('${excavator}','Excavator','EXC-EXP-SN1',0); commit;`);

  // Assignment management: Admin only, drivers only, active vehicles only.
  const assign=(driver,truck)=>`select public.set_driver_truck('${drivers[driver]}',${truck?`'${truck}'`:'null'})`;
  for(const role of ['engineer','foreman','warehouse_staff','finance']) await assert.rejects(as(role,assign('a',truck1)),/Admin access required/);
  await assert.rejects(asDriver('a',assign('a',truck1)),/Admin access required/);
  await assert.rejects(as('admin',`select public.set_driver_truck('${users.foreman}','${truck1}')`),/Choose a driver/);
  await assert.rejects(as('admin',assign('a',excavator)),/active vehicle/);
  await assert.rejects(as('admin',assign('a',retired)),/active vehicle/);
  await as('admin',assign('a',truck1));
  await as('admin',assign('b',truck1));
  const myTruck=(name)=>asDriver(name,`select assignment_id||'|'||asset_id from public.get_my_truck()`).then(last);
  const [assignmentA,truckA]=(await myTruck('a')).split('|');
  assert.equal(truckA,truck1);
  assert.equal((await myTruck('b')).split('|')[1],truck1);
  assert.equal(await myTruck('idle'),'');
  await as('admin',assign('a',truck1));
  assert.equal((await myTruck('a')).split('|')[0],assignmentA,'re-saving the same truck keeps the assignment');
  assert.equal(await value(`select count(*) from public.driver_truck_assignments where driver_id='${drivers.a}'`),'1');
  console.log('PASS: Admin-only assignment, one truck per driver, shared trucks, unassigned driver sees none');

  // Driver submission, deduplication and validation.
  const post=(truck,assignment,{key=randomUUID(),amount='1500.25',category='fuel',date="(now() at time zone 'Asia/Manila')::date",notes='Diesel top-up',receipt=false}={})=>
    ({ key, call:`select public.post_asset_expense('${truck}','${key}','${category}',${amount},${date},'${notes}',${assignment?`'${assignment}'`:'null'},${receipt})` });
  const profitability=async()=>last(await as('admin',`select public.get_project_profitability('${project}')::text`));
  const projectBefore=await profitability();
  assert.match(projectBefore,/\d/);
  const addlBefore=await value(`select count(*) from public.project_additional_expenses`);
  const first=post(truck1,assignmentA);
  const posted=await Promise.all([asDriver('a',first.call),asDriver('a',first.call),asDriver('a',first.call)]);
  const firstId=result(posted[0]);
  assert.ok(posted.every((out)=>result(out)===firstId));
  assert.equal(await value(`select count(*) from public.asset_expenses where request_id='${first.key}'`),'1');
  assert.equal(await value(`select amount::text||'|'||submitted_by||'|'||asset_id||'|'||category from public.asset_expenses where id='${firstId}'`),`1500.25|${drivers.a}|${truck1}|fuel`);
  await assert.rejects(asDriver('a',first.call.replace('1500.25','1500.26')),/already used/);
  for(const bad of [{amount:'0'},{amount:'-1'},{amount:'10.005'},{category:'tires'},{date:"(now() at time zone 'Asia/Manila')::date+1"},{date:"date '1999-12-31'"},{notes:'x'.repeat(501)}])
    await assert.rejects(asDriver('a',post(truck1,assignmentA,bad).call),/Invalid asset expense/,JSON.stringify(bad).slice(0,60));
  console.log('PASS: concurrent retries create one expense, changed retries and invalid amounts/dates/categories are rejected');

  // Drivers are bound to their current truck.
  await assert.rejects(asDriver('a',post(truck2,assignmentA).call),/assignment changed/);
  await assert.rejects(asDriver('a',post(truck1,randomUUID()).call),/assignment changed/);
  await assert.rejects(asDriver('a',post(truck1,null).call),/assignment changed/);
  await assert.rejects(asDriver('idle',post(truck1,null).call),/assignment changed/);
  const [assignmentB]=(await myTruck('b')).split('|');
  await assert.rejects(asDriver('a',post(truck1,assignmentB).call),/assignment changed/);
  // A form opened before reassignment cannot save against either truck.
  const openForm=post(truck1,assignmentA);
  await as('admin',assign('a',truck2));
  await assert.rejects(asDriver('a',openForm.call),/assignment changed/);
  await assert.rejects(asDriver('a',openForm.call.replace(truck1,truck2)),/assignment changed/);
  assert.equal(result(await asDriver('a',first.call)),firstId,'a retry of an already-saved expense still returns it after reassignment');
  const [assignmentA2]=(await myTruck('a')).split('|');
  assert.notEqual(assignmentA2,assignmentA);
  const second=result(await asDriver('a',post(truck2,assignmentA2,{category:'oil_change',amount:'2200'}).call));
  await as('admin',assign('a',null));
  assert.equal(await myTruck('a'),'');
  await assert.rejects(asDriver('a',post(truck2,assignmentA2).call),/assignment changed/);
  for(const role of ['engineer','foreman','warehouse_staff','finance']) await assert.rejects(as(role,post(truck1,null).call),/Expense access required/);
  console.log('PASS: reassignment/removal rejects open forms, drivers cannot post to another truck, staff roles denied');

  // Concurrent reassignment: the expense either commits first or fails; it never lands on the new truck's history under the old assignment.
  await as('admin',assign('a',truck1));
  const [assignmentA3]=(await myTruck('a')).split('|');
  const race=post(truck1,assignmentA3,{amount:'99'});
  const outcomes=await Promise.allSettled([asDriver('a',race.call),as('admin',assign('a',truck2))]);
  assert.equal(outcomes[1].status,'fulfilled');
  const raced=await value(`select count(*) from public.asset_expenses where request_id='${race.key}'`);
  assert.equal(raced, outcomes[0].status==='fulfilled' ? '1' : '0');
  if(raced==='1') assert.equal(await value(`select asset_id from public.asset_expenses where request_id='${race.key}'`),truck1);
  console.log(`PASS: concurrent reassignment is serialized (expense ${raced==='1'?'committed first':'rejected'})`);

  // Admin records equipment and vehicle expenses directly; histories stay separate.
  const equipmentExpense=result(await as('admin',post(excavator,null,{category:'repair',amount:'18000',notes:'Hydraulic hose'}).call));
  const vehicleExpense=result(await as('admin',post(truck2,null,{category:'maintenance',amount:'3500'}).call));
  await assert.rejects(as('admin',post(retired,null).call),/unavailable/);
  assert.equal(await value(`select string_agg(id::text,',') from public.asset_expenses where asset_id='${excavator}'`),equipmentExpense);
  assert.equal(await value(`select count(*) from public.asset_expenses where asset_id='${truck2}' and id in ('${vehicleExpense}','${second}')`),'2');
  assert.equal(await value(`select count(*) from public.asset_expenses where asset_id='${truck2}' and id='${equipmentExpense}'`),'0');
  assert.equal(await profitability(),projectBefore,'asset expenses never change project totals');
  assert.equal(await value(`select count(*) from public.project_additional_expenses`),addlBefore);
  console.log('PASS: Admin equipment/vehicle expenses stay in separate asset histories and leave project totals unchanged');

  // Read boundaries.
  const visible=(id)=>asId(id,`select coalesce(string_agg(id::text,',' order by id),'') from public.asset_expenses`).then((o)=>last(o).split(',').filter(Boolean));
  assert.deepEqual((await visible(drivers.a)).sort(),[firstId,second].concat(raced==='1'?[await value(`select id from public.asset_expenses where request_id='${race.key}'`)]:[]).sort());
  assert.deepEqual(await visible(drivers.b),[]);
  assert.equal((await visible(users.finance)).length,Number(await value(`select count(*) from public.asset_expenses`)));
  for(const role of ['engineer','foreman','warehouse_staff']) assert.deepEqual(await visible(users[role]),[]);
  for(const table of ['driver_truck_assignments','assets','vehicle_details','materials','units_of_measure','projects','notifications','audit_logs'])
    assert.equal(last(await asDriver('b',`select count(*) from public.${table}`)),'0',`driver reads ${table}`);
  for(const table of ['profiles','user_roles'])
    assert.equal(last(await asDriver('b',`select count(*)||'|'||bool_and(${table==='profiles'?'id':'user_id'}='${drivers.b}') from public.${table}`)),'1|true',`driver reads only their own ${table}`);
  for(const statement of [`insert into public.asset_expenses(asset_id,submitted_by,request_id,category,amount,expense_date) values('${truck1}','${drivers.b}','${randomUUID()}','fuel',1,current_date)`,
    `update public.asset_expenses set amount=1 where id='${firstId}'`, `delete from public.asset_expenses where id='${firstId}'`,
    `insert into public.driver_truck_assignments(driver_id,asset_id,assigned_by) values('${drivers.b}','${truck2}','${drivers.b}')`])
    await assert.rejects(asDriver('b',statement),/permission denied/);
  await assert.rejects(asDriver('b',`select public.resolve_qr_code('NQ-${'A'.repeat(32)}')`),/not authorized/);
  await assert.rejects(asDriver('b',`select private.post_site_receipt_expense('${randomUUID()}','${drivers.b}')`),/permission denied/);
  console.log('PASS: drivers read only their own expenses and profile; no registry, catalog, project or direct ledger writes');

  // Private receipts: own folder only, Admin/Finance read referenced receipts.
  const receiptKey=randomUUID(), receiptPath=`${drivers.b}/${receiptKey}/receipt.webp`;
  await as('admin',assign('b',truck1));
  const [assignmentB2]=(await myTruck('b')).split('|');
  await assert.rejects(asDriver('b',post(truck1,assignmentB2,{key:receiptKey,receipt:true}).call),/Receipt photo is missing/);
  await assert.rejects(asDriver('b',`insert into storage.objects(bucket_id,name) values('erp-asset-expense-receipts','${drivers.a}/${receiptKey}/receipt.webp')`),/row-level security/);
  await assert.rejects(as('foreman',`insert into storage.objects(bucket_id,name) values('erp-asset-expense-receipts','${users.foreman}/${receiptKey}/receipt.webp')`),/row-level security/);
  await asDriver('b',`insert into storage.objects(bucket_id,name) values('erp-asset-expense-receipts','${receiptPath}')`);
  const receiptExpense=result(await asDriver('b',post(truck1,assignmentB2,{key:receiptKey,receipt:true}).call));
  assert.equal(await value(`select receipt_path from public.asset_expenses where id='${receiptExpense}'`),receiptPath);
  const canRead=(id)=>asId(id,`select count(*) from storage.objects where name='${receiptPath}'`).then(last);
  assert.equal(await canRead(drivers.b),'1'); assert.equal(await canRead(users.admin),'1'); assert.equal(await canRead(users.finance),'1');
  assert.equal(await canRead(drivers.a),'0'); assert.equal(await canRead(users.foreman),'0');
  console.log('PASS: receipts require the uploaded photo, stay in the driver folder and are hidden from other drivers and site staff');

  // Audited reversal.
  await assert.rejects(asDriver('a',`select public.reverse_asset_expense('${firstId}','Wrong amount')`),/Admin access required/);
  await assert.rejects(as('finance',`select public.reverse_asset_expense('${firstId}','Wrong amount')`),/Admin access required/);
  await assert.rejects(as('admin',`select public.reverse_asset_expense('${firstId}','  ')`),/correction reason/);
  await as('admin',`select public.reverse_asset_expense('${firstId}','Duplicate of paper receipt')`);
  await assert.rejects(as('admin',`select public.reverse_asset_expense('${firstId}','Again')`),/already reversed/);
  assert.equal(await value(`select amount::text||'|'||reversed_by||'|'||reversal_reason from public.asset_expenses where id='${firstId}'`),`1500.25|${users.admin}|Duplicate of paper receipt`);
  assert.equal(result(await asDriver('a',first.call)),firstId,'a retry after reversal does not re-post');
  assert.equal(await value(`select count(*) from public.asset_expenses where request_id='${first.key}'`),'1');
  assert.equal(await value(`select count(*) from public.audit_logs where table_name='asset_expenses' and record_id='${firstId}' and action='update' and actor_id='${users.admin}'`),'1');
  assert.ok(Number(await value(`select count(*) from public.audit_logs where table_name='driver_truck_assignments'`))>=6,'assignment history is audited');
  console.log('PASS: Admin-only audited reversal preserves the original entry; retries after reversal do not re-post');
});
