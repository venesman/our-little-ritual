-- Phase 6: Call Session Mode.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

-- every length adds up and has the right steps
select tests.expect((select sum(minutes) from public.call_plan_slots(15)) = 15, '15-min plan adds up');
select tests.expect((select sum(minutes) from public.call_plan_slots(30)) = 30, '30-min plan adds up');
select tests.expect((select sum(minutes) from public.call_plan_slots(45)) = 45, '45-min plan adds up');
select tests.expect((select sum(minutes) from public.call_plan_slots(60)) = 60, '60-min plan adds up');
select tests.expect((select sum(minutes) from public.call_plan_slots(90)) = 90, '90-min plan adds up');
select tests.expect((select string_agg(slot || ':' || minutes, ' ' order by ord) from public.call_plan_slots(45))
                    = 'warm_up:5 guessing:10 creative:15 heart:10 closing:5', '45 min = warm-up 5, guessing 10, creative 15, heart 10, closing 5');
-- every slot type has at least one fitting activity that fits its minutes
select tests.expect(not exists (
  select 1 from (select distinct slot, minutes from (select * from public.call_plan_slots(15) union all select * from public.call_plan_slots(30)
     union all select * from public.call_plan_slots(45) union all select * from public.call_plan_slots(60) union all select * from public.call_plan_slots(90)) x) s
  where not exists (select 1 from public.play_activities a where public.slot_fits(a, s.slot) and a.minutes <= s.minutes)),
  'every slot has a fitting activity of the right length');

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.generate_call_plan(45)', 'once your partner has joined');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.generate_call_plan(40)', '15, 30, 45, 60 or 90');
select public.generate_call_plan(45) as plan \gset
select tests.expect(:'plan'::jsonb ->> 'mode' = 'planned', 'session is in planned mode');
select tests.expect(jsonb_array_length(:'plan'::jsonb -> 'plan') = 5, '45-min plan has 5 steps');
select tests.expect((select bool_and((e -> 'activity' ->> 'minutes')::int <= (e ->> 'planned_minutes')::int) from jsonb_array_elements(:'plan'::jsonb -> 'plan') e),
                    'every activity fits its step''s minutes');
select tests.expect((select count(distinct e -> 'activity' ->> 'id') from jsonb_array_elements(:'plan'::jsonb -> 'plan') e) = 5, 'no duplicates in the plan');
select tests.expect((select string_agg(e ->> 'slot', ' ') from jsonb_array_elements(:'plan'::jsonb -> 'plan') e) = 'warm_up guessing creative heart closing', 'steps in order');
select tests.expect(:'plan'::jsonb -> 'current' ->> 'slot' = 'warm_up', 'starts on the warm-up');
select tests.expect((:'plan'::jsonb -> 'timer' ->> 'remaining_s')::int = 300, 'timer set to the warm-up''s 5 minutes');
reset role;
select tests.expect((select bool_and(public.slot_fits(a, e ->> 'slot')) from jsonb_array_elements(:'plan'::jsonb -> 'plan') e
                     join public.play_activities a on a.id = (e -> 'activity' ->> 'id')::uuid), 'every step matches its theme');

-- partner sees the same plan, and can drive it
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(public.current_play_state() -> 'plan' = :'plan'::jsonb -> 'plan', 'partner sees the identical plan');
select (public.current_play_state() ->> 'session_id') as sid \gset
select public.advance_call_plan(:'sid', 'done') as st \gset
select tests.expect(:'st'::jsonb -> 'current' ->> 'slot' = 'guessing', 'done moves to the guessing step');
select tests.expect((:'st'::jsonb -> 'timer' ->> 'remaining_s')::int = 600, 'timer set to 10 minutes');
select tests.expect((select e ->> 'status' from jsonb_array_elements(:'st'::jsonb -> 'plan') e where e ->> 'slot' = 'warm_up') = 'done', 'warm-up marked done');

-- replace the current step and an upcoming one
select (:'st'::jsonb -> 'current' -> 'activity' ->> 'id') as before_act, (:'st'::jsonb -> 'current' ->> 'item_id') as cur_item \gset
select public.replace_call_plan_item(:'cur_item') as st2 \gset
select tests.expect(:'st2'::jsonb -> 'current' -> 'activity' ->> 'id' <> :'before_act', 'replace swaps the current activity');
select tests.expect(:'st2'::jsonb -> 'current' -> 'activity' ->> 'activity_type' = 'guessing', 'replacement still suits the guessing step');
select (e ->> 'item_id') as heart_item from jsonb_array_elements(:'st2'::jsonb -> 'plan') e where e ->> 'slot' = 'heart' \gset
select public.replace_call_plan_item(:'heart_item') as st3 \gset
select tests.expect((select count(distinct e -> 'activity' ->> 'id') from jsonb_array_elements(:'st3'::jsonb -> 'plan') e) = 5, 'still no duplicates after replacing');
select tests.expect((select a.category from jsonb_array_elements(:'st3'::jsonb -> 'plan') e join public.play_activities a on a.id = (e -> 'activity' ->> 'id')::uuid where e ->> 'slot' = 'heart') = 'heart_to_heart', 'heart step stays heart to heart');

-- skip through to the end
select public.advance_call_plan(:'sid', 'skipped');
select public.advance_call_plan(:'sid', 'done');
select public.advance_call_plan(:'sid', 'done');
select public.advance_call_plan(:'sid', 'done') as fin \gset
select tests.expect(:'fin'::jsonb -> 'current' = 'null'::jsonb, 'plan complete: no current step');
select tests.expect((select count(*) from jsonb_array_elements(:'fin'::jsonb -> 'plan') e where e ->> 'status' = 'skipped') = 1, 'one step recorded as skipped');
select tests.expect((select count(*) from jsonb_array_elements(:'fin'::jsonb -> 'plan') e where e ->> 'status' = 'done') = 4, 'four steps recorded as done');
select tests.expect_error(format('select public.replace_call_plan_item(%L)', :'heart_item'), 'Only upcoming or current');
select tests.expect_error(format('select public.advance_call_plan(%L, %L)', :'sid', 'maybe'), 'Unknown result');
reset role;

-- a new plan replaces the old one; a normal draw leaves the plan
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.generate_call_plan(15) as p15 \gset
select tests.expect(jsonb_array_length(:'p15'::jsonb -> 'plan') = 3, 'a fresh 15-min plan has 3 steps (old plan not shown)');
select public.draw_play_activity(:'sid', '{}') as single \gset
select tests.expect(:'single'::jsonb ->> 'mode' = 'single', 'Surprise us leaves the plan');
select tests.expect((select count(*) from public.play_session_items where session_id = :'sid' and status = 'planned') = 0, 'unreached steps are removed');
select tests.expect_error(format('select public.advance_call_plan(%L, %L)', :'sid', 'done'), 'no call plan running');
select public.generate_call_plan(90) as p90 \gset
select tests.expect(jsonb_array_length(:'p90'::jsonb -> 'plan') = 7, '90-min plan has 7 steps');
reset role;

-- outsiders
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error(format('select public.advance_call_plan(%L, %L)', :'sid', 'done'), 'isn''t available');
select tests.expect_error(format('select public.replace_call_plan_item(%L)', (:'p90'::jsonb -> 'current' ->> 'item_id')), 'isn''t available');
select tests.expect_error('select public.pick_for_slot(gen_random_uuid(), 1, ''heart'', 10)', 'permission denied');
select tests.expect_error('select public.clean_answers(''[]''::jsonb)', 'permission denied');
select tests.expect_error('select * from public.call_plan_slots(45)', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.end_play_session(:'sid');
reset role;
\echo 'call plan tests: all passed'
