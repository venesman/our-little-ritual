-- Personalisation: Our Story profiles, life updates, shared profile, milestones,
-- Just us filter, Apart missions (reveal + relay) and apart-media storage.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- ------------------------------------------------------- individual profiles
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.update_member_profile(:'A', '{"current_city":"Kuching","current_country":"Malaysia","home_country":"Malaysia","situation":"Business development & events","interests":["psychology","music","photography","music"," "],"languages_spoken":["English","Malay","Iban"],"sharing_now":"Upcycling project is growing"}');
select tests.expect((select current_city from public.profiles where id = :'A') = 'Kuching', 'member edits their own profile');
select tests.expect((select interests from public.profiles where id = :'A') = array['psychology','music','photography'], 'label lists are trimmed and de-duplicated');
-- "Both edit everything": Alice fills in Bob's details too.
select public.update_member_profile(:'B', '{"current_city":"Santiago","current_country":"Chile","home_country":"Sweden","institution":"Lund University","situation":"Exchange year","languages_spoken":["Swedish","English"],"languages_learning":["Spanish"]}');
select tests.expect((select home_country from public.profiles where id = :'B') = 'Sweden', 'partner can edit the other profile');
select tests.expect((select current_country from public.profiles where id = :'B') = 'Chile', 'current location is stored separately from home country');
select public.update_member_profile(:'B', '{"institution":""}');
select tests.expect((select institution from public.profiles where id = :'B') is null, 'clearing a field stores nothing');
select public.update_member_profile(:'B', '{"institution":"Lund University","password":"x","id":"00000000-0000-0000-0000-00000000000c"}');
select tests.expect((select id from public.profiles where id = :'B') = :'B'::uuid, 'unknown keys are ignored');
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'A', '{"timezone":"Mars/Base"}'), 'valid time zone');
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'A', json_build_object('current_city', repeat('x', 61))), 'a little long');
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'A', '{"free_from":"09:00"}'), 'both a start and an end');
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'A', json_build_object('interests', (select json_agg(g) from generate_series(1, 21) g))), '20 items');
select tests.expect_error(format('update public.profiles set current_city = %L where id = %L', 'x', :'A'), 'permission denied');
select public.update_member_profile(:'A', '{"timezone":"Asia/Kuching","free_from":"19:00","free_to":"23:59"}');
select tests.expect((select timezone from public.profiles where id = :'A') = 'Asia/Kuching', 'time zone can be set through the profile');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select current_city from public.profiles where id = :'A') = 'Kuching', 'partner reads the profile');
select public.update_member_profile(:'A', '{"sharing_now":"Planning the next market stall"}');
select tests.expect((select sharing_now from public.profiles where id = :'A') = 'Planning the next market stall', 'Bob edits Alice''s profile too');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'A', '{"current_city":"hijack"}'), 'own space');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error(format('select public.update_member_profile(%L, %L)', :'B', '{"current_city":"hijack"}'), 'own space');
reset role;
select tests.expect((select current_city from public.profiles where id = :'A') = 'Kuching', 'outsiders changed nothing');

-- ------------------------------------------------------------ life updates
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.add_life_update('Pitching the upcycling idea on Friday') as lu \gset
select tests.expect_error('select public.add_life_update('''')', '1 to 500');
select tests.expect_error(format('insert into public.life_updates (relationship_id, user_id, body) select relationship_id, %L, %L from public.relationship_members limit 1', :'A', 'x'), 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.life_updates) = 1, 'partner sees life updates');
select tests.expect_error(format('select public.delete_life_update(%L)', :'lu'), 'your own updates');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.life_updates) = 0, 'outsider sees no life updates');
select tests.expect_error('select public.add_life_update(''hi'')', 'not part of a space');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.delete_life_update(:'lu');
select tests.expect((select count(*) from public.life_updates) = 0, 'author removes their update');
reset role;

-- ----------------------------------------------- shared profile + milestones
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_shared_profile('{"shared_interests":["travel","culture"],"shared_goals":"Explore more countries together"}');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.save_shared_profile('{"enjoy_together":["long calls","cooking"]}');
select tests.expect((select shared_interests = array['travel','culture'] and enjoy_together = array['long calls','cooking'] and shared_goals <> ''
                       from public.relationship_profile), 'both partners build the shared profile; untouched fields are kept');
select public.save_milestone(null, 'milestone', 'First call', '2025-03-01', 'Three hours!') as ms \gset
select public.save_milestone(:'ms', 'memory', 'First call ever', '2025-03-01', '');
select tests.expect((select kind || ':' || title from public.milestones where id = :'ms') = 'memory:First call ever', 'milestone edited');
select tests.expect_error('select public.save_milestone(null, ''party'', ''x'')', 'Unknown kind');
select tests.expect_error('select public.save_milestone(null, ''memory'', '''')', 'title');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.milestones) = 0, 'other couples see no milestones');
select tests.expect((select count(*) from public.relationship_profile) = 0, 'other couples see no shared profile');
select tests.expect_error(format('select public.save_milestone(%L, ''memory'', ''hijack'')', :'ms'), 'couldn''t find');
select tests.expect_error(format('select public.delete_milestone(%L)', :'ms'), 'couldn''t find');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.delete_milestone(:'ms');
select tests.expect((select count(*) from public.milestones) = 0, 'either partner removes a milestone');
reset role;

-- --------------------------------------------- Monday switch + weekly Just us
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.set_include_just_us_weekly(false);
select tests.expect((select not include_just_us_weekly from public.relationships where id = public.my_relationship_id()), 'Monday switch turns off');
select public.set_include_just_us_weekly(true);
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.set_include_just_us_weekly(false)', 'not part of a space');
reset role;

-- Over a full 48-week cycle with the switch on, all six Just us rituals appear.
do $$
declare
  rel uuid;
  wk timestamptz;
  i int;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c7c1', 'c7c1@x'), ('00000000-0000-0000-0000-00000000c7c2', 'c7c2@x');
  insert into public.relationships (name, status, created_by) values ('Cycle test', 'active', '00000000-0000-0000-0000-00000000c7c1') returning id into rel;
  insert into public.relationship_members (relationship_id, user_id, role) values (rel, '00000000-0000-0000-0000-00000000c7c1', 'creator'), (rel, '00000000-0000-0000-0000-00000000c7c2', 'partner');
  wk := public.ritual_week_start(now()) - interval '60 weeks';
  for i in 0..47 loop
    perform public.assign_weekly_activity(rel, wk + make_interval(weeks => i));
  end loop;
  perform tests.expect((select count(distinct activity_id) from public.weekly_activities where relationship_id = rel) = 48, '48 different rituals across a cycle with Just us on');
  perform tests.expect((select count(*) from public.weekly_activities w join public.activities a on a.id = w.activity_id
                         where w.relationship_id = rel and a.just_us) = 6, 'all six Just us rituals come up on Mondays');
end
$$;

-- ----------------------------------------------------------- Just us in Play
select tests.expect(public.clean_play_filters('{"mode":"apart","just_us":"true","minutes":"10"}') = '{"mode":"apart","just_us":true,"minutes":10}'::jsonb, 'filters keep mode and just_us');
select tests.expect(public.clean_play_filters('{"mode":"elsewhere","just_us":"maybe"}') = '{}'::jsonb, 'invalid mode / just_us are dropped');
select tests.expect((select count(*) from public.play_activities a where public.play_matches(a, '{"just_us":true}')) = 12, 'Just us on a call: 12');
select tests.expect((select count(*) from public.play_activities a where public.play_matches(a, '{"mode":"apart","just_us":true}')) = 9, 'Just us apart: 9');
select tests.expect((select count(*) from public.play_activities a where public.play_matches(a, '{"mode":"apart"}')) = 20, 'general apart: 20');
select tests.expect((select count(*) from public.play_activities a where public.play_matches(a, '{}')) = 90, 'default draw stays general and on a call');
select tests.expect(not exists (select 1 from public.play_activities a where (a.mode = 'apart' or a.just_us) and
                    (public.slot_fits(a, 'warm_up') or public.slot_fits(a, 'heart') or public.slot_fits(a, 'closing'))), 'call plans never use apart or Just us activities');
select tests.expect(not exists (select 1 from public.play_activities where just_us and cardinality(needs) > 0 and fallback_instructions is null),
                    'every Just us activity that needs profile details has a fallback');
select tests.expect((select prompts[1] from public.play_activities where code = 2) = 'suitcase', 'approved edit #2 applied');
select tests.expect((select instructions from public.play_activities where code = 15) like '%a language you speak or are learning%', 'approved edit #15 applied');

-- --------------------------------------------------------- Apart missions
select id as solo_act from public.play_activities where code = 131 \gset
select id as relay_act from public.play_activities where code = 132 \gset
select id as call_act from public.play_activities where code = 1 \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.start_apart_mission('{}', :'solo_act') as m1 \gset
select public.start_apart_mission('{}', :'relay_act') as m2 \gset
select tests.expect_error(format('select public.start_apart_mission(%L, %L)', '{}', :'call_act'), 'isn''t available');
select public.start_apart_mission('{"just_us":"true"}') as m3 \gset
select tests.expect((select a.just_us and a.mode = 'apart' from public.apart_missions m join public.play_activities a on a.id = m.activity_id where m.id = :'m3'), 'random draw respects mode and Just us');
select public.add_apart_entry(:'m1', 'My red thing: a postbox') as e1 \gset
select tests.expect_error(format('select public.add_apart_entry(%L, '''')', :'m1'), 'Add some words');
select tests.expect_error(format('select public.add_apart_entry(%L, ''x'', ''http://plain.example'')', :'m1'), 'https://');
select tests.expect_error(format('select public.add_apart_entry(%L, ''x'', null, %L)', :'m1', :'m1' || '/' || :'B' || '/a.jpg'), 'can''t be attached');
select public.add_apart_entry(:'m2', 'The postcard arrived three years late…');
select tests.expect_error(format('insert into public.apart_entries (mission_id, relationship_id, user_id, body) select %L, relationship_id, %L, %L from public.apart_missions where id = %L', :'m1', :'A', 'x', :'m1'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.apart_entries where mission_id = :'m1') = 0, 'solo mission: partner''s entry stays sealed');
select tests.expect((select count(*) from public.apart_entries where mission_id = :'m2') = 1, 'relay mission: partner sees entries as you go');
select tests.expect((select partner_entries = 1 and not visible from public.my_apart_missions() where mission_id = :'m1'), 'mission list shows that the partner has shared, not what');
select public.add_apart_entry(:'m1', 'Mine: a tomato');
select tests.expect((select count(*) from public.apart_entries where mission_id = :'m1') = 2, 'both shared → both entries open');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.apart_missions) = 0, 'other couples see no missions');
select tests.expect((select count(*) from public.apart_entries) = 0, 'other couples see no entries');
select tests.expect_error(format('select public.add_apart_entry(%L, ''hijack'')', :'m1'), 'isn''t available');
reset role;

-- storage: own folder in an open mission only; partner sees photos only when visible
select relationship_id as rel from public.apart_missions where id = :'m3' \gset
\set APATH :rel/:m3/:A/a.jpg
\set BPATH :rel/:m3/:B/b.jpg
select tests.expect((select public = false from storage.buckets where id = 'apart-media'), 'apart bucket is private');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('apart-media', :'APATH');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''apart-media'', %L)', :'BPATH'), 'row-level security');
select public.add_apart_entry(:'m3', '', null, :'APATH');
reset role;
select tests.expect((select style from public.play_activities a join public.apart_missions m on m.activity_id = a.id where m.id = :'m3') is not null, 'm3 has a style');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where name = :'APATH') =
                    (select case when public.apart_visible(:'m3') then 1 else 0 end), 'partner sees the photo only when the mission is visible');
insert into storage.objects (bucket_id, name) values ('apart-media', :'BPATH');
select public.add_apart_entry(:'m3', 'mine', null, :'BPATH');
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 1, 'after both share, partner sees the photo');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
delete from storage.objects where name = :'APATH';
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 1, 'attached photos can''t be deleted');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'apart-media') = 0, 'outsider never sees apart photos');
reset role;

-- close + limit
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.close_apart_mission(:'m1');
select tests.expect_error(format('select public.add_apart_entry(%L, ''late'')', :'m1'), 'closed');
select tests.expect((select count(*) from public.my_apart_missions()) = 2, 'closed missions are hidden by default');
select tests.expect((select count(*) from public.my_apart_missions(true)) = 3, '…and shown in history');
select public.start_apart_mission('{}');
select public.start_apart_mission('{}');
select public.start_apart_mission('{}');
select public.start_apart_mission('{}');
select tests.expect_error('select public.start_apart_mission(''{}'')', 'six missions');
reset role;

-- internal helpers are not callable by signed-in users
set role authenticated;
select tests.expect_error('select public.clean_labels(''[]'')', 'permission denied');
reset role;
