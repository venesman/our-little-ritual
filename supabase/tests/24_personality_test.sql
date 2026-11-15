-- Personality quizzes + the extra questions.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

select tests.expect((select count(*) from public.quiz_questions where source = 'starter') = 450, '450 starter questions');
select tests.expect((select count(*) from public.quiz_questions where category in ('anime', 'games', 'mythology') and source = 'starter') = 45, 'anime, games and myths have questions');
select tests.expect(public.personality_result(array[0,1,1,2,3,1]) = 1 and public.personality_result(array[0,0,1,1,2,3]) = 0 and public.personality_result(array[3,3,3,2,2,2]) = 2, 'result rule (most, tie → first)');

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.personality_submit(''travel'', array[0,0,0,0,0,0])', 'once your partner has joined');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.personality_submit(''horoscope'', array[0,0,0,0,0,0])', 'Unknown quiz');
select tests.expect_error('select public.personality_submit(''travel'', array[0,0,0])', 'all six');
select tests.expect_error('select public.personality_submit(''travel'', array[0,0,0,0,0,7])', 'all six');
select tests.expect(public.personality_submit('travel', array[2,2,2,0,1,3], 1) = 2, 'A is The Explorer, guessed B is The Foodie');
select tests.expect_error('select count(*) from public.personality_results', 'permission denied');
select tests.expect((select (j->>'partner_taken')::boolean = false from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'travel'), 'B hasn''t taken it yet');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select (j->>'partner_taken')::boolean and j->'partner' = 'null'::jsonb and j->'mine' = 'null'::jsonb
                       from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'travel'), 'B sees A took it, but not A''s card');
select public.personality_submit('travel', array[1,1,1,1,0,0], 2);
select tests.expect((select (j #>> '{partner,result}')::int = 2 and (j #>> '{partner,guess}')::int = 1 and (j #>> '{mine,guess}')::int = 2
                       from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'travel'), 'now both cards and guesses show');
select public.personality_submit('travel', array[0,0,0,0,0,0], 3);
select tests.expect((select (j #>> '{mine,result}')::int = 0 and (j #>> '{mine,guess}')::int = 2 from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'travel'), 'retake replaces answers, first guess stays');
select (j->>'my_row') as brow from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'travel' \gset
select public.set_scrapbook_entry('personality', :'brow');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) j where j->>'kind' = 'personality' and j->>'quiz_code' = 'travel') = 1, 'comparison kept in the scrapbook');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.personality_submit('festival', array[0,0,0,0,0,0]);
select (j->>'my_row') as arow from jsonb_array_elements(public.personality_state()) j where j->>'quiz' = 'festival' \gset
select tests.expect_error(format('select public.set_scrapbook_entry(''personality'', %L)', :'arow'), 'open to both');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(public.personality_state() = '[]'::jsonb, 'another couple sees nothing');
reset role;
