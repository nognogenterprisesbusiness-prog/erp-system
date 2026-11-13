import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const base=new URL(process.env.ERP_TEST_URL??'http://localhost:3194');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname),'use the local web build');
const password=process.env.ERP_TEST_ACCOUNT_PASSWORD;
assert.ok(password,'set the authorized test-account password');
const definitions=[
 ['requests','material_requests'],['employees','employees'],['materials','materials'],
 ['equipment','assets','equipment'],['vehicles','assets','vehicle'],['suppliers','suppliers'],
 ['warehouses','warehouses'],['site-purchases','site_purchases'],['payroll','payroll_runs'],
 ['purchase-orders','purchase_orders'],['purchase-orders/quotations','supplier_quotations'],
 ['purchase-orders/approvals','purchase_approval_requests'],['reports/daily','daily_reports'],
 ['qr-codes','qr_codes'],['billing','client_invoices'],['audit-logs','audit_logs'],
];
const samples=new Map();
const htmlPanelCount=body=>(body.match(/<dialog\b[^>]*data-record-detail-panel/g)??[]).length;
for(const role of ['admin','finance','engineer','foreman','warehouse']){
 const cookies=new Map();
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>items.forEach(item=>cookies.set(item.name,item.value))}});
 const {error}=await client.auth.signInWithPassword({email:`${role}@nognog.local`,password});
 assert.equal(error,null,`sign in ${role}`);
 const read=async path=>{
  const response=await fetch(new URL(path,base),{redirect:'manual',headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')},signal:AbortSignal.timeout(45000)});
  return {response,body:await response.text()};
 };
 try{
  if(role==='admin'){
   for(const [path,table,kind] of definitions){
    let query=client.from(table).select('id').order('id').limit(1);
    if(kind)query=query.eq('asset_kind',kind);
    const sample=await query;
    assert.equal(sample.error,null,`sample ${path}`);
    if(!sample.data.length){
     const missing=await read(`/${path}/00000000-0000-4000-8000-000000000099`);
     assert.equal(htmlPanelCount(missing.body),1,`empty ${path} keeps panel recovery`);
     assert.ok(missing.body.includes('This record is unavailable'));
     console.log(`PASS empty-record recovery (no staging sample): ${path}`);continue;
    }
    const id=sample.data[0].id;samples.set(path,id);
    const {response,body}=await read(`/${path}/${id}`);
    assert.equal(response.status,200,`direct ${path}`);
    assert.equal(htmlPanelCount(body),1,`one persistent panel: ${path}`);
    assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),`existing ${path} is readable`);
    console.log(`PASS direct panel: ${path}`);
   }
   const missing=await read('/requests/00000000-0000-4000-8000-000000000099');
   assert.equal(htmlPanelCount(missing.body),1);
   assert.ok(missing.body.includes('This record is unavailable'));
   const unsupportedEdit=await read(`/requests/${samples.get('requests')}?edit=1`);
   assert.equal(htmlPanelCount(unsupportedEdit.body),1,'an unsupported edit flag cannot bypass the panel');
  }
  if(role!=='admin'){
   for(const path of role==='finance'?['audit-logs','qr-codes']:['payroll','billing','audit-logs','qr-codes']){
    if(!samples.has(path))continue;
    const {response,body}=await read(`/${path}/${samples.get(path)}`);
    assert.ok(response.status===404||body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),`${role} denied ${path}`);
    console.log(`PASS denied ${role}: ${path}`);
   }
  }
  if(role!=='admin'){
   for(const [path,table,kind] of definitions.filter(([path])=>['employees','materials','equipment','vehicles','warehouses','site-purchases'].includes(path))){
    let query=client.from(table).select('id').order('id').limit(1);
    if(kind)query=query.eq('asset_kind',kind);
    const visible=await query;
    if(!visible.data?.length)continue;
    const {response,body}=await read(`/${path}/${visible.data[0].id}`);
    assert.equal(response.status,200,`${role} visible ${path}`);
    assert.equal(htmlPanelCount(body),1,`${role} visible ${path} keeps its panel`);
    assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),`${role} record access is preserved: ${path}`);
    console.log(`PASS permitted ${role}: ${path}`);
   }
  }
  const requests=await client.from('material_requests').select('id').order('id').limit(1);
  if(requests.data?.length){
   const {response,body}=await read(`/requests/${requests.data[0].id}`);
   assert.equal(response.status,200);
   assert.equal(htmlPanelCount(body),1,`${role} permitted request stays in the panel`);
   assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;404'));
   console.log(`PASS permitted ${role}: requests`);
  }
 }finally{await client.auth.signOut({scope:'local'});}
}
console.log('PASS: direct-load record panels, unavailable record recovery, unsupported edit flag and role denials. No business records changed.');
