-- Partner news: notifications when the other person shares, posts, writes or thinks of you.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

update public.profiles set timezone = 'Asia/Kuching', display_name = 'Vee' where id = :'A';
update public.profiles set timezone = 'America/Santiago', display_name = 'Jonatan' where id = :'B';
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

-- 13:00 UTC = 9 pm in Kuching, 10 am in Santiago: both awake.
select ((date_trunc('day', now() at time zone 'UTC') - interval '1 day' + interval '13 hours') at time zone 'UTC') as t \gset

-- thinking of you: many taps, one notification
insert into public.nudges (relationship_id, sender_id, created_at)
select :'rel', :'B', :'t'::timestamptz - (g || ' minutes')::interval from generate_series(5, 25, 5) g;
select tests.expect((select count(*) from public.due_reminders(:'t') where kind = 'love' and user_id = :'A') = 1, 'five taps, one notification');
select tests.expect((select title from public.due_reminders(:'t') where kind = 'love' and user_id = :'A') = 'Jonatan is thinking of you ♥', 'says who');
select tests.expect((select count(*) from public.due_reminders(:'t') where kind = 'love' and user_id = :'B') = 0, 'not to the one who tapped');

-- quiet hours: 3 am in Kuching (19:00 UTC) — nothing for Vee
select tests.expect((select count(*) from public.due_reminders(:'t'::timestamptz + interval '6 hours') where kind = 'love' and user_id = :'A') = 0, 'nothing at night');

-- turned off
update public.profiles set remind_love = false where id = :'A';
select tests.expect((select count(*) from public.due_reminders(:'t') where kind = 'love' and user_id = :'A') = 0, 'can be turned off');
update public.profiles set remind_love = true where id = :'A';

-- apart mission entry
insert into public.apart_missions (relationship_id, activity_id, started_by, created_at)
select :'rel', (select id from public.play_activities limit 1), :'B', :'t'::timestamptz - interval '2 hours' returning id as mission \gset
insert into public.apart_entries (mission_id, relationship_id, user_id, body, created_at)
values (:'mission', :'rel', :'B', 'a little photo walk', :'t'::timestamptz - interval '1 hour');
select tests.expect((select count(*) from public.due_reminders(:'t') where kind = 'mission' and user_id = :'A') = 1, 'mission post reaches the other');
select tests.expect((select bool_and(body not ilike '%photo walk%') from public.due_reminders(:'t')), 'never includes what they wrote');

-- letters are on for everyone now
select tests.expect((select bool_and(column_default = 'true') from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('remind_letters', 'remind_partner', 'remind_love')), 'letters and partner news on by default');

-- only the sender can see who is due
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select * from public.due_reminders()', 'permission denied');
select public.set_news_prefs(false, null);
reset role;
select tests.expect((select not remind_partner and remind_love from public.profiles where id = :'A'), 'each person sets their own');
update public.profiles set remind_partner = true where id = :'A';
delete from public.nudges where relationship_id = :'rel';
delete from public.apart_missions where id = :'mission';
