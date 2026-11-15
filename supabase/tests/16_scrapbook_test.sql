-- Our Scrapbook: feed respects every seal; save / caption / remove; trips & moments; storage.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
\set F1 '00000000-0000-0000-0000-00000000f001'
\set F2 '00000000-0000-0000-0000-00000000f002'

select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset
select relationship_id as frel from public.relationship_members where user_id = :'F1' and status = 'active' \gset
select id as fweek from public.weekly_activities where relationship_id = :'frel' limit 1 \gset

-- ------------------------------------------------------------- access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect(public.scrapbook_feed() = '[]'::jsonb, 'no space → empty scrapbook');
select tests.expect_error('select public.save_moment(null, ''Trip'', '''', current_date - 1)', 'once your partner has joined');
reset role;

-- ------------------------------------------------------------- automatic items
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
-- loved letter from the mailbox test + discoveries from the Curious Club test + milestones
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'kind' = 'letter') = 1, 'loved letter appears automatically');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'kind' = 'discovery') >= 1, 'Curious Club discoveries appear automatically');
select public.save_milestone(null, 'memory', 'First video call', '2025-03-01', 'Three hours!') as ms \gset
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'ms') = 1, 'milestones appear automatically');
-- removing hides it (the original stays)
select public.set_scrapbook_entry('milestone', :'ms', false);
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'ms') = 0, 'removed from the scrapbook');
select tests.expect((select count(*) from public.milestones where id = :'ms') = 1, '…but the milestone itself is kept');
select tests.expect((select count(*) from public.scrapbook_removed()) = 1, 'removed items can be found again');
select public.set_scrapbook_entry('milestone', :'ms', true, 'Our first long call');
select tests.expect((select i ->> 'caption' from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'ms') = 'Our first long call', 'restored, with a caption');
select tests.expect_error(format('select public.set_scrapbook_entry(''milestone'', %L, null, %L)', :'ms', repeat('x', 301)), '300');
select tests.expect_error(format('select public.set_scrapbook_entry(''checkin'', %L)', :'ms'), 'Unknown kind');
select tests.expect_error(format('insert into public.scrapbook_entries (relationship_id, kind, ref_id) values (%L, ''moment'', gen_random_uuid())', :'rel'), 'permission denied');
reset role;

-- A sealed (future) letter that someone "loves" can't appear: letters must have arrived.
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_letter(null, 'future', '', 'Sealed for later') as unarrived \gset
select public.send_letter(:'unarrived', now() + interval '20 days');
select tests.expect_error(format('select public.set_scrapbook_entry(''letter'', %L)', :'unarrived'), 'open to both');
reset role;

-- --------------------------------------------------- rituals: only after the reveal
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f101', 'g1@x'), ('00000000-0000-0000-0000-00000000f102', 'g2@x');
insert into public.relationships (name, status, created_by) values ('Scrapbook test', 'active', '00000000-0000-0000-0000-00000000f101') returning id as grel \gset
insert into public.relationship_members (relationship_id, user_id, role) values (:'grel', '00000000-0000-0000-0000-00000000f101', 'creator'), (:'grel', '00000000-0000-0000-0000-00000000f102', 'partner');
select public.assign_weekly_activity(:'grel', public.ritual_week_start(now())) as gweek \gset

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f101', false);
set role authenticated;
select public.save_ritual_draft(:'gweek', 'Mine');
select public.submit_ritual(:'gweek');
select tests.expect_error(format('select public.set_scrapbook_entry(''ritual'', %L)', :'gweek'), 'open to both');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f102', false);
set role authenticated;
select public.save_ritual_draft(:'gweek', 'Yours');
select public.submit_ritual(:'gweek');
select public.set_scrapbook_entry('ritual', :'gweek');
select tests.expect(public.scrapbook_saved('ritual', :'gweek'), 'revealed ritual saved');
select tests.expect((select jsonb_array_length(i -> 'parts') from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'gweek') = 2, 'both answers kept together');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.set_scrapbook_entry(''ritual'', %L)', :'gweek'), 'open to both');   -- another couple's week
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'gweek') = 0, 'other couples'' memories never appear');
reset role;

-- --------------------------------------------------- Apart: only once open to both
select set_config('request.jwt.claim.sub', :'F1', false);
set role authenticated;
select mission_id as solo from public.my_apart_missions() where my_entries > 0 and partner_entries > 0 limit 1 \gset
select public.set_scrapbook_entry('mission', :'solo');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'kind' = 'mission') = 1, 'open mission saved with its entries');
select public.start_apart_mission('{}', (select id from public.play_activities where code = 131)) as sealedm \gset
select public.add_apart_entry(:'sealedm', 'only mine so far');
select tests.expect_error(format('select public.set_scrapbook_entry(''mission'', %L)', :'sealedm'), 'open to both');
reset role;

-- --------------------------------------------------------- trips & moments
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_moment(null, 'Summer trip', 'Lund · Stockholm', '2026-06-20', '2026-07-18', 'Six weeks together') as trip \gset
select public.save_moment(null, 'Our 2025 trip', 'Kuching', '2025-08-02') as trip25 \gset
select tests.expect((select count(*) from public.moments) = 2, 'trips can be dated before using the app');
select tests.expect_error('select public.save_moment(null, '''', '''', current_date)', 'title');
select tests.expect_error('select public.save_moment(null, ''x'', '''', current_date + 10)', 'isn''t in the future');
select tests.expect_error('select public.save_moment(null, ''x'', '''', ''2026-06-20'', ''2026-06-01'')', 'after the start');
select tests.expect_error('select public.save_moment(null, ''x'', '''', ''2024-01-01'', ''2025-06-01'')', 'within a year');
insert into storage.objects (bucket_id, name) values ('moments', :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg');
select public.add_moment_photo(:'trip', :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg', '2026-06-21 18:30+02');
select public.add_moment_photo(:'trip', :'rel' || '/' || :'trip' || '/' || :'A' || '/2.jpg', '2099-01-01');
select tests.expect((select count(*) from public.moment_photos where taken_at is null) = 1, 'implausible camera dates are dropped');
select tests.expect_error(format('select public.add_moment_photo(%L, %L)', :'trip', :'rel' || '/' || :'trip' || '/' || :'B' || '/x.jpg'), 'can''t be attached');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''moments'', %L)', :'rel' || '/' || :'trip' || '/' || :'B' || '/x.jpg'), 'row-level security');
select tests.expect((select jsonb_array_length(i -> 'photos') from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'trip') = 2, 'trip shows its photos');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'moments') = 1, 'partner sees trip photos');
select public.save_moment(:'trip', 'Summer in Sweden', 'Lund · Stockholm', '2026-06-20', '2026-07-18', 'Six weeks together');
select tests.expect((select title from public.moments where id = :'trip') = 'Summer in Sweden', 'partner can edit the trip');
insert into storage.objects (bucket_id, name) values ('moments', :'rel' || '/' || :'trip' || '/' || :'B' || '/3.jpg');
select public.add_moment_photo(:'trip', :'rel' || '/' || :'trip' || '/' || :'B' || '/3.jpg');
delete from storage.objects where name = :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg';
select tests.expect((select count(*) from storage.objects where name = :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg') = 1, 'attached photos can''t be deleted directly');
select public.remove_moment_photo((select id from public.moment_photos where path like '%/1.jpg'));
delete from storage.objects where name = :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg';
select tests.expect((select count(*) from storage.objects where name = :'rel' || '/' || :'trip' || '/' || :'A' || '/1.jpg') = 0, 'once detached, either of you can delete it');
select tests.expect((select jsonb_array_length(i -> 'authors') from jsonb_array_elements(public.scrapbook_feed()) i where i ->> 'ref_id' = :'trip') = 2, 'trip shows both of you as authors');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.moments) = 0, 'other couples see no moments');
select tests.expect((select count(*) from storage.objects where bucket_id = 'moments') = 0, 'or their photos');
select tests.expect_error(format('select public.delete_moment(%L)', :'trip'), 'couldn''t find');
select tests.expect_error(format('select public.add_moment_photo(%L, %L)', :'trip', 'x/y/z/w.jpg'), 'couldn''t find');
select tests.expect_error(format('select public.scrapbook_item_ok(%L, ''moment'', %L)', :'rel', :'trip'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.delete_moment(:'trip25');
select tests.expect((select count(*) from public.moments) = 1, 'moment deleted');
reset role;

-- Check-ins never enter the scrapbook.
select tests.expect(not exists (select 1 from public.scrapbook_entries where kind not in ('ritual','mission','letter','discovery','milestone','moment')), 'check-ins stay out');

-- Export summary: counts per month, only for your own space.
select set_config('request.jwt.claim.sub', :'F2', false);
set role authenticated;
select tests.expect((select count(*) from public.export_activity_summary(current_date - 70, current_date)) between 3 and 4, 'one row per month');
select tests.expect((select sum(apart_missions) from public.export_activity_summary(current_date - 70, current_date)) >= 2, 'counts this couple''s missions');
select tests.expect((select count(*) from public.export_activity_summary(current_date, current_date - 5)) = 0, 'an empty range gives nothing');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.export_activity_summary(current_date - 70, current_date)) = 0, 'no space → no summary');
reset role;
