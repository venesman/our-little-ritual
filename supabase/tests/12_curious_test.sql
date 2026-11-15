-- The Curious Club: topics, filters, Just us country tags, live session flow,
-- private notes until presenting, timers, discoveries, favourites, access.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- ---------------------------------------------------------------- library
select tests.expect((select count(*) from public.curious_topics where not just_us) = 100, '100 general topics');
select tests.expect((select count(*) from public.curious_topics where just_us) = 9, '9 Just us topics');
select tests.expect(not exists (select area from public.curious_topics where not just_us group by area having count(*) <> 10), '10 topics in each of the 10 areas');
select tests.expect((select count(*) from public.curious_topics where cardinality(countries) > 0) = 12, '12 place-specific topics are country-tagged');
select tests.expect(not exists (select 1 from public.curious_topics where just_us and cardinality(needs) > 0 and fallback_explore is null), 'every Just us topic that needs profile details has a fallback');
select tests.expect((select title from public.curious_topics where code = 23) = 'Harvest Festivals Around the World', 'approved edit: #23 is now general');
select tests.expect((select intro_question from public.curious_topics where code = 41) not like '%Malaysia%', 'approved edit: #41 no longer names countries');
select tests.expect((select claims[3] from public.curious_topics where code = 94) = 'Singapore is closer to the equator than Bangkok', 'approved edit: #94 claim replaced');
select tests.expect(not exists (select 1 from public.curious_topics where not public.curious_supports(curious_topics, 'deep_dive') and not just_us), 'every general topic supports Deep Dive');

-- Profiles for the country-tag checks (Our Story).
update public.profiles set current_country = 'Malaysia', home_country = 'Malaysia' where id = :'A';
update public.profiles set current_country = 'Chile', home_country = 'Sweden' where id = :'B';
select id as rel from public.relationships r where exists (select 1 from public.relationship_members m where m.relationship_id = r.id and m.user_id = :'A' and m.status = 'active') \gset
select tests.expect(public.curious_countries(:'rel') @> array['malaysia','chile','sweden'], 'couple countries come from both profiles (current and home)');
select tests.expect((select count(*) from public.curious_topics t where public.curious_matches(t, '{}', public.curious_countries(:'rel'))) = 88, 'general draws exclude Just us and place-tagged topics');
select tests.expect((select count(*) from public.curious_topics t where public.curious_matches(t, '{"just_us":true}', public.curious_countries(:'rel'))) = 21, 'Just us: 9 personal + 12 place topics about Malaysia or Chile');
select tests.expect((select count(*) from public.curious_topics t where public.curious_matches(t, '{"just_us":true}', array['sweden'])) = 9, 'place topics only show when one of you lives in or comes from that country');
select tests.expect((select count(*) from public.curious_topics t where public.curious_matches(t, '{"area":"philosophy","format":"fact_fiction"}', '{}')) = 1, 'format filter: only philosophy topics with claims');
select tests.expect(public.clean_curious_filters('{"area":"mars","difficulty":"easy","format":"quiz","just_us":"yes"}') = '{}'::jsonb, 'invalid filters dropped');

-- ------------------------------------------------------------------ access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.start_curious()', 'opens once your partner');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error('select public.start_curious()', 'opens once your partner');
reset role;

-- --------------------------------------------------------------- the flow
select id as philo from public.curious_topics where code = 33 \gset
select id as fof from public.curious_topics where code = 12 \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select (public.start_curious('{}', :'philo') ->> 'session_id') as sid \gset
select tests.expect((public.current_curious_state() ->> 'stage') = 'setup', 'session starts at setup');
select tests.expect_error(format('select public.curious_setup(%L, ''fact_fiction'', 10, 60, %L)', :'sid', :'A'), 'doesn''t fit');
select tests.expect_error(format('select public.curious_setup(%L, ''teach'', 7, 60, %L)', :'sid', :'A'), '5, 10 or 15');
select tests.expect_error(format('select public.curious_setup(%L, ''teach'', 10, 60, %L)', :'sid', :'C'), 'one of you');
-- Re-drawing during setup keeps the same session.
select tests.expect((public.start_curious('{}', :'fof') ->> 'session_id') = :'sid', 'another topic reuses the same session');
select public.curious_setup(:'sid', 'fact_fiction', 5, 30, :'B');
select tests.expect((public.current_curious_state() ->> 'format') = 'fact_fiction', 'format saved');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((public.current_curious_state() ->> 'session_id') = :'sid', 'partner joins the same live session');
select public.curious_swap_order(:'sid');
select tests.expect((public.current_curious_state() ->> 'first_presenter') = :'A', 'swap order');
select public.curious_advance(:'sid', 'setup');
select tests.expect((public.current_curious_state() ->> 'stage') = 'research', 'research starts');
select tests.expect((public.current_curious_state() #>> '{timer,ends_at}') is not null, 'research timer runs straight away');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
-- A stale tap from the setup screen does nothing.
select public.curious_advance(:'sid', 'setup');
select tests.expect((public.current_curious_state() ->> 'stage') = 'research', 'duplicate tap does not skip a step');
select tests.expect_error('select public.start_curious()', 'finish it first');
select tests.expect_error(format('select public.curious_setup(%L, ''teach'', 10, 60, %L)', :'sid', :'A'), 'before research starts');
select public.save_curious_note(:'sid', 'The sky scatters blue light most.', '["https://example.org/sky", "https://example.org/sky", ""]', '{"0":"false","1":"true","7":"true","2":"maybe"}');
select tests.expect((select links = array['https://example.org/sky'] and verdicts = '{"0":"false","1":"true"}'::jsonb from public.curious_notes where user_id = :'A'), 'links de-duplicated; only valid verdicts kept');
select tests.expect_error(format('select public.save_curious_note(%L, ''x'', ''["http://insecure.example"]'')', :'sid'), 'https://');
select tests.expect_error(format('select public.save_curious_note(%L, ''x'', %L)', :'sid', '["https://a.b/1","https://a.b/2","https://a.b/3","https://a.b/4","https://a.b/5","https://a.b/6"]'), 'five');
select tests.expect_error(format('insert into public.curious_notes (session_id, relationship_id, user_id) values (%L, %L, %L)', :'sid', :'rel', :'A'), 'permission denied');
select public.curious_timer(:'sid', 'pause');
select tests.expect((public.current_curious_state() #>> '{timer,ends_at}') is null and (public.current_curious_state() #>> '{timer,remaining_s}')::int between 1 and 300, 'pause keeps the time left');
select public.curious_timer(:'sid', 'skip');
select tests.expect((public.current_curious_state() #>> '{timer,remaining_s}')::int = 0, 'skip ends the timer');
select tests.expect_error(format('select public.curious_timer(%L, ''start'', 45)', :'sid'), 'Unsupported');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(jsonb_array_length(public.current_curious_state() -> 'notes') = 0, 'partner can''t see notes during research');
select tests.expect((public.current_curious_state() ->> 'partner_has_notes')::boolean, '…but can see that notes exist');
select tests.expect((select count(*) from public.curious_notes) = 0, 'partner''s notes hidden from direct queries too');
select public.save_curious_note(:'sid', 'Mars has a butterscotch sky.', '[]', '{"2":"true"}');
select public.curious_advance(:'sid', 'research');
select tests.expect(jsonb_array_length(public.current_curious_state() -> 'notes') = 2, 'both notes open once presenting starts');
select tests.expect((select count(*) from public.curious_notes) = 2, 'and via direct queries');
select tests.expect((public.current_curious_state() #>> '{timer,remaining_s}')::int = 30, 'presentation timer set to the chosen length');
select public.curious_timer(:'sid', 'start');
select tests.expect((public.current_curious_state() #>> '{timer,ends_at}') is not null, 'presentation timer starts');
select public.curious_timer(:'sid', 'reset', 120);
select tests.expect((public.current_curious_state() #>> '{timer,remaining_s}')::int = 120, 'timer can switch to 120 s');
select public.curious_advance(:'sid', 'present', 0);
select tests.expect((public.current_curious_state() ->> 'presenter_index')::int = 1, 'second presenter');
select tests.expect_error(format('select public.curious_swap_order(%L)', :'sid'), 'started presenting');
select public.curious_advance(:'sid', 'present', 1);
select tests.expect((public.current_curious_state() ->> 'stage') = 'discuss', 'discussion round');
select public.add_curious_discovery(:'sid', 'Mars sunsets are blue!');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.add_curious_discovery(:'sid', 'Sunsets are red because light travels through more air.');
select tests.expect(jsonb_array_length(public.current_curious_state() -> 'discoveries') = 2, 'both save discoveries to the shared list');
select tests.expect_error(format('select public.delete_curious_discovery(%L)', (select id from public.curious_discoveries where user_id = :'B' limit 1)), 'your own');
select tests.expect(public.toggle_curious_favourite(:'fof'), 'favourite a topic');
select tests.expect((public.current_curious_state() ->> 'favourite')::boolean, 'favourite shows in the live state');
select public.curious_advance(:'sid', 'discuss');
select tests.expect(public.current_curious_state() is null, 'finishing closes the session');
select tests.expect((select ended_at is not null from public.curious_sessions where id = :'sid'), 'finished session kept in history');
select tests.expect_error(format('select public.save_curious_note(%L, ''late'')', :'sid'), 'has ended');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.curious_favourites) = 1, 'favourites are shared');
-- A session abandoned at setup leaves no history.
select (public.start_curious('{"just_us":"true"}') ->> 'session_id') as sid2 \gset
select tests.expect((select t.just_us or cardinality(t.countries) > 0 from public.curious_sessions s join public.curious_topics t on t.id = s.topic_id where s.id = :'sid2'), 'Just us draw gives a personal or place topic');
select public.end_curious(:'sid2');
select tests.expect(not exists (select 1 from public.curious_sessions where id = :'sid2'), 'unused session is discarded');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.curious_sessions) = 0, 'other couples see no sessions');
select tests.expect((select count(*) from public.curious_notes) = 0, 'other couples see no notes');
select tests.expect((select count(*) from public.curious_discoveries) = 0, 'other couples see no discoveries');
select tests.expect((select count(*) from public.curious_favourites) = 0, 'other couples see no favourites');
select tests.expect_error(format('select public.add_curious_discovery(%L, ''hijack'')', :'sid'), 'isn''t available');
select tests.expect_error(format('select public.curious_timer(%L, ''start'')', :'sid'), 'isn''t available');
select tests.expect_error('select public.curious_state(gen_random_uuid())', 'permission denied');
select tests.expect_error('select public.curious_countries(gen_random_uuid())', 'permission denied');
reset role;
