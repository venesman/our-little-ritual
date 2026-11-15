-- Quiz Duel live on a call.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'

-- tidy up apart matches from the earlier test
update public.quiz_matches set status = 'ended' where status = 'active';

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_start_match('apart') as ap \gset
select public.quiz_start_match('live') as lm \gset
select tests.expect_error('select public.quiz_start_match(''live'')', 'already have a match');
select tests.expect((public.quiz_match_state(:'lm'))->>'next' = 'lobby', 'live match waits in the lobby');
select tests.expect_error(format('select public.quiz_live_join(%L)', :'lm'), 'Waiting for your partner');
select tests.expect((select count(*) from public.quiz_matches) >= 2, 'you can read your match rows (for Realtime)');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(((public.for_you())->>'quiz_live_waiting') = :'lm', 'B is invited to join');
select public.quiz_live_join(:'lm');
select tests.expect(((public.for_you())->>'quiz_live_waiting') is null, 'invitation gone after joining');
select tests.expect((public.quiz_match_state(:'lm'))->>'next' = 'pick', 'now picking');
reset role;
select id as lr1, offered[1] as lc1 from public.quiz_rounds where match_id = :'lm' and round_no = 1 \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_pick_category(:'lr1', :'lc1');
select tests.expect((public.quiz_match_state(:'lm'))->>'live_phase' = 'question', 'question phase after the pick');
select tests.expect_error(format('select public.quiz_open_question(%L, 0)', :'lr1'), 'Get ready');
reset role;
-- skip the 3-2-1
update public.quiz_matches set live_started_at = now() - interval '1 second' where id = :'lm';
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.quiz_open_question(%L, 1)', :'lr1'), 'in order');
select public.quiz_open_question(:'lr1', 0);
reset role;
select tests.expect((select shown_at = (select live_started_at from public.quiz_matches where id = :'lm') from public.quiz_answers where round_id = :'lr1' and user_id = :'A' and q_index = 0), 'shared clock used');
select tests.quiz_right(:'lr1', 0) as lr10 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_answer(:'lr1', 0, :lr10);
select tests.expect((public.quiz_match_state(:'lm'))->>'live_phase' = 'question', 'still waiting for B');
select tests.expect(public.quiz_live_step(:'lm') = 'question', 'step before time is up changes nothing');
reset role;
-- B never answers; the clock runs out
update public.quiz_matches set live_started_at = now() - interval '30 seconds' where id = :'lm';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(public.quiz_live_step(:'lm') = 'reveal', 'time up → reveal');
select tests.expect((public.quiz_match_state(:'lm')) #>> '{rounds,0,questions,0,mine,choice}' = '-1', 'B counted as time ran out');
select tests.expect((public.quiz_match_state(:'lm')) #>> '{rounds,0,questions,0,partner,correct}' = 'true', 'B sees A''s answer at the reveal');
select tests.expect(((public.quiz_match_state(:'lm')) -> 'live_times') ? :'A', 'answer times shown at the reveal');
select tests.expect(public.quiz_live_step(:'lm') = 'reveal', 'reveal stays a few seconds');
reset role;
update public.quiz_matches set live_reveal_at = now() - interval '6 seconds' where id = :'lm';
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(public.quiz_live_step(:'lm') = 'question', 'then the next question');
select tests.expect(((public.quiz_match_state(:'lm'))->>'live_q')::int = 1, 'question 2');
reset role;

-- both answer quickly → reveal straight away
update public.quiz_matches set live_started_at = now() - interval '1 second' where id = :'lm';
select tests.quiz_right(:'lr1', 1) as lr11 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_open_question(:'lr1', 1);
select public.quiz_answer(:'lr1', 1, :lr11);
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.quiz_open_question(:'lr1', 1);
select public.quiz_answer(:'lr1', 1, (:lr11 + 1) % 4);
select tests.expect((public.quiz_match_state(:'lm'))->>'live_phase' = 'reveal', 'both answered → reveal at once');
reset role;

-- the apart match is untouched
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((public.quiz_match_state(:'ap'))->>'next' = 'pick', 'apart match carries on separately');
reset role;

-- play out the rest live (admin helper), then check it finishes
do $$
declare m uuid := (select id from public.quiz_matches where mode = 'live' and status = 'active' limit 1);
        r record; ph text; i int; u uuid; guard int := 0;
begin
  loop
    guard := guard + 1; exit when guard > 200;
    select * into r from public.quiz_matches where id = m;
    exit when r.status <> 'active';
    if r.live_phase = 'reveal' then
      update public.quiz_matches set live_reveal_at = now() - interval '6 seconds' where id = m;
    elsif r.live_phase = 'pick' then
      perform set_config('request.jwt.claim.sub', (select picker_id::text from public.quiz_rounds where match_id = m and round_no = r.live_round), true);
      perform public.quiz_pick_category((select id from public.quiz_rounds where match_id = m and round_no = r.live_round),
                                         (select offered[1] from public.quiz_rounds where match_id = m and round_no = r.live_round));
      continue;
    elsif r.live_phase = 'question' then
      update public.quiz_matches set live_started_at = now() - interval '1 second' where id = m;
      for u in select user_id from public.relationship_members where relationship_id = r.relationship_id and status = 'active' loop
        perform set_config('request.jwt.claim.sub', u::text, true);
        perform public.quiz_open_question((select id from public.quiz_rounds where match_id = m and round_no = r.live_round), r.live_q);
        perform public.quiz_answer((select id from public.quiz_rounds where match_id = m and round_no = r.live_round), r.live_q,
                                   tests.quiz_right((select id from public.quiz_rounds where match_id = m and round_no = r.live_round), r.live_q));
      end loop;
      continue;
    end if;
    perform set_config('request.jwt.claim.sub', (select started_by::text from public.quiz_matches where id = m), true);
    perform public.quiz_live_step(m);
  end loop;
end $$;
select tests.expect((select status = 'finished' from public.quiz_matches where id = :'lm'), 'live match finishes after 6 rounds');
select tests.expect((select count(*) from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id where r.match_id = :'lm' and a.choice is not null) = 36, 'all 36 answers recorded');

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.quiz_matches) = 0, 'another couple can''t see your matches');
select tests.expect_error(format('select public.quiz_live_step(%L)', :'lm'), 'couldn''t find');
select tests.expect_error(format('select public.quiz_live_join(%L)', :'lm'), 'couldn''t find');
reset role;
