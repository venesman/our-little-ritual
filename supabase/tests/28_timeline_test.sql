-- Timeline.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set D '00000000-0000-0000-0000-00000000000d'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_milestone(null, 'milestone', 'First video call', date '2025-03-14', 'Three hours!');
select public.save_milestone(null, 'memory', 'No date yet');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'kind' = 'began') = 1, 'the day your space began');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'title' = 'First video call' and e->>'on' = '2025-03-14') = 1, 'dated milestones appear');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'title' = 'No date yet') = 0, 'undated ones wait for a date');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'kind' = 'first') >= 3, 'firsts noticed (ritual, letter, quiz…)');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'kind' = 'moment') >= 1, 'trips appear');
select tests.expect((public.timeline_feed() -> 0 ->> 'on') >= (public.timeline_feed() -> -1 ->> 'on'), 'newest first');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(not exists (select 1 from jsonb_array_elements(public.timeline_feed()) e where e->>'title' = 'First video call'), 'another couple sees only their own');
reset role;
set role anon;
select tests.expect_error('select public.timeline_feed()', 'permission denied');
reset role;

-- export counts include the newer activities
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select sum(games) >= 1 and sum(creations) >= 1 and sum(songs) >= 1 from public.export_activity_summary_v2(date '2025-01-01', current_date)), 'export counts games, creations and songs');
reset role;
