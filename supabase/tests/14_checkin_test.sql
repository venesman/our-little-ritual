-- Weekly check-in: optional, sealed until both share, no scores.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

select public.ritual_week_start(now()) as wk \gset
select (public.ritual_week_start(now()) - interval '7 days') as prev \gset
select (public.ritual_week_start(now()) + interval '7 days') as nxt \gset
select public.checkin_bonus_code(public.ritual_week_start(now())) as bcode \gset
select tests.expect((select count(*) from public.checkin_prompts) = 12, '12 bonus prompts');
select tests.expect(public.checkin_bonus_code(:'wk') <> public.checkin_bonus_code(:'prev'), 'bonus prompt rotates week to week');

-- Let this couple's space reach back a few weeks, for history.
update public.relationships set created_at = now() - interval '30 days'
 where id = (select relationship_id from public.relationship_members where user_id = :'A' and status = 'active');

-- ------------------------------------------------------------- access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.checkin_week()', 'once your partner has joined');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error('select public.checkin_week()', 'once your partner has joined');
reset role;

-- --------------------------------------------------------------- flow
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((public.checkin_week() ->> 'mine') is null and (public.checkin_week() ->> 'is_current')::boolean, 'empty check-in for the current week');
select tests.expect_error(format('select public.checkin_week(%L)', :'nxt'), 'hasn''t started');
select tests.expect_error(format('select public.checkin_week(%L)', now()), 'isn''t a check-in week');
select tests.expect_error(format('select public.checkin_week(%L)', public.ritual_week_start(now() - interval '400 days')), 'before your space began');
select public.save_checkin(:'wk', 'A bit tired but good', '', '', '', array['tired', 'Grateful', 'tired']);
select tests.expect((select mood_words = array['tired','grateful'] and status = 'draft' from public.checkins where user_id = :'A'), 'draft saved; mood words cleaned');
select tests.expect_error(format('select public.save_checkin(%L, '''', '''', '''', '''', array[''furious''])', :'wk'), 'from the list');
select tests.expect_error(format('select public.save_checkin(%L, '''', '''', '''', '''', array[''calm'',''busy'',''proud'',''tired''])', :'wk'), 'up to three');
select tests.expect_error(format('select public.save_checkin(%L, '''', '''', '''', '''', ''{}'', false, true)', :'wk'), 'before sharing');
select tests.expect_error(format('select public.save_checkin(%L, %L)', :'wk', repeat('x', 1501)), '1,500');
select tests.expect_error(format('insert into public.checkins (relationship_id, user_id, week_start) select relationship_id, %L, %L from public.relationship_members where user_id = %L', :'A', :'wk', :'A'), 'permission denied');
select tests.expect_error(format('update public.checkins set feeling = ''x'' where user_id = %L', :'A'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.checkins) = 0, 'partner can''t see a draft');
select tests.expect(not (public.checkin_week() ->> 'partner_submitted')::boolean, 'draft doesn''t count as shared');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_checkin(:'wk', 'A bit tired but good', 'Our call on Sunday', 'More voice notes please', 'Planning the stall', array['tired','grateful'], true, true);
select tests.expect((public.checkin_week() #>> '{mine,status}') = 'submitted', 'shared');
select tests.expect_error(format('select public.save_checkin(%L, ''changed'')', :'wk'), 'already shared');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((public.checkin_week() ->> 'partner_submitted')::boolean, 'partner sees that it was shared');
select tests.expect((public.checkin_week() ->> 'partner') is null, '…but not the answers');
select tests.expect((select count(*) from public.checkins) = 0, 'not even by direct query');
select tests.expect((public.checkin_week() ->> 'partner_wants_to_talk')::boolean, 'call reminder shows once shared');
select public.save_checkin(:'wk', 'Busy with exams', '', '', '', array['busy'], false, true);
select tests.expect((public.checkin_week() ->> 'revealed')::boolean, 'both shared → revealed');
select tests.expect((public.checkin_week() #>> '{partner,need}') = 'More voice notes please', 'partner answers readable after both share');
select tests.expect((select count(*) from public.checkins) = 2, 'and by direct query');
select tests.expect((public.checkin_week() #>> '{bonus,code}')::int = :bcode, 'same bonus prompt for both');
select public.mark_checkin_talked(:'wk');
select tests.expect(not (public.checkin_week() ->> 'partner_wants_to_talk')::boolean, '"we talked about it" clears the reminder');
-- Late check-ins for a past week are fine.
select public.save_checkin(:'prev', 'Looking back: good week', '', '', '', '{}', false, true);
select tests.expect((select count(*) from public.my_checkin_weeks()) = 2, 'history lists weeks');
select tests.expect((select my_status = 'submitted' and not revealed from public.my_checkin_weeks() where week_start = :'prev'), 'past week shared by one, not yet revealed');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((public.checkin_week(:'prev') ->> 'partner') is null, 'past week stays sealed for the other partner');
select tests.expect((select count(*) from public.checkins where week_start = :'prev') = 0, 'even by direct query');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.checkins) = 0, 'other couples see nothing');
select tests.expect_error('select public.checkin_row_json(null::public.checkins)', 'permission denied');
reset role;

-- No scores anywhere: the table has no numeric rating columns.
select tests.expect(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'checkins'
                                 and data_type in ('integer', 'numeric', 'smallint', 'real', 'double precision') and column_name <> 'bonus_code'),
                    'no score columns');
