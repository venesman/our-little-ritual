-- Quiz Time: Quiz Duel.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

select tests.expect((select count(*) from public.quiz_questions where source = 'starter') = 300, 'starter bank loaded (300)');
select tests.expect((select count(distinct category) from public.quiz_questions where source = 'starter') = 15, 'in 15 categories');

-- helper (admin): where is the right answer for question i of a round?
create or replace function tests.quiz_right(p_round uuid, p_idx int) returns int language sql as $$
  select (n - 1)::int from public.quiz_rounds r, jsonb_array_elements_text(r.orders -> p_idx) with ordinality t(e, n) where r.id = p_round and e = '0';
$$;
-- helper (admin): play one whole round as someone, answering correctly or not
create or replace function tests.quiz_play_round(p_user uuid, p_round uuid, p_right boolean) returns void language plpgsql as $$
declare i int;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  for i in 0..2 loop
    if exists (select 1 from public.quiz_answers where round_id = p_round and user_id = p_user and q_index = i and choice is not null) then continue; end if;
    perform public.quiz_open_question(p_round, i);
    perform public.quiz_answer(p_round, i, case when p_right then tests.quiz_right(p_round, i) else (tests.quiz_right(p_round, i) + 1) % 4 end);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.quiz_start_match()', 'once your partner has joined');
reset role;
set role anon;
select tests.expect_error('select public.quiz_matches_list()', 'permission denied');
reset role;

-- ------------------------------------------------------------- a match
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select count(*) from public.quiz_questions', 'permission denied');
select tests.expect_error('select count(*) from public.quiz_rounds', 'permission denied');
select public.quiz_start_match() as m1 \gset
select tests.expect_error('select public.quiz_start_match()', 'already have a match');
select tests.expect((public.quiz_match_state(:'m1'))->>'next' = 'pick', 'A picks round 1');
reset role;
select id as r1, offered[1] as cat1, offered[2] as cat1b from public.quiz_rounds where match_id = :'m1' and round_no = 1 \gset
select id as r2, offered[1] as cat2 from public.quiz_rounds where match_id = :'m1' and round_no = 2 \gset
select tests.expect((select count(*) = 6 and count(distinct picker_id) = 2 from public.quiz_rounds where match_id = :'m1'), '6 rounds, picks alternate');
select tests.expect((select picker_id = :'B'::uuid from public.quiz_rounds where id = :'r2'), 'B picks round 2');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((public.quiz_match_state(:'m1'))->>'next' = 'wait', 'B waits for A''s pick');
select tests.expect_error(format('select public.quiz_pick_category(%L, %L)', :'r1', :'cat1'), 'partner''s turn');
select tests.expect_error(format('select public.quiz_open_question(%L, 0)', :'r1'), 'hasn''t been picked');
select tests.expect_error(format('select public.quiz_pick_category(%L, %L)', :'r2', :'cat2'), 'Finish the round before');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.quiz_pick_category(%L, ''not-offered'')', :'r1'), 'one of the three');
select public.quiz_pick_category(:'r1', :'cat1');
select tests.expect_error(format('select public.quiz_pick_category(%L, %L)', :'r1', :'cat1b'), 'already picked');
select tests.expect_error(format('select public.quiz_open_question(%L, 1)', :'r1'), 'in order');
select tests.expect(((public.quiz_open_question(:'r1', 0)) -> 'options') is not null, 'question opens with 4 options');
select tests.expect(jsonb_array_length((public.quiz_open_question(:'r1', 0)) -> 'options') = 4, 're-opening gives the same question, clock not reset');
select tests.expect(not ((public.quiz_open_question(:'r1', 0)) ? 'right'), 'the right answer is never sent before answering');
reset role;
select tests.quiz_right(:'r1', 0) as right0 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(((public.quiz_answer(:'r1', 0, :right0)) ->> 'correct')::boolean, 'right answer counts');
select tests.expect_error(format('select public.quiz_answer(%L, 0, 0)', :'r1'), 'already answered');
select tests.expect_error(format('select public.quiz_open_question(%L, 0)', :'r1'), 'already answered');
select public.quiz_open_question(:'r1', 1);
reset role;
-- the clock ran out (server time)
update public.quiz_answers set shown_at = now() - interval '30 seconds' where round_id = :'r1' and user_id = :'A' and q_index = 1;
select tests.quiz_right(:'r1', 1) as right1 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(((public.quiz_answer(:'r1', 1, :right1)) ->> 'timed_out')::boolean, 'too late: counted as time ran out');
select tests.expect(((public.quiz_match_state(:'m1')) ->> 'my_score')::int = 1, 'A has 1 point');
reset role;

-- B can't see A's answers until B answers the same question
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((public.quiz_match_state(:'m1')) #>> '{rounds,0,questions,0,partner}' = 'hidden', 'partner answered, but hidden');
select tests.expect((public.quiz_match_state(:'m1')) #> '{rounds,0,questions,0,review}' = 'null'::jsonb, 'no question or answer shown before you play it');
select tests.expect(((public.quiz_match_state(:'m1')) ->> 'partner_score')::int = 0, 'partner score only counts what you''ve both answered');
select tests.expect((public.quiz_match_state(:'m1'))->>'next' = 'play', 'B can play round 1 now');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.quiz_open_question(:'r1', 0);
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((public.quiz_answer(:'r1', 0, :right0)) #>> '{partner,correct}' = 'true', 'after answering you see your partner''s answer');
select tests.expect((public.quiz_match_state(:'m1')) #>> '{rounds,0,questions,0,review,right}' = :'right0', 'and the review');
reset role;

-- play out the rest: everyone answers right, except B misses round 3
select tests.quiz_play_round(:'A', :'r1', true);
select tests.quiz_play_round(:'B', :'r1', true);
do $$
declare r record; m uuid := (select id from public.quiz_matches where status = 'active' limit 1);
begin
  for r in select * from public.quiz_rounds where match_id = m and round_no > 1 order by round_no loop
    perform set_config('request.jwt.claim.sub', r.picker_id::text, true);
    perform public.quiz_pick_category(r.id, r.offered[1]);
    perform tests.quiz_play_round(r.picker_id, r.id, true);
    perform tests.quiz_play_round((select user_id from public.relationship_members where relationship_id = (select relationship_id from public.quiz_matches where id = m) and user_id <> r.picker_id and status = 'active'), r.id, r.round_no <> 3);
  end loop;
end $$;
select tests.expect((select status = 'finished' and finished_at is not null from public.quiz_matches where id = :'m1'), 'match finished when both answered all 18');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(((public.quiz_match_state(:'m1')) ->> 'my_score')::int = 17 and ((public.quiz_match_state(:'m1')) ->> 'partner_score')::int = 15, 'scores: A 17 (one timed out), B 15');
select tests.expect((select (j->'scores'->>:'A')::int = 17 from jsonb_array_elements(public.quiz_matches_list()) j where j->>'id' = :'m1'), 'history shows the result');
select tests.expect_error(format('select public.quiz_end_match(%L)', :'m1'), 'no match going');
select public.set_scrapbook_entry('quiz', :'m1');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) j where j->>'kind' = 'quiz') = 1, 'result kept in the scrapbook');
-- a fresh match avoids questions you've already seen
select public.quiz_start_match() as m2 \gset
select public.quiz_end_match(:'m2');
select tests.expect((select (j->>'status') from jsonb_array_elements(public.quiz_matches_list()) j where j->>'id' = :'m2') is null, 'ended matches leave the history');
reset role;

-- ------------------------------------------------------------- reports
select question_ids[1] as q1 from public.quiz_rounds where id = :'r1' \gset
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.quiz_report_question(:'q1', 'Answer seems wrong');
select tests.expect_error(format('select public.quiz_report_question(%L)', gen_random_uuid()), 'couldn''t find');
reset role;
select tests.expect((select count(*) from public.quiz_reports where question_id = :'q1') = 1, 'reported');
select tests.expect(not exists (select 1 from public.quiz_rounds r join public.quiz_matches m on m.id = r.match_id
                               where m.id = :'m2' and :'q1' = any(coalesce(r.question_ids, '{}'))), 'reported questions are left out');

-- --------------------------------------------------------- your own questions
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.quiz_add_question(''ours'', ''Who?'', ''a'', ''b'', ''c'', ''d'')', '5–400');
select tests.expect_error('select public.quiz_add_question(''ours'', ''What is my favourite snack?'', ''Kek lapis'', ''kek lapis'', ''x'', ''y'')', 'different');
select tests.expect_error('select public.quiz_add_question(''space'', ''What is my favourite snack?'', ''a'', ''b'', ''c'', ''d'')', 'Unknown category');
select public.quiz_add_question('ours', 'What is my favourite snack?', 'Kek lapis', 'Kanelbulle', 'Empanada', 'Durian') as own1 \gset
select public.quiz_add_question('ours', 'Where did we first video call?', 'My room', 'A café', 'The airport', 'The library');
select public.quiz_add_question('ours', 'What do I always forget?', 'My keys', 'My phone', 'My wallet', 'My umbrella');
select tests.expect(jsonb_array_length(public.quiz_my_questions()) = 3, 'A sees her own questions');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(jsonb_array_length(public.quiz_my_questions()) = 0, 'B can''t see A''s answers');
select tests.expect_error(format('select public.quiz_delete_question(%L)', :'own1'), 'couldn''t find');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(public.quiz_matches_list() = '[]'::jsonb, 'another couple sees no matches');
select tests.expect_error(format('select public.quiz_match_state(%L)', :'m1'), 'couldn''t find');
select tests.expect_error(format('select public.quiz_open_question(%L, 0)', :'r1'), 'couldn''t find');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_delete_question(:'own1');
select tests.expect(jsonb_array_length(public.quiz_my_questions()) = 2, 'deleted');
reset role;

-- ------------------------------------------------------- For you
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.quiz_start_match() as m3 \gset
reset role;
select id as r31, offered[1] as cat31 from public.quiz_rounds where match_id = :'m3' and round_no = 1 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(not ((public.for_you())->>'quiz_your_move')::boolean, 'nothing for you before your partner moves');
select public.quiz_pick_category(:'r31', :'cat31');
reset role;
select tests.quiz_play_round(:'A', :'r31', true);
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(((public.for_you())->>'quiz_your_move')::boolean, 'B: your move after A played');
reset role;

-- --------------------------------------------- Open Trivia DB import (with a stand-in for pg_net)
create schema if not exists net;
create table if not exists net._http_response (id bigint primary key, status_code int, content text);
create sequence if not exists net.req_seq;
create table if not exists net.requests (id bigint, url text);
create or replace function net.http_get(url text) returns bigint language plpgsql as $$
declare i bigint := nextval('net.req_seq'); begin insert into net.requests values (i, url); return i; end $$;

select tests.expect(public.opentdb_import_step() = 'imported 0', 'first step asks for a token');
select tests.expect((select url like '%api_token.php%' from net.requests order by id desc limit 1), 'token request sent');
select tests.expect(public.opentdb_import_step() = 'waiting', 'waits for the reply');
insert into net._http_response values ((select max(id) from net.requests), 200, '{"response_code":0,"token":"tok123"}');
select tests.expect(public.opentdb_import_step() = 'imported 0', 'token stored');
select tests.expect((select url like '%token=tok123%' and url like '%encode=base64%' from net.requests order by id desc limit 1), 'questions requested with the token');
insert into net._http_response values ((select max(id) from net.requests), 200, json_build_object('response_code', 0, 'results', json_build_array(
  json_build_object('type', encode(convert_to('multiple','UTF8'),'base64'), 'difficulty', encode(convert_to('easy','UTF8'),'base64'),
    'category', encode(convert_to('Geography','UTF8'),'base64'), 'question', encode(convert_to('Which is the capital of Peru?','UTF8'),'base64'),
    'correct_answer', encode(convert_to('Lima','UTF8'),'base64'),
    'incorrect_answers', json_build_array(encode(convert_to('Cusco','UTF8'),'base64'), encode(convert_to('Quito','UTF8'),'base64'), encode(convert_to('Bogotá','UTF8'),'base64'))),
  json_build_object('type', encode(convert_to('boolean','UTF8'),'base64'), 'difficulty', encode(convert_to('easy','UTF8'),'base64'),
    'category', encode(convert_to('Geography','UTF8'),'base64'), 'question', encode(convert_to('True or false?','UTF8'),'base64'),
    'correct_answer', encode(convert_to('True','UTF8'),'base64'), 'incorrect_answers', json_build_array(encode(convert_to('False','UTF8'),'base64'))),
  json_build_object('type', encode(convert_to('multiple','UTF8'),'base64'), 'difficulty', encode(convert_to('hard','UTF8'),'base64'),
    'category', encode(convert_to('Entertainment: Japanese Anime & Manga','UTF8'),'base64'), 'question', encode(convert_to('Skip me','UTF8'),'base64'),
    'correct_answer', encode(convert_to('a','UTF8'),'base64'), 'incorrect_answers', json_build_array(encode(convert_to('b','UTF8'),'base64'), encode(convert_to('c','UTF8'),'base64'), encode(convert_to('d','UTF8'),'base64')))
))::text);
select tests.expect(public.opentdb_import_step() = 'imported 1', 'only multiple-choice questions in your categories are kept');
select tests.expect((select correct = 'Lima' and wrong[3] = 'Bogotá' and category = 'geography' and source = 'opentdb' from public.quiz_questions where question = 'Which is the capital of Peru?'), 'decoded properly');
insert into net._http_response values ((select max(id) from net.requests), 200, '{"response_code":4,"results":[]}');
select tests.expect(public.opentdb_import_step() = 'done', 'stops when the collection is exhausted');
select tests.expect((select phase = 'done' and imported = 1 from public.quiz_import_state), 'state recorded');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.opentdb_import_step()', 'permission denied');
reset role;
