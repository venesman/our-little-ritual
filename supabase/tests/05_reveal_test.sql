-- Phase 3: submissions, the sealed reveal, and private media.
-- Uses Alice + Bob (active space "Our corner"), Carol (outsider), Dave (pending).
\set ON_ERROR_STOP 1

select id as rel from public.relationships where name = 'Our corner' \gset
-- Pick known weeks from cycle 1 (all 42 activities appear there): a text one and a photo one.
select w.id as wk from public.weekly_activities w
  join public.activity_cycles c on c.id = w.cycle_id join public.activities a on a.id = w.activity_id
 where w.relationship_id = :'rel' and c.cycle_number = 1 and a.code = 1 \gset
select w.id as wk2 from public.weekly_activities w
  join public.activity_cycles c on c.id = w.cycle_id join public.activities a on a.id = w.activity_id
 where w.relationship_id = :'rel' and c.cycle_number = 1 and a.code = 28 \gset

\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

-- ---------------------------------------------------- bucket is private
select tests.expect((select public = false from storage.buckets where id = 'ritual-media'), 'media bucket is private');

-- -------------------------------------------- Alice writes a draft
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.submit_ritual(%L)', :'wk'), 'Write something first');
select public.save_ritual_draft(:'wk', 'Your laugh, your playlists, the way you say goodnight.', null, '[]'::jsonb, null);
select tests.expect((select status from public.activity_submissions where weekly_activity_id = :'wk') = 'draft', 'draft saved');
select public.save_ritual_draft(:'wk', 'Your laugh. Your playlists. Your goodnights.', null, '[]'::jsonb, null);
select tests.expect((select count(*) from public.activity_submissions) = 1, 'saving again updates the same draft');
-- validation
select tests.expect_error(format('select public.save_ritual_draft(%L, %L)', :'wk', repeat('x', 5001)), 'under 5,000');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L, %L)', :'wk', 'hi', 'http://example.com'), 'https://');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L, null, %L)', :'wk', 'hi', '[{"prompt":"a","answer":"' || repeat('y', 301) || '"}]'), 'shorten');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L, null, %L::jsonb, %L)', :'wk', 'hi', '[]', :'rel' || '/' || :'wk' || '/' || :'B' || '/x.jpg'), 'can''t be attached');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L, null, %L::jsonb, %L)', :'wk', 'hi', '[]', '../../etc/passwd'), 'can''t be attached');
-- no direct writes
select tests.expect_error(format('insert into public.activity_submissions (weekly_activity_id, relationship_id, user_id) values (%L, %L, %L)', :'wk', :'rel', :'A'), 'permission denied');
select tests.expect_error('update public.activity_submissions set status = ''submitted''', 'permission denied');
select tests.expect_error('delete from public.activity_submissions', 'permission denied');
reset role;

-- --------------------------- Bob cannot see Alice's draft, or any content
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.activity_submissions) = 0, 'partner cannot see a draft');
select tests.expect((select has_submitted from public.week_status(:'wk') where not is_me) = false, 'status shows partner has not shared');
reset role;

-- ------------------------------------------------ Alice submits
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(public.submit_ritual(:'wk') = false, 'first to share: not revealed yet');
select tests.expect(public.submit_ritual(:'wk') = false, 'sharing twice is harmless');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L)', :'wk', 'changed my mind'), 'sealed');
select tests.expect((select body from public.activity_submissions where user_id = :'A') = 'Your laugh. Your playlists. Your goodnights.', 'sealed answer unchanged');
reset role;

-- --------------------- Bob: knows Alice shared, still cannot read it
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.activity_submissions) = 0, 'partner''s SUBMITTED answer still hidden before reveal');
select tests.expect((select count(*) from public.activity_submissions where user_id = :'A') = 0, 'cannot fetch it by filtering on her id');
select tests.expect((select has_submitted from public.week_status(:'wk') where not is_me) = true, 'status shows partner has shared');
select tests.expect((select revealed from public.week_status(:'wk') limit 1) = false, 'not revealed yet');
select tests.expect(not public.week_revealed(:'wk'), 'week_revealed false');
select public.save_ritual_draft(:'wk', 'Your patience. Your voice notes. Your terrible puns.', null, '[]'::jsonb, null);
select tests.expect((select count(*) from public.activity_submissions) = 1, 'Bob sees only his own draft');
reset role;

-- Carol (outsider) sees nothing and can't write into their week.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from public.activity_submissions) = 0, 'outsider sees no submissions');
select tests.expect_error(format('select public.save_ritual_draft(%L, %L)', :'wk', 'intruder'), 'couldn''t find that ritual');
select tests.expect_error(format('select * from public.week_status(%L)', :'wk'), 'couldn''t find that ritual');
select tests.expect_error(format('select public.submit_ritual(%L)', :'wk'), 'Write something first');
reset role;

-- ----------------------------------------- Bob submits → revealed
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(public.submit_ritual(:'wk') = true, 'second to share: revealed!');
select tests.expect((select count(*) from public.activity_submissions where weekly_activity_id = :'wk') = 2, 'Bob now sees both answers');
select tests.expect((select body from public.activity_submissions where user_id = :'A') like 'Your laugh%', 'Bob reads Alice''s answer');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select count(*) from public.activity_submissions where weekly_activity_id = :'wk') = 2, 'Alice sees both answers');
select tests.expect((select bool_and(revealed) from public.week_status(:'wk')), 'status says revealed');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from public.activity_submissions) = 0, 'outsider still sees nothing after reveal');
reset role;

-- ================================================= media (photo week)
\set APATH :rel/:wk2/:A/sky.jpg
\set BPATH :rel/:wk2/:B/sky.jpg
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('ritual-media', :'APATH');
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 1, 'Alice can upload to her own folder and see it');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''ritual-media'', %L)', :'BPATH'), 'row-level security');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''ritual-media'', %L)', gen_random_uuid() || '/' || :'wk2' || '/' || :'A' || '/x.jpg'), 'row-level security');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''ritual-media'', %L)', 'not/a/valid'), 'row-level security');
select tests.expect_error(format('select public.submit_ritual(%L)', :'wk2'), 'Write something first');
select public.save_ritual_draft(:'wk2', 'Pink sky at 7pm', null, '[]'::jsonb, null);
select tests.expect_error(format('select public.submit_ritual(%L)', :'wk2'), 'Add your photo');
select public.save_ritual_draft(:'wk2', 'Pink sky at 7pm', null, '[]'::jsonb, :'APATH');
select tests.expect(public.submit_ritual(:'wk2') = false, 'photo answer shared');
delete from storage.objects where name = :'APATH';
reset role;
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 1, 'a sealed photo cannot be deleted');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 0, 'partner cannot see the photo before reveal');
insert into storage.objects (bucket_id, name) values ('ritual-media', :'BPATH');
select public.save_ritual_draft(:'wk2', 'Grey and windy here', null, '[]'::jsonb, :'BPATH');
select public.submit_ritual(:'wk2');
select tests.expect((select count(*) from storage.objects where name = :'APATH') = 1, 'partner sees the photo after reveal');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects) = 0, 'outsider can never see media');
reset role;

-- List statuses carry no content and only cover the caller's space.
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(not exists (select 1 from public.my_ritual_statuses() s join public.weekly_activities w on w.id = s.weekly_id where w.week_start > now()),
                    'status list leaves out future weeks');
select tests.expect((select count(*) from public.my_ritual_statuses()) >= 1, 'status list has my weeks');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((
  select bool_and(s.revealed = (s.my_status = 'submitted' and s.partner_submitted)) from public.my_ritual_statuses() s),
  'revealed = both shared, for every week in the list');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from public.my_ritual_statuses()) = 0, 'outsider gets an empty status list');
reset role;

-- Simultaneous final submissions are covered in 06_reveal_concurrency_test.sh
\echo 'reveal tests: all passed'
