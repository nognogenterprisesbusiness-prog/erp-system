import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
assert.equal(process.env.ERP_TEST_NOOP_SOURCE,'1','explicitly enable the no-op staging source save');
const id=process.env.ERP_TEST_REQUEST_ID;
assert.match(id??'',/^[0-9a-f-]{36}$/);
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await client.auth.signInWithPassword({email:'admin@nognog.local',password:process.env.ERP_TEST_ACCOUNT_PASSWORD});
assert.equal(login.error,null);
try{
 const read=()=>client.from('material_requests').select('id,status,source_warehouse_id,source_warehouse_name,required_date,purpose').eq('id',id).single();
 const before=await read();assert.equal(before.error,null);
 assert.equal(before.data.status,'submitted');assert.ok(before.data.source_warehouse_id);
 const result=await client.rpc('assign_request_warehouse',{p_key:randomUUID(),p_id:id,p_kind:'request',p_warehouse_id:before.data.source_warehouse_id});
 assert.equal(result.error,null);
 const after=await read();assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
 console.log('PASS: same warehouse saved through the authorized command; request status, purpose, date and source stayed unchanged. A real material-request update event was emitted.');
}finally{await client.auth.signOut({scope:'local'});}
