-- Music: songs on letters + Our Soundtrack.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
select relationship_id as rel from public.relationship_members where user_id = :'A' and status = 'active' \gset

select tests.expect(public.is_song_url('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc') and public.is_song_url('https://open.spotify.com/intl-sv/track/4uLU6hMCjMI75M1A2tKUQC')
                    and public.is_song_url('https://spotify.link/AbC123') and not public.is_song_url('https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC')
                    and not public.is_song_url('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC'), 'only Spotify song links');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_letter(null, 'love', 'Our song', 'This one made me think of you') as l1 \gset
select tests.expect_error(format('select public.set_letter_song(%L, ''https://example.com/x'')', :'l1'), 'Spotify song link');
select tests.expect_error(format('select public.set_letter_song(%L, ''https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'', ''T'', null, null, %L)', :'l1', :'rel' || '/' || :'B' || '/c.jpg'), 'cover can''t be used');
select public.set_letter_song(:'l1', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'Waterloo', 'ABBA', 'Waterloo', :'rel' || '/' || :'A' || '/c.jpg', 'Because of Lund');
select tests.expect((select song_title = 'Waterloo' and song_note = 'Because of Lund' from public.letters where id = :'l1'), 'song attached to the draft');
select public.send_letter(:'l1', now() + interval '2 days');
select tests.expect_error(format('select public.set_letter_song(%L, null)', :'l1'), 'can''t be changed');
reset role;
insert into storage.objects (bucket_id, name) values ('songs', :'rel' || '/' || :'A' || '/c.jpg');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'songs') = 0, 'sealed letter: its cover stays hidden');
select tests.expect(jsonb_array_length(public.soundtrack_feed()) = 0, 'sealed letter: song not in the soundtrack yet');
reset role;
update public.letters set reveal_at = now() - interval '1 minute' where id = :'l1';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from storage.objects where bucket_id = 'songs') = 1, 'arrived: cover visible');
select tests.expect(jsonb_array_length(public.soundtrack_feed()) = 0, 'not in the soundtrack until opened');
select public.open_letter(:'l1');
select tests.expect((select j->>'title' = 'Waterloo' and j->>'source' = 'letter' from jsonb_array_elements(public.soundtrack_feed()) j), 'opened: song joins Our Soundtrack');
select tests.expect_error('select public.add_soundtrack_song(''https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'', '''')', 'title');
select tests.expect_error(format('select public.add_soundtrack_song(''https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'', ''x'', '''', '''', null, '''', %L)', current_date + 10), 'isn''t in the future');
select public.add_soundtrack_song('https://open.spotify.com/track/1v7L65Lzy0j0vdpRjJewt1', 'Dancing Queen', 'ABBA', 'Arrival', null, 'On repeat today', current_date - 3) as s1 \gset
select tests.expect(jsonb_array_length(public.soundtrack_feed()) = 2, 'B added a song on its own');
select tests.expect_error('select count(*) from public.soundtrack_entries', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(jsonb_array_length(public.soundtrack_feed()) = 2, 'A sees both songs');
select tests.expect_error(format('select public.remove_soundtrack_song(%L)', :'s1'), 'Only the person');
select tests.expect_error(format('select public.update_soundtrack_note(%L, ''hi'')', :'s1'), 'Only the person');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.update_soundtrack_note(:'s1', 'Still on repeat');
select public.remove_soundtrack_song(:'s1');
select tests.expect(jsonb_array_length(public.soundtrack_feed()) = 1, 'removed');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect(public.soundtrack_feed() = '[]'::jsonb, 'another couple sees no songs');
select tests.expect((select count(*) from storage.objects where bucket_id = 'songs') = 0, 'or covers');
reset role;
