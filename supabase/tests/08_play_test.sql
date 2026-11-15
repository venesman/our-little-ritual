-- Phase 5: Play With Me.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- ------------------------------------------------------------ library
select tests.expect((select count(*) from public.play_activities) = 90, '90 play activities seeded');
select tests.expect(not exists (select category from public.play_activities group by category having count(*) <> 15), '15 per category');
select tests.expect((select count(distinct category) from public.play_activities) = 6, 'six categories');
-- every mood, energy and type has activities to draw from
select tests.expect((select count(*) from (select distinct unnest(moods) from public.play_activities) m) = 6, 'all six moods covered');
select tests.expect((select count(distinct energy) from public.play_activities) = 3, 'all three energy levels covered');
select tests.expect((select count(distinct activity_type) from public.play_activities) = 5, 'all five types covered');

-- -------------------------------------------------------- who can play
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.start_play_session()', 'once your partner has joined');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error('select public.start_play_session()', 'once your partner has joined');
reset role;
set role anon;
select tests.expect_error('select public.start_play_session()', 'permission denied');
reset role;

-- ------------------------------------------ one shared session for both
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.start_play_session() as sid \gset
select tests.expect(public.current_play_state() ->> 'session_id' = :'sid', 'current_play_state finds the open session');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(public.start_play_session() = :'sid'::uuid, 'partner joins the same session');
reset role;

-- --------------------------------------------------------- filters
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.draw_play_activity(:'sid', '{"minutes":5,"energy":"high","type":"guessing"}') -> 'current' -> 'activity' as act \gset
select tests.expect((:'act'::jsonb ->> 'minutes')::int <= 5, 'time filter respected');
select tests.expect(:'act'::jsonb ->> 'energy' = 'high', 'energy filter respected');
select tests.expect(:'act'::jsonb ->> 'activity_type' = 'guessing', 'type filter respected');
select public.draw_play_activity(:'sid', '{"moods":["deep"]}') -> 'current' -> 'activity' as act2 \gset
select tests.expect(:'act2'::jsonb -> 'moods' ? 'deep', 'mood filter respected');
select tests.expect((public.draw_play_activity(:'sid', '{"moods":["bogus"],"minutes":"999","energy":"x"}') -> 'filters') = '{}'::jsonb, 'unknown filter values are ignored');
select tests.expect_error(format('select public.draw_play_activity(%L, %L)', :'sid', '{"minutes":5,"type":"virtual_date","energy":"high"}'), 'Nothing matches');
reset role;

-- partner sees exactly the same current activity
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.draw_play_activity(:'sid', '{}') -> 'current' ->> 'item_id' as cur_a \gset
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(public.current_play_state() -> 'current' ->> 'item_id' = :'cur_a', 'both phones see the same activity');
reset role;

-- ------------------------------------------ no repeats, then reshuffle
-- "minutes 5 + energy high + type talking" matches a small pool; drain it.
select count(*) as pool from public.play_activities a where public.play_matches(a, '{"minutes":5,"energy":"high","type":"talking"}') \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.end_play_session(:'sid');
select public.start_play_session() as sid2 \gset
reset role;   -- the drain loop uses an internal helper; auth.uid() still comes from the claim
do $$
declare s uuid := (select id from public.play_sessions where ended_at is null limit 1);
        n int := (select count(*) from public.play_activities a where public.play_matches(a, '{"minutes":5,"energy":"high","type":"talking"}'));
        r jsonb;
begin
  for k in 1..n loop
    r := public.draw_play_activity(s, '{"minutes":5,"energy":"high","type":"talking"}');
    if (r ->> 'reshuffled')::boolean then raise exception 'FAIL: reshuffled too early at draw %', k; end if;
  end loop;
  r := public.draw_play_activity(s, '{"minutes":5,"energy":"high","type":"talking"}');
  if not (r ->> 'reshuffled')::boolean then raise exception 'FAIL: expected a reshuffle after % draws', n; end if;
  if (r ->> 'round')::int <> 2 then raise exception 'FAIL: expected round 2'; end if;
end $$;
set role authenticated;
select tests.expect((select count(distinct activity_id) = count(*) from public.play_session_items where session_id = :'sid2' and round = 1),
                    'no repeats within a round');
select tests.expect((select count(*) from public.play_session_items where session_id = :'sid2' and round = 1) = :pool, 'round 1 played the whole matching pool');
reset role;

-- ------------------------------------------------------ status & timer
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select (public.current_play_state() -> 'current' ->> 'item_id') as item \gset
select tests.expect(public.set_play_item_status(:'item', 'done') -> 'current' ->> 'status' = 'done', 'partner can mark it done');
select tests.expect_error(format('select public.set_play_item_status(%L, %L)', :'item', 'bogus'), 'Unknown status');

select public.play_timer(:'sid2', 'reset', 60);
select tests.expect((public.current_play_state() -> 'timer' ->> 'remaining_s')::int = 60, 'timer reset to 60 s');
select public.play_timer(:'sid2', 'start');
select tests.expect(public.current_play_state() -> 'timer' ->> 'ends_at' is not null, 'timer running (ends_at set)');
select pg_sleep(1.2);
select public.play_timer(:'sid2', 'pause');
select tests.expect((public.current_play_state() -> 'timer' ->> 'remaining_s')::int between 57 and 59, 'paused timer kept the remaining time');
select public.play_timer(:'sid2', 'start');
select public.play_timer(:'sid2', 'start');  -- starting twice is harmless
select tests.expect(public.current_play_state() -> 'timer' ->> 'remaining_s' is null, 'running again');
select tests.expect_error(format('select public.play_timer(%L, %L, 5)', :'sid2', 'reset'), '10 seconds to 2 hours');
select tests.expect_error(format('select public.play_timer(%L, %L)', :'sid2', 'explode'), 'Unknown timer action');
-- no direct writes
select tests.expect_error(format('update public.play_sessions set round = 99 where id = %L', :'sid2'), 'permission denied');
select tests.expect_error(format('insert into public.play_session_items (session_id, activity_id, round, position) select %L, id, 1, 999 from public.play_activities limit 1', :'sid2'), 'permission denied');

-- play a specific activity (from favourites)
select id as specific from public.play_activities where code = 39 \gset
select tests.expect(public.draw_play_activity(:'sid2', '{}', :'specific') -> 'current' -> 'activity' ->> 'code' = '39', 'can play a chosen favourite');
select tests.expect((public.draw_play_activity(:'sid2', '{}', :'specific') ->> 'reshuffled')::boolean, 'replaying it starts a fresh round');
select tests.expect_error(format('select public.draw_play_activity(%L, %L, %L)', :'sid2', '{}', gen_random_uuid()), 'isn''t available');
reset role;

-- --------------------------------------------------------- outsiders
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.play_sessions) = 0, 'outsider sees no sessions');
select tests.expect((select count(*) from public.play_session_items) = 0, 'outsider sees no items');
select tests.expect(public.current_play_state() is null, 'outsider has no state');
select tests.expect(public.play_state(:'sid2') is null, 'outsider cannot read the state by id');
select tests.expect_error(format('select public.draw_play_activity(%L)', :'sid2'), 'isn''t available');
select tests.expect_error(format('select public.play_timer(%L, %L)', :'sid2', 'pause'), 'isn''t available');
select tests.expect_error(format('select public.set_play_item_status(%L, %L)', :'item', 'skipped'), 'isn''t available');
reset role;

-- --------------------------------------------------------- favourites
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select id as fav_act from public.play_activities where code = 31 \gset
select tests.expect(public.toggle_play_favourite(:'fav_act', 'mine') = true, 'save to my favourites');
select tests.expect(public.toggle_play_favourite(:'fav_act', 'ours') = true, 'save to Our Favourite Things');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.play_favourites where scope = 'mine') = 0, 'partner cannot see my private favourites');
select tests.expect((select count(*) from public.play_favourites where scope = 'ours') = 1, 'partner sees Our Favourite Things');
select tests.expect(public.toggle_play_favourite(:'fav_act', 'ours') = false, 'partner can remove from Our Favourite Things');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.play_favourites) = 0, 'outsider sees no favourites');
select tests.expect_error(format('select public.toggle_play_favourite(%L, %L)', :'fav_act', 'ours'), 'space first');
reset role;

-- ----------------------------------------------------------- ending
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.end_play_session(:'sid2');
select tests.expect(public.current_play_state() is null, 'ended session is no longer current');
select tests.expect_error(format('select public.draw_play_activity(%L)', :'sid2'), 'ended');
select tests.expect((select count(*) from public.play_sessions where ended_at is not null) = 2, 'history keeps ended sessions');
reset role;

\echo 'play with me tests: all passed'
