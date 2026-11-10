import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';
const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
await withIsolatedPostgres(async({sql,as,users,result,scalar})=>{
 const read=async(role='finance')=>JSON.parse(scalar(await as(role,`select coalesce(jsonb_agg(x),'[]') from public.get_project_expense_breakdown('${project}') x`)));
 const before=await read();
 const id=result(await as('admin',`select public.post_project_additional_expense('${randomUUID()}','${project}',current_date,'permit','Building permit renewal','PERMIT-RENEWAL',150.25)`));
 const key=randomUUID();
 await sql(`insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users.engineer}/${key}/receipt.webp')`);
 await as('engineer',`select public.submit_site_receipt_expense('${key}','${project}','${site}',300,'company_cash','Site delivery fee','other')`);
 const vehicle=randomUUID(),fuelKey=randomUUID();
 const location=scalar(await sql(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.project_site_id='${site}'`));
 await sql(`begin; insert into public.assets(id,asset_kind,code,name,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
  values('${vehicle}','vehicle','DELIVERY-TRUCK','Delivery truck','Test','Test',current_date,'company_owned','available','${location}','${users.admin}','${users.admin}');
  insert into public.vehicle_details(asset_id,vehicle_type,plate_number) values('${vehicle}','Truck','TST-456');
  insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users.engineer}/${fuelKey}/receipt.webp'); commit;`);
 const fuelReceipt=result(await as('engineer',`select public.submit_vehicle_fuel_receipt('${fuelKey}','${project}','${site}','${vehicle}',75.75,'company_cash','Hauling fuel')`));
 const after=await read();
 assert.equal(Number(after.find(x=>x.bucket==='permit').amount)-Number(before.find(x=>x.bucket==='permit')?.amount??0),150.25);
 assert.equal(Number(after.find(x=>x.bucket==='site_receipt').amount)-Number(before.find(x=>x.bucket==='site_receipt')?.amount??0),300);
 assert.equal(Number(after.find(x=>x.bucket==='fuel').amount)-Number(before.find(x=>x.bucket==='fuel')?.amount??0),75.75);
 assert.equal(scalar(await as('admin',`select receipt_id from public.get_project_expense_entries('${project}','fuel') where receipt_id='${fuelReceipt}'`)),fuelReceipt);
 assert.equal(scalar(await sql(`select private.project_expense_bucket('other','fuel')`)),'fuel');
 assert.equal(scalar(await sql(`select private.project_expense_bucket('labor','expense')`)),'labor');
 const p=JSON.parse(scalar(await as('finance',`select row_to_json(x) from public.get_project_profitability('${project}') x`)));
 assert.equal(after.filter(x=>!['labor','equipment'].includes(x.bucket)).reduce((n,x)=>n+Number(x.amount),0),Number(p.other_cost));
 const rows=JSON.parse(scalar(await as('finance',`select jsonb_agg(x) from public.get_project_expense_entries('${project}','permit',0,1) x`)));
 assert.equal(rows.length,1);assert.equal(rows[0].bucket,'permit');assert.ok(Number(rows[0].total_count)>=1);
 await as('admin',`select public.reverse_project_cost_entry('${randomUUID()}','expense','${id}','Permit was recorded twice')`);
 const reversed=await read();assert.equal(Number(reversed.find(x=>x.bucket==='permit')?.amount??0),Number(before.find(x=>x.bucket==='permit')?.amount??0));
 assert.equal(scalar(await as('finance',`select reversal_reason from public.get_project_expense_entries('${project}','permit') where id='${id}'`)),'Permit was recorded twice');
 for(const role of ['foreman','engineer','warehouse_staff']){
  await assert.rejects(read(role),/Not authorized/);
  await assert.rejects(as(role,`select * from public.get_project_expense_entries('${project}')`),/Not authorized/);
 }
 await assert.rejects(sql(`set role anon;select * from public.get_project_expense_breakdown('${project}')`),/permission denied/);
 await assert.rejects(as('finance',`select * from public.get_project_expense_entries('${project}','invalid')`),/Invalid/);
 assert.equal(scalar(await as('finance',`select count(*) from public.get_project_expense_breakdown('${randomUUID()}')`)),'0');
 console.log('PASS expense breakdown: precise totals reconcile, real linked receipt source, category precedence, filtered pagination, reversal audit, role/anonymous denial and project isolation.');
});
