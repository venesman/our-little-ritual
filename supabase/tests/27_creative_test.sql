-- Creative Corner.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.expect_error('select public.start_creation(''doodle'')', 'once your partner has joined');
reset role;

-- ------------------------------------------------------------ Doodle Relay
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.start_creation('doodle', 'Our dream house') as dd \gset
select tests.expect_error('select public.start_creation(''doodle'')', 'already have one');
select tests.expect_error(format('select public.add_creation_part(%L)', :'dd'), 'Draw something');
select tests.expect_error(format('select public.add_creation_part(%L, null, %L)', :'dd', :'rel' || '/' || :'dd' || '/' || :'B' || '/x.png'), 'can''t be added');
insert into storage.objects (bucket_id, name) values ('creations', :'rel' || '/' || :'dd' || '/' || :'A' || '/1.png');
select public.add_creation_part(:'dd', null, :'rel' || '/' || :'dd' || '/' || :'A' || '/1.png');
select tests.expect_error(format('select public.add_creation_part(%L, null, %L)', :'dd', :'rel' || '/' || :'dd' || '/' || :'A' || '/2.png'), 'partner''s turn');
select tests.expect_error(format('select public.finish_creation(%L)', :'dd'), 'a little more');
select tests.expect_error('select count(*) from public.creations', 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect(((public.for_you())->>'creative_your_turn')::int = 1, 'For you: B''s turn');
select tests.expect((select count(*) from storage.objects where bucket_id = 'creations') = 1, 'B sees the doodle so far');
reset role;
insert into storage.objects (bucket_id, name) values ('creations', :'rel' || '/' || :'dd' || '/' || :'B' || '/2.png');
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.add_creation_part(:'dd', null, :'rel' || '/' || :'dd' || '/' || :'B' || '/2.png');
select tests.expect(public.finish_creation(:'dd') = 'finished', 'either can say it''s finished');
select tests.expect_error(format('select public.add_creation_part(%L, null, %L)', :'dd', :'rel' || '/' || :'dd' || '/' || :'A' || '/3.png'), 'finished');
select public.set_scrapbook_entry('creation', :'dd');
select tests.expect((select count(*) from jsonb_array_elements(public.scrapbook_feed()) j where j->>'kind' = 'creation') = 1, 'kept in the scrapbook');
reset role;

-- ------------------------------------------------------------ Fold & Reveal
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.start_creation('fold', 'A monster') as fd \gset
reset role;
insert into storage.objects (bucket_id, name) values ('creations', :'rel' || '/' || :'fd' || '/' || :'A' || '/bottom.png'), ('creations', :'rel' || '/' || :'fd' || '/' || :'B' || '/top.png');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.add_creation_part(:'fd', null, :'rel' || '/' || :'fd' || '/' || :'A' || '/bottom.png');
select tests.expect_error(format('select public.add_creation_part(%L, null, %L)', :'fd', :'rel' || '/' || :'fd' || '/' || :'A' || '/bottom.png'), 'partner''s turn');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select p->>'hidden' = 'true' and p->'image_path' = 'null'::jsonb from jsonb_array_elements((public.creation_detail(:'fd'))->'parts') p), 'A''s half is sealed for B');
select tests.expect((select count(*) from storage.objects where bucket_id = 'creations' and name like '%' || :'fd' || '%') = 1, 'B can only open their own half''s file');
select public.add_creation_part(:'fd', null, :'rel' || '/' || :'fd' || '/' || :'B' || '/top.png');
select tests.expect((public.creation_detail(:'fd'))->>'status' = 'finished', 'revealed when both halves are in');
select tests.expect((select count(*) from storage.objects where bucket_id = 'creations' and name like '%' || :'fd' || '%') = 2, 'both halves visible now');
reset role;

-- ------------------------------------------------------------ Story Chain
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.start_creation('story', 'The parcel had no return address') as st \gset
select tests.expect_error(format('select public.add_creation_part(%L, %L)', :'st', repeat('x', 601)), '600');
select public.add_creation_part(:'st', 'It was wrapped in old maps.');
reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated; select public.add_creation_part(:'st', 'Inside, a key.'); reset role;
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated; select public.add_creation_part(:'st', 'And a ticket to Kuching.'); reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated; select public.add_creation_part(:'st', 'Dated tomorrow.');
select tests.expect(public.finish_creation(:'st') = 'asked', 'The End? asks the other');
select tests.expect(public.finish_creation(:'st') = 'asked', 'asking twice still waits');
reset role;
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select tests.expect(public.finish_creation(:'st') = 'finished', 'both agree → The End');
reset role;

-- ------------------------------------------------------------ Poem Duet (acrostic)
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select tests.expect_error('select public.start_creation(''poem'', '''', ''{"acrostic":"HI"}'')', '4–12 letters');
select public.start_creation('poem', 'Missing you', '{"acrostic":"Home"}') as pm \gset
select tests.expect(((public.creation_detail(:'pm'))->>'limit')::int = 4, 'acrostic sets the length');
select tests.expect_error(format('select public.add_creation_part(%L, ''Oh, the sea'')', :'pm'), 'start with "H"');
select public.add_creation_part(:'pm', 'Here, the rain is warm');
reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated; select public.add_creation_part(:'pm', 'Over here, the snow'); reset role;
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated; select public.add_creation_part(:'pm', 'Maybe one day'); reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated; select public.add_creation_part(:'pm', 'Even the clocks agree');
select tests.expect((public.creation_detail(:'pm'))->>'status' = 'finished', 'poem finishes on its last line');
reset role;

-- ------------------------------------------------------------ Mixtape
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select tests.expect_error('select public.start_creation(''mixtape'')', 'theme');
select public.start_creation('mixtape', 'Songs for our first road trip') as mx \gset
select tests.expect_error(format('select public.add_creation_part(%L, null, null, null, ''https://example.com'')', :'mx'), 'Spotify');
select public.add_creation_part(:'mx', null, null, 'Windows down', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'Waterloo', 'ABBA');
reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated;
select public.add_creation_part(:'mx', null, null, 'For the long stretch', 'https://open.spotify.com/track/1v7L65Lzy0j0vdpRjJewt1', 'Dancing Queen', 'ABBA');
select tests.expect_error(format('select public.finish_creation(%L)', :'mx'), 'name');
select tests.expect(public.finish_creation(:'mx', 'Kuching to Santiago') = 'finished', 'named and finished');
select tests.expect((public.creation_detail(:'mx')) #>> '{settings,name}' = 'Kuching to Santiago', 'name kept');
reset role;

-- ------------------------------------------------------------ Mood board
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select public.start_creation('board', 'Our future home') as bd \gset
select public.start_creation('board', 'Our next trip');
reset role;
insert into storage.objects (bucket_id, name) values ('creations', :'rel' || '/' || :'bd' || '/' || :'A' || '/p1.jpg'), ('creations', :'rel' || '/' || :'bd' || '/' || :'B' || '/p2.jpg');
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select public.add_creation_part(:'bd', null, :'rel' || '/' || :'bd' || '/' || :'A' || '/p1.jpg', 'Big windows') as bp1 \gset
reset role;
select set_config('request.jwt.claim.sub', :'B', false); set role authenticated;
select public.add_creation_part(:'bd', null, :'rel' || '/' || :'bd' || '/' || :'B' || '/p2.jpg', 'A reading nook');
select tests.expect_error(format('select public.remove_board_photo(%L)', :'bp1'), 'Only the person');
select tests.expect_error(format('select public.finish_creation(%L)', :'bd'), 'doesn''t need finishing');
reset role;
select set_config('request.jwt.claim.sub', :'A', false); set role authenticated;
select public.remove_board_photo(:'bp1');
select tests.expect(jsonb_array_length((public.creation_detail(:'bd'))->'parts') = 1, 'photo removed');
select tests.expect(jsonb_array_length(public.creations_list()) >= 6, 'everything listed');
reset role;

select set_config('request.jwt.claim.sub', :'D', false); set role authenticated;
select tests.expect(public.creations_list() = '[]'::jsonb, 'another couple sees nothing');
select tests.expect_error(format('select public.creation_detail(%L)', :'bd'), 'couldn''t find');
select tests.expect((select count(*) from storage.objects where bucket_id = 'creations') = 0, 'or their files');
reset role;
