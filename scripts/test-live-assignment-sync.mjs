import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
assert.equal(process.env.ERP_TEST_ASSIGNMENT_CYCLE,'1','explicitly enable the reversible test-account assignment cycle');
const password=process.env.ERP_TEST_ACCOUNT_PASSWORD;
assert.ok(password,'set the authorized staging test-account password');
const clients=[];
const open=async role=>{
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.signInWithPassword({email:`${role}@nognog.local`,password});
 assert.equal(error,null,`sign in ${role}`);clients.push(client);return {client,id:data.user.id};
};
const waitFor=async(predicate,label)=>{
 const until=Date.now()+15000;
 while(!predicate()&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(predicate(),label);
};
let originalAsset=null,driverId=null,admin,changed=false;
try{
 const manager=await open('admin'),driver=await open('driver'),finance=await open('finance');
 admin=manager.client;driverId=driver.id;
 const original=await driver.client.rpc('get_my_truck');assert.equal(original.error,null);
 assert.ok(original.data.length===1&&original.data[0].code.startsWith('QA-'),'only an already-assigned QA truck may be used');
 originalAsset=original.data[0].asset_id;
 const counts={admin:0,driver:0,forbidden:0};
 const payloadErrors=[];
 const subscribe=async(account,recipient,bucket)=>{
  const channel=account.client.channel(`live-qa-${bucket}-${Date.now()}`).on('postgres_changes',{event:'*',schema:'public',table:'live_refresh_signals',filter:`recipient_id=eq.${recipient}`},payload=>{
   if(payload.eventType==='DELETE')return;
   try {
    assert.deepEqual(Object.keys(payload.new).sort(),['id','recipient_id','topic','revision','changed_at'].sort());
    assert.equal(payload.new.recipient_id,recipient);counts[bucket]++;
   } catch(error) { payloadErrors.push(error.message); }
  });
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error(`subscription timed out: ${bucket}`)),15000);
   channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error(`subscription failed: ${bucket}`));}});
  });
 };
 await subscribe(manager,manager.id,'admin');await subscribe(driver,driver.id,'driver');await subscribe(finance,driver.id,'forbidden');
 assert.equal((await finance.client.from('live_refresh_signals').select('id')).data?.length,0);
 assert.equal((await driver.client.from('live_refresh_signals').select('id').eq('recipient_id',manager.id)).data?.length,0);
 console.log('PASS: separate Admin and Driver sessions subscribed; Finance cannot read driver signals.');
 changed=true;
 const remove=await admin.rpc('set_driver_truck',{p_driver_id:driverId,p_asset_id:null});assert.equal(remove.error,null);
 await waitFor(()=>counts.admin>0&&counts.driver>0,'Admin and Driver receive assignment removal');
 const empty=await driver.client.rpc('get_my_truck');assert.equal(empty.error,null);assert.equal(empty.data.length,0);
 console.log('PASS: removal delivered to Admin and Driver; My Truck is unassigned. Holding briefly for browser verification.');
 if(process.env.ERP_TEST_LIVE_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,25000));
 const before={...counts};
 const restore=await admin.rpc('set_driver_truck',{p_driver_id:driverId,p_asset_id:originalAsset});assert.equal(restore.error,null);changed=false;
 await waitFor(()=>counts.admin>before.admin&&counts.driver>before.driver,'Admin and Driver receive restoration');
 const restored=await driver.client.rpc('get_my_truck');assert.equal(restored.error,null);assert.equal(restored.data[0]?.asset_id,originalAsset);
 await new Promise(resolve=>setTimeout(resolve,500));assert.equal(counts.forbidden,0,'Finance receives no driver assignment events');assert.deepEqual(payloadErrors,[]);
 console.log('PASS: original QA truck restored; both accounts received the update; Finance received zero events.');
}finally{
 if(changed&&originalAsset&&driverId&&admin){
  const restore=await admin.rpc('set_driver_truck',{p_driver_id:driverId,p_asset_id:originalAsset});
  if(restore.error){fs.writeFileSync('../output/live-assignment-restore-required.json',JSON.stringify({driverId,assetId:originalAsset}));throw new Error('The QA assignment needs restoration; see the recovery file.');}
 }
 for(const client of clients){await client.removeAllChannels();await client.auth.signOut({scope:'local'});}
}
