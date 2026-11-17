-- A Little Whim.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

-- --------------------------------------------------------------- access
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.save_whim(null, ''little_want'', ''Book'')', 'once your partner has joined');
reset role;

-- ------------------------------------------------------- create + checks
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect_error('select public.save_whim(null, ''little_want'', ''  '')', 'name first');
select tests.expect_error('select public.save_whim(null, ''gift'', ''x'')', 'Unknown kind');
select tests.expect_error('select public.save_whim(null, ''little_want'', ''x'', ''http://shop.example'')', 'https://');
select tests.expect_error('select public.save_whim(null, ''little_want'', ''x'', null, 20)', 'RM, SEK, CLP, USD or EUR');
select tests.expect_error('select public.save_whim(null, ''little_want'', ''x'', null, 20, ''GBP'')', 'RM, SEK, CLP, USD or EUR');
select tests.expect_error('select public.save_whim(null, ''little_want'', ''x'', null, null, null, '''', ''a/b/c/d.jpg'')', 'Save the whim first');
select public.save_whim(null, 'little_want', 'Rattan bag', 'https://shop.example/bag', 89.90, 'RM', 'Saw it at the market!') as w1 \gset
select tests.expect((select j->>'status' = 'new' and j->>'price' = '89.90' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w1'), 'new Little Want waits for an answer');
select tests.expect_error('select count(*) from public.whims', 'permission denied');
select tests.expect_error(format('select public.set_whim_status(%L, ''yes'')', :'w1'), 'for your partner to answer');
select tests.expect_error(format('select public.save_whim(%L, ''shared_wish'', ''x'')', :'w1'), 'can''t change kind');
-- photo in the whim's own folder
insert into storage.objects (bucket_id, name) values ('whims', :'rel' || '/' || :'w1' || '/' || :'A' || '/bag.jpg');
select public.save_whim(:'w1', 'little_want', 'Rattan bag', 'https://shop.example/bag', 89.90, 'RM', 'Saw it at the market!', :'rel' || '/' || :'w1' || '/' || :'A' || '/bag.jpg');
select tests.expect_error(format('select public.save_whim(%L, ''little_want'', ''x'', null, null, null, '''', %L)', :'w1', :'rel' || '/' || :'w1' || '/' || :'B' || '/x.jpg'), 'can''t be attached');
reset role;

-- --------------------------------------------- B answers: the surprise path
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'whims') = 1, 'partner can see the photo');
select tests.expect_error(format('insert into storage.objects (bucket_id, name) values (''whims'', %L)', :'rel' || '/' || :'w1' || '/' || :'B' || '/y.jpg'), 'row-level security');
select tests.expect_error(format('select public.save_whim(%L, ''little_want'', ''changed'')', :'w1'), 'couldn''t find');
select tests.expect_error(format('select public.delete_whim(%L)', :'w1'), 'Only the person');
select tests.expect_error(format('select public.set_whim_status(%L, ''plan'')', :'w1'), 'Unknown answer');
select public.set_whim_status(:'w1', 'surprise', 'Already know which colour');
select tests.expect((select j->>'status' = 'surprise' and j->>'response_note' like 'Already%' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w1'), 'giver sees their surprise plan');
select public.set_whim_status(:'w1', 'bought');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select j->>'status' = 'in_the_works' and j->>'response_note' = '' and j->>'status_by' is null and (j->>'surprise')::boolean = false
                       from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w1'), 'asker sees only "in the works" — not bought, no note');
select tests.expect_error(format('select public.save_whim(%L, ''little_want'', ''sneaky edit'')', :'w1'), 'in motion');
select tests.expect_error(format('select public.delete_whim(%L)', :'w1'), 'part of your story');
select tests.expect_error(format('select public.archive_whim(%L)', :'w1'), 'couldn''t find');
select tests.expect_error(format('select public.reveal_whim(%L)', :'w1'), 'no surprise of yours');
select tests.expect_error(format('select public.set_scrapbook_entry(''whim'', %L)', :'w1'), 'open to both');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.reveal_whim(:'w1');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select j->>'status' = 'bought' and j->>'response_note' like 'Already%' and j->>'revealed_at' is not null
                       from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w1'), 'revealed: now Bought! for both');
select public.set_scrapbook_entry('whim', :'w1');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) j where j->>'kind' = 'whim' and j->>'title' = 'Rattan bag') = 1, 'kept in the scrapbook');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect_error(format('select public.set_whim_status(%L, ''not_now'')', :'w1'), 'already bought');
reset role;

-- ------------------------------------------------------------ Shared Wish
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.save_whim(null, 'shared_wish', 'Northern lights trip', null, 15000, 'SEK') as w2 \gset
select tests.expect((select j->>'status' = 'plan' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w2'), 'Shared Wish starts at Let''s plan it');
select tests.expect_error(format('select public.set_whim_status(%L, ''surprise'')', :'w2'), 'Unknown status');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(((public.for_you())->>'whim_from_partner_at') is not null, 'For you knows about the new whim');
select public.set_whim_status(:'w2', 'saving');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.set_whim_status(:'w2', 'done', 'Tromsø, at last');
select tests.expect((select j->>'status' = 'done' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w2'), 'either of you can move a Shared Wish along');
select public.archive_whim(:'w2');
select public.archive_whim(:'w2', false);
-- a plain whim can be deleted by its owner
select public.save_whim(null, 'little_want', 'Socks') as w3 \gset
select public.delete_whim(:'w3');
select tests.expect((select count(*) from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w3') = 0, 'deleted');
reset role;

-- --------------------------------------------------------- other couples
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(public.my_whims() = '[]'::jsonb, 'another couple sees no whims');
select tests.expect((select count(*) from storage.objects where bucket_id = 'whims') = 0, 'or their photos');
select tests.expect_error(format('select public.set_whim_status(%L, ''yes'')', :'w2'), 'couldn''t find');
select tests.expect_error(format('select public.archive_whim(%L)', :'w2'), 'couldn''t find');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.expect_error('select public.my_whims()', 'permission denied');
reset role;
