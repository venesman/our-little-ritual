-- Phase 4: visits, nudges, free hours.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- ------------------------------------------------------------- visits
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_visit(null, 'Santiago', current_date + 23, current_date + 37, 'Bring the good coffee') as v1 \gset
select tests.expect((select place from public.visits where id = :'v1') = 'Santiago', 'member adds a visit');
select tests.expect_error(format('select public.save_visit(null, %L, %L, %L)', 'Kuching', current_date + 10, current_date + 5), 'can''t be before');
select tests.expect_error(format('select public.save_visit(null, %L, %L)', '', current_date + 10), 'Where are you meeting');
select tests.expect_error(format('select public.save_visit(null, %L, %L)', 'Mars', current_date + 5000), 'ten years');
select tests.expect_error(format('insert into public.visits (relationship_id, created_by, place, starts_on) values (gen_random_uuid(), %L, %L, current_date)', :'A', 'x'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.visits) = 1, 'partner sees the visit');
select public.save_visit(:'v1', 'Santiago 🇨🇱', current_date + 23, current_date + 40, 'Bring the good coffee');
select tests.expect((select ends_on from public.visits where id = :'v1') = current_date + 40, 'partner can edit it');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.visits) = 0, 'outsider sees no visits');
select tests.expect_error(format('select public.delete_visit(%L)', :'v1'), 'couldn''t find');
select tests.expect_error(format('select public.save_visit(%L, %L, %L)', :'v1', 'hijack', current_date + 3), 'not part of a space');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);   -- Dave has his own (pending) space
set role authenticated;
select tests.expect_error(format('select public.save_visit(%L, %L, %L)', :'v1', 'hijack', current_date + 3), 'couldn''t find');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.delete_visit(:'v1');
select tests.expect((select count(*) from public.visits) = 0, 'member can remove a visit');
reset role;

-- ------------------------------------------------------------- nudges
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.send_nudge();
select tests.expect_error('select public.send_nudge()', 'Give it a minute');
select tests.expect_error(format('insert into public.nudges (relationship_id, sender_id) select relationship_id, %L from public.relationship_members limit 1', :'A'), 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.nudges where sender_id = :'A') = 1, 'partner sees the nudge');
select public.send_nudge();
reset role;

-- Daily cap: pretend Bob already sent 30 today (spaced out), then try again.
update public.nudges set created_at = now() - interval '2 minutes' where sender_id = :'B';
insert into public.nudges (relationship_id, sender_id, created_at)
select relationship_id, :'B', now() - make_interval(mins => 3 + g) from public.nudges, generate_series(1, 29) g where sender_id = :'B' limit 29;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect_error('select public.send_nudge()', 'Try again tomorrow');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect((select count(*) from public.nudges) = 0, 'outsider sees no nudges');
select tests.expect_error('select public.send_nudge()', 'once your partner has joined');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect_error('select public.send_nudge()', 'once your partner has joined');
reset role;

-- --------------------------------------------------------- free hours
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
update public.profiles set free_from = '20:00', free_to = '23:30' where id = :'A';
update public.profiles set free_from = '01:00', free_to = '02:00' where id = :'B';   -- RLS: no effect
select tests.expect_error(format('update public.profiles set free_from = %L, free_to = null where id = %L', '20:00', :'A'), 'profiles_free_window');
reset role;
select tests.expect((select free_from from public.profiles where id = :'A') = '20:00', 'can set own free hours');
select tests.expect((select free_from is null from public.profiles where id = :'B'), 'cannot set partner''s free hours');
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select free_to from public.profiles where id = :'A') = '23:30', 'partner can read your free hours');
reset role;

\echo 'quick wins tests: all passed'
