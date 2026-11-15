-- Phase 2: weekly ritual generator tests (runs after 01_foundation_test.sql,
-- reusing its users: Alice + Bob share an active space, Dave's is pending,
-- Carol is an outsider).
\set ON_ERROR_STOP 1

-- ------------------------------------------------------ the library
select tests.expect((select count(*) from public.activities where not just_us) = 42, '42 core activities seeded');
select tests.expect((select count(*) from public.activities where just_us) = 6, '6 Just us rituals seeded');
select tests.expect((select count(distinct category) from public.activities) = 6, 'six categories');
select tests.expect(not exists (select category from public.activities where not just_us group by category having count(*) <> 7),
                    'seven core activities in every category');
select tests.expect(not exists (select category from public.activities group by category having count(*) <> 8),
                    'one Just us ritual per category keeps the rotation balanced (8 each)');
select tests.expect((select count(distinct code) from public.activities) = 48, 'activity codes are unique');
select tests.expect(not exists (select 1 from public.activities where just_us and cardinality(needs) > 0 and fallback_instructions is null),
                    'every Just us ritual that needs profile details has a general fallback');

-- ------------------------------------------- the Monday 12:00 UTC boundary
select tests.expect(public.ritual_week_start('2026-11-16 11:59:59+00') = '2026-11-09 12:00+00', 'Mon 11:59 UTC still belongs to last week');
select tests.expect(public.ritual_week_start('2026-11-16 12:00:00+00') = '2026-11-16 12:00+00', 'Mon 12:00 UTC starts the new week');
select tests.expect(public.ritual_week_start('2026-11-15 23:30:00+00') = '2026-11-09 12:00+00', 'Sunday night UTC is last week');
select tests.expect(public.ritual_week_start('2026-11-22 23:59:00+00') = '2026-11-16 12:00+00', 'end of Sunday stays in the week');
-- The same instant written in Malaysia time and Chile time maps to the same week.
select tests.expect(public.ritual_week_start('2026-11-16 20:00:00+08') = public.ritual_week_start('2026-11-16 09:00:00-03'),
                    'Kuching 8 pm Monday and Santiago 9 am Monday are the same release');
select tests.expect(public.ritual_week_start('2026-11-16 19:59:00+08') = '2026-11-09 12:00+00', 'Kuching 7:59 pm Monday is still last week');

-- ----------------------------------------------- who may ask, and what
set role anon;
select tests.expect_error('select * from public.ensure_current_ritual()', 'permission denied');
select tests.expect_error('select * from public.activities', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);  -- Carol, no space
set role authenticated;
select tests.expect_error('select * from public.ensure_current_ritual()', 'not part of a space');
select tests.expect_error('select public.generate_weekly_rituals()', 'permission denied');
select tests.expect_error(format('select public.assign_weekly_activity(gen_random_uuid(), %L)', public.ritual_week_start(now())), 'permission denied');
select tests.expect((select count(*) from public.activities) = 48, 'signed-in users can read the library');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);  -- Dave, pending
set role authenticated;
select tests.expect_error('select * from public.ensure_current_ritual()', 'once your partner has joined');
reset role;

-- --------------------------------------- both partners get the same ritual
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select weekly_id as alice_week, title as alice_title, week_number as alice_no from public.ensure_current_ritual() \gset
select tests.expect(:'alice_no' = '1', 'first ritual is week 1');
select tests.expect((select weekly_id from public.ensure_current_ritual()) = :'alice_week'::uuid, 'asking again returns the same ritual');
select tests.expect_error('insert into public.weekly_activities (relationship_id, cycle_id, activity_id, week_start, week_number) select relationship_id, cycle_id, activity_id, week_start, 99 from public.weekly_activities', 'permission denied');
select tests.expect_error('update public.weekly_activities set activity_id = activity_id', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.expect((select weekly_id from public.ensure_current_ritual()) = :'alice_week'::uuid, 'partner gets the identical weekly record');
select tests.expect((select title from public.ensure_current_ritual()) = :'alice_title', 'partner sees the identical activity');
select tests.expect((select count(*) from public.weekly_activities) = 1, 'exactly one record for the week');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from public.weekly_activities) = 0, 'outsider cannot see anyone''s rituals');
select tests.expect((select count(*) from public.activity_cycles) = 0, 'outsider cannot see cycles');
reset role;

-- The scheduler finds the week already made and doesn't duplicate it.
select public.generate_weekly_rituals();
select tests.expect((select count(*) from public.weekly_activities w join public.relationships r on r.id = w.relationship_id
                     where r.name = 'Our corner') = 1, 'scheduler is idempotent');

-- ----------------------------------------- a full cycle of 42 weeks (Just us switched off)
select id as rel from public.relationships where name = 'Our corner' \gset
update public.relationships set include_just_us_weekly = false where id = :'rel';
do $$
declare rel uuid := (select id from public.relationships where name = 'Our corner');
        base timestamptz := public.ritual_week_start(now());
begin
  for k in 1..41 loop
    perform public.assign_weekly_activity(rel, base + make_interval(days => 7 * k));
  end loop;
end $$;

select tests.expect((select count(*) from public.weekly_activities where relationship_id = :'rel') = 42, '42 weeks recorded');
select tests.expect((select count(distinct activity_id) from public.weekly_activities where relationship_id = :'rel') = 42,
                    'no activity repeats within the cycle');
select tests.expect(not exists (select 1 from public.weekly_activities w join public.activities a on a.id = w.activity_id
                                 where w.relationship_id = :'rel' and a.just_us and w.week_number > 1),
                    'with the switch off, no Just us rituals are picked');
select tests.expect(not exists (
  select a.category from public.weekly_activities w join public.activities a on a.id = w.activity_id
   where w.relationship_id = :'rel' group by a.category having count(*) <> 7), 'each category used exactly 7 times');
select tests.expect(not exists (
  select 1 from (
    select a.category, lag(a.category) over (order by w.week_start) as prev
      from public.weekly_activities w join public.activities a on a.id = w.activity_id
     where w.relationship_id = :'rel') s
  where category = prev), 'never the same category two weeks running');
select tests.expect(not exists (
  select blk from (
    select (w.week_number - 1) / 6 as blk, count(distinct a.category) as cats
      from public.weekly_activities w join public.activities a on a.id = w.activity_id
     where w.relationship_id = :'rel' group by 1) s
  where cats <> 6), 'every block of 6 weeks visits all 6 categories');
select tests.expect((select max(week_number) from public.weekly_activities where relationship_id = :'rel') = 42, 'weeks are numbered 1..42');

-- Week 43: the cycle closes and a fresh shuffle begins; history is kept.
do $$
declare rel uuid := (select id from public.relationships where name = 'Our corner');
begin
  perform public.assign_weekly_activity(rel, public.ritual_week_start(now()) + make_interval(days => 7 * 42));
end $$;
select tests.expect((select count(*) from public.activity_cycles where relationship_id = :'rel') = 2, 'a second cycle starts after 42');
select tests.expect((select completed_at is not null from public.activity_cycles where relationship_id = :'rel' and cycle_number = 1), 'first cycle marked complete');
select tests.expect((select count(*) from public.weekly_activities where relationship_id = :'rel') = 43, 'history from cycle 1 is preserved');
select tests.expect((
  select w43.activity_id <> w42.activity_id
    from public.weekly_activities w43, public.weekly_activities w42
   where w43.relationship_id = :'rel' and w43.week_number = 43
     and w42.relationship_id = :'rel' and w42.week_number = 42), 'new cycle does not open with last week''s activity');

-- A non-Monday week start is refused.
select tests.expect_error(format('select public.assign_weekly_activity(%L, %L)', :'rel', '2026-11-17 12:00+00'), 'Monday at 12:00 UTC');

-- Members see their whole history; activities embed for the history screen.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.expect((select count(*) from public.weekly_activities) = 43, 'partner can read full history');
reset role;

\echo 'weekly ritual tests: all passed'
