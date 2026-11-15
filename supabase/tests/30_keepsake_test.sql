-- Yearly keepsake: summary, sealed notes, privacy.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

select public.save_time_together('{"place":"Hotel","city":"Berlin","country":"Germany","starts_on":"2023-04-10","ends_on":"2023-04-17","stay_type":"holiday","travel":"both"}'::jsonb);
select public.save_moment(null, 'Berlin together', 'Berlin', date '2023-04-12', date '2023-04-20');
select tests.expect((public.keepsake(2023) ->> 'days_together')::int = 11, 'overlapping trip and visit counted once');
select tests.expect(public.keepsake(2023) -> 'countries' ? 'Germany', 'countries listed');
select tests.expect(2023 = any(public.keepsake_years()), 'year offered');
select tests.expect_error('select public.keepsake(2999)', 'hasn''t happened');

-- notes stay sealed until you've written yours
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.keepsake_write_note(2023, 'Berlin in spring, with you.');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((public.keepsake(2023) ->> 'partner_wrote')::boolean and public.keepsake(2023) -> 'note_partner' = 'null'::jsonb, 'partner note sealed until I write');
select public.keepsake_write_note(2023, 'Our first year of real visits.');
select tests.expect(public.keepsake(2023) ->> 'note_partner' = 'Berlin in spring, with you.', 'revealed once I write');
select public.keepsake_write_note(2023, 'Edited.');
select tests.expect(public.keepsake(2023) ->> 'note_mine' = 'Edited.', 'notes can be edited');
select tests.expect_error($$select public.keepsake_write_note(2023, '   ')$$, 'few words');
select tests.expect_error('select * from public.keepsake_notes', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((public.keepsake(2023) ->> 'days_together')::int = 0 and public.keepsake(2023) -> 'note_partner' = 'null'::jsonb, 'another couple sees nothing of ours');
reset role;
set role anon;
select tests.expect_error('select public.keepsake(2023)', 'permission denied');
reset role;
