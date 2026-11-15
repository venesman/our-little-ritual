-- =====================================================================
-- Our Little Ritual — Music: a song on a letter + Our Soundtrack (15 Nov 2026)
--
-- Sharing is always on purpose: nothing is read from anyone's listening.
--   • A letter can carry one Spotify song (title, artist, album, cover) and a
--     short "why this song". A sealed letter keeps its song sealed too.
--   • Our Soundtrack (in Our Story): a musical diary — songs from opened
--     letters appear on their own; either of you can add a song with a note.
-- Song details come from Spotify's public page via the small `song-details`
-- function, which keeps a copy of the cover in the private `songs` folder, so
-- your phones don't contact Spotify while you browse. Tapping opens Spotify.
-- =====================================================================

-- A Spotify track link (open.spotify.com/…/track/<id>) or a spotify.link short link.
create or replace function public.is_song_url(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^https://(open\.spotify\.com/(intl-[a-zA-Z-]+/)?track/[A-Za-z0-9]{22}([?#][^\s]*)?|spotify\.link/[A-Za-z0-9]+)$';
$$;

alter table public.letters
  add column song_url        text check (song_url is null or (char_length(song_url) <= 300 and public.is_song_url(song_url))),
  add column song_title      text check (song_title is null or char_length(song_title) <= 200),
  add column song_artist     text check (song_artist is null or char_length(song_artist) <= 200),
  add column song_album      text check (song_album is null or char_length(song_album) <= 200),
  add column song_cover_path text check (song_cover_path is null or char_length(song_cover_path) <= 300),
  add column song_note       text check (song_note is null or char_length(song_note) <= 200);

-- Attach (or remove, with a null link) the song on one of your drafts.
create or replace function public.set_letter_song(p_id uuid, p_url text, p_title text default null, p_artist text default null,
  p_album text default null, p_cover_path text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.letters%rowtype;
  u text := nullif(trim(coalesce(p_url, '')), '');
  cov text := nullif(trim(coalesce(p_cover_path, '')), '');
begin
  select * into l from public.letters where id = p_id for update;
  if not found or l.sender_id <> auth.uid() then raise exception 'We couldn''t find that letter.' using errcode = 'P0001'; end if;
  if l.status <> 'draft' then raise exception 'That letter has been sent — it can''t be changed now.' using errcode = 'P0001'; end if;
  if u is not null and not public.is_song_url(u) then raise exception 'That doesn''t look like a Spotify song link.' using errcode = '22023'; end if;
  if cov is not null and cov !~ ('^' || l.relationship_id::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That cover can''t be used here.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'Please keep "why this song" under 200 characters.' using errcode = '22001'; end if;
  update public.letters set
    song_url = u,
    song_title = case when u is null then null else left(nullif(trim(coalesce(p_title, '')), ''), 200) end,
    song_artist = case when u is null then null else left(nullif(trim(coalesce(p_artist, '')), ''), 200) end,
    song_album = case when u is null then null else left(nullif(trim(coalesce(p_album, '')), ''), 200) end,
    song_cover_path = case when u is null then null else cov end,
    song_note = case when u is null then null else nullif(trim(coalesce(p_note, '')), '') end
   where id = l.id;
end;
$$;

-- ---------------------------------------------------------------- Our Soundtrack
create table public.soundtrack_entries (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  added_by         uuid not null references auth.users (id) on delete cascade,
  song_url         text not null check (char_length(song_url) <= 300 and public.is_song_url(song_url)),
  title            text not null check (char_length(title) between 1 and 200),
  artist           text not null default '' check (char_length(artist) <= 200),
  album            text not null default '' check (char_length(album) <= 200),
  cover_path       text check (cover_path is null or char_length(cover_path) <= 300),
  note             text not null default '' check (char_length(note) <= 300),
  shared_on        date not null default current_date,
  created_at       timestamptz not null default now()
);
create index soundtrack_rel_idx on public.soundtrack_entries (relationship_id, shared_on desc);
alter table public.soundtrack_entries enable row level security;
revoke all on public.soundtrack_entries from anon, authenticated;

create or replace function public.add_soundtrack_song(p_url text, p_title text, p_artist text default '', p_album text default '',
  p_cover_path text default null, p_note text default '', p_shared_on date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  u text := trim(coalesce(p_url, ''));
  t text := trim(coalesce(p_title, ''));
  cov text := nullif(trim(coalesce(p_cover_path, '')), '');
  nid uuid;
begin
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'Our Soundtrack opens once your partner has joined.' using errcode = 'P0001';
  end if;
  if not public.is_song_url(u) then raise exception 'That doesn''t look like a Spotify song link.' using errcode = '22023'; end if;
  if t = '' then raise exception 'Add the song''s title.' using errcode = '22023'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'Please keep the note under 300 characters.' using errcode = '22001'; end if;
  if p_shared_on is not null and (p_shared_on > current_date + 1 or p_shared_on < date '2000-01-01') then
    raise exception 'Pick a date that isn''t in the future.' using errcode = '22023';
  end if;
  if cov is not null and cov !~ ('^' || rel::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That cover can''t be used here.' using errcode = '22023';
  end if;
  if (select count(*) from public.soundtrack_entries where relationship_id = rel) >= 2000 then
    raise exception 'Your soundtrack is full — what a lot of music!' using errcode = 'P0001';
  end if;
  insert into public.soundtrack_entries (relationship_id, added_by, song_url, title, artist, album, cover_path, note, shared_on)
  values (rel, auth.uid(), u, left(t, 200), left(trim(coalesce(p_artist, '')), 200), left(trim(coalesce(p_album, '')), 200), cov,
          trim(coalesce(p_note, '')), coalesce(p_shared_on, current_date))
  returning id into nid;
  return nid;
end;
$$;

create or replace function public.update_soundtrack_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'Please keep the note under 300 characters.' using errcode = '22001'; end if;
  update public.soundtrack_entries set note = trim(coalesce(p_note, ''))
   where id = p_id and relationship_id = public.my_relationship_id() and added_by = auth.uid();
  if not found then raise exception 'Only the person who added a song can change its note.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.remove_soundtrack_song(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare cov text;
begin
  delete from public.soundtrack_entries where id = p_id and relationship_id = public.my_relationship_id() and added_by = auth.uid()
  returning cover_path into cov;
  if not found then raise exception 'Only the person who added a song can remove it.' using errcode = 'P0001'; end if;
  return cov;
end;
$$;

-- The diary: songs added on their own + songs from opened letters, newest first.
create or replace function public.soundtrack_feed()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select public.my_relationship_id() rel)
  select coalesce(jsonb_agg(x order by (x->>'on') desc, (x->>'at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.id, 'source', 'added', 'by', s.added_by, 'url', s.song_url, 'title', s.title, 'artist', s.artist,
             'album', s.album, 'cover_path', s.cover_path, 'note', s.note, 'on', s.shared_on, 'at', s.created_at) x
      from public.soundtrack_entries s, me where s.relationship_id = me.rel
    union all
    select jsonb_build_object('id', l.id, 'source', 'letter', 'by', l.sender_id, 'url', l.song_url, 'title', coalesce(l.song_title, 'A song'),
             'artist', coalesce(l.song_artist, ''), 'album', coalesce(l.song_album, ''), 'cover_path', l.song_cover_path,
             'note', coalesce(l.song_note, ''), 'on', (coalesce(l.reveal_at, l.sent_at))::date, 'at', coalesce(l.reveal_at, l.sent_at), 'letter_id', l.id)
      from public.letters l, me
     where l.relationship_id = me.rel and l.song_url is not null and public.letter_arrived(l) and l.opened_at is not null
  ) q;
$$;

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('songs', 'songs', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <relationship>/<who added it>/<file>. Yours, or one that's on a song you're both allowed to see.
create or replace function public.can_view_song_cover(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; usr uuid;
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  begin rel := parts[1]::uuid; usr := parts[2]::uuid; exception when others then return false; end;
  if not public.is_member(rel) then return false; end if;
  if usr = auth.uid() then return true; end if;
  return exists (select 1 from public.soundtrack_entries s where s.relationship_id = rel and s.cover_path = p_name)
      or exists (select 1 from public.letters l where l.relationship_id = rel and l.song_cover_path = p_name
                  and l.recipient_id = auth.uid() and public.letter_arrived(l));
end;
$$;
create policy "songs bucket: read yours or shared" on storage.objects
  for select to authenticated using (bucket_id = 'songs' and public.can_view_song_cover(name));
-- (covers are uploaded by the song-details function; nobody uploads directly)

revoke execute on function public.is_song_url(text), public.set_letter_song(uuid, text, text, text, text, text, text),
  public.add_soundtrack_song(text, text, text, text, text, text, date), public.update_soundtrack_note(uuid, text),
  public.remove_soundtrack_song(uuid), public.soundtrack_feed(), public.can_view_song_cover(text) from public, anon;
grant execute on function public.is_song_url(text), public.set_letter_song(uuid, text, text, text, text, text, text),
  public.add_soundtrack_song(text, text, text, text, text, text, date), public.update_soundtrack_note(uuid, text),
  public.remove_soundtrack_song(uuid), public.soundtrack_feed(), public.can_view_song_cover(text) to authenticated;
