import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";

let notificationsBefore;
await withIsolatedPostgres(async ({ sql, as, scalar }) => {
  const value = async (query) => scalar(await sql(query));
  assert.equal(await value("select to_regclass('public.mobile_push_tokens') is null"), "t");
  assert.equal(await value("select to_regprocedure('public.register_mobile_push_token(text,text)') is null and to_regprocedure('public.unregister_mobile_push_token(text)') is null and to_regprocedure('private.send_notification_push()') is null and to_regprocedure('private.prune_invalid_push_tokens()') is null"), "t");
  assert.equal(await value("select count(*) from pg_trigger where tgname='notifications_send_push'"), "0");
  assert.equal(notificationsBefore, "1");
  assert.equal(await value("select count(*) from public.notifications where title='Push retirement fixture'"), notificationsBefore);
  for (const role of ['admin','finance','engineer','foreman','warehouse_staff']) {
    await as(role, 'select count(*) from public.notifications');
  }
  const transactionsBefore = await value('select count(*) from public.inventory_transactions');
  await sql(readFileSync(new URL('../supabase/migrations/20261014110000_retire_phone_push.sql', import.meta.url), 'utf8'));
  assert.equal(await value("select count(*) from public.notifications where title='Push retirement fixture'"), notificationsBefore);
  assert.equal(await value('select count(*) from public.inventory_transactions'), transactionsBefore);
  console.log('PASS: phone delivery objects retired, rerun safe, notification history and stock untouched, inbox remains readable for authenticated roles');
}, {
  beforeMigration: async ({ name, sql }) => {
    if (name !== '20261014110000_retire_phone_push.sql') return;
    await sql(`insert into auth.users(id,email,raw_user_meta_data) values('90000000-0000-0000-0000-000000000001','push-retirement@erp-test.local','{"full_name":"Retirement Fixture"}');
      insert into public.notification_outbox(id,event_key,type_code,title,message,entity_type,recipient_user_ids)
      values('90000000-0000-0000-0000-000000000002','push-retirement-fixture','SYSTEM','Push retirement fixture','Preserve this inbox alert','system',array['90000000-0000-0000-0000-000000000001'::uuid]);
      insert into public.mobile_push_tokens(token,user_id,platform) values('ExpoPushToken[retirementfixture123]','90000000-0000-0000-0000-000000000001','android');`);
    notificationsBefore = (await sql("select count(*) from public.notifications where title='Push retirement fixture'")).split('\n').at(-1);
  },
});
