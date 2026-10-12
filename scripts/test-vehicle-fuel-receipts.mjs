import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  const project='20000000-0000-0000-0000-000000000001', site='40000000-0000-0000-0000-000000000001';
  const vehicle=randomUUID();
  const value=async(q)=>scalar(await sql(q));
  const location=await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.project_site_id='${site}'`);
  await sql(`begin; insert into public.assets(id,asset_kind,code,name,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
    values('${vehicle}','vehicle','TRUCK-FUEL','Fuel test truck','Test','Test',current_date,'company_owned','available','${location}','${users.admin}','${users.admin}'); insert into public.vehicle_details(asset_id,vehicle_type,plate_number) values('${vehicle}','Truck','TEST-123'); commit;`);
  const make=async(amount,role='engineer',paid='company_cash')=>{
    const key=randomUUID();
    await sql(`insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users[role]}/${key}/receipt.webp')`);
    return { key, call:`select public.submit_vehicle_fuel_receipt('${key}','${project}','${site}','${vehicle}',${amount},'${paid}','Fuel for hauling')` };
  };
  const stock=await value(`select coalesce(sum(quantity_on_hand),0) from public.inventory_balances`);
  const low=await make(50000,'engineer','own_money');
  const posted=await Promise.all([as('engineer',low.call),as('engineer',low.call)]);
  const id=result(posted[0]); assert.equal(result(posted[1]),id);
  assert.equal(await value(`select status from public.site_purchases where id='${id}'`),'approved');
  const expense=await value(`select project_expense_id from public.site_purchases where id='${id}'`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  assert.equal(await value(`select amount from public.project_additional_expenses where id='${expense}'`),'50000.00');
  assert.equal(await value(`select receipt_date=(now() at time zone 'Asia/Manila')::date from public.site_purchases where id='${id}'`),'t');
  await assert.rejects(as('engineer',low.call.replace('50000','49999')),/different receipt/);
  await as('finance',`select public.mark_site_purchase_reimbursed('${id}',current_date,'FUEL-REIMBURSE')`);
  await as('finance',`select public.mark_site_purchase_reimbursed('${id}',current_date,'FUEL-REIMBURSE')`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  console.log('PASS: PHP 50,000 auto-posts once, concurrent retries and reimbursement do not duplicate expense or stock');
  const high=await make(50000.01);
  const highId=result(await as('engineer',high.call));
  assert.equal(await value(`select project_expense_id is null and status='submitted' from public.site_purchases where id='${highId}'`),'t');
  await assert.rejects(as('finance',`select public.approve_site_purchase('${highId}')`),/require Admin/);
  await assert.rejects(as('engineer',`select public.approve_site_purchase('${highId}')`),/Only Admin/);
  await Promise.all([as('admin',`select public.approve_site_purchase('${highId}')`),as('admin',`select public.approve_site_purchase('${highId}')`)]);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${high.key}'`),'1');
  console.log('PASS: above PHP 50,000 requires Admin and concurrent approvals post one expense');
  const rejected=await make(60000); const rejectedId=result(await as('engineer',rejected.call));
  await as('finance',`select public.reject_site_purchase('${rejectedId}','Receipt is incorrect')`);
  await assert.rejects(as('admin',`select public.approve_site_purchase('${rejectedId}')`),/rejected/);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${rejected.key}'`),'0');
  const midnight=await make(100); const midnightId=result(await as('engineer',midnight.call));
  await sql(`update public.site_purchases set receipt_date=receipt_date-1 where id='${midnightId}'`);
  assert.equal(result(await as('engineer',midnight.call)),midnightId);
  assert.equal(await value(`select receipt_date<(now() at time zone 'Asia/Manila')::date from public.site_purchases where id='${midnightId}'`),'t');
  console.log('PASS: rejected receipts never post, retry preserves original posting date across midnight');
  for(const role of ['foreman','warehouse_staff','finance']) {
    const denied=await make(100,role);
    await assert.rejects(as(role,denied.call),/Not authorized/);
  }
  const invalid=await make(100);
  await assert.rejects(as('engineer',invalid.call.replace(vehicle,randomUUID())),/currently at this site/);
  await assert.rejects(as('engineer',invalid.call.replace(site,randomUUID())),/Not authorized|not active/);
  await assert.rejects(as('engineer',invalid.call.replace(',100,',',0,')),/Invalid diesel/);
  const noPhoto=await make(100); await sql(`delete from storage.objects where name='${users.engineer}/${noPhoto.key}/receipt.webp'`);
  await assert.rejects(as('engineer',noPhoto.call),/receipt photo/);
  await assert.rejects(as('engineer',`select private.post_vehicle_fuel_expense('${highId}','${users.engineer}')`),/permission denied/);
  console.log('PASS: denied roles, cross-site vehicles, missing photos, invalid totals and private posting bypass');
  await as('admin',`select public.reverse_project_cost_entry('${randomUUID()}','expense','${expense}','Incorrect fuel receipt')`);
  assert.equal(await value(`select count(*) from public.project_expense_reversals where expense_id='${expense}'`),'1');
  await as('admin',`select public.approve_site_purchase('${id}')`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  assert.equal(await value(`select coalesce(sum(quantity_on_hand),0) from public.inventory_balances`),stock);
  assert.equal(await value(`select count(*) from public.site_purchase_lines where site_purchase_id in ('${id}','${highId}')`),'0');
  console.log('PASS: append-only expense reversal, retry after reversal, no stock or fake material lines');
});
