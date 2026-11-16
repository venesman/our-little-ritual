-- Gentle reminders: subscriptions are private; reminders are due only at the right moments.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

update public.profiles set timezone = 'Asia/Kuching' where id = :'A';
update public.profiles set timezone = 'America/Santiago' where id = :'B';

-- --------------------------------------------------------- subscriptions
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.save_push_subscription(''https://push.example/c'', ''xxxxxxxxxxxx'', ''yyyyyyyyy'')', 'once you''re in a space');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.save_push_subscription(''http://push.example/a'', ''xxxxxxxxxxxx'', ''yyyyyyyyy'')', 'isn''t valid');
select public.save_push_subscription('https://push.example/vee-iphone', 'BPUBLICKEYxxxxxxxxxxxx', 'authsecret1', 'iPhone');
select public.save_push_subscription('https://push.example/vee-iphone', 'BPUBLICKEYxxxxxxxxxxxx', 'authsecret1', 'iPhone');
select tests.expect(public.my_push_devices() = 1, 'subscribing twice keeps one device');
select tests.expect_error('select p256dh from public.push_subscriptions', 'permission denied');
select tests.expect_error('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), ''https://x'', ''y'', ''z'')', 'permission denied');
select tests.expect_error('select * from public.reminder_log', 'permission denied');
select tests.expect_error('select * from public.due_reminders()', 'permission denied');
select public.set_reminder_prefs(true, true, true);
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.push_subscriptions) = 0, 'partner can''t see your devices');
select public.save_push_subscription('https://push.example/him-android', 'BPUBLICKEYyyyyyyyyyyyy', 'authsecret2', 'Android');
select public.set_reminder_prefs(true, false, null);
select public.delete_push_subscription('https://push.example/vee-iphone');   -- not his: no effect
reset role;
select tests.expect((select count(*) from public.push_subscriptions) = 2, 'one device each; nobody can remove the other''s');

-- ---------------------------------------------------------------- Monday
select (public.ritual_week_start(now()) + interval '7 days') as nextmon \gset
select tests.expect((select count(*) from public.due_reminders(:'nextmon'::timestamptz + interval '5 minutes') where kind = 'monday') = 2,
                    'Monday: both of you, right after the postcard opens');
select tests.expect((select count(*) from public.due_reminders(:'nextmon'::timestamptz + interval '2 hours') where kind = 'monday') = 0,
                    'Monday: not again later that day');
select tests.expect((select count(*) from public.due_reminders(:'nextmon'::timestamptz - interval '5 minutes') where kind = 'monday') = 0,
                    'Monday: nothing before it opens');
select tests.expect((select bool_and(body not ilike '%' || coalesce((select title from public.activities limit 1), '~') || '%') from public.due_reminders(:'nextmon'::timestamptz + interval '5 minutes')),
                    'reminders never name the activity');

-- --------------------------------------------------------------- Thursday
-- Thursday 7 pm in Kuching is 11:00 UTC; in Santiago (summer) it is 22:00 UTC.
select (:'nextmon'::timestamptz + interval '3 days') as thu11 \gset
select tests.expect((select count(*) from public.due_reminders(:'thu11'::timestamptz) where kind = 'midweek' and user_id = :'A') = 1,
                    'Thursday 7 pm Kuching: nudge for Vee (nothing done yet that week)');
select tests.expect((select count(*) from public.due_reminders(:'thu11'::timestamptz + interval '1 hour') where kind = 'midweek' and user_id = :'A') = 0,
                    'only at 7 pm, once');
select tests.expect((select count(*) from public.due_reminders(:'thu11'::timestamptz + interval '11 hours') where kind = 'midweek' and user_id = :'B') = 0,
                    'no Thursday nudge for someone who turned it off');
update public.profiles set remind_midweek = true where id = :'B';
select tests.expect((select count(*) from public.due_reminders(:'thu11'::timestamptz + interval '11 hours') where kind = 'midweek' and user_id = :'B') = 1,
                    'Thursday 7 pm Santiago: in his own time zone');

-- This week: if both the ritual and check-in are done, no nudge.
select public.ritual_week_start(now()) as thisweek \gset
select (date_trunc('week', now() at time zone 'Asia/Kuching') + interval '3 days 19 hours') at time zone 'Asia/Kuching' as thisthu \gset
select id as thisritual from public.weekly_activities w where w.relationship_id = (select relationship_id from public.relationship_members where user_id = :'A') and w.week_start = :'thisweek' \gset
select tests.expect(
  case when :'thisthu'::timestamptz < :'thisweek'::timestamptz then true   -- this week's Thursday came before the boundary: skip
       else (select count(*) from public.due_reminders(:'thisthu'::timestamptz) where kind = 'midweek' and user_id = :'A') =
            (case when exists (select 1 from public.activity_submissions s where s.weekly_activity_id = :'thisritual' and s.user_id = :'A' and s.status = 'submitted')
                   and exists (select 1 from public.checkins c where c.user_id = :'A' and c.week_start = :'thisweek' and c.status = 'submitted') then 0 else 1 end)
  end, 'Thursday nudge only when something is still waiting');

-- ---------------------------------------------------------------- letters
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.save_letter(null, 'note', '', 'Thinking of you') as l \gset
select public.send_letter(:'l');
reset role;
select tests.expect((select count(*) from public.due_reminders(now() + interval '1 minute') where kind = 'letter' and user_id = :'A' and ref = :'l') = 1,
                    'letter reminder for Vee (she turned letters on)');
select tests.expect((select body from public.due_reminders(now() + interval '1 minute') where kind = 'letter' and ref = :'l') not like '%Thinking%',
                    'letter reminders never include the letter');
select tests.expect((select count(*) from public.due_reminders(now() + interval '2 hours') where kind = 'letter' and ref = :'l') = 0,
                    'only once, around when it arrives');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.set_reminder_prefs(null, null, false);
reset role;
select tests.expect((select count(*) from public.due_reminders(now() + interval '1 minute') where kind = 'letter' and user_id = :'A') = 0, 'letters off → no letter reminders');

-- No subscription → never due.
delete from public.push_subscriptions where user_id = :'B';
select tests.expect((select count(*) from public.due_reminders(:'nextmon'::timestamptz + interval '5 minutes') where user_id = :'B') = 0,
                    'no device → no reminders');
