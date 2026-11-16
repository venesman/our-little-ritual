-- Your own quiet hours: off by default; hearts and letters always come through.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

update public.profiles set timezone = 'Asia/Kuching', display_name = 'Vee', quiet_start = null, quiet_end = null where id = :'A';
update public.profiles set timezone = 'America/Santiago', display_name = 'Jonatan' where id = :'B';
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

-- 15:00 UTC = 11 pm in Kuching
select ((date_trunc('day', now() at time zone 'UTC') - interval '3 days' + interval '15 hours') at time zone 'UTC') as t \gset
insert into public.nudges (relationship_id, sender_id, created_at) values (:'rel', :'B', :'t'::timestamptz - interval '1 minute');
insert into public.apart_missions (relationship_id, activity_id, started_by, created_at)
select :'rel', (select id from public.play_activities limit 1), :'B', :'t'::timestamptz - interval '2 hours' returning id as mission \gset
insert into public.apart_entries (mission_id, relationship_id, user_id, body, created_at)
values (:'mission', :'rel', :'B', 'night post', :'t'::timestamptz - interval '1 minute') returning id as entry \gset

select tests.expect((select count(*) from public.due_reminders(:'t') where user_id = :'A' and kind = 'love') = 1, 'no quiet hours by default: heart at 11 pm');
select tests.expect((select count(*) from public.due_reminders(:'t') where user_id = :'A' and ref = :'entry'::text) = 1, 'no quiet hours by default: mission at 11 pm');

-- Vee sets 10 pm – 8 am
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.set_quiet_hours(22, 8);
select tests.expect_error($$select public.set_quiet_hours(9, 9)$$, 'different hours');
reset role;
select tests.expect((select quiet_start = 22 and quiet_end = 8 from public.profiles where id = :'A'), 'quiet hours saved');

select tests.expect((select count(*) from public.due_reminders(:'t') where user_id = :'A' and kind = 'love') = 1, 'heart still comes through in quiet hours');
select tests.expect((select count(*) from public.due_reminders(:'t') where user_id = :'A' and ref = :'entry'::text) = 0, 'your-turn news waits');
-- 00:30 UTC next day = 8:30 am in Kuching: it arrives
select tests.expect((select count(*) from public.due_reminders(:'t'::timestamptz + interval '9 hours 30 minutes') where user_id = :'A' and ref = :'entry'::text) = 1, 'arrives when quiet hours end');

-- daytime window (13 – 15) also works
update public.profiles set quiet_start = 13, quiet_end = 15 where id = :'A';
select tests.expect((select count(*) from public.due_reminders(:'t') where user_id = :'A' and ref = :'entry'::text) = 1, 'outside a daytime window: delivered');

-- turn off
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.set_quiet_hours(null, null);
reset role;
select tests.expect((select quiet_start is null and quiet_end is null from public.profiles where id = :'A'), 'quiet hours off');
