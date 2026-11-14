import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServerClient} from '@supabase/ssr';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const base=new URL(process.env.ERP_TEST_URL??'http://localhost:3199');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname),'Use a local production web build');
assert.ok(process.env.ERP_TEST_ACCOUNT_PASSWORD,'Set the authorized test-account password');
const paths=['/dashboard','/projects','/requests','/inventory','/equipment','/vehicles','/purchase-orders','/suppliers','/site-purchases','/purchase-orders/receive','/documents','/reports/daily','/warehouses','/qr-codes','/scan','/employees','/attendance','/payroll','/users','/audit-logs','/profile','/notifications','/billing'];
const adminOnly=['/users','/users/drivers','/materials/new','/purchase-orders/new','/warehouses/new','/suppliers/new'];
const workforceOnly=['/employees/new','/employees/categories','/employees/id-cards'];
const results=[];
for(const role of ['admin','engineer','foreman','warehouse','finance','driver','hr']) {
 const cookies=new Map();
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>items.forEach(item=>cookies.set(item.name,item.value))}});
 const login=await client.auth.signInWithPassword({email:`${role}@nognog.local`,password:process.env.ERP_TEST_ACCOUNT_PASSWORD});
 assert.equal(login.error,null,`Sign in ${role}`);
 const assigned=await client.from('user_roles').select('role').eq('user_id',login.data.user.id);
 assert.equal(assigned.error,null);assert.deepEqual(assigned.data.map(row=>row.role),[role==='warehouse'?'warehouse_staff':role],`Isolated ${role} test role`);
 const read=async path=>{
  const response=await fetch(new URL(path,base),{redirect:'manual',headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')},signal:AbortSignal.timeout(60000)});
  const body=await response.text();const decoded=body.replaceAll('\\"','"');
  const denied=response.status===404||body.includes('NEXT_HTTP_ERROR_FALLBACK;404');
  const redirect=response.headers.get('location')??/NEXT_REDIRECT;replace;([^;]+);(?:307|303);/.exec(body)?.[1]??null;
  assert.ok(response.status<500&&!/"digest":"(?!NEXT_)[^"]+"/.test(decoded),`No generic server error: ${role} ${path}`);
  results.push({role,path,status:response.status,denied,redirect});
  return {body,denied,redirect};
 };
 try {
  for(let offset=0;offset<paths.length;offset+=3)await Promise.all(paths.slice(offset,offset+3).map(async path=>{
   const {body,denied,redirect}=await read(path);
   if(role==='driver'){assert.equal(redirect,'/driver-account');return;}
   if(path==='/dashboard')assert.equal(redirect,role==='warehouse'?'/inventory':null);
   if(role==='hr') {
    const allowed=['/dashboard','/employees','/attendance','/payroll','/profile','/notifications'];
    assert.equal(denied,!allowed.includes(path),`HR route boundary: ${path}`);
    if(path==='/dashboard')assert.ok(body.includes('HR overview')&&body.includes('Search employees'));
    if(path==='/employees')assert.ok(body.includes('Add employee')&&body.includes('Print ID cards'));
    if(path==='/payroll')assert.ok(body.includes('New payroll')&&body.includes('Add department'));
   }
   if(!['admin','hr'].includes(role)&&path==='/employees')assert.ok(!body.includes('Add employee'));
   if(!['admin','finance','hr'].includes(role)&&['/attendance','/payroll','/billing'].includes(path))assert.ok(denied);
   if(role==='finance'&&path==='/payroll')assert.ok(!body.includes('Add department'));
  }));
  for(const path of [...adminOnly,...workforceOnly].filter(path=>!paths.includes(path))){
   const result=await read(path);
   if(role==='driver')assert.equal(result.redirect,'/driver-account');
   else if(role==='admin'||(role==='hr'&&workforceOnly.includes(path)))assert.ok(!result.denied&&(path==='/employees/id-cards'||result.redirect));
   else assert.ok(result.denied,`Protected legacy route: ${role} ${path}`);
  }
  for(const path of adminOnly.filter(path=>paths.includes(path))) {
   const row=results.find(row=>row.role===role&&row.path===path);
   if(!['admin','driver'].includes(role))assert.ok(row.denied);
  }
  if(role==='hr') {
   for(const kind of ['project','employee']){const result=await read(`/api/reference-choices?kind=${kind}`);assert.ok(!result.denied);assert.ok(Array.isArray(JSON.parse(result.body).choices));}
   const profile=await fetch(new URL('/api/reference-choices?kind=profile',base),{headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')}});assert.equal(profile.status,403);
   const worker=await client.from('employees').select('id').is('archived_at',null).order('id').limit(1);
   assert.equal(worker.error,null);
   for(const page of ['Infinity','999999']) {
    const result=await read(`/employees?page=${page}`);
    assert.ok(!result.denied,'Invalid or stale employee pages recover without server errors');
   }
   if(worker.data[0]) {
    const details=await read(`/employees/${worker.data[0].id}`);
    assert.ok(!details.denied&&details.body.includes('Edit employee'));
    for(const label of ['Add rate','Costing basis','Close labor rate'])assert.ok(!details.body.includes(label),`HR employee details hide ${label}`);
    const editor=await read(`/employees/${worker.data[0].id}?edit=1`);
    assert.ok(!editor.denied&&editor.body.includes('Edit employee')&&!editor.body.includes('Optional user account'));
   }
   const assignment=await client.from('employee_project_assignments').select('project_id,employee_id').eq('status','active').order('id').limit(1);
   assert.equal(assignment.error,null);
   if(assignment.data[0]) {
    const scoped=await read(`/employees?project=${assignment.data[0].project_id}`);
    assert.ok(!scoped.denied&&scoped.body.includes(`/employees/${assignment.data[0].employee_id}`),'Project employee filter returns its assigned worker');
   }
   const payroll=await client.from('payroll_runs').select('id').eq('status','draft').order('id').limit(1);
   assert.equal(payroll.error,null);
   if(payroll.data[0]) {
    const details=await read(`/payroll/${payroll.data[0].id}`);
    assert.ok(!details.denied&&details.body.includes('Ask Admin to finalize'));
    for(const label of ['Finalize payroll','Void payroll','Mark as paid'])assert.ok(!details.body.includes(label),`HR payroll hides ${label}`);
    const csv=await read(`/payroll/${payroll.data[0].id}/export`);
    assert.ok(!csv.denied&&csv.body.includes('Attendance pay')&&csv.body.includes('Employee code'));
   }
  }
  console.log(`PASS ${role}: dashboard/home, page access, visible management controls and legacy URL denials.`);
 }finally{await client.auth.signOut({scope:'local'});}
}
if(process.env.ERP_TEST_REPORT_FILE)fs.writeFileSync(process.env.ERP_TEST_REPORT_FILE,JSON.stringify({testedAt:new Date().toISOString(),results},null,2));
console.log(`PASS ${results.length} authenticated read-only web checks. No business records changed.`);
