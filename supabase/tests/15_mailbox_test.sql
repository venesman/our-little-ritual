-- Our Mailbox + voice notes.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
\set F1 '00000000-0000-0000-0000-00000000f001'
\set F2 '00000000-0000-0000-0000-00000000f002'

select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

-- ---------------------------------------------------------------- access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.save_letter(null, ''note'', '''', ''hi'')', 'once your partner has joined');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error('select public.save_letter(null, ''note'', '''', ''hi'')', 'once your partner has joined');
reset role;

-- ----------------------------------------------------------- draft → send
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_letter(null, 'love', 'For you', 'The moment I knew…') as l1 \gset
select tests.expect((select status = 'draft' and recipient_id = :'B'::uuid from public.letters where id = :'l1'), 'draft addressed to the partner');
select tests.expect_error('select public.save_letter(null, ''love'', '''', '''', ''x/y/z/a.jpg'')', 'Save the letter first');
select tests.expect_error(format('select public.save_letter(%L, ''love'', '''', ''x'', %L)', :'l1', :'rel' || '/' || :'l1' || '/' || :'B' || '/a.jpg'), 'can''t be attached');
select tests.expect_error(format('select public.save_letter(%L, ''poem'')', :'l1'), 'Unknown kind');
select tests.expect_error(format('select public.save_letter(%L, ''love'', '''', '''', null, %L, 200)', :'l1', :'rel' || '/' || :'l1' || '/' || :'A' || '/v.webm'), 'two minutes');
-- photo + voice in the draft's own folder
insert into storage.objects (bucket_id, name) values ('letters', :'rel' || '/' || :'l1' || '/' || :'A' || '/p.jpg'), ('letters', :'rel' || '/' || :'l1' || '/' || :'A' || '/v.webm');
select public.save_letter(:'l1', 'love', 'For you', 'The moment I knew…', :'rel' || '/' || :'l1' || '/' || :'A' || '/p.jpg', :'rel' || '/' || :'l1' || '/' || :'A' || '/v.webm', 42);
select tests.expect((select voice_seconds = 42 and image_path like '%/p.jpg' from public.letters where id = :'l1'), 'photo and voice note attached');
select tests.expect_error(format('insert into public.letters (relationship_id, sender_id, recipient_id) values (%L, %L, %L)', :'rel', :'A', :'B'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.letters) = 0, 'partner can''t see a draft');
select tests.expect((select count(*) from storage.objects where bucket_id = 'letters') = 0, 'or its files');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''letters'', %L)', :'rel' || '/' || :'l1' || '/' || :'B' || '/x.jpg'), 'row-level security');
select tests.expect_error(format('select public.send_letter(%L)', :'l1'), 'couldn''t find');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_letter(null, 'note', '', '') as empty \gset
select tests.expect_error(format('select public.send_letter(%L)', :'empty'), 'before sending');
select public.save_letter(null, 'future', '', 'By the time you read this…') as fut \gset
select tests.expect_error(format('select public.send_letter(%L)', :'fut'), 'when your future letter should open');
select tests.expect_error(format('select public.send_letter(%L, now() - interval ''1 day'')', :'fut'), 'in the future');
select tests.expect_error(format('select public.send_letter(%L, now() + interval ''6 years'')', :'fut'), 'within five years');
select public.send_letter(:'l1');
select tests.expect_error(format('select public.save_letter(%L, ''love'', ''changed'')', :'l1'), 'can''t be changed');
select tests.expect_error(format('select public.delete_letter_draft(%L)', :'l1'), 'own drafts');
select public.send_letter(:'fut', now() + interval '30 days');
select tests.expect_error(format('select public.open_letter(%L)', :'l1'), 'hasn''t arrived');   -- sender can't "open" for the recipient
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.letters) = 1, 'partner sees the arrived letter only');
select tests.expect((select body from public.letters where id = :'l1') = 'The moment I knew…', 'and can read it');
select tests.expect((select count(*) from storage.objects where bucket_id = 'letters') = 2, 'photo and voice note open with the letter');
select tests.expect((select count(*) from public.my_sealed_letters()) = 1, 'sealed envelope listed');
select tests.expect((select kind = 'future' from public.my_sealed_letters()), 'envelope shows its kind and date only');
select tests.expect((select count(*) from public.letters where id = :'fut') = 0, 'sealed letter content not readable');
select tests.expect_error(format('select public.open_letter(%L)', :'fut'), 'hasn''t arrived');
select tests.expect(((public.mailbox_summary()) ->> 'unread')::int = 1 and ((public.mailbox_summary()) ->> 'sealed')::int = 1, 'summary: 1 unread, 1 sealed');
select public.open_letter(:'l1');
select tests.expect((select opened_at is not null from public.letters where id = :'l1'), 'opened');
select tests.expect(public.toggle_letter_loved(:'l1'), 'partner loves the letter');
select tests.expect_error(format('select public.toggle_letter_loved(%L)', :'fut'), 'couldn''t find');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select opened_at is not null and loved from public.letters where id = :'l1'), 'sender sees it was opened and loved');
select tests.expect_error(format('select public.take_back_letter(%L)', :'l1'), 'already been opened');
select public.take_back_letter(:'fut');
select tests.expect((select status = 'draft' and reveal_at is null from public.letters where id = :'fut'), 'unopened letter taken back to drafts');
select public.delete_letter_draft(:'empty');
delete from storage.objects where name = :'rel' || '/' || :'l1' || '/' || :'A' || '/p.jpg';
reset role;
select tests.expect((select count(*) from storage.objects where name = :'rel' || '/' || :'l1' || '/' || :'A' || '/p.jpg') = 1, 'files on a sent letter can''t be deleted');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.my_sealed_letters()) = 0, 'taken-back letter disappears for the partner');
reset role;

-- A scheduled letter opens on its date.
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.send_letter(:'fut', now() + interval '2 minutes');
reset role;
update public.letters set reveal_at = now() - interval '1 second' where id = :'fut';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.letters where id = :'fut') = 1, 'scheduled letter readable once its date passes');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.letters) = 0, 'other couples see no letters');
select tests.expect((select count(*) from storage.objects where bucket_id = 'letters') = 0, 'or their files');
select tests.expect_error(format('select public.toggle_letter_loved(%L)', :'l1'), 'couldn''t find');
select tests.expect_error('select public.letter_arrived(null::public.letters)', 'permission denied');
reset role;

-- ------------------------------------------------- voice: Weekly Ritual #23
insert into auth.users (id, email) values (:'F1', 'f1@x'), (:'F2', 'f2@x');
insert into public.relationships (name, status, created_by) values ('Voice test', 'active', :'F1') returning id as frel \gset
insert into public.relationship_members (relationship_id, user_id, role) values (:'frel', :'F1', 'creator'), (:'frel', :'F2', 'partner');
select public.assign_weekly_activity(:'frel', public.ritual_week_start(now())) is not null as ok \gset
select id as fweek from public.weekly_activities where relationship_id = :'frel' \gset
update public.weekly_activities set activity_id = (select id from public.activities where code = 23) where id = :'fweek';
select tests.expect((select allow_voice from public.activities where code = 23) and (select count(*) from public.activities where allow_voice) = 1, 'only Sound of My Day takes voice');

select set_config('request.jwt.claim.sub', :'F1', false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('ritual-media', :'frel' || '/' || :'fweek' || '/' || :'F1' || '/street.webm');
select tests.expect_error(format('select public.set_ritual_voice(%L, %L, 20)', :'fweek', :'frel' || '/' || :'fweek' || '/' || :'F2' || '/x.webm'), 'can''t be attached');
select public.set_ritual_voice(:'fweek', :'frel' || '/' || :'fweek' || '/' || :'F1' || '/street.webm', 20);
select public.submit_ritual(:'fweek');
select tests.expect((select status = 'submitted' from public.activity_submissions where user_id = :'F1'), 'a voice-only answer can be shared');
select tests.expect_error(format('select public.set_ritual_voice(%L, null)', :'fweek'), 'sealed');
reset role;
select set_config('request.jwt.claim.sub', :'F2', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'ritual-media' and name like :'frel' || '%') = 0, 'partner can''t hear it before the reveal');
select public.save_ritual_draft(:'fweek', 'Rain on the roof');
select public.submit_ritual(:'fweek');
select tests.expect((select count(*) from storage.objects where name = :'frel' || '/' || :'fweek' || '/' || :'F1' || '/street.webm') = 1, 'partner hears it after the reveal');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error(format('select public.set_ritual_voice(%L, null)', :'fweek'), 'couldn''t find');
reset role;

-- ---------------------------------------------------- voice: Apart missions
select id as bedtime from public.play_activities where code = 136 \gset
select id as photo_hunt from public.play_activities where code = 131 \gset
select tests.expect((select count(*) from public.play_activities where allow_voice) = 2, 'two Apart missions take voice');
select set_config('request.jwt.claim.sub', :'F1', false);
set role authenticated;
select public.start_apart_mission('{}', :'bedtime') as m1 \gset
select public.start_apart_mission('{}', :'photo_hunt') as m2 \gset
insert into storage.objects (bucket_id, name) values ('apart-media', :'frel' || '/' || :'m1' || '/' || :'F1' || '/story.m4a');
select public.add_apart_entry(:'m1', '', null, null, :'frel' || '/' || :'m1' || '/' || :'F1' || '/story.m4a', 95);
select tests.expect((select count(*) from public.apart_entries where mission_id = :'m1' and voice_path is not null and body = '') = 1, 'voice-only Apart entry');
select tests.expect_error(format('select public.add_apart_entry(%L, '''', null, null, %L, 10)', :'m2', :'frel' || '/' || :'m2' || '/' || :'F1' || '/x.m4a'), 'aren''t part of this mission');
select tests.expect_error(format('select public.add_apart_entry(%L, '''', null, null, %L, 300)', :'m1', :'frel' || '/' || :'m1' || '/' || :'F1' || '/y.m4a'), 'two minutes');
delete from storage.objects where name = :'frel' || '/' || :'m1' || '/' || :'F1' || '/story.m4a';
select tests.expect((select count(*) from storage.objects where name = :'frel' || '/' || :'m1' || '/' || :'F1' || '/story.m4a') = 1, 'attached voice note can''t be deleted');
reset role;
select set_config('request.jwt.claim.sub', :'F2', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'apart-media' and name like :'frel' || '%') = 0, 'solo mission: partner can''t hear it yet');
select public.add_apart_entry(:'m1', 'Mine: a tale about a sleepy lighthouse');
select tests.expect((select count(*) from storage.objects where name = :'frel' || '/' || :'m1' || '/' || :'F1' || '/story.m4a') = 1, 'after both share, partner hears it');
reset role;
