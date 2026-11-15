-- How well do you know me?
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
select tests.expect((select count(*) from public.knowme_questions) = 40, '40 questions');

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.knowme_start()', 'once your partner has joined');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.knowme_start() as g \gset
select tests.expect_error('select public.knowme_start()', 'already have a game');
select tests.expect(jsonb_array_length((public.knowme_state()) -> 'rounds') = 2, 'two rounds, one about each of you');
reset role;
select id as ra from public.knowme_rounds where game_id = :'g' and subject_id = :'A' \gset
select id as rb from public.knowme_rounds where game_id = :'g' and subject_id = :'B' \gset
select tests.expect((select count(distinct q) from public.knowme_rounds r, unnest(r.questions) q where r.game_id = :'g') = 10, 'ten different questions');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.knowme_guess(%L, array[''a'',''b'',''c'',''d'',''e''])', :'ra'), 'own answers');
select tests.expect_error(format('select public.knowme_answer(%L, array[''a'',''b'',''c'',''d''])', :'ra'), 'all five');
select public.knowme_answer(:'ra', array['Laksa','Bohemian Rhapsody','Astronaut','Slow walkers','Rain']);
select tests.expect_error(format('select public.knowme_answer(%L, array[''a'',''b'',''c'',''d'',''e''])', :'ra'), 'already answered');
select tests.expect_error(format('select public.knowme_answer(%L, array[''a'',''b'',''c'',''d'',''e''])', :'rb'), 'about your partner');
select tests.expect_error(format('select public.knowme_mark(%L, array[2,2,2,2,2])', :'ra'), 'both filled in');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select r->'answers' = 'null'::jsonb from jsonb_array_elements((public.knowme_state()) -> 'rounds') r where r->>'id' = :'ra'), 'B can''t see A''s answers before guessing');
select tests.expect(((public.for_you())->>'knowme_your_turn')::boolean, 'For you: B has something to do');
select public.knowme_guess(:'ra', array['Laksa','ABBA','Pilot','Loud chewing','Coffee']);
select tests.expect((select r #>> '{answers,0}' = 'Laksa' from jsonb_array_elements((public.knowme_state()) -> 'rounds') r where r->>'id' = :'ra'), 'after guessing, B sees A''s answers');
select tests.expect_error(format('select public.knowme_mark(%L, array[2,2,2,2,2])', :'ra'), 'does the marking');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.knowme_mark(%L, array[2,2,2,2,5])', :'ra'), 'Mark all five');
select public.knowme_mark(:'ra', array[2,0,1,0,0]);
select tests.expect((select (r->>'score')::int = 3 from jsonb_array_elements((public.knowme_state()) -> 'rounds') r where r->>'id' = :'ra'), 'B scored 3 on A''s round');
select tests.expect((public.knowme_state()) ->> 'status' = 'active', 'game carries on until both rounds are marked');
-- A guesses B's round before B has answered — allowed; B can't see the guesses until B answers
select public.knowme_guess(:'rb', array['Kanelbulle','Dancing Queen','Footballer','Being late','Pine forest']);
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select r->'guesses' = 'null'::jsonb from jsonb_array_elements((public.knowme_state()) -> 'rounds') r where r->>'id' = :'rb'), 'B can''t see A''s guesses before answering (no hints)');
select public.knowme_answer(:'rb', array['Kanelbulle','Waterloo','Footballer','Being late','Coffee']);
select public.knowme_mark(:'rb', array[2,1,2,2,0]);
select tests.expect((public.knowme_state(:'g')) ->> 'status' = 'finished', 'finished when both rounds are marked');
select tests.expect((select (j->'scores'->>:'B')::int = 7 from jsonb_array_elements(public.knowme_history()) j where j->>'id' = :'g'), 'history: A scored 7 on B''s round');
select public.set_scrapbook_entry('knowme', :'g');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) j where j->>'kind' = 'knowme') = 1, 'kept in the scrapbook');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(public.knowme_history() = '[]'::jsonb, 'another couple sees nothing');
select tests.expect_error(format('select public.knowme_state(%L)', :'g'), 'couldn''t find');
select tests.expect_error(format('select public.knowme_guess(%L, array[''a'',''b'',''c'',''d'',''e''])', :'ra'), 'couldn''t find');
reset role;
set role anon;
select tests.expect_error('select public.knowme_start()', 'permission denied');
reset role;
