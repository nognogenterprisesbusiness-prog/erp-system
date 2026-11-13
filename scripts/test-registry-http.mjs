import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const base = new URL(process.env.ERP_TEST_URL ?? "http://localhost:3176");
if (!["localhost","127.0.0.1","[::1]"].includes(base.hostname)) throw new Error("Use a local ERP server for this read-only check.");
const password = process.env.ERP_TEST_ACCOUNT_PASSWORD;
if (!password) throw new Error("Set ERP_TEST_ACCOUNT_PASSWORD for the authorized staging test accounts.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Public Supabase configuration is required.");
const anon = await fetch(new URL('/api/reference-choices?kind=profile',base),{redirect:'manual'});
assert.ok([301,302,303,307,308,401,403].includes(anon.status));
for (const role of ['admin','finance','engineer','foreman','warehouse']) {
  const cookies = new Map();
  const client = createServerClient(url,key,{cookies:{ getAll:()=>[...cookies].map(([name,value])=>({name,value})), setAll:items=>{for(const item of items) cookies.set(item.name,item.value);} }});
  const login = await client.auth.signInWithPassword({email:`${role}@nognog.local`,password});
  if (login.error) throw new Error(`Unable to sign into the authorized ${role} test account.`);
  try {
    const read = params => fetch(new URL(`/api/reference-choices?${new URLSearchParams(params)}`,base), { headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')},redirect:'manual',signal:AbortSignal.timeout(15000) });
    for(const kind of ['profile','employee','project','site']) {
      const response=await read({kind});
      assert.match(response.headers.get('cache-control')??'',/no-store/);
      assert.equal(response.status,['admin','finance'].includes(role)?200:403,`${role} ${kind}`);
      if(response.status===200){const data=await response.json(); assert.ok(data.choices.length<=20); assert.ok(Number.isSafeInteger(data.count));}
    }
    if(role==='admin') {
      for(const params of [{kind:'profile',page:'0'},{kind:'profile',selected:'bad-id'},{kind:'profile',q:'x'.repeat(101)},{kind:'unknown'}]) assert.equal((await read(params)).status,400);
      const accounts=await (await read({kind:'profile'})).json();
      if(accounts.choices.length){const first=accounts.choices[0];const found=await (await read({kind:'profile',q:first.secondary})).json();assert.ok(found.choices.some(row=>row.value===first.value),'full email addresses remain searchable');}
      const employees=await (await read({kind:'employee'})).json();
      if(employees.choices.length){const first=employees.choices[0];const found=await (await read({kind:'employee',q:first.label})).json();assert.ok(found.choices.some(row=>row.value===first.value),'full employee names remain searchable');}
      if(process.env.ERP_TEST_REGISTRY_SQL_APPLIED==='1') { const response=await read({kind:'asset_location'});assert.equal(response.status,200);assert.ok((await response.json()).choices.length<=20); }
    }
    if(process.env.ERP_TEST_REGISTRY_SQL_APPLIED==='1') {
      const locations = await read({kind:'asset_location'});
      assert.equal(locations.status,200,`${role} location search`);
      const choices=await locations.json();
      assert.ok(choices.choices.length<=20);
      if(choices.choices.length) {
        const first=choices.choices[0];
        const selected=await (await read({kind:'asset_location',selected:first.value})).json();
        assert.equal(selected.choices[0]?.value,first.value);
      }
      const now=new Date();
      const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5,1)).toISOString().slice(0,10);
      const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);
      const actual=new Map();
      for(let from=0;;from+=500) {
        const rows=await client.rpc('get_monthly_material_consumption',{p_from:start,p_to:end}).order('month').order('material_id').order('unit_id').range(from,from+499);
        assert.equal(rows.error,null,`${role} monthly consumption read`);
        for(const row of rows.data) actual.set(`${row.month}:${row.material_id}:${row.unit_id}`,Number(row.quantity));
        if(rows.data.length<500) break;
      }
      const expected=new Map();
      for(let from=0;;from+=500) {
        const rows=await client.from('inventory_transactions').select('id,material_id,unit_of_measure_id,transaction_date,quantity').eq('transaction_type','MATERIAL_CONSUMPTION').gte('transaction_date',start).lt('transaction_date',end).order('id').range(from,from+499);
        assert.equal(rows.error,null);
        const reversed=new Set();
        for(let i=0;i<rows.data.length;i+=100) {
          const corrections=await client.from('inventory_transactions').select('reversal_of').in('reversal_of',rows.data.slice(i,i+100).map(row=>row.id));
          assert.equal(corrections.error,null);
          corrections.data.forEach(row=>reversed.add(row.reversal_of));
        }
        for(const row of rows.data) if(!reversed.has(row.id)) {
          const id=`${row.transaction_date.slice(0,7)}:${row.material_id}:${row.unit_of_measure_id}`;
          expected.set(id,(expected.get(id)??0)+Math.abs(Number(row.quantity)));
        }
        if(rows.data.length<500) break;
      }
      assert.equal(actual.size,expected.size);
      for(const [id,value] of expected) assert.ok(Math.abs(actual.get(id)-value)<0.0001,`${role} chart reconciles with visible ledger`);
      console.log(`PASS staging migration: ${role} location lookup and chart/ledger reconciliation.`);
    }
    console.log(`PASS read-only reference HTTP: ${role} authorization, bounded results and private cache policy.`);
  } finally { await client.auth.signOut({scope:'local'}); }
}
